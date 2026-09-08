"use client";

/**
 * components/blocks/_NationalChoroplethMapImpl.tsx
 *
 * Implementação MapLibre GL + PMTiles do mapa hero Brasil.
 * Carregada APENAS via next/dynamic({ ssr: false }) por NationalChoroplethMap.tsx.
 * NUNCA importe diretamente — use o wrapper público.
 *
 * RF-030.1 (mapa hero), RF-030.2 (4 views via setFeatureState), RF-030.3
 * (hover tooltip + click → /uf/[sigla]), RF-030.4 (hachura flip — Skip).
 *
 * ADR-0003: PMTiles (ufs.pmtiles ~462KB).
 * ADR-0004: MapLibre GL.
 * Constituição § 2: cores via getComputedStyle(CSS tokens), nunca hex oficial.
 *
 * S07/Bloco 1 (ADR-0025, design system Atlas Menna):
 *   - Cor por partido (ADR-0024) via `resolvePartyHex`/`colorForParty` quando
 *     `EdgeCandidate.partido` do líder é conhecido; fallback pro mecanismo
 *     de rank pré-existente (`cand-color.ts`, ADR-0013 superseded) quando
 *     não é — nunca uma UF sem cor.
 *   - Traço em `--map-stroke`/`--map-stroke-focus`, "sem apuração" em
 *     `--map-uncounted` (no lugar dos hex literais `#ffffff`/`#222222` e do
 *     `--color-tossup` emprestado do fallback binário S04).
 *   - `<HoverCard>` no lugar do tooltip inline; hover também emite pro
 *     `useHoverStore` (producer, `type: "uf"`) — a store já suportava essa
 *     entidade (ver `lib/state/hover-store.ts`) mas nada aqui a alimentava
 *     ainda; nenhum consumidor existe hoje (grep confirmado), então isto é
 *     aditivo/forward-compat, não uma migração de contrato quebrado.
 */

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useRouter } from "next/navigation";
import { Protocol } from "pmtiles";
import { useEffect, useMemo, useRef, useState } from "react";

import type { MapView } from "@/components/atoms/controls/MapViewToggle";
import { HoverCard, type HoverCardRow } from "@/components/atoms/overlays/HoverCard";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";
import { useHoverStore } from "@/lib/state/hover-store";
import { colorForRank, resolveBandHex, resolveCandHex } from "@/lib/utils/cand-color";
import {
  colorForParty,
  intensityLevelForMargin,
  normalizePartySlug,
  PARTY_FALLBACK_SLUG,
  resolvePartyHex,
} from "@/lib/utils/party-color";

const PMTILES_BASE = "https://jbtu251tioj3y57z.public.blob.vercel-storage.com";

export interface NationalChoroplethMapImplProps {
  rows: EdgeUfRow[];
  candidatoAId: number | null;
  view: MapView;
  /**
   * Mapping `candidato_id → rank nacional` (S05/F3B). Permite ao mapa
   * pintar UFs N-way em vez de binário (PT/PL): UF com líder rank 1 usa
   * `--color-cand-1`, rank 3 usa `--color-cand-3` (âmbar), etc. Rank > 6
   * cai em `--color-cand-other` (cinza). Construído na page a partir do
   * `national.candidatos[]` (1 lookup O(1) por UF).
   *
   * S07/Bloco 1: vira o fallback (ver `candidatos` abaixo) quando o
   * `partido` do líder é desconhecido.
   */
  rankByLider?: Record<number, number>;
  /**
   * Lista nacional de candidatos (S07/Bloco 1 — ADR-0024). Dirige a cor por
   * partido e o nome exibido no `<HoverCard>`. Ver docstring completa em
   * `NationalChoroplethMap.tsx`.
   */
  candidatos?: EdgeCandidate[];
  height?: number;
}

interface TooltipState {
  x: number;
  y: number;
  /** Vira o cartão pra esquerda quando o ponteiro está na metade direita do mapa. */
  flip: boolean;
  sigla: string;
  row: EdgeUfRow;
}

/** Lê token CSS do :root em runtime (seguro só no cliente). */
function getCssVar(name: string): string {
  if (typeof window === "undefined") return "#e1e4e8";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Throttle helper — evita flood de eventos mousemove (mesmo padrão de ChoroplethMapUF.tsx). */
function throttle<T extends (...args: Parameters<T>) => void>(fn: T, ms: number): T {
  let last = 0;
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - last < ms) return;
    last = now;
    fn(...args);
  }) as T;
}

/**
 * `partido` tem token próprio (ADR-0024)? `normalizePartySlug` já cai em
 * `PARTY_FALLBACK_SLUG` ("outros") pra sigla ausente, desconhecida ou de
 * federação — aqui tratamos "outros" como "não mapeado" de propósito: o
 * objetivo desta função é decidir entre cor-por-partido e o fallback de
 * rank, não pintar tudo que não é PT/PL de cinza-partido.
 */
function partidoIsMapped(partido: string | null | undefined): partido is string {
  if (!partido) return false;
  return normalizePartySlug(partido) !== PARTY_FALLBACK_SLUG;
}

/**
 * Fallback pré-ADR-0024 (rank, `cand-color.ts`) para a view "margin" — usado
 * quando o `partido` do líder é desconhecido. `margin` decide intensidade:
 * alta → cor sólida (cand-N), média → versão band (cand-band-N), baixa →
 * tossup neutro.
 */
function marginToRankColor(margin: number, rank: number): string {
  const abs = Math.abs(margin);
  if (abs < 2) return getCssVar("--color-tossup");
  return abs >= 15 ? resolveCandHex(rank) : resolveBandHex(rank);
}

/**
 * Fallback pré-ADR-0024 (rank) para a view "turnout" — paleta neutra/única
 * dimensão: o "líder" da UF pinta com sua cor sólida (top apurado) ou band
 * (baixo apurado). Não tem cor partidária natural — semântica é "quanto já
 * apurou". Mantemos o uso do rank pra dar continuidade visual entre views.
 */
function turnoutToRankColor(pct: number, rank: number): string {
  if (pct === 0) return getCssVar("--color-tossup");
  if (pct >= 80) return resolveCandHex(rank);
  return resolveBandHex(rank);
}

/**
 * Swing (view "swing") — é um delta vs 2022; não tem cor partidária natural
 * (swing > 0 = "movimento em favor do líder atual", swing < 0 = "fuga").
 * Usamos paleta neutra: âmbar/ocre pro positivo, cinza-azulado pro negativo.
 * Para manter o código simples e neutro, mapeamos para os tokens band
 * neutros (band-likely / band-lean) — sem cor partidária ou por-rank.
 * **Sem mudança no Bloco 1**: a cor por partido (ADR-0024) modula
 * identidade × margem projetada; swing é um eixo ortogonal (delta) que não
 * tem dono partidário, então continua na paleta neutra pré-existente.
 */
function swingToColor(swing: number): string {
  const abs = Math.abs(swing);
  if (abs < 2) return getCssVar("--color-tossup");
  if (swing > 0)
    return abs >= 10 ? getCssVar("--color-band-very_likely") : getCssVar("--color-band-likely");
  return abs >= 10 ? getCssVar("--color-band-very_likely") : getCssVar("--color-band-lean");
}

function rankFor(id: number, rankByLider: Record<number, number> | undefined): number {
  // Fallback: sem rankByLider → rank 99 (→ cor "other" cinza). Pré-S05 e
  // testes legados usam isso.
  return rankByLider?.[id] ?? 99;
}

/**
 * Resolve a cor de uma UF por view. S07/Bloco 1 (ADR-0024): quando o
 * `partido` do líder tem token próprio (`partidoIsMapped`), a identidade
 * vem do partido (`resolvePartyHex`) nas views "quem lidera"
 * (winner/margin/turnout) — nunca deixa a UF sem cor: sem `partido`
 * mapeado, cai no mecanismo de rank pré-existente (`cand-color.ts`).
 */
function resolveColor(
  row: EdgeUfRow,
  view: MapView,
  rankByLider: Record<number, number> | undefined,
  candidatosById: Map<number, EdgeCandidate>,
): string {
  const rank = rankFor(row.lider, rankByLider);
  const partido = candidatosById.get(row.lider)?.partido;
  const useParty = partidoIsMapped(partido);
  switch (view) {
    case "winner":
      // Identidade pura (sem gradiente de margem) — `resolvePartyHex` sem
      // `nivel` resolve `--party-<slug>`, que por construção do gerador
      // (scripts/gen-party-scale.ts) é o mesmo hex do nível 4.
      return useParty ? resolvePartyHex(partido) : resolveCandHex(rank);
    case "margin":
      return useParty
        ? resolvePartyHex(partido, intensityLevelForMargin(row.margem_projetada))
        : marginToRankColor(row.margem_projetada, rank);
    case "swing":
      // `swing_vs_2022` aceita null desde S07/Fase 2 (UF/candidato sem
      // número em 2022). Sem comparação, a UF fica na cor neutra do meio da
      // rampa — que é exatamente `swingToColor(0)`.
      return swingToColor(row.swing_vs_2022 ?? 0);
    case "turnout":
      if (row.pct_apurado === 0) return getCssVar("--color-tossup");
      return useParty
        ? resolvePartyHex(partido, row.pct_apurado >= 80 ? 5 : 2)
        : turnoutToRankColor(row.pct_apurado, rank);
  }
}

/**
 * Aplica cores via expression `["match", ["get", "SIGLA_UF"], ...]` em vez de
 * `setFeatureState`. Razão: tippecanoe gera IDs numéricos sequenciais por
 * default — `setFeatureState({ id: "SP" })` não casa com feature id numérico
 * (e nosso PMTiles foi gerado assim). Match por property `SIGLA_UF` é robusto
 * independente do feature id. Custo: rebuild de expression a cada mudança de
 * view (27 entries — trivial).
 *
 * Fallback da expression (UF sem row, ou payload vazio antes do 1º load) usa
 * `--map-uncounted` (S07/Bloco 1) — era `--color-tossup` (semântica errada:
 * "empate técnico" não é o mesmo que "sem apuração/sem dado").
 */
function applyColors(
  map: maplibregl.Map,
  rows: EdgeUfRow[],
  view: MapView,
  rankByLider: Record<number, number> | undefined,
  candidatosById: Map<number, EdgeCandidate>,
) {
  if (rows.length === 0) return;
  const fallback = getCssVar("--map-uncounted") || "#e1e4e8";
  // ["match", ["get", "SIGLA_UF"], "SP", "#...", "RJ", "#...", ..., fallback]
  const expression: (string | number | unknown[])[] = ["match", ["get", "SIGLA_UF"]];
  for (const row of rows) {
    expression.push(row.sigla, resolveColor(row, view, rankByLider, candidatosById));
  }
  expression.push(fallback);
  map.setPaintProperty("ufs-fill", "fill-color", expression as unknown as string);
}

/**
 * Linhas do `<HoverCard>` — um candidato do top-3 por UF (`EdgeUfRow.top_candidatos`).
 *
 * `proj` é real: `top_candidatos[].pct` é literalmente `pct_projetado` por
 * candidato (ver docstring do campo em `lib/edge-config/types.ts`). `pct`
 * (Parcial) **não existe** por candidato neste payload — só agregado em
 * `row.pct_apurado`, que é da UF inteira, não de um candidato específico, e
 * `row.margem_atual` só dá a distância líder↔2º (não o share de cada um,
 * que em corrida N-way não soma 100 entre os dois primeiros). Preencher
 * `pct` com o valor projetado ou com uma fração inventada de `margem_atual`
 * mostraria número errado sob o cabeçalho "Parcial" — pior que não mostrar
 * nada. `Number.NaN` é honesto: `formatPercent` (usado por `HoverCard.fmt`)
 * trata `NaN` como "—", igual ao resto do produto pra dado ausente.
 */
function buildHoverRows(
  row: EdgeUfRow,
  candidatosById: Map<number, EdgeCandidate>,
  rankByLider: Record<number, number> | undefined,
): HoverCardRow[] {
  return row.top_candidatos.map((tc) => {
    const cand = candidatosById.get(tc.id);
    const partido = cand?.partido;
    const rank = rankFor(tc.id, rankByLider);
    return {
      name: cand?.nome ?? `#${tc.id}`,
      color: partidoIsMapped(partido) ? colorForParty(partido) : colorForRank(rank),
      pct: Number.NaN,
      proj: tc.pct,
    };
  });
}

let protocolRegistered = false;

export function NationalChoroplethMapImpl({
  rows,
  candidatoAId,
  view,
  rankByLider,
  candidatos,
  height = 420,
}: NationalChoroplethMapImplProps) {
  // Backward-compat: caller pré-S05 só passa `candidatoAId`; sintetizamos um
  // rankByLider mínimo `{ [candidatoAId]: 1 }` pra manter o líder em
  // `--color-cand-1` (= --color-pt, mesmo hex). Líderes "diferentes" caem
  // em rank 99 → cor "other" (cinza). É degradação cuidadosa: melhor que
  // tudo cinza, ainda destaca o líder global.
  const effectiveRankByLider: Record<number, number> | undefined =
    rankByLider ?? (candidatoAId != null ? { [candidatoAId]: 1 } : undefined);
  // `id → EdgeCandidate` (nome + partido) — S07/Bloco 1. Memoizado: usado no
  // render (HoverCard) e nos efeitos abaixo; reconstruir só quando a lista
  // nacional de candidatos muda (não a cada mousemove).
  const candidatosById = useMemo(
    () => new Map((candidatos ?? []).map((c) => [c.id, c])),
    [candidatos],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const router = useRouter();

  // Keep rows lookup fresh for tooltip without remounting map
  const rowsMapRef = useRef<Map<string, EdgeUfRow>>(new Map());
  useEffect(() => {
    rowsMapRef.current = new Map(rows.map((r) => [r.sigla, r]));
  }, [rows]);

  // Map init — runs once on mount. O efeito de re-color (rows/view/rankByLider)
  // mora abaixo e usa refs pro handler de `map.on("load")`, garantindo que o
  // mapa é "ilha React" e não remonta a cada mudança de prop.
  useEffect(() => {
    if (!containerRef.current) return;

    if (!protocolRegistered) {
      const protocol = new Protocol();
      maplibregl.addProtocol("pmtiles", protocol.tile);
      protocolRegistered = true;
    }

    // A11y RNF-026: respeita prefers-reduced-motion (constituição § 4).
    // Anula a transição de fill-color que anima trocas de view (winner→margin etc).
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
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          ufs: {
            type: "vector",
            url: `pmtiles://${PMTILES_BASE}/ufs.pmtiles`,
          },
        },
        layers: [
          {
            id: "ufs-fill",
            type: "fill",
            source: "ufs",
            "source-layer": "ufs",
            paint: {
              // Cor inicial "sem apuração" (S07/Bloco 1: era --color-tossup,
              // semântica errada pro estado "ainda sem dado"); applyColors
              // substitui via setPaintProperty com expression
              // `["match", ["get", "SIGLA_UF"], ...]` assim que `rows` chega.
              "fill-color": getCssVar("--map-uncounted") || "#e1e4e8",
              "fill-color-transition": fillTransition,
              "fill-opacity": 0.88,
            },
          },
          {
            id: "ufs-stroke",
            type: "line",
            source: "ufs",
            "source-layer": "ufs",
            paint: {
              // Traço cor de papel do design system Atlas Menna (S07/Bloco 1).
              "line-color": getCssVar("--map-stroke") || "#fbfbfc",
              "line-width": 0.8,
            },
          },
          {
            id: "ufs-stroke-hover",
            type: "line",
            source: "ufs",
            "source-layer": "ufs",
            paint: {
              "line-color": getCssVar("--map-stroke-focus") || "#14171b",
              "line-width": 2.5,
            },
            filter: ["==", "SIGLA_UF", ""],
          },
        ],
      },
      bounds: [-73.99, -33.75, -28.84, 5.27],
      fitBoundsOptions: { padding: 20 },
      attributionControl: false,
      dragRotate: false,
      touchPitch: false,
      // UX: scroll do mouse na página NÃO deve dar zoom no mapa embedded —
      // usuário rolando vê página rolar, não mapa ampliar. Pinch em mobile
      // continua funcionando via touchZoom (default true).
      scrollZoom: false,
    });

    mapRef.current = map;

    map.on("load", () => {
      // Use latest refs at load time
      applyColors(
        map,
        Array.from(rowsMapRef.current.values()),
        viewRef.current,
        rankByLiderRef.current,
        candidatosByIdRef.current,
      );
    });

    // Hover: highlight + tooltip (RF-030.3) + brushing (hover-store producer,
    // `type: "uf"` — S07/Bloco 1). Throttle: mesmo padrão de ChoroplethMapUF.tsx.
    const onMouseMove = throttle(
      (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const sigla = feature.properties?.SIGLA_UF as string | undefined;
        if (!sigla) return;

        useHoverStore.getState().setHovered({ type: "uf", sigla }, "map");
        map.setFilter("ufs-stroke-hover", ["==", "SIGLA_UF", sigla]);
        const row = rowsMapRef.current.get(sigla);
        if (row) {
          const rect = containerRef.current?.getBoundingClientRect();
          const x = e.originalEvent.clientX - (rect?.left ?? 0);
          const y = e.originalEvent.clientY - (rect?.top ?? 0);
          setTooltip({
            x,
            y,
            // Vira o cartão pra esquerda perto da borda direita do mapa.
            flip: rect ? x > rect.width / 2 : false,
            sigla,
            row,
          });
        }
        map.getCanvas().style.cursor = "pointer";
      },
      16,
    );
    map.on("mousemove", "ufs-fill", onMouseMove);

    map.on("mouseleave", "ufs-fill", () => {
      useHoverStore.getState().clear();
      map.setFilter("ufs-stroke-hover", ["==", "SIGLA_UF", ""]);
      setTooltip(null);
      map.getCanvas().style.cursor = "";
    });

    // Click: navigate to /uf/[sigla] (RF-030.3). Também emite pro
    // hover-store (mesmo padrão de tap-to-select do ChoroplethMapUF.tsx) —
    // em touch não há mousemove antes do tap.
    map.on("click", "ufs-fill", (e) => {
      const sigla = e.features?.[0]?.properties?.SIGLA_UF as string | undefined;
      if (!sigla) return;
      useHoverStore.getState().setHovered({ type: "uf", sigla }, "map");
      routerRef.current.push(`/uf/${sigla}`);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Stable ref to router.push to avoid re-mount on navigation change
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  // Refs for view/rankByLider/candidatosById used in load handler
  const viewRef = useRef(view);
  const rankByLiderRef = useRef(effectiveRankByLider);
  const candidatosByIdRef = useRef(candidatosById);
  useEffect(() => {
    viewRef.current = view;
    rankByLiderRef.current = effectiveRankByLider;
    candidatosByIdRef.current = candidatosById;
  }, [view, effectiveRankByLider, candidatosById]);

  // Recolor when view, rows, rankByLider or candidatos change (zero re-fetch)
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.loaded()) return;
    applyColors(map, rows, view, effectiveRankByLider, candidatosById);
  }, [view, rows, effectiveRankByLider, candidatosById]);

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={containerRef}
        role="img"
        aria-label="Mapa interativo do Brasil — UFs coloridas por projeção"
        // S05 carry-over (constitution P3 MEDIUM): liga o mapa semanticamente à
        // tabela `<StateGroupedTable>` que vive abaixo na mesma página. Leitores
        // de tela anunciam "descrito por: Resultados por estado" — quem não
        // enxerga o choropleth pode ir direto à tabela equivalente (a11y RNF-022).
        // O id "state-grouped-table-heading" é declarado no <h2> da tabela.
        aria-describedby="state-grouped-table-heading"
        style={{ width: "100%", height }}
      />
      {/* HoverCard RF-030.3 — design system Atlas Menna (S07/Bloco 1) */}
      {tooltip && (
        <HoverCard
          x={tooltip.x}
          y={tooltip.y}
          flip={tooltip.flip}
          title={tooltip.sigla}
          kicker={tooltip.row.chamada ? "Chamada" : undefined}
          apurado={tooltip.row.pct_apurado}
          rows={buildHoverRows(tooltip.row, candidatosById, effectiveRankByLider)}
        />
      )}
    </div>
  );
}
