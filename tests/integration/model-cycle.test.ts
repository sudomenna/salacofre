/**
 * tests/integration/model-cycle.test.ts
 *
 * T18 — Integration test: ciclo do modelo end-to-end contra Neon real.
 *
 * Cobre: RF-011..RF-016, RF-019, RF-020.
 *
 * Cenário:
 *   1. Seed `historical_results 2022` — 10 zonas sintéticas (5 em "SP-mock",
 *      5 em "RJ-mock") × 2 candidatos (cod 1001 / 1002), pct_validos com soma=1
 *      por zona (gerados com NumPy seed determinístico).
 *   2. Seed `eleitorado 2026` — mesmas 10 zonas, eleitores aptos ~100k–500k.
 *   3. Seed `snapshots` — 1 batch parcial: 5 zonas apuradas (3 SP-mock + 2 RJ-mock),
 *      pct_apurado=50, votos consistentes com pct_validos_2022 + ruído pequeno.
 *   4. Invoca `api.model.project._do_project` diretamente via `python3.14 -c`
 *      injetando o body JSON (cargo=1, turno=1, trigger_ts ISO).
 *   5. Valida que `projections` ganhou linhas com pct/CI/p_vitoria plausíveis.
 *
 * Estratégia de invocação Python (opção (b) do briefing T18):
 *   - `child_process.execFileSync` rodando `python3.14 -c <script>`.
 *   - O script prepende a raiz do repo no `sys.path`, importa `_do_project`,
 *     chama com o body lido de stdin, imprime `<status>\n<json>` em stdout.
 *   - Subprocess herda `DATABASE_URL`; `MODEL_SECRET` é deixado UNSET no env
 *     do subprocess para que `post_edge_write` faça early-return (no HTTP).
 *   - Por que NÃO subir HTTP server: porta + cold-start + cleanup frágil; a
 *     função `_do_project` já é o "pure handler" (BaseHTTPRequestHandler só
 *     serializa I/O). Testá-la diretamente cobre toda a lógica do RF-019.
 *
 * Sentinels:
 *   - uf='ZT', cod_zona 99030..99039 — não colide com:
 *     · ingest-cycle (T19 da spec 001): uf=ZT, cod 99010..99012
 *     · ingest-model-trigger (T16): uf=ZM, cod 99020..99022
 *     · T19 desta spec (paralelo): cod 99041..99050
 *   - `projections` cleanup filtra `uf IN ('ZT','SP','RJ')` MAS apenas para
 *     candidato_id IN (1001, 1002) — proteção tripla (candidatos sintéticos
 *     não colidem com cargos reais).
 *
 * NOTE on cleanup: `projections` é append-only em produção (constituição § 10),
 * mas o test harness DELETE pelos sentinels acima é a mesma convenção
 * usada em ingest-cycle.test.ts (S02) — restrito a `tests/`, não toca write
 * path de produção.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/lib/db";

// ---------------------------------------------------------------------------
// Constants & sentinels
// ---------------------------------------------------------------------------

const TEST_UF = "ZT";
const TEST_ZONES = [99030, 99031, 99032, 99033, 99034, 99035, 99036, 99037, 99038, 99039] as const;
// 5 zonas mock "SP" (99030..99034) + 5 zonas mock "RJ" (99035..99039)
const SP_MOCK_ZONES = TEST_ZONES.slice(0, 5);
const RJ_MOCK_ZONES = TEST_ZONES.slice(5);
const SP_MOCK_COD_MUN = 99030;
const RJ_MOCK_COD_MUN = 99031;

// Zonas apuradas no batch parcial: 3 SP-mock + 2 RJ-mock = 5/10
const APURED_ZONES = [...SP_MOCK_ZONES.slice(0, 3), ...RJ_MOCK_ZONES.slice(0, 2)];

const CAND_A = 1001;
const CAND_B = 1002;
const CARGO = 1;
const TURNO = 1;

// trigger_ts determinístico para reprodutibilidade do seed do bootstrap
const TRIGGER_TS = "2026-10-04T20:30:00.000Z";

// ---------------------------------------------------------------------------
// Python invocation
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, "..", "..");
const VENV_PYTHON = resolve(REPO_ROOT, ".venv-model/bin/python3.14");

function resolvePython(): string | null {
  // Prefere venv local (psycopg + numpy + pydantic já instalados).
  if (existsSync(VENV_PYTHON)) return VENV_PYTHON;
  // Fallback: tenta python3.14 do PATH.
  try {
    const out = execFileSync("which", ["python3.14"], { encoding: "utf8" }).trim();
    return out || null;
  } catch {
    return null;
  }
}

interface ProjectResult {
  status: number;
  body: {
    computed: boolean;
    uf_count: number;
    national_p_vitoria_a: number;
    computed_duration_ms: number;
  };
}

/**
 * Invoca `_do_project` no subprocess Python.
 *
 * Estratégia: passa body JSON via env var (PYTHON_BODY) — argv tem limites de
 * tamanho/escaping; env var é mais robusto. O script Python lê
 * `os.environ["PYTHON_BODY"]`, chama `_do_project`, imprime "STATUS\n<json>".
 */
function invokePython(python: string, body: object): ProjectResult {
  const script = `
import json
import os
import sys

sys.path.insert(0, ${JSON.stringify(REPO_ROOT)})

# Garantir que MODEL_SECRET fique UNSET → post_edge_write early-return.
os.environ.pop("MODEL_SECRET", None)

from api.model.project import _do_project

body_bytes = os.environ["PYTHON_BODY"].encode("utf-8")
status, payload = _do_project(body_bytes)
sys.stdout.write(str(status) + "\\n")
sys.stdout.write(json.dumps(payload, default=str))
`.trim();

  const stdout = execFileSync(python, ["-c", script], {
    env: {
      ...process.env,
      PYTHON_BODY: JSON.stringify(body),
      // Sentinela negativa — não queremos edge-write nesta integração.
      MODEL_SECRET: "",
    },
    encoding: "utf8",
    timeout: 30000,
  });

  const newlineIdx = stdout.indexOf("\n");
  const statusStr = stdout.slice(0, newlineIdx).trim();
  const jsonStr = stdout.slice(newlineIdx + 1);
  return {
    status: Number(statusStr),
    body: JSON.parse(jsonStr),
  };
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

/**
 * PRNG mulberry32 determinístico — sem dep externa. Mesmo seed → mesmo stream.
 * Usado para gerar pct_validos / votos sintéticos com reprodutibilidade.
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/**
 * Constrói payload EA20-like esperado por `_extract_zone_candidate_pcts`:
 * `{ cand: [{ n: <cod>, pvap: "<pct_em_string_BR>" }, ...] }`.
 *
 * pvap está em escala 0-100 (string format BR — `_extract_zone_candidate_pcts`
 * lida com vírgula ou ponto). Aqui mandamos ponto pra ficar trivial de parse.
 */
function buildEa20Payload(pctA: number, pctB: number) {
  return {
    cand: [
      { n: CAND_A, pvap: (pctA * 100).toFixed(4) },
      { n: CAND_B, pvap: (pctB * 100).toFixed(4) },
    ],
  };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function cleanupAll(): Promise<void> {
  // historical_results — sentinel ZT.
  await db.execute(sql`
    DELETE FROM historical_results
    WHERE uf = ${TEST_UF}
      AND cod_zona >= ${TEST_ZONES[0]}
      AND cod_zona <= ${TEST_ZONES[TEST_ZONES.length - 1]}
  `);
  // eleitorado — sentinel ZT.
  await db.execute(sql`
    DELETE FROM eleitorado
    WHERE uf = ${TEST_UF}
      AND cod_zona >= ${TEST_ZONES[0]}
      AND cod_zona <= ${TEST_ZONES[TEST_ZONES.length - 1]}
  `);
  // snapshots — sentinel ZT.
  await db.execute(sql`
    DELETE FROM snapshots
    WHERE uf = ${TEST_UF}
      AND cod_zona >= ${TEST_ZONES[0]}
      AND cod_zona <= ${TEST_ZONES[TEST_ZONES.length - 1]}
  `);
  // projections — geradas pelo modelo para uf=ZT (UF rows) E uf IS NULL (nacional).
  // Restringimos por candidato_id sintético (1001/1002) para não tocar dados reais.
  await db.execute(sql`
    DELETE FROM projections
    WHERE candidato_id IN (${CAND_A}, ${CAND_B})
      AND cargo = ${CARGO}
      AND turno = ${TURNO}
  `);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

const databaseUrlSet = Boolean(process.env.DATABASE_URL);
const python = databaseUrlSet ? resolvePython() : null;

// Skip graceful: sem DATABASE_URL ou sem Python 3.14, todos os testes pulam.
const describeIfReady = databaseUrlSet && python ? describe : describe.skip;

// Garantido pelo describeIfReady acima — separação local para evitar `python!`.
const PYTHON_BIN = python ?? "python3.14";

describeIfReady("T18 — ciclo do modelo end-to-end (integration)", { timeout: 60000 }, () => {
  beforeAll(async () => {
    await cleanupAll();

    // ------------------------------------------------------------------
    // 1. Seed eleitorado 2026 (10 zonas, eleitores aptos ~100k–500k).
    // ------------------------------------------------------------------
    const rngElec = mulberry32(424242);
    const eleitoradoRows = TEST_ZONES.map((codZona, i) => {
      const isSp = i < 5;
      const aptos = Math.floor(100_000 + rngElec() * 400_000);
      return {
        ano: 2026,
        uf: TEST_UF,
        codMunicipioTse: isSp ? SP_MOCK_COD_MUN : RJ_MOCK_COD_MUN,
        codZona,
        eleitoresAptos: aptos,
        comparecimentoPctHistorico: null,
      };
    });
    await db.insert(schema.eleitorado).values(eleitoradoRows);

    // ------------------------------------------------------------------
    // 2. Seed historical_results 2022 (10 zonas × 2 candidatos, pct soma=1).
    // ------------------------------------------------------------------
    const rngHist = mulberry32(111111);
    const histRows: (typeof schema.historicalResults.$inferInsert)[] = [];
    for (let i = 0; i < TEST_ZONES.length; i++) {
      const codZona = TEST_ZONES[i] as number;
      const isSp = i < 5;
      const pa = 0.35 + rngHist() * 0.3; // [0.35, 0.65]
      const pb = 1 - pa;
      const aptos = eleitoradoRows[i]?.eleitoresAptos ?? 200_000;
      // 80% de comparecimento médio histórico — números só pra ter votos não-zero.
      const votosTotal = Math.floor(aptos * 0.8);
      const votosA = Math.floor(votosTotal * pa);
      const votosB = votosTotal - votosA;
      histRows.push({
        ano: 2022,
        turno: TURNO,
        cargo: CARGO,
        uf: TEST_UF,
        codMunicipioTse: isSp ? SP_MOCK_COD_MUN : RJ_MOCK_COD_MUN,
        codZona,
        codCandidato: CAND_A,
        nomeCandidato: "Candidato A (sintético)",
        partido: "TA",
        votos: votosA,
        pctValidos: pa.toFixed(5),
        pctTotal: pa.toFixed(5),
      });
      histRows.push({
        ano: 2022,
        turno: TURNO,
        cargo: CARGO,
        uf: TEST_UF,
        codMunicipioTse: isSp ? SP_MOCK_COD_MUN : RJ_MOCK_COD_MUN,
        codZona,
        codCandidato: CAND_B,
        nomeCandidato: "Candidato B (sintético)",
        partido: "TB",
        votos: votosB,
        pctValidos: pb.toFixed(5),
        pctTotal: pb.toFixed(5),
      });
    }
    await db.insert(schema.historicalResults).values(histRows);

    // ------------------------------------------------------------------
    // 3. Seed snapshots — 5/10 zonas apuradas, pct_apurado=50, payload
    //    consistente com pct_validos_2022 + ruído pequeno.
    // ------------------------------------------------------------------
    const rngSnap = mulberry32(202020);
    const snapRows: (typeof schema.snapshots.$inferInsert)[] = [];
    for (const codZona of APURED_ZONES) {
      const histIdx = TEST_ZONES.indexOf(codZona as (typeof TEST_ZONES)[number]);
      const isSp = histIdx < 5;
      // pct_validos_2022 do candidato A na zona — base para o snapshot.
      const histRowA = histRows.find((r) => r.codZona === codZona && r.codCandidato === CAND_A);
      const baseA = Number(histRowA?.pctValidos ?? 0.5);
      // Ruído ±2pp sobre o pct 2022 (swing pequeno).
      const noise = (rngSnap() - 0.5) * 0.04;
      const pctA = Math.max(0.05, Math.min(0.95, baseA + noise));
      const pctB = 1 - pctA;

      const payload = buildEa20Payload(pctA, pctB);
      const payloadStr = JSON.stringify(payload);
      const hash = sha256Hex(payloadStr);

      snapRows.push({
        cargo: CARGO,
        turno: TURNO,
        uf: TEST_UF,
        codZona,
        etag: `"etag-zt-${codZona}"`,
        pctApurado: "50.00",
        votosTotal: 200_000,
        payload,
        hashPayload: hash,
      });
      // unused mark to keep var
      void isSp;
    }
    await db.insert(schema.snapshots).values(snapRows);
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it("invoca _do_project e persiste projections com valores plausíveis", async () => {
    const result = invokePython(PYTHON_BIN, {
      cargo: CARGO,
      turno: TURNO,
      trigger_ts: TRIGGER_TS,
    });

    // ---- Response do orchestrator ----
    expect(result.status).toBe(200);
    expect(result.body.computed).toBe(true);
    expect(result.body.uf_count).toBeGreaterThanOrEqual(1);
    expect(result.body.national_p_vitoria_a).toBeGreaterThanOrEqual(0);
    expect(result.body.national_p_vitoria_a).toBeLessThanOrEqual(1);

    // ---- DB: projections gravadas ----
    // Buscar todas as linhas geradas para os candidatos sintéticos no cargo/turno.
    const inserted = await db.execute<{
      uf: string | null;
      candidato_id: number;
      pct_projetado: string;
      pct_projetado_lower: string;
      pct_projetado_upper: string;
      p_vitoria: string | null;
    }>(sql`
        SELECT uf, candidato_id,
               pct_projetado::text,
               pct_projetado_lower::text,
               pct_projetado_upper::text,
               p_vitoria::text
        FROM projections
        WHERE cargo = ${CARGO} AND turno = ${TURNO}
          AND candidato_id IN (${CAND_A}, ${CAND_B})
      `);

    const rows = inserted.rows;
    expect(rows.length).toBeGreaterThan(0);

    let nationalCount = 0;
    for (const r of rows) {
      const point = Number(r.pct_projetado);
      const lower = Number(r.pct_projetado_lower);
      const upper = Number(r.pct_projetado_upper);

      // Bounds plausíveis: pct em [0, 1].
      expect(point).toBeGreaterThanOrEqual(0);
      expect(point).toBeLessThanOrEqual(1);

      // CI bracket: lower <= point <= upper (igualdades aceitas para casos
      // degenerados em que CI colapsa por edge_cases — RF-017).
      expect(lower).toBeLessThanOrEqual(point + 1e-9);
      expect(upper).toBeGreaterThanOrEqual(point - 1e-9);

      // p_vitoria pode ser NULL para linhas UF; quando presente, [0, 1].
      if (r.p_vitoria !== null) {
        const pv = Number(r.p_vitoria);
        expect(pv).toBeGreaterThanOrEqual(0);
        expect(pv).toBeLessThanOrEqual(1);
      }

      if (r.uf === null) {
        nationalCount++;
      }
    }

    // Pelo menos 1 linha nacional por candidato — compute_national gera uma
    // por candidato com `national_estimates` não-vazio.
    expect(nationalCount).toBeGreaterThanOrEqual(2);

    // Sanity: as linhas nacionais devem ter p_vitoria preenchida (UF não).
    const nationals = rows.filter((r) => r.uf === null);
    for (const n of nationals) {
      expect(n.p_vitoria).not.toBeNull();
    }
  });
});
