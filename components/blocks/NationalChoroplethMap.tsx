"use client";

/**
 * components/blocks/NationalChoroplethMap.tsx
 *
 * Mapa coroplético do Brasil hero (spec 003).
 * Cobertura: RF-030.1, RF-030.2, RF-030.3, RF-030.4 (Skip — hachura omitida).
 *
 * Arquitetura de dois níveis (ADR-0010):
 *   - Este arquivo: thin wrapper com `next/dynamic({ ssr: false })` que expõe
 *     a interface pública congelada. SSR-safe (renderiza MapSkeleton).
 *   - `./_NationalChoroplethMapImpl.tsx`: implementação MapLibre + PMTiles.
 *     Carregada apenas no cliente, NUNCA no servidor.
 *
 * Por quê dois níveis?
 *   `HomeClientShell.tsx` é Client Component, mas o test `home-page.test.tsx`
 *   usa `renderToStaticMarkup` que chama `useRouter()` (só válido no App Router
 *   montado). Separar o impl em dynamic import garante que nenhum hook de
 *   navegação/browser escapa para o contexto SSR dos testes.
 *
 * A11y: lista textual paralela fica em <StateGroupedTable /> (irmão no shell).
 */

import dynamic from "next/dynamic";

import type { MapView } from "@/components/atoms/controls/MapViewToggle";
import { MapSkeleton } from "@/components/atoms/maps/MapSkeleton";
import type { EdgeUfRow } from "@/lib/edge-config/types";

export interface NationalChoroplethMapProps {
  rows: EdgeUfRow[];
  candidatoAId: number | null;
  view: MapView;
  /**
   * Mapping `candidato_id → rank nacional` (S05/F3B). Habilita paleta N-way
   * via `colorForRank()`/`resolveCandHex()`. Quando omitido, o impl degrada
   * para "líder = rank 1 (cand-1 vermelho)" mantendo o look S04. Construído
   * em `app/page.tsx` a partir de `national.candidatos[]` (`Object.fromEntries(
   * candidatos.map(c => [c.id, c.rank]))`).
   */
  rankByLider?: Record<number, number>;
  /** Altura do mapa em px. */
  height?: number;
  className?: string;
}

const VIEW_LABEL: Record<MapView, string> = {
  winner: "Por vencedor",
  margin: "Margem",
  swing: "Swing vs 2022",
  turnout: "% apurado",
};

const NationalChoroplethMapImpl = dynamic(
  () =>
    import("@/components/blocks/_NationalChoroplethMapImpl").then(
      (m) => m.NationalChoroplethMapImpl,
    ),
  {
    ssr: false,
    loading: ({ error }) => (error ? null : <MapSkeleton height={420} />),
  },
);

export function NationalChoroplethMap({
  rows,
  candidatoAId,
  view,
  rankByLider,
  height = 420,
  className,
}: NationalChoroplethMapProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: role=region + aria-label correto para div-container de mapa interativo
    <div
      role="region"
      aria-label={`Mapa coroplético do Brasil — modo ${VIEW_LABEL[view]}`}
      className={["relative w-full", className].filter(Boolean).join(" ")}
    >
      <NationalChoroplethMapImpl
        rows={rows}
        candidatoAId={candidatoAId}
        view={view}
        rankByLider={rankByLider}
        height={height}
      />
    </div>
  );
}
