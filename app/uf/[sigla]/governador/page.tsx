/**
 * app/uf/[sigla]/governador/page.tsx — Spec 005 (Página de UF Governador, T-04)
 *
 * Server Component. `generateStaticParams` lista as 27 UFs.
 *
 * Herda ~70% da `app/uf/[sigla]/page.tsx` (presidencial) mas com cargo=gov,
 * adicionando 3 blocos NYT-style decididos no kickoff S06:
 *
 *   1. K-1 disclaimer (constituição § 8) — banner sobre o hero quando
 *      `payload.model_fallback_tier >= 2` (sinal opcional do orchestrator).
 *   2. `<MunicipioWaffleGrid>` — Print 3 NYT (1 quadrado = 1 município).
 *   3. Bloco "Apuração por mesorregião" — só renderiza se `mesorregioes?`
 *      vier populado (degrade gracioso conforme Fase 2 — IBGE seed pode
 *      estar pendente).
 *
 * Cobertura
 *   - RFs 031–044 (idênticos à spec 004 — Open question 005 resolvida:
 *     página existe mesmo sem mapping 2022, com disclaimer).
 *   - ADR-0001/0010/0012/0013/0015/0017.
 *   - Constituição § 2 (cores via tokens, paleta multi-partido),
 *     § 3 (degrade gracioso), § 8 (transparência K-1).
 *
 * ISR: cadência 60s (ADR-0011).
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TurnoBadge } from "@/components/atoms/badges/TurnoBadge";
import { WinnerBanner } from "@/components/atoms/banners/WinnerBanner";
import { ProbabilityOverTime } from "@/components/atoms/charts/ProbabilityOverTime";
import { TimeSeriesChart } from "@/components/atoms/charts/TimeSeriesChart";
import { TurnoutAreaChart } from "@/components/atoms/charts/TurnoutAreaChart";
import { UFBreadcrumb } from "@/components/atoms/nav/UFBreadcrumb";
import { Needle } from "@/components/atoms/needle/Needle";
import { CandidateRow } from "@/components/atoms/tables/CandidateRow";
import { ForecastTransparency } from "@/components/blocks/ForecastTransparency";
import { InsightCard } from "@/components/blocks/InsightCard";
import { type MunicipioRow, MunicipioTable } from "@/components/blocks/MunicipioTable";
import { MunicipioWaffleGrid } from "@/components/blocks/MunicipioWaffleGrid";
import { UfLeaderMapLazy, UfMapDuoLazy } from "@/components/blocks/UfMapsLazy";
import { Footer } from "@/components/layout/Footer";
import { LiveBadge } from "@/components/layout/LiveBadge";
import { readUfProjection } from "@/lib/edge-config/reader";
import type { EdgePayloadUf, EdgeUfCandidate, EdgeUfMunicipio } from "@/lib/edge-config/types";
import { rankFromColorVar } from "@/lib/utils/cand-color";

export const revalidate = 60;

// 27 UFs — mesma lista canônica da rota presidencial.
const UFS_BRASIL = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
] as const;

export function generateStaticParams() {
  return UFS_BRASIL.map((sigla) => ({ sigla }));
}

interface UFGovernadorPageProps {
  params: Promise<{ sigla: string }>;
}

export async function generateMetadata({ params }: UFGovernadorPageProps): Promise<Metadata> {
  const { sigla: raw } = await params;
  const sigla = raw.toUpperCase();
  const title = `Governador ${sigla} — Apuração 2026 | SalaCofre`;
  const description = `Apuração da corrida estadual de governador em ${sigla} (2026): projeção em tempo real, mapa de municípios, agregação por mesorregião.`;
  return {
    alternates: { canonical: `/uf/${sigla}/governador` },
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "pt_BR",
      siteName: "SalaCofre",
      url: `/uf/${sigla}/governador`,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

function sortByLeader(candidatos: readonly EdgeUfCandidate[]): EdgeUfCandidate[] {
  return [...candidatos].sort((a, b) => {
    if (b.pct_projetado !== a.pct_projetado) return b.pct_projetado - a.pct_projetado;
    return a.id - b.id;
  });
}

function leaderProbability(needlePosition: number): number {
  const probA = (needlePosition + 1) / 2;
  return Math.max(probA, 1 - probA);
}

function toMunicipioRows(
  municipios: EdgeUfMunicipio[],
  candidateColor: Record<number, string>,
  candidateShortName: Record<number, string>,
): MunicipioRow[] {
  return municipios.map((m) => {
    const liderId = m.lider.candidato_id;
    const totalVotos = Object.values(m.votos_reportados).reduce((a, b) => a + b, 0);
    return {
      cod_ibge: m.cod_ibge,
      nome: m.nome,
      lider: liderId,
      liderCor: candidateColor[liderId] ?? "var(--color-text)",
      liderNome: candidateShortName[liderId] ?? `#${liderId}`,
      margemPp: m.lider.margem_pp,
      pctApurado: m.pct_apurado,
      votosReportados: totalVotos,
    };
  });
}

/**
 * K-1 disclaimer adaptativo (ADR-0015). Lê `model_fallback_tier` do
 * `EdgePayloadUf` (campo opcional formal — S06/F4d Fase 5). Quando ausente
 * (payloads pré-S05 ou tier 1 ouro sem disclaimer), retorna null.
 *
 * Pré-Fase 5 lia via cast (`as unknown as { ... }`) porque o campo não
 * estava no tipo formal — Fase 5 da S06 promoveu o campo a opcional em
 * `lib/edge-config/types.ts` e este consumidor passou a ler direto.
 */
function readModelFallbackTier(payload: EdgePayloadUf): number | null {
  return payload.model_fallback_tier ?? null;
}

export default async function UFGovernadorPage({ params }: UFGovernadorPageProps) {
  const { sigla: raw } = await params;
  const sigla = raw.toUpperCase();

  if (!UFS_BRASIL.includes(sigla as (typeof UFS_BRASIL)[number])) {
    notFound();
  }

  // Leitura específica: cargo=gov, turno=1 default (orchestrator alterna
  // pra turno=2 via chave dinâmica em S07).
  const payload = await readUfProjection(sigla, { cargo: "gov", turno: 1 });

  if (!payload) {
    return (
      <main className="mx-auto flex min-h-screen max-w-[1280px] flex-col px-5 py-6">
        <UFBreadcrumb href="/governador" label="‹ Voltar à lista de governadores" />
        <h1 className="mt-4 text-3xl" style={{ fontFamily: "var(--font-serif)" }}>
          Governador {sigla} — Aguardando dados
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
          A projeção para esta corrida começa quando o TSE divulgar os primeiros boletins.
        </p>
        <Footer />
      </main>
    );
  }

  const sortedCandidatos = sortByLeader(payload.candidatos);
  const lider = sortedCandidatos[0];
  const segundo = sortedCandidatos[1];
  const pVitoriaLider = leaderProbability(payload.needle_position);

  const candidateColor: Record<number, string> = {};
  const candidateShortName: Record<number, string> = {};
  for (const c of payload.candidatos) {
    candidateColor[c.id] = c.cor;
    candidateShortName[c.id] = c.nome.split(" ")[0] ?? c.nome;
  }

  const municipioRows = toMunicipioRows(payload.municipios, candidateColor, candidateShortName);

  // Adapta candidatos UF → EdgeCandidate-like pra <MunicipioWaffleGrid> /
  // <RaceStatsCards>. Como faltam alguns campos (`p_vitoria`, `rank`,
  // `p_passa_2t`, `p_fecha_1t`), preenchemos com defaults seguros.
  const candidatosForGrid = payload.candidatos.map((c, i) => ({
    id: c.id,
    nome: c.nome,
    partido: c.partido,
    cor: c.cor,
    votos_atuais: c.votos_atuais,
    votos_projetados: c.votos_projetados,
    pct_atual: c.pct_atual,
    pct_projetado: c.pct_projetado,
    pct_projetado_lower: c.ci95.lower,
    pct_projetado_upper: c.ci95.upper,
    p_vitoria: 0,
    rank: i + 1,
    p_passa_2t: 0,
    p_fecha_1t: 0,
  }));

  const mesorregioes = payload.mesorregioes ?? [];
  const modelTier = readModelFallbackTier(payload);
  const k1Disclaimer = modelTier != null && modelTier >= 2;

  return (
    <main className="mx-auto flex min-h-screen max-w-[1280px] flex-col gap-6 px-5 py-6">
      <UFBreadcrumb href="/governador" label="‹ Voltar à lista de governadores" />

      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-3xl leading-tight" style={{ fontFamily: "var(--font-serif)" }}>
          Governador {sigla} — Apuração 2026
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <LiveBadge active={payload.pct_apurado > 0 && payload.pct_apurado < 100} />
          <TurnoBadge turno={payload.turno} />
        </div>
      </header>

      {/* K-1 disclaimer (ADR-0015 + constituição § 8) — banner sobre o hero
          quando bloco político não tem mapping 2022 confiável. */}
      {k1Disclaimer && (
        <aside
          role="note"
          aria-label="Aviso sobre o modelo"
          className="rounded-md border px-4 py-3 text-sm"
          style={{
            borderColor: "var(--color-warning, #b45309)",
            backgroundColor: "var(--color-bg-muted)",
            color: "var(--color-text)",
          }}
        >
          <strong>Modelagem com prior limitado.</strong>{" "}
          {modelTier === 3
            ? "Bloco político sem mapeamento histórico em 2022 — exibimos apenas o parcial atual sem projeção."
            : "Bloco político com mapeamento parcial em 2022 — projeção usa pesquisa pré-eleitoral como prior, intervalos podem ser mais largos."}
        </aside>
      )}

      {/* WinnerBanner — Open question 005 resolved: K-1 tier 3 (sem prior)
          ainda pode mostrar "ELEITO" se chamada factual atingida (>=99%
          apurado). p_vitoria fica unreliable em tier 3 mas o sinal de
          apuração é factual. */}
      {lider && pVitoriaLider >= 0.95 && (
        <WinnerBanner
          candidato={lider.nome}
          partido={lider.partido}
          ufSigla={sigla}
          cor={lider.cor}
          rank={rankFromColorVar(lider.cor)}
        />
      )}

      {/* Grid superior: tabela de candidatos | mapa de municípios */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section aria-labelledby="candidates-heading" className="flex flex-col gap-1">
          <h2
            id="candidates-heading"
            className="mb-1 text-lg"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Candidatos a governador
          </h2>
          {sortedCandidatos.map((c) => (
            <CandidateRow
              key={c.id}
              nome={c.nome}
              partido={c.partido}
              cor={c.cor}
              votos={c.votos_atuais ?? null}
              pct={c.pct_projetado}
            />
          ))}
          <p className="mt-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
            {payload.pct_apurado.toFixed(1)}% apurado em {sigla}
          </p>
        </section>

        <section aria-labelledby="leader-map-heading" className="flex flex-col gap-2">
          <h2
            id="leader-map-heading"
            className="text-lg"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Mapa de municípios — líder
          </h2>
          <UfLeaderMapLazy
            ufSigla={sigla}
            choropleth={payload.municipios.map((m) => ({
              cod_ibge: m.cod_ibge,
              cor: candidateColor[m.lider.candidato_id] ?? "var(--color-tossup)",
              pctApurado: m.pct_apurado,
            }))}
            height={320}
          />
        </section>
      </div>

      <InsightCard frases={[]} variant="uf" />

      {/* Mapas duo (líder + bolhas) */}
      <UfMapDuoLazy
        ufSigla={sigla}
        bubbles={payload.municipios.map((m) => ({
          cod_ibge: m.cod_ibge,
          nome: m.nome,
          centro: [0, 0] as [number, number],
          votos: m.lider.votos,
          lider: m.lider.candidato_id,
          liderCor: candidateColor[m.lider.candidato_id] ?? "var(--color-tossup)",
        }))}
        choropleth={payload.municipios.map((m) => ({
          cod_ibge: m.cod_ibge,
          cor: candidateColor[m.lider.candidato_id] ?? "var(--color-tossup)",
          pctApurado: m.pct_apurado,
        }))}
        height={320}
      />

      {/* Print 3 NYT — waffle dos municípios. Cada quadrado = 1 município. */}
      {payload.municipios.length > 0 && (
        <section aria-labelledby="waffle-heading" className="flex flex-col gap-2">
          <h3 id="waffle-heading" className="text-lg" style={{ fontFamily: "var(--font-serif)" }}>
            Cada quadrado é um município
          </h3>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Mosaico de {payload.municipios.length.toLocaleString("pt-BR")} municípios — cor pelo
            líder.
          </p>
          <MunicipioWaffleGrid
            municipios={payload.municipios}
            candidatos={candidatosForGrid}
            cell={12}
            gap={2}
          />
        </section>
      )}

      {/* Apuração por mesorregião — degrade gracioso (Fase 2): só renderiza
          se orchestrator anexou `mesorregioes`. */}
      {mesorregioes.length > 0 && (
        <section aria-labelledby="meso-heading" className="flex flex-col gap-2">
          <h3 id="meso-heading" className="text-lg" style={{ fontFamily: "var(--font-serif)" }}>
            Apuração por mesorregião
          </h3>
          <table className="w-full border-collapse" data-testid="mesorregioes-table">
            <thead
              style={{
                backgroundColor: "var(--color-bg-muted)",
                color: "var(--color-text-muted)",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <tr>
                <th
                  scope="col"
                  className="px-3 py-2 text-left text-xs uppercase tracking-wide font-normal"
                >
                  Mesorregião
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-xs uppercase tracking-wide font-normal"
                >
                  % apurado
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-left text-xs uppercase tracking-wide font-normal"
                >
                  Líder
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-xs uppercase tracking-wide font-normal"
                >
                  Margem
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-xs uppercase tracking-wide font-normal"
                >
                  Δ vs 2022
                </th>
              </tr>
            </thead>
            <tbody>
              {mesorregioes.map((meso) => {
                const liderMeso = candidatosForGrid.find((c) => c.id === meso.lider_candidato_id);
                const delta = meso.delta_vs_2022;
                const deltaLabel =
                  delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}pp`;
                return (
                  <tr
                    key={meso.cod}
                    style={{ borderBottom: "1px solid var(--color-border)" }}
                    data-cod={meso.cod}
                  >
                    <td className="px-3 py-2 text-sm" style={{ color: "var(--color-text)" }}>
                      {meso.nome}
                    </td>
                    <td
                      className="px-3 py-2 text-right text-sm tabular-nums"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {meso.pct_apurado.toFixed(1)}%
                    </td>
                    <td
                      className="px-3 py-2 text-sm"
                      style={{ color: liderMeso?.cor ?? "var(--color-text)", fontWeight: 500 }}
                    >
                      {liderMeso?.nome ?? `Cand ${meso.lider_candidato_id}`}{" "}
                      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                        ({liderMeso?.partido ?? "?"})
                      </span>
                    </td>
                    <td
                      className="px-3 py-2 text-right text-sm tabular-nums"
                      style={{ color: "var(--color-text)" }}
                    >
                      +{meso.margem.toFixed(1)}pp
                    </td>
                    <td
                      className="px-3 py-2 text-right text-sm tabular-nums"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {deltaLabel}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Maiores municípios — Print 3 NYT (S06 refator de MunicipioTable). */}
      {municipioRows.length > 0 && (
        <MunicipioTable rows={municipioRows} mode="top-by-eleitorado" topN={15} />
      )}

      {/* Agulha + margem */}
      {lider && segundo && (
        <section
          aria-labelledby="state-needle-heading"
          className="flex flex-col items-center gap-2"
        >
          <h3
            id="state-needle-heading"
            className="text-lg"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Forecast ao vivo — Governador {sigla}
          </h3>
          <Needle
            needlePosition={payload.needle_position}
            needleBand={payload.needle_band}
            pVitoria={pVitoriaLider}
            candidatoA={lider.nome}
            candidatoB={segundo.nome}
            variant="uf"
          />
          <p className="text-sm tabular-nums" style={{ color: "var(--color-text-muted)" }}>
            Margem estimada: {lider.nome.split(" ")[0]} +
            {(lider.pct_projetado - segundo.pct_projetado).toFixed(1)}pp (CI95{" "}
            {lider.ci95.lower.toFixed(1)} – {lider.ci95.upper.toFixed(1)})
          </p>
        </section>
      )}

      {/* Charts — séries temporais */}
      <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-2">
          <h4
            className="text-sm uppercase tracking-wide"
            style={{ color: "var(--color-text-muted)" }}
          >
            Margem ao longo do tempo
          </h4>
          <TimeSeriesChart
            points={(payload.series_temporais?.margem ?? []).map((pt) => ({
              ts: pt.ts,
              margemPp: pt.margem_pp,
            }))}
            liderNome={lider?.nome ?? "Líder"}
            liderCor={lider?.cor ?? "var(--color-text)"}
          />
        </div>
        <div className="flex flex-col gap-2">
          <h4
            className="text-sm uppercase tracking-wide"
            style={{ color: "var(--color-text-muted)" }}
          >
            Probabilidade ao longo do tempo
          </h4>
          <ProbabilityOverTime
            points={(payload.series_temporais?.p_vitoria ?? []).map((pt) => ({
              ts: pt.ts,
              pVitoria: pt.p,
            }))}
            liderNome={lider?.nome ?? "Líder"}
            liderCor={lider?.cor ?? "var(--color-text)"}
          />
        </div>
        <div className="flex flex-col gap-2">
          <h4
            className="text-sm uppercase tracking-wide"
            style={{ color: "var(--color-text-muted)" }}
          >
            Turnout cumulativo
          </h4>
          <TurnoutAreaChart
            points={(payload.series_temporais?.turnout ?? []).map((pt) => ({
              ts: pt.ts,
              pctApurado: pt.pct_apurado,
            }))}
          />
        </div>
      </section>

      <ForecastTransparency pctApurado={payload.pct_apurado} variant="uf" />

      <Footer />
    </main>
  );
}
