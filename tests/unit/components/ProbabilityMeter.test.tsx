// @vitest-environment happy-dom
/**
 * tests/unit/components/ProbabilityMeter.test.tsx
 *
 * `<ProbabilityMeter />` — medidor de chance (ADR-0025, Bloco 1).
 *
 * O que estes testes travam:
 *   - o preenchimento é `--accent-strong` (3.88:1 contra a calha
 *     `--surface-sunken`) e NÃO `--accent` (2.46:1), que reprovaria os 3:1 de
 *     WCAG 1.4.11 adotados pela constituição § 4;
 *   - `role="meter"` com `aria-valuenow/min/max` — sem isso a barra é uma
 *     `<div>` colorida muda (RNF-022/023);
 *   - valores fora de [0, 100] e NaN são clampeados (constituição § 7).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProbabilityMeter } from "@/components/atoms/data/ProbabilityMeter";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function track(doc: Document): HTMLElement | null {
  return doc.querySelector("[data-testid='probability-meter-track']");
}

function fill(doc: Document): HTMLElement | null {
  return doc.querySelector("[data-testid='probability-meter-fill']");
}

describe("<ProbabilityMeter />", () => {
  it("(a) rótulo, percentual arredondado e nota", () => {
    const doc = parse(
      <ProbabilityMeter label="Chance de 2º turno" pct={71.4} note="Com 62% apurado" />,
    );
    expect(doc.body.textContent).toContain("Chance de 2º turno");
    expect(doc.querySelector("[data-testid='probability-meter-value']")?.textContent).toBe("71%");
    expect(doc.querySelector("[data-testid='probability-meter-note']")?.textContent).toBe(
      "Com 62% apurado",
    );
  });

  it("(b) role=meter com os três valores ARIA e nome acessível", () => {
    const el = track(parse(<ProbabilityMeter label="Chance de 2º turno" pct={71.4} />));
    expect(el?.getAttribute("role")).toBe("meter");
    expect(el?.getAttribute("aria-label")).toBe("Chance de 2º turno");
    expect(el?.getAttribute("aria-valuenow")).toBe("71");
    expect(el?.getAttribute("aria-valuemin")).toBe("0");
    expect(el?.getAttribute("aria-valuemax")).toBe("100");
    expect(el?.getAttribute("aria-valuetext")).toBe("71%");
  });

  it("(c) o preenchimento default é --accent-strong, nunca --accent puro", () => {
    const style = fill(parse(<ProbabilityMeter label="L" pct={50} />))?.getAttribute("style") ?? "";
    expect(style).toContain("var(--accent-strong)");
    expect(style).not.toMatch(/background:\s*var\(--accent\)/);
  });

  it("(d) a prop color sobrescreve o preenchimento", () => {
    const style =
      fill(
        parse(<ProbabilityMeter label="L" pct={50} color="var(--color-cand-2)" />),
      )?.getAttribute("style") ?? "";
    expect(style).toContain("var(--color-cand-2)");
  });

  it("(e) pct fora de [0, 100] e NaN são clampeados", () => {
    expect(fill(parse(<ProbabilityMeter label="L" pct={-10} />))?.getAttribute("style")).toContain(
      "width:0%",
    );
    expect(fill(parse(<ProbabilityMeter label="L" pct={150} />))?.getAttribute("style")).toContain(
      "width:100%",
    );
    const nan = parse(<ProbabilityMeter label="L" pct={Number.NaN} />);
    expect(fill(nan)?.getAttribute("style")).toContain("width:0%");
    expect(track(nan)?.getAttribute("aria-valuenow")).toBe("0");
  });

  it("(f) sem nota, nada é renderizado no lugar dela", () => {
    expect(
      parse(<ProbabilityMeter label="L" pct={1} />).querySelector(
        "[data-testid='probability-meter-note']",
      ),
    ).toBeNull();
  });

  it("(g) nenhum hex literal no markup (constituição § 2)", () => {
    expect(renderToStaticMarkup(<ProbabilityMeter label="L" pct={71} note="n" />)).not.toMatch(
      /#[0-9a-fA-F]{3,8}\b/,
    );
  });
});
