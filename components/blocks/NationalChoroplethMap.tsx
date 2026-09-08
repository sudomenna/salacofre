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
 *   `NationalMapBlock.tsx` é Client Component, mas o test `home-page.test.tsx`
 *   usa `renderToStaticMarkup` que chama `useRouter()` (só válido no App Router
 *   montado). Separar o impl em dynamic import garante que nenhum hook de
 *   navegação/browser escapa para o contexto SSR dos testes. Este wrapper
 *   ganhou `useState`/`useEffect` em 2026-09-08 (folha de UF, ver abaixo) —
 *   nenhum dos dois é hook de navegação, `renderToStaticMarkup` continua
 *   seguro (SSR nunca roda `useEffect`; `useState` só devolve o valor
 *   inicial).
 *
 * A11y: lista textual paralela fica em <StateGroupedTable /> (irmão no shell).
 *
 * Folha de UF (2026-09-08, decisão do usuário): clique/toque numa UF do mapa
 * não navega mais direto para `/uf/[sigla]` — abre `<StateResultSheet>`
 * (scrim modal no mobile, cartão lateral não-modal no desktop, `Sheet.side`).
 * O estado da UF selecionada mora AQUI, não em `_NationalChoroplethMapImpl.tsx`
 * nem em `app/`: este wrapper já é client e já é carregado eager (fora do
 * chunk lazy do MapLibre), então a folha soma ao orçamento de aplicação
 * (RNF-007a, headroom grande hoje) em vez de inflar o chunk do mapa
 * (RNF-007b, 285 KiB de 300 KiB — sem margem pra mais JS).
 */

import dynamic from "next/dynamic";
import { type CSSProperties, useEffect, useState } from "react";

import type { MapView } from "@/components/atoms/controls/MapViewToggle";
import { MapLegend } from "@/components/atoms/maps/MapLegend";
import { MapSkeleton } from "@/components/atoms/maps/MapSkeleton";
import { StateResultSheet } from "@/components/blocks/StateResultSheet";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";
import type { ViewMode } from "@/lib/state/view-mode";
import { intensityForParty, type PartyIntensity } from "@/lib/utils/party-color";

/**
 * Breakpoint desktop do `Sheet` — mesmo valor de `ADR-0029` (mobile <960px).
 * Sem hook compartilhado em `lib/utils/**` pra este propósito hoje (o mais
 * próximo, `BreakingNewsTicker.tsx`, resolve `prefers-reduced-motion`, outra
 * media query) — local e pequeno, como o padrão já usado em `UF_NAMES`
 * (`GovernorCard.tsx`, `StateResultSheet.tsx`).
 */
const DESKTOP_QUERY = "(min-width: 960px)";

function useIsDesktopSheet(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    setDesktop(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return desktop;
}

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
  /**
   * Base de leitura do choropleth (ADR-0029 § 2) — `"proj"` (default) pinta a
   * projeção, `"parcial"` pinta o apurado. Vem do controle do shell via
   * `components/blocks/NationalMapBlock.tsx`; zero requisição nova, os dois números já estão
   * no mesmo `EdgeUfRow`.
   */
  viewMode?: ViewMode;
  /**
   * Altura do mapa. Número → px. String → qualquer comprimento CSS — o mapa
   * hero da home usa `clamp(400px, 52vh, ...)` desde o ADR-0029 § 1.
   */
  height?: number | string;
  /**
   * Onde a `<MapLegend>` fica (ADR-0033 § 1).
   *
   * `"below"` (default) — no fluxo, logo abaixo do mapa. É o formato de
   * quando o mapa é um bloco de página com altura fixa.
   *
   * `"overlay"` — caixa flutuante no canto inferior esquerdo, sobre o mapa,
   * como no kit (`App.jsx`, o bloco `position: absolute; left: 12; bottom:
   * 12; width: 200` dentro de `mapBlock`). É o formato obrigatório quando o
   * mapa PREENCHE o container (`height="100%"`): com a legenda no fluxo, ela
   * seria empurrada para fora da moldura e cortada pelo `overflow: hidden`.
   */
  legendPlacement?: "below" | "overlay";
  className?: string;
}

const VIEW_LABEL: Record<MapView, string> = {
  winner: "Por vencedor",
  margin: "Margem",
  swing: "Swing vs 2022",
  turnout: "% apurado",
};

/**
 * O esqueleto precisa reservar a MESMA altura que o mapa vai ocupar, senão o
 * chunk do MapLibre chegando empurra o resto da página (CLS) — e desde o
 * ADR-0029 § 1 essa altura é variável (`clamp(400px, 52vh, ...)` no hero da
 * home), não mais a constante 420. Como `next/dynamic` não repassa props para
 * o `loading`, a altura viaja por custom property: o wrapper a publica em
 * `--map-height` e o esqueleto a lê, com 420px de fallback para quem não
 * passa `height`.
 */
const NationalChoroplethMapImpl = dynamic(
  () =>
    import("@/components/blocks/_NationalChoroplethMapImpl").then(
      (m) => m.NationalChoroplethMapImpl,
    ),
  {
    ssr: false,
    loading: ({ error }) => (error ? null : <MapSkeleton height="var(--map-height, 420px)" />),
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
  viewMode = "proj",
  height = 420,
  legendPlacement = "below",
  className,
}: NationalChoroplethMapProps) {
  const legend = buildPartyLegend(candidatos, view);
  const [selectedSigla, setSelectedSigla] = useState<string | null>(null);
  const isDesktop = useIsDesktopSheet();
  const selectedRow = selectedSigla ? (rows.find((r) => r.sigla === selectedSigla) ?? null) : null;

  return (
    // biome-ignore lint/a11y/useSemanticElements: role=region + aria-label correto para div-container de mapa interativo
    <div
      role="region"
      aria-label={`Mapa coroplético do Brasil — modo ${VIEW_LABEL[view]}`}
      className={["relative w-full", className].filter(Boolean).join(" ")}
      style={
        { "--map-height": typeof height === "number" ? `${height}px` : height } as CSSProperties
      }
    >
      <NationalChoroplethMapImpl
        rows={rows}
        candidatoAId={candidatoAId}
        view={view}
        rankByLider={rankByLider}
        candidatos={candidatos}
        viewMode={viewMode}
        height={height}
        onSelectUf={setSelectedSigla}
      />
      {legend ? (
        legendPlacement === "overlay" ? (
          <div
            style={{
              position: "absolute",
              left: "var(--space-3)",
              bottom: "var(--space-3)",
              width: 200,
              background: "var(--surface-card)",
              border: "1px solid var(--border-hairline)",
              borderRadius: "var(--radius-sm)",
              padding: "var(--space-2)",
              pointerEvents: "none",
            }}
          >
            <MapLegend
              leftLabel={legend.leftLabel}
              rightLabel={legend.rightLabel}
              leftColors={legend.leftColors}
              rightColors={legend.rightColors}
            />
          </div>
        ) : (
          <MapLegend
            leftLabel={legend.leftLabel}
            rightLabel={legend.rightLabel}
            leftColors={legend.leftColors}
            rightColors={legend.rightColors}
            className="mt-2"
          />
        )
      ) : null}
      <StateResultSheet
        open={selectedSigla != null}
        onClose={() => setSelectedSigla(null)}
        row={selectedRow}
        candidatos={candidatos ?? []}
        side={isDesktop}
      />
    </div>
  );
}
