// scripts/replay-2022.ts
//
// T20 (spec 002, Fase 7) — Replay 2022 real, alimenta o gate OT-4
// (RNF-006: MAE@1h < 2pp). Substitui o skeleton de T12 (S02).
//
// Arquitetura (decidida em T20):
//   1. TS carrega dataset 2022 (vem do T21 — opção (c) "simulação linear" a
//      partir de `historical_results`). Em modo --self-test usa um mock
//      mínimo gerado inline (2 UFs × 3 timesteps × 2 candidatos).
//   2. TS particiona timesteps em buckets {15min, 30min, 1h, 2h, final}.
//   3. UMA chamada subprocess Python (`api/model/replay_batch.py`) recebe o
//      dataset inteiro via stdin (JSON) e devolve TODAS as projeções via
//      stdout. Sem subprocess-por-timestep (custava ~1h45 walltime; agora
//      cabe em <5min — alvo de T20).
//   4. TS calcula MAE comparando projeção em cada bucket com `ground_truth`
//      (resultado final 2022 do dataset T21).
//   5. TS escreve `build/replay-2022/<ts>/report.json` com `maeByTimePoint`
//      e calibração de p_vitoria preenchidos.
//
// Uso:
//   pnpm tsx scripts/replay-2022.ts --self-test
//     ↑ smoke local com mock interno (<10s, sem deps externas)
//
//   pnpm tsx scripts/replay-2022.ts --dataset tests/fixtures/replay-2022/snapshots.json \
//                                    --ground-truth tests/fixtures/replay-2022/ground-truth.json
//     ↑ replay completo contra dataset T21 (depois que ele entregar)
//
// Hand-off pra T22:
//   model-validator lê o report.json mais recente em build/replay-2022/ e
//   compara `maeByTimePoint["1h"]` contra OT-4 (<0.02 = <2pp).

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Tipos — alinhados com api/model/replay_batch.py
// ---------------------------------------------------------------------------

type Bucket = "15min" | "30min" | "1h" | "2h" | "final";

interface Snapshot {
  uf: string;
  cod_zona: number;
  pct_apurado: number;
  // Opaco por design: este script NÃO introspecciona o payload (repassa
  // para o subprocess Python via stdin). Desde a Fase 5 (não-tautológico,
  // `docs/_meta/plano-modelo-regra-de-tres-2026-09-05.md` § E), o dataset
  // real (`scripts/build-replay-fixtures.ts`) emite o envelope EA20
  // completo (`carg[].agr[].par[].cand[]` + `e`/`v`/`s` de raiz); o
  // self-test abaixo ainda usa o formato achatado legado `{cand:[...]}`
  // (aceito por `_extract_zone_participacao`/`_iter_cands` só quando faz
  // sentido — o self-test não exercita a extrapolação por regra de três).
  payload: Record<string, unknown>;
}

interface HistoricalRow {
  uf: string;
  cod_zona: number;
  cod_candidato: number;
  pct_validos: number | null;
  partido: string | null;
}

interface EleitoradoRow {
  uf: string;
  cod_zona: number;
  eleitores_aptos: number;
}

interface TimestepInput {
  cargo: number;
  turno: number;
  trigger_ts: string;
  bucket: Bucket;
  snapshots: Snapshot[];
}

interface BatchPayload {
  ground_truth: Record<string, Record<string, number>>; // uf -> candidato -> pct_final
  historical: HistoricalRow[];
  eleitorado: EleitoradoRow[];
  timesteps: TimestepInput[];
}

interface UFProjection {
  uf: string;
  candidato_id: number;
  pct_projetado: number;
  pct_projetado_lower: number;
  pct_projetado_upper: number;
  pct_apurado: number;
}

interface NationalCandidato {
  id: number;
  pct_projetado: number;
  pct_projetado_lower: number;
  pct_projetado_upper: number;
  p_vitoria: number;
  // S05 carry-over → S06/F4d Fase 5 (ADR-0014). `p_passa_2t` é P(o candidato
  // termina top-2 do 1T); `p_fecha_1t` é P(>= 50%+1 no agregado nacional).
  // Sempre presentes na saída do `replay_batch.py` pós-Fase 5 (default 0.0
  // quando ausente — payloads de 2T degeneram). Opcional aqui só pra
  // não quebrar releitura de report.json antigos.
  p_passa_2t?: number;
  p_fecha_1t?: number;
}

interface TimestepResult {
  cargo: number;
  turno: number;
  trigger_ts: string;
  bucket: Bucket;
  duration_ms: number;
  uf_projections: UFProjection[];
  national: {
    candidatos: NationalCandidato[];
    p_vitoria_a: number;
    candidato_a_id?: number | null;
    candidato_b_id?: number | null;
    // S05 carry-over → S06/F4d Fase 5. `p_segundo_turno_overall` ∈ [0,1] em
    // 1T; `null` em 2T (semântica "não aplicável"). `cenarios_2t` é top-3
    // pares (id_a, id_b) ordenado por prob desc.
    p_segundo_turno_overall?: number | null;
    cenarios_2t?: Array<{ par: [number, number]; prob: number }>;
  };
}

interface BatchResponse {
  results: TimestepResult[];
}

interface ReplayReport {
  ran_at: string;
  dataset: { source: string; ufs: string[]; n_zones: number };
  n_timesteps: number;
  wall_time_ms: number;
  maeByTimePoint: Record<Bucket, Record<string, number>>;
  // Fase 5 (docs/_meta/plano-modelo-regra-de-tres-2026-09-05.md § E) — OT-4
  // redefinido: além do MAE@1h < 2pp, exige cobertura do IC95 (o intervalo
  // [pct_projetado_lower, pct_projetado_upper] contém o valor real de 2022)
  // >= 90% dos pares (UF, candidato). Reportado para todos os buckets;
  // gate formal só em "1h".
  ciCoverageByTimePoint: Record<Bucket, { coverage: number; n: number }>;
  calibration: Array<{
    predicted_p_win_bucket: number;
    actual_win_rate: number;
    n: number;
  }>;
  notes: string;
}

// ---------------------------------------------------------------------------
// Self-test dataset — mock minimal pra smoke (<10s, sem T21)
// ---------------------------------------------------------------------------

function buildSelfTestDataset(): BatchPayload {
  // 2 UFs × 2 zonas × 2 candidatos × 3 timesteps (15min, 1h, final).
  // Ground truth: candidato 13 venceu em AC (52%) e SP (51%) em 2022.
  // Snapshots simulados: apuração progressiva linearmente de 10% → 100%,
  // com swing pequeno (ruído ±1pp) → modelo deve convergir ao ground truth.
  const ufs = ["AC", "SP"];
  const zonas = [1, 2];
  const cands = [13, 22]; // 13 = vencedor, 22 = adversário

  const ground_truth: Record<string, Record<string, number>> = {
    AC: { "13": 0.52, "22": 0.48 },
    SP: { "13": 0.51, "22": 0.49 },
  };

  const historical: HistoricalRow[] = [];
  for (const uf of ufs) {
    for (const z of zonas) {
      // 2022 final por zona — usamos o mesmo target final como histórico
      // (replay determinístico: modelo deve "redescobrir" o resultado).
      historical.push({
        uf,
        cod_zona: z,
        cod_candidato: 13,
        pct_validos: ground_truth[uf]?.["13"] ?? 0.5,
        partido: "PT",
      });
      historical.push({
        uf,
        cod_zona: z,
        cod_candidato: 22,
        pct_validos: ground_truth[uf]?.["22"] ?? 0.5,
        partido: "PL",
      });
    }
  }

  const eleitorado: EleitoradoRow[] = [];
  for (const uf of ufs) {
    for (const z of zonas) {
      eleitorado.push({ uf, cod_zona: z, eleitores_aptos: 5000 });
    }
  }

  const buckets: Array<{ bucket: Bucket; pct: number; ts: string }> = [
    { bucket: "15min", pct: 15, ts: "2022-10-02T20:15:00Z" },
    { bucket: "1h", pct: 60, ts: "2022-10-02T21:00:00Z" },
    { bucket: "final", pct: 100, ts: "2022-10-02T23:30:00Z" },
  ];

  const timesteps: TimestepInput[] = [];
  for (const b of buckets) {
    const snapshots: Snapshot[] = [];
    for (const uf of ufs) {
      for (const z of zonas) {
        // pvap reflete o ground truth (sem ruído pro smoke ser determinístico).
        const pct13 = (ground_truth[uf]?.["13"] ?? 0.5) * 100;
        const pct22 = (ground_truth[uf]?.["22"] ?? 0.5) * 100;
        snapshots.push({
          uf,
          cod_zona: z,
          pct_apurado: b.pct,
          payload: {
            cand: [
              { n: 13, pvap: pct13.toFixed(2).replace(".", ",") },
              { n: 22, pvap: pct22.toFixed(2).replace(".", ",") },
            ],
          },
        });
      }
    }
    timesteps.push({
      cargo: 1,
      turno: 1,
      trigger_ts: b.ts,
      bucket: b.bucket,
      snapshots,
    });
  }
  void cands; // silencia noUncheckedIndexedAccess; usado via ground_truth direto

  return { ground_truth, historical, eleitorado, timesteps };
}

// ---------------------------------------------------------------------------
// Python subprocess — bridge com api/model/replay_batch.py
// ---------------------------------------------------------------------------

function resolvePythonBin(root: string): string {
  // Preferência: PYTHON_BIN explícito > venv local .venv-model > python3 do PATH.
  // Em CI/Vercel o venv não existe; user dev tem .venv-model com pydantic+numpy.
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const venv = resolve(root, ".venv-model", "bin", "python3");
  if (existsSync(venv)) return venv;
  return "python3";
}

function runPythonBatch(payload: BatchPayload): Promise<BatchResponse> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const pyBin = resolvePythonBin(root);
  // python -m api.model.replay_batch  → respeita imports absolutos (api.*).
  const py = spawn(pyBin, ["-m", "api.model.replay_batch"], {
    cwd: root,
    env: { ...process.env, PYTHONPATH: root },
    stdio: ["pipe", "pipe", "pipe"],
  });

  return new Promise((res, rej) => {
    let stdout = "";
    let stderr = "";
    py.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    py.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    py.on("error", rej);
    py.on("close", (code) => {
      if (code !== 0) {
        rej(
          new Error(
            `replay_batch exited ${code}\nstderr:\n${stderr}\nstdout (first 500): ${stdout.slice(
              0,
              500,
            )}`,
          ),
        );
        return;
      }
      try {
        res(JSON.parse(stdout) as BatchResponse);
      } catch (e) {
        rej(
          new Error(
            `failed to parse replay_batch stdout: ${(e as Error).message}\nfirst 500 chars: ${stdout.slice(0, 500)}`,
          ),
        );
      }
    });
    py.stdin.write(JSON.stringify(payload));
    py.stdin.end();
  });
}

// ---------------------------------------------------------------------------
// MAE — compara projeção × ground truth
// ---------------------------------------------------------------------------

function computeMae(
  results: TimestepResult[],
  groundTruth: Record<string, Record<string, number>>,
): Record<Bucket, Record<string, number>> {
  // mae[bucket][candidato_id] = média de |pct_projetado - pct_final_2022| em
  // todas as (UF, timestep) daquele bucket.
  const accum: Record<Bucket, Record<string, { sum: number; n: number }>> = {
    "15min": {},
    "30min": {},
    "1h": {},
    "2h": {},
    final: {},
  };

  for (const r of results) {
    for (const u of r.uf_projections) {
      const truth = groundTruth[u.uf]?.[String(u.candidato_id)];
      if (truth === undefined) continue;
      const err = Math.abs(u.pct_projetado - truth);
      const key = String(u.candidato_id);
      const bucket = accum[r.bucket];
      if (!bucket[key]) bucket[key] = { sum: 0, n: 0 };
      bucket[key].sum += err;
      bucket[key].n += 1;
    }
  }

  const out: Record<Bucket, Record<string, number>> = {
    "15min": {},
    "30min": {},
    "1h": {},
    "2h": {},
    final: {},
  };
  for (const b of Object.keys(accum) as Bucket[]) {
    for (const cand of Object.keys(accum[b])) {
      const cell = accum[b][cand];
      if (cell && cell.n > 0) out[b][cand] = cell.sum / cell.n;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// INSTRUMENTAÇÃO ad hoc (model-validator, 2026-09-08) — breakdown por UF.
// NÃO faz parte do contrato oficial de ReplayReport; escrito num arquivo
// separado em build/ só para diagnosticar a causa remanescente do gate
// OT-4 (MAE@1h) depois do fix de eleitorado (2a6298a). Não usado por
// nenhum consumidor downstream — seguro de remover depois da investigação.
// ---------------------------------------------------------------------------

interface UfErrorRow {
  uf: string;
  candidato_id: string;
  err_pp: number;
  pct_projetado_pp: number;
  truth_pp: number;
  pct_apurado: number;
}

function computeUfBreakdown(
  results: TimestepResult[],
  groundTruth: Record<string, Record<string, number>>,
): Record<Bucket, UfErrorRow[]> {
  const out: Record<Bucket, UfErrorRow[]> = {
    "15min": [],
    "30min": [],
    "1h": [],
    "2h": [],
    final: [],
  };
  for (const r of results) {
    for (const u of r.uf_projections) {
      const truth = groundTruth[u.uf]?.[String(u.candidato_id)];
      if (truth === undefined) continue;
      out[r.bucket].push({
        uf: u.uf,
        candidato_id: String(u.candidato_id),
        err_pp: (u.pct_projetado - truth) * 100,
        pct_projetado_pp: u.pct_projetado * 100,
        truth_pp: truth * 100,
        pct_apurado: u.pct_apurado,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cobertura do IC95 — OT-4 redefinido (Fase 5, plano § E): além do MAE, o
// intervalo [lower, upper] devolvido pelo bootstrap precisa CONTER o valor
// real de 2022 em >= 90% dos pares (UF, candidato) — senão o CI está
// sistematicamente estreito demais (overconfidence) mesmo quando o ponto
// central está ok.
// ---------------------------------------------------------------------------

function computeCiCoverage(
  results: TimestepResult[],
  groundTruth: Record<string, Record<string, number>>,
): Record<Bucket, { coverage: number; n: number }> {
  const accum: Record<Bucket, { hit: number; total: number }> = {
    "15min": { hit: 0, total: 0 },
    "30min": { hit: 0, total: 0 },
    "1h": { hit: 0, total: 0 },
    "2h": { hit: 0, total: 0 },
    final: { hit: 0, total: 0 },
  };

  for (const r of results) {
    for (const u of r.uf_projections) {
      const truth = groundTruth[u.uf]?.[String(u.candidato_id)];
      if (truth === undefined) continue;
      const bucket = accum[r.bucket];
      bucket.total += 1;
      if (truth >= u.pct_projetado_lower && truth <= u.pct_projetado_upper) {
        bucket.hit += 1;
      }
    }
  }

  const out: Record<Bucket, { coverage: number; n: number }> = {
    "15min": { coverage: 0, n: 0 },
    "30min": { coverage: 0, n: 0 },
    "1h": { coverage: 0, n: 0 },
    "2h": { coverage: 0, n: 0 },
    final: { coverage: 0, n: 0 },
  };
  for (const b of Object.keys(accum) as Bucket[]) {
    const cell = accum[b];
    out[b] = { coverage: cell.total > 0 ? cell.hit / cell.total : 0, n: cell.total };
  }
  return out;
}

function computeCalibration(
  results: TimestepResult[],
  groundTruth: Record<string, Record<string, number>>,
): ReplayReport["calibration"] {
  // Buckets de 0.1 em [0,1]. Para cada timestep "final", olhamos p_vitoria
  // do candidato A (menor id) e se ele DE FATO venceu (maior pct em
  // ground_truth nacional ponderado — aqui simplificamos: maior soma de pct
  // entre UFs).
  // Heurística suficiente pro smoke; T22 pode refinar.
  const bins = new Map<number, { wins: number; total: number }>();
  const finals = results.filter((r) => r.bucket === "final");

  for (const r of finals) {
    // S05 carry-over → S06/F4d Fase 5: usa `candidato_a_id` semântico
    // (líder real) em vez de `candidatos[0]` (que vem sorted por id ASC do
    // Python — não pelo rank). Antes, em corridas multi-candidato, candA
    // podia ser o candidato de menor id (ex.: 13/PT) mesmo quando o líder
    // projetado era outro — quebrando a comparação `aWon = candA.id === winnerId`
    // de forma silenciosa (`p_vitoria` continuava sendo do "candA por id",
    // que NÃO necessariamente é o líder). Fallback pra candidatos[0] mantém
    // compat com report.json gerados pré-Fase 5.
    const candAId = r.national.candidato_a_id;
    const candA =
      candAId != null
        ? (r.national.candidatos.find((c) => c.id === candAId) ?? r.national.candidatos[0])
        : r.national.candidatos[0];
    if (!candA) continue;
    // Quem venceu de fato? Soma pct_final por candidato (proxy nacional).
    const totals = new Map<number, number>();
    for (const uf of Object.keys(groundTruth)) {
      const ufRow = groundTruth[uf];
      if (!ufRow) continue;
      for (const candKey of Object.keys(ufRow)) {
        const v = ufRow[candKey];
        if (v === undefined) continue;
        const id = Number(candKey);
        totals.set(id, (totals.get(id) ?? 0) + v);
      }
    }
    let winnerId = -1;
    let winnerPct = -1;
    for (const [id, pct] of totals.entries()) {
      if (pct > winnerPct) {
        winnerPct = pct;
        winnerId = id;
      }
    }
    const aWon = candA.id === winnerId;
    const bucket = Math.round(candA.p_vitoria * 10) / 10; // 0.0, 0.1, ..., 1.0
    const cur = bins.get(bucket) ?? { wins: 0, total: 0 };
    cur.total += 1;
    if (aWon) cur.wins += 1;
    bins.set(bucket, cur);
  }

  const out: ReplayReport["calibration"] = [];
  for (const [b, v] of [...bins.entries()].sort((a, z) => a[0] - z[0])) {
    out.push({
      predicted_p_win_bucket: b,
      actual_win_rate: v.total > 0 ? v.wins / v.total : 0,
      n: v.total,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface CliArgs {
  selfTest: boolean;
  datasetPath: string | null;
  groundTruthPath: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    selfTest: false,
    datasetPath: null,
    groundTruthPath: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--self-test") out.selfTest = true;
    else if (a === "--dataset") {
      i += 1;
      out.datasetPath = argv[i] ?? null;
    } else if (a === "--ground-truth") {
      i += 1;
      out.groundTruthPath = argv[i] ?? null;
    }
  }
  return out;
}

async function loadDataset(datasetPath: string, groundTruthPath: string): Promise<BatchPayload> {
  const [datasetRaw, gtRaw] = await Promise.all([
    readFile(datasetPath, "utf8"),
    readFile(groundTruthPath, "utf8"),
  ]);
  const dataset = JSON.parse(datasetRaw) as Omit<BatchPayload, "ground_truth">;
  const ground_truth = JSON.parse(gtRaw) as BatchPayload["ground_truth"];
  return { ...dataset, ground_truth };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const t0 = Date.now();

  let payload: BatchPayload;
  let source: string;
  if (args.selfTest) {
    payload = buildSelfTestDataset();
    source = "self-test-mock";
    console.log("[replay-2022] self-test mode (mock dataset, 2 UFs × 3 timesteps)");
  } else if (args.datasetPath && args.groundTruthPath) {
    payload = await loadDataset(args.datasetPath, args.groundTruthPath);
    source = `file:${args.datasetPath}`;
    console.log(
      `[replay-2022] dataset: ${args.datasetPath} (${payload.timesteps.length} timesteps)`,
    );
  } else {
    console.error("[replay-2022] uso: --self-test | --dataset <path> --ground-truth <path>");
    process.exit(2);
  }

  console.log(`[replay-2022] enviando ${payload.timesteps.length} timesteps para python...`);
  const response = await runPythonBatch(payload);
  const wallMs = Date.now() - t0;

  const mae = computeMae(response.results, payload.ground_truth);
  const ciCoverageByTimePoint = computeCiCoverage(response.results, payload.ground_truth);
  const calibration = computeCalibration(response.results, payload.ground_truth);

  const ufs = [
    ...new Set(payload.eleitorado.map((e) => e.uf).concat(payload.historical.map((h) => h.uf))),
  ].sort();
  const nZones = new Set(payload.eleitorado.map((e) => `${e.uf}-${e.cod_zona}`)).size;

  const report: ReplayReport = {
    ran_at: new Date().toISOString(),
    dataset: { source, ufs, n_zones: nZones },
    n_timesteps: payload.timesteps.length,
    wall_time_ms: wallMs,
    maeByTimePoint: mae,
    ciCoverageByTimePoint,
    calibration,
    notes: args.selfTest
      ? "self-test mode — mock dataset. OT-4 gate roda em modo real (T21 → T22)."
      : "replay 2022 real (Fase 5, não-tautológico). Gate OT-4: MAE@1h por candidato < 2pp E cobertura IC95@1h >= 90% (RNF-006, docs/_meta/plano-modelo-regra-de-tres-2026-09-05.md § E). MAE@15min é informativo, sem gate.",
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = resolve(process.cwd(), "build", "replay-2022", stamp);
  await mkdir(outDir, { recursive: true });
  const outPath = resolve(outDir, "report.json");
  await writeFile(outPath, JSON.stringify(report, null, 2), "utf8");

  // Instrumentação ad hoc (model-validator, 2026-09-08) — ver nota acima
  // de computeUfBreakdown. Arquivo à parte, fora do contrato oficial.
  const ufBreakdown = computeUfBreakdown(response.results, payload.ground_truth);
  const breakdownPath = resolve(outDir, "uf-breakdown.json");
  await writeFile(breakdownPath, JSON.stringify(ufBreakdown, null, 2), "utf8");
  console.log(`[replay-2022] uf-breakdown: ${breakdownPath}`);

  console.log(`[replay-2022] report: ${outPath} (${(wallMs / 1000).toFixed(1)}s)`);
  console.log(`[replay-2022] MAE@15min: ${JSON.stringify(mae["15min"])}`);
  console.log(`[replay-2022] MAE@1h: ${JSON.stringify(mae["1h"])}`);
  console.log(
    `[replay-2022] cobertura IC95@1h: ${(ciCoverageByTimePoint["1h"].coverage * 100).toFixed(1)}% (n=${ciCoverageByTimePoint["1h"].n})`,
  );
}

main().catch((err) => {
  console.error("[replay-2022] falha:", err);
  process.exit(1);
});
