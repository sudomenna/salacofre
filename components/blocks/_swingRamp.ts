/**
 * components/blocks/_swingRamp.ts — a rampa da vista "variação desde 2022".
 *
 * ## Por que isto virou módulo próprio em 2026-09-18 (3ª sessão)
 *
 * A lógica morava dentro de `_NationalChoroplethMapImpl.tsx`, que importa
 * `maplibre-gl` e o CSS dele. Um teste unitário desse arquivo arrasta o
 * MapLibre inteiro para o `happy-dom` — e foi por isso que a pintura do mapa
 * ficou, desde a S04, com o comentário *"validado em e2e Playwright"* apontando
 * para `tests/e2e/national-map.spec.ts`, **um arquivo que nunca foi escrito**.
 * Resultado: a função de cor da vista de swing nunca teve teste nenhum.
 *
 * Aqui ela é pura e sem dependência de DOM (o leitor de token entra por
 * parâmetro), então dá para medir de verdade.
 */

/** Lê um token CSS. Injetado para o teste poder usar uma paleta conhecida. */
export type LeitorDeToken = (nome: string) => string;

/**
 * Cor de uma UF na vista `swing`.
 *
 * 🔴 **Até 18/09 esta rampa NÃO distinguia a direção.** As duas pontas caíam no
 * MESMO token:
 *
 *     if (swing > 0) return abs >= 10 ? band-very_likely : band-likely;
 *     return            abs >= 10 ? band-very_likely : band-lean;
 *                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^ idêntico
 *
 * Uma UF que SUBIU 15 pontos e uma que CAIU 15 pintavam igual. O defeito era
 * invisível porque `swing_vs_2022` era `None` em toda UF — o mapa inteiro caía
 * no ramo `< 2`. Ele só passou a importar no commit que ligou o número real. E
 * o comentário antigo já declarava a intenção certa ("ocre pro positivo, cinza
 * pro negativo"); ela nunca tinha sido implementada.
 *
 * Agora é divergente de verdade: **cinza para queda, ocre para alta**. Medida em
 * ΔE76 — a métrica perceptual que a constituição § 2 usa para separar partidos,
 * piso **10** —, porque razão de contraste é medida de LUMINÂNCIA e não enxerga
 * matiz: dois tons de luminância parecida e matiz oposta passam despercebidos
 * por ela. Medido em 18/09:
 *
 *   | par                                  | claro | escuro |
 *   |--------------------------------------|-------|--------|
 *   | queda forte × alta forte  (era 0,0!) |  68,0 |   69,9 |
 *   | queda leve  × alta leve              |  37,8 |   32,5 |
 *   | neutro      × queda leve             |  30,0 |   18,6 |
 *   | neutro      × alta leve              |  14,3 |   17,4 |
 *
 * ⚠️ `--color-band-lean` saiu da rampa: com quatro degraus e um neutro, ele não
 * tinha posição que sobrevivesse ao piso de ΔE.
 *
 * Swing não tem dono partidário (é um delta), então a paleta é neutra — a cor
 * por partido do ADR-0024 não se aplica aqui.
 */
export function swingToColor(swing: number, getVar: LeitorDeToken): string {
  const abs = Math.abs(swing);
  if (abs < 2) return getVar("--color-tossup");
  // A DIREÇÃO muda de família de cor, não só a intensidade.
  if (swing > 0) return abs >= 10 ? getVar("--accent") : getVar("--accent-soft");
  return abs >= 10 ? getVar("--color-band-very_likely") : getVar("--color-band-likely");
}

/** Opacidade padrão do preenchimento — a mesma da montagem da camada. */
export const FILL_OPACITY = 0.88;

/**
 * Expressão de `fill-opacity` da camada `ufs-fill`.
 *
 * 🔴 **O terceiro estado.** Antes de 18/09 o impl fazia `swingToColor(swing ?? 0)`:
 * uma UF **sem comparação possível** com 2022 (partido que não existia, ou que
 * não teve voto ali) pintava com a cor de **"não mudou"**. Enquanto o número era
 * `None` em toda UF isso era inofensivo — o mapa inteiro era neutro. A partir do
 * commit que ligou o número real os dois estados convivem na mesma tela, e
 * viraram indistinguíveis. É exatamente o erro que a decisão do dono de 14/09 já
 * nomeia: *"não começou / não sabemos / apurando são TRÊS estados"*.
 *
 * A saída foi **ausência de preenchimento**, não outra cor: medido em ΔE76,
 * nenhum token da paleta fica a 10 do neutro da rampa — `--map-uncounted` ×
 * `--color-tossup` dá **4,4** no claro e **6,8** no escuro. Pintar de cinza claro
 * seria trocar um estado indistinguível por outro. Sem preenchimento, o halo
 * (`ufs-stroke-halo` + `ufs-stroke`) continua desenhando a fronteira: a UF segue
 * visível como FORMA e não afirma medição nenhuma.
 *
 * Fora da vista `swing`, devolve o escalar de sempre — senão a opacidade zerada
 * de uma UF ficaria de resíduo ao alternar de vista.
 */
export function fillOpacityExpression(
  view: string,
  rows: { sigla: string; swing_vs_2022: number | null }[],
): number | (string | number | unknown[])[] {
  if (view !== "swing") return FILL_OPACITY;
  const semComparacao = rows.filter((r) => r.swing_vs_2022 === null);
  if (semComparacao.length === 0) return FILL_OPACITY;

  // 🔴 E o caso que só a TELA mostrou: quando NENHUMA UF tem comparação, zerar
  // todas deixa o mapa inteiro em branco — 27 contornos vazios, sem uma palavra
  // dizendo por quê. Visto em 18/09 no modo simulado, que não tem 2022: parece
  // defeito, não parece informação. E vai acontecer em produção se
  // `historical_results` estiver vazia para o cargo/turno.
  //
  // A ambiguidade que o preenchimento zero resolve só existe quando os DOIS
  // estados convivem na mesma tela. Se não há nenhum degrau da rampa para
  // confundir, `--map-uncounted` — o cinza que este mapa já usa para "sem dado"
  // — volta a ser não-ambíguo, e o mapa parece o que é: sem dado.
  if (semComparacao.length === rows.length) return FILL_OPACITY;
  const expr: (string | number | unknown[])[] = ["match", ["get", "SIGLA_UF"]];
  for (const row of semComparacao) expr.push(row.sigla, 0);
  expr.push(FILL_OPACITY);
  return expr;
}
