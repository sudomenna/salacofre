/**
 * app/uf/[sigla]/page.tsx — Spec 004 (Página de UF Presidencial)
 *
 * Server Component. `generateStaticParams` lista as 27 UFs (PR-IBGE).
 *
 * Pipeline:
 *   1. Lê, EM PARALELO, os dois read paths (ADR-0032):
 *        a. `readUfProjection(sigla)` — o RESUMO, no Global Config (ADR-0001).
 *        b. `readUfDetail(sigla, ...)` — o DETALHE (municípios + séries), no
 *           Vercel Blob. Nunca em série: a página não espera o Blob para
 *           renderizar o resumo.
 *      Os dois falham de forma independente, e a página degrada **por seção**:
 *      as seções de detalhe mostram estado "detalhe indisponível" explícito,
 *      sempre no DOM (`<DetailUnavailable>`, ADR-0017), nunca somem.
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
 * RFs cobertos (após os cortes de 2026-09-08 — ver a seção do protótipo no
 * fim deste bloco):
 *   RF-031 (breadcrumb), RF-032 (winner banner), RF-033 (candidate rows),
 *   RF-034 (choropleth UF), RF-037 (municipios table),
 *   RF-043 (forecast transparency).
 *
 * DEIXARAM de ter implementação nesta rota: RF-035, RF-036 (mapas duo),
 * RF-038 (swing arrows), RF-039 (agulha estadual), RF-040, RF-041, RF-042
 * (séries) e RF-044 (insight). A spec 004 regride — sincronização de
 * traceability/status é tarefa separada.
 *
 * S07/Fase 2
 *   - Dispatch de modo idêntico ao da home: `binary` quando `turno === 2`
 *     ou há exatamente 2 candidatos; `multi-1t` caso contrário.
 *   - Em `multi-1t`, `<ProjectionThermometers />` (ADR-0018) abre a projeção,
 *     acima da lista de candidatos (o IC vem de `ci95`).
 *   - Identidade da trilha presidencial: `<main data-trilha="pres">`,
 *     kicker "PRESIDÊNCIA" e breadcrumb de profundidade real (ADR-0019).
 *
 * ===== S07/Bloco 2 — mapa primeiro (ADR-0029) =====
 * Esta rota recebe a MESMA recomposição que a home. Como lá, a mudança é de
 * ORDEM e de invólucro, não de conteúdo: **nenhum bloco RF-bound saiu**.
 *
 *   1. O coroplético de municípios (`UfLeaderMapLazy`, RF-034) sobe do meio da
 *      página para PRIMEIRO conteúdo, com altura de hero (ADR-0029 § 1). O
 *      `<UFBreadcrumb>` (RF-031) fica acima dele — é uma linha, e tirar a
 *      orientação de "onde estou" do topo custaria mais do que ganha.
 *   2. O `<RaceHeader>` com `<h1>` grande saiu da primeira dobra. O `<h1>`
 *      continua único: virou o TÍTULO DO PAINEL de resultado, na escala de
 *      qualquer outra seção (ADR-0029 § 5), com o `<TrilhaKicker>` acima e o
 *      `<TurnoBadge>` ao lado. Ele alterna "Resultado parcial" / "Projeção
 *      Atlas Menna" pelo controle do shell, por cascata (nenhum JS novo).
 *   3. As linhas de candidato passaram de `<CandidateRow>` (avatar + votos +
 *      um único percentual, o projetado) para `<CandidateResultRow>` —
 *      parcial e projeção lado a lado, ADR-0029 § 7. O leitor passa a poder
 *      conferir a coluna "parcial" contra o boletim do TSE (constituição § 8).
 *   4. Cada seção virou um `<Panel>` com filete e kicker (ADR-0025).
 *   5. Novo: `<MunicipioExplorer>` — tocar num município abre a folha no
 *      `<Sheet>`. (O `<ChancesPanel>` também entrou aqui no Bloco 2, mas saiu
 *      em 2026-09-08 — ver abaixo.)
 *
 * ===== 2026-09-08 — a rota passa a seguir o protótipo do kit =====
 * Decisão do usuário: corta-se desta página tudo que não está em
 * `docs/design-system/atlas-menna/ui_kits/atlas-menna/App.jsx`. Saíram:
 * `<ChancesPanel>` (no protótipo é NACIONAL, `App.jsx:350` — migrou para
 * `app/page.tsx`), `<InsightCard>`, o `<Panel>` "Volume e estimativa"
 * (`UfMapDuoLazy`), o `<Panel>` "Comparação" (`UfSwingArrowMapLazy`), o
 * `<Panel>` "Forecast" (`<Needle>`), o `<Panel>` "Ao longo da noite" (os três
 * charts) e o `<NewsClippingPlaceholder>`.
 *
 * Duas exceções que NÃO são cortadas apesar de não estarem no protótipo:
 * `<ForecastTransparency>` (constituição § 8 — toda página com projeção) e
 * `<Footer>` (constituição § 1 — "Não oficial. Fonte: TSE.").
 *
 * A rota é pré-renderizada estática (27 UFs × 2 trilhas): nada aqui pode ler
 * `searchParams`, `cookies()` ou `headers()`.
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
import { currentRace } from "@/lib/config/calendar";
import { readUfProjection } from "@/lib/edge-config/reader";
import type {
  EdgePayload,
  EdgePayloadUf,
  EdgeUfCandidate,
  EdgeUfMunicipio,
} from "@/lib/edge-config/types";
import { rankFromColorVar } from "@/lib/utils/cand-color";
import { formatPercent, formatTimeHMS } from "@/lib/utils/format";
import nationalFixture from "@/tests/fixtures/edge-config/projection-current.json" with {
  type: "json",
};

/** Altura do mapa hero (ADR-0029 § 1). `ChoroplethMapUF.height` é `number`. */
const HERO_MAP_HEIGHT = 440;

/**
 * Título do painel de resultado — e o `<h1>` da página (ADR-0029 § 5).
 * Os dois textos ficam no DOM; `data-view-only` (cascata em
 * `app/globals.css`) revela o da base ativa e tira o outro da árvore de
 * acessibilidade com `display: none`. Mesma mecânica da home.
 */
function ResultTitle({ sigla }: { sigla: string }) {
  return (
    <>
      <span data-view-only="parcial">{sigla} — Resultado parcial</span>
      <span data-view-only="proj">{sigla} — Projeção Atlas Menna</span>
    </>
  );
}

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
  };
}

/**
 * Motivo a exibir no estado "detalhe indisponível" da seção de municípios, ou
 * `null` quando há detalhe para mostrar.
 *
 * Separa dois casos que o ADR-0032 trata como notícias diferentes: a fonte não
 * respondeu (`result.reason`) vs. respondeu e não há município apurado
 * (`"empty"`). Os dois continuam no DOM; nenhum esconde o bloco (ADR-0017).
 */
function municipioDetailReason(
  result: UfDetailResult,
  quantidade: number,
): "not_configured" | "not_found" | "fetch_error" | "invalid" | "empty" | null {
  if (result.status !== "ok") return result.reason;
  return quantidade === 0 ? "empty" : null;
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

  // Os DOIS read paths, em paralelo (ADR-0032 item 3). O resumo vem do Global
  // Config; o detalhe municipal e as séries vêm do Vercel Blob. Nunca em série:
  // a página não espera o Blob para renderizar o resumo, e os dois falham de
  // forma independente.
  //
  // `currentRace()` é a MESMA resolução que `readUfProjection()` faz por
  // default — passar os literais aqui garante que o caminho do Blob e a chave
  // do Global Config apontam para a mesma corrida.
  const race = currentRace();
  const [payloadDoStore, detalhe] = await Promise.all([
    readUfProjection(sigla),
    readUfDetail(sigla, { cargo: race.cargo, turno: race.turno }),
  ]);
  let payload = payloadDoStore;

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
      <main data-trilha="pres" className="mx-auto flex min-h-screen max-w-page flex-col px-5 py-6">
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

  // Detalhe do Blob. `municipiosFrom`/`seriesFrom` coalescem para vazio quando
  // indisponível — o estado explícito é decidido logo abaixo, não aqui.
  const municipios = municipiosFrom(detalhe);
  const municipioReason = municipioDetailReason(detalhe, municipios.length);

  const municipioRows = toMunicipioRows(municipios, candidateColor, candidateShortName);

  const choropleth = municipios.map((m) => ({
    cod_ibge: m.cod_ibge,
    cor: candidateColor[m.lider.candidato_id] ?? "var(--color-tossup)",
    pctApurado: m.pct_apurado,
  }));

  return (
    <main
      data-trilha="pres"
      className="mx-auto flex min-h-screen max-w-page flex-col px-4 py-6 md:px-6 md:py-10"
      // Mesma medida da home: 32px é a maior distância entre seções; a
      // separação editorial é feita pelo filete e pelo kicker do `<Panel>`.
      style={{ gap: "var(--space-8)" }}
    >
      {/* RF-031 — "onde estou", com links reais. Fica acima do mapa: é uma
          linha, e o mapa sem ela abriria a página sem nenhuma âncora de
          navegação. O `<TrilhaKicker>` mais abaixo carrega só o rótulo da
          trilha, sem repetir "Brasil › SP" (achado 2 do a11y-perf-auditor,
          2026-09-05). */}
      <UFBreadcrumb trilha="pres" items={[{ label: "Brasil", href: "/" }, { label: sigla }]} />

      {/* Seção 1 — o MAPA (ADR-0029 § 1). `rule="none"` e título em escala de
          kicker: abrir a página com filete duplo e cabeçalho editorial seria
          abrir com cromo em vez de com o mapa, que é o ponto da recomposição.
          RF-034. */}
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

      {/* RF-032: Winner banner quando p_vitoria_lider >= 0.95.
          S06/F4d — em mode 2T (`payload.turno === 2`) o threshold continua
          válido; a UF "chama" o vencedor estadual da disputa 2T. Fora de
          `<Panel>`: é uma faixa de estado que se auto-anula, e um Panel aqui
          deixaria filete órfão quando ela não renderiza. */}
      {lider && pVitoriaLider >= 0.95 && (
        <WinnerBanner
          candidato={lider.nome}
          partido={lider.partido}
          ufSigla={sigla}
          cor={lider.cor}
          rank={rankFromColorVar(lider.cor)}
        />
      )}

      {/* ADR-0019 — kicker de trilha imediatamente acima do `<h1>`, que agora
          é o título do painel de resultado. `-mb-4` cola os dois: vale metade
          do `gap` entre seções. */}
      <TrilhaKicker trilha="pres" crumbs={[]} className="-mb-4" />

      {/* Seção 2 — a projeção. O kicker carrega o rótulo "não oficial" exigido
          pela constituição § 1 no topo da primeira seção de dado. `rule="none"`
          porque o filete desta seção é o do `<TrilhaKicker>` acima. */}
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

          {/* Hero 1T — seis termômetros com o IC de `ci95` (ADR-0018). Em 2T
              (mode binary) a corrida é binária e este bloco sai. */}
          {mode === "multi-1t" && (
            <ProjectionThermometers
              candidatos={sortedCandidatos}
              participacao={payload.participacao}
              heading={`Projeção do 1º turno em ${sigla}`}
            />
          )}

          {/* RF-033 — linhas de candidato no formato do ADR-0029 § 7: parcial
              (tinta) e projeção (ocre) lado a lado, com a seta do movimento.
              Nenhuma linha sai do DOM (ADR-0017). */}
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
              Candidatos
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

      {/* Seção 3 — RF-037: municípios. Tocar num município abre a folha
          (`<Sheet>`) com os números dele (S07/Bloco 2).

          O `<Panel>` NÃO some mais quando não há município: desde o ADR-0032 a
          fonte deste bloco é o Vercel Blob, que falha independentemente do
          resumo, e esconder a seção comunicaria "não existe" quando a verdade é
          "não chegou". Estado explícito, sempre no DOM (ADR-0017). */}
      <Panel kicker="Municípios">
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
            />
          </div>
        ) : (
          <DetailUnavailable label="O detalhe por município" reason={municipioReason} />
        )}
      </Panel>

      {/* Seção 4 — RF-043: forecast transparency. Constituição § 8 exige o
          bloco em toda página com projeção — fica mesmo não estando no
          protótipo. */}
      <Panel kicker="Metodologia">
        <ForecastTransparency pctApurado={payload.pct_apurado} variant="uf" />
      </Panel>

      <Footer />
    </main>
  );
}
