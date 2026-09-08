// @vitest-environment happy-dom
/**
 * tests/unit/components/HoverCard.test.tsx
 *
 * `<HoverCard />` — tooltip do mapa (ADR-0025, Bloco 1).
 *
 * O que estes testes travam:
 *   - o cartão é `aria-hidden` e `pointer-events: none`: ele espelha o que o
 *     hover do mouse já mostrou. Quem navega por teclado ou leitor de tela
 *     recebe a mesma informação pela tabela que acompanha o mapa (RNF-023) —
 *     não por um tooltip preso a um ponteiro que essa pessoa não tem;
 *   - o par editorial Parcial (tinta) × Projeção (ocre), com o cabeçalho
 *     "Proj." em `--accent-text` (5.12:1) e não `--accent-strong` (4.21:1);
 *   - projeção ausente vira travessão, nunca "undefined" ou NaN;
 *   - o arquivo é Server Component (sem estado nem evento).
 */

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HoverCard } from "@/components/atoms/overlays/HoverCard";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

const ROWS = [
  { name: "Lula", color: "var(--color-cand-1)", pct: 47.1, proj: 48.04 },
  { name: "Flávio", color: "var(--color-cand-2)", pct: 41.9 },
];

function render(extra: Record<string, unknown> = {}) {
  return parse(
    <HoverCard
      x={120}
      y={80}
      kicker="Unidade federativa"
      title="Minas Gerais"
      rows={ROWS}
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

describe("<HoverCard />", () => {
  it("(a) posiciona pelo offset do ponteiro e não intercepta o mouse", () => {
    const el = render().querySelector("[data-testid='hover-card']");
    expect(el?.getAttribute("style")).toContain("left:120px");
    expect(el?.getAttribute("style")).toContain("top:80px");
    expect(el?.getAttribute("class")).toContain("pointer-events-none");
  });

  it("(b) é aria-hidden — a rota acessível é a tabela do mapa (RNF-023)", () => {
    expect(render().querySelector("[data-testid='hover-card']")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("(c) flip inverte o cartão para a esquerda do ponteiro", () => {
    expect(render().querySelector("[data-testid='hover-card']")?.getAttribute("style")).toContain(
      "translate(12px, 12px)",
    );
    const flipped = render({ flip: true }).querySelector("[data-testid='hover-card']");
    expect(flipped?.getAttribute("data-flip")).toBe("true");
    expect(flipped?.getAttribute("style")).toContain("translate(calc(-100% - 12px), 12px)");
  });

  it("(d) título, kicker e apurado arredondado", () => {
    const doc = render({ apurado: 71.4 });
    expect(doc.querySelector("[data-testid='hover-card-title']")?.textContent).toBe("Minas Gerais");
    expect(doc.body.textContent).toContain("Unidade federativa");
    expect(doc.querySelector("[data-testid='hover-card-apurado']")?.textContent).toBe(
      "71% apurado",
    );
  });

  it("(e) apurado fora de [0, 100] é clampeado; ausente não renderiza", () => {
    expect(
      render({ apurado: 140 }).querySelector("[data-testid='hover-card-apurado']")?.textContent,
    ).toBe("100% apurado");
    expect(render().querySelector("[data-testid='hover-card-apurado']")).toBeNull();
  });

  it("(f) parcial em pt-BR e projeção ausente vira travessão", () => {
    const doc = render();
    const parcial = Array.from(doc.querySelectorAll("[data-testid='hover-card-parcial']"));
    const proj = Array.from(doc.querySelectorAll("[data-testid='hover-card-proj']"));
    expect(parcial.map((e) => e.textContent)).toEqual(["47,1%", "41,9%"]);
    expect(proj.map((e) => e.textContent)).toEqual(["48,0%", "—"]);
  });

  it("(g) a coluna de projeção usa --accent-text, nunca --accent-strong", () => {
    const html = renderToStaticMarkup(<HoverCard x={0} y={0} title="MG" rows={ROWS} />);
    expect(html).toContain("var(--accent-text)");
    expect(html).not.toContain("var(--accent-strong)");
  });

  it("(h) a cor de cada linha vem por prop (o átomo não conhece partido)", () => {
    const html = renderToStaticMarkup(<HoverCard x={0} y={0} title="MG" rows={ROWS} />);
    expect(html).toContain("var(--color-cand-1)");
    expect(html).toContain("var(--color-cand-2)");
  });

  it("(i) lista vazia não quebra", () => {
    expect(render({ rows: [] }).querySelector("[data-testid='hover-card-parcial']")).toBeNull();
  });

  it('(k) sem parcial em nenhuma linha, a coluna "Parcial" some do cartão', () => {
    // O payload nacional só tem parcial agregada por UF (`pct_apurado`, que vai
    // no cabeçalho), não por candidato — `EdgeUfRow.top_candidatos` carrega só
    // `pct_projetado`. Uma coluna que só renderiza travessão promete um dado
    // que o produto não tem; ela desaparece, e o cabeçalho "Proj." fica.
    const doc = parse(
      <HoverCard
        x={0}
        y={0}
        title="Bahia"
        rows={[
          { name: "Lula", color: "var(--party-pt)", proj: 52.3 },
          { name: "Flávio", color: "var(--party-pl)", proj: 41.2 },
        ]}
      />,
    );
    expect(doc.body.textContent).not.toContain("Parcial");
    expect(doc.body.textContent).toContain("Proj.");
    expect(doc.querySelectorAll("[data-testid='hover-card-parcial']").length).toBe(0);
    expect(doc.querySelectorAll("[data-testid='hover-card-proj']").length).toBe(2);
  });

  it("(l) parcial não-finita (NaN) conta como ausente", () => {
    const doc = parse(
      <HoverCard
        x={0}
        y={0}
        title="Bahia"
        rows={[{ name: "Lula", color: "var(--party-pt)", pct: Number.NaN, proj: 52.3 }]}
      />,
    );
    expect(doc.body.textContent).not.toContain("Parcial");
  });

  it("(m) basta UMA linha com parcial para a coluna existir", () => {
    const doc = parse(
      <HoverCard
        x={0}
        y={0}
        title="Bahia"
        rows={[
          { name: "Lula", color: "var(--party-pt)", pct: 47.1, proj: 52.3 },
          { name: "Flávio", color: "var(--party-pl)", proj: 41.2 },
        ]}
      />,
    );
    expect(doc.body.textContent).toContain("Parcial");
    // a linha sem parcial mostra travessão, não some
    expect(doc.querySelectorAll("[data-testid='hover-card-parcial']").length).toBe(2);
  });

  it("(j) é Server Component e não tem hex literal", () => {
    const src = codeOf("components/atoms/overlays/HoverCard.tsx");
    expect(src).not.toContain('"use client"');
    expect(
      renderToStaticMarkup(<HoverCard x={0} y={0} title="MG" rows={ROWS} apurado={50} />),
    ).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
