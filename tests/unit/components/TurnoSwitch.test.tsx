// @vitest-environment happy-dom
/**
 * tests/unit/components/TurnoSwitch.test.tsx
 *
 * Seletor de turno do shell (ADR-0029 § 2).
 *
 * A regra que este arquivo protege é a do item (a) do ADR: **a opção
 * indisponível aparece desabilitada, nunca oculta**, e nunca como `<a>`.
 * Esconder sugeriria que a plataforma não cobre o outro turno; um link para
 * uma rota sem dado é pior que texto.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TurnoSwitch } from "@/components/layout/TurnoSwitch";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("<TurnoSwitch />", () => {
  it("(a) grupo nomeado com as duas opções sempre presentes", () => {
    const doc = parse(<TurnoSwitch turno={1} />);
    const group = doc.querySelector("[data-testid='turno-switch']");

    expect(group?.getAttribute("role")).toBe("group");
    expect(group?.getAttribute("aria-label")).toBe("Turno da apuração");
    expect(group?.getAttribute("data-value")).toBe("1");
    expect(
      doc.querySelectorAll("[data-value='1'], [data-value='2']").length,
    ).toBeGreaterThanOrEqual(2);
    const texto = doc.body.textContent ?? "";
    expect(texto).toContain("1º turno");
    expect(texto).toContain("2º turno");
  });

  it("(b) antes de 04/10 o 2º turno fica desabilitado e explicado — não some", () => {
    const doc = parse(<TurnoSwitch turno={1} />);
    const segundo = doc.querySelector("[data-testid='turno-switch'] > [data-value='2']");

    expect(segundo).not.toBeNull();
    expect(segundo?.tagName).toBe("SPAN");
    expect(segundo?.getAttribute("aria-disabled")).toBe("true");
    // A razão vai para o `title` (mouse) E para texto só-leitor-de-tela:
    // `title` sozinho não é anunciado de forma confiável em modo de leitura.
    expect(segundo?.getAttribute("title")).toContain("2º turno ainda não aconteceu");
    expect(segundo?.querySelector(".sr-only")?.textContent).toContain(
      "2º turno ainda não aconteceu",
    );
    expect(doc.querySelector("a[data-value='2']")).toBeNull();
  });

  it("(c) o turno corrente carrega aria-current=page", () => {
    const doc = parse(<TurnoSwitch turno={1} />);
    const item = (v: string) =>
      doc.querySelector(`[data-testid='turno-switch'] > [data-value='${v}']`);
    expect(item("1")?.getAttribute("aria-current")).toBe("page");
    expect(item("2")?.getAttribute("aria-current")).toBeNull();
  });

  it("(d) sem rota declarada, nenhum item vira <a> — link para rota inexistente é pior que texto", () => {
    const doc = parse(<TurnoSwitch turno={1} />);
    expect(doc.querySelectorAll("a")).toHaveLength(0);
  });

  it("(e) com rota de arquivo declarada, o turno arquivado vira link navegável", () => {
    // É assim que o controle liga quando existir rota de arquivo de turno: uma
    // prop, sem reescrever o componente e sem tocar em `searchParams`.
    const doc = parse(<TurnoSwitch turno={2} hrefByTurno={{ 1: "/turno/1", 2: "/" }} />);
    const item = (v: string) =>
      doc.querySelector(`[data-testid='turno-switch'] > [data-value='${v}']`);
    const primeiro = item("1");

    expect(primeiro?.tagName).toBe("A");
    expect(primeiro?.getAttribute("href")).toBe("/turno/1");
    expect(primeiro?.getAttribute("aria-disabled")).toBeNull();
    expect(item("2")?.getAttribute("aria-current")).toBe("page");
  });

  it("(f) alvo de toque >= --tap-min em todos os itens (constituição § 4)", () => {
    const html = renderToStaticMarkup(<TurnoSwitch turno={1} />);
    const alturas = [...html.matchAll(/min-height:\s*var\(--tap-min\)/g)];
    expect(alturas).toHaveLength(2);
  });

  it("(g) nenhum hex literal no markup (constituição § 2)", () => {
    expect(renderToStaticMarkup(<TurnoSwitch turno={1} />)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
