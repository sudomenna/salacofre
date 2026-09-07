// scripts/build-replay-fixtures.ts
//
// T21 — Gerador do dataset de replay 2022 (spec 002, Fase 7).
// REESCRITO (Fase 5, plano `docs/_meta/plano-modelo-regra-de-tres-2026-09-05.md`
// § "E. Replay — regenerar não-tautológico (sem download)") para deixar de ser
// tautológico e voltar a exercitar de verdade o gate OT-4.
//
// Por que existe:
//   O replay 2022 (scripts/replay-2022.ts — T20) precisa reproduzir uma timeline
//   cronológica de apuração e comparar a projeção do modelo contra o resultado
//   final 2022. Os snapshots zona-a-zona reais sumiram do CDN do TSE
//   (documentado em S02). Como fallback pragmático, sintetizamos uma timeline
//   a partir do consolidado final de historical_results 2022.
//
// O QUE MUDOU NESTA REESCRITA (era tautológico antes):
//   A versão original (T21, 17/05) fazia cada zona "apurar" 100% de uma vez
//   em um T_zona ∈ [1,30] sorteado UNIFORMEMENTE, e o payload era achatado
//   `{cand:[{n,pvap}]}` — sem `e`/`v`/`s`. Isso tinha DOIS problemas:
//     1. O payload achatado não tem os campos que a extrapolação por regra
//        de três (`api/model/extrapolation.py`, plano § A) precisa (`e.te`,
//        `e.esi`, `v.vvc`, `cand[].vap`) — `_extract_zone_candidatos`
//        devolve `None` para todo snapshot achatado, então o gate rodava
//        sobre ZERO zonas (`MAE@1h: {}`).
//     2. Mesmo corrigindo o payload, apurar 100% de uma zona de uma vez faz
//        `k = te/esi = 1` sempre — a extrapolação nunca extrapola nada, e a
//        ordem de sorteio uniforme não introduz nenhum viés de composição.
//        Qualquer timestep intermediário seria uma AMOSTRA ALEATÓRIA não
//        enviesada do resultado final — o que faz a projeção convergir
//        estatisticamente ao gabarito por construção, não por o modelo ser
//        bom. MAE@1h ficava artificialmente baixo (0,998pp) e não provava
//        nada sobre a acurácia real do modelo.
//
//   Esta versão gera, por zona, um envelope EA20 REAL (`carg[].agr[].par[].
//   cand[]` + `e`/`v`/`s` de raiz) e simula:
//     (a) Ordem de apuração ENVIESADA por tamanho da zona (`te`, eleitores
//         aptos) — zonas maiores relatam preferencialmente mais cedo — MAIS
//         atraso regional fixo p/ Norte/Nordeste. Isso reproduz viés de
//         composição real (o modelo vê uma amostra NÃO representativa da
//         população em t baixo).
//     (b) Apuração PROGRESSIVA intra-zona — cada zona passa por frações
//         f ∈ {0,25; 0,5; 0,75; 1,0} antes de fechar, exercitando de verdade
//         o fator de escala `k(z) = te/esi(z) = 1/f` e o caso de borda
//         `vvc = 0` (zonas pequenas em f=0,25 podem arredondar para 0 votos
//         válidos).
//
//   Resultado esperado: MAE@1h MAIOR que os 0,998pp tautológicos — isso é o
//   gate ficando honesto, não o modelo piorando. Não ajustar os parâmetros
//   de viés/ruído abaixo para "melhorar" o MAE artificialmente.
//
// Contrato (lido de scripts/replay-2022.ts — T20):
//
//   snapshots.json:
//     {
//       "historical":  HistoricalRow[],     // todos os candidatos × zonas 2022
//       "eleitorado":  EleitoradoRow[],     // peso por zona (RF-008, 2026)
//       "timesteps":   TimestepInput[]      // um por bucket (15min, 30min, 1h, 2h, final)
//     }
//     Onde TimestepInput = { cargo, turno, trigger_ts, bucket, snapshots[] }
//     e snapshots[] = lista cumulativa de zonas com T_zona ≤ timestep_atual,
//     cada uma com o envelope EA20 completo escalado pela fração `f`
//     corrente (ver `buildSnapshotAt`).
//
//   ground-truth.json:
//     { [uf: string]: { [candidato_id: string]: number } }   // pct_final ∈ [0,1]
//     INALTERADO — segue vindo de `votos_2022` agregados por UF (item 4 do
//     contrato da Fase 5); o gabarito nunca muda, só a simulação de
//     apuração parcial que o modelo vê no caminho.
//
// Fórmulas do envelope sintético por zona (contrato da Fase 5, taxas
// nacionais do 1º turno 2022 documentadas no plano):
//   vv = vvc = Σ votos_c(z)                     (2022 real, por candidato)
//   c        = round(vv / (1 − 0,0457))         (comparecimento, taxa branco+nulo nacional)
//   vb       = round(0,0159 · c)                 (brancos)
//   tvn      = round(0,0298 · c)                 (nulos)
//   te       = max(w_2026(z), round(c / (1 − 0,2095)))   (aptos; taxa de abstenção nacional)
//   esi(f)   = round(te · f)                     (esi = te em f=1,0 — apuração completa)
// Na fração `f` da apuração: `esi`, `c`, `vvc`, `vv`, `vb`, `tvn`, `vap_c`
// escalam por `f`; `te` NÃO escala (é o eleitorado total da zona, fixo).
// `van = vansj = 0` sempre (não simulado — fora de escopo desta tarefa).
//
// Ordem de apuração enviesada:
//   Rank nacional de `te` (decrescente) → fração de rank `r ∈ [0,1]` (0 =
//   maior `te`). `T_base = 1 + round((r + jitter) · (BASE_MAX_T − 1))`, com
//   jitter triangular (±0,5, seed determinístico) escalado por 0,6 — mantém
//   ruído genuíno sem apagar o viés. Delay fixo `+3` para UFs de
//   Norte/Nordeste. `T_zona = clamp(T_base + delay, 1, BASE_MAX_T + 3)`.
//   Apuração completa (`f=1,0`) em `T_zona + 3` → timestep máximo
//   `BASE_MAX_T + 3 + 3 = 30`, alinhado com os buckets abaixo (2h/final em
//   t=30 continuam vendo 100% das zonas).
//
// Decisões documentadas (mantidas de T21, ainda válidas):
//   - Cargo=1, Turno=1 (Presidente 2022, 1º turno).
//   - 5 buckets: 15min, 30min, 1h, 2h, final — mapeados para os mesmos
//     timesteps-alvo de sempre (4, 7, 15, 30, 30); a % real de cobertura em
//     cada bucket agora É MEDIDA (logada), não assumida a priori.
//   - Eleitorado: tabela só tem 2026 — usado como `w_2026(z)` acima e como
//     peso de agregação (`eleitorado` de saída, campo usado por
//     `compute_uf_projections`), inalterado desta reescrita.
//   - Filtro `uf <> 'ZZ'` (lição S02 — exterior).
//   - SEED determinístico: 0x5A1AC0F2E2026 (mesma constante — mais draws de
//     RNG por zona agora, mas o stream de `mulberry32` continua
//     determinístico bit-a-bit: rodar 2x → diff zero).
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
const CARGO = 1;
const TURNO = 1;
const ANO = 2022;
const ELEITORADO_ANO = 2026; // proxy — tabela não tem 2022

// Taxas nacionais do 1º turno 2022 (contrato da Fase 5 — não recalibrar
// "pra melhorar o MAE"; são constantes documentadas no plano).
const BLANK_NULL_RATE = 0.0457; // (vb + tvn) / c
const VB_RATE = 0.0159; // brancos / c
const TVN_RATE = 0.0298; // nulos / c
const ABSTENCAO_RATE = 0.2095; // a / te

// Cronograma de apuração enviesado.
const BASE_MAX_T = 24; // faixa de T_base antes do delay regional
const REGIONAL_DELAY = 3; // Norte/Nordeste relatam 3 timesteps mais tarde
const JITTER_SCALE = 0.6; // espalha o rank sem apagar o viés
const INTRA_ZONA_FRACOES = [0.25, 0.5, 0.75, 1.0] as const; // offsets 0..3 de T_zona
const MAX_TIMESTEP = BASE_MAX_T + REGIONAL_DELAY + (INTRA_ZONA_FRACOES.length - 1); // 30

const NORTE = new Set(["AC", "AP", "AM", "PA", "RO", "RR", "TO"]);
const NORDESTE = new Set(["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"]);

function regionDelay(uf: string): number {
  return NORTE.has(uf) || NORDESTE.has(uf) ? REGIONAL_DELAY : 0;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

// Buckets espelhando scripts/replay-2022.ts (T20). Timesteps-alvo mantidos
// idênticos a T21 — o que muda é COMO cada zona chega a cada timestep
// (progressivamente, não instantaneamente).
const BUCKETS: Array<{
  bucket: "15min" | "30min" | "1h" | "2h" | "final";
  timestep: number;
  trigger_ts: string;
}> = [
  { bucket: "15min", timestep: 4, trigger_ts: "2022-10-02T20:15:00Z" },
  { bucket: "30min", timestep: 7, trigger_ts: "2022-10-02T20:30:00Z" },
  { bucket: "1h", timestep: 15, trigger_ts: "2022-10-02T21:00:00Z" },
  { bucket: "2h", timestep: MAX_TIMESTEP, trigger_ts: "2022-10-02T22:00:00Z" },
  { bucket: "final", timestep: MAX_TIMESTEP, trigger_ts: "2022-10-02T23:30:00Z" },
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

interface CandOut {
  n: number;
  vap: number;
  pvap: number;
}

interface ParOut {
  sg: string | null;
  cand: CandOut[];
}

interface EnvelopePayload {
  carg: Array<{ cd: number; agr: Array<{ par: ParOut[] }> }>;
  e: { te: number; esi: number; c: number; a: number };
  v: { vvc: number; vv: number; vb: number; tvn: number; van: 0; vansj: 0 };
  s: { psa: number };
}

interface SnapshotOut {
  uf: string;
  cod_zona: number;
  pct_apurado: number;
  payload: EnvelopePayload;
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
// Modelo de zona — pré-computa contagens "cheias" (f=1,0) + cronograma.
// ---------------------------------------------------------------------------

interface ZoneModel {
  uf: string;
  cod_zona: number;
  votosByCand: Map<number, number>; // 2022 real, absoluto
  partidoByCand: Map<number, string | null>;
  vvFull: number;
  cFull: number;
  vbFull: number;
  tvnFull: number;
  teFull: number;
  tZona: number; // preenchido depois do sorteio
}

function buildZoneModels(
  historical: HistoricalRowDb[],
  eleitoradoByZone: Map<string, number>,
): ZoneModel[] {
  const byZone = new Map<string, { uf: string; cod_zona: number; rows: HistoricalRowDb[] }>();
  for (const h of historical) {
    const key = `${h.uf}:${h.cod_zona}`;
    let bucket = byZone.get(key);
    if (!bucket) {
      bucket = { uf: h.uf, cod_zona: h.cod_zona, rows: [] };
      byZone.set(key, bucket);
    }
    bucket.rows.push(h);
  }

  const sortedKeys = Array.from(byZone.keys()).sort();
  const models: ZoneModel[] = [];
  for (const key of sortedKeys) {
    const zone = byZone.get(key);
    if (!zone) continue;
    const votosByCand = new Map<number, number>();
    const partidoByCand = new Map<number, string | null>();
    for (const r of zone.rows) {
      votosByCand.set(r.cod_candidato, (votosByCand.get(r.cod_candidato) ?? 0) + Number(r.votos));
      partidoByCand.set(r.cod_candidato, r.partido);
    }
    let vvFull = 0;
    for (const v of votosByCand.values()) vvFull += v;
    if (vvFull <= 0) continue; // mesmo filtro de T21 — zona sem voto útil

    const cFull = Math.round(vvFull / (1 - BLANK_NULL_RATE));
    const vbFull = Math.round(cFull * VB_RATE);
    const tvnFull = Math.round(cFull * TVN_RATE);
    const w2026 = eleitoradoByZone.get(key) ?? 0;
    const teFull = Math.max(w2026, Math.round(cFull / (1 - ABSTENCAO_RATE)));

    models.push({
      uf: zone.uf,
      cod_zona: zone.cod_zona,
      votosByCand,
      partidoByCand,
      vvFull,
      cFull,
      vbFull,
      tvnFull,
      teFull,
      tZona: 0,
    });
  }
  return models;
}

/** Sorteia T_zona por modelo, IN-PLACE, na ordem em que `models` já está
 * (chaves ordenadas — reprodutibilidade bit-a-bit). Rank nacional de `te`
 * decrescente → viés de composição; jitter triangular via RNG seedado;
 * delay fixo para Norte/Nordeste. */
function assignTZona(models: ZoneModel[], rng: () => number): void {
  const byTeDesc = [...models].sort((a, b) => b.teFull - a.teFull);
  const fracRankByKey = new Map<string, number>();
  const n = byTeDesc.length;
  byTeDesc.forEach((z, i) => {
    const frac = n > 1 ? i / (n - 1) : 0;
    fracRankByKey.set(`${z.uf}:${z.cod_zona}`, frac);
  });

  for (const z of models) {
    const key = `${z.uf}:${z.cod_zona}`;
    const fracRank = fracRankByKey.get(key) ?? 0.5;
    const u1 = rng();
    const u2 = rng();
    const jitter = (u1 + u2) / 2 - 0.5; // triangular em [-0.5, 0.5], média 0
    const frac = clamp(fracRank + jitter * JITTER_SCALE, 0, 1);
    const tBase = 1 + Math.round(frac * (BASE_MAX_T - 1));
    z.tZona = clamp(tBase + regionDelay(z.uf), 1, BASE_MAX_T + REGIONAL_DELAY);
  }
}

/** Envelope EA20 real da zona no timestep-alvo, escalado pela fração `f`
 * de apuração progressiva intra-zona. `null` se a zona ainda não começou
 * a apurar nesse timestep (`bucketTimestep < T_zona`). */
function buildSnapshotAt(z: ZoneModel, bucketTimestep: number): SnapshotOut | null {
  if (bucketTimestep < z.tZona) return null;
  const elapsed = bucketTimestep - z.tZona;
  const f = elapsed >= INTRA_ZONA_FRACOES.length - 1 ? 1.0 : (INTRA_ZONA_FRACOES[elapsed] ?? 1.0);

  const esi = Math.round(z.teFull * f);
  const c = Math.round(z.cFull * f);
  const vvc = Math.round(z.vvFull * f);
  const vv = vvc;
  const vb = Math.round(z.vbFull * f);
  const tvn = Math.round(z.tvnFull * f);
  const a = Math.max(0, esi - c);
  const psa = Number((f * 100).toFixed(4));

  // Agrupa candidatos por partido (fidelidade ao envelope real; não usado
  // pelo pipeline de extrapolação, que só lê `cand[].n`/`vap`).
  const parOrder: string[] = [];
  const parByPartido = new Map<string, CandOut[]>();
  for (const [cod, votosFull] of z.votosByCand.entries()) {
    const partido = z.partidoByCand.get(cod) ?? null;
    const groupKey = partido ?? "__SEM_PARTIDO__";
    let group = parByPartido.get(groupKey);
    if (!group) {
      group = [];
      parByPartido.set(groupKey, group);
      parOrder.push(groupKey);
    }
    const vap = Math.round(votosFull * f);
    const pvap = vvc > 0 ? Number(((vap / vvc) * 100).toFixed(4)) : 0;
    group.push({ n: cod, vap, pvap });
  }
  const parList: ParOut[] = parOrder.map((groupKey) => ({
    sg: groupKey === "__SEM_PARTIDO__" ? null : groupKey,
    cand: parByPartido.get(groupKey) ?? [],
  }));

  return {
    uf: z.uf,
    cod_zona: z.cod_zona,
    pct_apurado: psa,
    payload: {
      carg: [{ cd: CARGO, agr: [{ par: parList }] }],
      e: { te: z.teFull, esi, c, a },
      v: { vvc, vv, vb, tvn, van: 0, vansj: 0 },
      s: { psa },
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const t0 = Date.now();
  console.log("[build-replay-fixtures] T21/Fase-5 — dataset replay 2022 (não-tautológico)");
  console.log(
    `  cargo=${CARGO} turno=${TURNO} ano=${ANO} max_timestep=${MAX_TIMESTEP} seed=0x${SEED_HEX}`,
  );

  // 1. DB
  console.log("[1/6] lendo historical_results + eleitorado …");
  const { historical, eleitorado } = await fetchAll();
  console.log(`      historical=${historical.length} rows · eleitorado=${eleitorado.length} zonas`);

  const eleitoradoByZone = new Map<string, number>();
  for (const e of eleitorado) {
    eleitoradoByZone.set(`${e.uf}:${e.cod_zona}`, Number(e.eleitores_aptos));
  }

  // 2. Modelo por zona (contagens "cheias" derivadas das taxas nacionais).
  console.log("[2/6] modelando zonas (envelope EA20 sintético, taxas nacionais 1T 2022) …");
  const zoneModels = buildZoneModels(historical, eleitoradoByZone);
  console.log(`      ${zoneModels.length} zonas úteis (vv > 0)`);

  // 3. Cronograma de apuração — rank por `te` + jitter + delay regional.
  console.log("[3/6] sorteando T_zona (viés de composição + atraso regional) …");
  const rng = mulberry32(seedFromHex(SEED_HEX));
  assignTZona(zoneModels, rng);

  const histDist = new Array(BASE_MAX_T + REGIONAL_DELAY + 1).fill(0);
  for (const z of zoneModels) histDist[z.tZona]++;
  const histSummary = histDist
    .map((c, i) => (i >= 1 && c > 0 ? `t${i}=${c}` : ""))
    .filter(Boolean)
    .join(" ");
  console.log(`      distribuição de T_zona: ${histSummary}`);
  const nNorteNordeste = zoneModels.filter((z) => regionDelay(z.uf) > 0).length;
  console.log(`      zonas com atraso regional (N/NE): ${nNorteNordeste}/${zoneModels.length}`);

  // 4. Monta timesteps[] — apuração progressiva intra-zona por bucket.
  console.log("[4/6] montando timesteps com apuração progressiva …");
  const timesteps: TimestepInputOut[] = [];
  for (const b of BUCKETS) {
    const snapshots: SnapshotOut[] = [];
    for (const z of zoneModels) {
      const snap = buildSnapshotAt(z, b.timestep);
      if (snap) snapshots.push(snap);
    }
    const avgPct =
      snapshots.length > 0
        ? snapshots.reduce((acc, s) => acc + s.pct_apurado, 0) / snapshots.length
        : 0;
    timesteps.push({
      cargo: CARGO,
      turno: TURNO,
      trigger_ts: b.trigger_ts,
      bucket: b.bucket,
      snapshots,
    });
    console.log(
      `      bucket=${b.bucket} (t=${b.timestep}): ${snapshots.length}/${zoneModels.length} zonas com dado ` +
        `(${((snapshots.length / zoneModels.length) * 100).toFixed(1)}% das zonas · média ${avgPct.toFixed(1)}% apurado dentro delas)`,
    );
  }

  // 5. Ground truth — pct_final por (uf, candidato), [0,1]. INALTERADO.
  console.log("[5/6] computando ground-truth …");
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

  // 6. Dataset final (historical + eleitorado projetados para o shape T20).
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

  // 7. Persistência.
  console.log("[6/6] gravando fixtures …");
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
  console.log(`   Zonas úteis:         ${zoneModels.length}`);
  console.log(`   Timestep máximo:     ${MAX_TIMESTEP}`);
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
