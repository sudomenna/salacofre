// @vitest-environment happy-dom
/**
 * tests/unit/components/RaceTypeIndicator.test.tsx
 *
 * Unit tests do <RaceTypeIndicator /> — texto descritivo do tipo da disputa.
 * Cobertura RF-030.8 (S05/F4c, ADR-0017).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RaceTypeIndicator } from "@/components/atoms/badges/RaceTypeIndicator";
import type { EdgeCandidate } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function makeCand(over: Partial<EdgeCandidate>): EdgeCandidate {
  return {
    id: 0,
    nome: "X",
    partido: "P",
    cor: "var(--color-cand-1)",
    votos_atuais: 0,
    votos_projetados: 0,
    pct_atual: 0,
    pct_projetado: 0,
    pct_projetado_lower: 0,
    pct_projetado_upper: 0,
    p_vitoria: 0,
    rank: 1,
    p_passa_2t: 0,
    p_fecha_1t: 0,
    ...over,
  };
}

describe("<RaceTypeIndicator />", () => {
  it("(a) 11 candidatos em 1T (1 com pct < 0.5%) → 'Disputa entre 10 candidatos'", () => {
    // Mantemos 10 com pct >= 0.5 e 1 com pct < 0.5 (que NÃO entra na contagem).
    const cands: EdgeCandidate[] = [
      makeCand({ id: 1, pct_projetado: 43.2 }),
      makeCand({ id: 2, pct_projetado: 38.0 }),
      makeCand({ id: 3, pct_projetado: 4.5 }),
      makeCand({ id: 4, pct_projetado: 3.0 }),
      makeCand({ id: 5, pct_projetado: 2.0 }),
      makeCand({ id: 6, pct_projetado: 1.5 }),
      makeCand({ id: 7, pct_projetado: 1.0 }),
      makeCand({ id: 8, pct_projetado: 0.8 }),
      makeCand({ id: 9, pct_projetado: 0.5 }),
      makeCand({ id: 10, pct_projetado: 0.5 }),
      makeCand({ id: 11, pct_projetado: 0.2 }), // fora da contagem
    ];
    const doc = parse(<RaceTypeIndicator candidatos={cands} turno={1} />);
    expect(doc.body.textContent).toContain("Disputa entre 10 candidatos");
  });

  it("(b) 2 candidatos em 2T → 'Segundo turno entre Lula e Bolsonaro'", () => {
    const cands: EdgeCandidate[] = [
      makeCand({ id: 1, nome: "Lula", partido: "PT", pct_projetado: 52.0 }),
      makeCand({ id: 2, nome: "Bolsonaro", partido: "PL", pct_projetado: 48.0 }),
    ];
    const doc = parse(<RaceTypeIndicator candidatos={cands} turno={2} />);
    expect(doc.body.textContent).toContain("Segundo turno entre Lula e Bolsonaro");
  });

  it("(c) 1 candidato em 1T → 'Disputa entre 1 candidato' (singular)", () => {
    const cands: EdgeCandidate[] = [makeCand({ id: 1, pct_projetado: 60 })];
    const doc = parse(<RaceTypeIndicator candidatos={cands} turno={1} />);
    expect(doc.body.textContent).toContain("Disputa entre 1 candidato");
    // Garante que NÃO usou plural "candidatos"
    expect(doc.body.textContent).not.toContain("Disputa entre 1 candidatos");
  });
});
