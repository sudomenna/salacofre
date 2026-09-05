/**
 * tests/unit/tse/ea20-fixtures-2026.test.ts
 *
 * Valida os 3 níveis de arquivo EA20 (br/uf/zona) em
 * tests/fixtures/tse/2026/ contra o EA20Schema real (dicionário oficial
 * 2026-07-10). Fixtures derivadas manualmente das placeholders `{tipo}` do
 * documento — o TSE não publica um exemplo de JSON completo, só o dicionário
 * de campos. Ver header de cada fixture e docs/reference/tse-2026-leiautes.md.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EA20Schema, parseEA20Numeric } from "@/lib/tse/ea20-schema";

const FIXTURES_DIR = resolve(process.cwd(), "tests/fixtures/tse/2026");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(FIXTURES_DIR, name), "utf8"));
}

describe("EA20Schema — fixtures 2026 por nível de abrangência", () => {
  it("nível zona (zona-presidente-sp-z0001.json)", () => {
    const parsed = EA20Schema.parse(loadFixture("zona-presidente-sp-z0001.json"));
    expect(parsed.tpabr).toBe("zona");
    expect(parsed.cdabr).toBe("0001");
    expect(parseEA20Numeric(parsed.s.psa)).toBe(75);
    expect(parseEA20Numeric(parsed.e.c)).toBe(280);
  });

  it("nível uf (uf-presidente-sp.json)", () => {
    const parsed = EA20Schema.parse(loadFixture("uf-presidente-sp.json"));
    expect(parsed.tpabr).toBe("uf");
    expect(parsed.cdabr).toBe("SP");
    expect(parsed.carg?.[0]?.agr).toHaveLength(2);
  });

  it("nível br (br-presidente.json)", () => {
    const parsed = EA20Schema.parse(loadFixture("br-presidente.json"));
    expect(parsed.tpabr).toBe("br");
    expect(parsed.cdabr).toBe("br");
    expect(parsed.carg?.[0]?.cd).toBe("1"); // só Presidente tem arquivo BR
  });
});
