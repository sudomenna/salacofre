// @vitest-environment happy-dom
/**
 * tests/unit/components/ShellControls.test.tsx
 *
 * A segunda linha do `<TopBar>` (ADR-0029 §§ 2–3): navegação de cargo do
 * desktop + os dois controles globais.
 *
 * Além da composição, este arquivo fixa as duas exigências de acessibilidade
 * do § 4 da constituição para controles do shell: **nome acessível** e
 * **estado exposto**. Um `role="tablist"` anônimo é uma lista sem sentido no
 * leitor de tela, e um segmentado sem `aria-selected` não diz onde o leitor
 * está.
 */

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ShellControls } from "@/components/layout/ShellControls";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("<ShellControls />", () => {
  it("(a) traz os dois controles globais do ADR-0029 § 2", () => {
    const doc = parse(<ShellControls />);
    expect(doc.querySelector("[data-testid='shell-controls']")).not.toBeNull();
    expect(doc.querySelector("[data-testid='turno-switch']")).not.toBeNull();
    expect(doc.querySelector("[data-testid='view-mode-switch']")).not.toBeNull();
  });

  it("(b) os dois grupos têm nome acessível e estado exposto", () => {
    const doc = parse(<ShellControls />);

    expect(doc.querySelector("[data-testid='turno-switch']")?.getAttribute("aria-label")).toBe(
      "Turno da apuração",
    );

    const view = doc.querySelector("[role='tablist']");
    expect(view?.getAttribute("aria-label")).toBe(
      "Números em destaque: parcial apurado ou projeção",
    );
    const tabs = [...(view?.querySelectorAll("[role='tab']") ?? [])];
    expect(tabs.map((t) => t.getAttribute("data-value"))).toEqual(["parcial", "proj"]);
    // Estado exposto: exatamente um selecionado, e é o default da store.
    expect(tabs.filter((t) => t.getAttribute("aria-selected") === "true")).toHaveLength(1);
    expect(view?.getAttribute("data-value")).toBe("proj");
  });

  it("(c) o slot de cargo é do caller — o layout continua sendo quem compõe o shell", () => {
    const doc = parse(<ShellControls cargoNav={<nav aria-label="Cargos" />} />);
    expect(doc.querySelector("nav[aria-label='Cargos']")).not.toBeNull();
  });

  it("(d) alvo de toque >= --tap-min nos dois controles (constituição § 4)", () => {
    const html = renderToStaticMarkup(<ShellControls />);
    // 2 do TurnoSwitch (min-height) + 2 do SegmentedControl size="md" (height).
    expect([...html.matchAll(/var\(--tap-min\)/g)]).toHaveLength(4);
  });

  it("(e) os controles somem em rota sem corrida — via CSS, não via JS", () => {
    // A regra vive no `.module.css` e depende de `main[data-trilha]`, que só
    // as páginas de corrida emitem (ADR-0019). Verificar aqui é o que impede
    // alguém de "resolver" isso com `usePathname()` no shell, que somaria JS
    // acima da dobra em todas as rotas.
    const css = readFileSync("components/layout/ShellControls.module.css", "utf8");
    expect(css).toMatch(
      /body:not\(:has\(main\[data-trilha\]\)\)\s*\.controls\s*\{[^}]*display:\s*none/,
    );
  });
});
