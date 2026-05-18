/**
 * app/page.tsx
 *
 * Home Nacional Presidencial (T-01). Spec 003 + S05/F4 (ADR-0013, ADR-0014,
 * ADR-0017 — multi-candidato).
 *
 * Server Component — lê Edge Config (`projection:current`) server-side via
 * `readNationalProjection()` (ADR-0001) e passa o payload como `fallbackData`
 * para o SWR client que mantém polling vivo (RF-027).
 *
 * Em dev sem `EDGE_CONFIG`, o reader retorna null e o /api/projection cai num
 * fixture local — aqui também caímos no fixture para manter SSR funcional.
 *
 * Mode dispatch (S05/F4)
 *   - `mode = "binary"` quando `payload.turno === 2` ou `candidatos.length === 2`.
 *   - `mode = "multi-1t"` quando `payload.turno === 1` com >2 candidatos.
 *
 * Layout em modo `multi-1t` (RF-030.5..030.8 — hero multi-camada, ADR-0017)
 *   Header
 *   ├── Tabs (Presidente | Governador)               RF-029
 *   ├── LiveBadge + TurnoBadge + RaceTypeIndicator   S05/F4
 *   └── ApuracaoMeta                                 RF-026
 *   HeadlineScore (camada 1: top-2 hero)             RF-022, RF-023
 *   TwoRoundIndicator (P(2T) global)                 RF-030.7
 *   CandidateRanking (camada 2: rank 3..6)           RF-030.8
 *   MinorCandidatesList (camada 3: rank 7+)          RF-030.8
 *   NationalChoroplethMap (rankByLider N-way)        RF-030.1-4
 *   NationalNeedle variant=national-1t               RF-021 (S05)
 *   DecisiveUFsGrid (rankByLider)                    RF-024
 *   StateGroupedTable mode=multi-1t                  RF-030.6
 *   InsightCard                                      RF-044
 *   ForecastTransparency                             RF-043
 *   Footer                                           constituição § 1
 *
 * Layout em modo `binary` (2T ou 1T com 2 cands): comportamento S04
 * preservado — sem CandidateRanking / MinorCandidatesList /
 * TwoRoundIndicator; agulha em variant=national-2t.
 *
 * Cobertura: RF-021..030.8, RF-043, RF-044, RNF-002, RNF-007, RNF-022..028.
 */

import type { Metadata } from "next";

import { RaceTypeIndicator } from "@/components/atoms/badges/RaceTypeIndicator";
import { TurnoBadge } from "@/components/atoms/badges/TurnoBadge";
import { Tabs } from "@/components/atoms/controls/Tabs";
import { MinorCandidatesList } from "@/components/atoms/lists/MinorCandidatesList";
import { ApuracaoMeta } from "@/components/blocks/ApuracaoMeta";
import { BreakingNewsTicker } from "@/components/blocks/BreakingNewsTicker";
import { CandidateRanking } from "@/components/blocks/CandidateRanking";
import { DecisiveUFsGrid } from "@/components/blocks/DecisiveUFsGrid";
import { ForecastTransparency } from "@/components/blocks/ForecastTransparency";
import { HeadlineScore } from "@/components/blocks/HeadlineScore";
import { InsightCard } from "@/components/blocks/InsightCard";
import { NationalNeedle } from "@/components/blocks/NationalNeedle";
import { NationalWinnerBanner } from "@/components/blocks/NationalWinnerBanner";
import { RunoffScenarios } from "@/components/blocks/RunoffScenarios";
import { StateGroupedTable } from "@/components/blocks/StateGroupedTable";
import { TurnoOneRecap } from "@/components/blocks/TurnoOneRecap";
import { TwoRoundIndicator } from "@/components/blocks/TwoRoundIndicator";
import { Footer } from "@/components/layout/Footer";
import { LiveBadge } from "@/components/layout/LiveBadge";
import { readArchivedProjection, readNationalProjection } from "@/lib/edge-config/reader";
import type { EdgePayload } from "@/lib/edge-config/types";
import nationalFixture from "@/tests/fixtures/edge-config/projection-current.json" with {
  type: "json",
};
import { HomeClientShell } from "./HomeClientShell";

/**
 * RNF-028 — Meta/OG tags. Imagens dinâmicas OG (RF-051) ficam para spec 009;
 * aqui injetamos apenas os campos textuais para sharing previews em redes
 * sociais. `siteName` e `locale` aplicam o padrão pt_BR.
 */
export const metadata: Metadata = {
  title: "SalaCofre — Apuração presidencial 2026",
  description:
    "Apuração presidencial 2026 em tempo real e projeção estatística do resultado final. Não oficial. Fonte: TSE.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "SalaCofre — Apuração presidencial 2026",
    description:
      "Apuração presidencial 2026 em tempo real e projeção estatística do resultado final.",
    type: "website",
    locale: "pt_BR",
    siteName: "SalaCofre",
  },
  twitter: {
    card: "summary_large_image",
    title: "SalaCofre — Apuração presidencial 2026",
    description:
      "Apuração presidencial 2026 em tempo real e projeção estatística do resultado final.",
  },
};

/** Polling SWR é gerenciado pelo `HomeClientShell`; o RSC fornece o estado inicial. */
async function getInitialPayload(): Promise<EdgePayload> {
  const fromEdge = await readNationalProjection();
  if (fromEdge) return fromEdge;
  return nationalFixture as unknown as EdgePayload;
}

export default async function HomePage() {
  const payload = await getInitialPayload();
  const { national, por_uf, pct_apurado_total, ufs_apuradas, ts, insights, composition, turno } =
    payload;

  // Mode dispatch (S05/F4). `turno === 2` força binary; 1T com 2 cands
  // também cai em binary (defensivo). 1T multi-candidato → multi-1t.
  const mode: "binary" | "multi-1t" =
    turno === 2 || national.candidatos.length === 2 ? "binary" : "multi-1t";

  // S06/F4d (Fase 4) — Mode 2T: lê archive do 1T para `<TurnoOneRecap />`
  // (ADR-0016). `readArchivedProjection` retorna null se a chave ainda
  // não foi gravada (pré-virada de turno) — degrade gracioso.
  const recap1T = turno === 2 ? await readArchivedProjection({ cargo: "pres", turno: 1 }) : null;

  // Sinal `vai_a_2t` agregado nacional — derivado de `p_segundo_turno_overall`.
  // Em 1T, `false` ⇔ orchestrator declara decisão no 1T (P(2T) baixíssima).
  // Em 2T não usado pelo banner (turno 2 já passa o gate).
  const pSegundoTurno = national.p_segundo_turno_overall;
  const vaiA2tNacional: boolean | null = pSegundoTurno == null ? null : pSegundoTurno < 0.01;

  // Mapping candidato_id → rank — alimenta paleta N-way no mapa e nas
  // colunas decisivas/grouped (ADR-0013). Pré-S05 ou fallback: array
  // já é ordenado por rank, então `index + 1` coincide com o rank.
  const rankByLider: Record<number, number> = Object.fromEntries(
    national.candidatos.map((c, i) => [c.id, c.rank ?? i + 1]),
  );

  // Para tabela e indicadores que precisam do nome do líder.
  const lider = national.candidatos.find((c) => (c.rank ?? -1) === 1) ?? national.candidatos[0];
  const segundo = national.candidatos.find((c) => (c.rank ?? -1) === 2) ?? national.candidatos[1];

  // Camadas 2 e 3 (multi-1t)
  const ranking3a6 = national.candidatos.filter((c) => (c.rank ?? -1) >= 3 && (c.rank ?? -1) <= 6);
  const minor7plus = national.candidatos.filter((c) => (c.rank ?? -1) >= 7);

  return (
    <main className="mx-auto flex max-w-container flex-col gap-8 px-4 py-6 md:px-6 md:py-10">
      {/* Header */}
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs
          ariaLabel="Cargo"
          value="pres"
          options={[
            { id: "pres", label: "Presidente", href: "/" },
            { id: "gov", label: "Governador", href: "/governador" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <LiveBadge active={pct_apurado_total > 0} />
          <TurnoBadge turno={turno} />
          <RaceTypeIndicator candidatos={national.candidatos} turno={turno} />
        </div>
      </header>

      {/* S06/F4d — Breaking news ticker no topo. Renderiza só se há chamadas. */}
      {(national.chamadas_recentes ?? []).length > 0 && (
        <BreakingNewsTicker chamadas={national.chamadas_recentes ?? []} />
      )}

      <ApuracaoMeta pctApurado={pct_apurado_total} ufsApuradas={ufs_apuradas} ts={ts} />

      {/* S06/F4d — Banner "ELEITO" nacional. Aparece quando threshold de
          chamada final atingido (p_vitoria >= 0.99 ou apurado >= 99%). */}
      <NationalWinnerBanner
        national={national}
        candidatos={national.candidatos}
        pctApuradoTotal={pct_apurado_total}
        turno={turno}
        vaiA2t={vaiA2tNacional}
      />

      {/* Camada 1 (hero) — top-2 sempre. Em mode 2T, `recap` injeta
          `<TurnoOneRecap />` acima do hero (ADR-0016). Em multi-1t a prop
          é ignorada internamente pelo HeadlineScore. */}
      <HeadlineScore
        candidatos={national.candidatos}
        mode={mode}
        turno={turno}
        recap={mode === "binary" && turno === 2 ? <TurnoOneRecap recap={recap1T} /> : null}
      />

      {/* Em multi-1t: TwoRoundIndicator ao lado do hero (substitui o
          ThresholdMarker50 antigo, agora interno ao HeadlineScore binary).
          Em 2T não faz sentido (já passou). */}
      {mode === "multi-1t" && turno !== 2 && lider && (
        <TwoRoundIndicator
          pSegundoTurno={national.p_segundo_turno_overall}
          liderPct={lider.pct_projetado}
          liderNome={lider.nome}
          liderCor={lider.cor}
        />
      )}

      {/* S06/F4d — RunoffScenarios em 1T tardio quando p_segundo_turno_overall
          >= 0.4. O próprio componente faz o gate; aqui só não passamos em 2T. */}
      {mode === "multi-1t" && turno !== 2 && (
        <RunoffScenarios national={national} candidatos={national.candidatos} />
      )}

      {/* Camadas 2 + 3 — só em multi-1t. Em binary não há rank 3+ relevante. */}
      {mode === "multi-1t" && ranking3a6.length > 0 && <CandidateRanking candidatos={ranking3a6} />}
      {mode === "multi-1t" && minor7plus.length > 0 && (
        <MinorCandidatesList candidatos={minor7plus} />
      )}

      {/* Mapa hero — wraps view toggle client-side. `rankByLider` propaga
          paleta N-way; `candidatoAId` mantido por backward-compat. */}
      <HomeClientShell
        rows={por_uf}
        candidatoAId={national.candidato_a_id}
        rankByLider={rankByLider}
      />

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_auto]">
        {/* Agulha — variant depende do modo. national-1t mede P(decisão 1T);
            national-2t mantém duelo binário. */}
        <NationalNeedle
          national={national}
          variant={mode === "multi-1t" ? "national-1t" : "national-2t"}
          pSegundoTurno={national.p_segundo_turno_overall}
          liderNome={lider?.nome}
        />
        <ForecastTransparency pctApurado={pct_apurado_total} />
      </div>

      <DecisiveUFsGrid
        rows={por_uf}
        rankByLider={rankByLider}
        candidatoAId={national.candidato_a_id}
      />

      <StateGroupedTable
        rows={por_uf}
        mode={mode}
        candidatos={national.candidatos}
        candidatoAId={national.candidato_a_id}
        candidatoAName={lider?.nome ?? "Líder A"}
        candidatoBName={segundo?.nome ?? "Líder B"}
        corA={lider?.cor ?? "var(--color-cand-1)"}
        corB={segundo?.cor ?? "var(--color-cand-2)"}
      />

      {insights.length > 0 && <InsightCard frases={insights} heading="Análise" />}

      {/* `composition` reservado para futuras melhorias do ForecastTransparency */}
      {process.env.NODE_ENV === "development" && (
        <details className="text-xs" style={{ color: "var(--color-text-faint)" }}>
          <summary>debug: composition</summary>
          <pre>{JSON.stringify(composition, null, 2)}</pre>
        </details>
      )}

      <Footer />
    </main>
  );
}
