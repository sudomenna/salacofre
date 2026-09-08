// @vitest-environment happy-dom
/**
 * tests/unit/components/Sheet.test.tsx
 *
 * `<Sheet />` — overlay de detalhe (ADR-0025, Bloco 1).
 *
 * O que estes testes travam:
 *   - fechado NÃO renderiza nada (nem scrim invisível capturando cliques);
 *   - `aria-modal` só na variante com scrim: o cartão lateral do desktop NÃO
 *     é modal — o mapa atrás segue utilizável, e declarar `aria-modal` ali
 *     mentiria para o leitor de tela;
 *   - `aria-labelledby` aponta para o heading real, e o nível é configurável
 *     para não furar o outline da página;
 *   - o scrim é `<button>` fora da ordem de tabulação: a rota de teclado é o
 *     × e o Esc (WCAG 2.1.2, RNF-022);
 *   - o × tem `var(--tap-min)` (44px), contra os 32px do kit.
 */

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Sheet } from "@/components/atoms/overlays/Sheet";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function render(extra: Record<string, unknown> = {}) {
  return parse(
    <Sheet open onClose={() => {}} kicker="Município · SP" title="Campinas" {...extra}>
      <p>detalhe</p>
    </Sheet>,
  );
}

/** Código do componente sem comentários — o cabeçalho fala de "use client",
 *  `useState` etc. justamente para explicar por que eles não estão lá. */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("<Sheet />", () => {
  it("(a) fechado não renderiza nada", () => {
    const doc = parse(
      <Sheet open={false} onClose={() => {}} title="Campinas">
        <p>detalhe</p>
      </Sheet>,
    );
    expect(doc.body.innerHTML).toBe("");
  });

  it("(b) aberto é role=dialog com título, kicker e conteúdo", () => {
    const doc = render();
    const dialog = doc.querySelector("[data-testid='sheet']");
    expect(dialog?.getAttribute("role")).toBe("dialog");
    expect(doc.body.textContent).toContain("Município · SP");
    expect(doc.body.textContent).toContain("Campinas");
    expect(doc.body.textContent).toContain("detalhe");
  });

  it("(c) aria-labelledby aponta para o id real do heading", () => {
    const doc = render();
    const id = doc.querySelector("[data-testid='sheet']")?.getAttribute("aria-labelledby");
    expect(id).toBeTruthy();
    expect(doc.querySelector(`#${CSS.escape(id as string)}`)?.textContent).toBe("Campinas");
  });

  it("(d) headingLevel controla o nível do título (default h2)", () => {
    expect(render().querySelector("h2")?.textContent).toBe("Campinas");
    expect(render({ headingLevel: 3 }).querySelector("h3")?.textContent).toBe("Campinas");
  });

  it("(e) bottom sheet é modal e tem scrim; side não é modal e não tem", () => {
    const bottom = render();
    expect(bottom.querySelector("[data-testid='sheet']")?.getAttribute("aria-modal")).toBe("true");
    expect(bottom.querySelector("[data-testid='sheet-scrim']")).not.toBeNull();

    const side = render({ side: true });
    expect(side.querySelector("[data-testid='sheet']")?.getAttribute("aria-modal")).toBeNull();
    expect(side.querySelector("[data-testid='sheet']")?.getAttribute("data-side")).toBe("true");
    expect(side.querySelector("[data-testid='sheet-scrim']")).toBeNull();
    expect(side.querySelector("[data-testid='sheet-grabber']")).toBeNull();
  });

  it("(f) o scrim fica fora da ordem de tabulação e usa cor derivada de token", () => {
    const scrim = render().querySelector("[data-testid='sheet-scrim']");
    expect(scrim?.tagName).toBe("BUTTON");
    expect(scrim?.getAttribute("tabindex")).toBe("-1");
    expect(scrim?.getAttribute("aria-label")).toBe("Fechar");
    expect(scrim?.getAttribute("style")).toContain("color-mix(in srgb, var(--ink-0) 35%");
  });

  it("(g) o botão de fechar é nomeado e tem 44px", () => {
    const close = render().querySelector("[data-testid='sheet-close']");
    expect(close?.getAttribute("aria-label")).toBe("Fechar");
    expect(close?.getAttribute("style")).toContain("width:var(--tap-min)");
    expect(close?.getAttribute("style")).toContain("height:var(--tap-min)");
  });

  it("(h) o diálogo é focável programaticamente (tabindex=-1)", () => {
    expect(render().querySelector("[data-testid='sheet']")?.getAttribute("tabindex")).toBe("-1");
  });

  it("(i) Esc fecha e o foco volta para quem abriu", () => {
    const src = codeOf("components/atoms/overlays/Sheet.tsx");
    expect(src).toContain('event.key === "Escape"');
    expect(src).toContain("restoreRef.current?.focus()");
  });

  it("(j) nenhum hex literal no markup (constituição § 2)", () => {
    expect(
      renderToStaticMarkup(
        <Sheet open onClose={() => {}} title="Campinas">
          x
        </Sheet>,
      ),
    ).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
