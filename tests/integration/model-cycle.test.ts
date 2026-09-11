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
    // 30s ETIMEDOUT medido em 2026-09-05 — DIAGNÓSTICO (não é Fase 1 nem a
    // seed deste teste, que são 10 zonas e concluem em milissegundos):
    // `cargo=1, turno=1` neste Neon de dev/preview JÁ TEM dados nacionais
    // reais (S07 — pipeline TSE simulado-ready): 2651 zonas apuradas em
    // todas as 27 UFs, ~62k linhas em `historical_results`. `_do_project`
    // busca esses dados INTEIROS a cada chamada (sem filtro por UF), então
    // este teste sempre paga o custo nacional completo, não só o das suas
    // 10 zonas sintéticas.
    //   1) BUG REAL encontrado e corrigido nesta tarefa —
    //      `api/model/project.py::fetch_municipio_aggregates` fazia
    //      `LEFT JOIN zonas z ON z.cod_zona = r.cod_zona` SEM `AND z.uf =
    //      r.uf`. `zonas` tem PK composta `(uf, cod_zona)` — o número da
    //      zona REPETE entre UFs (zona "8" existe em AP/BA/CE/DF/ES/...).
    //      Sem o `uf` no JOIN, cada snapshot casava com todas as UFs que
    //      compartilham aquele número — fan-out medido de 2651 → 35757
    //      linhas, e a query sozinha (`cur.execute`, antes do `fetchall`)
    //      levou 226s. Era também um bug de CORRETUDE (município errado
    //      por zona sempre que duas UFs coincidem no número — quase
    //      sempre) em `EdgeUfMunicipio`, não só de performance. Corrigido
    //      adicionando `AND z.uf = r.uf`: a mesma query caiu para 16s.
    //   2) Custo restante (NEON, não código) — medido isoladamente com
    //      `.venv-model/bin/python3.14` fora do vitest, mesmo `DATABASE_URL`:
    //      import+connect ~1,3s, `fetch_snapshots` ~14s, `fetch_
    //      historical_2022` ~6s, `fetch_municipio_aggregates` (pós-fix)
    //      ~17s, resto <1s cada — soma ~40s só na fase de fetch. `_do_
    //      project` completo (fetch+compute+insert, cargo=1/turno=1, 27 UFs
    //      reais + candidatos sintéticos 1001/1002 desta seed) mediu
    //      42,2s (`computed_duration_ms: 42170` no log estruturado). Este é
    //      tráfego de rede real (múltiplos MBs de payload por fetch) contra
    //      um Neon compute pequeno — nada aqui é O(n²) nem redundante após
    //      o fix acima (confirmado via EXPLAIN + medição direta).
    // 90s dá ~2,1x de margem sobre os 42,2s medidos — RNF-006 (p95 <2s em
    // produção) segue como meta do endpoint Vercel-a-Neon (rede interna,
    // sem o link deste ambiente de dev); ESTE teste mede
    // corretude/persistência contra Neon real, não RNF-006 — não é gate de
    // performance.
    timeout: 90_000,
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
 * Constrói envelope EA20 REAL (`e`/`v`/`s` de raiz + `carg[].agr[].par[].cand[]`)
 * — formato exigido por `_extract_zone_candidatos` desde a Fase 1 do plano
 * `tem-um-erro-eu-velvety-sprout.md` (regra de três/extrapolação por zona).
 *
 * ATUALIZADO 2026-09-05 (T18 vermelho após a Fase 1): o payload achatado
 * anterior (`{cand:[{n,pvap}]}`) NÃO tem `e`/`v`/`s` de raiz —
 * `_extract_zone_participacao` degrada para `None` nesse formato
 * (campo fatal `e.te` ausente), e `_extract_zone_candidatos` idem — TODAS
 * as 10 zonas de UF=ZT ficavam fora de `estimate_uf_candidatos` (nenhuma
 * "apurada"), a UF caía inteira no branch de imputação nacional (RF-017
 * 2o nível, `cargo==1`) e era projetada com os candidatos NACIONAIS reais
 * (10/20 — ver `derive`), nunca 1001/1002. O teste filtra
 * `candidato_id IN (1001, 1002)` — zero linhas, silenciosamente mascarado
 * pelo timeout (ver comentário em `invokePython`).
 *
 * `k = te/esi` fixo em 1 (esi=te, "seção totalmente instalada") — não é
 * o que a Fase 1 testa (isso é `test_extrapolation.py`); aqui só
 * precisamos de contagens absolutas coerentes o bastante para produzir
 * `pct_atual_votaveis == pctA` exatamente (vap/vvc), sem ruído de escala.
 * `vvc` é o `aptos` real da zona (`eleitoradoRows[i].eleitoresAptos`) —
 * mantém `vap <= vvc <= te` (nunca mais votos que eleitores).
 */
function buildEa20Envelope(pctA: number, pctB: number, aptos: number) {
  const vvc = Math.max(1, Math.floor(aptos * 0.7)); // turnout sintético ~70%
  const vapA = Math.round(pctA * vvc);
  const vapB = vvc - vapA; // soma exata a vvc — sem sobra de arredondamento
  return {
    e: { te: aptos, esi: aptos, c: vvc, a: aptos - vvc },
    v: { vvc, vv: vvc, vb: 0, tvn: 0, van: 0, vansj: 0 },
    s: { psa: 100 },
    carg: [
      {
        cd: String(CARGO),
        agr: [
          {
            par: [
              {
                cand: [
                  { n: CAND_A, vap: vapA },
                  { n: CAND_B, vap: vapB },
                ],
              },
            ],
          },
        ],
      },
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

// 100s — cobre os 90s de `execFileSync` (ver justificativa no invocador
// Python) + margem para seed/cleanup via Drizzle.
describeIfReady("T18 — ciclo do modelo end-to-end (integration)", { timeout: 100_000 }, () => {
  beforeAll(async () => {
    await cleanupAll();

    // ------------------------------------------------------------------
    // 1. Seed eleitorado 2026 (10 zonas, eleitores aptos ~100k–500k).
    //
    // Desde a migration 0006 a PK de `eleitorado` é
    // (ano, uf, cod_municipio_tse, cod_zona). Cada zona aqui recebe um único
    // município (SP_MOCK_COD_MUN ou RJ_MOCK_COD_MUN), então continua havendo
    // uma linha por zona e os números do ciclo não mudam. Zona espalhada por
    // vários municípios é cenário da Fase 3 (soma dos pares antes do modelo).
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

      const aptos = eleitoradoRows[histIdx]?.eleitoresAptos ?? 200_000;
      const payload = buildEa20Envelope(pctA, pctB, aptos);
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

      // Bounds plausíveis: pct em [0, 100]. Escala 0–100 desde a correção do
      // BUG-2 (fração interna no bootstrap, 0–100 em `rows`/`projections`/payload
      // — ver docs/architecture/data-model.md § Escala de percentuais).
      expect(point).toBeGreaterThanOrEqual(0);
      expect(point).toBeLessThanOrEqual(100);

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

// ---------------------------------------------------------------------------
// Fase 3 (11/09) — dois PARES (município × zona) da mesma zona
// ---------------------------------------------------------------------------

/** UF sentinela exclusiva deste bloco (não colide com ZT acima). */
const PAIR_UF = "ZP";
/** Zona única, coberta por DOIS municípios — o caso de 62,5% das zonas reais. */
const PAIR_ZONA = 99045;
const PAIR_MUN_A = 91001;
const PAIR_MUN_B = 91002;
const PAIR_CAND_A = 1003;
const PAIR_CAND_B = 1004;

// Eleitorado por par — a zona pesa a SOMA (200.000).
const PAIR_APTOS_A = 120_000;
const PAIR_APTOS_B = 80_000;
// Votáveis concorrentes por par (esi = te → k = 1, sem escala).
const PAIR_VVC_A = 84_000;
const PAIR_VVC_B = 56_000;
// Votos absolutos conhecidos por par.
const PAIR_VAP_A1 = 50_000;
const PAIR_VAP_B1 = PAIR_VVC_A - PAIR_VAP_A1; // 34.000
const PAIR_VAP_A2 = 21_000;
const PAIR_VAP_B2 = PAIR_VVC_B - PAIR_VAP_A2; // 35.000

function buildPairEnvelope(aptos: number, vvc: number, vapA: number, vapB: number) {
  return {
    e: { te: aptos, esi: aptos, c: vvc, a: aptos - vvc },
    v: { vvc, vv: vvc, vb: 0, tvn: 0, van: 0, vansj: 0 },
    s: { ts: 100, si: 100, sa: 100, psa: 100 },
    carg: [
      {
        cd: String(CARGO),
        agr: [
          {
            par: [
              {
                cand: [
                  { n: PAIR_CAND_A, vap: vapA },
                  { n: PAIR_CAND_B, vap: vapB },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

async function cleanupPairs(): Promise<void> {
  await db.execute(sql`
    DELETE FROM eleitorado WHERE uf = ${PAIR_UF} AND cod_zona = ${PAIR_ZONA}
  `);
  await db.execute(sql`
    DELETE FROM snapshots WHERE uf = ${PAIR_UF} AND cod_zona = ${PAIR_ZONA}
  `);
  await db.execute(sql`
    DELETE FROM projections
    WHERE candidato_id IN (${PAIR_CAND_A}, ${PAIR_CAND_B})
      AND cargo = ${CARGO} AND turno = ${TURNO}
  `);
}

describeIfReady(
  "Fase 3 — zona multi-município: o total da UF é a soma dos pares",
  { timeout: 100_000 },
  () => {
    beforeAll(async () => {
      await cleanupPairs();

      // Eleitorado: DOIS pares da mesma zona. A zona pesa 200.000 — é o que
      // `fetch_eleitorado` tem de devolver (`SUM ... GROUP BY uf, cod_zona`);
      // sem o GROUP BY viriam 80.000 (a última fatia de município).
      await db.insert(schema.eleitorado).values([
        {
          ano: 2026,
          uf: PAIR_UF,
          codMunicipioTse: PAIR_MUN_A,
          codZona: PAIR_ZONA,
          eleitoresAptos: PAIR_APTOS_A,
          comparecimentoPctHistorico: null,
        },
        {
          ano: 2026,
          uf: PAIR_UF,
          codMunicipioTse: PAIR_MUN_B,
          codZona: PAIR_ZONA,
          eleitoresAptos: PAIR_APTOS_B,
          comparecimentoPctHistorico: null,
        },
      ]);

      // Snapshots: um por par, 100% apurado, `vap` conhecidos. É o formato que
      // o TSE publica em 2026 — um arquivo EA20 por (município, zona).
      const p1 = buildPairEnvelope(PAIR_APTOS_A, PAIR_VVC_A, PAIR_VAP_A1, PAIR_VAP_B1);
      const p2 = buildPairEnvelope(PAIR_APTOS_B, PAIR_VVC_B, PAIR_VAP_A2, PAIR_VAP_B2);
      await db.insert(schema.snapshots).values([
        {
          cargo: CARGO,
          turno: TURNO,
          uf: PAIR_UF,
          codMunicipioTse: PAIR_MUN_A,
          codZona: PAIR_ZONA,
          etag: `"etag-zp-${PAIR_MUN_A}"`,
          pctApurado: "100.00",
          votosTotal: PAIR_VVC_A,
          payload: p1,
          hashPayload: sha256Hex(JSON.stringify(p1)),
        },
        {
          cargo: CARGO,
          turno: TURNO,
          uf: PAIR_UF,
          codMunicipioTse: PAIR_MUN_B,
          codZona: PAIR_ZONA,
          etag: `"etag-zp-${PAIR_MUN_B}"`,
          pctApurado: "100.00",
          votosTotal: PAIR_VVC_B,
          payload: p2,
          hashPayload: sha256Hex(JSON.stringify(p2)),
        },
      ]);
    });

    afterAll(async () => {
      await cleanupPairs();
    });

    it("soma os dois pares: votos projetados da UF = vap(par 1) + vap(par 2) a 100%", async () => {
      const result = invokePython(PYTHON_BIN, {
        cargo: CARGO,
        turno: TURNO,
        trigger_ts: TRIGGER_TS,
      });
      expect(result.status).toBe(200);
      expect(result.body.computed).toBe(true);

      const inserted = await db.execute<{
        candidato_id: number;
        votos_projetados: string | null;
        pct_apurado: string | null;
      }>(sql`
        SELECT candidato_id, votos_projetados::text, pct_apurado::text
        FROM projections
        WHERE cargo = ${CARGO} AND turno = ${TURNO} AND uf = ${PAIR_UF}
          AND candidato_id IN (${PAIR_CAND_A}, ${PAIR_CAND_B})
      `);

      const byCand = new Map(inserted.rows.map((r) => [Number(r.candidato_id), r]));
      // Antes da Fase 3 esta UF veria UMA das duas fatias (a mais recente por
      // `(uf, cod_zona)`) e projetaria ~56.000 ou ~84.000 votáveis, não 140.000.
      expect(byCand.get(PAIR_CAND_A)).toBeDefined();
      expect(byCand.get(PAIR_CAND_B)).toBeDefined();
      expect(Number(byCand.get(PAIR_CAND_A)?.votos_projetados)).toBe(PAIR_VAP_A1 + PAIR_VAP_A2);
      expect(Number(byCand.get(PAIR_CAND_B)?.votos_projetados)).toBe(PAIR_VAP_B1 + PAIR_VAP_B2);
      // Peso da zona = Σ dos pares → a UF está 100% apurada (não 40% nem 60%).
      expect(Number(byCand.get(PAIR_CAND_A)?.pct_apurado)).toBeCloseTo(100, 5);
    });
  },
);
