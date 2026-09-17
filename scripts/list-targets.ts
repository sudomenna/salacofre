/**
 * scripts/list-targets.ts
 *
 * Gate (i) da Fase 2 do plano `perfeito-monte-um-plano-eventual-candle.md`:
 * prova a contagem de alvos de ingestão POR CARGO depois da migration 0006
 * (ADR-0035 D1 — `zonas` virou tabela de pares município × zona). Chama
 * `listIngestTargets` diretamente — o MESMO caminho de código que
 * `app/api/ingest/[cargo]/route.ts` usa em produção — sem tocar o CDN do
 * TSE (RF-001: nenhuma URL é requisitada aqui, só construída/contada).
 *
 * Imprime:
 *   1. Total de alvos para o (env, cargo) pedido — esperado ~6.110 (1 por
 *      linha de `zonas`, já que produção usa 1 cargo por chamada aqui).
 *   2. Pares por UF (tabela UF | pares).
 *   3. As 5 zonas (uf, cod_zona) com mais municípios distintos.
 *
 * Uso:
 *   set -a; . ./.env.local; set +a
 *   TSE_COD_ELEICAO_FEDERAL=ele2026/21270 TSE_COD_ELEICAO_ESTADUAL=ele2026/21272 \
 *     pnpm tsx scripts/list-targets.ts --env production --cargo 1
 *
 * Requer no ambiente: `DATABASE_URL` (Neon — `listIngestTargets` consulta
 * `zonas` real) e o código de eleição DO CARGO pedido — `TSE_COD_ELEICAO_FEDERAL`
 * para `--cargo 1`, `TSE_COD_ELEICAO_ESTADUAL` para 3/5/6, ou o legado
 * `TSE_COD_ELEICAO` para ambos (ADR-0044; `lib/tse/targets.ts:getCodEleicao`
 * lança se ausente). `--env preview` usa a whitelist (`TSE_TARGETS_WHITELIST`)
 * em vez de todas as UFs/zonas — não é o caminho usado para provar a
 * contagem total, mas fica disponível para diagnóstico.
 *
 * package.json não foi editado por restrição da tarefa — sugestão de script
 * (para o orquestrador adicionar quando revisar):
 *   "list-targets": "tsx scripts/list-targets.ts"
 */

import { CARGOS, type CargoTse, parseCargoSegment } from "@/lib/config/cargos";
import { listIngestTargets, type Target } from "@/lib/tse/targets";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

interface CliArgs {
  env: "preview" | "production";
  cargo?: CargoTse;
}

function parseArgs(argv: string[]): CliArgs {
  let env: "preview" | "production" = "production";
  let cargo: CargoTse | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--env") {
      const value = argv[++i];
      if (value !== "preview" && value !== "production") {
        throw new Error(`--env inválido: "${value}" — use "preview" ou "production".`);
      }
      env = value;
    } else if (arg === "--cargo") {
      const raw = argv[++i] ?? "";
      // Aceita código ou slug, derivado da tabela canônica (`lib/config/cargos.ts`)
      // — era `value !== 1 && value !== 3` hardcoded até 2026-09-11.
      const parsed = parseCargoSegment(raw);
      if (parsed === null) {
        throw new Error(
          `--cargo inválido: "${raw}" — use ${CARGOS.map((c) => `${c.cd} (${c.label})`).join(", ")}.`,
        );
      }
      cargo = parsed;
    } else {
      console.warn(`[list-targets] flag desconhecida ignorada: ${arg}`);
    }
  }

  return { env, cargo };
}

// ---------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------

function printParesPorUf(targets: Target[]): void {
  const porUf = new Map<string, number>();
  for (const t of targets) {
    if (t.nivel !== "zona") continue;
    porUf.set(t.uf, (porUf.get(t.uf) ?? 0) + 1);
  }

  const linhas = [...porUf.entries()].sort((a, b) => b[1] - a[1]);
  console.log("\nPares por UF:");
  console.log("UF | pares");
  console.log("---|------");
  for (const [uf, count] of linhas) {
    console.log(`${uf} | ${count}`);
  }
}

function printTop5ZonasComMaisMunicipios(targets: Target[]): void {
  // Chave (uf, cod_zona) → Set de municípios distintos. Como este script
  // pede um único cargo, não há duplicidade por cargo a filtrar aqui.
  const municipiosPorZona = new Map<string, Set<number>>();
  for (const t of targets) {
    if (t.nivel !== "zona") continue;
    const key = `${t.uf}:${t.codZona}`;
    const set = municipiosPorZona.get(key) ?? new Set<number>();
    set.add(t.codMunicipioTse);
    municipiosPorZona.set(key, set);
  }

  const ranking = [...municipiosPorZona.entries()]
    .map(([key, set]) => ({ key, count: set.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  console.log("\nTop 5 zonas com mais municípios:");
  console.log("uf:cod_zona | municípios distintos");
  console.log("------------|----------------------");
  for (const { key, count } of ranking) {
    console.log(`${key} | ${count}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { env, cargo } = parseArgs(process.argv.slice(2));

  console.log(`[list-targets] env=${env} cargo=${cargo ?? "(todos os ativos)"}`);

  const t0 = Date.now();
  const targets = await listIngestTargets(env, { cargo });
  const elapsedMs = Date.now() - t0;

  const porNivel = new Map<string, number>();
  for (const t of targets) {
    porNivel.set(t.nivel, (porNivel.get(t.nivel) ?? 0) + 1);
  }

  console.log(`\nTotal de alvos: ${targets.length} (consulta em ${elapsedMs}ms)`);
  console.log("Por nível:", Object.fromEntries(porNivel));

  printParesPorUf(targets);
  printTop5ZonasComMaisMunicipios(targets);
}

main().catch((err) => {
  console.error("[list-targets] falha:", err);
  process.exit(1);
});
