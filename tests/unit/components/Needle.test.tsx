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

  it("(f) variant='national-1t' usa arcos neutros e labels '2º turno' / 'Decide 1T'", () => {
    const doc = parse(
      <Needle
        needlePosition={0.3}
        pVitoria={0.65}
        candidatoA="Lider"
        candidatoB="—"
        variant="national-1t"
      />,
    );
    // aria-label fala em "decisão no 1º turno"
    expect(doc.querySelector("svg")?.getAttribute("aria-label")).toContain("decisão no 1º turno");
    // Labels laterais visíveis
    const texts = Array.from(doc.querySelectorAll("text")).map((t) => t.textContent ?? "");
    expect(texts.some((t) => t === "2º turno")).toBe(true);
    expect(texts.some((t) => t.includes("Decide 1T") && t.includes("Lider"))).toBe(true);
    // Arcos: pelo menos um path com cor neutra band-very_likely (vlb / vla)
    const paths = Array.from(doc.querySelectorAll("path")).map((p) => p.getAttribute("stroke"));
    expect(paths.some((s) => s?.includes("--color-band-very_likely"))).toBe(true);
    // E nenhum arco usa cor por rank (cand-1 / cand-2)
    expect(paths.every((s) => !s?.includes("--color-cand-1"))).toBe(true);
  });

  it("(g) variant='uf' usa cores binárias top-2 (cand-1 / cand-2)", () => {
    const doc = parse(
      <Needle needlePosition={0.4} pVitoria={0.7} candidatoA="A" candidatoB="B" variant="uf" />,
    );
    // Pelo menos um arco usa cor por rank
    const paths = Array.from(doc.querySelectorAll("path")).map((p) => p.getAttribute("stroke"));
    expect(paths.some((s) => s?.includes("--color-cand-1"))).toBe(true);
    expect(paths.some((s) => s?.includes("--color-cand-2"))).toBe(true);
    // E NÃO usa as bandas neutras de national-1t
    expect(paths.every((s) => !s?.includes("--color-band-very_likely"))).toBe(true);
  });
});
