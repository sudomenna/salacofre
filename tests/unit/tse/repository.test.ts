// T18 — Unit tests do repository (T06/T07) com Neon real.
//
// Cobre RF-004 (append-only) e constituição § 10 (snapshots imutáveis).
//
// Estratégia de isolamento: rows sintéticos com uf='ZT' (zone test) e
// codZona aleatório por run; cleanup em beforeAll (não no body do teste —
// o body nunca DELETE/UPDATE pra não confundir o leitor sobre a regra
// append-only). Cleanup em test harness não viola constituição § 10.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { EA20 } from "@/lib/tse/ea20-schema";
import { EA20Schema } from "@/lib/tse/ea20-schema";
import { getLastEtagAndHash, insertSnapshot } from "@/lib/tse/repository";
import type { Target } from "@/lib/tse/targets";

const TEST_UF = "ZT"; // sentinel — não corresponde a nenhuma UF real
const TEST_COD_ZONA = 99001; // sentinel alto pra não colidir com zonas reais
const TEST_COD_MUNICIPIO_TSE = 99999;
const TEST_CARGO = 1;
const TEST_TURNO = 9; // turno sintético — produção usa 1|2

const FIXTURES_DIR = resolve(process.cwd(), "tests/fixtures/tse/2022");

function loadFixture(name: string): EA20 {
  const raw = readFileSync(resolve(FIXTURES_DIR, name), "utf8");
  return EA20Schema.parse(JSON.parse(raw));
}

const target: Target = {
  uf: TEST_UF,
  cargo: TEST_CARGO,
  nivel: "zona",
  codMunicipioTse: TEST_COD_MUNICIPIO_TSE,
  codZona: TEST_COD_ZONA,
  url: "https://test.invalid/sentinel.json",
  codEleicao: "ele2026/test",
};

async function cleanupTestSnapshots(): Promise<void> {
  // Test harness only — production code (lib/tse/*) jamais DELETE em snapshots.
  await db.execute(sql`
    DELETE FROM snapshots
    WHERE uf = ${TEST_UF} AND cod_zona = ${TEST_COD_ZONA}
  `);
}

describe("repository — RF-004 append-only (constituição § 10)", () => {
  beforeAll(async () => {
    await cleanupTestSnapshots();
  });

  afterAll(async () => {
    await cleanupTestSnapshots();
  });

  it("getLastEtagAndHash retorna null/null quando não há linhas", async () => {
    const result = await getLastEtagAndHash({ target, turno: TEST_TURNO });
    expect(result.etag).toBeNull();
    expect(result.hash).toBeNull();
  });

  it("insertSnapshot insere e retorna id; getLastEtagAndHash reflete", async () => {
    const payload = loadFixture("presidente-sp-z0001.json");
    const id = await insertSnapshot({
      target,
      turno: TEST_TURNO,
      etag: '"abc-1"',
      hash: "a".repeat(64),
      payload,
      pctApurado: 75,
      votosTotal: 280,
    });
    expect(id).not.toBeNull();
    expect(typeof id).toBe("bigint");

    const result = await getLastEtagAndHash({ target, turno: TEST_TURNO });
    expect(result.etag).toBe('"abc-1"');
    expect(result.hash).toBe("a".repeat(64));
  });

  it("dedup secundário: insert com mesmo hash → skip (retorna null), sem nova linha", async () => {
    const payload = loadFixture("presidente-sp-z0001.json");
    const sameHash = "a".repeat(64);

    const beforeCount = await db.execute<{ n: number }>(sql`
      SELECT COUNT(*)::int AS n FROM snapshots
      WHERE uf = ${TEST_UF} AND cod_zona = ${TEST_COD_ZONA}
    `);
    const before = beforeCount.rows[0]?.n ?? 0;

    const id = await insertSnapshot({
      target,
      turno: TEST_TURNO,
      etag: '"abc-1"',
      hash: sameHash,
      payload,
      pctApurado: 75,
      votosTotal: 280,
    });
    expect(id).toBeNull(); // skip explícito

    const afterCount = await db.execute<{ n: number }>(sql`
      SELECT COUNT(*)::int AS n FROM snapshots
      WHERE uf = ${TEST_UF} AND cod_zona = ${TEST_COD_ZONA}
    `);
    expect(afterCount.rows[0]?.n ?? 0).toBe(before);
  });

  it("hash diferente: N+1 linhas; primeira linha mantém payload original (append-only)", async () => {
    const payload2 = loadFixture("presidente-sp-z0002.json");

    const beforeRows = await db.execute<{
      id: string;
      hash_payload: string;
      pct_apurado: string;
    }>(sql`
      SELECT id::text, hash_payload, pct_apurado::text
      FROM snapshots
      WHERE uf = ${TEST_UF} AND cod_zona = ${TEST_COD_ZONA}
      ORDER BY ts ASC
    `);
    const beforeCount = beforeRows.rows.length;
    const firstRowBefore = beforeRows.rows[0]; // identifica a "primeira" linha

    const id = await insertSnapshot({
      target,
      turno: TEST_TURNO,
      etag: '"abc-2"',
      hash: "b".repeat(64),
      payload: payload2,
      pctApurado: 100,
      votosTotal: 160,
    });
    expect(id).not.toBeNull();

    const afterRows = await db.execute<{
      id: string;
      hash_payload: string;
      pct_apurado: string;
    }>(sql`
      SELECT id::text, hash_payload, pct_apurado::text
      FROM snapshots
      WHERE uf = ${TEST_UF} AND cod_zona = ${TEST_COD_ZONA}
      ORDER BY ts ASC
    `);

    // N+1 linhas
    expect(afterRows.rows.length).toBe(beforeCount + 1);

    // Primeira linha não foi alterada (append-only — constituição § 10)
    if (firstRowBefore) {
      const firstRowAfter = afterRows.rows[0];
      expect(firstRowAfter?.id).toBe(firstRowBefore.id);
      expect(firstRowAfter?.hash_payload).toBe(firstRowBefore.hash_payload);
      expect(firstRowAfter?.pct_apurado).toBe(firstRowBefore.pct_apurado);
    }
  });

  it("getLastEtagAndHash devolve a linha mais recente após múltiplos inserts", async () => {
    const result = await getLastEtagAndHash({ target, turno: TEST_TURNO });
    expect(result.etag).toBe('"abc-2"');
    expect(result.hash).toBe("b".repeat(64));
  });
});
