// @vitest-environment happy-dom
/**
 * tests/unit/components/TopBar.test.tsx
 *
 * `<TopBar />` — masthead do design system Atlas Menna (ADR-0025 § 2).
 *
 * O que estes testes travam:
 *   - o arquivo é Server Component. Isso é requisito, não gosto: o `TopBar`
 *     mora em `app/layout.tsx`, ou seja, acima da dobra de TODAS as rotas, e
 *     RNF-007a está a ~1,3 KiB do teto de 150 KiB;
 *   - não lê `cookies()` nem `searchParams` — as 54 páginas de UF são
 *     pré-renderizadas estáticas e passariam a dinâmicas (ADR-0025 § 2/§ 5);
 *   - o wordmark NÃO é `<h1>`: cada página já tem o seu;
 *   - `children` renderiza ABAIXO da linha do título (é onde entram as abas).
 */

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TopBar } from "@/components/layout/TopBar";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

/** Código do componente sem comentários — o cabeçalho fala de "use client",
 *  `useState` etc. justamente para explicar por que eles não estão lá. */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("<TopBar />", () => {
  it("(a) é um <header> sticky com o wordmark default", () => {
    const doc = parse(<TopBar />);
    const el = doc.querySelector("[data-testid='top-bar']");
    expect(el?.tagName).toBe("HEADER");
    expect(el?.getAttribute("class")).toContain("sticky");
    expect(doc.querySelector("[data-testid='top-bar-brand']")?.textContent).toBe("Atlas Menna");
  });

  it("(b) o wordmark não é h1 — a página é dona do seu", () => {
    const doc = parse(<TopBar subtitle="Eleições 2026 · 1º turno" />);
    expect(doc.querySelector("h1")).toBeNull();
    expect(doc.querySelector("[data-testid='top-bar-brand']")?.tagName).toBe("DIV");
  });

  it("(c) brandHref transforma o wordmark em link", () => {
    const brand = parse(<TopBar brandHref="/" />).querySelector("[data-testid='top-bar-brand']");
    expect(brand?.tagName).toBe("A");
    expect(brand?.getAttribute("href")).toBe("/");
  });

  it("(d) subtitle sai em caixa alta e é opcional", () => {
    const doc = parse(<TopBar subtitle="Eleições 2026 · 1º turno" />);
    const sub = doc.querySelector("[data-testid='top-bar-subtitle']");
    expect(sub?.textContent).toBe("Eleições 2026 · 1º turno");
    expect(sub?.getAttribute("style")).toContain("uppercase");
    expect(parse(<TopBar />).querySelector("[data-testid='top-bar-subtitle']")).toBeNull();
  });

  it("(e) os slots left/right/children caem nos lugares certos", () => {
    const doc = parse(
      <TopBar left={<span id="l">L</span>} right={<span id="r">R</span>}>
        <div id="tabs">abas</div>
      </TopBar>,
    );
    const header = doc.querySelector("[data-testid='top-bar']");
    // children é irmão da linha do título, não filho dela.
    expect(header?.lastElementChild?.getAttribute("id")).toBe("tabs");
    expect(doc.querySelector("#l")).not.toBeNull();
    expect(doc.querySelector("#r")).not.toBeNull();
  });

  it("(f) o wordmark usa a composição --type-masthead, sem fontSize cravado", () => {
    const style =
      parse(<TopBar />)
        .querySelector("[data-testid='top-bar-brand']")
        ?.getAttribute("style") ?? "";
    expect(style).toContain("var(--type-masthead)");
    expect(style).not.toMatch(/font-size:\s*\d+px/);
  });

  it("(g) é Server Component e não lê estado por requisição", () => {
    const src = codeOf("components/layout/TopBar.tsx");
    expect(src).not.toContain('"use client"');
    expect(src).not.toContain("cookies(");
    expect(src).not.toContain("searchParams");
    expect(src).not.toContain("useState");
  });

  it("(h) nenhum hex literal no markup (constituição § 2)", () => {
    expect(renderToStaticMarkup(<TopBar subtitle="s" brandHref="/" />)).not.toMatch(
      /#[0-9a-fA-F]{3,8}\b/,
    );
  });
});
