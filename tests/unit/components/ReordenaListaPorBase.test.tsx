// @vitest-environment happy-dom
/**
 * tests/unit/components/ReordenaListaPorBase.test.tsx
 *
 * **O gate do SC 1.3.2 na lista de candidatos** — a ordem do DOM acompanha a
 * ordem visual.
 *
 * ## O defeito que este arquivo fecha
 *
 * De `290b8de` (2026-09-20) até este commit, a lista reordenava só na PINTURA:
 * `app/globals.css` aplicava `order: var(--ord-<base>)` e o documento ficava
 * na ordem da Projeção. Leitor de tela, teclado, `Ctrl+F` e copiar-colar
 * recebiam a lista fora de ordem, com a numeração da base nova — WCAG
 * **SC 1.3.2 (Meaningful Sequence), nível A**.
 *
 * ⚠️ **Os 22 casos de `ResultPanel.ordemPorBase.test.tsx` não pegavam isso**,
 * e é a lição deste arquivo: eles mediam as custom properties e a existência
 * da regra CSS — a INTENÇÃO de reordenar. Nenhum media a ordem em que os nós
 * de fato estão. Removi a regra de `order` e os 22 continuaram verdes.
 *
 * Aqui a asserção é a ordem dos `<li>` no DOM, depois da troca de base.
 *
 * ## Por que não há teste de pixel
 *
 * `getBoundingClientRect()` devolve zero no happy-dom (armadilha já registrada
 * neste repositório), então "ordem visual" não se mede aqui. O que se mede é a
 * ordem do DOM — que, **desde que não exista regra de `order`**, É a ordem
 * visual. Por isso o caso (d) de `ResultPanel.ordemPorBase.test.tsx` guarda a
 * ausência daquela regra: é ele que sustenta a equivalência de que este
 * arquivo depende.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ATRIBUTO_LISTA,
  ReordenaListaPorBase,
  reordenarLista,
} from "@/components/blocks/ReordenaListaPorBase";
import { __resetViewModeForTests, setViewMode } from "@/lib/state/view-mode-client";

// biome-ignore lint/suspicious/noExplicitAny: flag global do ambiente de `act`
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Fixture com as duas ordens OPOSTAS de propósito — só assim um teste que
 * ignore `--ord-parcial` (ou que não reordene nada) é discriminado.
 *
 *   linha   --ord-proj   --ord-parcial
 *   A            0             2
 *   B            1             1
 *   C            2             0
 */
function montarLista(): HTMLElement {
  const ol = document.createElement("ol");
  ol.setAttribute(ATRIBUTO_LISTA, "");
  for (const [nome, proj, parcial] of [
    ["A", 0, 2],
    ["B", 1, 1],
    ["C", 2, 0],
  ] as const) {
    const li = document.createElement("li");
    li.setAttribute("data-ord", "proj");
    li.style.setProperty("--ord-proj", String(proj));
    li.style.setProperty("--ord-parcial", String(parcial));
    const a = document.createElement("a");
    a.href = "#";
    a.id = `link-${nome}`;
    a.textContent = nome;
    li.appendChild(a);
    ol.appendChild(li);
  }
  document.body.appendChild(ol);
  return ol;
}

const ordem = (ol: HTMLElement) => [...ol.querySelectorAll("li")].map((li) => li.textContent);

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => __resetViewModeForTests());
afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  document.body.innerHTML = "";
  __resetViewModeForTests();
});

describe("reordenarLista — a função pura", () => {
  it("🔴 na base `parcial` a ordem do DOM INVERTE: C, B, A", () => {
    // Mutação que morre: ler `--ord-proj` nos dois ramos.
    const ol = montarLista();
    expect(ordem(ol)).toEqual(["A", "B", "C"]);

    reordenarLista(ol, "parcial");
    expect(ordem(ol)).toEqual(["C", "B", "A"]);
  });

  it("na base `proj` volta a A, B, C", () => {
    const ol = montarLista();
    reordenarLista(ol, "parcial");
    reordenarLista(ol, "proj");
    expect(ordem(ol)).toEqual(["A", "B", "C"]);
  });

  it("é idempotente — duas chamadas na mesma base não mexem no DOM", () => {
    // É isto que permite montar o componente mais de uma vez por página sem
    // coordenação entre as instâncias.
    const ol = montarLista();
    reordenarLista(ol, "parcial");
    const antes = ol.querySelector("li");
    reordenarLista(ol, "parcial");
    expect(ordem(ol)).toEqual(["C", "B", "A"]);
    expect(ol.querySelector("li")).toBe(antes); // o MESMO nó, não um recriado
  });

  it("🔴 o foco sobrevive à reordenação", () => {
    // Medido no Chrome em 2026-09-20: mover o `<li>` que contém o elemento
    // focado joga o foco para o `<body>`. Sem o par guardar/devolver, quem
    // navega por teclado perde o lugar ao trocar de base.
    //
    // Mutação que morre: remover o `focus()` de restauração.
    const ol = montarLista();
    const alvo = document.getElementById("link-A") as HTMLAnchorElement;
    alvo.focus();
    expect(document.activeElement).toBe(alvo);

    reordenarLista(ol, "parcial"); // A vai da 1ª para a 3ª posição

    expect(ordem(ol)).toEqual(["C", "B", "A"]);
    expect(document.activeElement).toBe(alvo);
  });

  it("linha sem as propriedades vai para o fim, sem embaralhar as outras", () => {
    // `NaN` no comparador embaralharia a lista inteira em silêncio.
    const ol = montarLista();
    const orfa = document.createElement("li");
    orfa.textContent = "Z";
    ol.appendChild(orfa);

    reordenarLista(ol, "parcial");
    expect(ordem(ol)).toEqual(["C", "B", "A", "Z"]);
  });

  it("lista de uma linha só não é tocada", () => {
    const ol = document.createElement("ol");
    ol.setAttribute(ATRIBUTO_LISTA, "");
    const li = document.createElement("li");
    li.textContent = "único";
    ol.appendChild(li);
    document.body.appendChild(ol);

    reordenarLista(ol, "parcial");
    expect(ordem(ol)).toEqual(["único"]);
  });
});

describe("<ReordenaListaPorBase /> — ligado à store de base", () => {
  it("🔴 trocar a base no controle do shell reordena o DOM", () => {
    // O caso ponta a ponta: a store é o que o `<ViewModeSwitch>` escreve.
    // Mutação que morre: trocar a dependência do `useEffect` por `[]`.
    const ol = montarLista();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    act(() => root?.render(<ReordenaListaPorBase />));
    expect(ordem(ol)).toEqual(["A", "B", "C"]); // default é `proj`

    act(() => setViewMode("parcial"));
    expect(ordem(ol)).toEqual(["C", "B", "A"]);

    act(() => setViewMode("proj"));
    expect(ordem(ol)).toEqual(["A", "B", "C"]);
  });

  it("uma lista SEM o atributo não é tocada — é a garantia da fase pré", () => {
    // A lista de identidade (fase pré) é ordenada pelo número na urna e não
    // segue base nenhuma: constituição § 2 v1.5, cuja exceção é expressa e
    // exige um controle de base que aquela tela não tem.
    //
    // Mutação que morre: trocar o seletor por `ol` ou `[data-ord]`.
    const ol = montarLista();
    ol.removeAttribute(ATRIBUTO_LISTA);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    act(() => root?.render(<ReordenaListaPorBase />));
    act(() => setViewMode("parcial"));

    expect(ordem(ol)).toEqual(["A", "B", "C"]);
  });
});
