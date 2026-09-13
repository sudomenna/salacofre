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
 * Cobertura (após os cortes de 2026-09-08 e 2026-09-09)
 *   - RF-033 (candidate rows, agora dentro do `<ResultPanel>`),
 *     RF-037 (municipios table), RF-043 (forecast transparency).
 *   - DEIXARAM de ter implementação aqui: RF-031 (breadcrumb) e RF-032
 *     (winner banner), cortados em 09/09; RF-035/036 (mapas duo), RF-039
 *     (agulha), RF-040/041/042 (séries), RF-044 (insight), cortados antes. A
 *     spec 005 regride — sincronização de traceability/status é tarefa
 *     separada (`spec-syncer`).
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
 * ===== 2026-09-09 — a projeção vira o `<ResultPanel>` do kit (decisão D23) =====
 * Espelho exato da rota presidencial de UF, pelo mesmo motivo: com o shell de
 * duas colunas (ADR-0033 § 1) a coluna de painéis mede `--container-sidebar`
 * (400px), e os seis termômetros do ADR-0018 — desenhados para a página
 * inteira — sobrepunham os próprios números e truncavam os rótulos ali dentro.
 * O painel que entra é o MESMO componente da home
 * (`components/blocks/ResultPanel.tsx`), não uma variante.
 *
 * Saíram: `<UFBreadcrumb>` (RF-031), `<WinnerBanner>` (RF-032),
 * `<TrilhaKicker>` (ADR-0019), `<ProjectionThermometers>` (ADR-0018), as duas
 * `<Figure>` "Apurado"/"Última atualização" e a `<section
 * aria-labelledby="candidates-heading">` montada à mão — as três últimas
 * porque o `<ResultPanel>` as resolve.
 *
 * Consequência declarada: brancos, nulos e abstenção saem DESTA TELA. O dado
 * segue em `EdgePayloadUf.participacao` e o bloco continua íntegro em
 * `/governador`, onde o ADR-0022 o torna obrigatório. Isto emenda de fato o
 * ADR-0018 nesta rota; a formalização é trabalho de `adr-author`.
 *
 * Ficam, contra o protótipo e por regra de nível mais alto:
 * `<MunicipioExplorer>`/`<MunicipioTable>` (constituição § 4 — lista textual
 * paralela ao mapa municipal), `<ForecastTransparency>` (§ 8) e `<Footer>`
 * (§ 1).
 *
 * A rota é pré-renderizada estática (27 UFs): nada aqui pode ler
 * `searchParams`, `cookies()` ou `headers()`.
 *
 * ISR: cadência 60s (ADR-0011).
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TurnoBadge } from "@/components/atoms/badges/TurnoBadge";
import { DadoParadoBanner } from "@/components/atoms/banners/DadoParadoBanner";
import { DetailFreshness, DetailUnavailable } from "@/components/atoms/surfaces/DetailUnavailable";
import { Panel } from "@/components/atoms/surfaces/Panel";
import { ForecastTransparency } from "@/components/blocks/ForecastTransparency";
import { MunicipioExplorer } from "@/components/blocks/MunicipioExplorer";
import type { MunicipioRow } from "@/components/blocks/MunicipioTable";
import { ResultPanel } from "@/components/blocks/ResultPanel";
import { Footer } from "@/components/layout/Footer";
import { municipiosFrom, readUfDetail, type UfDetailResult } from "@/lib/blob/uf-detail";
import { avaliarFrescorDado } from "@/lib/config/dado-freshness";
import { readUfProjection } from "@/lib/edge-config/reader";
import type {
  EdgePayload,
  EdgePayloadUf,
  EdgeUfCandidate,
  EdgeUfMunicipio,
} from "@/lib/edge-config/types";
import govFixture from "@/tests/fixtures/edge-config/gov-current.json" with { type: "json" };

export const revalidate = 60;

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

/**
 * DERIVAÇÃO DO RANK — a ordem deste array É o rank exibido. Espelho exato de
 * `rankByParcial` em `app/(pres)/uf/[sigla]/page.tsx`, onde o raciocínio está
 * escrito por extenso.
 *
 * Resumo: `EdgeUfCandidate` (`lib/edge-config/types.ts:570-588`) não tem
 * `rank` — o `<ResultPanel>` cai no índice do array e lê `candidatos[0]`/`[1]`
 * como líder e 2º. Ordena-se por `pct_atual` desc (o apurado, que é o que o
 * protótipo ordena e o que o leitor confere contra o boletim do TSE), com
 * `pct_projetado` desc como desempate — sem ele, antes da primeira zona
 * apurada todos os `pct_atual` são 0 e o "líder" sairia arbitrário — e `id`
 * asc como desempate estável final.
 */
function rankByParcial(candidatos: readonly EdgeUfCandidate[]): EdgeUfCandidate[] {
  return [...candidatos].sort((a, b) => {
    if (b.pct_atual !== a.pct_atual) return b.pct_atual - a.pct_atual;
    if (b.pct_projetado !== a.pct_projetado) return b.pct_projetado - a.pct_projetado;
    return a.id - b.id;
  });
}

/**
 * 2026-09-11 (ADR-0035 D2): `eleitores` e `capital` entram nas linhas. É esta
 * rota que consome `mode="top-by-eleitorado"` — sem os dois campos a tabela
 * caía no estado "eleitorado não publicado" e não listava município nenhum.
 * Ambos seguem opcionais: Blob antigo (pré-migration 0006) continua válido, e
 * `capital` é emitido só quando `true` (ausência == não é capital).
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
      eleitorado: m.eleitores,
      capital: m.capital,
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
    // Dev-only. Desde os cortes de 09/09 esta rota não tem mais consumidor
    // para `participacao` (os termômetros do ADR-0018 saíram); o campo
    // permanece porque `EdgePayloadUf` o declara e a fixture sintetizada deve
    // ter a mesma forma do payload real.
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

/* O `govBreadcrumb()` saiu em 2026-09-09 (D23) junto com o `<UFBreadcrumb>`:
 * o protótipo não tem breadcrumb, e a volta para a grade das 27 corridas fica
 * com o `<CargoTabs>` do shell. */

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

  // A ordem deste array é o rank exibido — ver `rankByParcial` acima.
  const rankedCandidatos = rankByParcial(payload.candidatos);

  // ADR-0038 D4 — frescor do DADO desta UF, do servidor, a partir do `dado_ts`
  // que já veio no payload. Cargo do payload, não literal: o limiar é por
  // cargo (D3) — aqui, os mesmos 180 s do Presidente, porque Governador
  // compartilha a cadência de 60 s do ADR-0011.
  const frescorDado = avaliarFrescorDado(payload.dado_ts, payload.cargo);

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

  // O dispatch `binary` | `multi-1t` saiu com os termômetros (D23): o
  // `<ResultPanel>` é o mesmo nos dois turnos — em 2T a lista tem duas linhas.

  return (
    <main
      data-trilha="gov"
      className="mx-auto flex min-h-screen max-w-page flex-col px-4 py-6 md:px-6 md:py-10"
      style={{ gap: "var(--space-8)" }}
    >
      {/* ADR-0038 D4/D5 — o SEGUNDO sinal de frescor desta página, e o
          primeiro que mede o TSE. Alimentado pelo `dado_ts` do `EdgePayloadUf`
          desta UF (cru, sem `??`), e deliberadamente separado do
          `<DetailFreshness>` lá embaixo: aquele compara dois relógios de
          ESCRITA (o Blob ficou para trás do resumo) e segue correto para o que
          mede. Causas diferentes, frases diferentes.

          `escopo="uf"` porque este `dado_ts` é o DESTA UF (D2: a ingestão
          degrada regionalmente sem o nacional acusar nada). O único relógio
          vivo no cliente é o nacional, que a moldura do mapa publica a cada
          60 s — e ele é o `max` sobre todos os pares, logo nunca mais velho que
          o desta UF. O banner sabe usá-lo só no sentido em que isso é válido:
          nacional parado ⇒ esta UF parada (acende); nacional fresco não prova
          nada sobre a UF (não apaga o aviso que o servidor já deu). */}
      <DadoParadoBanner frescor={frescorDado} escopo="uf" />

      {/* O coroplético "{sigla} · quem lidera cada município" (RF-034) MUDOU
          DE ENDEREÇO em 2026-09-09 (map-builder): não vive mais aqui — vive
          na coluna do mapa (`<PersistentMapFrame>`, ADR-0033 § 1), que agora
          desce para o nível município quando a rota é de UF (nas duas
          corridas, Presidente e Governador). Manter os dois seria duplicação
          — o conteúdo desta seção não tinha nada além do mapa e do aviso de
          indisponível, e os dois migraram juntos. */}

      {/* O disclaimer de K-1 (ADR-0015) foi REMOVIDO em S07/Fase 5. O ADR-0021
          supersede o ADR-0015: a projeção não usa mais 2022 como insumo, então
          não existe "bloco político sem mapeamento histórico" — o caminho de
          código que alimentava esse banner é morto desde a Fase 1. Manter o
          texto seria descrever ao leitor um modelo que não roda (constituição
          § 8 v1.2). `model_fallback_tier` segue no schema como @deprecated,
          sem consumidor. */}

      {/* Seção 1 — a projeção, no `<ResultPanel>` do kit (o MESMO componente
          da home e da rota presidencial de UF). Primeiro conteúdo da coluna de
          painéis, e por isso com o filete duplo padrão do `<Panel>`: o
          `rule="none"` da home existe porque lá o `<TrilhaKicker>` desenha o
          filete, e aqui ele saiu (D23). */}
      <ResultPanel
        action={<TurnoBadge turno={payload.turno} />}
        candidatos={rankedCandidatos}
        headingLevel={1}
        kicker="Projeção Atlas Menna · não oficial"
        note="Projeção por regra de três: votos apurados ÷ % apurado em cada município, somados na UF."
        pctApurado={payload.pct_apurado}
        title={<ResultTitle sigla={sigla} />}
        titleId="resultado-heading"
      />

      {/* Seção 2 — maiores municípios, ligados à folha do município
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
              // 8, não 15: é o corte do protótipo (`ui_kits/atlas-menna/App.jsx:131`,
              // `.slice(0, 8)`) e a decisão E4 do plano de 11/09. O default do
              // componente segue 15 — quem manda é este call site, que é o único
              // uso real do modo.
              topN={8}
            />
          </div>
        ) : (
          <DetailUnavailable label="O detalhe por município" reason={municipioReason} />
        )}
      </Panel>

      {/* Seção 3 — transparência metodológica (RF-043). Constituição § 8
          exige o bloco em toda página com projeção — fica mesmo não estando
          no protótipo. */}
      <Panel kicker="Metodologia">
        <ForecastTransparency pctApurado={payload.pct_apurado} variant="uf" />
      </Panel>

      <Footer />
    </main>
  );
}
