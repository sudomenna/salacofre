// @vitest-environment happy-dom
/**
 * tests/unit/components/UFBreadcrumb.test.tsx
 *
 * Unit tests do <UFBreadcrumb /> — RF-031 (breadcrumb "Voltar ao nacional"
 * em todas as páginas /uf/[sigla] e /governador/[sigla]).
 *
 * S07/Fase 2 (ADR-0019): o componente ganhou `items` (profundidade real da
 * trilha) e `trilha` (accent). Os testes (a)–(d) permanecem como estavam —
 * eles são o contrato de compatibilidade do modo legado `label`/`href`; os
 * testes (e)+ cobrem o modo novo.
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

  it("(e) sem `items`, o markup do modo legado não muda (nenhuma <ol>)", () => {
    const doc = parse(<UFBreadcrumb />);
    expect(doc.querySelector("ol")).toBeNull();
    expect(doc.querySelectorAll("a")).toHaveLength(1);
  });

  // ---------------------------------------------------------------------
  // S07/Fase 2 — modo trilha (`items`), ADR-0019.
  // ---------------------------------------------------------------------

  it("(f) trilha presidencial: 'Brasil › SP' com Brasil linkado e SP como nó atual", () => {
    const doc = parse(
      <UFBreadcrumb trilha="pres" items={[{ label: "Brasil", href: "/" }, { label: "SP" }]} />,
    );
    const items = [...doc.querySelectorAll("li")].map((li) =>
      li.textContent?.replace(/\s+/g, " ").trim(),
    );
    expect(items).toEqual(["Brasil", "›SP"]);

    const link = doc.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/");
    expect(link?.textContent).toBe("Brasil");

    const atual = doc.querySelector('[aria-current="page"]');
    expect(atual?.textContent).toBe("SP");
    // Nó atual nunca é link (WAI-ARIA breadcrumb pattern).
    expect(atual?.tagName.toLowerCase()).toBe("span");
  });

  it("(g) trilha governador: 'Governadores › SP', sem nó nacional", () => {
    const doc = parse(
      <UFBreadcrumb
        trilha="gov"
        items={[{ label: "Governadores", href: "/governador" }, { label: "SP" }]}
      />,
    );
    expect(doc.body.textContent).toContain("Governadores");
    expect(doc.body.textContent).not.toContain("Brasil");
    expect(doc.querySelector("a")?.getAttribute("href")).toBe("/governador");
  });

  it("(h) profundidade de 3 níveis (município) preserva a ordem e linka os ancestrais", () => {
    const doc = parse(
      <UFBreadcrumb
        trilha="pres"
        items={[
          { label: "Brasil", href: "/" },
          { label: "SP", href: "/uf/SP" },
          { label: "Campinas" },
        ]}
      />,
    );
    const hrefs = [...doc.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/", "/uf/SP"]);
    expect(doc.querySelector('[aria-current="page"]')?.textContent).toBe("Campinas");
    // <ol> porque a ordem dos nós é semântica.
    expect(doc.querySelector("nav > ol")).not.toBeNull();
  });

  it("(i) `trilha` colore os links pelo token, sem hex literal", () => {
    const doc = parse(
      <UFBreadcrumb
        trilha="gov"
        items={[{ label: "Governadores", href: "/governador" }, { label: "SP" }]}
      />,
    );
    const nav = doc.querySelector("nav");
    expect(nav?.getAttribute("data-trilha-breadcrumb")).toBe("gov");
    const style = doc.querySelector("a")?.getAttribute("style") ?? "";
    expect(style).toContain("var(--trilha-accent)");
    expect(style).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  it("(j) modo trilha continua dentro de <nav aria-label='Breadcrumb'>", () => {
    const doc = parse(
      <UFBreadcrumb trilha="pres" items={[{ label: "Brasil", href: "/" }, { label: "SP" }]} />,
    );
    expect(doc.querySelector("nav")?.getAttribute("aria-label")).toBe("Breadcrumb");
  });
});
