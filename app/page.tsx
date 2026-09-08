/**
 * app/page.tsx
 *
 * Home Nacional Presidencial (T-01). Spec 003 + S05/F4 (ADR-0013, ADR-0014,
 * ADR-0017 — multi-candidato) + S07/Fase 2 (ADR-0018 hero de seis
 * termômetros em 1T, ADR-0019 identidade de trilha).
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
 * Layout em modo `multi-1t` (ADR-0018 — hero de seis termômetros)
 *   RaceHeader (kicker + h1 + Tabs + badges)         RF-029, ADR-0019
 *   ├── ApuracaoMeta                                 RF-026
 *   ProjectionThermometers (hero: 1º/2º/3º/outros/
 *   brancos-nulos/abstenção)                         RF-022, RF-023
 *   MinorCandidatesList "Composição de Outros"
 *   (rank >= 4, sempre no DOM — ADR-0017)            RF-030.8
 *   TwoRoundIndicator (P(2T) global)                 RF-030.7
 *   RunoffScenarios                                  S06/F4d
 *   NationalChoroplethMap (rankByLider N-way)        RF-030.1-4
 *   DecisiveUFsGrid (rankByLider)                    RF-024
 *   StateGroupedTable mode=multi-1t                  RF-030.6
 *   InsightCard                                      RF-044
 *   ForecastTransparency                             RF-043
 *   Footer                                           constituição § 1
 *
 * ADR-0018 substitui, **apenas em `multi-1t`**, o trio `HeadlineScore` +
 * `CandidateRanking` + `NationalNeedle variant="national-1t"` pelos
 * termômetros. Um duelo top-2 em uma corrida de 11 candidatos é leitura
 * enganosa, e abstenção/brancos/nulos ficavam fora da tela.
 *
 * Layout em modo `binary` (2T ou 1T com 2 cands): comportamento S04/S06
 * preservado **integralmente** — HeadlineScore como camada 1, recap do 1T
 * (ADR-0016), agulha em variant=national-2t, sem termômetros.
 *
 * Cobertura: RF-021..030.8, RF-043, RF-044, RNF-002, RNF-007, RNF-022..028.
 */

import type { Metadata } from "next";

import { RaceTypeIndicator } from "@/components/atoms/badges/RaceTypeIndicator";
import { MinorCandidatesList } from "@/components/atoms/lists/MinorCandidatesList";
import { ApuracaoMeta } from "@/components/blocks/ApuracaoMeta";
import { BreakingNewsTicker } from "@/components/blocks/BreakingNewsTicker";
import { DecisiveUFsGrid } from "@/components/blocks/DecisiveUFsGrid";
import { ForecastTransparency } from "@/components/blocks/ForecastTransparency";
import { HeadlineScore } from "@/components/blocks/HeadlineScore";
import { InsightCard } from "@/components/blocks/InsightCard";
import { NationalNeedle } from "@/components/blocks/NationalNeedle";
import { NationalWinnerBanner } from "@/components/blocks/NationalWinnerBanner";
import { ProjectionThermometers } from "@/components/blocks/ProjectionThermometers";
import { RunoffScenarios } from "@/components/blocks/RunoffScenarios";
import { StateGroupedTable } from "@/components/blocks/StateGroupedTable";
import { TurnoOneRecap } from "@/components/blocks/TurnoOneRecap";
import { TwoRoundIndicator } from "@/components/blocks/TwoRoundIndicator";
import { Footer } from "@/components/layout/Footer";
import { RaceHeader } from "@/components/layout/RaceHeader";
import { readArchivedProjection, readNationalProjection } from "@/lib/edge-config/reader";
import type { EdgePayload } from "@/lib/edge-config/types";
import nationalFixture from "@/tests/fixtures/edge-config/projection-current.json" with {
  type: "json",
};
import nationalFixtureT2 from "@/tests/fixtures/edge-config/projection-current-t2.json" with {
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

/**
 * Fixture usada quando não há Edge Config (dev local, preview sem credencial
 * e testes). `FIXTURE_VARIANT=t2` troca para o payload de 2º turno.
 *
 * Por que uma env var e não um parâmetro: a página é um Server Component sem
 * props, e o smoke SSR precisa exercitar o modo `binary` (que só existe com
 * `turno === 2`). Injetar por env mantém `app/page.tsx` com a mesma forma em
 * produção — onde o reader responde antes e a fixture nunca é lida — em vez
 * de reestruturar a página só para testar. Em produção a env não é definida.
 */
function fixturePayload(): EdgePayload {
  const variant = process.env.FIXTURE_VARIANT;
  const fixture = variant === "t2" ? nationalFixtureT2 : nationalFixture;
  return fixture as unknown as EdgePayload;
}

/** Polling SWR é gerenciado pelo `HomeClientShell`; o RSC fornece o estado inicial. */
async function getInitialPayload(): Promise<EdgePayload> {
  const fromEdge = await readNationalProjection();
  if (fromEdge) return fromEdge;
  return fixturePayload();
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

  // Sinal `vai_a_2t` agregado nacional. S06/F4d Fase 5 promoveu a derivação ao
  // orchestrator (`national.vai_a_2t_nacional`); aqui usamos direto quando
  // presente, com fallback à derivação local pra payloads pré-Fase 5.
  // Semântica alinhada com o NOME do campo: `true` ⇔ vai a 2T ⇔ P(2T) alta.
  // O `<NationalWinnerBanner />` gate é `vaiA2t === false` (decisão 1T).
  //
  // Fix Fase 5: a heurística antiga local emitia `vaiA2tNacional = p < 0.01`,
  // ou seja, **true quando NÃO vai a 2T** — invertido em relação ao nome.
  // Com isso o banner NUNCA renderizava no caminho decisão-1T (sempre `!==
  // false` ⇒ early return). Cobertura desse caminho passa a existir após
  // Fase 5. Pré-Fase 5: payloads sem o campo agora caem em derivação
  // SEMANTICAMENTE CORRETA (`>= 0.01`), corrigindo o gate retroativamente.
  const pSegundoTurno = national.p_segundo_turno_overall;
  const vaiA2tNacional: boolean | null =
    national.vai_a_2t_nacional ?? (pSegundoTurno == null ? null : pSegundoTurno >= 0.01);

  // Mapping candidato_id → rank — alimenta paleta N-way no mapa e nas
  // colunas decisivas/grouped (ADR-0013). Pré-S05 ou fallback: array
  // já é ordenado por rank, então `index + 1` coincide com o rank.
  const rankByLider: Record<number, number> = Object.fromEntries(
    national.candidatos.map((c, i) => [c.id, c.rank ?? i + 1]),
  );

  // Para tabela e indicadores que precisam do nome do líder.
  const lider = national.candidatos.find((c) => (c.rank ?? -1) === 1) ?? national.candidatos[0];
  const segundo = national.candidatos.find((c) => (c.rank ?? -1) === 2) ?? national.candidatos[1];

  // ADR-0018 — "Composição de Outros": os candidatos que o termômetro
  // agregado resume (rank >= 4). Substitui as antigas camadas 2 (rank 3..6,
  // `<CandidateRanking />`) e 3 (rank 7+), já que rank 3 subiu para o hero.
  const outrosCandidatos = national.candidatos.filter((c, i) => (c.rank ?? i + 1) >= 4);

  return (
    <main
      data-trilha="pres"
      className="mx-auto flex max-w-page flex-col gap-8 px-4 py-6 md:px-6 md:py-10"
    >
      {/* Header compartilhado (ADR-0019). O `<h1>` só é emitido em multi-1t:
          em binary ele continua vindo do `<HeadlineScore />` (ADR-0017), e
          duas <h1> na mesma página seriam regressão de a11y. */}
      <RaceHeader
        trilha="pres"
        crumbs={["Brasil"]}
        titulo={mode === "multi-1t" ? "Apuração Presidencial 2026" : undefined}
        subtitulo={
          mode === "multi-1t"
            ? "Projeção do resultado final a partir dos boletins do TSE. Não oficial."
            : undefined
        }
        tabs={{
          ariaLabel: "Cargo",
          value: "pres",
          options: [
            { id: "pres", label: "Presidente", href: "/" },
            { id: "gov", label: "Governador", href: "/governador" },
          ],
        }}
        liveActive={pct_apurado_total > 0}
        turno={turno}
        extras={<RaceTypeIndicator candidatos={national.candidatos} turno={turno} />}
      />

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

      {/* Camada 1 (hero).
          - binary (2T): `<HeadlineScore />` intocado — com `recap` do 1T
            injetado acima (ADR-0016).
          - multi-1t: seis termômetros (ADR-0018). O `<HeadlineScore />` e o
            `<CandidateRanking />` saem do fluxo; rank >= 4 continua no DOM
            logo abaixo, como "Composição de Outros" (ADR-0017). */}
      {mode === "binary" ? (
        <HeadlineScore
          candidatos={national.candidatos}
          mode={mode}
          turno={turno}
          recap={turno === 2 ? <TurnoOneRecap recap={recap1T} /> : null}
        />
      ) : (
        <>
          <ProjectionThermometers
            candidatos={national.candidatos}
            participacao={national.participacao}
          />
          {outrosCandidatos.length > 0 && (
            <section aria-labelledby="composicao-outros-heading" className="flex flex-col gap-2">
              <h3
                id="composicao-outros-heading"
                className="text-sm uppercase tracking-wide"
                style={{ color: "var(--color-text-muted)" }}
              >
                Composição de Outros
              </h3>
              <MinorCandidatesList candidatos={outrosCandidatos} />
            </section>
          )}
        </>
      )}

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

      {/* Mapa hero — wraps view toggle client-side. `rankByLider` propaga
          paleta N-way; `candidatoAId` mantido por backward-compat. */}
      <HomeClientShell
        rows={por_uf}
        candidatoAId={national.candidato_a_id}
        rankByLider={rankByLider}
      />

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_auto]">
        {/* Agulha — só em binary (2T). Em multi-1t a agulha `national-1t`
            media P(2T), a mesma métrica do `<TwoRoundIndicator />` acima:
            ADR-0018 tirou a duplicata do fluxo. */}
        {mode === "binary" && (
          <NationalNeedle
            national={national}
            variant="national-2t"
            pSegundoTurno={national.p_segundo_turno_overall}
            liderNome={lider?.nome}
          />
        )}
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
      {/* FIX 2026-09-05 (a11y-perf-auditor): --color-text-faint (#999999)
          mede ~2.85:1 sobre branco — falha RNF-022 (4.5:1). Só aparece em
          dev (NODE_ENV==="development"), mas axe-core não distingue isso;
          trocado por --color-text-muted (~5.7:1). */}
      {process.env.NODE_ENV === "development" && (
        <details className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          <summary>debug: composition</summary>
          <pre>{JSON.stringify(composition, null, 2)}</pre>
        </details>
      )}

      <Footer />
    </main>
  );
}
