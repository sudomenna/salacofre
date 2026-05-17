// T16 — Unit tests do EA20Schema (T01) contra fixtures TSE 2022.
//
// Cobre RF-001 (validação fail-fast pré-aceite). Fixtures vivem em
// tests/fixtures/tse/2022/ — mocks mínimos derivados do schema enquanto
// fixtures TSE 2022 reais não estão disponíveis no CDN (URLs antigas
// retornam 404 desde fim do ciclo eleitoral). A chore S03 pode substituir
// por fixtures reais sem mudar este teste se o shape continuar válido.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { EA20Schema, parseEA20Numeric } from "@/lib/tse/ea20-schema";

const FIXTURES_DIR = resolve(process.cwd(), "tests/fixtures/tse/2022");

function loadFixture(name: string): unknown {
  const raw = readFileSync(resolve(FIXTURES_DIR, name), "utf8");
  return JSON.parse(raw);
}

describe("EA20Schema", () => {
  it("parseia fixture SP zona 1 sem erros", () => {
    const fx = loadFixture("presidente-sp-z0001.json");
    const parsed = EA20Schema.parse(fx);
    expect(parsed.cdabr).toBe("SP");
    expect(parsed.abr).toHaveLength(1);
    expect(parsed.abr[0]?.cdze).toBe("0001");
    expect(parsed.abr[0]?.cand).toHaveLength(2);
  });

  it("parseia fixture SP zona 2 (mesmo schema, valores diferentes)", () => {
    const fx = loadFixture("presidente-sp-z0002.json");
    const parsed = EA20Schema.parse(fx);
    expect(parsed.abr[0]?.cdze).toBe("0002");
    expect(parsed.abr[0]?.psa).toBe("100,00");
  });

  it("parseia fixture RJ (UF diferente)", () => {
    const fx = loadFixture("presidente-rj-z0001.json");
    const parsed = EA20Schema.parse(fx);
    expect(parsed.cdabr).toBe("RJ");
    expect(parsed.abr[0]?.cd).toBe("RJ");
  });

  it("falha fail-fast quando `cand` está ausente", () => {
    const fx = loadFixture("presidente-sp-z0001.json") as {
      abr: Array<Record<string, unknown>>;
    };
    delete fx.abr[0]?.cand;
    expect(() => EA20Schema.parse(fx)).toThrow(ZodError);
  });

  it("falha fail-fast quando campo `f` não é literal 'o'", () => {
    const fx = loadFixture("presidente-sp-z0001.json") as Record<string, unknown>;
    fx.f = "x";
    expect(() => EA20Schema.parse(fx)).toThrow(ZodError);
  });

  it("falha fail-fast quando envelope ganha campo desconhecido (.strict no top)", () => {
    const fx = loadFixture("presidente-sp-z0001.json") as Record<string, unknown>;
    fx.campoNovoInesperado = "drift do TSE";
    expect(() => EA20Schema.parse(fx)).toThrow(ZodError);
  });
});

describe("parseEA20Numeric", () => {
  it("converte vírgula decimal BR para number", () => {
    expect(parseEA20Numeric("100,00")).toBe(100);
    expect(parseEA20Numeric("75,50")).toBe(75.5);
    expect(parseEA20Numeric("0")).toBe(0);
  });

  it("converte ponto-de-milhar + vírgula decimal", () => {
    expect(parseEA20Numeric("1.234,56")).toBeCloseTo(1234.56);
    expect(parseEA20Numeric("12.345.678,90")).toBeCloseTo(12345678.9);
  });

  it("throw em string vazia (nunca silent NaN)", () => {
    expect(() => parseEA20Numeric("")).toThrow();
  });

  it("throw em string não-numérica", () => {
    expect(() => parseEA20Numeric("abc")).toThrow();
    expect(() => parseEA20Numeric("12,34,56")).toThrow();
  });
});
