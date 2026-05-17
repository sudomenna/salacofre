// @vitest-environment happy-dom
/**
 * tests/unit/components/Footer.test.tsx
 *
 * Footer constitucional § 1 — "Não oficial. Fonte: TSE."
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Footer } from "@/components/layout/Footer";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("<Footer />", () => {
  it("(a) contém 'Não oficial. Fonte: TSE.' (constituição § 1)", () => {
    const doc = parse(<Footer />);
    expect(doc.body.textContent).toContain("Não oficial");
    expect(doc.body.textContent).toContain("TSE");
  });

  it("(b) usa <footer> semântico", () => {
    const doc = parse(<Footer />);
    expect(doc.querySelector("footer")).not.toBeNull();
  });

  it("(c) link 'Sobre o modelo' presente", () => {
    const doc = parse(<Footer />);
    const links = Array.from(doc.querySelectorAll("a")).filter((a) =>
      a.textContent?.toLowerCase().includes("sobre o modelo"),
    );
    expect(links.length).toBeGreaterThan(0);
  });
});
