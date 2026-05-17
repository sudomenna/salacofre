// data-pipeline/historical-import.ts
//
// Popula `historical_results` com resultados de Presidente (cargo=1) e Governador
// (cargo=3) em 2018 e 2022, turnos 1 e 2, zona-a-zona.
//
// Fonte: TSE Repositório de Dados Abertos — votacao_partido_munzona (~26 MB/ano).
//   https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_partido_munzona/votacao_partido_munzona_<ANO>.zip
//
// Por que partido_munzona e não candidato_munzona:
// - candidato_munzona pesa ~400 MB/ano (timeouts frequentes no CDN do TSE).
// - Para Presidente/Governador, há 1 candidato por partido por turno/UF — então
//   "votos do partido na zona" == "votos do candidato dele na zona". Não há perda
//   informacional para o modelo (RF-002.x). O nome do candidato é uma label
//   cosmética, recuperável depois via spec 011 ou seed manual.
// - Em S03+ podemos enriquecer com candidato_munzona em batch noturno.
//
// Saída: linhas em historical_results com UPSERT em
//   (ano, turno, cargo, uf, cod_zona, cod_candidato).
//
// `cod_candidato` é derivado deterministicamente como surrogate:
//   cargo * 1_000_000 + ano * 1000 + turno * 100 + nr_partido
// → estável entre rodadas, idempotente, único dentro do escopo da query.
//
// Fallback (S01 pragmatic): se o ZIP TSE não for baixável dentro do timeout,
// usa data-pipeline/fixtures/historical-sample.csv (≤100 linhas) e reporta o gap.
//
// Uso:
//   set -a && . ./.env.local && set +a
//   node --experimental-strip-types data-pipeline/historical-import.ts
//
// Notas:
// - TSE CSVs são ISO-8859-1, separador `;`, aspas duplas.
// - Filtramos CD_CARGO IN (1,3) e NR_TURNO IN (1,2) na leitura para enxugar memória.
// - Idempotente via ON CONFLICT DO UPDATE.
// - Pool + ws (igual scripts/apply-postgis.mjs).

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

const CARGO_PRESIDENTE = 1;
const CARGO_GOVERNADOR = 3;
const CARGOS_INTERESSE = new Set([CARGO_PRESIDENTE, CARGO_GOVERNADOR]);
const ANOS = [2018, 2022] as const;
const BATCH_SIZE = 2000;

interface Row {
  ano: number;
  turno: number;
  cargo: number;
  uf: string;
  cod_municipio_tse: number | null;
  cod_zona: number;
  cod_candidato: number;
  nome_candidato: string | null;
  partido: string | null;
  votos: number;
}

// Importante: votos faz SUM. TSE separa o mesmo (uf,zona,partido,cargo) em
// múltiplos arquivos (`_BR.csv` para trânsito federal + `_<UF>.csv` para
// presencial). Sem SUM, o último arquivo importado sobrescreveria os anteriores.
// dedupeBatch() agrega no mesmo batch; este SUM agrega entre batches/arquivos.
// → Re-rodar o script reinicia a contagem: trunca e re-importa (idempotência
//   forte só com TRUNCATE manual entre execuções).
const UPSERT_SQL = `
INSERT INTO historical_results
  (ano, turno, cargo, uf, cod_municipio_tse, cod_zona, cod_candidato, nome_candidato, partido, votos)
SELECT * FROM UNNEST(
  $1::int2[],   -- ano
  $2::int2[],   -- turno
  $3::int2[],   -- cargo
  $4::char(2)[],-- uf
  $5::int4[],   -- cod_municipio_tse
  $6::int4[],   -- cod_zona
  $7::int4[],   -- cod_candidato
  $8::text[],   -- nome_candidato
  $9::varchar(20)[], -- partido
  $10::int4[]   -- votos
)
ON CONFLICT (ano, turno, cargo, uf, cod_zona, cod_candidato)
DO UPDATE SET
  votos = historical_results.votos + EXCLUDED.votos,
  nome_candidato = COALESCE(EXCLUDED.nome_candidato, historical_results.nome_candidato),
  partido = COALESCE(EXCLUDED.partido, historical_results.partido),
  cod_municipio_tse = COALESCE(EXCLUDED.cod_municipio_tse, historical_results.cod_municipio_tse);
`;

async function flushBatch(
  pool: import("@neondatabase/serverless").Pool,
  buf: Row[],
): Promise<void> {
  if (buf.length === 0) return;
  const cols: unknown[][] = [
    buf.map((r) => r.ano),
    buf.map((r) => r.turno),
    buf.map((r) => r.cargo),
    buf.map((r) => r.uf),
    buf.map((r) => r.cod_municipio_tse),
    buf.map((r) => r.cod_zona),
    buf.map((r) => r.cod_candidato),
    buf.map((r) => r.nome_candidato),
    buf.map((r) => r.partido),
    buf.map((r) => r.votos),
  ];
  await pool.query(UPSERT_SQL, cols);
}

/**
 * Tenta baixar o ZIP TSE. Se falhar (HTTP error, timeout), retorna null e o
 * chamador cai pro fixture.
 */
async function tryDownloadYear(ano: number): Promise<string | null> {
  const filename = `votacao_partido_munzona_${ano}.zip`;
  const url = `https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_partido_munzona/${filename}`;
  try {
    return await downloadCached(url, filename, { minBytes: 5 * 1024 * 1024 });
  } catch (err) {
    console.warn(`  [warn] download falhou para ${ano}: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Surrogate candidate ID — determinístico, cabe em int4.
 *   cargo (1 ou 3) * 1_000_000  → 1_000_000 ou 3_000_000
 *   ano (2018|2022) * 1000       → 2018000 ou 2022000
 *   turno (1|2) * 100            → 100 ou 200
 *   nr_partido (1..99)           → soma
 * Total cabe em <2.1e9.
 */
function surrogateCandidatoId(
  cargo: number,
  ano: number,
  turno: number,
  nrPartido: number,
): number {
  return cargo * 1_000_000 + ano * 1000 + turno * 100 + nrPartido;
}

/**
 * Agrega duplicatas dentro de um batch (chave PG ON CONFLICT) somando votos.
 * Necessário porque TSE divide linhas por ST_VOTO_EM_TRANSITO (S/N) — mesma
 * tupla (ano,turno,cargo,uf,zona,cod_candidato) aparece 2x.
 */
function dedupeBatch(rows: Row[]): Row[] {
  const out = new Map<string, Row>();
  for (const r of rows) {
    const k = `${r.ano}|${r.turno}|${r.cargo}|${r.uf}|${r.cod_zona}|${r.cod_candidato}`;
    const cur = out.get(k);
    if (cur) {
      cur.votos += r.votos;
    } else {
      out.set(k, { ...r });
    }
  }
  return [...out.values()];
}

async function processCsv(
  pool: import("@neondatabase/serverless").Pool,
  csvPath: string,
  source: "tse" | "fixture",
): Promise<{ rows: number; counts: Map<string, number> }> {
  const header = await readCsvHeader(csvPath);
  // Headers de votacao_partido_munzona (mesmo schema em 2018 e 2022).
  // Para fixture, aceitamos também colunas extras (NR_CANDIDATO etc) — só
  // exigimos as que usamos.
  const required = [
    "ANO_ELEICAO",
    "NR_TURNO",
    "CD_CARGO",
    "SG_UF",
    "CD_MUNICIPIO",
    "NR_ZONA",
    "NR_PARTIDO",
    "SG_PARTIDO",
  ];
  const idx: Record<string, number> = {};
  for (const k of required) {
    const i = header.get(k);
    if (i === undefined) {
      throw new Error(
        `Coluna obrigatória ausente em ${csvPath}: ${k} (header tem ${[...header.keys()].slice(0, 10).join(",")}...)`,
      );
    }
    idx[k] = i;
  }

  // Votos: TSE usa QT_VOTOS_NOMINAIS_VALIDOS no agregado partido_munzona.
  // Fixture pode usar QT_VOTOS_NOMINAIS. Aceitamos os dois.
  const votosCol = header.get("QT_VOTOS_NOMINAIS_VALIDOS") ?? header.get("QT_VOTOS_NOMINAIS");
  if (votosCol === undefined) {
    throw new Error(`Coluna de votos ausente em ${csvPath}`);
  }

  // Nome do candidato não existe em partido_munzona; deixamos NULL e
  // preenchemos com sigla do partido como label provisória.
  const buf: Row[] = [];
  let total = 0;
  let kept = 0;
  const counts = new Map<string, number>(); // ano|turno|cargo → linhas mantidas

  for await (const fields of iterCsv(csvPath)) {
    total++;
    const cargo = toIntOrNull(fields[idx.CD_CARGO!]);
    if (cargo == null || !CARGOS_INTERESSE.has(cargo)) continue;
    const turno = toIntOrNull(fields[idx.NR_TURNO!]);
    if (turno !== 1 && turno !== 2) continue;
    const ano = toIntOrNull(fields[idx.ANO_ELEICAO!]);
    if (ano !== 2018 && ano !== 2022) continue;
    const uf = (fields[idx.SG_UF!] ?? "").trim();
    if (uf.length !== 2) continue;
    const codZona = toIntOrNull(fields[idx.NR_ZONA!]);
    const nrPartido = toIntOrNull(fields[idx.NR_PARTIDO!]);
    if (codZona == null || nrPartido == null) continue;
    const votos = toIntOrZero(fields[votosCol]);
    if (votos <= 0) continue; // pula partidos sem votos na zona

    const partido = ((fields[idx.SG_PARTIDO!] ?? "").trim() || null)?.slice(0, 20) ?? null;
    const row: Row = {
      ano,
      turno,
      cargo,
      uf,
      cod_municipio_tse: toIntOrNull(fields[idx.CD_MUNICIPIO!]),
      cod_zona: codZona,
      cod_candidato: surrogateCandidatoId(cargo, ano, turno, nrPartido),
      nome_candidato: partido, // label provisória; nome real em S03+
      partido,
      votos,
    };
    buf.push(row);
    kept++;
    const k = `${row.ano}|${row.turno}|${row.cargo}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);

    if (buf.length >= BATCH_SIZE) {
      await flushBatch(pool, dedupeBatch(buf));
      buf.length = 0;
    }
    if (kept % 5000 === 0) {
      console.log(
        `    ... ${kept.toLocaleString()} linhas filtradas (${total.toLocaleString()} lidas) [${source}]`,
      );
    }
  }
  await flushBatch(pool, dedupeBatch(buf));
  console.log(`  [csv done] ${csvPath.split("/").pop()} — ${kept}/${total} mantidas`);
  return { rows: kept, counts };
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const pool = getPool();
  const totalCounts = new Map<string, number>();
  let sourceUsed: "tse" | "fixture" | "mixed" = "tse";
  // Como ON CONFLICT faz SUM de votos, --truncate garante re-execução limpa.
  // Default true em S01 (sempre rebuild from scratch).
  const truncate = !process.argv.includes("--no-truncate");

  try {
    if (truncate) {
      console.log("[truncate] historical_results");
      await pool.query("TRUNCATE historical_results");
    }
    let anyReal = false;
    for (const ano of ANOS) {
      console.log(`\n=== Ano ${ano} ===`);
      const zip = await tryDownloadYear(ano);
      if (!zip) {
        console.warn(`  [skip] ${ano}: ZIP indisponível — pulando (fallback fixture no fim)`);
        continue;
      }
      const dir = await unzipTo(zip, `votacao_partido_munzona_${ano}`);
      const files = (await readdir(dir))
        .filter((f) => f.endsWith(".csv"))
        // _BRASIL.csv (2022+) é a consolidação nacional — duplica todas as UFs.
        // _BR.csv contém apenas votos de trânsito (cargo=1 Presidente) e
        // complementa as UFs com SG_UE="BR". Mantemos só per-UF + _BR.
        .filter((f) => !/_BRASIL\.csv$/i.test(f));
      console.log(`  ${files.length} CSVs encontrados (skip _BRASIL.csv consolidado)`);
      for (const f of files) {
        const path = resolve(dir, f);
        const { counts } = await processCsv(pool, path, "tse");
        for (const [k, v] of counts) {
          totalCounts.set(k, (totalCounts.get(k) ?? 0) + v);
        }
        anyReal = true;
      }
    }

    if (!anyReal) {
      console.log("\n[fallback] Nenhum download TSE bem-sucedido — usando fixture mínima.");
      const fixture = resolve(FIXTURES_DIR, "historical-sample.csv");
      if (!existsSync(fixture)) {
        throw new Error(`Fixture ausente: ${fixture}. Crie o arquivo ou ajuste a fonte TSE.`);
      }
      const { counts } = await processCsv(pool, fixture, "fixture");
      for (const [k, v] of counts) totalCounts.set(k, v);
      sourceUsed = "fixture";
    }

    console.log("\n=== Resumo ===");
    const sorted = [...totalCounts.entries()].sort();
    for (const [k, v] of sorted) {
      const [ano, turno, cargo] = k.split("|");
      console.log(`  ano=${ano} turno=${turno} cargo=${cargo}: ${v.toLocaleString()} linhas`);
    }
    console.log(`\nFonte: ${sourceUsed}. Tempo total: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Falha em historical-import:", err);
  process.exit(1);
});
