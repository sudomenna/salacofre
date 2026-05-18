// @vitest-environment happy-dom
/**
 * tests/unit/components/TwoRoundIndicator.test.tsx
 *
 * Unit tests do <TwoRoundIndicator /> — medidor P(2º turno).
 * Cobertura RF-030.7 (S05/F4c, ADR-0014).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TwoRoundIndicator } from "@/components/blocks/TwoRoundIndicator";

function parse(node: React.ReactElement | null): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("<TwoRoundIndicator />", () => {
  it("(a) P=0.65 normal → renderiza com label '65% de chance...'", () => {
    const doc = parse(<TwoRoundIndicator pSegundoTurno={0.65} liderPct={43.2} liderNome="Lula" />);
    const text = doc.body.textContent ?? "";
    expect(text).toContain("65% de chance de ir a 2º turno");

    const meter = doc.querySelector('[role="meter"]');
    expect(meter).not.toBeNull();
    expect(meter?.getAttribute("aria-valuenow")).toBe("65");
  });

  it("(b) P=null → retorna null (não renderiza nada)", () => {
    const doc = parse(<TwoRoundIndicator pSegundoTurno={null} liderPct={50} liderNome="X" />);
    expect(doc.querySelector('[role="meter"]')).toBeNull();
    expect(doc.body.textContent ?? "").not.toContain("chance");
  });

  it("(c) P=0.51 trivial → retorna null (|P−0.5|=0.01 ≤ 0.1)", () => {
    const doc = parse(<TwoRoundIndicator pSegundoTurno={0.51} liderPct={50} liderNome="X" />);
    expect(doc.querySelector('[role="meter"]')).toBeNull();
  });

  it("(d) P=0.95 alto → renderiza com label '95% de chance...'", () => {
    const doc = parse(<TwoRoundIndicator pSegundoTurno={0.95} liderPct={42.0} liderNome="Lula" />);
    expect(doc.body.textContent ?? "").toContain("95% de chance de ir a 2º turno");
  });

  it("(e) aria-label do meter está correto", () => {
    const doc = parse(<TwoRoundIndicator pSegundoTurno={0.7} liderPct={45} liderNome="Lula" />);
    const meter = doc.querySelector('[role="meter"]');
    expect(meter?.getAttribute("aria-label")).toBe("70% de chance de ir a 2º turno");
    expect(meter?.getAttribute("aria-valuemin")).toBe("0");
    expect(meter?.getAttribute("aria-valuemax")).toBe("100");
  });
});
