// @vitest-environment happy-dom
/**
 * Unit tests do <Needle /> — atom genérico (RF-021 home / RF-039 UF).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Needle } from "@/components/atoms/needle/Needle";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("<Needle />", () => {
  it("(a) variant='uf' descreve 'Forecast estadual' no aria-label", () => {
    const doc = parse(
      <Needle
        needlePosition={0.5}
        pVitoria={0.78}
        candidatoA="Lula"
        candidatoB="Bolsonaro"
        variant="uf"
      />,
    );
    const svg = doc.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toContain("Forecast estadual");
    expect(svg?.getAttribute("aria-label")).toContain("Lula");
    expect(svg?.getAttribute("aria-label")).toContain("78%");
  });

  it("(b) variant='national' (default) descreve 'Forecast nacional'", () => {
    const doc = parse(
      <Needle needlePosition={-0.3} pVitoria={0.62} candidatoA="A" candidatoB="B" />,
    );
    const svg = doc.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toContain("Forecast nacional");
    // needlePosition negativo => favorito = B
    expect(svg?.getAttribute("aria-label")).toContain("B");
  });

  it("(c) clamp: needlePosition fora de [-1,1] não quebra", () => {
    const doc = parse(<Needle needlePosition={2.5} pVitoria={1.5} candidatoA="A" candidatoB="B" />);
    const svg = doc.querySelector("svg");
    // pVitoria clamped a 1 -> "100%"
    expect(svg?.getAttribute("aria-label")).toContain("100%");
  });

  it("(d) renderiza um <title> com o mesmo aria-label (acessibilidade redundante)", () => {
    const doc = parse(<Needle needlePosition={0} pVitoria={0.5} candidatoA="A" candidatoB="B" />);
    const title = doc.querySelector("title");
    expect(title?.textContent).toContain("50%");
  });

  it("(e) NaN em needlePosition vira -1 (clamp), favorito = B", () => {
    const doc = parse(
      <Needle needlePosition={Number.NaN} pVitoria={0.5} candidatoA="A" candidatoB="B" />,
    );
    const svg = doc.querySelector("svg");
    // safePosition = -1, favorito é B
    expect(svg?.getAttribute("aria-label")).toContain("B");
  });
});
