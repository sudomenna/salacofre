/**
 * lib/utils/sigla-partido.ts
 *
 * A sigla do partido **como ela é desenhada na tela** — `siglaExibicao("REPUBLICANOS")`
 * → `"REP"`. Nada mais: o dado continua carregando a sigla inteira, e é a
 * sigla inteira que casa cor, chave de payload e comparação.
 *
 * ---------------------------------------------------------------------------
 * Por que isto existe (2026-09-19, pedido do dono)
 * ---------------------------------------------------------------------------
 * É um problema de largura, medido, não de gosto. `CandidateResultRow.tsx:266-271`
 * registra o caso: em `/uf/RS/governador` a 1280×900, na coluna de 400 px do
 * `<AppShellSplit>` (ADR-0033 § 1), a linha "Gov RS REPUBLICANOS" pedia 174 px
 * e recebia 49 px — virava "Gov …". As cinco siglas abaixo são as que o dono
 * escolheu encurtar depois de olhar as telas.
 *
 * ---------------------------------------------------------------------------
 * 🔴 Por que a lista é FECHADA, e não um corte automático por comprimento
 * ---------------------------------------------------------------------------
 * A tentação óbvia — "toda sigla com mais de N letras vira as 3 primeiras" —
 * é pior de três maneiras, e todas as três aparecem em 2026:
 *
 *   1. **Inventaria sigla que ninguém aprovou.** "PODEMOS" tem 7 letras e
 *      também estoura a coluna, e o dono NÃO pediu para abreviá-la. Um corte
 *      genérico publicaria "POD" na tela de uma eleição nacional por decisão
 *      de um `slice(0, 3)`. Sigla de partido é nome próprio de uma instituição
 *      registrada no TSE — quem decide como ela aparece é o dono do produto,
 *      não uma regra de comprimento.
 *   2. **Colidiria.** "DEMOCRATA" e "DC" (Democracia Cristã) convivem na
 *      paleta de `app/tokens-party.css`; "MOBILIZA" e "MDB" também. Três
 *      letras não separam um espaço de nomes que ninguém desenhou para ser
 *      cortado em três letras, e duas siglas diferentes lidas iguais na tela é
 *      erro eleitoral, não erro de layout.
 *   3. **Mudaria sozinha.** Partido novo, fusão, federação reconfigurada: a
 *      cada ciclo o corte automático produziria abreviações novas sem ninguém
 *      revisar. Com a tabela explícita, sigla nova aparece inteira — feio,
 *      talvez, mas CORRETO — até alguém decidir o contrário.
 *
 * Daí a regra dura: **sigla fora da tabela volta inalterada**. Sem
 * `?? primeiras 3 letras`, sem truncagem de resgate, sem reticências.
 *
 * ---------------------------------------------------------------------------
 * 🔴 O que este módulo NÃO faz
 * ---------------------------------------------------------------------------
 *   - **Não toca em cor.** `lib/utils/party-color.ts` mapeia a sigla INTEIRA
 *     para o token (ADR-0024). Abreviar antes de pedir a cor jogaria
 *     "REPUBLICANOS" em `--party-outros` e quebraria a identidade visual —
 *     constituição § 2. Cor sempre da sigla completa.
 *   - **Não toca no dado.** `lib/edge-config/`, `api/model/` e as fixtures
 *     seguem publicando a sigla inteira. Abreviar no payload perderia
 *     informação e quebraria todo casamento por sigla.
 *   - **Não fala.** O que é LIDO em voz alta (`aria-label`, `title`,
 *     `sr-only`) mantém a sigla inteira — ver a seção abaixo.
 *
 * ---------------------------------------------------------------------------
 * 🔊 Visto ≠ ouvido: a abreviação é só de pixel (decisão de 2026-09-19)
 * ---------------------------------------------------------------------------
 * A regra do produto, aplicada em todos os chamadores:
 *
 *   - **É desenhado na página** (chip, coluna, rótulo, o `(PARTIDO)` colado ao
 *     nome) → **abrevia**. A largura é finita e disputada.
 *   - **É lido** — `aria-label`, `title` de SVG, bloco `sr-only`, `<caption>`,
 *     tabela paralela de leitor de tela → **inteiro**. Ali não há largura em
 *     disputa: nada se ganha encurtando, e "REP" dito em voz alta é ambíguo
 *     (o leitor de tela pode soletrar ou pronunciar como palavra), enquanto
 *     "REPUBLICANOS" é exatamente o que o TSE publica e o que a pessoa vai
 *     comparar com qualquer outra fonte.
 *
 * O custo dessa escolha é real e fica registrado: no mesmo elemento, o texto
 * visto e o texto ouvido passam a divergir. Ele é aceitável porque a WCAG
 * 2.5.3 (Label in Name) — a norma que essa divergência ameaça — vale para o
 * **rótulo de um controle**, e neste produto a sigla nunca é o rótulo de
 * nada: ela é dado ao lado de um nome de candidato ou de uma UF, e é o nome
 * ou a UF que alguém diria em comando de voz. Onde a sigla chega a fazer
 * parte do rótulo visível de um botão — as pílulas de `<StrongholdsPanel>`,
 * onde ela entra como desempate de nomes iguais — o nome acessível é
 * calculado a partir do CONTEÚDO do botão, então o texto visível abreviado já
 * está dentro dele e a 2.5.3 continua satisfeita.
 *
 * ---------------------------------------------------------------------------
 * Sem React, sem `"use client"`
 * ---------------------------------------------------------------------------
 * Mesmo precedente de `lib/utils/uf-href.ts` e `lib/utils/margem-senado.ts`
 * (os dois criados hoje pelo mesmo motivo): `_NationalChoroplethMapImpl.tsx` é
 * o chunk lazy do MapLibre e o que tem menos folga no RNF-007b. Módulo puro
 * entra nele sem arrastar componente junto. Este arquivo não importa React e
 * não deve ganhar nem React nem `"use client"`.
 *
 * Também não importa `party-color.ts`: a normalização daqui é de três linhas e
 * copiá-la custa menos que puxar `KNOWN_PARTY_SLUGS` (31 entradas) para dentro
 * do chunk lazy. São duas perguntas diferentes sobre a mesma sigla — "que cor
 * ela tem" e "como ela cabe" — e nenhuma das duas precisa da outra.
 */

/**
 * As cinco abreviações, escolhidas pelo dono em 2026-09-19 olhando as telas.
 *
 * Chave: a sigla normalizada (sem acento, sem espaço nas pontas, em caixa
 * alta). Valor: a forma exata que o dono escreveu — é ela que vai à tela,
 * qualquer que tenha sido a caixa da entrada.
 *
 * Acrescentar uma linha aqui é uma decisão editorial, não uma otimização de
 * layout. Quem quiser encurtar mais uma sigla pergunta ao dono primeiro.
 */
export const ABREVIACOES_DE_SIGLA: Readonly<Record<string, string>> = Object.freeze({
  REPUBLICANOS: "REP",
  CIDADANIA: "CID",
  SOLIDARIEDADE: "SOL",
  DEMOCRATA: "DEM",
  MOBILIZA: "MOB",
});

/**
 * Chave de busca: sem diacrítico, sem espaço nas pontas, caixa alta.
 *
 * Case-insensitive porque o dado do TSE chega na caixa que o TSE quiser —
 * `lib/utils/party-color.ts` já documenta `" pt "`, `"PT"`, `"União"` como
 * formas plausíveis da mesma coisa no payload. Comparar sem normalizar
 * deixaria "Republicanos" (a forma que o EA20 usa em vários campos) passar
 * inteiro pela tabela e voltar à coluna estreita que motivou tudo isto.
 */
function chave(sigla: string): string {
  return sigla.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
}

/**
 * A sigla como ela deve ser DESENHADA. Listada → abreviada; qualquer outra
 * coisa → devolvida exatamente como chegou.
 *
 *   siglaExibicao("REPUBLICANOS")  === "REP"
 *   siglaExibicao("Republicanos")  === "REP"
 *   siglaExibicao("PODEMOS")       === "PODEMOS"   // não listada, não corta
 *   siglaExibicao("PT")            === "PT"
 *   siglaExibicao("—")             === "—"         // o travessão de "sem dado"
 *
 * Recebe e devolve `string`, nunca nulo: os chamadores que podem não ter
 * partido já resolvem o ausente no próprio JSX (`row.partido ?? "—"`,
 * `lider?.partido ?? "?"`), e é sobre o resultado disso que esta função roda —
 * o travessão e a interrogação não estão na tabela e atravessam intactos.
 * Aceitar nulo aqui só moveria a decisão de "o que aparece quando não há
 * partido" para dentro de um utilitário que não sabe responder.
 */
export function siglaExibicao(sigla: string): string {
  return ABREVIACOES_DE_SIGLA[chave(sigla)] ?? sigla;
}
