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
    },
  ],
  needle_position: 0.56,
  needle_band: "likely_a",
  candidato_a_id: 13,
  candidato_b_id: 22,
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
});
