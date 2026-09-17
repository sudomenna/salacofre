/**
 * components/atoms/banners/FasePreEleicaoBanner.tsx
 *
 * **RF-160 (spec 019) — camada A do aviso de fase pré-eleição.** A faixa que
 * diz, em prosa e antes de qualquer outra coisa, que a eleição ainda não
 * começou.
 *
 * ## Por que uma faixa, e por que ela é o primeiro filho do `<main>`
 *
 * A partir da spec 019 as telas de cargo exibem o placar **zerado com os
 * candidatos reais**. Um placar zerado exibe a FORMA de um resultado, e a
 * leitura natural de um humano apressado não é "ainda não começou" — é
 * "começou e ninguém pontuou". Essa objeção foi levantada por escrito, a
 * decisão do dono foi mantida, e o risco está registrado como **assumido e
 * não eliminável** (spec 019 § Riscos, R1).
 *
 * O que esta faixa faz é reduzir a probabilidade: ela é a primeira coisa que
 * o leitor encontra dentro do `<main>` — antes do kicker, antes do `<h1>`,
 * antes de qualquer painel. O teste do RF-160 é de **ordem**, não de
 * presença: um teste de presença passaria com a faixa enterrada no rodapé, que
 * é exatamente a versão inútil dela. Mesma lição do RF-149 da spec 018.
 *
 * ## Três divergências deliberadas do molde
 *
 * O molde de POSIÇÃO é `components/atoms/banners/DadoParadoBanner.tsx` — faixa
 * irmã dos painéis, fora de `<Panel>`, na mesma camada de
 * `<NationalWinnerBanner>` e `<BreakingNewsTicker>` (ADR-0029 § 1). Três
 * coisas mudam, e cada uma tem razão própria:
 *
 * | | `DadoParadoBanner` | esta faixa |
 * |---|---|---|
 * | cliente ou servidor | `"use client"` — reavalia com o tempo contra a store de frescor | **Server Component puro.** O estado não muda enquanto a página está aberta: a transição de 04/10 é uma gravação no Edge Config, que só alcança um render novo. Um banner que entra depois da hidratação é CLS medido exatamente onde mais dói (RNF-002). |
 * | cor | âmbar (`--accent-soft`) = "algo está errado" | tinta **neutra** do kit. Aqui nada está errado — o produto está funcionando como projetado. Reusar o âmbar treinaria o leitor a ignorar o âmbar quando ele significar de fato uma falha (RNF-022). |
 * | semântica | `role="status"` + `aria-live` | `<section aria-labelledby>`, **nunca** `role="alert"` (ver abaixo). |
 *
 * ## Nem `role="alert"`, nem botão de fechar
 *
 * `alert` interrompe o leitor de tela e existe para mudança **inesperada e
 * urgente**. Este é um estado estável de semanas, anunciado a cada navegação;
 * como alerta ele vira ruído que treina o usuário a ignorar alertas de verdade
 * (RNF-023). `<section aria-labelledby>` entra no sumário de regiões, é
 * alcançável pela navegação por landmarks e não interrompe ninguém.
 *
 * E **não há dispensa**: nenhum `×`, nenhum `localStorage`, nenhum cookie. Um
 * aviso que o leitor pode fechar produz, do segundo acesso em diante,
 * exatamente a tela contra a qual a spec 019 inteira foi escrita. A faixa
 * também não é focável — não tem controle nenhum —, então não acrescenta
 * parada na ordem de tabulação (RNF-024).
 *
 * ## O texto diz um fato sobre o mundo — quando ele foi medido
 *
 * "Aguardando", "carregando" e "em breve" descrevem um software esperando
 * alguma coisa. O leitor não precisa disso: ele precisa saber que **a votação
 * ainda não aconteceu** e em que dia ela acontece. Por isso a data aparece por
 * extenso, e por isso o verbo é do mundo ("a eleição ainda não começou"), não
 * da máquina.
 *
 * ⚠️ **Emenda de 2026-09-14.** Isso vale enquanto o payload semeado afirma a
 * fase. Quando não há payload nenhum — chave não gravada, ou leitura que
 * falhou — o sistema **não mediu** o estado do mundo, e afirmar "a eleição
 * ainda não começou" ali seria transformar uma falha de rede numa afirmação
 * sobre o calendário. Nesse ramo a faixa fala sobre **nós** e acrescenta o
 * fato de calendário ao lado, sem ligar um ao outro. Ver
 * {@link VarianteFasePreEleicao}.
 */

import type { CSSProperties } from "react";

/**
 * A data da votação, escrita uma vez.
 *
 * ⚠️ É texto de interface, **não** um gatilho: nada neste componente, nem em
 * quem o monta, compara esta data com o relógio. A fase vem do campo `fase` do
 * payload e de mais nada (ADR-0043 D6) — um gate de calendário congelaria no
 * build (`revalidate`) e um fuso mal resolvido produziria esta faixa no meio da
 * noite de apuração.
 */
export const DATA_VOTACAO_1T = "4 de outubro de 2026";

/**
 * 🔴 **As duas coisas que esta faixa pode dizer, e por que são duas.**
 *
 * A tela precisa distinguir **três** estados, e dois deles chegam aqui:
 *
 * | estado | como sabemos | variante |
 * |---|---|---|
 * | **não começou** | o payload traz o campo de fase semeado | `"nao_comecou"` |
 * | **não sabemos** | não veio payload — ausente OU falha de leitura | `"sem_dados"` |
 * | **está apurando** | veio payload sem `fase` | faixa nenhuma |
 *
 * A regra que separa as duas primeiras é uma só: **a tela nunca afirma uma
 * causa que não mediu.** "A eleição ainda não começou" é um fato sobre o
 * mundo, e só pode ser dito quando alguém o mediu e gravou no payload. Quando
 * o sistema não sabe, ele fala **sobre si mesmo** ("esta página ainda não
 * recebeu dados de apuração") — porque a outra frase, dita às 21h de 04/10
 * durante uma falha de rede, é falsa com toda a autoridade da marca
 * (RNF-010, spec 019 § open question 3).
 *
 * ⚠️ **A escolha é do CHAMADOR, nunca uma inferência interna.** Este
 * componente não lê payload, não lê relógio e não adivinha: quem sabe em que
 * estado está é quem tentou ler o Global Config. Uma inferência aqui seria o
 * mesmo erro que a guarda do mapa nacional cometeu — a condição escrita onde
 * era conveniente, e não onde era completa.
 *
 * ⚠️ E os valores deste union **não** reusam o literal do campo `fase` de
 * propósito. `"nao_comecou"` seria mais legível se reusasse o literal do campo
 * de fase, e é exatamente por isso que não reusa: a guarda estrutural do RF-153
 * (`tests/unit/config/fase.test.ts`) varre `app/` e `components/` e reprova
 * qualquer ocorrência daquele literal fora de `lib/config/fase.ts`, do tipo do
 * payload e do semeador. Esta prop é um NOME DE TEXTO, não o campo de fase —
 * misturar os dois vocabulários é o primeiro passo para alguém comparar o
 * literal solto num componente.
 */
export type VarianteFasePreEleicao = "nao_comecou" | "sem_dados";

export interface FasePreEleicaoBannerProps {
  /**
   * Qual das duas afirmações a faixa faz. Default `"nao_comecou"` — a
   * evidência positiva, usada pelas telas cujo payload semeado traz `fase`.
   * Os ramos de espera, que não têm payload nenhum, passam `"sem_dados"`.
   */
  variante?: VarianteFasePreEleicao;
  /**
   * Como a corrida é nomeada na frase — "a Presidência", "os governos
   * estaduais", "o Senado". Omitido, a frase fala só da eleição.
   *
   * Existe porque as quatro telas dizem a mesma coisa sobre cargos
   * diferentes, e uma faixa que diz "a eleição" na tela de Senador é verdadeira
   * e vaga; nomear a corrida custa três palavras.
   */
  corrida?: string;
  /**
   * 🔴 **A faixa só promete a lista de estados se a página de fato a tiver.**
   *
   * A redação de `"sem_dados"` terminava, sem condição, em "abaixo estão os
   * estados, que é o que dá para mostrar sem medir nada". Verdade nas três
   * telas que a estrearam — `/governador`, `/senador` e `/deputado-federal`
   * montam `<UfLinksGrid>` logo abaixo —, e **falsa** na home, que no ramo de
   * espera tem a grade de candidaturas e nenhum estado. Em 2026-09-14 a faixa
   * passou a alcançar a home, e a oração viria junto: uma frase que descreve o
   * conteúdo da página, dita por um componente que não vê o conteúdo da página.
   *
   * O default é `false` — **sem promessa**. Uma tela que ganhe a faixa amanhã
   * e esqueça esta prop deixa de dizer algo verdadeiro; o default oposto a
   * faria dizer algo falso, e é essa a assimetria que escolhe o default.
   */
  listaDeEstadosAbaixo?: boolean;
  /**
   * `id` do heading — vira o `aria-labelledby` da `<section>`. Precisa ser
   * único no documento; o default serve à esmagadora maioria dos casos, em que
   * há uma faixa por página.
   */
  headingId?: string;
  className?: string;
  style?: CSSProperties;
}

export function FasePreEleicaoBanner({
  corrida,
  variante = "nao_comecou",
  listaDeEstadosAbaixo = false,
  headingId = "fase-pre-eleicao-heading",
  className,
  style,
}: FasePreEleicaoBannerProps) {
  const semDados = variante === "sem_dados";
  const votacao = `A votação ${corrida ? `para ${corrida} ` : ""}é em ${DATA_VOTACAO_1T}.`;
  return (
    <section
      aria-labelledby={headingId}
      data-testid="fase-pre-eleicao-banner"
      className={className}
      style={{
        // Tinta neutra do kit. `--surface-sunken` (= `--paper-2`) contra
        // `--text-primary` (= `--ink-0`) passa folgado nos dois temas; o filete
        // à esquerda usa `--border-strong`, que é traço e não texto.
        background: "var(--surface-sunken)",
        color: "var(--text-primary)",
        borderLeft: "3px solid var(--border-strong)",
        padding: "var(--space-3) var(--space-4)",
        ...style,
      }}
    >
      {/* `<h2>` real, e não um `<p>` em caixa alta: é o que dá nome à região
          para quem navega por landmarks. `sr-only` porque a frase logo abaixo
          já diz visualmente o mesmo, e imprimir as duas seria repetição para
          quem enxerga. */}
      <h2 className="sr-only" id={headingId}>
        {semDados
          ? "Esta página ainda não recebeu dados de apuração"
          : "A eleição ainda não começou"}
      </h2>
      {semDados ? (
        /* 🔴 Duas frases, e a ordem entre elas é deliberada: primeiro o que
           NÓS sabemos (não recebemos nada), depois o fato de calendário. As
           duas são verdadeiras em qualquer dia — inclusive às 21h de 04/10,
           que é o teste de qualquer texto deste ramo — e **não** estão ligadas
           por causa: a segunda não explica a primeira, e nenhuma conjunção
           sugere que explique. Dizer "não recebemos dados PORQUE a eleição não
           começou" seria exatamente a afirmação que não medimos. */
        <p
          className="max-w-prose"
          data-testid="fase-pre-eleicao-texto"
          data-variante="sem_dados"
          style={{ margin: 0, font: "var(--type-body-sm)" }}
        >
          <strong>Esta página ainda não recebeu dados de apuração.</strong> {votacao} Nenhum número
          desta tela mede a corrida
          {listaDeEstadosAbaixo
            ? " — abaixo estão os estados, que é o que dá para mostrar sem medir nada."
            : "."}
        </p>
      ) : (
        <p
          className="max-w-prose"
          data-testid="fase-pre-eleicao-texto"
          data-variante="nao_comecou"
          style={{ margin: 0, font: "var(--type-body-sm)" }}
        >
          <strong>A eleição ainda não começou.</strong> {votacao} Até lá esta página mostra quem
          está concorrendo — nenhum voto foi contado, e nenhum número desta tela mede a corrida.
        </p>
      )}
    </section>
  );
}
