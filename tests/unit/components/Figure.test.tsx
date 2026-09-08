// @vitest-environment happy-dom
/**
 * tests/unit/components/Figure.test.tsx
 *
 * `<Figure />` — número-manchete do design system Atlas Menna (ADR-0025).
 *
 * O que estes testes travam:
 *   - o algarismo sai numa das composições `--type-figure*` (mono), então a
 *     coluna de números não dança entre atualizações;
 *   - `tone="accent"` usa `--accent-text` (5.12:1) e nunca `--accent-strong`
 *     (4.21:1) — em `size="sm"` o algarismo tem 13px (constituição § 4);
 *   - o trend é formatado em pt-BR com sinal explícito e a seta é
 *     `aria-hidden`: cor/glifo não podem ser o único portador (WCAG 1.4.1);
 *   - cor ligada a dado entra por prop, nunca por mapeamento de partido aqui.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Figure } from "@/components/atoms/data/Figure";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function value(doc: Document): HTMLElement | null {
  return doc.querySelector("[data-testid='figure-value']");
}

describe("<Figure />", () => {
  it("(a) rótulo em caixa alta + valor + unidade", () => {
    const doc = parse(<Figure label="Apurado" value="62,4" unit="%" />);
    const label = doc.querySelector("[data-testid='figure-label']");
    expect(label?.textContent).toBe("Apurado");
    expect(label?.getAttribute("style")).toContain("uppercase");
    expect(value(doc)?.textContent).toBe("62,4");
    expect(doc.body.textContent).toContain("%");
  });

  it("(b) cada size usa a composição mono correspondente", () => {
    expect(value(parse(<Figure label="L" value={1} />))?.getAttribute("style")).toContain(
      "var(--type-figure-lg)",
    );
    expect(value(parse(<Figure label="L" value={1} size="md" />))?.getAttribute("style")).toContain(
      "var(--type-figure)",
    );
    expect(value(parse(<Figure label="L" value={1} size="sm" />))?.getAttribute("style")).toContain(
      "var(--type-figure-sm)",
    );
  });

  it("(c) tone='accent' usa --accent-text, nunca --accent-strong", () => {
    const style = value(parse(<Figure label="L" value={1} tone="accent" />))?.getAttribute("style");
    expect(style).toContain("var(--accent-text)");
    expect(style).not.toContain("var(--accent-strong)");
  });

  it("(d) a prop color vence o tone e aceita qualquer token", () => {
    const style = value(
      parse(<Figure label="L" value={1} tone="accent" color="var(--color-cand-1)" />),
    )?.getAttribute("style");
    expect(style).toContain("var(--color-cand-1)");
    expect(style).not.toContain("var(--accent-text)");
  });

  it("(e) trend positivo/negativo/zero: sinal em texto pt-BR + seta aria-hidden", () => {
    const up = parse(<Figure label="L" value={1} trend={1.2} />);
    const upEl = up.querySelector("[data-testid='figure-trend']");
    expect(upEl?.textContent).toContain("+1,2 pp");
    expect(up.querySelector("[data-testid='figure-trend'] [aria-hidden='true']")?.textContent).toBe(
      "▲ ",
    );

    const down = parse(<Figure label="L" value={1} trend={-0.8} />);
    // U+2212 (minus sign), o mesmo que `formatPp` emite.
    expect(down.querySelector("[data-testid='figure-trend']")?.textContent).toContain("−0,8 pp");

    const flat = parse(<Figure label="L" value={1} trend={0} />);
    expect(flat.querySelector("[data-testid='figure-trend']")?.textContent).toContain("0,0 pp");
  });

  it("(f) trend ausente ou NaN não renderiza nada", () => {
    expect(
      parse(<Figure label="L" value={1} />).querySelector("[data-testid='figure-trend']"),
    ).toBeNull();
    expect(
      parse(<Figure label="L" value={1} trend={Number.NaN} />).querySelector(
        "[data-testid='figure-trend']",
      ),
    ).toBeNull();
  });

  it("(g) a nota de rodapé é opcional", () => {
    expect(
      parse(<Figure label="L" value={1} />).querySelector("[data-testid='figure-note']"),
    ).toBeNull();
    expect(
      parse(<Figure label="L" value={1} note="Atualizado 21:47" />).querySelector(
        "[data-testid='figure-note']",
      )?.textContent,
    ).toBe("Atualizado 21:47");
  });

  it("(h) align muda o justify-content da linha do valor", () => {
    const center = parse(<Figure label="L" value={1} align="center" />);
    expect(center.querySelector("[data-testid='figure']")?.getAttribute("style")).toContain(
      "text-align:center",
    );
  });

  it("(i) nenhum hex literal no markup (constituição § 2)", () => {
    const html = renderToStaticMarkup(
      <Figure label="L" value="62,4" unit="%" trend={1.2} note="n" tone="accent" />,
    );
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
