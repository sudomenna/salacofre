/**
 * components/layout/SeloFasePreStyle.tsx
 *
 * **RF-159 (spec 019)** — o que uma página em fase pré-eleição publica para o
 * selo do `<TopBar>`.
 *
 * ## Por que uma regra CSS e não uma prop
 *
 * `app/layout.tsx` não pode ler o Edge Config nem `searchParams`/`cookies()` —
 * qualquer um dos dois tira a home e as 54 páginas de UF do pré-render
 * estático (ADR-0025 §§ 2 e 5). E `<TopBar>`, sendo irmão **anterior** de
 * `{children}`, não recebe props da página. A ponte que o ADR-0029 § 4
 * desenhou é uma custom property em `:root`, que herda para o documento
 * inteiro — inclusive para trás, para a barra do topo.
 *
 * ## Três propriedades publicadas, e duas deliberadamente ausentes
 *
 * | publica | efeito |
 * |---|---|
 * | `--live-badge-display: inline-flex` | o selo existe. A página TEM um estado a reportar, e ele é "ainda não começou". |
 * | `--live-pct-label: "antes da votação"` | o rótulo visível. Não afirma liveness e não contém percentual: não há o que medir. |
 * | `--live-sr-pre: inline` | revela a frase acessível da fase pré, que já mora no DOM do selo. |
 *
 * **Não** publica `--live-dot-state` — o ponto fica `paused`, estático: um
 * ponto pulsando afirma que algo está acontecendo **agora**, e o problema aqui
 * não é movimento (disso `prefers-reduced-motion` já cuida), é a afirmação.
 *
 * **Não** publica `--live-sr-ao-vivo` — que faria o leitor de tela ouvir
 * "Apuração ao vivo" sobre uma eleição que não começou. As duas frases estão
 * as duas no DOM do selo e uma custom property decide qual tem `display: none`;
 * `content` de CSS **não** conserta texto acessível (design 019 § D6).
 *
 * As cinco propriedades têm o silêncio como default, então a ausência de duas
 * delas aqui é, literalmente, a afirmação que esta página escolhe **não**
 * fazer.
 *
 * ## E em fase normal?
 *
 * Nada. Este componente só é montado sob `isPreEleicao(payload)`. Uma rota que
 * não publica nada não mostra selo nenhum — que é o comportamento correto de
 * `/candidatos`, `/sobre-o-modelo` e `/status`, e das três telas de cargo que
 * nunca tiveram percentual próprio no selo.
 *
 * ## O quarto passageiro: `--shell-viewmode-display`
 *
 * Este `<style>` também apaga o segmentado **"Parcial / Projeção"** da barra do
 * topo (`ShellControls.module.css`), e é a única coisa aqui que não é sobre o
 * selo. Mora junto porque o mecanismo é o mesmo e o momento é o mesmo: é o
 * pacote do que uma página em fase pré tem a dizer ao shell.
 *
 * Duas razões independentes, cada uma suficiente:
 *
 *   1. **RF-161** — o rótulo visível é a palavra que a spec proíbe em toda a
 *      tela em fase pré, e a métrica de aceitação é varrida sobre o HTML
 *      renderizado, no qual o shell está incluído. A spec nomeia `note`,
 *      `aria-label`, `title` e legenda como os lugares por onde a palavra vaza
 *      "sem ninguém revisar"; a barra do topo é um quinto.
 *   2. É um **controle que não controla nada** — o mesmo argumento que tira o
 *      `<MapViewToggle>` da moldura do mapa (RF-157). Ele alterna a ênfase
 *      entre duas colunas de percentual que, em fase pré, não existem.
 *
 * O `<TurnoSwitch>` ao lado **fica**: "1º turno / 2º turno" é um fato sobre o
 * calendário eleitoral, não uma medição, e nenhuma palavra dele está na lista
 * negra.
 *
 * ## ⚠️ Emenda de 2026-09-14 — o quarto passageiro viaja sozinho
 *
 * As quatro propriedades acima moravam juntas e saíam **sempre juntas**, e é
 * aí que estava o defeito: as três primeiras AFIRMAM ("a eleição ainda não
 * começou") e a quarta apenas ESCONDE um controle inútil. São duas
 * responsabilidades, e os ramos de espera das quatro telas de cargo precisam
 * exatamente de uma delas.
 *
 * Um ramo de espera significa "**não recebemos dados**" — o que, às 21h de
 * 04/10, pode ser uma falha de rede. A regra do dono é que a tela nunca afirme
 * uma causa que não mediu: `<FasePreEleicaoBanner>` e `<ForecastTransparency>`
 * já se recusam a dizer aquela frase ali, e o selo do topo — uma camada acima,
 * fora do `<main>` que os testes de página varrem — continuava dizendo a mesma
 * frase na mesma tela. Medido em 2026-09-14 nas três telas que montavam este
 * componente no ramo de espera.
 *
 * Daí {@link SeloFasePreStyleProps.variante}, com o mesmo union e o mesmo
 * default das outras duas superfícies da spec:
 *
 * | variante | publica | quem usa |
 * |---|---|---|
 * | `"nao_comecou"` (default) | as **quatro** | os ramos semeados, cujo payload traz `fase` |
 * | `"sem_dados"` | só `--shell-viewmode-display:none` | os quatro ramos de espera |
 *
 * Em `"sem_dados"` as três do selo ficam **sem publicar**, e o selo cai no
 * default silencioso (`--live-badge-display: none`): nenhuma barra, nenhuma
 * afirmação. O segmentado continua escondido nos dois casos porque o argumento
 * dele nunca foi sobre o calendário — é um controle que alterna a ênfase entre
 * duas colunas de percentual que, sem payload, também não existem.
 */

import type { VarianteFasePreEleicao } from "@/components/atoms/banners/FasePreEleicaoBanner";

export interface SeloFasePreStyleProps {
  /**
   * Qual dos dois pacotes a página publica ao shell. Default `"nao_comecou"` —
   * o comportamento histórico, correto para quem tem o campo `fase` medido no
   * payload. Os ramos de espera, que não têm payload nenhum, passam
   * `"sem_dados"`.
   *
   * ⚠️ A escolha é do **chamador**, como em `<FasePreEleicaoBanner>`: este
   * componente não lê payload e não adivinha. Quem sabe se houve medição é
   * quem tentou ler o Global Config.
   */
  variante?: VarianteFasePreEleicao;
}

export function SeloFasePreStyle({ variante = "nao_comecou" }: SeloFasePreStyleProps = {}) {
  // RF-161 — vale nas duas variantes: o rótulo do segmentado carrega a palavra
  // que a spec proíbe, e o controle não controla nada em nenhuma das duas.
  const segmentado = "--shell-viewmode-display:none";
  if (variante === "sem_dados") return <style>{`:root{${segmentado}}`}</style>;
  return (
    <style>
      {`:root{--live-badge-display:inline-flex;--live-pct-label:"antes da votação";--live-sr-pre:inline;${segmentado}}`}
    </style>
  );
}
