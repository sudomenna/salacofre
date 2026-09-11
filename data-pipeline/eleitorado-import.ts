// data-pipeline/eleitorado-import.ts
//
// Popula `eleitorado` para 2026 baseado em estimativa do TSE 2024 — fonte mais
// recente publicada. Agrega eleitores por PAR (UF, cod_municipio_tse, cod_zona).
//
// Fonte: TSE Repositório de Dados Abertos — eleitorado_locais_votacao.
//   https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_2024.zip
//
// Por que 2024 e não 2022:
// - 2024 é o ciclo mais recente publicado (eleições municipais).
// - Cadastro de zonas/eleitores muda devagar; é a melhor estimativa pré-2026.
// - Marcamos linhas com ano=2026 para sinalizar "estimativa do dia 1".
// - Em S02+ esse script será re-executado quando o TSE publicar o eleitorado 2026.
//
// Schema (lib/db/schema.ts):
//   eleitorado(ano, uf, cod_municipio_tse, cod_zona, eleitores_aptos, comparecimento_pct_historico)
//   PK = (ano, uf, cod_municipio_tse, cod_zona)  ← migration 0006 / ADR-0035 D1
//
// comparecimento_pct_historico fica NULL nesta versão (precisaria do dataset
// comparecimento_eleitorado_2022, 271MB — ficou pra S02).
//
// ─── Migration 0006 — o par é a chave ───────────────────────────────────────
//
// Até 2026-09-11 este script agregava por `${uf}|${codZona}` e guardava o
// PRIMEIRO cod_municipio_tse visto, com o comentário "zona vive em 1 município".
// A premissa é falsa: medido neste mesmo CSV (1º turno), 2.619 zonas cobrem
// 5.569 municípios em 6.085 pares, e 1.636 zonas (62,5%) tocam de 2 a 8
// municípios. O efeito era 26,1% do eleitorado sob o município errado
// (`docs/_meta/diagnostico-colapso-zona-municipio-2026-09-10.md`).
// O total por zona permanece recuperável: `SUM(...) GROUP BY uf, cod_zona`.
//
// ─── DELETE + INSERT numa transação só ──────────────────────────────────────
//
// O upsert puro deixava resíduo: chaves de uma importação anterior que não
// reaparecem sobrevivem com o valor velho (a tabela somava 723 eleitores a
// mais que o CSV). Com a chave mudando de 2.619 para 6.085 linhas, o resíduo
// deixaria as linhas velhas convivendo com as novas. Agora: uma conexão,
// `BEGIN; DELETE WHERE ano=$1; INSERT…; COMMIT` — sem janela de tabela vazia
// e sem resíduo. Qualquer erro faz ROLLBACK e a tabela fica como estava.
//
// Uso:
//   set -a && . ./.env.local && set +a
//   node --experimental-strip-types data-pipeline/eleitorado-import.ts

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CACHE_DIR,
  downloadCached,
  FIXTURES_DIR,
  getPool,
  iterCsv,
  readCsvHeader,
  toIntOrNull,
  toIntOrZero,
  unzipTo,
} from "./_tse-common.ts";

const TARGET_YEAR = 2026; // ano "estimativa"
const SOURCE_YEAR = 2024;
const BATCH_SIZE = 1000;

/** Um par (município × zona) com o eleitorado somado das suas seções. */
interface ParAgg {
  uf: string;
  cod_municipio_tse: number;
  cod_zona: number;
  eleitores: number;
}

/** Conexão dedicada (não o Pool): a importação inteira roda numa transação. */
type Client = import("@neondatabase/serverless").PoolClient;

const UPSERT_SQL = `
INSERT INTO eleitorado
  (ano, uf, cod_municipio_tse, cod_zona, eleitores_aptos, comparecimento_pct_historico)
SELECT * FROM UNNEST(
  $1::int2[],   -- ano
  $2::char(2)[],-- uf
  $3::int4[],   -- cod_municipio_tse
  $4::int4[],   -- cod_zona
  $5::int4[],   -- eleitores_aptos
  $6::numeric[] -- comparecimento_pct_historico (NULL nesta versão)
)
-- PK do par (migration 0006). O DELETE anterior já esvaziou o ano, então o
-- ON CONFLICT só existe como rede contra CSV com par duplicado.
ON CONFLICT (ano, uf, cod_municipio_tse, cod_zona)
DO UPDATE SET
  eleitores_aptos = EXCLUDED.eleitores_aptos;
`;

async function flushBatch(client: Client, rows: ParAgg[]): Promise<void> {
  if (rows.length === 0) return;
  const cols: unknown[][] = [
    rows.map(() => TARGET_YEAR),
    rows.map((r) => r.uf),
    rows.map((r) => r.cod_municipio_tse),
    rows.map((r) => r.cod_zona),
    rows.map((r) => r.eleitores),
    rows.map(() => null), // comparecimento_pct_historico
  ];
  await client.query(UPSERT_SQL, cols);
}

/**
 * CSV já extraído de uma execução anterior. O zip (≈180 MB) costuma ser
 * apagado para liberar disco enquanto o CSV extraído fica; sem esta checagem o
 * script rebaixaria isso a um download novo de centenas de MB a cada run.
 */
async function csvJaExtraido(): Promise<string | null> {
  const dir = resolve(CACHE_DIR, `eleitorado_local_votacao_${SOURCE_YEAR}`);
  if (!existsSync(dir)) return null;
  const files = (await readdir(dir)).filter((f) => f.endsWith(".csv"));
  const first = files[0];
  if (!first) return null;
  return resolve(dir, first);
}

async function tryDownload(): Promise<string | null> {
  const filename = `eleitorado_local_votacao_${SOURCE_YEAR}.zip`;
  const url = `https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/${filename}`;
  try {
    return await downloadCached(url, filename, { minBytes: 5 * 1024 * 1024 });
  } catch (err) {
    console.warn(`  [warn] download falhou: ${(err as Error).message}`);
    return null;
  }
}

/** Números do relatório final — todos derivados do agregado, nada estimado. */
interface ImportStats {
  pares: number;
  zonas: number;
  municipios: number;
  eleitores: number;
  zonasMultiMunicipio: number;
  maxMunicipiosPorZona: number;
}

async function processCsv(
  client: Client,
  csvPath: string,
  source: "tse" | "fixture",
): Promise<ImportStats> {
  const header = await readCsvHeader(csvPath);
  const required = ["NR_TURNO", "SG_UF", "CD_MUNICIPIO", "NR_ZONA", "QT_ELEITOR_SECAO"] as const;
  const idx: Record<string, number> = {};
  for (const k of required) {
    const i = header.get(k);
    if (i === undefined) {
      throw new Error(`Coluna obrigatória ausente em ${csvPath}: ${k}`);
    }
    idx[k] = i;
  }

  // Filtra NR_TURNO=1: o CSV de eleitorado por local de votação 2024 traz
  // uma linha por seção POR TURNO em que ela funcionou. Município com 2º
  // turno em 2024 (municipal) tinha a mesma seção listada duas vezes —
  // somando sem filtro, o eleitorado ficava inflado 21,8% nacionalmente e
  // de forma desigual por UF (SP 1,454×, seis UFs sem 2º turno em 1,000×).
  // Medido em 08/09 contra o CSV oficial: total 189.907.005 sem filtro,
  // 155.910.528 com NR_TURNO=1 (docs/_meta/handoff-2026-09-08.md § P0.2).
  // Agrega seção → PAR (município × zona). Brasil ≈ 6.100 pares, cabe folgado.
  const agg = new Map<string, ParAgg>();
  let total = 0;
  let skippedTurno2 = 0;
  for await (const fields of iterCsv(csvPath)) {
    total++;
    const nrTurno = toIntOrNull(fields[idx.NR_TURNO!]);
    if (nrTurno !== 1) {
      skippedTurno2++;
      continue;
    }
    const uf = (fields[idx.SG_UF!] ?? "").trim();
    const codMun = toIntOrNull(fields[idx.CD_MUNICIPIO!]);
    const codZona = toIntOrNull(fields[idx.NR_ZONA!]);
    const elt = toIntOrZero(fields[idx.QT_ELEITOR_SECAO!]);
    if (uf.length !== 2 || codMun == null || codZona == null) continue;
    // Chave do PAR — o município faz parte dela (migration 0006).
    const key = `${uf}|${codMun}|${codZona}`;
    const cur = agg.get(key);
    if (cur) {
      cur.eleitores += elt;
    } else {
      agg.set(key, {
        uf,
        cod_municipio_tse: codMun,
        cod_zona: codZona,
        eleitores: elt,
      });
    }
    if (total % 100000 === 0) {
      console.log(
        `    ... ${total.toLocaleString()} seções lidas, ${agg.size} pares até agora [${source}]`,
      );
    }
  }
  console.log(
    `  [csv done] ${csvPath.split("/").pop()} — ${total.toLocaleString()} seções lidas ` +
      `(${skippedTurno2.toLocaleString()} de 2º turno descartadas) → ${agg.size} pares`,
  );

  // ── estatísticas do agregado (antes de escrever) ──────────────────────────
  const municipiosPorZona = new Map<string, Set<number>>();
  const municipios = new Set<number>();
  let eleitores = 0;
  for (const p of agg.values()) {
    eleitores += p.eleitores;
    municipios.add(p.cod_municipio_tse);
    const zk = `${p.uf}|${p.cod_zona}`;
    const set = municipiosPorZona.get(zk);
    if (set) set.add(p.cod_municipio_tse);
    else municipiosPorZona.set(zk, new Set([p.cod_municipio_tse]));
  }
  let zonasMultiMunicipio = 0;
  let maxMunicipiosPorZona = 0;
  for (const set of municipiosPorZona.values()) {
    if (set.size > 1) zonasMultiMunicipio++;
    if (set.size > maxMunicipiosPorZona) maxMunicipiosPorZona = set.size;
  }

  // ── escrita: DELETE do ano + INSERT, tudo na mesma transação ──────────────
  const del = await client.query(`DELETE FROM eleitorado WHERE ano = $1`, [TARGET_YEAR]);
  console.log(`  [delete] linhas de ano=${TARGET_YEAR} removidas: ${del.rowCount ?? 0}`);

  let buf: ParAgg[] = [];
  for (const row of agg.values()) {
    buf.push(row);
    if (buf.length >= BATCH_SIZE) {
      await flushBatch(client, buf);
      buf = [];
    }
  }
  await flushBatch(client, buf);

  return {
    pares: agg.size,
    zonas: municipiosPorZona.size,
    municipios: municipios.size,
    eleitores,
    zonasMultiMunicipio,
    maxMunicipiosPorZona,
  };
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const pool = getPool();
  try {
    let csvPath: string | null = null;
    let source: "tse" | "fixture" = "tse";

    const extraido = await csvJaExtraido();
    if (extraido) {
      console.log(`  [cache] CSV já extraído: ${extraido}`);
    }
    const zip = extraido ? null : await tryDownload();
    if (extraido) {
      csvPath = extraido;
    } else if (zip) {
      const dir = await unzipTo(zip, `eleitorado_local_votacao_${SOURCE_YEAR}`);
      const files = (await readdir(dir)).filter((f) => f.endsWith(".csv"));
      if (files.length === 0) {
        throw new Error(`Sem CSVs em ${dir}`);
      }
      // Dataset 2024 é um único CSV BR-wide.
      csvPath = resolve(dir, files[0]!);
    } else {
      const fb = resolve(FIXTURES_DIR, "eleitorado-sample.csv");
      if (!existsSync(fb)) {
        throw new Error(`Fixture ausente: ${fb}. Crie o arquivo ou ajuste a fonte TSE.`);
      }
      csvPath = fb;
      source = "fixture";
    }

    const { rows: antes } = await pool.query<{ n: string; m: string; e: string }>(
      `SELECT COUNT(*)::text AS n,
              COUNT(DISTINCT cod_municipio_tse)::text AS m,
              COALESCE(SUM(eleitores_aptos), 0)::text AS e
         FROM eleitorado WHERE ano = $1`,
      [TARGET_YEAR],
    );
    console.log(
      `  antes: ${antes[0]?.n} linhas, ${antes[0]?.m} municípios distintos, ` +
        `${Number(antes[0]?.e ?? 0).toLocaleString("pt-BR")} eleitores`,
    );

    // Transação única: ou a tabela inteira troca, ou nada muda.
    const client = await pool.connect();
    let stats: ImportStats;
    try {
      await client.query("BEGIN");
      stats = await processCsv(client, csvPath, source);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    const { rows: depois } = await pool.query<{ n: string; m: string; z: string; e: string }>(
      `SELECT COUNT(*)::text AS n,
              COUNT(DISTINCT cod_municipio_tse)::text AS m,
              COUNT(DISTINCT (uf, cod_zona))::text AS z,
              COALESCE(SUM(eleitores_aptos), 0)::text AS e
         FROM eleitorado WHERE ano = $1`,
      [TARGET_YEAR],
    );

    console.log(`\n=== Resumo ===`);
    console.log(`  ano (target)          : ${TARGET_YEAR} (estimativa a partir de ${SOURCE_YEAR})`);
    console.log(`  fonte                 : ${source}`);
    console.log(`  pares inseridos       : ${stats.pares.toLocaleString("pt-BR")}`);
    console.log(`  zonas distintas       : ${stats.zonas.toLocaleString("pt-BR")}`);
    console.log(`  municípios distintos  : ${stats.municipios.toLocaleString("pt-BR")}`);
    console.log(`  eleitores (total)     : ${stats.eleitores.toLocaleString("pt-BR")}`);
    console.log(
      `  zonas multi-município : ${stats.zonasMultiMunicipio.toLocaleString("pt-BR")} ` +
        `(máx. ${stats.maxMunicipiosPorZona} municípios numa zona)`,
    );
    console.log(
      `  no banco              : ${depois[0]?.n} linhas, ${depois[0]?.z} zonas, ` +
        `${depois[0]?.m} municípios, ${Number(depois[0]?.e ?? 0).toLocaleString("pt-BR")} eleitores`,
    );
    console.log(`  tempo                 : ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Falha em eleitorado-import:", err);
  process.exit(1);
});
