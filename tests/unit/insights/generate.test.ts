/**
 * tests/unit/insights/generate.test.ts — RF-044.
 *
 * Engine determinística — mesma entrada → mesma saída, sem random.
 */

import { describe, expect, it } from "vitest";
import type { EdgeNational, EdgeUfRow } from "@/lib/edge-config/types";
import { generateInsights } from "@/lib/insights/generate";

const national: EdgeNational = {
  candidatos: [
    {
      id: 13,
      nome: "Lula",
      partido: "PT",
      cor: "var(--color-pt)",
      votos_atuais: 1,
      votos_projetados: 1,
      pct_atual: 53,
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
      pct_atual: 47,
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

const ufBig: EdgeUfRow = {
  sigla: "MG",
  pct_apurado: 28,
  lider: 13,
  margem_atual: 4.5,
  margem_projetada: 4,
  margem_projetada_ci: [1.8, 6.2],
  chamada: false,
  swing_vs_2022: 4.8,
  top_candidatos: [
    { id: 13, pct: 52 },
    { id: 22, pct: 48 },
  ],
  vai_a_2t: null,
  bucket: "indefinido",
};
const ufTossup: EdgeUfRow = {
  sigla: "SP",
  pct_apurado: 30,
  lider: 13,
  margem_atual: 1.5,
  margem_projetada: 1.2,
  margem_projetada_ci: [-1, 3.4],
  chamada: false,
  swing_vs_2022: 1.0,
  top_candidatos: [
    { id: 13, pct: 50.6 },
    { id: 22, pct: 49.4 },
  ],
  vai_a_2t: null,
  bucket: "indefinido",
};

describe("generateInsights()", () => {
  it("(a) determinístico — mesma entrada → mesma saída", () => {
    const out1 = generateInsights({
      national,
      por_uf: [ufBig, ufTossup],
      pct_apurado_total: 23,
    });
    const out2 = generateInsights({
      national,
      por_uf: [ufBig, ufTossup],
      pct_apurado_total: 23,
    });
    expect(out1).toEqual(out2);
  });

  it("(b) máximo 3 frases", () => {
    const out = generateInsights({
      national,
      por_uf: [ufBig, ufTossup],
      pct_apurado_total: 23,
    });
    expect(out.length).toBeLessThanOrEqual(3);
  });

  it("(c) diff < 1 → 'Disputa apertada'", () => {
    const tight: EdgeNational = {
      ...national,
      candidatos: [
        { ...national.candidatos[0]!, pct_projetado: 50.3 },
        { ...national.candidatos[1]!, pct_projetado: 49.7 },
      ],
    };
    const out = generateInsights({ national: tight, por_uf: [], pct_apurado_total: 10 });
    expect(out[0]).toContain("Disputa apertada");
  });

  it("(d) swing UF >= 4 → frase de movimento", () => {
    const out = generateInsights({ national, por_uf: [ufBig], pct_apurado_total: 23 });
    expect(out.some((l) => l.includes("MG"))).toBe(true);
    expect(out.some((l) => l.includes("2022"))).toBe(true);
  });

  it("(e) tossup com pct_apurado < 50 → frase 'decisiva'", () => {
    const out = generateInsights({ national, por_uf: [ufTossup], pct_apurado_total: 23 });
    expect(out.some((l) => l.includes("SP") && l.includes("decisiva"))).toBe(true);
  });

  it("(f) sem candidatos → array vazio", () => {
    const empty: EdgeNational = {
      candidatos: [],
      needle_position: 0,
      needle_band: "tossup",
      candidato_a_id: null,
      candidato_b_id: null,
      p_segundo_turno_overall: null,
      cenarios_2t: [],
    };
    const out = generateInsights({ national: empty, por_uf: [], pct_apurado_total: 0 });
    expect(out).toEqual([]);
  });
});
