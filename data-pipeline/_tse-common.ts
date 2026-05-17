// Utilidades compartilhadas dos scripts ETL do TSE.
// - Pool Neon via WebSocket (mesma config de scripts/apply-postgis.mjs).
// - Download com retry + cache local em build/tse-archives/.
// - Parser CSV minimalista para o formato TSE: separador ;, aspas duplas, ISO-8859-1.
// - Util de batches para COPY-like INSERT.

import { exec } from "node:child_process";
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
export const CACHE_DIR = resolve(ROOT, "build/tse-archives");
export const FIXTURES_DIR = resolve(ROOT, "data-pipeline/fixtures");

export function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

export function getPool(): Pool {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL_UNPOOLED (ou DATABASE_URL) não definido. Rode `vercel env pull` ou carregue .env.local antes.",
    );
  }
  return new Pool({ connectionString: url });
}

/**
 * Baixa uma URL para o diretório de cache se ainda não existir.
 * Reaproveita o arquivo local se já presente e não-vazio.
 * Retorna o caminho local.
 *
 * @param url - URL HTTPS pública
 * @param filename - Nome do arquivo dentro de CACHE_DIR
 * @param opts.minBytes - Tamanho mínimo aceitável (sanity check pós-download)
 */
export async function downloadCached(
  url: string,
  filename: string,
  opts: { minBytes?: number } = {},
): Promise<string> {
  ensureCacheDir();
  const dest = resolve(CACHE_DIR, filename);
  if (existsSync(dest)) {
    const size = statSync(dest).size;
    if (size > (opts.minBytes ?? 1024)) {
      console.log(`  [cache hit] ${filename} (${(size / 1024 / 1024).toFixed(1)} MB)`);
      return dest;
    }
    console.log(`  [cache stale] ${filename} (${size}B) — re-baixando`);
  }
  console.log(`  [download] ${url}`);
  const t0 = Date.now();
  const res = await fetch(url, {
    headers: { "User-Agent": "AtlasMenna-ETL/0.1 (+menna@outsiders.digital)" },
    // signal: AbortSignal.timeout não suportado consistentemente em Node 22 fetch;
    // fica a critério do orquestrador setar timeout via Bash.
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} baixando ${url}`);
  }
  if (!res.body) {
    throw new Error(`Resposta sem body para ${url}`);
  }
  await pipeline(
    Readable.fromWeb(res.body as unknown as import("node:stream/web").ReadableStream),
    createWriteStream(dest),
  );
  const size = statSync(dest).size;
  console.log(
    `  [done] ${filename} ${(size / 1024 / 1024).toFixed(1)} MB em ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
  if (opts.minBytes && size < opts.minBytes) {
    throw new Error(
      `Arquivo baixado (${size}B) abaixo do mínimo esperado (${opts.minBytes}B) — fonte TSE pode ter mudado.`,
    );
  }
  return dest;
}

const execAsync = promisify(exec);

/**
 * Descompacta um ZIP em CACHE_DIR/<subdir> usando `unzip` do sistema.
 * Idempotente: se o subdir já existe e tem arquivos, pula.
 */
export async function unzipTo(zipPath: string, subdir: string): Promise<string> {
  const targetDir = resolve(CACHE_DIR, subdir);
  await mkdir(targetDir, { recursive: true });
  // Sanity: já existe e tem CSV dentro?
  if (existsSync(targetDir)) {
    const { stdout } = await execAsync(`ls "${targetDir}" 2>/dev/null | wc -l`);
    if (Number(stdout.trim()) > 0) {
      console.log(`  [unzip cache hit] ${subdir}/`);
      return targetDir;
    }
  }
  console.log(`  [unzip] ${zipPath} → ${subdir}/`);
  await execAsync(`unzip -o -q "${zipPath}" -d "${targetDir}"`);
  return targetDir;
}

/**
 * Itera linhas de um CSV TSE (ISO-8859-1, separador `;`, aspas duplas).
 * Yieldea `string[]` com os campos sem aspas. Pula a linha de header (primeira).
 *
 * TSE CSVs não têm newlines embutidos em campos, então split por linha é seguro.
 * Não cobrimos escapes de `"` dentro de campo (TSE também não usa).
 */
export async function* iterCsv(path: string): AsyncGenerator<string[], void, void> {
  const stream = createReadStream(path, { encoding: "latin1" });
  const rl = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
  let isFirst = true;
  for await (const raw of rl) {
    if (isFirst) {
      isFirst = false;
      continue;
    }
    if (!raw) continue;
    yield parseTseCsvLine(raw);
  }
}

/**
 * Parse de uma linha CSV TSE. Tolerante a aspas opcionais e a campos vazios.
 */
export function parseTseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ";" && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Lê o header de um CSV TSE e retorna um índice nome→posição.
 */
export async function readCsvHeader(path: string): Promise<Map<string, number>> {
  const stream = createReadStream(path, { encoding: "latin1" });
  const rl = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
  for await (const raw of rl) {
    rl.close();
    stream.destroy();
    const cols = parseTseCsvLine(raw);
    const map = new Map<string, number>();
    cols.forEach((c, i) => {
      map.set(c.trim(), i);
    });
    return map;
  }
  throw new Error(`CSV vazio: ${path}`);
}

/**
 * Converte um valor TSE para inteiro. Trata "", "-1" (sentinel TSE), "NULL".
 */
export function toIntOrNull(v: string | undefined): number | null {
  if (v == null) return null;
  const s = v.trim();
  if (!s || s === "NULL" || s === "#NULO#" || s === "#NULO" || s === "-1") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function toIntOrZero(v: string | undefined): number {
  const n = toIntOrNull(v);
  return n ?? 0;
}

/**
 * Executa um INSERT em batch via UNNEST. Aceita um array de tuplas e a lista
 * de "tipos PG" + a SQL "INSERT ... SELECT * FROM UNNEST($1::t1[], $2::t2[], ...)
 * ON CONFLICT ...".
 *
 * Mantém o INSERT como template fornecido pelo chamador para flexibilidade
 * de schemas (ON CONFLICT keys variam).
 */
export async function bulkInsert(
  pool: Pool,
  sql: string,
  columnsAsArrays: unknown[][],
): Promise<void> {
  await pool.query(sql, columnsAsArrays);
}
