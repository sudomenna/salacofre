// @vitest-environment happy-dom
/**
 * tests/unit/components/UFBreadcrumb.test.tsx
 *
 * Unit tests do <UFBreadcrumb /> — RF-031 (breadcrumb "Voltar ao nacional"
 * em todas as páginas /uf/[sigla] e /governador/[sigla]).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { UFBreadcrumb } from "@/components/atoms/nav/UFBreadcrumb";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("<UFBreadcrumb /> — RF-031", () => {
  it("(a) renderiza link com href='/'", () => {
    const doc = parse(<UFBreadcrumb />);
    const anchor = doc.querySelector("a");
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute("href")).toBe("/");
  });

  it("(b) exibe label padrão 'Voltar ao nacional'", () => {
    const doc = parse(<UFBreadcrumb />);
    expect(doc.body.textContent).toContain("Voltar ao nacional");
  });

  it("(c) está dentro de <nav aria-label='Breadcrumb'> (WAI-ARIA landmark)", () => {
    const doc = parse(<UFBreadcrumb />);
    const nav = doc.querySelector("nav");
    expect(nav).not.toBeNull();
    expect(nav?.getAttribute("aria-label")).toBe("Breadcrumb");
    // O link precisa estar contido no nav.
    expect(nav?.querySelector("a")).not.toBeNull();
  });

  it("(d) aceita override de label e href", () => {
    const doc = parse(<UFBreadcrumb label="‹ Início" href="/inicio" />);
    expect(doc.body.textContent).toContain("‹ Início");
    expect(doc.querySelector("a")?.getAttribute("href")).toBe("/inicio");
  });
});
