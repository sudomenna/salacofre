/**
 * tests/unit/model/repository.test.ts
 *
 * T05 — Unit tests do `lib/model/repository.ts` contra Neon real.
 *
 * Cobre: RF-019, RF-020 (persistência append-only do modelo), RF-012
 * (eleitorado como peso da média ponderada). Constituição § 10 — production
 * code não tem UPDATE/DELETE; o cleanup neste arquivo é **test harness only**.
 *
 * Sentinels:
 *   - uf='ZT' (sentinel comum dos testes — vide T18/T19 que usam o mesmo)
 *   - codZona na faixa 99020-99030 — separado dos T18 (99001) e T19
 *     (99010-12) para evitar colisão de runs paralelos / cleanup cruzado.
 *
 * Skip graceful: se `DATABASE_URL` ausente, todo o describe é pulado
 * com mensagem clara. O CI tem DATABASE_URL setado; o dev local pode
 * não ter (pull request review etc).
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { NewProjection } from "@/lib/db/schema";
import {
  getEleitoradoByZone,
  getHistoricalResults2022,
  getLatestSnapshotsByZone,
  insertProjection,
  insertProjectionsBatch,
} from "@/lib/model/repository";

const TEST_UF = "ZT";
// Faixa exclusiva deste arquivo (T05). NÃO sobrepor com T18 (99001), T19 (99010-12).
const ZONA_A = 99020;
const ZONA_B = 99021;
const ZONA_C = 99022;
const ZONA_D = 99023; // só para snapshot 0% apurado / sem hist
const ZONA_E = 99024; // zona em 3 municípios (soma dos pares, migration 0006)
const TEST_CARGO = 1; // sentinel — Presidente
const TEST_TURNO = 9; // sentinel sintético (produção usa 1|2)
const TEST_ANO = 2022; // reuso do ano "histórico" para teste de eleitorado
const TEST_CAND_A = 99777;
const TEST_CAND_B = 99778;

const hasDb = !!process.env.DATABASE_URL;

// ---------------------------------------------------------------------------
// Cleanup helpers — test harness only.
// Production code (lib/model/repository.ts) tem ZERO DELETE/UPDATE.
// ---------------------------------------------------------------------------

async function cleanupAll(): Promise<void> {
  await db.execute(sql`
    DELETE FROM projections
    WHERE cargo = ${TEST_CARGO} AND turno = ${TEST_TURNO}
  `);
  await db.execute(sql`
    DELETE FROM snapshots
    WHERE uf = ${TEST_UF} AND cod_zona >= ${ZONA_A} AND cod_zona <= ${ZONA_D}
  `);
  await db.execute(sql`
    DELETE FROM historical_results
    WHERE uf = ${TEST_UF} AND cod_zona >= ${ZONA_A} AND cod_zona <= ${ZONA_D}
  `);
  await db.execute(sql`
    DELETE FROM eleitorado
    WHERE uf = ${TEST_UF} AND cod_zona >= ${ZONA_A} AND cod_zona <= ${ZONA_E}
  `);
}

// ---------------------------------------------------------------------------
// Seed helpers — escrevem dados sintéticos via SQL bruto (não pelo repository,
// que poderia mascarar bug bidirecional). `eleitorado` e `historical_results`
// não têm helpers públicos no repo de produção — usamos sql bruto direto.
// ---------------------------------------------------------------------------

async function seedSnapshot(
  uf: string,
  codZona: number,
  pctApurado: number,
  hashSuffix: string,
  payloadTag: string,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO snapshots (cargo, turno, uf, cod_zona, etag, pct_apurado, votos_total, payload, hash_payload)
    VALUES (
      ${TEST_CARGO}, ${TEST_TURNO}, ${uf}, ${codZona},
      ${`"${hashSuffix}"`}, ${pctApurado.toString()}, 100,
      ${sql.raw(`'${JSON.stringify({ tag: payloadTag })}'::jsonb`)},
      ${hashSuffix.padEnd(64, "0")}
    )
  `);
}

async function seedHistorical(
  uf: string,
  codZona: number,
  codCandidato: number,
  pctValidos: number,
  ano: number = 2022,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO historical_results
      (ano, turno, cargo, uf, cod_municipio_tse, cod_zona, cod_candidato, nome_candidato, partido, votos, pct_validos)
    VALUES (
      ${ano}, ${TEST_TURNO}, ${TEST_CARGO}, ${uf}, 99999, ${codZona},
      ${codCandidato}, 'TEST', 'TT', 100, ${pctValidos.toString()}
    )
  `);
}

async function seedEleitorado(
  uf: string,
  codZona: number,
  eleitoresAptos: number,
  ano: number = TEST_ANO,
  codMunicipioTse = 99999,
): Promise<void> {
  // 99999 é um cod_municipio_tse sentinela (não existe em `municipios`;
  // `eleitorado` não tem FK). Desde a migration 0006 a PK é
  // (ano, uf, cod_municipio_tse, cod_zona): com um município fixo, cada zona
  // segue tendo exatamente uma linha aqui, que é o que a maioria destes casos
  // assume. `codMunicipioTse` permite seedar dois PARES da mesma zona — ver
  // "soma os pares (município × zona)" mais abaixo.
  await db.execute(sql`
    INSERT INTO eleitorado (ano, uf, cod_municipio_tse, cod_zona, eleitores_aptos)
    VALUES (${ano}, ${uf}, ${codMunicipioTse}, ${codZona}, ${eleitoresAptos})
  `);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("lib/model/repository — RF-019 / RF-020 / RF-012", () => {
  beforeAll(async () => {
    await cleanupAll();
  });

  afterAll(async () => {
    await cleanupAll();
  });

  // --- (a) insertProjection single ---------------------------------------

  it("insertProjection: insere e retorna bigint id", async () => {
    const row: NewProjection = {
      cargo: TEST_CARGO,
      turno: TEST_TURNO,
      uf: TEST_UF,
      candidatoId: TEST_CAND_A,
      votosProjetados: 12345n,
      pctProjetado: "0.55300",
      pctProjetadoLower: "0.52000",
      pctProjetadoUpper: "0.58000",
      pVitoria: "0.9200",
      pctApurado: "75.50",
    };

    const id = await insertProjection(row);
    expect(typeof id).toBe("bigint");
    expect(id).toBeGreaterThan(0n);

    // Confirma presença via raw query (não usa o próprio repo no readback).
    const verify = await db.execute<{ n: number }>(sql`
      SELECT COUNT(*)::int AS n FROM projections
      WHERE cargo = ${TEST_CARGO} AND turno = ${TEST_TURNO} AND uf = ${TEST_UF}
    `);
    expect(verify.rows[0]?.n).toBe(1);
  });

  // --- (b) insertProjectionsBatch — append-only, gera linhas em re-run ----

  it("insertProjectionsBatch: bulk insere N linhas e count retornado bate", async () => {
    const batch: NewProjection[] = [
      {
        cargo: TEST_CARGO,
        turno: TEST_TURNO,
        uf: null, // nacional
        candidatoId: TEST_CAND_A,
        pctProjetado: "0.55000",
      },
      {
        cargo: TEST_CARGO,
        turno: TEST_TURNO,
        uf: "SP",
        candidatoId: TEST_CAND_A,
        pctProjetado: "0.57000",
      },
      {
        cargo: TEST_CARGO,
        turno: TEST_TURNO,
        uf: "RJ",
        candidatoId: TEST_CAND_A,
        pctProjetado: "0.51000",
      },
    ];

    const beforeRows = await db.execute<{ n: number }>(sql`
      SELECT COUNT(*)::int AS n FROM projections
      WHERE cargo = ${TEST_CARGO} AND turno = ${TEST_TURNO}
    `);
    const before = beforeRows.rows[0]?.n ?? 0;

    const inserted1 = await insertProjectionsBatch(batch);
    expect(inserted1).toBe(3);

    // Re-run com mesmo batch (sem ON CONFLICT, sem UPSERT): gera +3 linhas.
    // Pequena pausa para garantir `ts` diferente.
    await new Promise((r) => setTimeout(r, 20));
    const inserted2 = await insertProjectionsBatch(batch);
    expect(inserted2).toBe(3);

    const afterRows = await db.execute<{ n: number }>(sql`
      SELECT COUNT(*)::int AS n FROM projections
      WHERE cargo = ${TEST_CARGO} AND turno = ${TEST_TURNO}
    `);
    expect(afterRows.rows[0]?.n ?? 0).toBe(before + 6); // dobrou — append-only confirmado
  });

  it("insertProjectionsBatch: array vazio é no-op e retorna 0", async () => {
    const n = await insertProjectionsBatch([]);
    expect(n).toBe(0);
  });

  // --- (c) getLatestSnapshotsByZone — ROW_NUMBER por zona ----------------

  it("getLatestSnapshotsByZone: retorna 1 linha por zona mesmo com N snapshots da mesma zona", async () => {
    // ZONA_A: 3 snapshots (apenas o mais recente deve aparecer).
    await seedSnapshot(TEST_UF, ZONA_A, 10.0, "aaa1", "v1");
    await new Promise((r) => setTimeout(r, 15));
    await seedSnapshot(TEST_UF, ZONA_A, 50.0, "aaa2", "v2");
    await new Promise((r) => setTimeout(r, 15));
    await seedSnapshot(TEST_UF, ZONA_A, 99.5, "aaa3", "v3");

    // ZONA_B: 1 snapshot só.
    await seedSnapshot(TEST_UF, ZONA_B, 42.0, "bbb1", "vB");

    // ZONA_C: 2 snapshots.
    await seedSnapshot(TEST_UF, ZONA_C, 5.0, "ccc1", "vC1");
    await new Promise((r) => setTimeout(r, 15));
    await seedSnapshot(TEST_UF, ZONA_C, 88.0, "ccc2", "vC2");

    const rows = await getLatestSnapshotsByZone(TEST_CARGO, TEST_TURNO);
    const testRows = rows.filter((r) => r.uf === TEST_UF);

    // 3 zonas únicas, mesmo com 6 snapshots no total.
    expect(testRows).toHaveLength(3);

    const byZone = new Map(testRows.map((r) => [r.codZona, r]));
    // Cada zona retornou o snapshot MAIS RECENTE (maior pctApurado seedado por último).
    expect(byZone.get(ZONA_A)?.pctApurado).toBeCloseTo(99.5, 1);
    expect(byZone.get(ZONA_B)?.pctApurado).toBeCloseTo(42.0, 1);
    expect(byZone.get(ZONA_C)?.pctApurado).toBeCloseTo(88.0, 1);

    // Sanity: payload é JSON e refletindo a versão mais recente.
    const payloadA = byZone.get(ZONA_A)?.payload as { tag: string };
    expect(payloadA.tag).toBe("v3");
  });

  // --- (d) getHistoricalResults2022 — filtra ano=2022 corretamente -------

  it("getHistoricalResults2022: retorna apenas ano=2022 e respeita cargo/turno", async () => {
    // Seed 2022 (deve aparecer).
    await seedHistorical(TEST_UF, ZONA_A, TEST_CAND_A, 0.55, 2022);
    await seedHistorical(TEST_UF, ZONA_B, TEST_CAND_A, 0.4, 2022);
    await seedHistorical(TEST_UF, ZONA_A, TEST_CAND_B, 0.45, 2022);

    // Seed 2018 (deve ser ignorado pelo filtro).
    await seedHistorical(TEST_UF, ZONA_A, TEST_CAND_A, 0.6, 2018);
    await seedHistorical(TEST_UF, ZONA_B, TEST_CAND_A, 0.5, 2018);

    const rows = await getHistoricalResults2022(TEST_CARGO, TEST_TURNO);
    const testRows = rows.filter((r) => r.uf === TEST_UF);

    expect(testRows).toHaveLength(3); // 2018 não entra
    const pcts = testRows.map((r) => r.pctValidos ?? -1).sort((a, b) => a - b);
    expect(pcts).toEqual([0.4, 0.45, 0.55]);

    // Type sanity: pctValidos veio como number (driver devolve string,
    // o repo parsea — RF-012 consome direto).
    for (const r of testRows) {
      expect(typeof r.pctValidos === "number" || r.pctValidos === null).toBe(true);
    }
  });

  // --- (e) getEleitoradoByZone — Map com chave "uf:codZona" --------------

  it('getEleitoradoByZone: retorna Map com chave "{uf}:{codZona}" e valor int', async () => {
    await seedEleitorado(TEST_UF, ZONA_A, 50_000, TEST_ANO);
    await seedEleitorado(TEST_UF, ZONA_B, 100_000, TEST_ANO);
    await seedEleitorado(TEST_UF, ZONA_C, 25_000, TEST_ANO);

    // Outro ano (não deve entrar).
    await seedEleitorado(TEST_UF, ZONA_D, 999_999, 1900);

    const m = await getEleitoradoByZone(TEST_ANO);

    expect(m.get(`${TEST_UF}:${ZONA_A}`)).toBe(50_000);
    expect(m.get(`${TEST_UF}:${ZONA_B}`)).toBe(100_000);
    expect(m.get(`${TEST_UF}:${ZONA_C}`)).toBe(25_000);

    // ano 1900 não retornado pelo filtro do repo.
    expect(m.has(`${TEST_UF}:${ZONA_D}`)).toBe(false);

    // Tipos: chaves são string concatenada, valores são number int.
    for (const [k, v] of m.entries()) {
      expect(typeof k).toBe("string");
      expect(typeof v).toBe("number");
    }
  });

  it("getEleitoradoByZone: soma os pares (município × zona) da mesma zona", async () => {
    // Desde a migration 0006 a PK de `eleitorado` é o par, e 62,5% das zonas
    // cobrem 2+ municípios. Sem `sum()`/`groupBy` no repo, o `m.set()` ficava
    // com a ÚLTIMA fatia (aqui: 7.000) em vez do total (137.000) — em silêncio,
    // e o peso da zona no modelo saía fragmentário.
    await seedEleitorado(TEST_UF, ZONA_E, 100_000, TEST_ANO, 90001);
    await seedEleitorado(TEST_UF, ZONA_E, 30_000, TEST_ANO, 90002);
    await seedEleitorado(TEST_UF, ZONA_E, 7_000, TEST_ANO, 90003);

    const m = await getEleitoradoByZone(TEST_ANO);

    expect(m.get(`${TEST_UF}:${ZONA_E}`)).toBe(137_000);
  });
});
