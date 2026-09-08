// @vitest-environment happy-dom
/**
 * tests/unit/components/Panel.test.tsx
 *
 * `<Panel />` — seção editorial do design system Atlas Menna (ADR-0025, Bloco 1).
 *
 * O que estes testes travam:
 *   - o filete no topo é a separação de seção (não existe card com sombra);
 *   - o kicker sai em `--accent-text` (5.12:1) e NUNCA em `--accent-strong`
 *     (4.21:1), que reprovaria os 4.5:1 da constituição § 4 / RNF-022;
 *   - `aria-labelledby` só aparece quando o caller amarra `titleId` — uma
 *     `<section>` sem nome não vira landmark e não polui o sumário do leitor;
 *   - zero hex literal no markup (constituição § 2: cor só por token).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Panel } from "@/components/atoms/surfaces/Panel";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function panel(doc: Document): HTMLElement | null {
  return doc.querySelector("[data-testid='panel']");
}

describe("<Panel />", () => {
  it("(a) o filete default é duplo e sai do token --rule-double", () => {
    const doc = parse(<Panel title="Resultado parcial">conteúdo</Panel>);
    const el = panel(doc);
    expect(el?.tagName).toBe("SECTION");
    expect(el?.getAttribute("data-rule")).toBe("double");
    expect(el?.getAttribute("style")).toContain("var(--rule-double)");
  });

  it("(b) rule='single' e rule='none' mudam o filete; 'none' zera o padding do topo", () => {
    const single = panel(parse(<Panel rule="single" title="Sub" />));
    expect(single?.getAttribute("style")).toContain("1px solid var(--border-strong)");
    expect(single?.getAttribute("style")).not.toContain("var(--rule-double)");

    const none = panel(parse(<Panel rule="none" title="Solto" />));
    expect(none?.getAttribute("data-rule")).toBe("none");
    expect(none?.getAttribute("style")).not.toContain("border-top");
    expect(none?.getAttribute("style")).toContain("padding-top:0");
  });

  it("(c) o kicker usa --accent-text, nunca --accent-strong (contraste de texto)", () => {
    const doc = parse(<Panel kicker="Presidente · Brasil" title="Resultado parcial" />);
    const kicker = doc.querySelector("[data-testid='panel-kicker']");
    expect(kicker?.textContent).toBe("Presidente · Brasil");
    const style = kicker?.getAttribute("style") ?? "";
    expect(style).toContain("var(--accent-text)");
    expect(style).not.toContain("var(--accent-strong)");
    expect(style).toContain("uppercase");
  });

  it("(d) o título é h2 por default e o nível é configurável", () => {
    expect(parse(<Panel title="T" />).querySelector("h2")?.textContent).toBe("T");
    expect(parse(<Panel title="T" headingLevel={3} />).querySelector("h3")?.textContent).toBe("T");
    expect(parse(<Panel title="T" headingLevel={4} />).querySelector("h4")).not.toBeNull();
  });

  it("(e) aria-labelledby só com titleId, e aponta para o id do heading", () => {
    const semId = panel(parse(<Panel title="Resultado" />));
    expect(semId?.getAttribute("aria-labelledby")).toBeNull();

    const doc = parse(<Panel title="Resultado" titleId="painel-resultado" />);
    expect(panel(doc)?.getAttribute("aria-labelledby")).toBe("painel-resultado");
    expect(doc.querySelector("h2")?.getAttribute("id")).toBe("painel-resultado");
  });

  it("(f) sem kicker/título/ação não renderiza header algum", () => {
    const doc = parse(<Panel>só conteúdo</Panel>);
    expect(doc.querySelector("header")).toBeNull();
    expect(panel(doc)?.textContent).toBe("só conteúdo");
  });

  it("(g) o slot de ação renderiza à direita do título", () => {
    const doc = parse(<Panel title="T" action={<button type="button">Metodologia</button>} />);
    expect(doc.querySelector("header button")?.textContent).toBe("Metodologia");
  });

  it("(h) nenhum hex literal no markup — cor só por token (constituição § 2)", () => {
    const html = renderToStaticMarkup(
      <Panel kicker="K" title="T">
        x
      </Panel>,
    );
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
