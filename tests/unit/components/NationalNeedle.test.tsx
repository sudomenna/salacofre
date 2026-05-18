// @vitest-environment happy-dom
/**
 * tests/unit/components/NationalNeedle.test.tsx — RF-021.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NationalNeedle } from "@/components/blocks/NationalNeedle";
import type { EdgeNational } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

const baseNational: EdgeNational = {
  candidatos: [
    {
      id: 13,
      nome: "Lula",
      partido: "PT",
      cor: "var(--color-pt)",
      votos_atuais: 1,
      votos_projetados: 1,
      pct_atual: 53.0,
      pct_projetado: 53.2,
      pct_projetado_lower: 51,
      pct_projetado_upper: 55,
      p_vitoria: 0.78,
      rank: 1,
      p_passa_2t: 0.99,
      p_fecha_1t: 0.65,
    },
    {
      id: 22,
      nome: "Bolsonaro",
      partido: "PL",
      cor: "var(--color-pl)",
      votos_atuais: 1,
      votos_projetados: 1,
      pct_atual: 47.0,
      pct_projetado: 46.8,
      pct_projetado_lower: 44,
      pct_projetado_upper: 49,
      p_vitoria: 0.22,
      rank: 2,
      p_passa_2t: 0.95,
      p_fecha_1t: 0.0,
    },
  ],
  needle_position: 0.56,
  needle_band: "likely_a",
  candidato_a_id: 13,
  candidato_b_id: 22,
  p_segundo_turno_overall: 0.35,
  cenarios_2t: [{ par: [13, 22], prob: 0.95 }],
};

describe("<NationalNeedle />", () => {
  it("(a) usa candidato_a_id/b_id para identificar líder", () => {
    const doc = parse(<NationalNeedle national={baseNational} />);
    const svg = doc.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toContain("Lula");
    expect(svg?.getAttribute("aria-label")).toContain("78%");
  });

  it("(b) candidato_a_id null → fallback para candidatos[0]", () => {
    const doc = parse(
      <NationalNeedle national={{ ...baseNational, candidato_a_id: null, candidato_b_id: null }} />,
    );
    const svg = doc.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toContain("Lula");
  });

  it("(c) sem candidatos → 'Aguardando dados…'", () => {
    const doc = parse(
      <NationalNeedle
        national={{
          ...baseNational,
          candidatos: [],
          candidato_a_id: null,
          candidato_b_id: null,
        }}
      />,
    );
    expect(doc.body.textContent).toContain("Aguardando dados");
  });

  it("(d) variant nacional → 'Forecast nacional' no aria-label", () => {
    const doc = parse(<NationalNeedle national={baseNational} />);
    const svg = doc.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toContain("Forecast nacional");
  });

  it("(e) variant='national-1t' com pSegundoTurno=0.35 → posição +0.3 (decide 1T leve)", () => {
    const doc = parse(
      <NationalNeedle national={baseNational} variant="national-1t" pSegundoTurno={0.35} />,
    );
    const svg = doc.querySelector("svg");
    // pDecide1T = 0.65 → aria-label fala em "decisão no 1º turno" + 65%
    expect(svg?.getAttribute("aria-label")).toContain("decisão no 1º turno");
    expect(svg?.getAttribute("aria-label")).toContain("65%");
    // Labels laterais "2º turno" / "Decide 1T (Lula)"
    const texts = Array.from(doc.querySelectorAll("text")).map((t) => t.textContent ?? "");
    expect(texts.some((t) => t === "2º turno")).toBe(true);
    expect(texts.some((t) => t.includes("Decide 1T") && t.includes("Lula"))).toBe(true);
  });

  it("(f) variant='national-2t' mantém comportamento S04 (duelo binário)", () => {
    const doc = parse(<NationalNeedle national={baseNational} variant="national-2t" />);
    const svg = doc.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toContain("Lula");
    expect(svg?.getAttribute("aria-label")).toContain("78%");
  });

  it("(g) variant='uf' renderiza com labels binários", () => {
    const doc = parse(<NationalNeedle national={baseNational} variant="uf" />);
    const svg = doc.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toContain("Forecast estadual");
  });

  it("(h) variant='national-1t' com pSegundoTurno null → placeholder textual", () => {
    const doc = parse(
      <NationalNeedle
        national={{ ...baseNational, p_segundo_turno_overall: null }}
        variant="national-1t"
        pSegundoTurno={null}
      />,
    );
    // Não renderiza SVG; mostra placeholder textual.
    expect(doc.querySelector("svg")).toBeNull();
    expect(doc.body.textContent).toContain("indisponível");
  });
});
