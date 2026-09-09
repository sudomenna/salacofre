"use client";

/**
 * components/atoms/maps/ChoroplethMapUF.tsx
 *
 * RF-034 + RF-036 — Mapa coroplético do estado em granularidade de município.
 *   - mode='leader'   → cor do líder por município (RF-034).
 *   - mode='estimate' → cor da estimativa do que falta (RF-036).
 *
 * Implementação MapLibre GL + PMTiles (municipios.pmtiles ~10MB).
 * Coloração via setFeatureState (zero re-fetch).
 * Hover coordenado via hover-store (producer). Consumer: tabela de municípios (spec 008).
 *
 * ADR-0003: PMTiles (range requests), não GeoJSON.
 * ADR-0004: MapLibre GL, não Mapbox.
 * ADR-0010: Carregado via next/dynamic({ ssr: false }) por UfMapsLazy.
 * Constituição § 2: cores via CSS token (getComputedStyle), nunca hex oficial.
 */

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { useEffect, useRef } from "react";

import { resolveCssColor, UF_BBOX } from "@/components/atoms/maps/_shared";
import { useHoverStore } from "@/lib/state/hover-store";

const PMTILES_BASE = "https://jbtu251tioj3y57z.public.blob.vercel-storage.com";

export interface ChoroplethMunicipio {
  cod_ibge: string;
  /** Cor do polígono (token CSS ou hex resolvido pelo caller). */
  cor: string;
  /** % apurado no município (0–100). */
  pctApurado: number;
}

export interface ChoroplethMapUFProps {
  ufSigla: string;
  municipios: ChoroplethMunicipio[];
  mode: "leader" | "estimate";
  /**
   * `number` (px) nas páginas de UF (hero fixo, ADR-0029 § 1). `"100%"` na
   * moldura persistente (`PersistentMapFrame`, ADR-0033 § 1), que preenche a
   * coluna do mapa inteira — mesmo padrão que `NationalChoroplethMap.height`
   * já aceita para o variant `frame`.
   */
  height?: number | string;
}

/** Throttle helper — evita flood de eventos mousemove */
function throttle<T extends (...args: Parameters<T>) => void>(fn: T, ms: number): T {
  let last = 0;
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - last < ms) return;
    last = now;
    fn(...args);
  }) as T;
}

let protocolRegisteredMuni = false;

export function ChoroplethMapUF({ ufSigla, municipios, mode, height = 360 }: ChoroplethMapUFProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const municipiosRef = useRef(municipios);

  useEffect(() => {
    municipiosRef.current = municipios;
  }, [municipios]);

  // Hover consumer: reage ao hover externo (tabela → mapa)
  const hoveredIbge = useHoverStore((s) =>
    s.hovered?.type === "municipio" ? s.hovered.codIbge : null,
  );

  // Map init — runs on ufSigla or mode change. municipios colors handled by separate effect.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mapa é ilha React; municipios gerido por efeito separado
  useEffect(() => {
    if (!containerRef.current) return;

    if (!protocolRegisteredMuni) {
      const protocol = new Protocol();
      maplibregl.addProtocol("pmtiles", protocol.tile);
      protocolRegisteredMuni = true;
    }

    const bbox = UF_BBOX[ufSigla] ?? [-73.99, -33.75, -28.84, 5.27];

    // A11y RNF-026: respeita prefers-reduced-motion. Anula transição de
    // fill-color que anima trocas leader↔estimate.
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fillTransition = prefersReducedMotion
      ? { duration: 0, delay: 0 }
      : { duration: 600, delay: 0 };

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          municipios: {
            type: "vector",
            url: `pmtiles://${PMTILES_BASE}/municipios.pmtiles`,
            // `promoteId` é obrigatório para o `setFeatureState` abaixo
            // funcionar. Os tiles carregam o código IBGE na PROPRIEDADE
            // `CD_MUN` (é por ela que o hover filtra, mais abaixo), mas não
            // têm `id` de feature — e `setFeatureState({ id })` casa pelo id,
            // não por propriedade. Sem esta linha toda chamada de
            // `setFeatureState` é silenciosamente descartada, o
            // `["feature-state", "color"]` nunca resolve, e o `coalesce` pinta
            // o estado inteiro com o cinza de fallback. Medido em 2026-09-09
            // em `/uf/SP`: 269 municípios com dado, nenhum pintado.
            promoteId: "CD_MUN",
          },
        },
        layers: [
          {
            id: "municipios-fill",
            type: "fill",
            source: "municipios",
            "source-layer": "municipios",
            // Filtra municipios da UF por SIGLA_UF se disponível; caso contrário exibe todos
            // (o viewport já enquadra a UF via bounds)
            paint: {
              "fill-color": ["coalesce", ["feature-state", "color"], "#d9d9d9"],
              "fill-color-transition": fillTransition,
              "fill-opacity": 0.88,
            },
          },
          {
            id: "municipios-stroke",
            type: "line",
            source: "municipios",
            "source-layer": "municipios",
            paint: {
              "line-color": "#ffffff",
              "line-width": 0.5,
            },
          },
          {
            id: "municipios-stroke-hover",
            type: "line",
            source: "municipios",
            "source-layer": "municipios",
            paint: {
              "line-color": "#222222",
              "line-width": 2.5,
            },
            filter: ["==", "CD_MUN", ""],
          },
        ],
      },
      bounds: bbox,
      fitBoundsOptions: { padding: 16 },
      attributionControl: false,
      dragRotate: false,
      touchPitch: false,
      scrollZoom: false,
    });

    mapRef.current = map;

    // A11y (RNF-025 / docs/mapas/acessibilidade.md): MapLibre atribui
    // `aria-label="Map"` fixo ao `<canvas>` interno, e o canvas nasce
    // focável (`tabindex="0"`) — um leitor de tela chega a ele com um rótulo
    // genérico que ignora o `aria-label` real do container (`label`,
    // abaixo). O container já é `role="img"` com o rótulo correto; o canvas
    // não deve competir com ele por atenção do leitor de tela. `aria-hidden`
    // remove o canvas da árvore de acessibilidade — a alternativa textual
    // (lista paralela / tabela de municípios, spec 004) é o caminho de
    // teclado e leitor de tela, não o canvas em si.
    const canvas = map.getCanvas();
    canvas.setAttribute("aria-hidden", "true");
    canvas.removeAttribute("aria-label");
    canvas.tabIndex = -1;

    map.on("load", () => {
      // Aplica cores iniciais. `resolveCssColor` é obrigatório: `m.cor` chega
      // como token (`var(--color-cand-1)`) e o MapLibre não lê variável CSS —
      // sem resolver, todo município cai no cinza do `coalesce` acima.
      for (const m of municipiosRef.current) {
        map.setFeatureState(
          { source: "municipios", sourceLayer: "municipios", id: m.cod_ibge },
          { color: resolveCssColor(m.cor) },
        );
      }
    });

    // Hover producer
    const onMouseMove = throttle(
      (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const codIbge = feature.properties?.CD_MUN as string | undefined;
        if (!codIbge) return;

        useHoverStore.getState().setHovered({ type: "municipio", codIbge }, "map");
        map.setFilter("municipios-stroke-hover", ["==", "CD_MUN", codIbge]);
        map.getCanvas().style.cursor = "pointer";
      },
      16,
    );

    map.on("mousemove", "municipios-fill", onMouseMove);

    map.on("mouseleave", "municipios-fill", () => {
      useHoverStore.getState().clear();
      map.setFilter("municipios-stroke-hover", ["==", "CD_MUN", ""]);
      map.getCanvas().style.cursor = "";
    });

    // Mobile: tap-to-select
    map.on("click", "municipios-fill", (e) => {
      const feature = e.features?.[0];
      const codIbge = feature?.properties?.CD_MUN as string | undefined;
      if (codIbge) {
        useHoverStore.getState().setHovered({ type: "municipio", codIbge }, "map");
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ufSigla, mode]);

  // Update colors when municipios prop changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.loaded()) return;
    for (const m of municipios) {
      map.setFeatureState(
        { source: "municipios", sourceLayer: "municipios", id: m.cod_ibge },
        { color: resolveCssColor(m.cor) },
      );
    }
  }, [municipios]);

  // Hover consumer: highlight feature when external source hovers
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.loaded()) return;
    map.setFilter("municipios-stroke-hover", ["==", "CD_MUN", hoveredIbge ?? ""]);
  }, [hoveredIbge]);

  const label =
    mode === "estimate"
      ? `Mapa de estimativa por município — ${ufSigla}`
      : `Mapa de líder por município — ${ufSigla}`;

  return <div ref={containerRef} role="img" aria-label={label} style={{ width: "100%", height }} />;
}
