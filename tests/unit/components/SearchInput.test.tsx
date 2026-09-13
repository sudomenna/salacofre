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

import { SearchField, SearchInput } from "@/components/atoms/controls/SearchInput";

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

/**
 * `<SearchField />` — a variante NÃO-CONTROLADA, spec 018.
 *
 * Existe porque `/candidatos` filtra por `<form method="get">` sem uma linha de
 * JavaScript de aplicação (RF-146/RF-147 — "Given um navegador com JavaScript
 * desabilitado, when o leitor filtra, then funciona"), e RNF-007a está em
 * 148,7 KiB de 150. Um campo controlado exigiria `useState` no pai.
 *
 * O que estes casos travam, cada um contra uma mutação:
 *   - **o módulo não tem `"use client"`** (d). Com a diretiva, importar isto de
 *     um Server Component abriria fronteira de cliente — o custo exato que o
 *     RF-146 proíbe. É a única asserção possível sobre isso num teste unitário,
 *     e por isso ela lê o arquivo;
 *   - `name` chega ao `<input>` (a). Sem `name`, o campo **não é submetido** e o
 *     filtro silenciosamente não faz nada;
 *   - `defaultValue`, não `value` (b) — é o que repõe o valor depois do submit
 *     sem tornar o campo controlado;
 *   - zero handler no markup (c).
 */
describe("<SearchField /> (não-controlado, RF-147)", () => {
  function field(extra: Record<string, unknown> = {}): Document {
    return parse(<SearchField name="q" label="Buscar por nome" {...extra} />);
  }

  it("(a) o `name` chega ao input — sem ele o campo não é submetido", () => {
    const input = field().querySelector("[data-testid='search-field-input']");
    expect(input?.getAttribute("name")).toBe("q");
    expect(input?.getAttribute("type")).toBe("search");
  });

  it("(b) `defaultValue` vira o valor inicial, sem tornar o campo controlado", () => {
    const input = field({ defaultValue: "marli" }).querySelector(
      "[data-testid='search-field-input']",
    );
    expect(input?.getAttribute("value")).toBe("marli");
  });

  it("(c) nenhum handler, nenhum botão de limpar — zero JS", () => {
    const markup = renderToStaticMarkup(<SearchField name="q" label="Buscar" defaultValue="x" />);
    expect(markup).not.toContain("onchange");
    expect(markup).not.toContain("onclick");
    expect(
      field({ defaultValue: "x" }).querySelector("[data-testid='search-input-clear']"),
    ).toBeNull();
  });

  it("(d) o módulo NÃO declara `use client` — a diretiva é de módulo inteiro", () => {
    const src = readFileSync("components/atoms/controls/SearchInput.tsx", "utf8");
    // Só o que está fora de comentário conta: o cabeçalho explica a decisão e
    // cita a diretiva várias vezes de propósito.
    const semComentarios = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(semComentarios).not.toMatch(/^\s*["']use client["']/m);
  });

  it("(e) o rótulo existe sempre, e pode ser visível", () => {
    const escondido = field().querySelector("[data-testid='search-input-label']");
    expect(escondido?.getAttribute("class")).toBe("sr-only");
    expect(escondido?.textContent).toBe("Buscar por nome");

    const visivel = field({ showLabel: true }).querySelector("[data-testid='search-input-label']");
    expect(visivel?.getAttribute("class")).toBeNull();
  });

  it("(e2) com rótulo visível, ele vai ACIMA da caixa e continua amarrado", () => {
    // Em 375px o rótulo inline quebra em duas linhas dentro da caixa de 44px e
    // sobra menos de um terço da largura para o texto (medido no navegador em
    // 13/09). Acima, a caixa inteira é do leitor — e a amarração passa a ser
    // por `htmlFor`, não por aninhamento, então ela precisa de teste próprio.
    const doc = field({ showLabel: true, id: "filtro-busca" });

    const rotulo = doc.querySelector("[data-testid='search-input-label']");
    expect(rotulo?.tagName).toBe("LABEL");
    expect(rotulo?.getAttribute("for")).toBe("filtro-busca");

    const caixa = doc.querySelector("[data-testid='search-field']");
    expect(caixa?.tagName).toBe("DIV");
    // Fora da caixa: se voltasse para dentro, teríamos `<label>` dentro de
    // `<label>` e dois nomes acessíveis concorrentes.
    expect(caixa?.contains(rotulo as Node)).toBe(false);
    expect(doc.querySelector("#filtro-busca")?.getAttribute("name")).toBe("q");
  });

  it("(f) `<label for>` amarra ao input quando há `id`", () => {
    const doc = field({ id: "filtro-busca" });
    expect(doc.querySelector("[data-testid='search-field']")?.getAttribute("for")).toBe(
      "filtro-busca",
    );
    expect(doc.querySelector("#filtro-busca")).not.toBeNull();
  });
});
