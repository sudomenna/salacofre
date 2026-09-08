// @vitest-environment happy-dom
/**
 * tests/unit/components/SearchInput.test.tsx
 *
 * `<SearchInput />` — campo de busca (ADR-0025, Bloco 1).
 *
 * O que estes testes travam:
 *   - o campo SEMPRE tem nome acessível. O `<label>` do kit era vazio, e
 *     `placeholder` não é nome acessível (WCAG 4.1.2 / RNF-022);
 *   - nada de `autoFocus` — roubar o foco no load desorienta teclado e leitor
 *     de tela (regra `a11y/noAutofocus` do Biome, ligada neste repo);
 *   - o botão de limpar só aparece com valor, tem rótulo próprio e alvo de
 *     `var(--tap-min)` (44px).
 */

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SearchInput } from "@/components/atoms/controls/SearchInput";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function render(value = "", extra: Record<string, unknown> = {}) {
  return parse(
    <SearchInput
      value={value}
      onChange={() => {}}
      label="Buscar candidato, UF ou município"
      {...extra}
    />,
  );
}

/** Código do componente sem comentários — o cabeçalho fala de "use client",
 *  `useState` etc. justamente para explicar por que eles não estão lá. */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("<SearchInput />", () => {
  it("(a) o input é type=search e mora dentro do <label>", () => {
    const doc = render();
    const label = doc.querySelector("[data-testid='search-input']");
    expect(label?.tagName).toBe("LABEL");
    const input = doc.querySelector("[data-testid='search-input-field']");
    expect(input?.tagName).toBe("INPUT");
    expect(input?.getAttribute("type")).toBe("search");
    expect(input?.getAttribute("autocomplete")).toBe("off");
    expect(label?.contains(input as Node)).toBe(true);
  });

  it("(b) o rótulo existe sempre — escondido por .sr-only, não ausente", () => {
    const hidden = render().querySelector("[data-testid='search-input-label']");
    expect(hidden?.textContent).toBe("Buscar candidato, UF ou município");
    expect(hidden?.getAttribute("class")).toBe("sr-only");

    const visible = render("", { showLabel: true }).querySelector(
      "[data-testid='search-input-label']",
    );
    expect(visible?.getAttribute("class")).toBeNull();
    expect(visible?.getAttribute("style")).toContain("uppercase");
  });

  it("(c) placeholder é decoração, não substitui o rótulo", () => {
    const doc = render("", { placeholder: "Nome, partido ou número" });
    expect(
      doc.querySelector("[data-testid='search-input-field']")?.getAttribute("placeholder"),
    ).toBe("Nome, partido ou número");
    expect(doc.querySelector("[data-testid='search-input-label']")?.textContent).not.toBe(
      "Nome, partido ou número",
    );
  });

  it("(d) o botão limpar só aparece com valor, e tem rótulo próprio", () => {
    expect(render("").querySelector("[data-testid='search-input-clear']")).toBeNull();
    const clear = render("min").querySelector("[data-testid='search-input-clear']");
    expect(clear?.getAttribute("aria-label")).toBe("Limpar busca");
    expect(clear?.getAttribute("type")).toBe("button");
  });

  it("(e) campo e botão limpar respeitam var(--tap-min)", () => {
    const doc = render("min");
    expect(doc.querySelector("[data-testid='search-input']")?.getAttribute("style")).toContain(
      "height:var(--tap-min)",
    );
    const clear = doc.querySelector("[data-testid='search-input-clear']")?.getAttribute("style");
    expect(clear).toContain("width:var(--tap-min)");
    expect(clear).toContain("height:var(--tap-min)");
  });

  it("(f) a lupa é decorativa — aria-hidden e focusable=false", () => {
    const svg = render().querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("focusable")).toBe("false");
  });

  it("(g) o valor controlado chega ao input", () => {
    const input = render("campinas").querySelector(
      "[data-testid='search-input-field']",
    ) as HTMLInputElement | null;
    expect(input?.getAttribute("value")).toBe("campinas");
  });

  it("(h) o componente não usa autoFocus", () => {
    const src = codeOf("components/atoms/controls/SearchInput.tsx");
    expect(src).not.toContain("autoFocus");
    expect(render("x").querySelector("[autofocus]")).toBeNull();
  });

  it("(i) nenhum hex literal no markup (constituição § 2)", () => {
    expect(
      renderToStaticMarkup(<SearchInput value="x" onChange={() => {}} label="Buscar" />),
    ).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
