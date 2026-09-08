// @vitest-environment happy-dom
/**
 * tests/unit/components/SegmentedControl.test.tsx
 *
 * `<SegmentedControl />` — abas segmentadas (ADR-0025, Bloco 1).
 *
 * O que estes testes travam:
 *   - `role="tablist"` + `aria-label` obrigatório e `aria-selected` no ativo,
 *     o mesmo contrato de `components/atoms/controls/Tabs.tsx` (RNF-022);
 *   - roving tabindex: só o segmento ativo fica na ordem de tabulação
 *     (WAI-ARIA APG, padrão Tab) — e a matemática do wrap-around é testada
 *     direto em `nextSegmentIndex`, onde um off-by-one quebraria em silêncio;
 *   - `size="md"` tem `var(--tap-min)` = 44px, contra os 40px do kit
 *     (constituição § 4).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { nextSegmentIndex, SegmentedControl } from "@/components/atoms/controls/SegmentedControl";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

const OPTIONS = [
  { value: "parcial", label: "Parcial" },
  { value: "proj", label: "Projeção" },
];

function tabs(doc: Document): HTMLElement[] {
  return Array.from(doc.querySelectorAll("[role='tab']"));
}

function render(value = "parcial", extra: Record<string, unknown> = {}) {
  return parse(
    <SegmentedControl
      options={OPTIONS}
      value={value}
      onChange={() => {}}
      ariaLabel="Parcial ou projeção"
      {...extra}
    />,
  );
}

describe("nextSegmentIndex()", () => {
  it("(a) avança e volta com wrap-around", () => {
    expect(nextSegmentIndex(0, "ArrowRight", 3)).toBe(1);
    expect(nextSegmentIndex(2, "ArrowRight", 3)).toBe(0);
    expect(nextSegmentIndex(0, "ArrowLeft", 3)).toBe(2);
    expect(nextSegmentIndex(1, "ArrowLeft", 3)).toBe(0);
  });

  it("(b) ignora qualquer outra tecla e lista vazia", () => {
    expect(nextSegmentIndex(0, "Enter", 3)).toBeNull();
    expect(nextSegmentIndex(0, "ArrowDown", 3)).toBeNull();
    expect(nextSegmentIndex(0, "ArrowRight", 0)).toBeNull();
  });
});

describe("<SegmentedControl />", () => {
  it("(c) tablist nomeado + um tab por opção", () => {
    const doc = render();
    const list = doc.querySelector("[data-testid='segmented-control']");
    expect(list?.getAttribute("role")).toBe("tablist");
    expect(list?.getAttribute("aria-label")).toBe("Parcial ou projeção");
    expect(list?.getAttribute("data-value")).toBe("parcial");
    expect(tabs(doc).map((t) => t.textContent)).toEqual(["Parcial", "Projeção"]);
  });

  it("(d) aria-selected e data-active marcam só o ativo", () => {
    const doc = render("proj");
    expect(tabs(doc).map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    expect(tabs(doc).map((t) => t.getAttribute("data-active"))).toEqual(["false", "true"]);
  });

  it("(e) roving tabindex: só o ativo tem tabindex 0", () => {
    expect(tabs(render("parcial")).map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1"]);
    expect(tabs(render("proj")).map((t) => t.getAttribute("tabindex"))).toEqual(["-1", "0"]);
  });

  it("(f) os tabs são <button type=button>, não links", () => {
    for (const t of tabs(render())) {
      expect(t.tagName).toBe("BUTTON");
      expect(t.getAttribute("type")).toBe("button");
    }
  });

  it("(g) md tem 44px (var(--tap-min)); sm tem 32px", () => {
    expect(tabs(render("parcial"))[0]?.getAttribute("style")).toContain("height:var(--tap-min)");
    expect(tabs(render("parcial", { size: "sm" }))[0]?.getAttribute("style")).toContain(
      "height:32px",
    );
  });

  it("(h) o ativo é tinta cheia; o inativo é transparente", () => {
    const [inactive, active] = tabs(render("proj"));
    expect(active?.getAttribute("style")).toContain("var(--surface-inverse)");
    expect(active?.getAttribute("style")).toContain("var(--text-inverse)");
    expect(inactive?.getAttribute("style")).toContain("background:transparent");
  });

  it("(i) full={false} não estica", () => {
    const list = render("parcial", { full: false }).querySelector(
      "[data-testid='segmented-control']",
    );
    expect(list?.getAttribute("style")).not.toContain("width: 100%");
  });

  it("(j) nenhum hex literal no markup (constituição § 2)", () => {
    expect(
      renderToStaticMarkup(
        <SegmentedControl options={OPTIONS} value="parcial" onChange={() => {}} ariaLabel="x" />,
      ),
    ).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
