// @vitest-environment happy-dom
/**
 * Smoke tests dos 3 charts UF (RF-040, RF-041, RF-042).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProbabilityOverTime } from "@/components/atoms/charts/ProbabilityOverTime";
import { TimeSeriesChart } from "@/components/atoms/charts/TimeSeriesChart";
import { TurnoutAreaChart } from "@/components/atoms/charts/TurnoutAreaChart";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("<TimeSeriesChart />", () => {
  it("renderiza svg quando >= 2 pontos e descreve último valor", () => {
    const doc = parse(
      <TimeSeriesChart
        points={[
          { ts: "t1", margemPp: 2.5 },
          { ts: "t2", margemPp: 5.1 },
          { ts: "t3", margemPp: 8.2 },
        ]}
        liderNome="Lula"
        liderCor="var(--color-pt)"
      />,
    );
    const svg = doc.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-label")).toContain("Lula");
    expect(svg?.getAttribute("aria-label")).toContain("8.2");
  });

  it("renderiza placeholder com <2 pontos", () => {
    const doc = parse(<TimeSeriesChart points={[]} liderNome="X" liderCor="#000" />);
    expect(doc.querySelector("svg")).toBeNull();
    expect(doc.body.textContent).toContain("insuficiente");
  });
});

describe("<ProbabilityOverTime />", () => {
  it("renderiza svg com 3 pontos e label ao final", () => {
    const doc = parse(
      <ProbabilityOverTime
        points={[
          { ts: "t1", pVitoria: 0.55 },
          { ts: "t2", pVitoria: 0.72 },
          { ts: "t3", pVitoria: 0.78 },
        ]}
        liderNome="Lula"
        liderCor="var(--color-pt)"
      />,
    );
    const svg = doc.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-label")).toContain("78%");
  });
});

describe("<TurnoutAreaChart />", () => {
  it("renderiza area chart com >=2 pontos", () => {
    const doc = parse(
      <TurnoutAreaChart
        points={[
          { ts: "t1", pctApurado: 5 },
          { ts: "t2", pctApurado: 20 },
          { ts: "t3", pctApurado: 65 },
        ]}
      />,
    );
    const svg = doc.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-label")).toContain("65");
  });
});
