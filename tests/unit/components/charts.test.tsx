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

describe("S04/F2 — charts consomem EdgeUfSeriesTemporais", () => {
  /**
   * Os 3 charts consomem `EdgeUfSeriesTemporais` (lib/edge-config/types.ts).
   * A page de UF mapeia cada array em props normalizados (snake → camel).
   * Aqui validamos o caminho `series_temporais → chart props` sem mocks.
   */
  it("mapeia series_temporais.margem → TimeSeriesChart.points", () => {
    const series = {
      margem: [
        { ts: "2026-10-04T18:00:00Z", margem_pp: 2.0 },
        { ts: "2026-10-04T18:01:00Z", margem_pp: 4.5 },
      ],
      p_vitoria: [
        { ts: "2026-10-04T18:00:00Z", p: 0.65 },
        { ts: "2026-10-04T18:01:00Z", p: 0.81 },
      ],
      turnout: [
        { ts: "2026-10-04T18:00:00Z", pct_apurado: 15 },
        { ts: "2026-10-04T18:01:00Z", pct_apurado: 35 },
      ],
    };
    const margemPoints = series.margem.map((pt) => ({ ts: pt.ts, margemPp: pt.margem_pp }));
    const probPoints = series.p_vitoria.map((pt) => ({ ts: pt.ts, pVitoria: pt.p }));
    const turnoutPoints = series.turnout.map((pt) => ({ ts: pt.ts, pctApurado: pt.pct_apurado }));

    const docM = parse(
      <TimeSeriesChart points={margemPoints} liderNome="Lula" liderCor="var(--color-pt)" />,
    );
    const docP = parse(
      <ProbabilityOverTime points={probPoints} liderNome="Lula" liderCor="var(--color-pt)" />,
    );
    const docT = parse(<TurnoutAreaChart points={turnoutPoints} />);

    // Todos renderizam SVG real (não placeholder).
    expect(docM.querySelector("svg")).not.toBeNull();
    expect(docP.querySelector("svg")).not.toBeNull();
    expect(docT.querySelector("svg")).not.toBeNull();
    // Último valor da margem aparece no aria-label.
    expect(docM.querySelector("svg")?.getAttribute("aria-label")).toContain("4.5");
    // Último p_vitoria como % no aria-label.
    expect(docP.querySelector("svg")?.getAttribute("aria-label")).toContain("81%");
    // Último turnout no aria-label.
    expect(docT.querySelector("svg")?.getAttribute("aria-label")).toContain("35");
  });
});
