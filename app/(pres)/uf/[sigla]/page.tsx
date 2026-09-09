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
 * RFs cobertos (após os cortes de 2026-09-08 e os de 2026-09-09 — ver as duas
 * seções do protótipo no fim deste bloco):
 *   RF-033 (candidate rows, agora dentro do `<ResultPanel>`),
 *   RF-037 (municipios table), RF-043 (forecast transparency).
 *
 * DEIXARAM de ter implementação nesta rota: RF-031 (breadcrumb) e RF-032
 * (winner banner), cortados em 09/09; RF-035, RF-036 (mapas duo), RF-038
 * (swing arrows), RF-039 (agulha estadual), RF-040, RF-041, RF-042 (séries) e
 * RF-044 (insight), cortados antes. A spec 004 regride — sincronização de
 * traceability/status é tarefa separada (`spec-syncer`).
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
 * ===== 2026-09-09 — a projeção vira o `<ResultPanel>` do kit (decisão D23) =====
 * Esta rota recebe o MESMO painel que a home já usa desde `b7c1bbb`
 * (`components/blocks/ResultPanel.tsx`), e não uma segunda variante dele. O
 * motivo imediato foi de layout: com o shell de duas colunas (ADR-0033 § 1), a
 * coluna de painéis mede `--container-sidebar` (400px), e os seis termômetros
 * do ADR-0018 — desenhados para a página inteira — passaram a se sobrepor e a
 * truncar os próprios rótulos ali dentro.
 *
 * Saíram desta rota (decisão D23 do usuário — o que o protótipo não tem):
 *
 *   - `<UFBreadcrumb>` (RF-031) — o protótipo não tem breadcrumb; a
 *     orientação "onde estou" fica com o `<CargoTabs>` do shell e com o
 *     título do painel, que nomeia a UF.
 *   - `<WinnerBanner>` (RF-032) — sem contraparte no protótipo.
 *   - `<TrilhaKicker>` (ADR-0019) — idem. Com ele fora, o `<ResultPanel>`
 *     volta ao filete duplo padrão do `<Panel>` (era `rule="none"` porque o
 *     kicker desenhava o filete da seção).
 *   - `<ProjectionThermometers>` (ADR-0018) — dá lugar ao `<ResultPanel>`.
 *     Consequência declarada, a mesma que a home aceitou em 09/09: brancos,
 *     nulos e abstenção saem DESTA TELA. O dado segue em
 *     `EdgePayloadUf.participacao`, e o bloco continua íntegro em
 *     `/governador` (onde o ADR-0022 o torna obrigatório). Isto emenda de fato
 *     o ADR-0018 nesta rota; a formalização é trabalho de `adr-author`.
 *   - As duas `<Figure>` "Apurado" e "Última atualização" e a `<section
 *     aria-labelledby="candidates-heading">` montada à mão — o `<ResultPanel>`
 *     resolve as três: "Apurado" com a nota "X de Y votos válidos", "Margem
 *     <líder>" no lugar do relógio, e a lista de candidatos com `variant="kit"`.
 *
 * Ficam, contra o protótipo e por regra de nível mais alto:
 * `<MunicipioExplorer>`/`<MunicipioTable>` (constituição § 4 — é a lista
 * textual paralela do mapa municipal, que no protótipo seria "Maiores colégios
 * eleitorais"), `<ForecastTransparency>` (§ 8) e `<Footer>` (§ 1).
 *
 * O `<h1>` continua único e continua sendo o título do painel de resultado
 * (ADR-0029 § 5), alternando "Resultado parcial" / "Projeção Atlas Menna" por
 * CASCATA (`data-view-only`), nunca por estado React.
 *
 * A rota é pré-renderizada estática (27 UFs × 2 trilhas): nada aqui pode ler
 * `searchParams`, `cookies()` ou `headers()`.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TurnoBadge } from "@/components/atoms/badges/TurnoBadge";
import { DetailFreshness, DetailUnavailable } from "@/components/atoms/surfaces/DetailUnavailable";
import { Panel } from "@/components/atoms/surfaces/Panel";
import { ForecastTransparency } from "@/components/blocks/ForecastTransparency";
import { MunicipioExplorer } from "@/components/blocks/MunicipioExplorer";
import type { MunicipioRow } from "@/components/blocks/MunicipioTable";
import { ResultPanel } from "@/components/blocks/ResultPanel";
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
import nationalFixture from "@/tests/fixtures/edge-config/projection-current.json" with {
  type: "json",
};

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
 * DERIVAÇÃO DO RANK — a ordem deste array É o rank exibido.
 *
 * `EdgeUfCandidate` (`lib/edge-config/types.ts:570-588`) é, por definição, um
 * subset do `EdgeCandidate` nacional: tem `votos_atuais`, `pct_atual`,
 * `pct_projetado` e `ci95`, mas **não tem `rank`**. O `<ResultPanel>` cai no
 * índice do array quando a chave está ausente (`candidateResultRowProps(c, i +
 * 1)`), e lê `candidatos[0]`/`[1]` como líder e 2º colocado para a figura de
 * margem e para a barra de maioria. Ou seja: ordenar aqui é derivar o rank.
 *
 * Critério primário: **`pct_atual` desc** — o resultado APURADO, que é o
 * número que o leitor confere contra o boletim do TSE, e é sobre `pct` que o
 * protótipo ordena (`ui_kits/atlas-menna/App.jsx:22`, `rows[0]`/`rows[1]`).
 *
 * Dois desempates, e nenhum é cosmético:
 *
 *   1. `pct_projetado` desc. Antes da primeira zona apurada TODOS os
 *      `pct_atual` valem 0 e o critério primário não separa ninguém; sem este
 *      desempate a ordem cairia na do array de origem e a página abriria a
 *      noite eleitoral com um "líder" arbitrário — na numeração, na margem e
 *      na barra. `pct_projetado` carrega o prior pré-eleitoral e é a única
 *      leitura disponível nesse instante. (Era o critério primário até 09/09.)
 *   2. `id` asc — desempate estável final, a mesma convenção do payload
 *      nacional (`EdgeNational.candidatos`).
 */
function rankByParcial(candidatos: readonly EdgeUfCandidate[]): EdgeUfCandidate[] {
  return [...candidatos].sort((a, b) => {
    if (b.pct_atual !== a.pct_atual) return b.pct_atual - a.pct_atual;
    if (b.pct_projetado !== a.pct_projetado) return b.pct_projetado - a.pct_projetado;
    return a.id - b.id;
  });
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
    // Dev-only. Desde os cortes de 09/09 esta rota não tem mais consumidor
    // para `participacao` (os termômetros do ADR-0018 saíram, ver o cabeçalho
    // do arquivo); o campo continua aqui porque `EdgePayloadUf` o declara e a
    // fixture sintetizada deve ter a mesma forma do payload real.
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
        {/* O `<UFBreadcrumb>` saiu daqui junto com o da página cheia (D23):
            manter a navegação só no caminho de erro deixaria duas gramáticas
            para a mesma rota. Quem volta usa o `<CargoTabs>` do shell. */}
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

  // A ordem deste array é o rank exibido — ver `rankByParcial` acima.
  const rankedCandidatos = rankByParcial(payload.candidatos);

  // O dispatch `binary` | `multi-1t` saiu com os termômetros (D23): o
  // `<ResultPanel>` é o mesmo nos dois turnos — em 2T a corrida tem dois
  // candidatos e a lista simplesmente tem duas linhas.

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

  return (
    <main
      data-trilha="pres"
      className="mx-auto flex min-h-screen max-w-page flex-col px-4 py-6 md:px-6 md:py-10"
      // Mesma medida da home: 32px é a maior distância entre seções; a
      // separação editorial é feita pelo filete e pelo kicker do `<Panel>`.
      style={{ gap: "var(--space-8)" }}
    >
      {/* O coroplético "{sigla} · quem lidera cada município" (RF-034)
          MUDOU DE ENDEREÇO em 2026-09-09 (map-builder): não vive mais aqui —
          vive na coluna do mapa (`<PersistentMapFrame>`, ADR-0033 § 1), que
          agora desce para o nível município quando a rota é de UF. Manter os
          dois seria duplicação (o mesmo mapa nas duas colunas). O conteúdo
          desta seção não tinha nada além do mapa e do aviso de indisponível
          — os dois migraram juntos; nada ficou órfão. */}

      {/* Seção 1 — a projeção, no `<ResultPanel>` do kit (o MESMO componente
          da home). Primeiro conteúdo da coluna de painéis, e por isso com o
          filete duplo padrão do `<Panel>` — o `rule="none"` da home existe
          porque lá o `<TrilhaKicker>` desenha o filete, e aqui ele saiu (D23).

          O kicker carrega o "não oficial" da constituição § 1; o título é o
          `<h1>` único da página (ADR-0029 § 5), alternando por cascata. O
          `<TurnoBadge>` fica no slot `action`, como os badges de estado da
          home. */}
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

      {/* Seção 2 — RF-037: municípios. Tocar num município abre a folha
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

      {/* Seção 3 — RF-043: forecast transparency. Constituição § 8 exige o
          bloco em toda página com projeção — fica mesmo não estando no
          protótipo. */}
      <Panel kicker="Metodologia">
        <ForecastTransparency pctApurado={payload.pct_apurado} variant="uf" />
      </Panel>

      <Footer />
    </main>
  );
}
