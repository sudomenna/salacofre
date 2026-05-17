// @vitest-environment happy-dom
/**
 * tests/unit/components/CandidateBar.test.tsx
 *
 * Unit tests do <CandidateBar /> — atom de barra de candidato.
 * RF-022, RF-023.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CandidateBar } from "@/components/atoms/bars/CandidateBar";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("<CandidateBar />", () => {
  it("(a) renderiza %, votos e CI95 com aria-label completo", () => {
    const doc = parse(
      <CandidateBar
        nome="Lula"
        partido="PT"
        cor="var(--color-pt)"
        pctProjetado={53.2}
        pctLower={51.9}
        pctUpper={54.5}
        votos={79812408}
      />,
    );
    const meter = doc.querySelector('[role="meter"]');
    expect(meter?.getAttribute("aria-valuenow")).toBe("53");
    expect(meter?.getAttribute("aria-label")).toContain("Lula");
    expect(meter?.getAttribute("aria-label")).toContain("PT");
    expect(meter?.getAttribute("aria-label")).toContain("53,2%");

    // Texto visível
    const text = doc.body.textContent ?? "";
    expect(text).toContain("Lula");
    expect(text).toContain("PT");
    expect(text).toContain("53,2%");
    expect(text).toContain("79.812.408");
  });

  it("(b) clamp: pct > 100 vira 100, < 0 vira 0", () => {
    const doc = parse(
      <CandidateBar nome="X" partido="P" cor="var(--color-pt)" pctProjetado={150} />,
    );
    const meter = doc.querySelector('[role="meter"]');
    expect(meter?.getAttribute("aria-valuenow")).toBe("100");
  });

  it("(c) alignRight inverte ordem do header (segundo candidato)", () => {
    const doc = parse(
      <CandidateBar
        nome="Bolsonaro"
        partido="PL"
        cor="var(--color-pl)"
        pctProjetado={46.8}
        alignRight
      />,
    );
    // O fill da barra deve estar à direita (margin-left: auto).
    const fill = doc.querySelector('[role="meter"] > div');
    expect(fill?.getAttribute("style")).toContain("margin-left:auto");
  });

  it("(d) sem CI nem votos → não renderiza linha de metadados", () => {
    const doc = parse(
      <CandidateBar nome="X" partido="P" cor="var(--color-pt)" pctProjetado={50} />,
    );
    // Sem subline → o último filho de root div é a barra
    const meters = doc.querySelectorAll('[role="meter"]');
    expect(meters.length).toBe(1);
    expect(doc.body.textContent).not.toContain("CI95");
  });
});
