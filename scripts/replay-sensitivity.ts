// scripts/replay-sensitivity.ts
//
// P3 — faixa de sensibilidade do gate OT-4 (ADR-0033 § "3. Calibração do gate
// OT-4", emenda do mesmo dia 2026-09-08).
//
// Por que existe: o gate OT-4 (MAE@1h < 2pp, cobertura IC95@1h >= 90%,
// RNF-006) depende de `REGIONAL_DELAY`, uma constante SINTÉTICA em
// `scripts/build-replay-fixtures.ts` que modela quantos timesteps depois
// Norte/Nordeste relatam apuração em relação ao resto do país. O dado real
// (timestamps zona-a-zona de 2022) **não existe** em nenhuma fonte pública
// verificável — verificado, não estimado (ver ADR-0033 § 3, emenda). Em vez
// de escolher um único valor de atraso e reportar um MAE único (o que seria
// inventar uma calibração que não temos), este script roda o replay sob
// VÁRIAS hipóteses de atraso {0,1,2,3} e reporta a faixa resultante.
//
// O QUE ISSO NÃO É:
//   - Não é uma calibração do modelo. Não muda `api/model/*`.
//   - Não muda o limiar do gate (2pp / 90%) nem qual delay é o oficial.
//     O gate OT-4 oficial continua sendo `REGIONAL_DELAY=3` (o default de
//     `build-replay-fixtures.ts` quando `REPLAY_REGIONAL_DELAY` não é
//     setado) — é ELE que decide o exit code deste script.
//   - Não é substituído pelos simulados oficiais do TSE (15–17/09 e
//     22–24/09/2026): esses simulados medem o atraso regional da
//     INFRAESTRUTURA DE 2026, uma coisa genuinamente diferente do atraso de
//     apuração de 2022 que o replay tenta reconstituir. Podem, no máximo,
//     dar uma segunda faixa de evidência para comparar — nunca "a resposta".
//
// Uso:
//   set -a && . ./.env.local && set +a
//   pnpm tsx scripts/replay-sensitivity.ts
//
// Efeitos:
//   - Gera, por delay ∈ {0,1,2,3}, um fixture via `build-replay-fixtures.ts`
//     (env `REPLAY_REGIONAL_DELAY=<d>`, `--out
//     build/replay-2022/snapshots-delay<d>.json`) e roda
//     `scripts/replay-2022.ts --dataset ... --ground-truth ...` sobre ele.
//   - Imprime a tabela `delay | MAE@1h PT | MAE@1h PL | cobertura IC95 |
//     veredito`.
//   - Grava `docs/testing/replay-sensitivity.md` com a tabela, data, hash do
//     commit e o parágrafo de contexto acima (o que a faixa significa / não
//     significa).
//   - Remove os fixtures e reports intermediários de `build/replay-2022/`
//     que ele mesmo gerou (disco limitado; nada em `tests/fixtures/` é
//     tocado).
//   - Exit code = veredito do delay 3 (gate oficial). Os outros 3 pontos são
//     informativos.
//
// Invoca os dois scripts via `execFileSync("pnpm", ["tsx", ...])` em vez de
// importar suas funções — mantém este script desacoplado de mudanças
// internas em `build-replay-fixtures.ts`/`replay-2022.ts` (ambos seguem
// contratos de CLI estáveis, não de API TS).

import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const DELAYS = [0, 1, 2, 3] as const;
const OFFICIAL_DELAY = 3; // gate OT-4 oficial — não mudar aqui
const MAE_THRESHOLD_PP = 2; // OT-4 (RNF-006) — intocado
const COVERAGE_THRESHOLD_PCT = 90; // OT-4 (RNF-006) — intocado

// cod_candidato de `historical_results` (não é o número de urna 13/22 — é o
// código sintético usado pela tabela; confirmado por
// `SELECT cod_candidato, partido, SUM(votos) FROM historical_results WHERE
// ano=2022 AND turno=1 AND cargo=1 GROUP BY 1,2 ORDER BY 3 DESC`: PT
// (Lula, 57.259.504 votos) = 3022113; PL (Bolsonaro, 51.072.345 votos) =
// 3022122).
const PT_CANDIDATO = "3022113"; // Lula/PT 2022
const PL_CANDIDATO = "3022122"; // Bolsonaro/PL 2022

// Pontos já medidos e registrados em ADR-0033 § 3 (2026-09-08), contra o
// fixture então vigente em tests/fixtures/replay-2022/. Usados só para
// checar reprodutibilidade nesta execução — NUNCA para ajustar nada se
// divergirem (instrução explícita: reportar a divergência com números).
const ADR_0033_REFERENCE: Partial<Record<number, { maePtPp: number; coveragePct: number }>> = {
  0: { maePtPp: 1.342, coveragePct: 93.3 },
  3: { maePtPp: 2.3623, coveragePct: 82.5 },
};
const REPRODUCIBILITY_TOLERANCE_PP = 0.05; // pp — acima disso, marca como divergente

const ROOT = process.cwd();
const BUILD_DIR = resolve(ROOT, "build", "replay-2022");
const DOC_PATH = resolve(ROOT, "docs", "testing", "replay-sensitivity.md");

interface DelayPoint {
  delay: number;
  maePtPp: number;
  maePlPp: number;
  coveragePct: number;
  coverageN: number;
  verdict: boolean;
}

function runTsx(scriptPath: string, args: string[], env: NodeJS.ProcessEnv): string {
  return execFileSync("pnpm", ["tsx", scriptPath, ...args], {
    cwd: ROOT,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"], // stdout capturado; stderr ecoado ao vivo
    maxBuffer: 1024 * 1024 * 128,
  });
}

function extractReportPath(stdout: string): string {
  const m = stdout.match(/\[replay-2022\] report: (\S+) \(/);
  if (!m?.[1]) {
    throw new Error(
      `não encontrei a linha "[replay-2022] report: <path> (...)" no stdout de replay-2022.ts. ` +
        `stdout capturado:\n${stdout}`,
    );
  }
  return m[1];
}

async function runOneDelay(delay: number): Promise<{ point: DelayPoint; reportDir: string }> {
  console.log(`\n=== delay=${delay} ===`);
  const snapshotsPath = resolve(BUILD_DIR, `snapshots-delay${delay}.json`);
  const groundPath = resolve(BUILD_DIR, `ground-truth-delay${delay}.json`);

  const buildEnv: NodeJS.ProcessEnv = {
    ...process.env,
    REPLAY_REGIONAL_DELAY: String(delay),
  };
  console.log(
    `[replay-sensitivity] gerando fixture (build-replay-fixtures.ts --out ${snapshotsPath}) …`,
  );
  runTsx("scripts/build-replay-fixtures.ts", ["--out", snapshotsPath], buildEnv);

  console.log(`[replay-sensitivity] rodando replay-2022.ts …`);
  const replayStdout = runTsx(
    "scripts/replay-2022.ts",
    ["--dataset", snapshotsPath, "--ground-truth", groundPath],
    process.env,
  );
  console.log(replayStdout);

  const reportPath = extractReportPath(replayStdout);
  const reportDir = resolve(reportPath, "..");
  const reportRaw = await readFile(reportPath, "utf8");
  const report = JSON.parse(reportRaw) as {
    maeByTimePoint: Record<string, Record<string, number>>;
    ciCoverageByTimePoint: Record<string, { coverage: number; n: number }>;
  };

  const mae1h = report.maeByTimePoint["1h"] ?? {};
  const cov1h = report.ciCoverageByTimePoint["1h"] ?? { coverage: 0, n: 0 };
  const maePtPp = (mae1h[PT_CANDIDATO] ?? Number.NaN) * 100;
  const maePlPp = (mae1h[PL_CANDIDATO] ?? Number.NaN) * 100;
  const coveragePct = cov1h.coverage * 100;

  const verdict =
    Number.isFinite(maePtPp) &&
    Number.isFinite(maePlPp) &&
    maePtPp < MAE_THRESHOLD_PP &&
    maePlPp < MAE_THRESHOLD_PP &&
    coveragePct >= COVERAGE_THRESHOLD_PCT;

  return {
    point: { delay, maePtPp, maePlPp, coveragePct, coverageN: cov1h.n, verdict },
    reportDir,
  };
}

function fmtPp(x: number): string {
  return Number.isFinite(x) ? x.toFixed(4).replace(".", ",") : "NaN";
}

function fmtPct(x: number): string {
  return Number.isFinite(x) ? x.toFixed(1).replace(".", ",") : "NaN";
}

function buildTable(points: DelayPoint[]): string {
  const header =
    "| delay | MAE@1h PT (pp) | MAE@1h PL (pp) | cobertura IC95@1h | veredito (<2pp e ≥90%) |";
  const sep = "|---|---|---|---|---|";
  const rows = points.map((p) => {
    const officialTag = p.delay === OFFICIAL_DELAY ? " **(oficial)**" : "";
    return `| ${p.delay}${officialTag} | ${fmtPp(p.maePtPp)} | ${fmtPp(p.maePlPp)} | ${fmtPct(p.coveragePct)}% (n=${p.coverageN}) | ${p.verdict ? "✅ PASS" : "❌ FAIL"} |`;
  });
  return [header, sep, ...rows].join("\n");
}

function buildReproducibilityNote(points: DelayPoint[]): string {
  const lines: string[] = [];
  for (const [delayStr, ref] of Object.entries(ADR_0033_REFERENCE)) {
    const delay = Number(delayStr);
    const p = points.find((x) => x.delay === delay);
    if (!p || !ref) continue;
    const diffPp = p.maePtPp - ref.maePtPp;
    const diverged = Math.abs(diffPp) > REPRODUCIBILITY_TOLERANCE_PP;
    lines.push(
      `- **delay=${delay}**: ADR-0033 mediu MAE@1h PT ${ref.maePtPp.toFixed(4).replace(".", ",")}pp / ` +
        `cobertura ${ref.coveragePct.toFixed(1).replace(".", ",")}% em 2026-09-08. Esta execução mediu ` +
        `${fmtPp(p.maePtPp)}pp / ${fmtPct(p.coveragePct)}% — ${
          diverged
            ? `**diverge** (Δ ${diffPp >= 0 ? "+" : ""}${diffPp.toFixed(4).replace(".", ",")}pp).`
            : "reproduz o valor de referência (dentro da tolerância)."
        }`,
    );
  }
  if (lines.length === 0) return "";
  const anyDiverged = points.some((p) => {
    const ref = ADR_0033_REFERENCE[p.delay];
    return ref && Math.abs(p.maePtPp - ref.maePtPp) > REPRODUCIBILITY_TOLERANCE_PP;
  });
  const causaNota = anyDiverged
    ? `\n\nDivergência significa que o estado do banco mudou entre a medição do ADR-0033 (2026-09-08) e esta\nexecução, **ou** que algum consumidor de \`eleitorado\`/\`historical_results\` parou de agregar\ncorretamente. Antes de confiar nesta tabela, cheque nessa ordem:\n\n1. \`SELECT COUNT(*), COUNT(DISTINCT (uf, cod_zona)) FROM eleitorado WHERE ano = 2026\` — desde a\n   migration 0006 há **uma linha por par município×zona**. Toda leitura que chaveie por\n   \`(uf, cod_zona)\` precisa de \`SUM(...) GROUP BY\`; sem isso fica com a última fatia e o peso da\n   zona sai fracionado, **sem erro**. Foi exatamente o que aconteceu em 2026-09-11 e inflou o\n   MAE@1h de 2,3623pp para 3,4636pp.\n2. \`SUM(eleitores_aptos)\` bate com o CSV de origem.\n3. \`historical_results\` não mudou de conteúdo.\n\n**Não ajuste os números para bater** — encontre a causa.`
    : "";

  return `## Reprodutibilidade contra ADR-0033\n\n${lines.join("\n")}${causaNota}\n`;
}

function gitShortSha(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    return "desconhecido";
  }
}

async function writeDoc(points: DelayPoint[]): Promise<void> {
  const now = new Date().toISOString();
  const sha = gitShortSha();
  const table = buildTable(points);
  const reproNote = buildReproducibilityNote(points);

  const body = `---
title: Faixa de sensibilidade do gate OT-4
description: MAE@1h e cobertura IC95@1h do replay 2022 sob hipóteses variadas de atraso regional (ADR-0033 D3)
status: stable
source: ADR-0033 § "3. Calibração do gate OT-4"
---

# Faixa de sensibilidade do gate OT-4 (ADR-0033 D3)

Gerado em ${now} · commit \`${sha}\` · \`pnpm tsx scripts/replay-sensitivity.ts\`.

## O que esta faixa significa

O gate OT-4 (spec 002, RNF-006: MAE@1h < 2pp E cobertura IC95@1h ≥ 90%) depende de
\`REGIONAL_DELAY\` — quantos timesteps depois Norte/Nordeste relatam apuração em relação ao resto
do país no fixture sintético de replay (\`scripts/build-replay-fixtures.ts\`). O dado real
(timestamps zona-a-zona de 2022) **não existe** em nenhuma fonte pública verificável — verificado
diretamente em 2026-09-08 (ADR-0033 § 3, emenda do mesmo dia): a URL de zona de 2022 documentada em
\`docs/PRD.md\` devolve HTTP 404, o CDN de divulgação do TSE só lista \`ele2024\`, o portal de dados
abertos bloqueia acesso automatizado, e o Wayback Machine não capturou os endpoints JSON dinâmicos.
(Os hosts não aparecem escritos aqui de propósito: \`tests/unit/tse/no-url-probing.test.ts\` varre
\`scripts/\` e só autoriza o host do TSE nas constantes de base URL — ver constituição § 1.)

Em vez de inventar um valor de atraso e reportar um MAE único como se fosse calibrado, o gate
**reporta a faixa** de MAE/cobertura sob \`REGIONAL_DELAY\` ∈ {0, 1, 2, 3} timesteps. Isso é honesto
sobre a incerteza que de fato existe.

## Tabela

${table}

${reproNote}
## O que esta faixa NÃO significa

- **Não é uma calibração do modelo.** Nenhum parâmetro de \`api/model/*\` muda entre os pontos —
  só o parâmetro sintético de atraso do fixture de teste.
- **Não muda o limiar do gate** (2pp / 90%, RNF-006) nem qual delay é o oficial. O gate OT-4 que
  bloqueia a promoção da spec 002 a \`shipped\` continua sendo o ponto \`delay=${OFFICIAL_DELAY}\`
  (o default de \`build-replay-fixtures.ts\` quando \`REPLAY_REGIONAL_DELAY\` não é setado) — os
  outros pontos são informativos, não alternativas a escolher.
- **Não é substituída pelos simulados oficiais do TSE** (15–17/09 e 22–24/09/2026). Os simulados
  medem o atraso regional da **infraestrutura de transmissão de 2026** — outra coisa,
  genuinamente diferente do atraso de apuração de 2022 que o replay tenta reconstituir. Podem, no
  máximo, oferecer uma segunda faixa de evidência (2026) para comparar contra esta (hipóteses sobre
  2022) — nunca substituir a calibração perdida.

## Cross-refs

- [ADR-0033](../architecture/adrs/0033-navegacao-moldura-persistente-paineis-home-calibracao-ot4.md)
  § "3. Calibração do gate OT-4" — decisão que este documento implementa.
- [docs/testing/replay.md](./replay.md) — protocolo do replay 2022 e do gate OT-4 oficial.
- [docs/reference/risks.md](../reference/risks.md) — risco do OT-4.
- \`scripts/build-replay-fixtures.ts\` — gera o fixture sintético; \`REPLAY_REGIONAL_DELAY\` e
  \`--out\` existem só para esta faixa.
- \`scripts/replay-2022.ts\` — roda o replay contra um fixture já gerado; inalterado por esta tarefa.
`;

  await writeFile(DOC_PATH, body, "utf8");
}

async function cleanup(reportDirs: string[]): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const delay of DELAYS) {
    jobs.push(
      rm(resolve(BUILD_DIR, `snapshots-delay${delay}.json`), { force: true }),
      rm(resolve(BUILD_DIR, `ground-truth-delay${delay}.json`), { force: true }),
    );
  }
  for (const dir of reportDirs) {
    jobs.push(rm(dir, { recursive: true, force: true }));
  }
  await Promise.all(jobs);
}

async function main(): Promise<void> {
  const t0 = Date.now();
  console.log("[replay-sensitivity] faixa de sensibilidade do gate OT-4 (ADR-0033 D3)");
  console.log(`  delays a testar: ${DELAYS.join(", ")} (oficial: ${OFFICIAL_DELAY})`);

  const points: DelayPoint[] = [];
  const reportDirs: string[] = [];
  for (const delay of DELAYS) {
    const { point, reportDir } = await runOneDelay(delay);
    points.push(point);
    reportDirs.push(reportDir);
  }

  console.log("\n=== Tabela final ===");
  console.log(buildTable(points));

  console.log("\n[replay-sensitivity] gravando docs/testing/replay-sensitivity.md …");
  await writeDoc(points);

  console.log(
    "[replay-sensitivity] limpando fixtures/reports intermediários de build/replay-2022/ …",
  );
  await cleanup(reportDirs);

  const officialPoint = points.find((p) => p.delay === OFFICIAL_DELAY);
  const wallS = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n[replay-sensitivity] tempo total: ${wallS}s`);

  if (!officialPoint) {
    console.error(
      `[replay-sensitivity] ponto oficial (delay=${OFFICIAL_DELAY}) não encontrado — falha interna.`,
    );
    process.exit(1);
  }
  console.log(
    `[replay-sensitivity] veredito (delay=${OFFICIAL_DELAY}, gate oficial): ${officialPoint.verdict ? "✅ PASS" : "❌ FAIL"} ` +
      `(MAE@1h PT ${fmtPp(officialPoint.maePtPp)}pp, PL ${fmtPp(officialPoint.maePlPp)}pp, cobertura ${fmtPct(officialPoint.coveragePct)}%)`,
  );
  process.exit(officialPoint.verdict ? 0 : 1);
}

main().catch((err) => {
  console.error("[replay-sensitivity] falha:", err);
  process.exit(1);
});
