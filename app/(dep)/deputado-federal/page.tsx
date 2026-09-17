/**
 * app/(dep)/deputado-federal/page.tsx — T-11, spec 017 (Deputado Federal).
 *
 * A visão nacional da corrida proporcional: como a bancada da Câmara está se
 * formando, agremiação por agremiação, e o que ainda não dá para dizer.
 *
 * ## A decisão de leitura que governa esta tela
 *
 * Esta corrida **não tem líder**. Toda a gramática que as outras rotas usam —
 * agulha, duelo A×B, margem do primeiro sobre o segundo, chance de 2º turno —
 * descreve uma disputa majoritária e aqui não tem referente: o que se elege é
 * um conjunto de 513 cadeiras, e quem as ganha é a **agremiação**, não o
 * candidato mais votado. Por isso o payload tem tipo próprio
 * (`EdgePayloadDeputado`, design 017 § D1) e esta página não monta nenhum
 * componente de corrida majoritária.
 *
 * O fato que a tela existe para contar é o que o leitor tende a errar sozinho:
 * **um partido pode ganhar votos e perder cadeira**, e a última vaga de um
 * estado se decide por algumas centenas de votos.
 *
 * ## Por que esta rota não tem mapa
 *
 * ⚠️ **Corrigido em 2026-09-13.** Este parágrafo dizia que o cargo 6 é
 * ingerido em granularidade **UF** (27 arquivos por ciclo, sem quebra por
 * município ou zona) e usava isso para justificar a ausência de mapa. O
 * ADR-0036 inverteu o fato: o cargo 6 lê o par (município, zona), ~6.110
 * alvos, varridos em 6 fatias com volta completa a cada 30 min.
 *
 * **A ausência do mapa não é mais consequência de falta de dado.** Passou a
 * ser escopo: a rota fica fora do `<AppShellSplit>`/`<PersistentMapFrame>`
 * (ADR-0033 § 1), como `/senador`, e desenhar o recorte municipal de uma
 * corrida proporcional é decisão de produto que ninguém tomou. Registrar a
 * razão verdadeira importa porque a razão anterior aparecia **na tela do
 * leitor**, em `<DeputadoMetodologia>`, e ficou falsa junto.
 *
 * ## Nenhum número escrito à mão (design 017 § D8)
 *
 * Lição de 2026-09-11: quatro frases da tela de Senador viraram falsas quando
 * a granularidade do cargo 5 mudou, e uma delas atribuía ao TSE uma limitação
 * que era escolha nossa. Aqui:
 *
 *   - o total de cadeiras sai de `bancada.total_cadeiras`, **nunca** do literal
 *     `513` — o número é a soma dos `lugares_a_preencher` que o TSE publicou, e
 *     a redistribuição pelo Censo 2022 (PLP 177/2023) não está confirmada
 *     (RF-124, open question 2 da spec);
 *   - a cadência sai de `atualizacao_min` (RF-128);
 *   - nome, slug, proporcionalidade e granularidade do cargo saem de
 *     `lib/config/cargos.ts`.
 *
 * E **sem payload a página não inventa número nenhum**: ela descreve a
 * estrutura e diz que a contagem aparece quando o primeiro boletim chegar. Um
 * `emptyPayload()` com `total_cadeiras: 0` imprimiria aqui "0 cadeiras em
 * disputa", que é falso.
 *
 * ✅ Esta rota era a única das quatro que já fazia isso certo. `/governador` e
 * `/senador` usavam o atalho do payload zerado e o publicavam como resultado;
 * em 2026-09-14 elas ganharam ramos de espera de verdade, irmãos deste.
 *
 * ## Cobertura
 *   - RF-122 — federação com identidade própria e componentes legíveis.
 *   - RF-125.1 — o que vai à tela é `cadeiras` (eleitos). `vagas_obtidas` não
 *     existe no payload e não é reconstruído.
 *   - RF-127 — incerteza explícita: intervalo quando houver, e marcação de
 *     cadeira indefinida sempre.
 *   - RF-128 — cadência + `ts` do payload.
 *   - RF-130 — voto de legenda distinguível do nominal.
 *   - ADR-0001 (Global Config no read path), ADR-0012 (chave nomeada),
 *     ADR-0024 (cor por sigla, nunca a oficial do partido), ADR-0026.
 *   - Constituição § 1 (não oficial), § 2 (cores por token), § 3 (degrada),
 *     § 4 (lista textual), § 6 (ordenação determinística), § 8 (transparência).
 *
 * ISR: 60 s (ADR-0011). O payload é reescrito a cada **30 min** — a volta
 * completa das 6 fatias do cron do cargo (ADR-0036, 2026-09-13; era 15 min
 * enquanto a ingestão era por UF). Revalidar em 1.800 s só serviria para
 * atrasar a primeira aparição. A cadência exibida na tela NÃO vem daqui:
 * sai de `atualizacao_min` do payload (§ D8) — este comentário é sobre o
 * cache, não sobre a prosa.
 */

import type { Metadata } from "next";

import { DadoParadoBanner } from "@/components/atoms/banners/DadoParadoBanner";
import { FasePreEleicaoBanner } from "@/components/atoms/banners/FasePreEleicaoBanner";
import { VoteBar, type VoteBarSegment } from "@/components/atoms/bars/VoteBar";
import { Figure } from "@/components/atoms/data/Figure";
import { Panel } from "@/components/atoms/surfaces/Panel";
import { DeputadoMetodologia } from "@/components/blocks/DeputadoMetodologia";
import { UfLinksGrid } from "@/components/blocks/UfLinksGrid";
import { Footer } from "@/components/layout/Footer";
import { SeloFasePreStyle } from "@/components/layout/SeloFasePreStyle";
import { cargoInfo } from "@/lib/config/cargos";
import { avaliarFrescorDado, fraseFrescorDado } from "@/lib/config/dado-freshness";
import { resultadoEleitoral, simulacaoDeputadoNacional } from "@/lib/dev/simulacao";
import { readDeputadoProjection } from "@/lib/edge-config/reader";
import type { EdgeAgremiacaoBancada, EdgePayloadDeputado } from "@/lib/edge-config/types";
import { formatPercent, formatVotes } from "@/lib/utils/format";
import { colorForParty } from "@/lib/utils/party-color";
import depFixture from "@/tests/fixtures/edge-config/dep-current.json" with { type: "json" };

/** Código TSE deste cargo. Tudo o que descreve o cargo sai da tabela canônica. */
const CARGO_DEPUTADO = 6 as const;
const DEPUTADO = cargoInfo(CARGO_DEPUTADO);

/** Total de unidades da federação — é geografia, não um número da eleição. */
const TOTAL_UFS = 27;

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Câmara dos Deputados 2026 · SalaCofre",
  description:
    "Como está a bancada da Câmara dos Deputados em 2026 com os votos já apurados, por partido e federação — 27 corridas proporcionais, turno único. Não oficial. Fonte: TSE.",
  alternates: { canonical: `/${DEPUTADO.slug}` },
  openGraph: {
    title: "Câmara dos Deputados 2026 · SalaCofre",
    description:
      "Como a bancada da Câmara está se formando, partido a partido e federação a federação, com os votos já contados.",
    type: "website",
    locale: "pt_BR",
    siteName: "SalaCofre",
  },
  twitter: {
    card: "summary_large_image",
    title: "Câmara dos Deputados 2026 · SalaCofre",
    description: "A bancada da Câmara com os votos já apurados, estado a estado.",
  },
};

// ---------------------------------------------------------------------------
// Derivações puras
// ---------------------------------------------------------------------------

/**
 * Ordem de exibição da bancada, com desempate explícito (constituição § 6):
 * cadeiras desc → sigla asc. É a mesma regra que o produtor do payload aplica
 * (design 017 § D5), reaplicada aqui de propósito — duas agremiações empatadas
 * em cadeiras trocariam de lugar entre ciclos se a ordem dependesse de uma
 * estabilidade que ninguém garantiu.
 */
function ordenarBancada(rows: readonly EdgeAgremiacaoBancada[]): EdgeAgremiacaoBancada[] {
  return [...rows].sort((a, b) => {
    if (b.cadeiras !== a.cadeiras) return b.cadeiras - a.cadeiras;
    return a.sigla.localeCompare(b.sigla, "pt-BR");
  });
}

/**
 * "PT, PCdoB e PV" — RF-122: a federação tem identidade própria, **e** os
 * partidos que a compõem precisam estar legíveis. Vazio quando é partido
 * isolado.
 */
function listarComponentes(componentes: readonly string[]): string {
  if (componentes.length === 0) return "";
  if (componentes.length === 1) return componentes[0] as string;
  return `${componentes.slice(0, -1).join(", ")} e ${componentes[componentes.length - 1]}`;
}

/**
 * Cor da agremiação — ADR-0024: token por sigla, **nunca** a cor oficial do
 * partido (constituição § 2, ΔE76 ≥ 10 garantido pelo gerador).
 *
 * **Um caminho só, sem ramo por `tipo`.** O ADR-0024 linha 41 manda a federação
 * usar a cor do partido-líder, e o payload passou a declarar quem é ele
 * (`sigla_lider`, design 017 § D5/D6, 2026-09-12). Em partido isolado o campo
 * vale a própria `sigla` — então perguntar `tipo` aqui seria reintroduzir uma
 * bifurcação que o contrato já eliminou, e ela é justamente onde o caso
 * "federação" voltaria a divergir sem ninguém notar.
 *
 * Até 12/09 federação caía em `--party-outros` porque o líder não existia no
 * payload. O fallback **continua**, agora só para o que ele sempre quis cobrir:
 * sigla sem token em `app/tokens-party.css` (partido novo, envelope degradado,
 * campo ausente) resolve para `--party-outros` dentro de `colorForParty`. Sigla
 * nova nunca vira cor ausente nem erro visual.
 */
function corDaAgremiacao(agr: EdgeAgremiacaoBancada): string {
  return colorForParty(agr.sigla_lider);
}

/**
 * Segmentos da barra de bancada: cada agremiação ocupa a fração das cadeiras
 * **publicadas** que ela conquistou, e o resto vira um segmento "aguardando"
 * explícito.
 *
 * Sem esse último segmento a barra pareceria cheia com 463 de 513 cadeiras
 * distribuídas, e o leitor concluiria que a Câmara já está formada.
 */
function segmentosDaBancada(payload: EdgePayloadDeputado): VoteBarSegment[] {
  const total = payload.bancada.total_cadeiras;
  if (total <= 0) return [];

  const segmentos: VoteBarSegment[] = ordenarBancada(payload.bancada.por_agremiacao)
    .filter((a) => a.cadeiras > 0)
    .map((a) => ({
      id: a.cod,
      label: a.sigla,
      pct: (a.cadeiras * 100) / total,
      color: corDaAgremiacao(a),
    }));

  const aguardando = Math.max(0, total - payload.bancada.cadeiras_atribuidas);
  if (aguardando > 0) {
    segmentos.push({
      id: "aguardando",
      label: "aguardando apuração",
      pct: (aguardando * 100) / total,
      color: "var(--surface-sunken)",
    });
  }
  return segmentos;
}

/**
 * RF-127 — o texto da contagem de cadeiras de uma agremiação.
 *
 * `cadeiras_ci95` é **opcional no contrato** (design 017 § D7): o intervalo
 * depende de rodar `distribuir_cadeiras` sobre cada resample do bootstrap, e
 * o custo disso ainda não foi medido contra a janela do cron. Enquanto ele não
 * existir, o que sai é o ponto central — e a metade de RF-127 que não depende
 * da medição, que é a marcação de cadeira indefinida.
 */
function intervaloDeCadeiras(agr: EdgeAgremiacaoBancada): string | null {
  const ci = agr.cadeiras_ci95;
  if (!ci) return null;
  const [lo, hi] = ci;
  return lo === hi ? `${lo}` : `${lo} a ${hi}`;
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default async function DeputadoFederalPage() {
  // Chave própria (`projection-current-dep-t1`) e função própria: o envelope
  // deste cargo não é `EdgePayload` (design 017 § D1), e `readProjection` nem
  // aceita `cargo: "dep"` — ver `CargoMajoritario` em `lib/edge-config/reader.ts`.
  //
  // Só em `pnpm dev` a fixture entra, para que a rota possa ser inspecionada
  // de verdade. Em teste (`NODE_ENV=test`) e em produção o caminho
  // "aguardando" continua sendo exercitado.
  // 🔴 Simulação ligada ⇒ ela é a fonte de verdade e o Global Config nem é
  // lido. Ver a nota gêmea em `app/(gov)/governador/page.tsx`.
  const payload = await resultadoEleitoral(
    () => simulacaoDeputadoNacional(),
    async () =>
      (await readDeputadoProjection()) ??
      (process.env.NODE_ENV === "development"
        ? (depFixture as unknown as EdgePayloadDeputado)
        : null),
  );

  if (!payload) return <AguardandoNacional />;

  const bancada = payload.bancada;
  const agremiacoes = ordenarBancada(bancada.por_agremiacao);
  const segmentos = segmentosDaBancada(payload);
  const aguardandoCadeiras = Math.max(0, bancada.total_cadeiras - bancada.cadeiras_atribuidas);

  // ADR-0038 D4. É nesta trilha que a diferença entre os dois relógios é maior:
  // o modelo roda e carimba `ts` muito mais vezes do que a varredura de 6
  // fatias renova o conjunto do dado (volta completa em 30 min, ADR-0036). O
  // limiar sai de `CADENCIA_SEGUNDOS[6]` × 3 = 5.400 s (90 min) — e não dos
  // 5 min do intervalo entre fatias, que é a leitura errada do cron.
  const frescorDado = avaliarFrescorDado(payload.dado_ts, payload.cargo);

  return (
    <main
      data-trilha="dep"
      className="mx-auto flex min-h-screen max-w-page flex-col px-4 py-6 md:px-6 md:py-10"
      style={{ gap: "var(--space-8)" }}
    >
      {/* Escopo nacional (o payload é o do país inteiro), mas esta trilha **não
          tem moldura de mapa**: `(dep)` não tem `layout.tsx` com
          `<PersistentMapFrame>`, então ninguém publica um `dado_ts` vivo para o
          cargo 6 e o banner fica com o veredito do servidor, como antes. É de
          propósito: sem relógio vivo, reavaliar por tempo faria o lag crescer
          para sempre e o aviso acenderia falsamente em toda aba deixada aberta
          por mais de 90 min. Quando esta trilha ganhar um poller de 30 min,
          basta ele registrar-se na store — este JSX não muda. */}
      <DadoParadoBanner frescor={frescorDado} />

      {/* Seção 1 — o enquadramento da corrida. O `<h1>` é o título deste
          painel (ADR-0029 § 5). */}
      <Panel
        kicker="Atlas Menna · apuração ao vivo · não oficial"
        title="Câmara dos Deputados 2026"
        titleId="camara-heading"
        headingLevel={1}
      >
        <div className="flex flex-col" style={{ gap: "var(--space-4)" }}>
          <p
            className="max-w-prose"
            data-testid="dep-cadeiras-label"
            style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}
          >
            {/* RF-124 + design 017 § D9.1. `total_cadeiras` é a soma dos
                `lugares_a_preencher` que o TSE JÁ publicou — e o D9.1 retirou
                do contrato a afirmação de que `carg[].nv` vem desde o primeiro
                ciclo (os únicos registros com o campo no banco são do nosso
                próprio mock). Se nenhuma UF o tiver publicado, a soma é 0, e
                "0 cadeiras em disputa" seria tão falso quanto cravar 513. */}
            {bancada.total_cadeiras > 0 ? (
              <>
                <strong>{bancada.total_cadeiras} cadeiras</strong> em disputa, em turno único e por
                sistema proporcional:{" "}
              </>
            ) : (
              <>
                O TSE ainda não publicou quantas cadeiras cada estado elege, então não há total a
                exibir. A eleição é em turno único e por sistema proporcional:{" "}
              </>
            )}
            quem ganha cadeira é a agremiação, e só depois ela é ocupada pelos candidatos mais
            votados dentro dela. Por isso um partido pode ganhar votos e <strong>perder</strong>{" "}
            cadeira. Não oficial. Fonte: TSE.
          </p>

          <div className="grid grid-cols-2" style={{ gap: "var(--space-4)" }}>
            <Figure
              label="Apurado"
              note={`${payload.ufs_apuradas} de ${TOTAL_UFS} estados com boletim`}
              unit="%"
              value={payload.pct_apurado_total.toLocaleString("pt-BR", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
            />
            <Figure
              label="Cadeiras definidas"
              note={`${
                bancada.total_cadeiras > 0 ? `de ${bancada.total_cadeiras} — ` : ""
              }${bancada.ufs_aguardando} ${
                bancada.ufs_aguardando === 1 ? "estado ainda sem" : "estados ainda sem"
              } boletim`}
              size="lg"
              value={String(bancada.cadeiras_atribuidas)}
            />
          </div>

          {/* RF-128 — o instante do payload. A frequência fica no bloco de
              metodologia, que é onde a explicação do método mora; aqui só o
              "de quando é este número".

              ADR-0038 D1: o "de quando" passou a ser a hora do DADO
              (`dado_ts`), não a hora em que o modelo rodou. `fraseFrescorDado`
              resolve os quatro estados num lugar só — inclusive o de payload
              pré-ADR, em que a frase volta a ser exatamente a de antes
              ("Atualizado às HH:MM:SS"), porque durante o canary a tela se
              comporta como se comportava. */}
          <p
            data-testid="dep-atualizacao"
            style={{
              margin: 0,
              font: "var(--type-data)",
              color: "var(--text-muted)",
            }}
          >
            {fraseFrescorDado(frescorDado, payload.ts)}
            {payload.atualizacao_min > 0
              ? `, a cada ${payload.atualizacao_min} ${
                  payload.atualizacao_min === 1 ? "minuto" : "minutos"
                }`
              : ""}
            .
          </p>
        </div>
      </Panel>

      {/* Seção 2 — a bancada. RF-122, RF-125.1, RF-127, RF-130. */}
      <Panel kicker="Bancada apurada" title="Quem fica com as cadeiras" titleId="bancada-heading">
        <div className="flex flex-col" style={{ gap: "var(--space-4)" }}>
          {/* Sem `marker`: não existe "maioria" a marcar. 257 de 513 é maioria
              simples da Câmara, mas nada nesta eleição se decide nela — e um
              traço em 50% sugeriria o contrário.
              `showLabels={false}`: o `<VoteBar>` rotula, por default, o
              primeiro e o segundo segmento — desenho de duelo majoritário.
              Numa bancada de onze agremiações isso imprimiria dois nomes
              arbitrários. A lista abaixo nomeia todas. */}
          <VoteBar
            ariaLabel={`Bancada de ${bancada.total_cadeiras} cadeiras, com os votos já apurados: ${agremiacoes
              .filter((a) => a.cadeiras > 0)
              .map((a) => `${a.sigla} ${a.cadeiras}`)
              .join(", ")}${
              aguardandoCadeiras > 0 ? `, ${aguardandoCadeiras} aguardando apuração` : ""
            }`}
            marker={null}
            segments={segmentos}
            showLabels={false}
          />

          <ul
            data-testid="bancada-agremiacoes"
            style={{ listStyle: "none", margin: 0, padding: 0, display: "grid" }}
          >
            {agremiacoes.map((agr) => {
              const intervalo = intervaloDeCadeiras(agr);
              const componentes = listarComponentes(agr.componentes);
              return (
                <li
                  key={agr.cod}
                  data-testid="bancada-linha"
                  data-cod={agr.cod}
                  className="grid items-baseline"
                  style={{
                    gridTemplateColumns: "3rem minmax(0, 1fr) auto",
                    columnGap: "var(--space-3)",
                    padding: "var(--space-3) 0",
                    borderBottom: "1px solid var(--border-hairline)",
                  }}
                >
                  {/* O rótulo é IRMÃO do número, não filho: `bancada-cadeiras`
                      precisa continuar valendo exatamente a contagem, porque é
                      sobre ela que RF-125.1 faz a asserção de que a tela mostra
                      `cadeiras` e nunca `vagas_obtidas`. Sem isto, o leitor de
                      tela ouve "89 ... 85 a 93" e adivinha qual é qual — a
                      distinção existe só na posição visual (WCAG 1.3.1). Achado
                      do gate de a11y de 13/09; o axe não pega, porque não é
                      regra técnica. Padrão de `StateResultSheet.tsx:223`. */}
                  <span style={{ font: "var(--type-figure-sm)", color: "var(--text-primary)" }}>
                    <span data-testid="bancada-cadeiras">{agr.cadeiras}</span>
                    <span className="sr-only"> cadeiras conquistadas</span>
                  </span>

                  <span className="min-w-0 flex flex-col" style={{ gap: "var(--space-1)" }}>
                    <span className="inline-flex items-center" style={{ gap: "var(--space-2)" }}>
                      {/* O ponto de cor é redundante com o texto, nunca o
                          portador único da informação (WCAG 1.4.1). */}
                      <span
                        aria-hidden="true"
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: corDaAgremiacao(agr),
                          flex: "none",
                        }}
                      />
                      <span style={{ font: "var(--type-body-sm)" }}>{agr.sigla}</span>
                    </span>

                    <span
                      style={{
                        font: "var(--type-body-sm)",
                        fontSize: "var(--text-xs)",
                        color: "var(--text-muted)",
                        textWrap: "pretty",
                      }}
                    >
                      {/* RF-122 — a federação é UMA agremiação, e os partidos
                          que a compõem ficam legíveis. */}
                      {agr.tipo === "federacao" && componentes.length > 0 ? (
                        <span data-testid="bancada-federacao">
                          {agr.nome} — federação de {componentes}.{" "}
                        </span>
                      ) : (
                        <span>{agr.nome}. </span>
                      )}
                      {/* RF-130 — legenda separada do nominal. Somá-los sem
                          dizer esconderia um fato que decide cadeira. */}
                      <span data-testid="bancada-votos">
                        {formatVotes(agr.votos_nominais)} votos nominais e{" "}
                        {formatVotes(agr.votos_legenda)} de legenda ({formatPercent(agr.pct_votos)}{" "}
                        dos válidos).
                      </span>
                      {/* RF-127 — a cadeira decidida em rodada de sobra vai
                          marcada. É a metade de RF-127 que não depende de o
                          intervalo existir (design 017 § D7). */}
                      {agr.cadeiras_indefinidas ? (
                        <span data-testid="bancada-indefinidas">
                          {" "}
                          {agr.cadeiras_indefinidas === 1
                            ? "1 dessas cadeiras ainda está indefinida — foi decidida em rodada de sobra, por margem apertada."
                            : `${agr.cadeiras_indefinidas} dessas cadeiras ainda estão indefinidas — foram decididas em rodada de sobra, por margem apertada.`}
                        </span>
                      ) : null}
                    </span>
                  </span>

                  {/* O rótulo precede o número e fica FORA do `data-testid`, que
                      continua valendo exatamente o texto visível. E nada aqui usa
                      `aria-hidden`: o teste (m4) conta `span[aria-hidden]` para
                      conferir os pontos de cor, e um a mais o quebraria — um
                      seletor existente é contrato, não detalhe. */}
                  <span
                    className="text-right"
                    style={{ font: "var(--type-data)", color: "var(--text-muted)" }}
                  >
                    <span className="sr-only">
                      {intervalo ? "faixa provável: " : "faixa não disponível "}
                    </span>
                    <span data-testid="bancada-intervalo">
                      {intervalo ? `${intervalo} cadeiras` : "—"}
                    </span>
                  </span>
                </li>
              );
            })}

            {aguardandoCadeiras > 0 ? (
              <li
                data-testid="bancada-aguardando"
                className="grid items-baseline"
                style={{
                  gridTemplateColumns: "3rem minmax(0, 1fr) auto",
                  columnGap: "var(--space-3)",
                  padding: "var(--space-3) 0",
                }}
              >
                <span style={{ font: "var(--type-figure-sm)", color: "var(--text-muted)" }}>
                  {aguardandoCadeiras}
                </span>
                <span style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>
                  cadeiras ainda sem dono — {bancada.ufs_aguardando} de {TOTAL_UFS} estados sem
                  boletim e vagas que a distribuição ainda não fechou.
                </span>
                <span />
              </li>
            ) : null}
          </ul>

          {/* Constituição § 8 — de onde vem o número. Os dois fatos que o
              leitor não tem como inferir da tela: que o agregado nacional é
              soma nossa, e que o próprio total de cadeiras é dado publicado,
              não constante. */}
          <p
            className="max-w-prose"
            data-testid="bancada-nota"
            style={{
              margin: 0,
              font: "var(--type-body-sm)",
              fontSize: "var(--text-xs)",
              color: "var(--text-muted)",
              textWrap: "pretty",
            }}
          >
            Esta contagem é a <strong>soma das {TOTAL_UFS} corridas estaduais</strong> — o TSE não
            publica um arquivo nacional para este cargo, então não existe um número oficial a
            reproduzir: o que existe são {TOTAL_UFS} apurações estaduais, e a soma é nossa. O total
            de {bancada.total_cadeiras} cadeiras também vem do dado publicado, estado a estado, e
            não de uma tabela guardada aqui — a redistribuição das cadeiras pelo Censo de 2022 ainda
            não tem desfecho. Cadeira contada é cadeira com candidato eleito: quando a conta de um
            partido dá direito a uma vaga que nenhum candidato dele pode ocupar, a vaga vai para as
            sobras e não aparece aqui.
          </p>
        </div>
      </Panel>

      {/* Seção 2b — destaques por template (ADR-0005, NUNCA LLM).
          **Hoje a lista vem vazia e isso não é erro** (design 017 § D10): os
          templates determinísticos da corrida proporcional não existem, e é o
          estado esperado no dia 15. Por isso o bloco é condicional em vez de
          um painel sempre presente com miolo vazio — um título "Destaques" sem
          nada embaixo diz ao leitor que algo falhou, quando nada falhou. Não é
          exceção ao ADR-0017: ali o que não pode sumir é dado que EXISTE. */}
      {payload.insights.length > 0 ? (
        <Panel kicker="Destaques" title="O que chama atenção" titleId="insights-heading">
          <ul
            data-testid="dep-insights"
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gap: "var(--space-2)",
            }}
          >
            {payload.insights.map((frase) => (
              <li key={frase} className="max-w-prose" style={{ font: "var(--type-body-sm)" }}>
                {frase}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {/* Seção 3 — as 27 corridas. É lista, não mapa: este cargo não tem dado
          municipal (ADR-0026 item 1). */}
      <Panel kicker="Corridas estaduais" title="Estado a estado" titleId="corridas-heading">
        {payload.por_uf.length > 0 ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid" }}>
            {payload.por_uf.map((uf) => (
              <li key={uf.sigla} style={{ borderBottom: "1px solid var(--border-hairline)" }}>
                <a
                  href={`/uf/${uf.sigla}/${DEPUTADO.slug}`}
                  data-testid="corrida-uf"
                  data-uf={uf.sigla}
                  className="grid items-center"
                  style={{
                    gridTemplateColumns: "2.5rem minmax(0, 1fr) auto",
                    columnGap: "var(--space-3)",
                    minHeight: "var(--tap-min)",
                    padding: "var(--space-3) 0",
                    color: "inherit",
                    textDecoration: "none",
                  }}
                >
                  <span style={{ font: "var(--type-figure-sm)" }}>{uf.sigla}</span>
                  <span
                    className="min-w-0 truncate"
                    style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}
                  >
                    {uf.lider
                      ? `maior bancada: ${uf.lider.sigla} (${uf.lider.cadeiras})`
                      : "aguardando apuração"}
                    {uf.empates_indeterminados > 0
                      ? ` · ${uf.empates_indeterminados} em empate sem desempate previsto`
                      : ""}
                    {uf.vagas_nao_preenchidas > 0
                      ? ` · ${uf.vagas_nao_preenchidas} vaga sem candidato elegível`
                      : ""}
                  </span>
                  <span
                    className="text-right"
                    data-testid="corrida-vagas"
                    style={{ font: "var(--type-data)", color: "var(--text-muted)" }}
                  >
                    {/* RF-124 — as vagas do estado saem do dado publicado.
                        `null` é "o TSE ainda não publicou", e não zero. */}
                    {uf.lugares_a_preencher == null
                      ? "vagas não publicadas"
                      : `${uf.cadeiras_definidas} de ${uf.lugares_a_preencher}`}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p
            className="max-w-prose"
            style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}
          >
            Nenhum estado apurado ainda. As {TOTAL_UFS} corridas aparecem aqui conforme o TSE
            divulga os primeiros boletins.
          </p>
        )}
      </Panel>

      {/* Seção 4 — constituição § 8 + design 017 § D9. */}
      <DeputadoMetodologia
        pctApurado={payload.pct_apurado_total}
        cadenciaMinutos={payload.atualizacao_min}
        // Derivado do payload, nunca fixo: sem zonas para reamostrar não há
        // faixa, e o texto do bloco precisa acompanhar sozinho (ADR-0036 fez
        // a frase anterior virar falsa na tela).
        temIntervalo={payload.bancada.por_agremiacao.some((a) => a.cadeiras_ci95 !== undefined)}
      />

      <Footer />
    </main>
  );
}

/**
 * Estado sem payload — a página **não some** (constituição § 3) e **não
 * inventa número** (design 017 § D8).
 *
 * Nenhuma contagem de cadeiras aparece aqui, nem 513 nem 0: sem payload não
 * sabemos quantas vagas o TSE publicou — e o § D9.1 registra que nem sequer
 * está confirmado que ele as publica antes do primeiro boletim. O bloco de
 * metodologia permanece, porque a constituição § 8 o exige em toda página que
 * exibe número de apuração — inclusive quando ainda não há número —, mas sem a
 * frase de cadência, que também viria do payload.
 *
 * ## RF-163 — Deputado Federal não é semeado, e esta tela ganha o aviso
 *
 * Decisão do dono do produto em 2026-09-13, e **não é opção em aberto**: o
 * semeador da spec 019 não grava nenhuma chave de cargo `dep`. A razão é que
 * esta tela lista **cadeiras por partido**, não pessoas — semeá-la produziria
 * "0 cadeiras" para cada legenda, que é a mesma mentira das outras telas em
 * outra unidade, e **nenhuma identidade ganharia**: não há onde pôr rosto aqui.
 * O ganho que justifica a fase pré nos outros três cargos não existe; sobra só
 * o custo.
 *
 * Então esta tela continua sem payload — e sem payload não há campo `fase` de
 * onde ler. `faseDoPayload(null)` devolve `"normal"` por construção
 * (`lib/config/fase.ts`), e é deliberado.
 *
 * **A faixa aqui é incondicional, e quem decide é o chamador** (design 019
 * § D5): este ramo JÁ significa "não há apuração publicada", e a faixa é a
 * afirmação em prosa do que o ramo já é. A alternativa — gatear por data de
 * calendário — foi rejeitada: relógio de servidor errado ou fuso mal resolvido
 * produziria a faixa no meio da noite de apuração.
 *
 * ## ✅ 2026-09-14 — a contradição com o RNF-010 fechada pelo TEXTO, não pela fiação
 *
 * A versão de 13/09 registrava aqui um custo assumido: este ramo também é onde
 * a página cai se o Global Config estiver indisponível em 04/10, e a faixa
 * diria "a eleição ainda não começou" **durante a apuração** — exatamente o que
 * o RNF-010 desaconselha (afirmar um fato sobre o calendário a partir de uma
 * falha de rede).
 *
 * A emenda do dono do produto resolve isso **mudando o texto, não a fiação**. A
 * faixa continua incondicional neste ramo — condicioná-la a alguma coisa seria
 * criar uma segunda fonte de fase, que é o defeito que a spec inteira existe
 * para evitar —, mas entra com `variante="sem_dados"`: ela diz que **esta
 * página não recebeu dados de apuração** e põe a data da votação ao lado, sem
 * ligar uma coisa à outra por causa. As duas frases são verdadeiras em
 * qualquer dia do calendário, inclusive às 21h de 04/10.
 *
 * 🔴 **A tentação recusada**: criar uma chave global de fase para dar evidência
 * positiva a esta tela. Em noite de apuração um interruptor global travado na
 * posição errada derruba tudo de uma vez; sinais independentes por cargo
 * degradam um de cada vez. O desenho atual já acertou nisso.
 *
 * O parágrafo `data-testid="dep-aguardando"` **continua presente e não é
 * reescrito** — é texto que três correções anteriores acertaram.
 */
function AguardandoNacional() {
  return (
    <main
      data-trilha="dep"
      className="mx-auto flex min-h-screen max-w-page flex-col px-4 py-6 md:px-6 md:py-10"
      style={{ gap: "var(--space-8)" }}
    >
      {/* 🔴 RF-160/RF-163 — PRIMEIRO FILHO do `<main>`, acima do parágrafo
          honesto. Teste de ORDEM, não de presença.

          A faixa continua **incondicional** neste ramo — simples, sem risco de
          sair de sincronia com a condição que trouxe a página até aqui. O que
          mudou em 2026-09-14 é o TEXTO: `variante="sem_dados"`. Ver a nota
          "⚠️ O custo assumido" no cabeçalho desta função, que este parágrafo
          responde. */}
      <FasePreEleicaoBanner
        corrida="a Câmara dos Deputados"
        variante="sem_dados"
        listaDeEstadosAbaixo
      />

      {/* RF-159 — o selo do `<TopBar>`. Esta rota nunca publicou custom
          property nenhuma; publica agora uma só, `variante="sem_dados"`
          (emenda de 2026-09-14).

          Esta tela é, por definição, a tela de quando não há payload — o
          RF-163 registra que o semeador não a alimenta. Publicar as três
          propriedades do selo afirmaria "a eleição ainda não começou" na
          barra do topo, que é a mesma frase que a faixa logo acima passou a
          recusar no mesmo dia. Sobra o segmentado "Parcial / Projeção",
          apagado por RF-161 — que não afirma calendário nenhum. */}
      <SeloFasePreStyle variante="sem_dados" />

      <Panel
        // RF-159, mesma correção em outra superfície: "apuração ao vivo" era
        // falso nesta tela em qualquer dia do calendário — ela é, por
        // definição, a tela de quando não há apuração. O parágrafo abaixo
        // continua intocado; só o kicker parou de afirmar o contrário dele.
        kicker="Atlas Menna · não oficial"
        title="Câmara dos Deputados 2026"
        titleId="camara-heading"
        headingLevel={1}
      >
        <p
          className="max-w-prose"
          data-testid="dep-aguardando"
          style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}
        >
          Aguardando o primeiro boletim. A bancada — por partido e por federação — aparece aqui
          assim que o TSE divulgar a apuração de algum estado, junto com o número de cadeiras em
          disputa, que também vem do dado publicado. Turno único, sistema proporcional. Não oficial.
          Fonte: TSE.
        </p>
      </Panel>

      {/* 🔴 2026-09-14 — o parágrafo "Nenhum estado apurado ainda. As 27
          corridas aparecem aqui conforme o TSE divulga os primeiros boletins."
          SAIU daqui, e ele era a única ocorrência de vocabulário de medição
          desta rota sem defesa.

          Por que ele era falso e não só feio: "nenhum estado apurado" é o
          PLACAR de um processo, e dar o placar pressupõe que o processo está em
          curso. Neste ramo não sabemos nem isso — ele é alcançado tanto antes de
          04/10 quanto durante uma queda do Global Config. Era medição de coisa
          nenhuma, no mesmo espírito da mentira nº 1 da tabela do design 019 § D2
          ("Todas as unidades federativas estão com a apuração concluída").

          O que ficou no lugar é a regra que a própria spec criou: **progresso é
          medição e cala; geografia é identidade e fala.** Os 27 links são
          verdadeiros em qualquer dia do calendário, e levam a
          `/uf/<sigla>/deputado-federal`, onde as 7.221 candidaturas publicáveis
          da spec 018 já aparecem — o outro endereço delas é
          `/candidatos?cargo=6`.

          As outras ocorrências desta rota FICAM: "Aguardando o primeiro
          boletim" (RF-163 manda preservá-la intacta, e ela descreve o NOSSO
          estado, não o do mundo) e as de `<DeputadoMetodologia>`, onde
          "projeção" aparece como negação. */}
      <Panel kicker="Corridas estaduais" title="Estado a estado" titleId="corridas-heading">
        <UfLinksGrid cargo={CARGO_DEPUTADO} />
      </Panel>

      {/* Sem payload não há cadência declarada nem granularidade a explicar:
          `cadenciaMinutos={0}` e `temDado={false}` fazem o bloco calar sobre as
          duas, em vez de inventar (§ D8). O `temDado` existe porque a primeira
          versão desta correção publicou, neste exato estado, a frase "lemos o
          boletim que o TSE publica por estado" — falso, porque aqui não se leu
          nada ainda. */}
      <DeputadoMetodologia pctApurado={0} cadenciaMinutos={0} temDado={false} />

      <Footer />
    </main>
  );
}
