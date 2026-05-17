// scripts/replay-2022.ts
//
// T12 — Skeleton do replay 2022. O modelo estatístico real é escopo da
// spec 002 (S03). DoD da S02 (RF-005) exige apenas que este script
// COMPILE e tenha a forma certa.
//
// Comportamento:
// 1. Lê snapshots da tabela `snapshots` em ordem cronológica (ts ASC).
//    Em S02 a tabela ainda está vazia para 2022 (será populada via
//    pipeline real ou seed externo). Script tolera 0 linhas.
// 2. Para cada snapshot, chama `runModel(snapshot)` — placeholder que
//    apenas loga `[t=... uf=... zona=... cargo=... pct=...]`.
//    Em S03 o `runModel` será substituído pela chamada Python /api/model/project.
// 3. Escreve relatório em `build/replay-2022/<timestamp>/report.json` com
//    o shape de MAE esperado (model-validator OT-4 vai validar em S03).
//
// Uso:
//   set -a && . ./.env.local && set +a
//   pnpm tsx scripts/replay-2022.ts

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { asc } from "drizzle-orm";
import { db, schema } from "../lib/db";

interface Snapshot {
  id: bigint;
  ts: Date;
  cargo: number;
  turno: number;
  uf: string;
  codZona: number;
  pctApurado: string | null;
  votosTotal: number | null;
  hashPayload: string;
}

interface ReplayReport {
  ranAt: string;
  ano: 2022;
  snapshotsRead: number;
  // Forma do relatório de MAE (preenchida pelo model-validator em S03).
  // Mantemos os campos presentes com `null` para que o consumer compile
  // contra a mesma interface antes de o modelo existir.
  maeByCandidate: Record<string, null> | null;
  maeByTimePoint: {
    t15min: number | null;
    t30min: number | null;
    t1h: number | null;
    t2h: number | null;
    tFinal: number | null;
  };
  notes: string;
}

function runModel(s: Snapshot): void {
  // Placeholder. Spec 002 (modelo estatístico) substitui esta função.
  const ts = s.ts.toISOString();
  // biome-ignore lint/suspicious/noConsole: replay script roda em CLI
  console.log(
    `[t=${ts}] uf=${s.uf} zona=${s.codZona} cargo=${s.cargo} turno=${s.turno} pct=${s.pctApurado ?? "null"}`,
  );
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const rows = await db
    .select({
      id: schema.snapshots.id,
      ts: schema.snapshots.ts,
      cargo: schema.snapshots.cargo,
      turno: schema.snapshots.turno,
      uf: schema.snapshots.uf,
      codZona: schema.snapshots.codZona,
      pctApurado: schema.snapshots.pctApurado,
      votosTotal: schema.snapshots.votosTotal,
      hashPayload: schema.snapshots.hashPayload,
    })
    .from(schema.snapshots)
    .orderBy(asc(schema.snapshots.ts));

  // biome-ignore lint/suspicious/noConsole: replay script roda em CLI
  console.log(`[replay-2022] lendo ${rows.length} snapshots`);

  for (const r of rows) {
    runModel({
      id: r.id,
      ts: r.ts,
      cargo: r.cargo,
      turno: r.turno,
      uf: r.uf,
      codZona: r.codZona,
      pctApurado: r.pctApurado,
      votosTotal: r.votosTotal,
      hashPayload: r.hashPayload,
    });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = resolve(process.cwd(), "build", "replay-2022", stamp);
  await mkdir(outDir, { recursive: true });
  const outPath = resolve(outDir, "report.json");

  const report: ReplayReport = {
    ranAt: new Date().toISOString(),
    ano: 2022,
    snapshotsRead: rows.length,
    maeByCandidate: rows.length === 0 ? null : {},
    maeByTimePoint: {
      t15min: null,
      t30min: null,
      t1h: null,
      t2h: null,
      tFinal: null,
    },
    notes:
      "Skeleton — modelo real é escopo da spec 002 (S03). MAE preenchido pelo model-validator em OT-4 gate.",
  };

  await writeFile(outPath, JSON.stringify(report, null, 2), "utf8");

  // biome-ignore lint/suspicious/noConsole: replay script roda em CLI
  console.log(
    `[replay-2022] report: ${outPath} (${rows.length} snapshots em ${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );
}

main().catch((err) => {
  // biome-ignore lint/suspicious/noConsole: replay script roda em CLI
  console.error("[replay-2022] falha:", err);
  process.exit(1);
});
