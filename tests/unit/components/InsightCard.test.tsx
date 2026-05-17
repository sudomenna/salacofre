// @vitest-environment happy-dom
/**
 * tests/unit/components/InsightCard.test.tsx — RF-044.
 * Compartilhado entre spec 003 (home) e spec 004 (UF).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InsightCard } from "@/components/blocks/InsightCard";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("<InsightCard />", () => {
  it("(a) renderiza 1-3 frases em <p> separados", () => {
    const doc = parse(
      <InsightCard
        frases={["Lula amplia margem em MG.", "SP em disputa apertada.", "Bolsonaro mantém o Sul."]}
      />,
    );
    expect(doc.querySelectorAll("aside p").length).toBe(3);
    expect(doc.body.textContent).toContain("Lula amplia margem em MG.");
  });

  it("(b) frases vazias → null (não renderiza nada)", () => {
    const doc = parse(<InsightCard frases={[]} />);
    expect(doc.querySelector("aside")).toBeNull();
  });

  it("(c) heading customizável (default 'Análise')", () => {
    const docDefault = parse(<InsightCard frases={["x"]} />);
    expect(docDefault.querySelector("h3")?.textContent).toBe("Análise");
    const docCustom = parse(<InsightCard frases={["x"]} heading="Insight" />);
    expect(docCustom.querySelector("h3")?.textContent).toBe("Insight");
  });

  it("(d) aside tem aria-labelledby ligado ao h3", () => {
    const doc = parse(<InsightCard frases={["x"]} />);
    const aside = doc.querySelector("aside");
    const h3 = doc.querySelector("h3");
    expect(aside?.getAttribute("aria-labelledby")).toBe(h3?.id);
  });
});
