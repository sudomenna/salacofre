// @vitest-environment happy-dom
/**
 * tests/unit/components/VoteBar.test.tsx
 *
 * `<VoteBar />` — barra empilhada com marcador de 50% (ADR-0025, Bloco 1).
 *
 * O que estes testes travam:
 *   - a cor de cada segmento vem SEMPRE por prop; o átomo não conhece sigla
 *     de partido (ADR-0024 / constituição § 2);
 *   - percentuais fora de [0, 100] são clampeados, então uma projeção torta
 *     não explode o layout no dia da eleição (constituição § 7);
 *   - a barra tem texto alternativo com a série completa — uma divisão
 *     colorida sem `aria-label` é invisível para leitor de tela (RNF-022/023);
 *   - a linha de rótulos visíveis é `aria-hidden` (duplicaria o alt).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { VoteBar, voteBarLabel } from "@/components/atoms/bars/VoteBar";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

const SEGMENTS = [
  { label: "Lula", pct: 41.2, color: "var(--color-cand-1)" },
  { label: "Flávio", pct: 36.8, color: "var(--color-cand-2)" },
  { label: "Outros", pct: 22 },
];

function segments(doc: Document): HTMLElement[] {
  return Array.from(doc.querySelectorAll("[data-testid='vote-bar-segment']"));
}

describe("voteBarLabel()", () => {
  it("(a) monta a série completa em pt-BR", () => {
    expect(voteBarLabel(SEGMENTS)).toBe("Lula 41,2%, Flávio 36,8%, Outros 22,0%");
  });
});

describe("<VoteBar />", () => {
  it("(b) um segmento por entrada, na ordem dada, com a largura em %", () => {
    const el = segments(parse(<VoteBar segments={SEGMENTS} />));
    expect(el.length).toBe(3);
    expect(el.map((s) => s.getAttribute("data-label"))).toEqual(["Lula", "Flávio", "Outros"]);
    expect(el[0]?.getAttribute("style")).toContain("width:41.2%");
    expect(el[1]?.getAttribute("style")).toContain("width:36.8%");
  });

  it("(c) a cor vem da prop; sem cor, cai no fallback --party-outros", () => {
    const el = segments(parse(<VoteBar segments={SEGMENTS} />));
    expect(el[0]?.getAttribute("style")).toContain("var(--color-cand-1)");
    expect(el[2]?.getAttribute("style")).toContain("var(--party-outros, var(--color-cand-other))");
  });

  it("(d) pct fora de [0, 100] e NaN são clampeados", () => {
    const el = segments(
      parse(
        <VoteBar
          segments={[
            { label: "A", pct: -5 },
            { label: "B", pct: 140 },
            { label: "C", pct: Number.NaN },
          ]}
        />,
      ),
    );
    expect(el[0]?.getAttribute("style")).toContain("width:0%");
    expect(el[1]?.getAttribute("style")).toContain("width:100%");
    expect(el[2]?.getAttribute("style")).toContain("width:0%");
  });

  it("(e) a barra é role=img com a série completa no aria-label", () => {
    const track = parse(<VoteBar segments={SEGMENTS} />).querySelector(
      "[data-testid='vote-bar-track']",
    );
    expect(track?.getAttribute("role")).toBe("img");
    expect(track?.getAttribute("aria-label")).toBe("Lula 41,2%, Flávio 36,8%, Outros 22,0%");
  });

  it("(f) ariaLabel sobrescreve o texto gerado", () => {
    const track = parse(<VoteBar segments={SEGMENTS} ariaLabel="Votos válidos SP" />).querySelector(
      "[data-testid='vote-bar-track']",
    );
    expect(track?.getAttribute("aria-label")).toBe("Votos válidos SP");
  });

  it("(g) o marcador default fica em 50% e some com marker={null}", () => {
    const marker = parse(<VoteBar segments={SEGMENTS} />).querySelector(
      "[data-testid='vote-bar-marker']",
    );
    expect(marker?.getAttribute("style")).toContain("left:50%");
    expect(marker?.getAttribute("aria-hidden")).toBe("true");
    expect(
      parse(<VoteBar segments={SEGMENTS} marker={null} />).querySelector(
        "[data-testid='vote-bar-marker']",
      ),
    ).toBeNull();
  });

  it("(h) os rótulos visíveis são aria-hidden e podem ser desligados", () => {
    const labels = parse(<VoteBar segments={SEGMENTS} />).querySelector(
      "[data-testid='vote-bar-labels']",
    );
    expect(labels?.getAttribute("aria-hidden")).toBe("true");
    expect(labels?.textContent).toContain("Lula 41,2%");
    expect(labels?.textContent).toContain("50%");
    expect(
      parse(<VoteBar segments={SEGMENTS} showLabels={false} />).querySelector(
        "[data-testid='vote-bar-labels']",
      ),
    ).toBeNull();
  });

  it("(i) barra vazia não quebra", () => {
    const doc = parse(<VoteBar segments={[]} />);
    expect(segments(doc).length).toBe(0);
    expect(doc.querySelector("[data-testid='vote-bar-track']")?.getAttribute("aria-label")).toBe(
      "",
    );
  });

  it("(j) nenhum hex literal no markup (constituição § 2)", () => {
    expect(renderToStaticMarkup(<VoteBar segments={SEGMENTS} />)).not.toMatch(
      /#[0-9a-fA-F]{3,8}\b/,
    );
  });
});
