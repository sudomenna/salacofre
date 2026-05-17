// data-pipeline/eleitorado-import.ts
//
// Popula `eleitorado` para 2026 baseado em estimativa do TSE 2024 — fonte mais
// recente publicada. Agrega eleitores por (UF, cod_municipio_tse, cod_zona).
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
//   PK = (ano, uf, cod_zona)
//
// comparecimento_pct_historico fica NULL nesta versão (precisaria do dataset
// comparecimento_eleitorado_2022, 271MB — ficou pra S02).
//
// Uso:
//   set -a && . ./.env.local && set +a
//   node --experimental-strip-types data-pipeline/eleitorado-import.ts

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
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

interface ZonaAgg {
  uf: string;
  cod_municipio_tse: number;
  cod_zona: number;
  eleitores: number;
}

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
ON CONFLICT (ano, uf, cod_zona)
DO UPDATE SET
  eleitores_aptos = EXCLUDED.eleitores_aptos,
  cod_municipio_tse = COALESCE(EXCLUDED.cod_municipio_tse, eleitorado.cod_municipio_tse);
`;

async function flushBatch(
  pool: import("@neondatabase/serverless").Pool,
  rows: ZonaAgg[],
): Promise<void> {
  if (rows.length === 0) return;
  const cols: unknown[][] = [
    rows.map(() => TARGET_YEAR),
    rows.map((r) => r.uf),
    rows.map((r) => r.cod_municipio_tse),
    rows.map((r) => r.cod_zona),
    rows.map((r) => r.eleitores),
    rows.map(() => null), // comparecimento_pct_historico
  ];
  await pool.query(UPSERT_SQL, cols);
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

async function processCsv(
  pool: import("@neondatabase/serverless").Pool,
  csvPath: string,
  source: "tse" | "fixture",
): Promise<number> {
  const header = await readCsvHeader(csvPath);
  const required = ["SG_UF", "CD_MUNICIPIO", "NR_ZONA", "QT_ELEITOR_SECAO"];
  const idx: Record<string, number> = {};
  for (const k of required) {
    const i = header.get(k);
    if (i === undefined) {
      throw new Error(`Coluna obrigatória ausente em ${csvPath}: ${k}`);
    }
    idx[k] = i;
  }

  // Agrega secao → zona em memória (Brasil ≈ 3000 zonas, cabe folgado).
  const agg = new Map<string, ZonaAgg>();
  let total = 0;
  for await (const fields of iterCsv(csvPath)) {
    total++;
    const uf = (fields[idx.SG_UF!] ?? "").trim();
    const codMun = toIntOrNull(fields[idx.CD_MUNICIPIO!]);
    const codZona = toIntOrNull(fields[idx.NR_ZONA!]);
    const elt = toIntOrZero(fields[idx.QT_ELEITOR_SECAO!]);
    if (uf.length !== 2 || codMun == null || codZona == null) continue;
    const key = `${uf}|${codZona}`;
    const cur = agg.get(key);
    if (cur) {
      cur.eleitores += elt;
      // mantém o primeiro cod_municipio_tse visto (zona vive em 1 município).
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
        `    ... ${total.toLocaleString()} seções lidas, ${agg.size} zonas até agora [${source}]`,
      );
    }
  }
  console.log(
    `  [csv done] ${csvPath.split("/").pop()} — ${total.toLocaleString()} seções → ${agg.size} zonas`,
  );

  // Flush em batches.
  let buf: ZonaAgg[] = [];
  for (const row of agg.values()) {
    buf.push(row);
    if (buf.length >= BATCH_SIZE) {
      await flushBatch(pool, buf);
      buf = [];
    }
  }
  await flushBatch(pool, buf);
  return agg.size;
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const pool = getPool();
  try {
    let csvPath: string | null = null;
    let source: "tse" | "fixture" = "tse";

    const zip = await tryDownload();
    if (zip) {
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

    const zonas = await processCsv(pool, csvPath, source);
    console.log(`\n=== Resumo ===`);
    console.log(`  ano (target): ${TARGET_YEAR} (estimativa a partir de ${SOURCE_YEAR})`);
    console.log(`  zonas inseridas: ${zonas.toLocaleString()}`);
    console.log(`  fonte: ${source}`);
    console.log(`  tempo: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Falha em eleitorado-import:", err);
  process.exit(1);
});
