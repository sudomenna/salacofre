// @vitest-environment happy-dom
/**
 * tests/unit/components/TabBar.test.tsx
 *
 * `<TabBar />` — navegação inferior por cargo (ADR-0025 § 2).
 *
 * O que estes testes travam:
 *   - com `href`, cada item é um link real e o componente é RSC: o `.jsx` do
 *     kit era `onChange`-only, o que forçaria `"use client"` e somaria JS
 *     acima da dobra em TODAS as rotas (RNF-007a, ADR-0025 § 6);
 *   - `<nav>` nomeado + `aria-current` no item ativo — landmark sem nome não
 *     serve para navegar (RNF-022);
 *   - o ativo não é sinalizado só pelo sublinhado: muda de cor E carrega
 *     `aria-current` (WCAG 1.4.1);
 *   - altura mínima `var(--tap-min)` (constituição § 4).
 */

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TabBar } from "@/components/layout/TabBar";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

const ITEMS = [
  { value: "presidente", label: "Presidente", href: "/" },
  { value: "governador", label: "Governador", href: "/governador" },
];

function render(value = "presidente", extra: Record<string, unknown> = {}) {
  return parse(<TabBar items={ITEMS} value={value} ariaLabel="Cargos" {...extra} />);
}

/** Código do componente sem comentários — o cabeçalho fala de "use client",
 *  `useState` etc. justamente para explicar por que eles não estão lá. */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("<TabBar />", () => {
  it("(a) é um <nav> nomeado, sticky, com uma coluna por item", () => {
    const el = render().querySelector("[data-testid='tab-bar']");
    expect(el?.tagName).toBe("NAV");
    expect(el?.getAttribute("aria-label")).toBe("Cargos");
    expect(el?.getAttribute("class")).toContain("sticky");
    expect(el?.getAttribute("style")).toContain("repeat(2, 1fr)");
  });

  it("(b) itens com href viram links reais (zero JS)", () => {
    const links = Array.from(render().querySelectorAll("[data-testid='tab-bar'] a"));
    expect(links.length).toBe(2);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/", "/governador"]);
    expect(render().querySelectorAll("[data-testid='tab-bar'] button").length).toBe(0);
  });

  it("(c) aria-current='page' só no ativo", () => {
    const links = Array.from(render("governador").querySelectorAll("a"));
    expect(links[0]?.getAttribute("aria-current")).toBeNull();
    expect(links[1]?.getAttribute("aria-current")).toBe("page");
    expect(links[1]?.getAttribute("data-active")).toBe("true");
  });

  it("(d) o ativo muda de cor além do sublinhado (WCAG 1.4.1)", () => {
    const doc = render("presidente");
    const links = Array.from(doc.querySelectorAll("a"));
    expect(links[0]?.getAttribute("style")).toContain("var(--text-primary)");
    expect(links[1]?.getAttribute("style")).toContain("var(--text-secondary)");
    expect(doc.querySelectorAll("[data-testid='tab-bar-underline']").length).toBe(1);
  });

  it("(e) o sublinhado é decorativo", () => {
    expect(
      render().querySelector("[data-testid='tab-bar-underline']")?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("(f) altura mínima é var(--tap-min)", () => {
    expect(render().querySelector("a")?.getAttribute("style")).toContain(
      "min-height:var(--tap-min)",
    );
  });

  it("(g) sem href, cai no modo botão (exige pai Client Component)", () => {
    const doc = parse(
      <TabBar
        items={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ]}
        value="a"
        onChange={() => {}}
        ariaLabel="Cargos"
      />,
    );
    const buttons = Array.from(doc.querySelectorAll("button"));
    expect(buttons.length).toBe(2);
    expect(buttons[0]?.getAttribute("type")).toBe("button");
    expect(buttons[0]?.getAttribute("aria-current")).toBe("true");
    expect(buttons[1]?.getAttribute("aria-current")).toBeNull();
  });

  it("(h) o ícone é decorativo", () => {
    const doc = parse(
      <TabBar
        items={[{ value: "a", label: "A", href: "/", icon: <span>◆</span> }]}
        value="a"
        ariaLabel="Cargos"
      />,
    );
    expect(doc.querySelector("a [aria-hidden='true']")?.textContent).toBe("◆");
  });

  it("(i) é Server Component — nenhum hook, nenhuma diretiva client", () => {
    const src = codeOf("components/layout/TabBar.tsx");
    expect(src).not.toContain('"use client"');
    expect(src).not.toContain("useState");
    expect(src).not.toContain("useEffect");
  });

  it("(k) item `disabled` não vira link — vira span aria-disabled com a razão", () => {
    // Cargo anunciado mas ainda sem rota (Senador/Deputado Federal até as
    // specs 016/017): um `<a href>` levaria a 404, o que é pior que a
    // ausência de link. A razão vai para `title` (mouse) E para um
    // `.sr-only` (leitor de tela em modo de leitura, onde `title` não é
    // anunciado de forma confiável).
    const doc = parse(
      <TabBar
        items={[
          { value: "presidente", label: "Presidente", href: "/" },
          { value: "senador", label: "Senador", disabled: true, disabledReason: "Em breve." },
        ]}
        value="presidente"
        ariaLabel="Cargos"
      />,
    );

    expect(doc.querySelectorAll("a").length).toBe(1);
    const sen = doc.querySelector("[data-value='senador']");
    expect(sen?.tagName).toBe("SPAN");
    expect(sen?.getAttribute("aria-disabled")).toBe("true");
    expect(sen?.getAttribute("data-disabled")).toBe("true");
    expect(sen?.getAttribute("title")).toBe("Em breve.");
    expect(sen?.querySelector(".sr-only")?.textContent).toBe("Em breve.");
  });

  it("(l) item `disabled` nunca é o ativo, mesmo se `value` apontar para ele", () => {
    const doc = parse(
      <TabBar
        items={[{ value: "senador", label: "Senador", href: "/senador", disabled: true }]}
        value="senador"
        ariaLabel="Cargos"
      />,
    );

    expect(doc.querySelector("a")).toBeNull();
    expect(doc.querySelector("[data-value='senador']")?.getAttribute("aria-current")).toBeNull();
    expect(doc.querySelector("[data-testid='tab-bar-underline']")).toBeNull();
  });

  it("(m) `label` aceita ReactNode — é assim que CargoTabs anexa texto sr-only", () => {
    const doc = parse(
      <TabBar
        items={[
          {
            value: "a",
            href: "/",
            label: (
              <>
                Presidente<span className="sr-only"> (página atual)</span>
              </>
            ),
          },
        ]}
        value="nenhum"
        ariaLabel="Cargos"
      />,
    );

    expect(doc.querySelector("a > span")?.textContent).toBe("Presidente (página atual)");
    expect(doc.querySelector("a .sr-only")?.textContent).toBe(" (página atual)");
  });

  it("(j) nenhum hex literal no markup (constituição § 2)", () => {
    expect(
      renderToStaticMarkup(<TabBar items={ITEMS} value="presidente" ariaLabel="Cargos" />),
    ).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
