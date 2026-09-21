"use client";

/**
 * components/blocks/ReordenaListaPorBase.tsx
 *
 * Reordena, **no DOM**, as linhas da lista de candidatos quando o leitor troca
 * a base ativa no controle "Parcial / Projeção".
 *
 * ## Por que isto existe
 *
 * Até 2026-09-20 a reordenação era só de PINTURA: `app/globals.css` aplicava
 * `order: var(--ord-<base>)` e o documento continuava na ordem da Projeção.
 * `order` move pixel, não move documento — então leitor de tela, navegação por
 * teclado, `Ctrl+F` e **copiar-colar** recebiam a lista na ordem antiga, com a
 * numeração da base nova. Ouvia-se "3º, 1º, 2º".
 *
 * É WCAG **SC 1.3.2 (Meaningful Sequence), nível A**. Estava registrado como
 * não-conformidade aceita em `docs/nfr/accessibility.md` e como dívida 17 em
 * `docs/reference/dividas-tecnicas.md`. Este componente a resolve.
 *
 * ## Por que NÃO custa bundle de payload
 *
 * O dado para reordenar **já está no DOM**: cada `<li>` carrega
 * `--ord-parcial` e `--ord-proj` como custom properties inline
 * (`ResultPanel.tsx`), que é o que as regras de `order` liam. Este módulo lê os
 * mesmos números. Não recebe candidato, não recebe payload, não arrasta
 * `<CandidateResultRow>` nem `<PartyTag>` para o cliente — que é o custo que
 * o ADR-0025 / RNF-007a barraram quando a alternativa considerada foi
 * "transformar o painel em Client Component".
 *
 * A outra alternativa medida — emitir as DUAS listas e esconder uma — custava
 * **+312 nós e ~42 KB** acima da dobra em toda visita, inclusive nas noites em
 * que as duas ordens coincidem. Ver o bloco "Por que `order` e não duas
 * listas" em `app/globals.css`, que preserva a conta.
 *
 * ## 🔴 Por que reordenar o DOM à mão não briga com o React
 *
 * Medido em 2026-09-20 com o React 19 deste projeto, três cenários: re-render
 * do wrapper cliente (`<CandidateListCollapse>`, que tem `useState`), dois
 * re-renders seguidos, e re-render do PAI com a mesma vdom. **A ordem
 * imperativa sobreviveu aos três.**
 *
 * A razão é estrutural, não sorte: o React só toca na ordem do DOM quando a
 * ordem da **vdom dele** muda. Aqui ela nunca muda — `<ResultPanel>` e
 * `<CandidateResultRow>` são Server Components, e o polling de
 * `<PersistentMapFrame>` não alcança este painel. As linhas chegam a
 * `<CandidateListCollapse>` por `children`, já renderizadas pelo servidor.
 *
 * ⚠️ **A invariante de que isso depende**: a lista é emitida pelo servidor
 * numa ordem fixa e nunca re-renderizada com ordem diferente. Se algum dia o
 * painel virar Client Component, ou passar a receber dado novo por polling,
 * este módulo passa a brigar com a reconciliação e precisa ser repensado.
 *
 * ## 🔴 O foco do teclado PRECISA ser devolvido
 *
 * Medido no Chrome em 2026-09-20: mover o `<li>` que contém o elemento focado
 * joga `document.activeElement` para o `<body>`. Quem estava navegando por
 * teclado perde o lugar no meio da lista.
 *
 * Daí o par guardar/devolver com `preventScroll: true` — sem a flag, devolver
 * o foco rola a página até o elemento, e trocar de base daria um salto de
 * rolagem que ninguém pediu.
 */

import { useEffect } from "react";
import { useViewMode } from "@/lib/state/view-mode-client";

/**
 * Marca o `<ol>` cujas linhas devem seguir a base ativa.
 *
 * 🔴 A lista de IDENTIDADE (`data-testid="result-identidade-lista"`, fase pré)
 * **não** recebe este atributo, e isso é constitucional, não esquecimento:
 * sem voto contado não há métrica do leitor para seguir, e a constituição § 2
 * (v1.5) mantém a ordem fixa fora do caso do controle de base — ali é o número
 * na urna (spec 019, RF-161). A exceção da v1.5 é expressa e não a alcança.
 */
export const ATRIBUTO_LISTA = "data-lista-por-base";

/** A custom property que guarda a posição da linha em cada base. */
function posicaoNaBase(li: HTMLElement, base: "parcial" | "proj"): number {
  const bruto = li.style.getPropertyValue(`--ord-${base}`).trim();
  const n = Number.parseInt(bruto, 10);
  // Linha sem a propriedade fica onde está: `Number.MAX_SAFE_INTEGER` a manda
  // para o fim sem embaralhar as demais, e `sort` é estável no V8. Não é caso
  // esperado — `ResultPanel` sempre emite as duas —, mas um `NaN` no
  // comparador embaralharia a lista inteira em silêncio.
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

/**
 * Reordena uma lista. Exportada para o teste medir sem montar React.
 *
 * Idempotente: chamar duas vezes na mesma base não muda nada, o que é o que
 * permite montar o componente mais de uma vez por página sem coordenação.
 */
export function reordenarLista(lista: HTMLElement, base: "parcial" | "proj"): void {
  const linhas = [...lista.children].filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.tagName === "LI",
  );
  if (linhas.length < 2) return;

  const alvo = [...linhas].sort((a, b) => posicaoNaBase(a, base) - posicaoNaBase(b, base));
  // Já está na ordem certa? Sai sem tocar no DOM — e sem mexer no foco.
  if (alvo.every((li, i) => li === linhas[i])) return;

  const focado = document.activeElement;
  // `append` com a lista inteira move os nós existentes na ordem dada, numa
  // única operação. Não clona: os mesmos nós, com o mesmo estado e os mesmos
  // ouvintes, mudam de lugar.
  lista.append(...alvo);

  // Ver o docblock: mover o `<li>` do elemento focado tira o foco dele.
  if (
    focado instanceof HTMLElement &&
    focado !== document.body &&
    lista.contains(focado) &&
    typeof focado.focus === "function"
  ) {
    focado.focus({ preventScroll: true });
  }
}

/**
 * Componente sem marcação. Montado por `<ResultPanel>`, reordena **todas** as
 * listas marcadas do documento a cada troca de base.
 *
 * Reordenar todas, e não só "a sua", é deliberado: uma instância não tem
 * referência ao `<ol>` irmão (as linhas atravessam a fronteira servidor →
 * cliente por `children`, e o `<ol>` do colapso gera o próprio `id` com
 * `useId`). Como `reordenarLista` é idempotente, duas instâncias na mesma
 * página fazem o trabalho uma vez e a outra sai no `every` acima.
 */
export function ReordenaListaPorBase() {
  const base = useViewMode();

  useEffect(() => {
    for (const lista of document.querySelectorAll<HTMLElement>(`[${ATRIBUTO_LISTA}]`)) {
      reordenarLista(lista, base);
    }
  }, [base]);

  return null;
}
