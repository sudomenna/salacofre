/**
 * lib/utils/hover-card-placement.ts
 *
 * 2026-09-20 — decide onde o `<HoverCard>` (`components/atoms/overlays/HoverCard.tsx`)
 * abre dentro do contêiner do mapa: `flip`/`flipY` (vira de lado / vira para
 * cima) e a posição `x`/`y` efetivamente usada.
 *
 * ## O defeito que este arquivo substitui
 *
 * Até 2026-09-20, os dois mapas (`_NationalChoroplethMapImpl.tsx`,
 * `ChoroplethMapUF.tsx`) decidiam `flip`/`flipY` por um PROXY: "o ponteiro
 * passou da METADE do contêiner?" (`x > rect.width / 2`, `y > rect.height /
 * 2`). Essa pergunta é a errada — a que importa é "o cartão, do tamanho que
 * ele REALMENTE tem, cabe daqui até a borda?". As duas coincidem só quando o
 * cartão mede menos da metade do contêiner; num contêiner estreito (medido:
 * 624px de largura a 1024px de janela) e um cartão de 363px, a metade
 * (312px) e o ponto de transbordo real (`containerWidth − cardWidth − 12px`
 * ≈ 249px) ficam longe um do outro, e um estado hoverado entre os dois
 * (ex.: x≈294) faz o proxy dizer "não vira" exatamente onde o cartão
 * transborda.
 *
 * O próprio código já nomeava o remédio antes de aplicá-lo: "o remédio é
 * medir de verdade, não mexer no divisor" (nota de 2026-09-19 no `setTooltip`
 * de `_NationalChoroplethMapImpl.tsx`, agora superada por este arquivo).
 *
 * ## Onde a medição mora (e por que aqui, não no `<HoverCard>`)
 *
 * Este módulo é PURO — nenhuma leitura de DOM, nenhum hook. Quem mede o
 * cartão de verdade (`getBoundingClientRect` do nó renderizado) é o MAPA
 * (`_NationalChoroplethMapImpl.tsx`/`ChoroplethMapUF.tsx`, os dois já
 * `"use client"`), num `useLayoutEffect` que roda DEPOIS que o cartão
 * comitou ao DOM e ANTES do navegador pintar — a correção (se a estimativa
 * inicial errou o lado) troca de commit no MESMO frame, sem o usuário ver o
 * cartão "pular". O `<HoverCard>` continua sem `"use client"`, sem
 * `useLayoutEffect` e sem se medir: as três razões (bundle do chunk mais
 * apertado do projeto — RNF-007b —, `mousemove` a 16ms, e
 * `HoverCard.test.tsx` renderizando por `renderToStaticMarkup`, onde
 * `useLayoutEffect` nunca roda) continuam de pé, e é exatamente esta função
 * que preserva as três: ela não lê nada, só recebe números já medidos.
 *
 * O padrão de uso nos dois mapas:
 *   1. A cada `mousemove`/mudança de foco, chama esta função com o ÚLTIMO
 *      tamanho de cartão CONHECIDO (cache num `ref`, atualizado só quando o
 *      conteúdo muda — nunca a cada movimento) — decisão em aritmética pura,
 *      sem tocar o DOM, então não custa nada rodar a 60Hz.
 *   2. Um `useLayoutEffect`, disparado só quando o CONTEÚDO do balão muda
 *      (a UF/município hoverado, não a posição do ponteiro), mede o cartão
 *      de verdade e corrige o `flip`/`flipY`/`x`/`y` se a estimativa do
 *      passo 1 (feita com um tamanho desatualizado ou com o fallback inicial)
 *      tiver errado.
 *
 * ## O caso em que NENHUM dos dois lados cabe
 *
 * Cartão mais largo (alto) que o espaço disponível dos DOIS lados —
 * acontece tanto quando o cartão é mais largo que o CONTÊINER inteiro
 * (patológico: nunca medido no produto real, onde o teto de CSS do cartão é
 * `min(92vw, ...)`) quanto quando o ponteiro está numa faixa central estreita
 * onde nem abrir à direita nem virar para a esquerda cabem por completo — o
 * caso de RS a 1024px é exatamente este segundo tipo, não o primeiro.
 *
 * A decisão: SEMPRE cai para `flip = false` (`flipY = false`) com a borda
 * ESQUERDA (superior) do cartão presa em `0` — nunca deixa a borda que marca
 * o COMEÇO da leitura (esquerda/cima) sair do contêiner. Se o cartão couber
 * inteiro nessa orientação (é o caso comum — card mais estreito que o
 * contêiner, só o ponto de ancoragem que estava ruim), o resultado é um
 * cartão inteiramente visível, só não mais grudado no ponteiro. Se o cartão
 * for genuinamente mais largo/alto que o contêiner inteiro, a borda oposta
 * (direita/baixo) sangra para fora — a única alternativa seria sangrar pela
 * esquerda/cima, que corta o INÍCIO do texto (o nome do candidato, a coluna
 * "Proj.") em vez do fim; sangrar pelo fim é sempre o mal menor.
 */

export interface HoverCardPlacementInput {
  /** Posição do ponteiro/âncora, relativa ao contêiner do mapa, em px. */
  x: number;
  y: number;
  /** Dimensões do contêiner do mapa (`getBoundingClientRect()`), em px. */
  containerWidth: number;
  containerHeight: number;
  /** Dimensões REAIS do cartão renderizado (`getBoundingClientRect()` do nó
   * do `<HoverCard>`), ou o fallback documentado em
   * {@link HOVER_CARD_FALLBACK_SIZE} antes da 1ª medição. */
  cardWidth: number;
  cardHeight: number;
}

export interface HoverCardPlacement {
  /** `x`/`y` a passar para `<HoverCard>` — igual ao `x`/`y` de entrada,
   * exceto no caso "nenhum dos dois lados cabe" (ver docstring do módulo),
   * onde é ajustado para prender a borda esquerda/superior em `0`. */
  x: number;
  y: number;
  flip: boolean;
  flipY: boolean;
}

/**
 * Deslocamento do cartão em relação à âncora — tem de ser o MESMO valor que
 * `HoverCard.tsx` usa no `transform` (`translate(12px, 12px)` /
 * `translate(calc(-100% - 12px), 12px)`, etc.). Constante nomeada e não
 * duplicada como literal: os dois lados (o cálculo de "cabe?" aqui, o CSS
 * lá) têm de concordar, senão o cartão pode transbordar por exatamente os
 * pixels da diferença.
 */
export const HOVER_CARD_OFFSET_PX = 12;

/**
 * Tamanho usado enquanto o cartão de um conteúdo novo ainda não foi medido
 * de verdade (1ª renderização de cada UF/município hoverado, antes do
 * `useLayoutEffect` do mapa corrigir — ver docstring do módulo). Não precisa
 * ser exato: é corrigido no MESMO frame, antes do navegador pintar. Só
 * precisa existir para o primeiro cálculo (sem cache) ter algum número em
 * vez de `undefined`/`NaN`.
 *
 * Escolhido próximo ao piso real do cartão (`minWidth: 220` em
 * `HoverCard.tsx`) mais uma folga pequena — não o teto (`maxWidth`, até
 * ~496px com 3 colunas extras), porque superestimar sistematicamente faria a
 * ESTIMATIVA inicial virar com mais frequência do que o cartão real precisa,
 * e mesmo corrigido antes do paint, a escolha de flip/flipY errada nesse
 * frame poderia mudar qual filtro de destaque (`ufs-stroke-hover`) ou outro
 * efeito colateral síncrono roda primeiro — nenhum dos dois mapas tem
 * efeito colateral que dependa de flip/flipY hoje, mas mais perto do valor
 * típico real é estritamente mais seguro que mais perto do teto.
 */
export const HOVER_CARD_FALLBACK_SIZE = { width: 260, height: 96 } as const;

/**
 * Decide `flip`/`flipY` (vira de lado / vira para cima) e a posição efetiva
 * do `<HoverCard>`, a partir do tamanho REAL (ou estimado — ver
 * {@link HOVER_CARD_FALLBACK_SIZE}) do cartão. Substitui o proxy
 * `x > containerWidth / 2` (ver docstring do módulo).
 *
 * Pura, sem `Math.max`/`Math.min` escondendo comportamento: os três ramos
 * (cabe sem virar / cabe virando / não cabe de nenhum jeito) são explícitos.
 */
export function computeHoverCardPlacement({
  x,
  y,
  containerWidth,
  containerHeight,
  cardWidth,
  cardHeight,
}: HoverCardPlacementInput): HoverCardPlacement {
  const o = HOVER_CARD_OFFSET_PX;

  const cabeSemVirarX = x + o + cardWidth <= containerWidth;
  const cabeVirandoX = x - o - cardWidth >= 0;
  let flip: boolean;
  let outX: number;
  if (cabeSemVirarX) {
    flip = false;
    outX = x;
  } else if (cabeVirandoX) {
    flip = true;
    outX = x;
  } else {
    // Nem virando cabe — ver "O caso em que NENHUM dos dois lados cabe" no
    // topo do arquivo. Presa a borda ESQUERDA em 0: `x = -o` faz
    // `x + o (a borda esquerda real do cartão, ver HoverCard.tsx) = 0`.
    flip = false;
    outX = -o;
  }

  const cabeSemVirarY = y + o + cardHeight <= containerHeight;
  const cabeVirandoY = y - o - cardHeight >= 0;
  let flipY: boolean;
  let outY: number;
  if (cabeSemVirarY) {
    flipY = false;
    outY = y;
  } else if (cabeVirandoY) {
    flipY = true;
    outY = y;
  } else {
    // Simétrico ao horizontal — presa a borda SUPERIOR em 0.
    flipY = false;
    outY = -o;
  }

  return { x: outX, y: outY, flip, flipY };
}
