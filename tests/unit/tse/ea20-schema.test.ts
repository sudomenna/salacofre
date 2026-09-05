// T16 — Unit tests do EA20Schema (T01) contra fixtures TSE 2022→2026.
//
// Cobre RF-001 (validação fail-fast pré-aceite). Fixtures vivem em
// tests/fixtures/tse/2022/ — mocks mínimos derivados do schema.
//
// 2026-09-05 — REESCRITA (hardening pré-simulado, 9 PDFs oficiais TSE):
// as fixtures nesta pasta eram sintéticas desde sempre (nunca capturadas do
// CDN real — "TSE 2022" no path é só um rótulo herdado, não uma cópia real
// de 2022) e assumiam um shape `abr[]` que o documento oficial do EA20
// (2026-07-10, tse_docs/txt/tse-ea20-arquivo-de-resultado-unificado.txt)
// NÃO confirma — o real é um único abrangência por arquivo, com `s`/`e`/`v`
// de raiz e candidatos em `carg[].agr[].par[].cand[]`. As fixtures foram
// migradas para o shape real; ver docs/reference/tse-2026-leiautes.md.

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
  it("parseia fixture zona 0001 sem erros", () => {
    const fx = loadFixture("presidente-sp-z0001.json");
    const parsed = EA20Schema.parse(fx);
    expect(parsed.tpabr).toBe("zona");
    expect(parsed.cdabr).toBe("0001");
    expect(parsed.carg).toHaveLength(1);
    expect(parsed.carg?.[0]?.agr).toHaveLength(2);
    expect(parsed.s.psa).toBe("75,00");
    expect(parsed.e.c).toBe("280");
  });

  it("parseia fixture zona 0002 (mesmo schema, valores diferentes — 100% apurado)", () => {
    const fx = loadFixture("presidente-sp-z0002.json");
    const parsed = EA20Schema.parse(fx);
    expect(parsed.cdabr).toBe("0002");
    expect(parsed.s.psa).toBe("100,00");
  });

  it("parseia fixture RJ (outra zona, mesmo schema)", () => {
    const fx = loadFixture("presidente-rj-z0001.json");
    const parsed = EA20Schema.parse(fx);
    expect(parsed.tpabr).toBe("zona");
    expect(parsed.e.te).toBe("400");
    expect(parsed.v.tv).toBe("220");
  });

  it("falha fail-fast quando `s` (seções) está ausente", () => {
    const fx = loadFixture("presidente-sp-z0001.json") as Record<string, unknown>;
    delete fx.s;
    expect(() => EA20Schema.parse(fx)).toThrow(ZodError);
  });

  it("falha fail-fast quando `e` (eleitores) está ausente", () => {
    const fx = loadFixture("presidente-sp-z0001.json") as Record<string, unknown>;
    delete fx.e;
    expect(() => EA20Schema.parse(fx)).toThrow(ZodError);
  });

  it("NÃO falha quando `carg` está ausente (consulta popular usa `perg` no lugar)", () => {
    const fx = loadFixture("presidente-sp-z0001.json") as Record<string, unknown>;
    delete fx.carg;
    expect(() => EA20Schema.parse(fx)).not.toThrow();
  });

  it("aceita `f: 's'` (ambiente de simulado TSE)", () => {
    const fx = loadFixture("presidente-sp-z0001.json") as Record<string, unknown>;
    fx.f = "s";
    expect(() => EA20Schema.parse(fx)).not.toThrow();
    expect(EA20Schema.parse(fx).f).toBe("s");
  });

  it("falha fail-fast quando `f` é string vazia", () => {
    const fx = loadFixture("presidente-sp-z0001.json") as Record<string, unknown>;
    fx.f = "";
    expect(() => EA20Schema.parse(fx)).toThrow(ZodError);
  });

  it("aceita e preserva campo desconhecido no envelope (.passthrough no top)", () => {
    const fx = loadFixture("presidente-sp-z0001.json") as Record<string, unknown>;
    fx.campoNovoInesperado = "drift do TSE";
    const parsed = EA20Schema.parse(fx) as Record<string, unknown>;
    expect(parsed.campoNovoInesperado).toBe("drift do TSE");
  });

  it("aceita e preserva campo desconhecido dentro de `s`/`e`/`v` (.passthrough aninhado)", () => {
    const fx = loadFixture("presidente-sp-z0001.json") as {
      s: Record<string, unknown>;
    };
    fx.s.campoNovoDentroDeS = "drift aninhado";
    const parsed = EA20Schema.parse(fx) as { s: Record<string, unknown> };
    expect(parsed.s.campoNovoDentroDeS).toBe("drift aninhado");
  });

  it("dg segue o formato oficial dd/mm/aaaa (2026-07-10)", () => {
    const fx = loadFixture("presidente-sp-z0001.json");
    const parsed = EA20Schema.parse(fx);
    expect(parsed.dg).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
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
