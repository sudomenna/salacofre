/**
 * app/uf/[sigla]/governador/page.tsx — Spec 005 (Página de UF Governador, T-04)
 *
 * Server Component. `generateStaticParams` lista as 27 UFs.
 *
 * Herda ~70% da `app/uf/[sigla]/page.tsx` (presidencial) mas com cargo=gov,
 * adicionando 3 blocos NYT-style decididos no kickoff S06:
 *
 *   1. (removido em S07/Fase 5) K-1 disclaimer — ver ADR-0021, que supersede
 *      o ADR-0015: sem 2022 no cálculo, não há "prior limitado" a declarar.
 *   2. `<MunicipioWaffleGrid>` — Print 3 NYT (1 quadrado = 1 município).
 *   3. Bloco "Apuração por mesorregião" — só renderiza se `mesorregioes?`
 *      vier populado (degrade gracioso conforme Fase 2 — IBGE seed pode
 *      estar pendente).
 *
 * Cobertura
 *   - RFs 031–044 (idênticos à spec 004 — Open question 005 resolvida:
 *     página existe mesmo sem mapping 2022 — que, desde o ADR-0021, deixou
 *     de ser um caso especial: a projeção não consulta 2022).
 *   - ADR-0001/0010/0012/0013/0017/0021.
 *   - Constituição § 2 (cores via tokens, paleta multi-partido),
 *     § 3 (degrade gracioso), § 8 (transparência metodológica).
 *
 * S07/Fase 2
 *   - Dispatch de modo (`binary` | `multi-1t`) com a mesma regra da home;
 *     em `multi-1t` os seis termômetros (ADR-0018) abrem a projeção.
 *   - Trilha governador: `<main data-trilha="gov">`, kicker "GOVERNADOR · <UF>"
 *     e breadcrumb "Governadores › <UF>" (ADR-0019 — a trilha de governador
 *     não tem nó nacional).
 *
 * ===== S07/Bloco 2 — mapa primeiro (ADR-0029) =====
 * Mesma recomposição da home e da rota presidencial de UF, item a item:
 * mapa como primeiro conteúdo com altura de hero; `<h1>` pequeno dentro do
 * painel de resultado (alternando "Resultado parcial" / "Projeção Atlas
 * Menna" por cascata); linhas de candidato em `<CandidateResultRow>` com
 * parcial e projeção lado a lado (ADR-0029 § 7); cada seção num `<Panel>`.
 * **Nenhum bloco RF-bound saiu** — waffle, mesorregiões, maiores municípios,
 * agulha, séries e transparência continuam todos aqui, em `<Panel>`.
 *
 * Novo nesta rota: `<MunicipioExplorer>`, que costura a grade de quadrados e
 * a tabela ao `<Sheet>` — tocar num município abre a folha dele.
 *
 * A rota é pré-renderizada estática (27 UFs): nada aqui pode ler
 * `searchParams`, `cookies()` ou `headers()`.
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
import { Figure } from "@/components/atoms/data/Figure";
import { TrilhaKicker } from "@/components/atoms/nav/TrilhaKicker";
import { UFBreadcrumb } from "@/components/atoms/nav/UFBreadcrumb";
import { Needle } from "@/components/atoms/needle/Needle";
import { Panel } from "@/components/atoms/surfaces/Panel";
import { CandidateResultRow } from "@/components/atoms/tables/CandidateResultRow";
import { ChancesPanel } from "@/components/blocks/ChancesPanel";
import { ForecastTransparency } from "@/components/blocks/ForecastTransparency";
import { InsightCard } from "@/components/blocks/InsightCard";
import { MunicipioExplorer } from "@/components/blocks/MunicipioExplorer";
import type { MunicipioRow } from "@/components/blocks/MunicipioTable";
import { ProjectionThermometers } from "@/components/blocks/ProjectionThermometers";
import { UfLeaderMapLazy, UfMapDuoLazy } from "@/components/blocks/UfMapsLazy";
import { Footer } from "@/components/layout/Footer";
import { readUfProjection } from "@/lib/edge-config/reader";
import type {
  EdgePayload,
  EdgePayloadUf,
  EdgeUfCandidate,
  EdgeUfMunicipio,
} from "@/lib/edge-config/types";
import { rankFromColorVar } from "@/lib/utils/cand-color";
import { formatPercent, formatTimeHMS } from "@/lib/utils/format";
import govFixture from "@/tests/fixtures/edge-config/gov-current.json" with { type: "json" };

export const revalidate = 60;

/** Altura do mapa hero (ADR-0029 § 1). `ChoroplethMapUF.height` é `number`. */
const HERO_MAP_HEIGHT = 440;

/** Título do painel de resultado — e o `<h1>` da página (ADR-0029 § 5). */
function ResultTitle({ sigla }: { sigla: string }) {
  return (
    <>
      <span data-view-only="parcial">Governador {sigla} — Resultado parcial</span>
      <span data-view-only="proj">Governador {sigla} — Projeção Atlas Menna</span>
    </>
  );
}

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
 * Sintetiza um `EdgePayloadUf` de governador a partir da fixture nacional de
 * gov — espelho de `synthesizeUfFromNational` na rota presidencial. Só roda
 * fora de produção e só quando o reader devolve null (dev/preview sem
 * `EDGE_CONFIG`), para a página renderizar completa em `pnpm dev`.
 */
function synthesizeGovUfFromFixture(sigla: string): EdgePayloadUf | null {
  const fixture = govFixture as unknown as EdgePayload;
  const row = fixture.por_uf.find((u) => u.sigla === sigla);
  if (!row) return null;

  const ids = new Set((row.top_candidatos ?? []).map((t) => t.id));
  const candidatos: EdgeUfCandidate[] = fixture.national.candidatos
    .filter((c) => ids.has(c.id))
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      partido: c.partido,
      cor: c.cor,
      votos_atuais: c.votos_atuais,
      votos_projetados: c.votos_projetados,
      pct_atual: c.pct_atual,
      pct_projetado: c.pct_projetado,
      ci95: { lower: c.pct_projetado_lower, upper: c.pct_projetado_upper },
    }));
  if (candidatos.length === 0) return null;

  return {
    uf: sigla,
    ts: fixture.ts,
    cargo: 3,
    turno: fixture.turno,
    pct_apurado: row.pct_apurado,
    candidatos,
    // Dev-only: a participação nacional da fixture serve de stand-in; em
    // produção o payload da UF traz o bloco das zonas da própria UF.
    participacao: fixture.national.participacao,
    needle_position: 0.3,
    needle_band: "lean_a",
    municipios: [],
    series_temporais: { margem: [], p_vitoria: [], turnout: [] },
  };
}

/** Breadcrumb da trilha governador — sem nó nacional (ADR-0019). */
function govBreadcrumb(sigla: string) {
  return (
    <UFBreadcrumb
      trilha="gov"
      items={[{ label: "Governadores", href: "/governador" }, { label: sigla }]}
    />
  );
}

export default async function UFGovernadorPage({ params }: UFGovernadorPageProps) {
  const { sigla: raw } = await params;
  const sigla = raw.toUpperCase();

  if (!UFS_BRASIL.includes(sigla as (typeof UFS_BRASIL)[number])) {
    notFound();
  }

  // Leitura específica: cargo=gov, turno=1 default (orchestrator alterna
  // pra turno=2 via chave dinâmica em S07).
  let payload = await readUfProjection(sigla, { cargo: "gov", turno: 1 });

  // Só em `pnpm dev`: em teste (NODE_ENV=test) e em produção o caminho
  // "Aguardando dados" continua sendo exercitado de verdade.
  if (!payload && process.env.NODE_ENV === "development") {
    payload = synthesizeGovUfFromFixture(sigla);
  }

  if (!payload) {
    return (
      <main data-trilha="gov" className="mx-auto flex min-h-screen max-w-page flex-col px-5 py-6">
        {govBreadcrumb(sigla)}
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

  // Mesma regra de dispatch da home e da UF presidencial (S07/Fase 2).
  const mode: "binary" | "multi-1t" =
    payload.turno === 2 || payload.candidatos.length === 2 ? "binary" : "multi-1t";

  const mesorregioes = payload.mesorregioes ?? [];

  const choropleth = payload.municipios.map((m) => ({
    cod_ibge: m.cod_ibge,
    cor: candidateColor[m.lider.candidato_id] ?? "var(--color-tossup)",
    pctApurado: m.pct_apurado,
  }));

  return (
    <main
      data-trilha="gov"
      className="mx-auto flex min-h-screen max-w-page flex-col px-4 py-6 md:px-6 md:py-10"
      style={{ gap: "var(--space-8)" }}
    >
      {/* "Onde estou", com links reais — acima do mapa (ADR-0029 § 1). */}
      {govBreadcrumb(sigla)}

      {/* Seção 1 — o MAPA. Primeiro conteúdo da página, altura de hero. */}
      <Panel rule="none">
        <section
          aria-labelledby="leader-map-heading"
          className="flex flex-col"
          style={{ gap: "var(--space-2)" }}
        >
          <h2
            id="leader-map-heading"
            style={{
              margin: 0,
              font: "var(--type-kicker)",
              letterSpacing: "var(--tracking-caps)",
              textTransform: "uppercase",
              color: "var(--text-secondary)",
            }}
          >
            {sigla} · quem lidera cada município
          </h2>
          <UfLeaderMapLazy ufSigla={sigla} choropleth={choropleth} height={HERO_MAP_HEIGHT} />
        </section>
      </Panel>

      {/* O disclaimer de K-1 (ADR-0015) foi REMOVIDO em S07/Fase 5. O ADR-0021
          supersede o ADR-0015: a projeção não usa mais 2022 como insumo, então
          não existe "bloco político sem mapeamento histórico" — o caminho de
          código que alimentava esse banner é morto desde a Fase 1. Manter o
          texto seria descrever ao leitor um modelo que não roda (constituição
          § 8 v1.2). `model_fallback_tier` segue no schema como @deprecated,
          sem consumidor. */}

      {/* WinnerBanner — a chamada é factual (>=99% apurado), independente da
          confiança do modelo. Fora de `<Panel>`: se auto-anula. */}
      {lider && pVitoriaLider >= 0.95 && (
        <WinnerBanner
          candidato={lider.nome}
          partido={lider.partido}
          ufSigla={sigla}
          cor={lider.cor}
          rank={rankFromColorVar(lider.cor)}
        />
      )}

      {/* ADR-0019 — kicker de trilha acima do `<h1>`. `crumbs={[sigla]}`
          mesmo com breadcrumb presente: os textos não coincidem 1:1
          ("GOVERNADOR · SP" vs. "Governadores › SP"), e um teste de
          integração fixa esse comportamento. */}
      <TrilhaKicker trilha="gov" crumbs={[sigla]} className="-mb-4" />

      {/* Seção 2 — a projeção. */}
      <Panel
        rule="none"
        kicker="Projeção Atlas Menna · não oficial"
        title={<ResultTitle sigla={sigla} />}
        titleId="resultado-heading"
        headingLevel={1}
        action={<TurnoBadge turno={payload.turno} />}
      >
        <div className="flex flex-col" style={{ gap: "var(--space-6)" }}>
          <div className="grid grid-cols-2" style={{ gap: "var(--space-6)" }}>
            <Figure label="Apurado" value={formatPercent(payload.pct_apurado, 1)} size="md" />
            <Figure label="Última atualização" value={formatTimeHMS(payload.ts)} size="md" />
          </div>

          {/* Hero 1T — seis termômetros (ADR-0018). Em 2T (mode binary) a
              corrida é literalmente binária e este bloco sai. */}
          {mode === "multi-1t" && (
            <ProjectionThermometers
              candidatos={sortedCandidatos}
              participacao={payload.participacao}
              heading={`Projeção do 1º turno — Governador ${sigla}`}
            />
          )}

          {/* Linhas de candidato no formato do ADR-0029 § 7. */}
          <section
            aria-labelledby="candidates-heading"
            className="flex flex-col"
            style={{
              gap: "var(--space-2)",
              borderTop: "1px solid var(--border-hairline)",
              paddingTop: "var(--space-4)",
            }}
          >
            <h2
              id="candidates-heading"
              style={{
                margin: 0,
                font: "var(--type-kicker)",
                letterSpacing: "var(--tracking-caps)",
                textTransform: "uppercase",
                color: "var(--text-secondary)",
              }}
            >
              Candidatos a governador
            </h2>
            <div>
              {sortedCandidatos.map((c, i) => (
                <CandidateResultRow
                  key={c.id}
                  rank={i + 1}
                  nome={c.nome}
                  partido={c.partido}
                  cor={c.cor}
                  pctAtual={c.pct_atual}
                  pctProjetado={c.pct_projetado}
                  votos={c.votos_atuais ?? null}
                />
              ))}
            </div>
          </section>
        </div>
      </Panel>

      {/* Seção 3 — chances. Ver o cabeçalho de `ChancesPanel`: o payload de UF
          não traz `p_fecha_1t`, então o medidor sai da probabilidade do líder
          derivada de `needle_position` — a mesma da agulha. */}
      {lider && (
        <ChancesPanel
          liderNome={lider.nome}
          liderPVitoria={pVitoriaLider}
          liderPctProjetado={lider.pct_projetado}
          pctApurado={payload.pct_apurado}
          escopo={sigla}
        />
      )}

      {/* `frases=[]` → o bloco retorna null; por isso fica fora de `<Panel>`. */}
      <InsightCard frases={[]} variant="uf" />

      {/* Seção 4 — mapas duo (líder + bolhas). */}
      <Panel kicker="Volume e estimativa">
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
          choropleth={choropleth}
          height={320}
        />
      </Panel>

      {/* Seção 5 — Print 3 NYT: waffle + maiores municípios, os dois ligados à
          folha do município (`<Sheet>`). Cada quadrado = 1 município. */}
      {payload.municipios.length > 0 && (
        <Panel kicker="Municípios" title="Cada quadrado é um município" titleId="waffle-heading">
          <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
            <p style={{ margin: 0, font: "var(--type-data)", color: "var(--text-muted)" }}>
              Mosaico de {payload.municipios.length.toLocaleString("pt-BR")} municípios — cor pelo
              líder. Toque num município para ver os números dele.
            </p>
            <MunicipioExplorer
              ufSigla={sigla}
              municipios={payload.municipios}
              rows={municipioRows}
              candidatos={payload.candidatos}
              waffleCandidatos={candidatosForGrid}
              tableMode="top-by-eleitorado"
              topN={15}
            />
          </div>
        </Panel>
      )}

      {/* Seção 6 — apuração por mesorregião. Degrade gracioso (Fase 2): só
          renderiza se o orchestrator anexou `mesorregioes`. */}
      {mesorregioes.length > 0 && (
        <Panel kicker="Regiões" title="Apuração por mesorregião" titleId="meso-heading">
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
        </Panel>
      )}

      {/* Seção 7 — agulha + margem estimada. */}
      {lider && segundo && (
        <Panel
          kicker="Forecast"
          title={`Forecast ao vivo — Governador ${sigla}`}
          titleId="state-needle-heading"
        >
          <div className="flex flex-col items-center" style={{ gap: "var(--space-2)" }}>
            <Needle
              needlePosition={payload.needle_position}
              needleBand={payload.needle_band}
              pVitoria={pVitoriaLider}
              candidatoA={lider.nome}
              candidatoB={segundo.nome}
              variant="uf"
            />
            <p
              className="tabular-nums"
              style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}
            >
              Margem estimada: {lider.nome.split(" ")[0]} +
              {(lider.pct_projetado - segundo.pct_projetado).toFixed(1)}pp (CI95{" "}
              {lider.ci95.lower.toFixed(1)} – {lider.ci95.upper.toFixed(1)})
            </p>
          </div>
        </Panel>
      )}

      {/* Seção 8 — séries temporais. */}
      <Panel kicker="Ao longo da noite">
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          style={{ gap: "var(--space-6)" }}
        >
          <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
            <h3
              style={{
                margin: 0,
                font: "var(--type-kicker)",
                letterSpacing: "var(--tracking-caps)",
                textTransform: "uppercase",
                color: "var(--text-secondary)",
              }}
            >
              Margem ao longo do tempo
            </h3>
            <TimeSeriesChart
              points={(payload.series_temporais?.margem ?? []).map((pt) => ({
                ts: pt.ts,
                margemPp: pt.margem_pp,
              }))}
              liderNome={lider?.nome ?? "Líder"}
              liderCor={lider?.cor ?? "var(--color-text)"}
            />
          </div>
          <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
            <h3
              style={{
                margin: 0,
                font: "var(--type-kicker)",
                letterSpacing: "var(--tracking-caps)",
                textTransform: "uppercase",
                color: "var(--text-secondary)",
              }}
            >
              Probabilidade ao longo do tempo
            </h3>
            <ProbabilityOverTime
              points={(payload.series_temporais?.p_vitoria ?? []).map((pt) => ({
                ts: pt.ts,
                pVitoria: pt.p,
              }))}
              liderNome={lider?.nome ?? "Líder"}
              liderCor={lider?.cor ?? "var(--color-text)"}
            />
          </div>
          <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
            <h3
              style={{
                margin: 0,
                font: "var(--type-kicker)",
                letterSpacing: "var(--tracking-caps)",
                textTransform: "uppercase",
                color: "var(--text-secondary)",
              }}
            >
              Turnout cumulativo
            </h3>
            <TurnoutAreaChart
              points={(payload.series_temporais?.turnout ?? []).map((pt) => ({
                ts: pt.ts,
                pctApurado: pt.pct_apurado,
              }))}
            />
          </div>
        </div>
      </Panel>

      {/* Seção 9 — transparência metodológica (RF-043). */}
      <Panel kicker="Metodologia">
        <ForecastTransparency pctApurado={payload.pct_apurado} variant="uf" />
      </Panel>

      <Footer />
    </main>
  );
}
