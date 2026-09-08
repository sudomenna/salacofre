// @vitest-environment happy-dom
/**
 * tests/unit/components/MapLegend.test.tsx
 *
 * `<MapLegend />` — legenda divergente do coroplético (ADR-0025, Bloco 1).
 *
 * O que estes testes travam:
 *   - as duas rampas são props OBRIGATÓRIAS. O `.jsx` do kit lia
 *     `--party-pt-1..5`/`--party-pl-1..5` direto; esses tokens não existem em
 *     `app/globals.css` (chegam pelo ADR-0024), e um `var()` para token
 *     inexistente renderiza a legenda inteira transparente em silêncio;
 *   - a rampa direita é espelhada, para o mais forte ficar na ponta;
 *   - a legenda inteira é `role="img"` com uma descrição da escala — uma
 *     fileira de quadradinhos não diz nada a leitor de tela (RNF-022/023).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MapLegend, mapLegendLabel } from "@/components/atoms/maps/MapLegend";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

const LEFT = ["var(--c-l5)", "var(--c-l4)", "var(--c-l3)", "var(--c-l2)", "var(--c-l1)"];
const RIGHT = ["var(--c-r5)", "var(--c-r4)", "var(--c-r3)", "var(--c-r2)", "var(--c-r1)"];

function legend(node: React.ReactElement) {
  const doc = parse(node);
  return {
    doc,
    root: doc.querySelector("[data-testid='map-legend']"),
    steps: Array.from(doc.querySelectorAll("[data-testid='map-legend-step']")),
  };
}

describe("<MapLegend />", () => {
  it("(a) 5 + empate + 5 degraus, nessa ordem", () => {
    const { steps } = legend(
      <MapLegend leftLabel="Lula" rightLabel="Flávio" leftColors={LEFT} rightColors={RIGHT} />,
    );
    expect(steps.length).toBe(11);
    expect(steps.map((s) => s.getAttribute("data-side"))).toEqual([
      ...Array(5).fill("left"),
      "tie",
      ...Array(5).fill("right"),
    ]);
  });

  it("(b) a rampa esquerda sai como veio; a direita é espelhada", () => {
    const { steps } = legend(
      <MapLegend leftLabel="A" rightLabel="B" leftColors={LEFT} rightColors={RIGHT} />,
    );
    const bg = (el: Element | undefined) => el?.getAttribute("style") ?? "";
    expect(bg(steps[0])).toContain("var(--c-l5)");
    expect(bg(steps[4])).toContain("var(--c-l1)");
    expect(bg(steps[6])).toContain("var(--c-r1)");
    expect(bg(steps[10])).toContain("var(--c-r5)");
  });

  it("(c) o empate default é neutro — nenhum partido é dono do empate", () => {
    const { steps } = legend(
      <MapLegend leftLabel="A" rightLabel="B" leftColors={LEFT} rightColors={RIGHT} />,
    );
    expect(steps[5]?.getAttribute("style")).toContain("var(--party-tie, var(--color-tossup))");
  });

  it("(d) role=img com a escala descrita em texto", () => {
    const { root } = legend(
      <MapLegend leftLabel="Lula" rightLabel="Flávio" leftColors={LEFT} rightColors={RIGHT} />,
    );
    expect(root?.getAttribute("role")).toBe("img");
    expect(root?.getAttribute("aria-label")).toBe(
      mapLegendLabel("Lula", "Flávio", 30, "sem apuração"),
    );
    expect(root?.getAttribute("aria-label")).toContain("Lula até 30 pontos à esquerda");
  });

  it("(e) o texto visível é aria-hidden (o alt já descreve a escala)", () => {
    const { doc } = legend(
      <MapLegend leftLabel="A" rightLabel="B" leftColors={LEFT} rightColors={RIGHT} />,
    );
    expect(doc.querySelector("[data-testid='map-legend-scale']")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(
      doc.querySelector("[data-testid='map-legend-uncounted']")?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("(f) as pontas mostram maxMargin e o centro mostra 0", () => {
    const { doc } = legend(
      <MapLegend
        leftLabel="Lula"
        rightLabel="Flávio"
        leftColors={LEFT}
        rightColors={RIGHT}
        maxMargin={20}
      />,
    );
    const scale = doc.querySelector("[data-testid='map-legend-scale']");
    expect(scale?.textContent).toBe("Lula +200Flávio +20");
  });

  it("(g) 'sem apuração' usa --map-uncounted por default", () => {
    const { doc } = legend(
      <MapLegend leftLabel="A" rightLabel="B" leftColors={LEFT} rightColors={RIGHT} />,
    );
    const uncounted = doc.querySelector("[data-testid='map-legend-uncounted']");
    expect(uncounted?.textContent).toContain("sem apuração");
    expect(uncounted?.innerHTML).toContain("var(--map-uncounted)");
  });

  it("(h) rampas de tamanhos diferentes não quebram a contagem", () => {
    const { steps } = legend(
      <MapLegend
        leftLabel="A"
        rightLabel="B"
        leftColors={["var(--x)"]}
        rightColors={["var(--y)", "var(--z)"]}
      />,
    );
    expect(steps.length).toBe(4);
  });

  it("(i) nenhum hex literal no markup (constituição § 2)", () => {
    expect(
      renderToStaticMarkup(
        <MapLegend leftLabel="A" rightLabel="B" leftColors={LEFT} rightColors={RIGHT} />,
      ),
    ).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
