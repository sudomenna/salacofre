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

  it("(d) comparação vs. 2022 >= 4pp → frase de movimento", () => {
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

  // --- S05/F3B: regras 1T multi-candidato (M1..M3) -----------------------

  it("(g) M1: P(2T) >= 0.6 → 'Disputa caminha para 2º turno (X%)'", () => {
    const high2T: EdgeNational = { ...national, p_segundo_turno_overall: 0.75 };
    const out = generateInsights({ national: high2T, por_uf: [], pct_apurado_total: 10 });
    expect(out.some((l) => l.includes("Disputa caminha para 2º turno"))).toBe(true);
    expect(out.some((l) => l.includes("75%"))).toBe(true);
  });

  it("(h) M2: líder com p_fecha_1t >= 0.7 → 'X pode encerrar no 1º turno'", () => {
    const willClose: EdgeNational = {
      ...national,
      candidatos: [
        { ...national.candidatos[0]!, p_fecha_1t: 0.85 },
        { ...national.candidatos[1]!, p_fecha_1t: 0.0 },
      ],
      p_segundo_turno_overall: 0.15,
    };
    const out = generateInsights({ national: willClose, por_uf: [], pct_apurado_total: 10 });
    expect(out.some((l) => l.includes("Lula") && l.includes("encerrar no 1º turno"))).toBe(true);
    expect(out.some((l) => l.includes("85%"))).toBe(true);
  });

  it("(i) M3: rank 3 com p_passa_2t >= 0.3 → 'Z briga pela vaga no 2º turno'", () => {
    const com3: EdgeNational = {
      ...national,
      candidatos: [
        ...national.candidatos,
        {
          id: 25,
          nome: "Terceiro",
          partido: "MDB",
          cor: "var(--color-cand-3)",
          votos_atuais: 1,
          votos_projetados: 1,
          pct_atual: 8,
          pct_projetado: 8.5,
          pct_projetado_lower: 6,
          pct_projetado_upper: 11,
          p_vitoria: 0.05,
          rank: 3,
          p_passa_2t: 0.42,
          p_fecha_1t: 0.0,
        },
      ],
    };
    const out = generateInsights({ national: com3, por_uf: [], pct_apurado_total: 10 });
    expect(out.some((l) => l.includes("Terceiro") && l.includes("briga pela vaga"))).toBe(true);
    expect(out.some((l) => l.includes("42%"))).toBe(true);
  });

  // --- S07/Fase 5: `swing_vs_2022` é comparação descritiva e aceita `null` ---
  // ADR-0021 tirou 2022 do cálculo. O campo sai `null` (nunca 0.0) quando não
  // há número de 2022 para comparar — `0.0` afirmaria que a UF não mudou.

  it("(j) swing_vs_2022 null não quebra e não gera frase de movimento", () => {
    const semComparacao: EdgeUfRow = { ...ufBig, swing_vs_2022: null };
    const out = generateInsights({
      national,
      por_uf: [semComparacao],
      pct_apurado_total: 23,
    });
    expect(() =>
      generateInsights({ national, por_uf: [semComparacao], pct_apurado_total: 23 }),
    ).not.toThrow();
    expect(out.some((l) => l.includes("Movimento expressivo"))).toBe(false);
    expect(out.some((l) => l.includes("em relação a 2022"))).toBe(false);
  });

  it("(k) UF com comparação vence UF sem comparação no ranking", () => {
    // A UF sem número de 2022 não pode "ganhar" o ranking por ausência: ela
    // sai da lista, e a UF que tem comparação real gera a frase.
    const semComparacao: EdgeUfRow = { ...ufTossup, sigla: "AC", swing_vs_2022: null };
    const out = generateInsights({
      national,
      por_uf: [semComparacao, ufBig],
      pct_apurado_total: 23,
    });
    expect(out.some((l) => l.includes("Movimento expressivo em MG"))).toBe(true);
    expect(out.some((l) => l.includes("Movimento expressivo em AC"))).toBe(false);
  });

  it("(l) todas as UFs sem comparação → nenhuma frase de 2022, resto intacto", () => {
    const out = generateInsights({
      national,
      por_uf: [
        { ...ufBig, swing_vs_2022: null },
        { ...ufTossup, swing_vs_2022: null },
      ],
      pct_apurado_total: 23,
    });
    expect(out.some((l) => l.includes("2022"))).toBe(false);
    // a regra 3 (tossup) continua funcionando
    expect(out.some((l) => l.includes("SP") && l.includes("decisiva"))).toBe(true);
  });
});
