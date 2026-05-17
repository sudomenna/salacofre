"use client";

/**
 * components/atoms/maps/SwingArrowMap.tsx
 *
 * RF-038 (Should) — Setas de swing por município.
 *
 * Implementação simplificada: MapLibre como basemap, setas renderizadas
 * como layer "symbol" (rotação por ângulo) + fill coloring via feature-state.
 *
 * Quando `arrows` está vazio (payload sem dados de swing), exibe apenas o
 * basemap coroplético neutro — "sem dados de swing disponíveis" via overlay texto.
 *
 * ADR-0003: PMTiles. ADR-0004: MapLibre GL. ADR-0010: ssr: false via caller.
 * Constituição § 2: cores via CSS token, nunca hex oficial.
 */

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { useEffect, useRef } from "react";

import { UF_BBOX } from "@/components/atoms/maps/_shared";
import { useHoverStore } from "@/lib/state/hover-store";

const PMTILES_BASE = "https://jbtu251tioj3y57z.public.blob.vercel-storage.com";

export interface SwingArrow {
  cod_ibge: string;
  /** Centro geográfico [lon, lat]. */
  centro: [number, number];
  /** Magnitude do swing em pp (sempre positiva). */
  magnitudePp: number;
  /** Direção: +1 = pró-líder atual; -1 = oposto. */
  direction: 1 | -1;
}

export interface SwingArrowMapProps {
  ufSigla: string;
  arrows: SwingArrow[];
  height?: number;
}

let protocolRegisteredSwing = false;

/**
 * Constrói GeoJSON de pontos para as setas de swing.
 * `bearing`: direção da seta (0° = norte, 90° = leste).
 * +1 (pró-A, PT-like) = seta apontando "para cima" (norte).
 * -1 (pró-B, PL-like) = seta apontando "para baixo" (sul).
 */
function buildArrowsGeoJSON(arrows: SwingArrow[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: arrows
      .filter((a) => a.centro[0] !== 0 || a.centro[1] !== 0)
      .map((a) => ({
        type: "Feature",
        id: a.cod_ibge,
        geometry: { type: "Point", coordinates: a.centro },
        properties: {
          cod_ibge: a.cod_ibge,
          magnitude: a.magnitudePp,
          direction: a.direction,
          // bearing: Norte (sobe) para +1, Sul (desce) para -1
          bearing: a.direction === 1 ? 0 : 180,
          // Cor: pró-líder = vermelho (PT token), contra = azul (PL token)
          color: a.direction === 1 ? "var(--color-pt)" : "var(--color-pl)",
        },
      })),
  };
}

export function SwingArrowMap({ ufSigla, arrows, height = 360 }: SwingArrowMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const arrowsRef = useRef(arrows);

  useEffect(() => {
    arrowsRef.current = arrows;
  }, [arrows]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!protocolRegisteredSwing) {
      const protocol = new Protocol();
      maplibregl.addProtocol("pmtiles", protocol.tile);
      protocolRegisteredSwing = true;
    }

    const bbox = UF_BBOX[ufSigla] ?? [-73.99, -33.75, -28.84, 5.27];
    const arrowsGeo = buildArrowsGeoJSON(arrowsRef.current);

    // A11y RNF-026: respeita prefers-reduced-motion (constituição § 4).
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const colorTransition = prefersReducedMotion
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
          },
          arrows: {
            type: "geojson",
            data: arrowsGeo,
          },
        },
        layers: [
          // Basemap neutro
          {
            id: "muni-fill",
            type: "fill",
            source: "municipios",
            "source-layer": "municipios",
            paint: {
              "fill-color": "#f0f0f0",
              "fill-opacity": 1,
            },
          },
          {
            id: "muni-stroke",
            type: "line",
            source: "municipios",
            "source-layer": "municipios",
            paint: {
              "line-color": "#d9d9d9",
              "line-width": 0.5,
            },
          },
          // Setas: círculo colorido por direção + tamanho por magnitude
          {
            id: "arrows-circle",
            type: "circle",
            source: "arrows",
            paint: {
              "circle-color": ["get", "color"],
              "circle-color-transition": colorTransition,
              "circle-opacity": 0.75,
              "circle-radius": ["interpolate", ["linear"], ["get", "magnitude"], 0, 3, 30, 20],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1,
            },
          },
        ],
      },
      bounds: bbox,
      fitBoundsOptions: { padding: 16 },
      attributionControl: false,
      dragRotate: false,
      touchPitch: false,
    });

    mapRef.current = map;

    map.on("mousemove", "arrows-circle", (e) => {
      const codIbge = e.features?.[0]?.properties?.cod_ibge as string | undefined;
      if (codIbge) {
        useHoverStore.getState().setHovered({ type: "municipio", codIbge }, "map");
      }
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", "arrows-circle", () => {
      useHoverStore.getState().clear();
      map.getCanvas().style.cursor = "";
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ufSigla]);

  // Update arrows when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.loaded()) return;
    const src = map.getSource("arrows") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(buildArrowsGeoJSON(arrows));
  }, [arrows]);

  const hasData = arrows.length > 0;

  return (
    <div style={{ position: "relative", width: "100%", height }}>
      <div
        ref={containerRef}
        role="img"
        aria-label={`Mapa de swing vs 2022 por município — ${ufSigla}`}
        style={{ width: "100%", height }}
      />
      {!hasData && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            fontSize: 13,
            color: "var(--color-text-muted)",
          }}
        >
          Dados de swing disponíveis após primeira apuração
        </div>
      )}
    </div>
  );
}
