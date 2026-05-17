// scripts/build-replay-fixtures.ts
//
// T21 — Gerador do dataset de replay 2022 (spec 002, Fase 7).
//
// Por que existe:
//   O replay 2022 (scripts/replay-2022.ts — T20) precisa reproduzir uma timeline
//   cronológica de apuração e comparar a projeção do modelo contra o resultado
//   final 2022. Os snapshots zona-a-zona reais sumiram do CDN do TSE
//   (documentado em S02). Como fallback pragmático (opção "c" do kickoff S03),
//   sintetizamos uma timeline LINEAR a partir do consolidado final de
//   historical_results 2022. Cada zona "apura" instantaneamente em um
//   timestep T_zona ∈ [1, 30] sorteado uniformemente com seed determinístico;
//   a partir desse T_zona a zona aparece nos snapshots de todos os buckets
//   subsequentes com pvap = pct_validos_final_2022.
//
//   MAE@1h dessa simulação É OTIMISTA: não tem ruído de apuração progressiva
//   intra-zona, voto-em-trânsito, mesa-a-mesa, etc. Caveat OBRIGATÓRIO no
//   relatório do model-validator (T22).
//
// Contrato (lido de scripts/replay-2022.ts — T20):
//
//   snapshots.json:
//     {
//       "historical":  HistoricalRow[],     // todos os candidatos × zonas 2022
//       "eleitorado":  EleitoradoRow[],     // peso por zona
//       "timesteps":   TimestepInput[]      // um por bucket (15min, 30min, 1h, 2h, final)
//     }
//     Onde TimestepInput = { cargo, turno, trigger_ts, bucket, snapshots[] }
//     e snapshots[] = lista cumulativa de zonas com T_zona ≤ timestep_atual.
//
//   ground-truth.json:
//     { [uf: string]: { [candidato_id: string]: number } }   // pct_final ∈ [0,1]
//
// Decisões documentadas:
//   - Cargo=1, Turno=1 (Presidente 2022, 1º turno) — corrida mais rica:
//     27 UFs, 11 candidatos, 421 zonas. Suficiente pra testar pipeline.
//   - 5 buckets (T20 já fixou): 15min, 30min, 1h, 2h, final. Mapeamento
//     bucket → fração_apurada (qual % das zonas já está nos snapshots):
//       15min → 13%   (≈ timestep 4 de 30)
//       30min → 23%   (≈ timestep 7)
//        1h   → 50%   (≈ timestep 15)   ← OT-4 gate (MAE < 2pp)
//        2h   → 100%  (≈ timestep 30)
//       final → 100%  (≈ timestep 30 — espelho de "2h", T20 calibra calibração)
//   - Eleitorado: tabela tem só 2026 (validate-coverage confirmou). Usamos
//     `eleitorado WHERE ano=2026` como PROXY de peso para cada zona. Caveat:
//     distribuição de eleitores 2026 ≈ 2022 (zonas estáveis); erro marginal
//     aceito como custo da simulação.
//   - Filtro `uf <> 'ZZ'` (lição S02 — exterior).
//   - SEED determinístico: 0x5A1AC0F2E2026 (constante hex documentada).
//     Reproduzível bit-a-bit: rodar 2x → diff zero.
//   - Sem ruído voto-zona v1. Se MAE@1h ficar < 0.5pp (suspeito de overfit),
//     T22 reabre e adicionamos `±2pp` por zona-candidato (RNG com seed local).
//
// Uso:
//   set -a && . ./.env.local && set +a
//   pnpm tsx scripts/build-replay-fixtures.ts
//
// Saída: 2 arquivos em tests/fixtures/replay-2022/. Sai com exit 0.

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getPool } from "../data-pipeline/_tse-common.ts";

const SEED_HEX = "5A1AC0F2E2026"; // documentado acima
const N_TIMESTEPS = 30;
const CARGO = 1;
const TURNO = 1;
const ANO = 2022;
const ELEITORADO_ANO = 2026; // proxy — tabela não tem 2022

// Buckets espelhando scripts/replay-2022.ts (T20).
// Cada entrada define: nome do bucket, timestep "alvo" (1..30), trigger_ts ISO.
// Em T_zona ≤ timestep_alvo → zona aparece no snapshots[] daquele bucket.
const BUCKETS: Array<{
  bucket: "15min" | "30min" | "1h" | "2h" | "final";
  timestep: number;
  trigger_ts: string;
}> = [
  { bucket: "15min", timestep: 4, trigger_ts: "2022-10-02T20:15:00Z" },
  { bucket: "30min", timestep: 7, trigger_ts: "2022-10-02T20:30:00Z" },
  { bucket: "1h", timestep: 15, trigger_ts: "2022-10-02T21:00:00Z" },
  { bucket: "2h", timestep: 30, trigger_ts: "2022-10-02T22:00:00Z" },
  { bucket: "final", timestep: 30, trigger_ts: "2022-10-02T23:30:00Z" },
];

interface HistoricalRowDb {
  uf: string;
  cod_zona: number;
  cod_candidato: number;
  votos: number;
  pct_validos: number | null;
  partido: string | null;
  nome_candidato: string | null;
}

interface EleitoradoRowDb {
  uf: string;
  cod_zona: number;
  eleitores_aptos: number;
}

// ---------------------------------------------------------------------------
// Tipos de saída — alinhados com BatchPayload em scripts/replay-2022.ts (T20).
// ---------------------------------------------------------------------------

interface HistoricalRowOut {
  uf: string;
  cod_zona: number;
  cod_candidato: number;
  pct_validos: number | null;
  partido: string | null;
}

interface EleitoradoRowOut {
  uf: string;
  cod_zona: number;
  eleitores_aptos: number;
}

interface SnapshotOut {
  uf: string;
  cod_zona: number;
  pct_apurado: number;
  payload: { cand: Array<{ n: number; pvap: string | number }> };
}

interface TimestepInputOut {
  cargo: number;
  turno: number;
  trigger_ts: string;
  bucket: "15min" | "30min" | "1h" | "2h" | "final";
  snapshots: SnapshotOut[];
}

interface DatasetOut {
  historical: HistoricalRowOut[];
  eleitorado: EleitoradoRowOut[];
  timesteps: TimestepInputOut[];
}

type GroundTruthOut = Record<string, Record<string, number>>;

// ---------------------------------------------------------------------------
// PRNG determinístico (Mulberry32) — sem dep externa.
// Em Python equivale a `numpy.random.default_rng(seed)`; aqui é Node nativo.
// ---------------------------------------------------------------------------

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

function seedFromHex(hex: string): number {
  let acc = 0;
  for (let i = 0; i < hex.length; i += 8) {
    acc ^= parseInt(hex.slice(i, i + 8), 16) >>> 0;
  }
  return acc >>> 0;
}

// ---------------------------------------------------------------------------
// DB readers
// ---------------------------------------------------------------------------

async function fetchAll(): Promise<{
  historical: HistoricalRowDb[];
  eleitorado: EleitoradoRowDb[];
}> {
  const pool = getPool();
  try {
    const [{ rows: historical }, { rows: eleitorado }] = await Promise.all([
      pool.query<HistoricalRowDb>(
        `
          SELECT uf, cod_zona, cod_candidato, votos, pct_validos::float AS pct_validos, partido, nome_candidato
          FROM historical_results
          WHERE ano = $1 AND turno = $2 AND cargo = $3 AND uf <> 'ZZ'
          ORDER BY uf, cod_zona, cod_candidato
        `,
        [ANO, TURNO, CARGO],
      ),
      pool.query<EleitoradoRowDb>(
        `
          SELECT uf, cod_zona, eleitores_aptos
          FROM eleitorado
          WHERE ano = $1 AND uf <> 'ZZ'
          ORDER BY uf, cod_zona
        `,
        [ELEITORADO_ANO],
      ),
    ]);
    return { historical, eleitorado };
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function pctString(n: number): string {
  // pvap aceito em escala 0-100. Formato canônico "12.34"; o decoder
  // _extract_zone_candidate_pcts (api/model/project.py) também aceita BR.
  return n.toFixed(2);
}

async function main(): Promise<void> {
  const t0 = Date.now();
  console.log("[build-replay-fixtures] T21 — dataset replay 2022");
  console.log(
    `  cargo=${CARGO} turno=${TURNO} ano=${ANO} n_timesteps=${N_TIMESTEPS} seed=0x${SEED_HEX}`,
  );

  // 1. DB
  console.log("[1/5] lendo historical_results + eleitorado …");
  const { historical, eleitorado } = await fetchAll();
  console.log(
    `      historical=${historical.length} rows · eleitorado=${eleitorado.length} zonas`,
  );

  // 2. Agrupa por zona — todos os candidatos da zona vão pro mesmo T_zona.
  const byZone = new Map<
    string,
    { uf: string; cod_zona: number; rows: HistoricalRowDb[] }
  >();
  for (const h of historical) {
    const key = `${h.uf}:${h.cod_zona}`;
    let bucket = byZone.get(key);
    if (!bucket) {
      bucket = { uf: h.uf, cod_zona: h.cod_zona, rows: [] };
      byZone.set(key, bucket);
    }
    bucket.rows.push(h);
  }
  console.log(`      ${byZone.size} zonas únicas`);

  // 3. Sorteia T_zona — ordem de iteração reprodutível (chaves ordenadas).
  console.log("[2/5] sorteando T_zona com seed determinístico …");
  const rng = mulberry32(seedFromHex(SEED_HEX));
  const tByZone = new Map<string, number>();
  const sortedKeys = Array.from(byZone.keys()).sort();
  for (const key of sortedKeys) {
    const t = 1 + Math.floor(rng() * N_TIMESTEPS); // [1, 30]
    tByZone.set(key, Math.min(t, N_TIMESTEPS));
  }

  // Sanity: distribuição de T_zona.
  const histDist = new Array(N_TIMESTEPS + 1).fill(0);
  for (const t of tByZone.values()) histDist[t]++;
  const histSummary = histDist
    .map((c, i) => (i >= 1 && c > 0 ? `t${i}=${c}` : ""))
    .filter(Boolean)
    .join(" ");
  console.log(`      distribuição: ${histSummary}`);

  // 4. Pré-computa SnapshotOut por zona (independente de bucket).
  //    O bucket só decide se a zona está "incluída" ou não no array daquele timestep.
  console.log("[3/5] pré-computando snapshots por zona …");
  const snapshotByZone = new Map<string, SnapshotOut>();
  for (const key of sortedKeys) {
    const zone = byZone.get(key);
    if (!zone) continue;
    const brTotal = zone.rows.reduce((acc, r) => acc + Number(r.votos), 0);
    if (brTotal <= 0) continue;
    const cand = zone.rows.map((r) => ({
      n: r.cod_candidato,
      pvap: pctString((Number(r.votos) / brTotal) * 100),
    }));
    snapshotByZone.set(key, {
      uf: zone.uf,
      cod_zona: zone.cod_zona,
      pct_apurado: 100,
      payload: { cand },
    });
  }

  // 5. Monta timesteps[] — para cada bucket, snapshots cumulativos de
  //    todas as zonas com T_zona ≤ timestep alvo.
  console.log("[4/5] montando timesteps cumulativos …");
  const timesteps: TimestepInputOut[] = [];
  for (const b of BUCKETS) {
    const snapshots: SnapshotOut[] = [];
    for (const key of sortedKeys) {
      const t = tByZone.get(key);
      if (t === undefined) continue;
      if (t > b.timestep) continue;
      const snap = snapshotByZone.get(key);
      if (snap) snapshots.push(snap);
    }
    timesteps.push({
      cargo: CARGO,
      turno: TURNO,
      trigger_ts: b.trigger_ts,
      bucket: b.bucket,
      snapshots,
    });
    console.log(
      `      bucket=${b.bucket} (t=${b.timestep}): ${snapshots.length}/${snapshotByZone.size} zonas (${((snapshots.length / snapshotByZone.size) * 100).toFixed(1)}%)`,
    );
  }

  // 6. Ground truth — pct_final por (uf, candidato), [0,1].
  console.log("[5/5] computando ground-truth …");
  const ufVotos = new Map<string, Map<number, number>>(); // uf → cand → votos
  for (const h of historical) {
    let inner = ufVotos.get(h.uf);
    if (!inner) {
      inner = new Map<number, number>();
      ufVotos.set(h.uf, inner);
    }
    inner.set(h.cod_candidato, (inner.get(h.cod_candidato) ?? 0) + Number(h.votos));
  }

  const groundTruth: GroundTruthOut = {};
  for (const [uf, candVotos] of ufVotos.entries()) {
    let total = 0;
    for (const v of candVotos.values()) total += v;
    if (total <= 0) continue;
    groundTruth[uf] = {};
    for (const [cand, votos] of candVotos.entries()) {
      const slot = groundTruth[uf];
      if (slot) slot[String(cand)] = votos / total;
    }
  }

  // 7. Dataset final (historical + eleitorado projetados para o shape T20).
  const dataset: DatasetOut = {
    historical: historical.map((h) => ({
      uf: h.uf,
      cod_zona: h.cod_zona,
      cod_candidato: h.cod_candidato,
      pct_validos: h.pct_validos,
      partido: h.partido,
    })),
    eleitorado: eleitorado.map((e) => ({
      uf: e.uf,
      cod_zona: e.cod_zona,
      eleitores_aptos: Number(e.eleitores_aptos),
    })),
    timesteps,
  };

  // 8. Persistência.
  const outDir = resolve(process.cwd(), "tests/fixtures/replay-2022");
  await mkdir(outDir, { recursive: true });
  const snapshotsPath = resolve(outDir, "snapshots.json");
  const groundPath = resolve(outDir, "ground-truth.json");

  const datasetBody = JSON.stringify(dataset);
  const groundBody = JSON.stringify(groundTruth, null, 2);

  await writeFile(snapshotsPath, datasetBody, "utf8");
  await writeFile(groundPath, groundBody, "utf8");

  const datasetKb = (datasetBody.length / 1024).toFixed(1);
  const groundKb = (groundBody.length / 1024).toFixed(1);
  const ufCount = Object.keys(groundTruth).length;
  const candCount = new Set(historical.map((h) => h.cod_candidato)).size;

  console.log("");
  console.log("✅ fixtures geradas:");
  console.log(`   ${snapshotsPath}`);
  console.log(`        ${datasetKb} KB · ${timesteps.length} buckets`);
  console.log(`   ${groundPath}`);
  console.log(`        ${groundKb} KB · ${ufCount} UFs`);
  console.log("");
  console.log(`   UFs cobertas:        ${ufCount}`);
  console.log(`   Candidatos:          ${candCount}`);
  console.log(`   Zonas únicas:        ${byZone.size}`);
  console.log(`   Timesteps:           ${N_TIMESTEPS}`);
  console.log(`   Buckets:             ${BUCKETS.map((b) => b.bucket).join(", ")}`);
  console.log(`   Seed:                0x${SEED_HEX}`);
  console.log(`   Eleitorado proxy:    ${ELEITORADO_ANO}`);
  console.log(`   Tempo:               ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log("");
  console.log("Próximo passo: T20 consome via");
  console.log(
    "   pnpm tsx scripts/replay-2022.ts --dataset tests/fixtures/replay-2022/snapshots.json --ground-truth tests/fixtures/replay-2022/ground-truth.json",
  );
}

main().catch((err) => {
  // biome-ignore lint/suspicious/noConsole: CLI script
  console.error("[build-replay-fixtures] falha:", err);
  process.exit(1);
});
