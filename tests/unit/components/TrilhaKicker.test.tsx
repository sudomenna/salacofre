// @vitest-environment happy-dom
/**
 * tests/unit/components/TrilhaKicker.test.tsx
 *
 * Unit tests do <TrilhaKicker /> — ADR-0019 (identidade visual por trilha).
 *
 * O que importa aqui: o rótulo correto por trilha, a profundidade dos crumbs
 * (a trilha de governador não tem nó nacional) e o consumo do token
 * `--trilha-accent` — nunca um hex literal (constituição § 2: accent é chrome
 * institucional, não cor partidária).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TrilhaKicker } from "@/components/atoms/nav/TrilhaKicker";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("<TrilhaKicker /> — ADR-0019", () => {
  it("(a) trilha pres com dois crumbs → 'PRESIDÊNCIA · Brasil › SP'", () => {
    const doc = parse(<TrilhaKicker trilha="pres" crumbs={["Brasil", "SP"]} />);
    const text = doc.body.textContent?.replace(/\s+/g, " ").trim();
    expect(text).toBe("PRESIDÊNCIA · Brasil › SP");
  });

  it("(b) trilha gov com um crumb → 'GOVERNADOR · SP' (sem nó nacional)", () => {
    const doc = parse(<TrilhaKicker trilha="gov" crumbs={["SP"]} />);
    const text = doc.body.textContent?.replace(/\s+/g, " ").trim();
    expect(text).toBe("GOVERNADOR · SP");
    expect(text).not.toContain("Brasil");
  });

  it("(c) sem crumbs → só o rótulo da trilha, sem separadores órfãos", () => {
    const doc = parse(<TrilhaKicker trilha="pres" crumbs={[]} />);
    const text = doc.body.textContent?.replace(/\s+/g, " ").trim();
    expect(text).toBe("PRESIDÊNCIA");
    expect(text).not.toContain("·");
    expect(text).not.toContain("›");
  });

  it("(d) crumbs vazios/whitespace são descartados", () => {
    const doc = parse(<TrilhaKicker trilha="pres" crumbs={["Brasil", "  ", ""]} />);
    const text = doc.body.textContent?.replace(/\s+/g, " ").trim();
    expect(text).toBe("PRESIDÊNCIA · Brasil");
  });

  it("(e) cor e regra superior vêm do token --trilha-accent (nunca hex literal)", () => {
    const doc = parse(<TrilhaKicker trilha="gov" crumbs={["SP"]} />);
    const p = doc.querySelector("p");
    const style = p?.getAttribute("style") ?? "";
    expect(style).toContain("var(--trilha-accent)");
    expect(style).toMatch(/border-top:\s*3px solid var\(--trilha-accent\)/);
    // Nenhum hex hardcoded — a cor é resolvida pelo `main[data-trilha]`.
    expect(style).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  it("(f) é um <p> uppercase text-xs tracking-wide e marca a trilha no DOM", () => {
    const doc = parse(<TrilhaKicker trilha="pres" crumbs={["Brasil"]} />);
    const p = doc.querySelector("p");
    expect(p).not.toBeNull();
    expect(p?.getAttribute("data-trilha-kicker")).toBe("pres");
    const cls = p?.getAttribute("class") ?? "";
    expect(cls).toContain("uppercase");
    expect(cls).toContain("text-xs");
    expect(cls).toContain("tracking-wide");
  });

  it("(g) separadores são decorativos (aria-hidden)", () => {
    const doc = parse(<TrilhaKicker trilha="pres" crumbs={["Brasil", "SP"]} />);
    const hidden = [...doc.querySelectorAll('[aria-hidden="true"]')].map((el) =>
      el.textContent?.trim(),
    );
    expect(hidden).toContain("·");
    expect(hidden).toContain("›");
  });
});
