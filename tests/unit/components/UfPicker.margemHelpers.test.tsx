/**
 * tests/unit/components/UfPicker.margemHelpers.test.tsx
 *
 * 2026-09-18 (3ª rodada) — unidade pura das funções novas de
 * `components/layout/UfPicker.tsx` que RF-104/RF-105/RF-106 (item e)
 * introduziram: `margemSegundaVaga`, `margemParaExibir`, `vagasPorCargo` e
 * `ariaRessalvaVagas`. Os testes de integração (`StateResultSheet.*`,
 * `_NationalChoroplethMapImpl.*`) já cobrem o EFEITO observável; este arquivo
 * cobre a FONTE única diretamente, sem o resto da árvore de componentes.
 */

import { describe, expect, it } from "vitest";

import {
  ariaRessalvaVagas,
  margemParaExibir,
  margemSegundaVaga,
  vagasPorCargo,
} from "@/components/layout/UfPicker";

describe("margemSegundaVaga() — RF-104: 2º menos o 3º, nunca 1º menos o 2º", () => {
  it("aceitação literal da spec: 1º=40, 2º=30, 3º=29 → 1", () => {
    // Mutação: trocar os índices `[1]`/`[2]` por `[0]`/`[1]` faz este teste
    // falhar mostrando 10, não 1.
    expect(
      margemSegundaVaga({
        top_candidatos: [{ pct: 40 }, { pct: 30 }, { pct: 29 }],
      }),
    ).toBeCloseTo(1);
  });

  it("menos de 3 candidatos no top-3 → NaN, nunca 0", () => {
    // Mutação: `?? 0` no lugar do `return Number.NaN` faz este teste falhar.
    expect(Number.isNaN(margemSegundaVaga({ top_candidatos: [{ pct: 60 }, { pct: 40 }] }))).toBe(
      true,
    );
    expect(Number.isNaN(margemSegundaVaga({ top_candidatos: [{ pct: 100 }] }))).toBe(true);
    expect(Number.isNaN(margemSegundaVaga({ top_candidatos: [] }))).toBe(true);
  });
});

describe("margemParaExibir() — RF-104: por cargo", () => {
  const ROW = { margem_projetada: 10, top_candidatos: [{ pct: 40 }, { pct: 30 }, { pct: 29 }] };

  it('cargo="sen" — usa `margemSegundaVaga` (1), não `margem_projetada` (10)', () => {
    // Mutação: trocar `cargo === "sen"` por `cargo !== "sen"` (ou remover a
    // checagem) faz este teste falhar.
    expect(margemParaExibir("sen", ROW)).toBeCloseTo(1);
  });

  it('cargo="pres" e "gov" — usam `margem_projetada` (10), sem mudança', () => {
    expect(margemParaExibir("pres", ROW)).toBe(10);
    expect(margemParaExibir("gov", ROW)).toBe(10);
  });
});

describe("vagasPorCargo() — RF-105: lido da tabela canônica, não um literal solto", () => {
  it('cargo="sen" — 2 vagas', () => {
    expect(vagasPorCargo("sen")).toBe(2);
  });

  it('cargo="pres" e "gov" — 1 vaga', () => {
    expect(vagasPorCargo("pres")).toBe(1);
    expect(vagasPorCargo("gov")).toBe(1);
  });
});

describe("ariaRessalvaVagas() — RF-106/RNF-025: Record total, vazio fora de Senado", () => {
  it('cargo="sen" — string não vazia, contém "vaga"', () => {
    // Mutação: `sen: ""` no `Record` faz este teste falhar.
    expect(ariaRessalvaVagas("sen")).not.toBe("");
    expect(ariaRessalvaVagas("sen")).toMatch(/vaga/i);
  });

  it('cargo="pres" e "gov" — string vazia (byte a byte igual a antes desta mudança)', () => {
    expect(ariaRessalvaVagas("pres")).toBe("");
    expect(ariaRessalvaVagas("gov")).toBe("");
  });
});
