/**
 * tests/unit/utils/participacao.test.ts
 *
 * Helpers do denominador misto do hero de 1º turno (S07/Fase 2).
 */

import { describe, expect, it } from "vitest";

import type { EdgeCandidate, EdgeUfCandidate } from "@/lib/edge-config/types";
import {
  denominadorFrase,
  denominadorLabel,
  outrosCount,
  outrosFallback,
} from "@/lib/utils/participacao";

function cand(pct: number, id = 1): EdgeCandidate {
  return {
    id,
    nome: `C${id}`,
    partido: "P",
    cor: "var(--color-cand-1)",
    votos_atuais: 0,
    votos_projetados: 0,
    pct_atual: pct,
    pct_projetado: pct,
    pct_projetado_lower: pct,
    pct_projetado_upper: pct,
    p_vitoria: 0,
    rank: id,
    p_passa_2t: 0,
    p_fecha_1t: 0,
  };
}

describe("denominadorLabel / denominadorFrase", () => {
  it("(a) rotula votáveis como '% dos votos a votáveis' — nunca '% dos válidos'", () => {
    // `pvap` do TSE é % sobre votos a votáveis concorrentes (válidos +
    // anulados + sub judice) — docs/reference/tse-2026-leiautes.md.
    expect(denominadorLabel("votaveis")).toBe("% dos votos a votáveis");
    expect(denominadorLabel("votaveis")).not.toContain("válidos");
    expect(denominadorFrase("votaveis")).toBe("dos votos a votáveis");
  });

  it("(b) rotula comparecimento e eleitores das seções instaladas", () => {
    expect(denominadorLabel("comparecimento")).toBe("% do comparecimento");
    expect(denominadorLabel("eleitores_instalados")).toBe("% dos eleitores das seções instaladas");
    expect(denominadorFrase("eleitores_instalados")).toBe("dos eleitores das seções instaladas");
  });
});

describe("outrosFallback", () => {
  it("(c) devolve 100 − Σ(top 3 pct_projetado)", () => {
    const cands = [cand(43.2, 1), cand(38.0, 2), cand(4.5, 3), cand(3.0, 4), cand(2.0, 5)];
    expect(outrosFallback(cands)).toBeCloseTo(14.3, 5);
  });

  it("(d) clampa em [0, 100] quando a soma passa de 100 ou a lista é vazia", () => {
    expect(outrosFallback([cand(60, 1), cand(50, 2), cand(30, 3)])).toBe(0);
    expect(outrosFallback([])).toBe(100);
  });

  it("(e) ignora pct não-finito (payload degradado) em vez de propagar NaN", () => {
    const quebrado = [cand(40, 1), { ...cand(0, 2), pct_projetado: Number.NaN }, cand(5, 3)];
    expect(outrosFallback(quebrado)).toBeCloseTo(55, 5);
  });

  it("(f) aceita candidatos de UF (shape com ci95)", () => {
    const ufCands: EdgeUfCandidate[] = [
      {
        id: 1,
        nome: "A",
        partido: "PA",
        cor: "var(--color-cand-1)",
        votos_atuais: 0,
        votos_projetados: 0,
        pct_atual: 50,
        pct_projetado: 50,
        ci95: { lower: 48, upper: 52 },
      },
      {
        id: 2,
        nome: "B",
        partido: "PB",
        cor: "var(--color-cand-2)",
        votos_atuais: 0,
        votos_projetados: 0,
        pct_atual: 30,
        pct_projetado: 30,
        ci95: { lower: 28, upper: 32 },
      },
    ];
    expect(outrosFallback(ufCands)).toBeCloseTo(20, 5);
  });
});

describe("outrosCount", () => {
  it("(g) conta quantos candidatos ficam fora do top 3", () => {
    expect(outrosCount([cand(1, 1), cand(1, 2), cand(1, 3), cand(1, 4), cand(1, 5)])).toBe(2);
    expect(outrosCount([cand(1, 1), cand(1, 2)])).toBe(0);
  });
});
