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
import { MapLegend } from "@/components/atoms/maps/MapLegend";
import { MapSkeleton } from "@/components/atoms/maps/MapSkeleton";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";
import { intensityForParty, type PartyIntensity } from "@/lib/utils/party-color";

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
   *
   * S07/Bloco 1 (ADR-0024): continua sendo o **fallback** de cor — usado
   * quando `candidatos[].partido` está ausente ou não tem token próprio
   * (ver prop `candidatos` abaixo).
   */
  rankByLider?: Record<number, number>;
  /**
   * Lista nacional de candidatos (S07/Bloco 1 — ADR-0024, design system
   * Atlas Menna). Fornece `partido` para colorir cada UF pelo partido do
   * líder (`intensityForParty`/`resolvePartyHex`) em vez do rank, e `nome`
   * para o `<HoverCard>` e a `<MapLegend>` dos dois primeiros colocados.
   *
   * Mesmo shape de `StateGroupedTable.candidatos` — construído em
   * `app/page.tsx` a partir de `national.candidatos`. Ausente, ou sem
   * `partido` mapeado (`normalizePartySlug` cai em `"outros"`) para o
   * líder de uma UF → aquela UF degrada para o fallback de rank
   * (`rankByLider` + `cand-color.ts`), nunca fica sem cor.
   */
  candidatos?: EdgeCandidate[];
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

/** Degraus da rampa, borda→centro (mais forte→mais fraco) — mesma ordem do kit. */
const LEGEND_LEVELS: readonly PartyIntensity[] = [5, 4, 3, 2, 1];

interface PartyLegendProps {
  leftLabel: string;
  rightLabel: string;
  leftColors: string[];
  rightColors: string[];
}

/**
 * Legenda diverge por partido (rank 1 × rank 2) — só faz sentido nas views
 * "quem lidera" (`winner`/`margin`); `swing`/`turnout` não têm identidade
 * partidária natural (ver comentários em `_NationalChoroplethMapImpl.tsx`)
 * e não ganham legenda. Sem `candidatos` (fallback pré-S07), ou sem os dois
 * primeiros colocados identificados por `rank`, retorna `null` — melhor
 * nenhuma legenda do que uma incorreta.
 */
function buildPartyLegend(
  candidatos: EdgeCandidate[] | undefined,
  view: MapView,
): PartyLegendProps | null {
  if (view !== "winner" && view !== "margin") return null;
  if (!candidatos || candidatos.length < 2) return null;
  const a = candidatos.find((c) => c.rank === 1);
  const b = candidatos.find((c) => c.rank === 2);
  if (!a || !b) return null;
  return {
    leftLabel: a.nome,
    rightLabel: b.nome,
    leftColors: LEGEND_LEVELS.map((level) => intensityForParty(a.partido, level)),
    rightColors: LEGEND_LEVELS.map((level) => intensityForParty(b.partido, level)),
  };
}

export function NationalChoroplethMap({
  rows,
  candidatoAId,
  view,
  rankByLider,
  candidatos,
  height = 420,
  className,
}: NationalChoroplethMapProps) {
  const legend = buildPartyLegend(candidatos, view);
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
        candidatos={candidatos}
        height={height}
      />
      {legend ? (
        <MapLegend
          leftLabel={legend.leftLabel}
          rightLabel={legend.rightLabel}
          leftColors={legend.leftColors}
          rightColors={legend.rightColors}
          className="mt-2"
        />
      ) : null}
    </div>
  );
}
