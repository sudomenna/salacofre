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
import { useEffect, useRef } from "react";

import {
  registerPmtilesProtocolOnce,
  resetPmtilesProtocol,
} from "@/components/atoms/maps/_pmtiles-protocol";
import { resolveCssColor, UF_BBOX, ufCodigoIbge } from "@/components/atoms/maps/_shared";
import { useMunicipioSheetStore } from "@/components/shared/municipio-sheet-store";
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

/** Ver `STYLE_LOAD_TIMEOUT_MS` em `_NationalChoroplethMapImpl.tsx` — mesma causa raiz (pmtiles@4.4.1). */
const STYLE_LOAD_TIMEOUT_MS = 10_000;

/**
 * Expression MapLibre equivalente a `Math.floor(f.id / 100000) === level` do
 * protótipo (`MapView.jsx:29`) — recorta só os municípios da UF `sigla`
 * (Bloco 2, 2026-09-09). `CD_MUN` é propriedade (não feature id, ver
 * `promoteId` no mount), daí o `["get", ...]`; `["to-number", ...]` porque
 * o tile pode entregar a propriedade como string.
 *
 * Composta sempre via `["all", ufFloorFilter(...), outraCondição]` — por
 * isso `outraCondição` também precisa estar em sintaxe de expression
 * (`["==", ["get", "CD_MUN"], v]`), nunca a sintaxe legada de 2 argumentos
 * (`["==", "CD_MUN", v]`). Medido em 2026-09-09: misturar as duas dentro do
 * mesmo `all` faz o validador do MapLibre tratar o `all` inteiro como filtro
 * legado e rejeitar a expression aninhada (`layers[2].filter[1][1]: string
 * expected, array found`) — o estilo nunca termina de carregar (mesmo
 * sintoma do bug de cache do pmtiles, mas causa totalmente diferente).
 */
function ufFloorFilter(sigla: string): maplibregl.ExpressionSpecification {
  const ufCodigo = ufCodigoIbge(sigla) ?? -1;
  return ["==", ["floor", ["/", ["to-number", ["get", "CD_MUN"]], 100000]], ufCodigo];
}

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
    const container = containerRef.current;

    registerPmtilesProtocolOnce();

    const bbox = UF_BBOX[ufSigla] ?? [-73.99, -33.75, -28.84, 5.27];

    // Bloco 2 (2026-09-09): recorta só os municípios da UF aberta, não os
    // 5.570 do Brasil inteiro (antes só a câmera enquadrava a UF; os
    // vizinhos ficavam desenhados em volta). Sigla não reconhecida (nunca
    // deveria acontecer, `ufSigla` vem de rota validada) cai em `-1` via
    // `ufFloorFilter` — filtro não casa nada, mesma postura defensiva do
    // fallback de bbox acima.
    const ufFilter = ufFloorFilter(ufSigla);

    // A11y RNF-026: respeita prefers-reduced-motion. Anula transição de
    // fill-color que anima trocas leader↔estimate.
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fillTransition = prefersReducedMotion
      ? { duration: 0, delay: 0 }
      : { duration: 600, delay: 0 };

    let hangTimer: number | undefined;
    let attempt = 0;
    let cancelled = false;

    // Self-heal — mesma causa raiz do mapa nacional (ver
    // `_pmtiles-protocol.ts` e `_NationalChoroplethMapImpl.tsx`): uma
    // Promise de header/diretório do pmtiles que falhe ou nunca assente
    // fica cacheada pra sempre no `Protocol` (singleton de sessão de aba).
    function mount(): maplibregl.Map {
      attempt += 1;
      const map = new maplibregl.Map({
        container,
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
              // Só os municípios da UF aberta (Bloco 2, ver `ufFilter` acima).
              filter: ufFilter,
              paint: {
                "fill-color": ["coalesce", ["feature-state", "color"], "#d9d9d9"],
                "fill-color-transition": fillTransition,
                "fill-opacity": 0.88,
              },
            },
            // RNF-035 (SC 1.4.11) — HALO, duas linhas, como o mapa nacional.
            //
            // Até 18/09 (3ª sessão) este mapa tinha UMA linha, `#ffffff`
            // **cravada no código** — não token. Medido nas 54 cores que ESTE
            // mapa realmente pinta (as 33 bases de partido + `--color-tossup`
            // + os 7 `--color-cand-*` + os 7 `--color-cand-band-*` de fallback
            // por rank — ele NÃO usa a escala de margem `-1..5`, que é do mapa
            // nacional; a cor vem de `municipios[].cor`, a cor-base do líder):
            //
            //   contra o `#ffffff` cravado ..... 14 reprovam 3:1 no claro,
            //                                    17 no escuro
            //   contra as DUAS linhas do halo ... 0 e 0
            //
            // Piores do claro: `--party-none` 1,28 · as seis faixas
            // `--color-cand-band-*` 1,43 a 1,63 · `--party-tie` 1,90. No escuro
            // é pior e por outro motivo: as cores de partido são mais CLARAS lá
            // (`--party-psol` #ffd47d mede 1,40 contra branco), e um traço
            // branco cravado num tema escuro é a única coisa da tela que não
            // sabe que o tema mudou.
            //
            // 🔴 Por isso o remédio é TOKEN, não outra cor cravada: no claro
            // `--map-stroke` é #fbfbfc e `--map-stroke-focus` é #14171b; no
            // escuro os dois **trocam de lado** (#14171b e #eceef1). É o mesmo
            // par do nacional (`ufs-stroke-halo` + `ufs-stroke`), e sempre uma
            // das duas alcança o piso.
            //
            // ⚠️ As espessuras NÃO são as do nacional (1,4 + 0,6). Município é
            // polígono pequeno e denso — 5.570 contra 27, e 645 só em SP — e o
            // traço do nacional deixaria o mapa sujo. Aqui é 0,9 + 0,35: mesma
            // proporção num traço mais fino, com o total perto do 0,5 anterior.
            {
              id: "municipios-stroke-halo",
              type: "line",
              source: "municipios",
              "source-layer": "municipios",
              filter: ufFilter,
              paint: {
                "line-color": resolveCssColor("var(--map-stroke, #fbfbfc)"),
                "line-width": 0.9,
              },
            },
            {
              id: "municipios-stroke",
              type: "line",
              source: "municipios",
              "source-layer": "municipios",
              filter: ufFilter,
              paint: {
                "line-color": resolveCssColor("var(--map-stroke-focus, #14171b)"),
                "line-width": 0.35,
              },
            },
            {
              id: "municipios-stroke-hover",
              type: "line",
              source: "municipios",
              "source-layer": "municipios",
              paint: {
                "line-color": resolveCssColor("var(--map-stroke-focus, #14171b)"),
                "line-width": 2.5,
              },
              // `["all", ufFilter, ...]` — o hover (abaixo) substitui esse
              // filtro inteiro via `setFilter`; sem re-incluir `ufFilter` a
              // cada chamada, o realce voltaria a poder casar um município
              // de fora da UF.
              filter: ["all", ufFilter, ["==", ["get", "CD_MUN"], ""]],
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

      hangTimer = window.setTimeout(() => {
        if (cancelled || map.isStyleLoaded()) return;
        if (attempt >= 2) {
          console.error(
            "[ChoroplethMapUF] estilo pmtiles não carregou após retry — ver components/atoms/maps/_pmtiles-protocol.ts",
          );
          return;
        }
        console.warn(
          "[ChoroplethMapUF] estilo não carregou em " +
            `${STYLE_LOAD_TIMEOUT_MS}ms — reinicializando protocolo pmtiles (retry ${attempt})`,
        );
        resetPmtilesProtocol();
        map.remove();
        mount();
      }, STYLE_LOAD_TIMEOUT_MS);

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
        window.clearTimeout(hangTimer);
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
          map.setFilter("municipios-stroke-hover", [
            "all",
            ufFilter,
            ["==", ["get", "CD_MUN"], codIbge],
          ]);
          map.getCanvas().style.cursor = "pointer";
        },
        16,
      );

      map.on("mousemove", "municipios-fill", onMouseMove);

      map.on("mouseleave", "municipios-fill", () => {
        useHoverStore.getState().clear();
        map.setFilter("municipios-stroke-hover", ["all", ufFilter, ["==", ["get", "CD_MUN"], ""]]);
        map.getCanvas().style.cursor = "";
      });

      // Clique no município: realça (era o único efeito até 2026-09-10, e é o
      // que serve o tap-to-select do mobile, onde não há `mousemove`) E abre a
      // folha do município — o `MunSheet` do protótipo, aberto a partir do
      // mapa (`ui_kits/atlas-menna/App.jsx:311`).
      //
      // A folha em si é a que já existe, desenhada pelo `<MunicipioExplorer>`
      // da página de UF; aqui só se escreve o `cod_ibge` no store compartilhado
      // (`components/shared/municipio-sheet-store.ts`), que é o que atravessa
      // as duas colunas do `<AppShellSplit>`. Nenhuma segunda folha é criada.
      //
      // `getState()` e não o hook: este handler é registrado uma vez dentro do
      // `mount()` e sobrevive a re-renders — um `select` capturado por closure
      // envelheceria junto com ela.
      map.on("click", "municipios-fill", (e) => {
        const feature = e.features?.[0];
        const codIbge = feature?.properties?.CD_MUN as string | undefined;
        if (codIbge) {
          useHoverStore.getState().setHovered({ type: "municipio", codIbge }, "map");
          useMunicipioSheetStore.getState().select(codIbge);
        }
      });

      return map;
    }

    mount();

    // `mapRef.current` (não a variável local do 1º `mount()`) porque um
    // retry do self-heal troca a instância viva sem que este cleanup saiba —
    // ver mesmo comentário em `_NationalChoroplethMapImpl.tsx`.
    return () => {
      cancelled = true;
      window.clearTimeout(hangTimer);
      mapRef.current?.remove();
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

  // Hover consumer: highlight feature when external source hovers.
  // Recalcula `ufFilter` aqui (não reusa o da montagem, closure separada) —
  // precisa do mesmo `["all", ufFilter, ...]` do producer (linhas acima)
  // pra não destacar um município fora da UF aberta (Bloco 2).
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.loaded()) return;
    map.setFilter("municipios-stroke-hover", [
      "all",
      ufFloorFilter(ufSigla),
      ["==", ["get", "CD_MUN"], hoveredIbge ?? ""],
    ]);
  }, [hoveredIbge, ufSigla]);

  const label =
    mode === "estimate"
      ? `Mapa de estimativa por município — ${ufSigla}`
      : `Mapa de líder por município — ${ufSigla}`;

  return <div ref={containerRef} role="img" aria-label={label} style={{ width: "100%", height }} />;
}
