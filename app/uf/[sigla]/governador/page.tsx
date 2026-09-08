/**
 * app/uf/[sigla]/governador/page.tsx — Spec 005 (Página de UF Governador, T-04)
 *
 * Server Component. `generateStaticParams` lista as 27 UFs.
 *
 * Herda ~70% da `app/uf/[sigla]/page.tsx` (presidencial) mas com cargo=gov.
 * Dos 3 blocos NYT-style decididos no kickoff S06, nenhum sobreviveu:
 *
 *   1. (removido em S07/Fase 5) K-1 disclaimer — ver ADR-0021, que supersede
 *      o ADR-0015: sem 2022 no cálculo, não há "prior limitado" a declarar.
 *   2. (removido em 2026-09-08) `<MunicipioWaffleGrid>` — Print 3 NYT
 *      (1 quadrado = 1 município). Não existe no protótipo do kit.
 *   3. (removido em 2026-09-08) Bloco "Apuração por mesorregião" — também sem
 *      contraparte no protótipo. `payload.mesorregioes` segue no schema, sem
 *      consumidor nesta rota.
 *
 * Os municípios (e as séries) chegam pelo Vercel Blob desde o ADR-0032, em
 * `readUfDetail` disparado EM PARALELO com `readUfProjection` — dois read
 * paths que falham de forma independente, com degradação por seção
 * (`<DetailUnavailable>`, sempre no DOM — ADR-0017).
 *
 * Cobertura (após os cortes de 2026-09-08)
 *   - RF-031 (breadcrumb), RF-032 (winner banner), RF-033 (candidate rows),
 *     RF-034 (choropleth UF), RF-037 (municipios table),
 *     RF-043 (forecast transparency).
 *   - DEIXARAM de ter implementação aqui: RF-035/036 (mapas duo), RF-039
 *     (agulha), RF-040/041/042 (séries), RF-044 (insight). A spec 005
 *     regride — sincronização de traceability/status é tarefa separada.
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
 *
 * Novo nesta rota: `<MunicipioExplorer>`, que costura a tabela ao `<Sheet>` —
 * tocar num município abre a folha dele.
 *
 * ===== 2026-09-08 — a rota passa a seguir o protótipo do kit =====
 * Decisão do usuário: corta-se desta página tudo que não está em
 * `docs/design-system/atlas-menna/ui_kits/atlas-menna/App.jsx`. Saíram:
 * `<ChancesPanel>` (no protótipo é NACIONAL — migrou para `app/page.tsx`),
 * `<InsightCard>`, o `<Panel>` "Volume e estimativa" (`UfMapDuoLazy`), a
 * grade de quadrados (`waffleCandidatos` → `<MunicipioWaffleGrid>`), o
 * `<Panel>` "Regiões" (mesorregiões), o `<Panel>` "Forecast" (`<Needle>`) e o
 * `<Panel>` "Ao longo da noite" (os três charts).
 *
 * Duas exceções que NÃO são cortadas apesar de não estarem no protótipo:
 * `<ForecastTransparency>` (constituição § 8 — toda página com projeção) e
 * `<Footer>` (constituição § 1 — "Não oficial. Fonte: TSE.").
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
import { Figure } from "@/components/atoms/data/Figure";
import { TrilhaKicker } from "@/components/atoms/nav/TrilhaKicker";
import { UFBreadcrumb } from "@/components/atoms/nav/UFBreadcrumb";
import { DetailFreshness, DetailUnavailable } from "@/components/atoms/surfaces/DetailUnavailable";
import { Panel } from "@/components/atoms/surfaces/Panel";
import { CandidateResultRow } from "@/components/atoms/tables/CandidateResultRow";
import { ForecastTransparency } from "@/components/blocks/ForecastTransparency";
import { MunicipioExplorer } from "@/components/blocks/MunicipioExplorer";
import type { MunicipioRow } from "@/components/blocks/MunicipioTable";
import { ProjectionThermometers } from "@/components/blocks/ProjectionThermometers";
import { UfLeaderMapLazy } from "@/components/blocks/UfMapsLazy";
import { Footer } from "@/components/layout/Footer";
import { municipiosFrom, readUfDetail, type UfDetailResult } from "@/lib/blob/uf-detail";
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
  };
}

/**
 * Motivo do estado "detalhe indisponível" da seção de municípios, ou `null`
 * quando há detalhe. Espelha a função homônima da rota presidencial: fonte que
 * não respondeu (`result.reason`) e detalhe vazio (`"empty"`) são notícias
 * diferentes, e nenhuma das duas esconde o bloco (ADR-0032 item 3 / ADR-0017).
 */
function municipioDetailReason(
  result: UfDetailResult,
  quantidade: number,
): "not_configured" | "not_found" | "fetch_error" | "invalid" | "empty" | null {
  if (result.status !== "ok") return result.reason;
  return quantidade === 0 ? "empty" : null;
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

  // Os DOIS read paths, em paralelo (ADR-0032 item 3): resumo no Global Config,
  // detalhe municipal + séries no Vercel Blob. Nunca em série — a página não
  // espera o Blob para renderizar o resumo, e os dois falham independentemente.
  //
  // cargo=gov, turno=1 default (orchestrator alterna pra turno=2 via chave
  // dinâmica em S07). Os mesmos qualificadores nomeiam a chave do Global Config
  // e o caminho do Blob.
  const [payloadDoStore, detalhe] = await Promise.all([
    readUfProjection(sigla, { cargo: "gov", turno: 1 }),
    readUfDetail(sigla, { cargo: "gov", turno: 1 }),
  ]);
  let payload = payloadDoStore;

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
  const pVitoriaLider = leaderProbability(payload.needle_position);

  const candidateColor: Record<number, string> = {};
  const candidateShortName: Record<number, string> = {};
  for (const c of payload.candidatos) {
    candidateColor[c.id] = c.cor;
    candidateShortName[c.id] = c.nome.split(" ")[0] ?? c.nome;
  }

  // Detalhe do Blob. Coalesce para vazio; o estado explícito é decidido abaixo.
  const municipios = municipiosFrom(detalhe);
  const municipioReason = municipioDetailReason(detalhe, municipios.length);

  const municipioRows = toMunicipioRows(municipios, candidateColor, candidateShortName);

  // Mesma regra de dispatch da home e da UF presidencial (S07/Fase 2).
  const mode: "binary" | "multi-1t" =
    payload.turno === 2 || payload.candidatos.length === 2 ? "binary" : "multi-1t";

  const choropleth = municipios.map((m) => ({
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
          {/* O coroplético é alimentado pelo Blob (ADR-0032). Sem detalhe ele
              desenha o contorno da UF sem nenhuma feição colorida — o que, sem
              este aviso, o leitor interpretaria como "ninguém apurou ainda".
              Fica ABAIXO do mapa para não empurrar a primeira dobra
              (ADR-0029 § 1), mas está no DOM em todos os casos. */}
          {municipioReason !== null && (
            <DetailUnavailable
              label="A cor por município deste mapa"
              reason={municipioReason}
              style={{ borderTop: "none", paddingTop: 0 }}
            />
          )}
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

      {/* Seção 3 — maiores municípios, ligados à folha do município
          (`<Sheet>`). É o `BiggestPanel` do protótipo (`App.jsx:353`).

          A grade de quadrados (`<MunicipioWaffleGrid>` via `waffleCandidatos`)
          saiu em 2026-09-08: não existe no protótipo. A tabela permanece — e
          era ela, não a grade, o caminho acessível para abrir cada município.

          O `<Panel>` não some quando não há município: a fonte é o Vercel Blob
          (ADR-0032), que falha independentemente do resumo, e um bloco ausente
          diria "não existe" onde a verdade é "não chegou". */}
      <Panel kicker="Municípios" title="Maiores colégios eleitorais" titleId="municipios-heading">
        {municipioReason === null ? (
          <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
            {detalhe.status === "ok" && (
              <DetailFreshness ts={detalhe.detail.ts} resumoTs={payload.ts} />
            )}
            <MunicipioExplorer
              ufSigla={sigla}
              municipios={municipios}
              rows={municipioRows}
              candidatos={payload.candidatos}
              tableMode="top-by-eleitorado"
              topN={15}
            />
          </div>
        ) : (
          <DetailUnavailable label="O detalhe por município" reason={municipioReason} />
        )}
      </Panel>

      {/* Seção 4 — transparência metodológica (RF-043). Constituição § 8
          exige o bloco em toda página com projeção — fica mesmo não estando
          no protótipo. */}
      <Panel kicker="Metodologia">
        <ForecastTransparency pctApurado={payload.pct_apurado} variant="uf" />
      </Panel>

      <Footer />
    </main>
  );
}
