/**
 * app/(sen)/uf/[sigla]/senador/page.tsx — T-10, spec 016 (Senador).
 *
 * A corrida de Senado de UM estado. Irmã de `/uf/[sigla]/governador`, com
 * três diferenças que não são cosméticas:
 *
 *   1. **Duas vagas.** O `<ResultPanel>` recebe `vagas={payload.vagas}` e,
 *      com isso, marca as duas primeiras linhas como ocupantes de vaga, com
 *      tratamento IDÊNTICO (RF-105) — no resultado não há hierarquia entre
 *      1º e 2º, os dois são senadores —, troca a margem exibida para a do 2º
 *      sobre o 3º (RF-104) e larga a barra de maioria, cujo marcador de 50%
 *      não corta nada nesta corrida.
 *   2. **Sem mapa municipal nesta janela.** O cargo 5 passou a ser ingerido em
 *      granularidade ZONA em 2026-09-11, então o dado existe — mas as telas de
 *      mapa e "maiores colégios" ficaram fora do escopo antes de 15/09
 *      (spec 016 § Escopo/Fora). Historicamente, o cargo era ingerido por UF
 *      (ADR-0026 item 1): existe um boletim por estado, nenhum por
 *      município. Não há tabela de "maiores colégios" nem coroplético
 *      municipal porque não há dado — e um bloco vazio afirmando
 *      indisponibilidade sugeriria que o dado existe e não chegou.
 *   3. **Sem 2º turno.** `temSegundoTurno: false` na tabela canônica; a
 *      página não monta `<TurnoBadge>` nem alterna turno.
 *
 * ## `p_eleito` e a honestidade do medidor de chance
 *
 * O painel de chances só aparece quando a projeção tem INCERTEZA medida —
 * isto é, quando o IC95 de algum candidato tem largura. Com a ingestão em
 * granularidade UF o bootstrap reamostra uma única unidade e devolve
 * réplicas idênticas: o IC colapsa no ponto e `p_eleito` degenera para 0 ou
 * 1. Exibir "100% de chance" com 6% apurado seria uma afirmação que o modelo
 * não sustenta (constituição § 6 e § 8). Nesse caso a página diz, em texto, o
 * que o modelo sabe e o que não sabe. Ver a nota em
 * `EdgeUfCandidate.p_eleito`.
 *
 * ## Cobertura
 *   - RF-104 (margem da 2ª vaga), RF-105 (duas linhas de vaga), RF-106
 *     ("2 vagas por estado"), RF-108 (nível de estado + 5 min), RF-103
 *     (`p_eleito` no `<ChancesPanel>`).
 *   - ADR-0001, ADR-0026, ADR-0028 (leitura declara `{cargo, turno}`),
 *     ADR-0034 (`<ResultPanel>` como hero), ADR-0017 (nada sai do DOM).
 *
 * A rota é pré-renderizada estática (27 UFs): nada aqui pode ler
 * `searchParams`, `cookies()` ou `headers()`.
 *
 * ISR: 60 s (ADR-0011).
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SerieApuracaoChart } from "@/components/atoms/charts/SerieApuracaoChart";
import { Panel } from "@/components/atoms/surfaces/Panel";
import { CandidaturasAguardando } from "@/components/blocks/CandidaturasAguardando";
import { ChancesPanel } from "@/components/blocks/ChancesPanel";
import { ForecastTransparency } from "@/components/blocks/ForecastTransparency";
import { ResultPanel } from "@/components/blocks/ResultPanel";
import { Footer } from "@/components/layout/Footer";
import { cargoInfo } from "@/lib/config/cargos";
import { isPreEleicao } from "@/lib/config/fase";
import { resultadoEleitoral, simulacaoSenadorUf } from "@/lib/dev/simulacao";
import { readProjection, readUfProjection } from "@/lib/edge-config/reader";
import type { EdgePayloadUf, EdgeUfCandidate } from "@/lib/edge-config/types";
import { nomeExibicao } from "@/lib/utils/nome-candidato";
import { rankByParcial } from "@/lib/utils/rank-parcial";
import senUfFixture from "@/tests/fixtures/edge-config/sen-uf.json" with { type: "json" };

/** Ver a nota em `app/(sen)/senador/page.tsx`: o fallback sai da tabela
 * canônica, nunca de literal. */
const CARGO_SENADOR = 5 as const;

export const revalidate = 60;

const SENADOR = cargoInfo(5);
const VAGAS_PADRAO = SENADOR.vagasPorUf ?? 1;
const CADENCIA_MIN = 5;

// 27 UFs — mesma lista canônica das outras rotas de UF.
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

interface UFSenadorPageProps {
  params: Promise<{ sigla: string }>;
}

export async function generateMetadata({ params }: UFSenadorPageProps): Promise<Metadata> {
  const { sigla: raw } = await params;
  const sigla = raw.toUpperCase();
  const title = `Senado ${sigla} — Apuração 2026 | SalaCofre`;
  const description = `Apuração da corrida ao Senado em ${sigla} (2026): duas vagas por estado, projeção em tempo real e margem para a 2ª vaga.`;
  return {
    alternates: { canonical: `/uf/${sigla}/senador` },
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "pt_BR",
      siteName: "SalaCofre",
      url: `/uf/${sigla}/senador`,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** Título do painel de resultado — e o `<h1>` da página (ADR-0029 § 5). */
function ResultTitle({ sigla }: { sigla: string }) {
  return (
    <>
      <span data-view-only="parcial">Senado {sigla} — Resultado parcial</span>
      <span data-view-only="proj">Senado {sigla} — Projeção Atlas Menna</span>
    </>
  );
}

/**
 * A projeção tem incerteza MEDIDA? Só então `p_eleito` pode ser lido como
 * "chance".
 *
 * Quando só há UMA unidade de reamostragem, o bootstrap devolve 1.000 réplicas
 * idênticas: o IC95 fecha no ponto e `p_eleito` vira 0 ou 1. O número continua
 * correto como leitura do ponto estimado, mas exibi-lo como probabilidade
 * afirmaria uma certeza que o modelo não tem (constituição § 6).
 *
 * Até 2026-09-11 isso era a REGRA para este cargo, porque a ingestão era por UF
 * (um boletim por estado). Com a ingestão por zona (emenda (b) do ADR-0026), a
 * situação passou a ser TRANSITÓRIA: acontece enquanto só uma zona do estado
 * estiver apurada, e se resolve sozinha. A guarda permanece porque o começo da
 * apuração é exatamente esse momento — e é quando o leitor mais olharia.
 *
 * A largura do IC é o sinal, e vem do próprio payload — nada é recalculado aqui.
 */
function temIncertezaMedida(candidatos: readonly EdgeUfCandidate[]): boolean {
  return candidatos.some((c) => c.ci95.upper - c.ci95.lower > 0);
}

/**
 * Só em `pnpm dev`: sem `EDGE_CONFIG` a página renderiza a fixture, para que
 * a rota possa ser inspecionada de verdade. Em teste (`NODE_ENV=test`) e em
 * produção o caminho "Aguardando dados" continua sendo exercitado.
 */
function fixtureUf(sigla: string): EdgePayloadUf | null {
  const mapa = senUfFixture as unknown as Record<string, EdgePayloadUf>;
  return mapa[sigla] ?? null;
}

export default async function UFSenadorPage({ params }: UFSenadorPageProps) {
  const { sigla: raw } = await params;
  const sigla = raw.toUpperCase();

  if (!UFS_BRASIL.includes(sigla as (typeof UFS_BRASIL)[number])) {
    notFound();
  }

  // ADR-0028 — cargo e turno explícitos. Senador é turno único.
  //
  // 🔴 Simulação ligada ⇒ ela é a fonte de verdade e o Global Config nem é
  // lido. Ver `resultadoEleitoral` em `lib/dev/simulacao.ts`.
  const payload = await resultadoEleitoral(
    () => simulacaoSenadorUf(sigla),
    async () =>
      (await readUfProjection(sigla, { cargo: "sen", turno: 1 })) ??
      (process.env.NODE_ENV === "development" ? fixtureUf(sigla) : null),
  );

  if (!payload) {
    // RF-149 — cargo 5 nesta UF.
    // 🔴 Spec 020 (RF-174d) — a fase vem do payload NACIONAL desta corrida
    // (`projection-current-sen-t1`, uma das chaves do semeador), pelo ponto
    // único `isPreEleicao`. Nunca por data de calendário.
    //
    // Lida só neste ramo: a rota não tem payload próprio em fase pré, porque o
    // semeador nunca escreve chave de UF. **Custo: zero hop a mais** — o ramo
    // já esperava por `CandidaturasAguardando`, e a leitura cabe dentro dessa
    // mesma espera. O caminho com dado não ganha leitura nenhuma (RNF-002).
    const [grade, nacional] = await Promise.all([
      CandidaturasAguardando({ cargo: 5, uf: sigla }),
      readProjection({ cargo: "sen", turno: 1 }),
    ]);

    return (
      <main
        data-trilha="sen"
        className="mx-auto flex min-h-screen max-w-page flex-col px-5 py-6"
        style={{ gap: "var(--space-6)" }}
      >
        <div>
          <h1 className="mt-4 text-3xl" style={{ fontFamily: "var(--font-serif)" }}>
            Senado {sigla} — Aguardando dados
          </h1>
          <p
            className="mt-2 text-sm"
            data-testid="uf-sen-aguardando"
            style={{ color: "var(--color-text-muted)" }}
          >
            São {VAGAS_PADRAO} vagas por estado, em turno único. A projeção desta corrida começa
            quando o TSE divulgar o primeiro boletim de {sigla}.
          </p>
        </div>

        {/* Acrescentar, nunca substituir: a grade entra DEPOIS do parágrafo. */}
        {grade}

        {/* Spec 020 (RF-174, RF-175) — o bloco vive também neste ramo, onde
            separa "a eleição ainda não começou" de "não sabemos". */}
        <Panel kicker="Evolução da apuração">
          <SerieApuracaoChart
            cadenciaMin={CADENCIA_MIN}
            candidatos={[]}
            eixo={[]}
            escopo={`Senado ${sigla}`}
            preEleicao={isPreEleicao(nacional)}
            titleId="serie-apuracao-heading"
            vagas={VAGAS_PADRAO === 2 ? 2 : 1}
          />
        </Panel>

        <Footer />
      </main>
    );
  }

  // `vagas` vem do payload (que o orchestrator preenche a partir de
  // `lib/config/cargos.ts`); o default cobre payloads gravados antes da spec
  // 016, que não têm a chave.
  const vagas = payload.vagas ?? VAGAS_PADRAO;
  const rankeados = rankByParcial(payload.candidatos);
  const incertezaMedida = temIncertezaMedida(payload.candidatos);

  // RF-103 — os `vagas + 1` primeiros são os únicos com chance relevante de
  // mudar de lado. Mostrar os 12 medidores de uma corrida grande enterraria
  // a disputa que importa, que é pela última cadeira.
  const eleitos = rankeados
    .slice(0, vagas + 1)
    .filter((c): c is EdgeUfCandidate & { p_eleito: number } => c.p_eleito != null)
    .map((c) => ({
      id: c.id,
      // `ChancesPanel.eleitos[].nome` é string e vira o rótulo do medidor —
      // o mesmo nome que o `<ResultPanel>` logo acima imprime na linha.
      nome: nomeExibicao(c.nome, c.sqcand),
      p: c.p_eleito,
      pctProjetado: c.pct_projetado,
    }));

  return (
    <main
      data-trilha="sen"
      className="mx-auto flex min-h-screen max-w-page flex-col px-4 py-6 md:px-6 md:py-10"
      style={{ gap: "var(--space-8)" }}
    >
      {/* Seção 1 — a projeção, no `<ResultPanel>` do kit (ADR-0034), com a
          gramática de duas vagas ligada por `vagas`. */}
      {/* 🔴 `ufDaFoto` é a UF da CORRIDA. Aqui ela é o estado, porque a
            corrida é estadual e é sob a sigla dele que o importador gravou as
            fotos (`candidatos/foto/<UF>/<sqcand>.jpg`, ADR-0041). O default do
            painel é `"BR"`, que é o certo só para Presidente — deixá-lo valer
            aqui montaria uma URL sintaticamente válida que devolve 404 no
            navegador do leitor, sem nenhum erro do lado do servidor. */}
      <ResultPanel
        candidatos={rankeados}
        headingLevel={1}
        kicker="Projeção Atlas Menna · não oficial"
        note={`${vagas} vagas por estado, em turno único — as ${vagas} candidaturas mais votadas se elegem, sem diferença entre elas. A margem acima é a distância da ${vagas}ª vaga para a primeira candidatura fora dela. Projeção por regra de três sobre o boletim do estado.`}
        pctApurado={payload.pct_apurado}
        title={<ResultTitle sigla={sigla} />}
        titleId="resultado-heading"
        ufDaFoto={sigla}
        vagas={vagas}
      />

      {/* Seção 2 — RF-103. O bloco NUNCA sai do DOM (ADR-0017): sem
          incerteza medida ele explica por quê, em vez de sumir ou de
          publicar um 0/1 vestido de probabilidade. */}
      {incertezaMedida && eleitos.length > 0 ? (
        <ChancesPanel
          eleitos={eleitos}
          escopo={sigla}
          pctApurado={payload.pct_apurado}
          title="Chances de eleição"
          vagas={vagas}
        />
      ) : (
        <Panel kicker="Modelo Atlas Menna" title="Chances de eleição" titleId="chances-heading">
          <p
            className="max-w-prose"
            data-testid="chances-sem-incerteza"
            style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}
          >
            Ainda há uma única zona eleitoral apurada neste estado. Com uma só medição, o modelo
            consegue projetar o resultado final, mas não consegue medir o quanto essa projeção pode
            variar — e sem essa medida, publicar uma "chance de eleição" seria dar ao leitor uma
            certeza que o cálculo não sustenta. Assim que a segunda zona for apurada, as chances
            aparecem aqui. Até lá, os percentuais projetados e a margem para a {vagas}ª vaga, acima,
            são o que há de honesto a dizer.
          </p>
        </Panel>
      )}

      {/* Seção 2b — spec 020 (RF-174 + RF-173): a evolução da apuração, no
          slot T-10 (entre o painel de chances e o de metodologia). Nunca
          acima do painel de resultado: o `<h1>` vive nele.

          `vagas` liga o destaque das duas posições que elegem (RF-173) — o
          mesmo número que o `<ResultPanel>` acima usa, lido do payload e não
          de um literal, para que as duas seções nunca discordem sobre quantas
          cadeiras estão em jogo.

          Fase 0 entrega o bloco vazio: a série só existe a partir da Fase 1.

          🔴 `preEleicao={false}` é DECISÃO — há payload desta UF, e payload de
          UF só nasce do orchestrator; o semeador da fase pré grava apenas as
          chaves nacionais. A pergunta cara é feita no ramo de espera, acima, e
          só lá (RNF-002). */}
      <Panel kicker="Evolução da apuração">
        <SerieApuracaoChart
          cadenciaMin={CADENCIA_MIN}
          candidatos={[]}
          eixo={[]}
          escopo={`Senado ${sigla}`}
          preEleicao={false}
          titleId="serie-apuracao-heading"
          vagas={vagas === 2 ? 2 : 1}
        />
      </Panel>

      {/* Seção 3 — RF-108 e constituição § 8: o bloco de transparência é
          obrigatório em toda página com projeção. Aqui ele carrega os dois
          fatos que só esta corrida tem: nível de estado e cadência de 5 min. */}
      <Panel kicker="Metodologia">
        <ForecastTransparency
          pctApurado={payload.pct_apurado}
          variant="uf"
          granularidade={payload.granularidade ?? cargoInfo(CARGO_SENADOR).granularidade}
          cadenciaMinutos={CADENCIA_MIN}
        />
      </Panel>

      <Footer />
    </main>
  );
}
