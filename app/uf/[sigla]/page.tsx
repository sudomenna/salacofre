/**
 * app/uf/[sigla]/page.tsx — Spec 004 (Página de UF Presidencial)
 *
 * Server Component. `generateStaticParams` lista as 27 UFs (PR-IBGE).
 *
 * Pipeline:
 *   1. Lê `EdgePayloadUf` via `readUfProjection(sigla)` (ADR-0001 — Edge
 *      Config no read path).
 *   2. Identifica líder por `pct_projetado` desc (EdgePayloadUf não tem
 *      `candidato_a_id`/`candidato_b_id` ainda — flagado em tasks.md como
 *      risco/enhancement).
 *   3. Compõe a tela conforme wireframe da spec.
 *
 * Mapas: importados via `next/dynamic({ ssr: false })` (ADR-0010) para
 * manter o bundle above-the-fold <150KB (RNF-007a).
 *
 * Fallback: quando reader retorna `null` (pré-eleição / Edge Config vazio),
 * renderiza mensagem "Aguardando dados" — UX não quebra (constituição § 3).
 *
 * RFs cobertos:
 *   RF-031 (breadcrumb), RF-032 (winner banner), RF-033 (candidate rows),
 *   RF-034 (choropleth UF), RF-035 (bubble map), RF-036 (estimate map),
 *   RF-037 (municipios table), RF-038 (swing arrows), RF-039 (state needle),
 *   RF-040 (margem timeseries), RF-041 (prob timeseries),
 *   RF-042 (turnout area), RF-043 (forecast transparency),
 *   RF-044 (insight card).
 *
 * S07/Fase 2
 *   - Dispatch de modo idêntico ao da home: `binary` quando `turno === 2`
 *     ou há exatamente 2 candidatos; `multi-1t` caso contrário.
 *   - Em `multi-1t`, `<ProjectionThermometers />` (ADR-0018) abre a página,
 *     acima da lista de `<CandidateRow />` (o IC vem de `ci95`). Em binary
 *     nada muda.
 *   - Identidade da trilha presidencial: `<main data-trilha="pres">`,
 *     `<RaceHeader />` com kicker "PRESIDÊNCIA · Brasil › <UF>" e breadcrumb
 *     de profundidade real (ADR-0019).
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { NewsClippingPlaceholder } from "@/components/atoms/banners/NewsClippingPlaceholder";
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
import { ProjectionThermometers } from "@/components/blocks/ProjectionThermometers";
import { UfLeaderMapLazy, UfMapDuoLazy, UfSwingArrowMapLazy } from "@/components/blocks/UfMapsLazy";
import { Footer } from "@/components/layout/Footer";
import { RaceHeader } from "@/components/layout/RaceHeader";
import { readUfProjection } from "@/lib/edge-config/reader";
import type {
  EdgePayload,
  EdgePayloadUf,
  EdgeUfCandidate,
  EdgeUfMunicipio,
} from "@/lib/edge-config/types";
import { rankFromColorVar } from "@/lib/utils/cand-color";
import nationalFixture from "@/tests/fixtures/edge-config/projection-current.json" with {
  type: "json",
};

// Mapas isolados em `UfMapsLazy` (Client Component) que internamente faz
// `next/dynamic({ ssr: false })`. Mantém ADR-0010 (chunk separado) mesmo
// com Next 16 proibindo `ssr: false` em Server Components.

// 27 UFs IBGE. Inclui DF (carry-over S03 — DF estava ausente no payload nacional).
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

interface UFPageProps {
  params: Promise<{ sigla: string }>;
}

export async function generateMetadata({ params }: UFPageProps): Promise<Metadata> {
  const { sigla: raw } = await params;
  const sigla = raw.toUpperCase();
  const title = `${sigla} — Apuração Presidencial 2026 | SalaCofre`;
  const description = `Apuração presidencial 2026 em ${sigla}: projeção em tempo real, mapa de municípios, swing vs 2022.`;
  return {
    // RNF-027 — URL canônica /uf/<SIGLA>.
    alternates: { canonical: `/uf/${sigla}` },
    title,
    description,
    // RNF-028 — Meta/OG. Imagens dinâmicas (RF-051) ficam para spec 009;
    // aqui só textuais.
    openGraph: {
      title,
      description,
      type: "website",
      locale: "pt_BR",
      siteName: "SalaCofre",
      url: `/uf/${sigla}`,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

/**
 * Ordena candidatos por `pct_projetado` desc, tie-breaker por `id` asc.
 * Mesma convenção do nacional (carry-over F0.1 S04). Quando o EdgePayloadUf
 * for enriquecido com `candidato_a_id`/`candidato_b_id`, podemos pegar
 * direto do payload — por ora derivamos.
 */
function sortByLeader(candidatos: readonly EdgeUfCandidate[]): EdgeUfCandidate[] {
  return [...candidatos].sort((a, b) => {
    if (b.pct_projetado !== a.pct_projetado) return b.pct_projetado - a.pct_projetado;
    return a.id - b.id;
  });
}

/**
 * Computa probabilidade do líder a partir de `needle_position` em [-1, 1].
 *   probA = (position + 1) / 2  → líder favorito quando >= 0.5.
 * p_vitoria_lider = max(probA, 1 - probA).
 */
function leaderProbability(needlePosition: number): number {
  const probA = (needlePosition + 1) / 2;
  return Math.max(probA, 1 - probA);
}

/**
 * Sintetiza um `EdgePayloadUf` a partir do fixture nacional, espelhando a
 * lógica de `/api/projection?uf=`. Usado apenas quando o reader retorna
 * null E não há `EDGE_CONFIG` (dev/preview sem credencial). Em produção
 * com Edge Config configurado, esta função nunca é chamada.
 */
function synthesizeUfFromNational(sigla: string): EdgePayloadUf | null {
  const national = nationalFixture as unknown as EdgePayload;
  const row = national.por_uf.find((u) => u.sigla === sigla);
  if (!row) return null;
  return {
    uf: sigla,
    ts: national.ts,
    cargo: national.cargo,
    turno: national.turno,
    pct_apurado: row.pct_apurado,
    candidatos: national.national.candidatos.map((c) => ({
      id: c.id,
      nome: c.nome,
      partido: c.partido,
      cor: c.cor,
      votos_atuais: c.votos_atuais,
      votos_projetados: c.votos_projetados,
      pct_atual: c.pct_atual,
      pct_projetado: c.pct_projetado,
      ci95: { lower: c.pct_projetado_lower, upper: c.pct_projetado_upper },
    })),
    // Dev-only: reaproveita o bloco `participacao` nacional para que os
    // termômetros de brancos/nulos e abstenção rendam algo em `pnpm dev`
    // sem Edge Config. Em produção o payload da UF traz o bloco calculado
    // sobre as zonas da própria UF.
    participacao: national.national.participacao,
    needle_position: row.lider === national.national.candidato_a_id ? 0.4 : -0.4,
    needle_band: "lean_a",
    municipios: [],
    // S04/F2: campo opcional; em dev sem dados, séries vazias → charts
    // exibem placeholder gentil ("Série temporal ainda insuficiente").
    series_temporais: { margem: [], p_vitoria: [], turnout: [] },
  };
}

/**
 * Converte municípios do payload (EdgeUfMunicipio) em rows da tabela.
 * S04/F2: o payload agora inclui margem e votos_reportados por município.
 */
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

export default async function UFPage({ params }: UFPageProps) {
  const { sigla: raw } = await params;
  const sigla = raw.toUpperCase();

  if (!UFS_BRASIL.includes(sigla as (typeof UFS_BRASIL)[number])) {
    notFound();
  }

  let payload = await readUfProjection(sigla);

  // Dev fallback: quando o reader retorna `null` (chave UF ainda não publicada
  // OR sem EDGE_CONFIG), em desenvolvimento sintetiza a partir do fixture
  // nacional. Garante que `/uf/SP` renderiza em `pnpm dev` independente de
  // credencial Vercel — constituição § 3 (UX nunca quebra).
  //
  // Em produção (NODE_ENV=production), respeita o reader: null = sem payload
  // genuíno → renderiza "Aguardando dados".
  if (!payload && process.env.NODE_ENV !== "production") {
    payload = synthesizeUfFromNational(sigla);
  }

  // Pré-eleição absoluta OR Edge Config vazio. UX gentil (constituição § 3).
  if (!payload) {
    return (
      <main
        data-trilha="pres"
        className="mx-auto flex min-h-screen max-w-[1280px] flex-col px-5 py-6"
      >
        <UFBreadcrumb trilha="pres" items={[{ label: "Brasil", href: "/" }, { label: sigla }]} />
        <h1 className="mt-4 text-3xl" style={{ fontFamily: "var(--font-serif)" }}>
          {sigla} — Aguardando dados
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
          A projeção para esta UF começa quando o TSE divulgar os primeiros boletins.
        </p>
        <Footer />
      </main>
    );
  }

  const sortedCandidatos = sortByLeader(payload.candidatos);
  const lider = sortedCandidatos[0];
  const segundo = sortedCandidatos[1];
  const pVitoriaLider = leaderProbability(payload.needle_position);

  // Mesma regra da home (S07/Fase 2): 2T ou duelo → binary; 1T
  // multi-candidato → multi-1t (hero de termômetros, ADR-0018).
  const mode: "binary" | "multi-1t" =
    payload.turno === 2 || payload.candidatos.length === 2 ? "binary" : "multi-1t";

  // Maps de id → cor / nome curto para os componentes de mapa+tabela.
  const candidateColor: Record<number, string> = {};
  const candidateShortName: Record<number, string> = {};
  for (const c of payload.candidatos) {
    candidateColor[c.id] = c.cor;
    candidateShortName[c.id] = c.nome.split(" ")[0] ?? c.nome;
  }

  const municipioRows = toMunicipioRows(payload.municipios, candidateColor, candidateShortName);

  return (
    <main
      data-trilha="pres"
      className="mx-auto flex min-h-screen max-w-[1280px] flex-col gap-6 px-5 py-6"
    >
      <RaceHeader
        trilha="pres"
        crumbs={["Brasil", sigla]}
        titulo={`${sigla} — Apuração Presidencial 2026`}
        liveActive={payload.pct_apurado > 0 && payload.pct_apurado < 100}
        turno={payload.turno}
        breadcrumb={
          <UFBreadcrumb trilha="pres" items={[{ label: "Brasil", href: "/" }, { label: sigla }]} />
        }
      />

      {/* RF-032: Winner banner quando p_vitoria_lider >= 0.95.
          S06/F4d — em mode 2T (`payload.turno === 2`) o threshold continua
          válido; a UF "chama" o vencedor estadual da disputa 2T. */}
      {lider && pVitoriaLider >= 0.95 && (
        <WinnerBanner
          candidato={lider.nome}
          partido={lider.partido}
          ufSigla={sigla}
          cor={lider.cor}
          rank={rankFromColorVar(lider.cor)}
        />
      )}

      {/* Hero 1T — seis termômetros com o IC de `ci95` (ADR-0018). Em 2T
          (mode binary) o layout segue como em S04/S06, sem este bloco. */}
      {mode === "multi-1t" && (
        <ProjectionThermometers
          candidatos={sortedCandidatos}
          participacao={payload.participacao}
          heading={`Projeção do 1º turno em ${sigla}`}
        />
      )}

      {/* Grid superior: tabela de candidatos | coroplético de municípios */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section aria-labelledby="candidates-heading" className="flex flex-col gap-1">
          <h2
            id="candidates-heading"
            className="mb-1 text-lg"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Candidatos
          </h2>
          {sortedCandidatos.map((c) => (
            <CandidateRow
              key={c.id}
              nome={c.nome}
              partido={c.partido}
              cor={c.cor}
              // S04/F2: exibe votos reportados reais (antes era sempre `null`
              // → "—"). Quando o payload é synthesized (dev fallback) ou
              // pré-apuração, votos_atuais = 0 e a coluna mostra "0".
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
            Mapa de municípios
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

      {/* RF-044: insight textual */}
      {/*
        EdgePayloadUf não traz `insights` ainda. Quando o orchestrator
        evoluir, substituímos pelo campo correto. v1: card vazio = não
        renderiza (InsightCard retorna null com frases=[]).
      */}
      <InsightCard frases={[]} variant="uf" />

      {/* RF-035 + RF-036: mapas duo */}
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

      {/* RF-037: tabela virtualizada */}
      <MunicipioTable rows={municipioRows} />

      {/* RF-038: swing arrows (Should) */}
      <section aria-labelledby="swing-heading" className="flex flex-col gap-2">
        <h3 id="swing-heading" className="text-lg" style={{ fontFamily: "var(--font-serif)" }}>
          Como os votos se comparam com 2022
        </h3>
        <UfSwingArrowMapLazy ufSigla={sigla} arrows={[]} height={320} />
      </section>

      {/* RF-039: agulha estadual + estimated margin */}
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
            Forecast ao vivo de {sigla}
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

      {/* RF-040, RF-041, RF-042: charts (Should).
          S04/F2: payload agora inclui `series_temporais` (optional para
          forward-compat). Quando vazio ou ausente, charts caem no
          placeholder "Série insuficiente" — nunca quebram. */}
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

      {/* RF-043: forecast transparency */}
      <ForecastTransparency pctApurado={payload.pct_apurado} variant="uf" />

      {/* Slot "Repercussão na imprensa" (decisão kickoff S04, sem RF formal) */}
      <NewsClippingPlaceholder />

      <Footer />
    </main>
  );
}
