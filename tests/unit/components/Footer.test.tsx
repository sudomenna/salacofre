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

  it("(d) link para `/candidatos` — a única entrada global da rota (spec 018)", () => {
    // `/candidatos` NÃO entra no `<CargoTabs>`: "Deputado Federal" já não cabe
    // em 1/4 de 430px e uma quinta aba quebraria a barra (comentário no topo de
    // `CargoTabs.tsx`). Sem este link, a rota fica órfã — alcançável só por URL
    // digitada. Asserção pelo `href`, não pelo rótulo: o texto pode mudar, o
    // destino não.
    const doc = parse(<Footer />);
    const href = Array.from(doc.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(href).toContain("/candidatos");
  });
});
