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
 */

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useRouter } from "next/navigation";
import { Protocol } from "pmtiles";
import { useEffect, useRef, useState } from "react";

import type { MapView } from "@/components/atoms/controls/MapViewToggle";
import type { EdgeUfRow } from "@/lib/edge-config/types";
import { resolveBandHex, resolveCandHex } from "@/lib/utils/cand-color";

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
   */
  rankByLider?: Record<number, number>;
  height?: number;
}

interface TooltipState {
  x: number;
  y: number;
  sigla: string;
  row: EdgeUfRow;
}

/** Lê token CSS do :root em runtime (seguro só no cliente). */
function getCssVar(name: string): string {
  if (typeof window === "undefined") return "#d9d9d9";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * S05/F3B — paleta N-way. Recebe `rank` do líder daquela UF (1..6 ou fallback
 * rank 99 → "other"). `margin` decide intensidade: alta → cor sólida (cand-N),
 * média → versão band (cand-band-N), baixa → tossup neutro.
 */
function marginToColor(margin: number, rank: number): string {
  const abs = Math.abs(margin);
  if (abs < 2) return getCssVar("--color-tossup");
  return abs >= 15 ? resolveCandHex(rank) : resolveBandHex(rank);
}

/**
 * Turnout (view "turnout") — paleta neutra/única dimensão: o "líder" da UF
 * pinta com sua cor sólida (top apurado) ou band (baixo apurado). Não tem
 * cor partidária natural — semântica é "quanto já apurou". Mantemos o uso
 * do rank pra dar continuidade visual entre views.
 */
function turnoutToColor(pct: number, rank: number): string {
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
 */
function swingToColor(swing: number): string {
  const abs = Math.abs(swing);
  if (abs < 2) return getCssVar("--color-tossup");
  if (swing > 0)
    return abs >= 10 ? getCssVar("--color-band-very_likely") : getCssVar("--color-band-likely");
  return abs >= 10 ? getCssVar("--color-band-very_likely") : getCssVar("--color-band-lean");
}

function rankFor(lider: number, rankByLider: Record<number, number> | undefined): number {
  // Fallback: sem rankByLider → rank 99 (→ cor "other" cinza). Pré-S05 e
  // testes legados usam isso.
  return rankByLider?.[lider] ?? 99;
}

function resolveColor(
  row: EdgeUfRow,
  view: MapView,
  rankByLider: Record<number, number> | undefined,
): string {
  const rank = rankFor(row.lider, rankByLider);
  switch (view) {
    case "winner":
      return resolveCandHex(rank);
    case "margin":
      return marginToColor(row.margem_projetada, rank);
    case "swing":
      return swingToColor(row.swing_vs_2022);
    case "turnout":
      return turnoutToColor(row.pct_apurado, rank);
  }
}

/**
 * Aplica cores via expression `["match", ["get", "SIGLA_UF"], ...]` em vez de
 * `setFeatureState`. Razão: tippecanoe gera IDs numéricos sequenciais por
 * default — `setFeatureState({ id: "SP" })` não casa com feature id numérico
 * (e nosso PMTiles foi gerado assim). Match por property `SIGLA_UF` é robusto
 * independente do feature id. Custo: rebuild de expression a cada mudança de
 * view (27 entries — trivial).
 */
function applyColors(
  map: maplibregl.Map,
  rows: EdgeUfRow[],
  view: MapView,
  rankByLider: Record<number, number> | undefined,
) {
  if (rows.length === 0) return;
  const fallback = getCssVar("--color-tossup");
  // ["match", ["get", "SIGLA_UF"], "SP", "#...", "RJ", "#...", ..., fallback]
  const expression: (string | number | unknown[])[] = ["match", ["get", "SIGLA_UF"]];
  for (const row of rows) {
    expression.push(row.sigla, resolveColor(row, view, rankByLider));
  }
  expression.push(fallback);
  map.setPaintProperty("ufs-fill", "fill-color", expression as unknown as string);
}

let protocolRegistered = false;

export function NationalChoroplethMapImpl({
  rows,
  candidatoAId,
  view,
  rankByLider,
  height = 420,
}: NationalChoroplethMapImplProps) {
  // Backward-compat: caller pré-S05 só passa `candidatoAId`; sintetizamos um
  // rankByLider mínimo `{ [candidatoAId]: 1 }` pra manter o líder em
  // `--color-cand-1` (= --color-pt, mesmo hex). Líderes "diferentes" caem
  // em rank 99 → cor "other" (cinza). É degradação cuidadosa: melhor que
  // tudo cinza, ainda destaca o líder global.
  const effectiveRankByLider: Record<number, number> | undefined =
    rankByLider ?? (candidatoAId != null ? { [candidatoAId]: 1 } : undefined);
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
              // Cor inicial cinza tossup; applyColors substitui via
              // setPaintProperty com expression `["match", ["get", "SIGLA_UF"], ...]`.
              "fill-color": getCssVar("--color-tossup") || "#d9d9d9",
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
              "line-color": "#ffffff",
              "line-width": 0.8,
            },
          },
          {
            id: "ufs-stroke-hover",
            type: "line",
            source: "ufs",
            "source-layer": "ufs",
            paint: {
              "line-color": "#222222",
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
      );
    });

    // Hover: highlight + tooltip (RF-030.3)
    map.on("mousemove", "ufs-fill", (e) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const sigla = feature.properties?.SIGLA_UF as string | undefined;
      if (!sigla) return;

      map.setFilter("ufs-stroke-hover", ["==", "SIGLA_UF", sigla]);
      const row = rowsMapRef.current.get(sigla);
      if (row) {
        const rect = containerRef.current?.getBoundingClientRect();
        setTooltip({
          x: e.originalEvent.clientX - (rect?.left ?? 0),
          y: e.originalEvent.clientY - (rect?.top ?? 0),
          sigla,
          row,
        });
      }
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", "ufs-fill", () => {
      map.setFilter("ufs-stroke-hover", ["==", "SIGLA_UF", ""]);
      setTooltip(null);
      map.getCanvas().style.cursor = "";
    });

    // Click: navigate to /uf/[sigla] (RF-030.3)
    map.on("click", "ufs-fill", (e) => {
      const sigla = e.features?.[0]?.properties?.SIGLA_UF as string | undefined;
      if (sigla) routerRef.current.push(`/uf/${sigla}`);
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

  // Refs for view/rankByLider used in load handler
  const viewRef = useRef(view);
  const rankByLiderRef = useRef(effectiveRankByLider);
  useEffect(() => {
    viewRef.current = view;
    rankByLiderRef.current = effectiveRankByLider;
  }, [view, effectiveRankByLider]);

  // Recolor when view, rows or rankByLider change (zero re-fetch)
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.loaded()) return;
    applyColors(map, rows, view, effectiveRankByLider);
  }, [view, rows, effectiveRankByLider]);

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={containerRef}
        role="img"
        aria-label="Mapa interativo do Brasil — UFs coloridas por projeção"
        style={{ width: "100%", height }}
      />
      {/* Tooltip RF-030.3 */}
      {tooltip && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: tooltip.x + 12,
            top: tooltip.y - 8,
            pointerEvents: "none",
            backgroundColor: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            padding: "8px 12px",
            fontSize: 13,
            zIndex: 10,
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            minWidth: 160,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{tooltip.sigla}</div>
          <div>Apurado: {tooltip.row.pct_apurado.toFixed(1)}%</div>
          <div>
            Margem: {tooltip.row.margem_projetada >= 0 ? "+" : ""}
            {tooltip.row.margem_projetada.toFixed(1)}pp
          </div>
          <div>
            Swing 2022: {tooltip.row.swing_vs_2022 >= 0 ? "+" : ""}
            {tooltip.row.swing_vs_2022.toFixed(1)}pp
          </div>
          {tooltip.row.chamada && (
            <div style={{ color: "var(--color-success)", marginTop: 4, fontWeight: 500 }}>
              Chamada
            </div>
          )}
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--color-text-muted)" }}>
            Clique para ver detalhes
          </div>
        </div>
      )}
    </div>
  );
}
