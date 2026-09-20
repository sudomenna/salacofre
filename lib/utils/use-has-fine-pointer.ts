"use client";

/**
 * lib/utils/use-has-fine-pointer.ts
 *
 * 2026-09-20 — pedido do dono: "no mobile ao clicar no estado não deve abrir
 * o balão, mas apenas a gaveta". O sintoma real era mais amplo do que
 * "mobile": Safari e Chrome em qualquer aparelho de TOQUE emitem um
 * `mousemove` sintético IMEDIATAMENTE ANTES do `click` — a premissa oposta
 * ("em touch não há mousemove antes do tap") estava cravada em dois
 * comentários (`_NationalChoroplethMapImpl.tsx`, `ChoroplethMapUF.tsx`) e
 * era falsa nos dois lugares. Sem guarda nenhuma, esse `mousemove` sintético
 * abria o `<HoverCard>`, e como `mouseleave` nunca dispara em toque, o balão
 * ficava preso NA FRENTE da gaveta que o `click` seguinte abria.
 *
 * ## Por que "capacidade de ponteiro", e não "largura da tela"
 *
 * `NationalChoroplethMap.tsx` já tinha um predicado para "isto é desktop?" —
 * `useIsDesktop()`, `(min-width: 960px)` — e até 2026-09-19 ele também
 * decidia se o clique numa UF navegava direto para a página do estado
 * (`navegarNoClique`) ou abria a folha. Largura mede o TAMANHO da tela, não
 * se ela tem mouse: um iPad Pro a 1024px casa com `min-width: 960px` e por
 * isso era tratado como desktop — tocar nele NAVEGAVA em vez de abrir a
 * gaveta, o oposto exato do que o dono pediu agora. Na direção inversa, uma
 * janela de desktop redimensionada para 500px (mouse de verdade, tela
 * estreita) seria tratada como mobile.
 *
 * `(hover: hover) and (pointer: fine)` é a pergunta certa: "este aparelho
 * consegue PAIRAR um cursor preciso?" — verdadeiro para mouse/trackpad,
 * falso para dedo/caneta, **independente da largura da janela**. É
 * literalmente a dupla condição que o MDN recomenda para distinguir
 * "ponteiro fino" de toque (https://developer.mozilla.org/.../pointer,
 * combinado com `hover` porque um `pointer: fine` sozinho ainda casa com
 * alguma caneta sem hover).
 *
 * `useIsDesktop()` (`NationalChoroplethMap.tsx`) **continua existindo,
 * inalterado, e agora governa só UMA coisa**: a FORMA da
 * `<StateResultSheet>` (`Sheet.side` — cartão lateral vs. modal de baixo),
 * uma decisão de LAYOUT que depende de espaço disponível, não de haver
 * mouse. As duas perguntas são independentes e não devem compartilhar hook:
 * um iPad Pro touch e largo deve abrir a gaveta (este hook: `false`) na
 * forma de cartão lateral (`useIsDesktop`: `true`) — nenhum dos dois
 * predicados está "errado" isoladamente, cada um responde à sua própria
 * pergunta.
 *
 * ## SSR-safe, mesmo padrão de `useIsDesktop`
 *
 * `window.matchMedia` não existe no render de servidor — o estado nasce com
 * um valor fixo e só é corrigido no `useEffect` (cliente). O valor inicial
 * aqui é `true` (assume ponteiro fino), o INVERSO do `false` de
 * `useIsDesktop`: lá o conservador é "assume mobile" (não navega sem
 * confirmar espaço); aqui o conservador-por-compatibilidade é "assume mouse"
 * — é o comportamento que o produto SEMPRE teve antes desta correção
 * (nenhuma guarda, balão sempre abria no `mousemove`), e é o valor com que
 * cada consumidor deste hook (`NationalChoroplethMap.tsx`) já documenta a
 * prop que deriva dele como tendo default equivalente. Na prática o valor
 * inicial quase nunca é observado: nenhum `mousemove`/`click` real acontece
 * antes da hidratação, e o efeito abaixo resolve o valor verdadeiro no MESMO
 * commit de montagem.
 *
 * Quem consome isto num handler registrado UMA VEZ (mapas MapLibre, cujo
 * efeito de montagem roda com deps `[]`) precisa ler o valor de uma REF
 * sincronizada por efeito, nunca de closure — mesma armadilha documentada em
 * `navegarNoCliqueRef` (`_NationalChoroplethMapImpl.tsx`).
 */

import { useEffect, useState } from "react";

const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

export function useHasFinePointer(): boolean {
  const [fino, setFino] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia(FINE_POINTER_QUERY);
    setFino(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setFino(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return fino;
}
