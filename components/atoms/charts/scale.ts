/**
 * components/atoms/charts/scale.ts
 *
 * A aritmética de escala compartilhada pelos gráficos SVG feitos à mão. Sem
 * D3, sem Recharts — constituição § 9 e RNF-007a (bundle acima da dobra).
 *
 * Extraída de `TimeSeriesChart` em 2026-09-17 (design da spec 020 § 5) porque
 * o `<SerieApuracaoChart>` é **irmão, não extensão** daquele componente: dele
 * só se reusam estas ~13 linhas, e estender o componente inteiro quebraria o
 * único teste que fixa seu contrato sem nenhum benefício.
 *
 * ## 🔴 Dois eixos horizontais, duas funções — nunca um parâmetro de modo
 *
 * `TimeSeriesChart` posiciona cada ponto pela **posição na fila** (o índice do
 * array). Isso é correto para o que ele desenha e **errado** para uma noite de
 * apuração: se o TSE atrasa 20 minutos entre dois boletins, o eixo por índice
 * desenha esse intervalo com a mesma largura de um intervalo de 5 minutos, e o
 * buraco — que é a notícia — some do gráfico. O eixo do
 * `<SerieApuracaoChart>` é o RELÓGIO (`dado_ts`, ADR-0038), e um atraso tem de
 * aparecer como espaço.
 *
 * Os dois modos existem, portanto, e a decisão de forma é:
 *
 *   **duas funções nomeadas — {@link makeScale} (índice) e
 *   {@link makeTimeScale} (relógio) — e nenhum parâmetro `modo`.**
 *
 * Um `makeScale({ …, modo: "tempo" | "indice" })` seria mais curto e é
 * exatamente a forma que este repositório já foi mordido três vezes: um
 * conversor com ramo de fallback silencioso perto de cargo, turno ou
 * granularidade (`docs/reference/risks.md`; o último mandava todo payload de
 * Senador para a chave do Presidente). Com duas funções, escolher o eixo
 * errado é um nome errado na chamada — visível na revisão e no diff —, nunca
 * um argumento omitido que cai num default.
 *
 * O eixo **vertical** é o mesmo nos dois, e mora num só lugar
 * ({@link verticalScale}): é ele que garante que as duas bases (apurado e
 * projeção) desenhem contra a MESMA régua, que é o que o RF-172(d) exige —
 * escalas diferentes fariam a alternância parecer mudança de resultado.
 */

/** Geometria comum: a moldura e a função vertical. */
export interface EscalaBase {
  /** Largura útil, já descontado o padding horizontal dos dois lados. */
  innerW: number;
  /** Altura útil, já descontado o padding vertical dos dois lados. */
  innerH: number;
  /** Valor do domínio → coordenada `y` em unidades SVG (topo = `yMax`). */
  yFor: (valor: number) => number;
}

export interface EscalaPorIndice extends EscalaBase {
  /** Índice do ponto (0-based) → coordenada `x` em unidades SVG. */
  xFor: (indice: number) => number;
}

export interface EscalaPorTempo extends EscalaBase {
  /**
   * Instante em **epoch ms** → coordenada `x`. Deliberadamente não aceita a
   * string ISO: converter é responsabilidade de quem tem o dado, e uma data
   * inválida viraria `NaN` silencioso dentro de um `path`.
   */
  xFor: (epochMs: number) => number;
}

export interface MakeScaleArgs {
  width: number;
  height: number;
  padX: number;
  padY: number;
  /** Quantidade de pontos do eixo. */
  n: number;
  yMin: number;
  yMax: number;
}

/**
 * 🔴 Quatro lados, não dois — e nenhum deles opcional.
 *
 * `makeScale` continua com `padX`/`padY` porque os três gráficos que a chamam
 * são simétricos e não têm por que deixar de ser. `makeTimeScale` tem **um
 * consumidor só** (`<SerieApuracaoChart>`), e ali os quatro lados pagam contas
 * diferentes: à esquerda mora a régua de percentual, à direita só o raio do
 * ponto final, em cima só o glifo do rótulo do topo, embaixo a fileira de
 * rótulos de hora. Cobrar de cada lado a folga do lado mais caro gastava 29%
 * da caixa em papel em branco.
 *
 * Os quatro são **obrigatórios**, e não opcionais com default em `padX`/`padY`.
 * Um default aqui teria duas fontes de verdade para a mesma folga — a forma
 * exata que o bloco no topo deste arquivo recusa para o eixo horizontal, e que
 * `docs/reference/risks.md` registra como já tendo mordido este repositório
 * três vezes. Com os quatro obrigatórios, esquecer um é erro de tipo na
 * chamada; com default, é um gráfico torto que ninguém vê até a noite de 04/10.
 */
export interface MakeTimeScaleArgs {
  width: number;
  height: number;
  /** Folga à ESQUERDA. É onde a régua de percentual mora. */
  padLeft: number;
  /** Folga à DIREITA. Só precisa caber o ponto final e o rótulo da hora final. */
  padRight: number;
  /** Folga ACIMA. Só precisa caber o glifo do rótulo do topo da régua. */
  padTop: number;
  /** Folga ABAIXO. É onde a fileira de rótulos de hora mora. */
  padBottom: number;
  /** Primeiro instante do eixo, em epoch ms. */
  tMin: number;
  /** Último instante do eixo, em epoch ms. */
  tMax: number;
  yMin: number;
  yMax: number;
}

/**
 * O eixo vertical, comum aos dois modos.
 *
 * Recebe os dois lados **separados** (`padTop`, `padBottom`) porque eles pagam
 * contas diferentes — ver o bloco de {@link MakeTimeScaleArgs}. `makeScale`
 * passa o mesmo valor nos dois, de modo que `innerH` continua sendo
 * `height - 2 * padY` para quem já chamava: `<TimeSeriesChart>`,
 * `<ProbabilityOverTime>` e `<TurnoutAreaChart>` saem byte a byte iguais ao que
 * saíam antes desta mudança, que é a promessa do topo deste módulo.
 *
 * Exportada porque o estado "antes do dia" do `<SerieApuracaoChart>` desenha a
 * mesma régua sem ter eixo de tempo nenhum para pendurar nela. Ou ele reusa
 * esta função, ou reimplementa a reta — e duas retas é como as duas versões da
 * régua divergiriam sem ninguém notar.
 *
 * `yMax - yMin || 1` preserva, literalmente, o comportamento que
 * `TimeSeriesChart` tinha desde 2026-09-08: domínio degenerado (todos os
 * valores iguais) não divide por zero — a linha sai colada no topo em vez de
 * virar `NaN`. Mudar isso aqui mudaria o gráfico existente, e este módulo
 * nasceu para NÃO mudá-lo.
 */
export function verticalScale(
  height: number,
  padTop: number,
  padBottom: number,
  yMin: number,
  yMax: number,
): { innerH: number; yFor: (valor: number) => number } {
  const innerH = height - padTop - padBottom;
  const yRange = yMax - yMin || 1;
  return { innerH, yFor: (valor: number) => padTop + ((yMax - valor) / yRange) * innerH };
}

/**
 * Escala com eixo horizontal por **posição na fila**.
 *
 * É o que `<TimeSeriesChart>`, `<ProbabilityOverTime>` e `<TurnoutAreaChart>`
 * querem: séries de cadência regular em que o índice *é* o tempo, e onde um
 * ponto faltante já foi resolvido antes de chegar ao componente.
 *
 * Com `n <= 1` o único ponto vai ao centro da área útil — o mesmo que a versão
 * inline fazia, e a leitura honesta: sem dois pontos não há inclinação, e
 * ancorar no canto esquerdo sugeriria uma série começando ali.
 */
export function makeScale({
  width,
  height,
  padX,
  padY,
  n,
  yMin,
  yMax,
}: MakeScaleArgs): EscalaPorIndice {
  const innerW = width - 2 * padX;
  // Os dois lados verticais recebem o MESMO `padY`: é assim que `innerH`
  // continua valendo `height - 2 * padY` e o gráfico existente não se move.
  const { innerH, yFor } = verticalScale(height, padY, padY, yMin, yMax);
  return {
    innerW,
    innerH,
    yFor,
    xFor: (indice: number) => padX + (n > 1 ? (indice / (n - 1)) * innerW : innerW / 2),
  };
}

/**
 * Escala com eixo horizontal por **relógio**.
 *
 * A distância entre dois pontos é proporcional ao tempo decorrido entre eles,
 * de modo que um ciclo perdido aparece como um vão largo e não como mais um
 * passo do mesmo tamanho. É a razão de existir desta função — ver o bloco no
 * topo do arquivo.
 *
 * `tMax === tMin` (um ponto só, ou todos no mesmo instante) cai no centro,
 * pela mesma razão do `n <= 1` de {@link makeScale}.
 */
export function makeTimeScale({
  width,
  height,
  padLeft,
  padRight,
  padTop,
  padBottom,
  tMin,
  tMax,
  yMin,
  yMax,
}: MakeTimeScaleArgs): EscalaPorTempo {
  const innerW = width - padLeft - padRight;
  const { innerH, yFor } = verticalScale(height, padTop, padBottom, yMin, yMax);
  const span = tMax - tMin;
  return {
    innerW,
    innerH,
    yFor,
    xFor: (epochMs: number) =>
      span > 0 ? padLeft + ((epochMs - tMin) / span) * innerW : padLeft + innerW / 2,
  };
}
