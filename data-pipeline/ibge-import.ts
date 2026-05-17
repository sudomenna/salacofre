// data-pipeline/ibge-import.ts
//
// Popula a tabela `municipios` no Neon a partir do GeoJSON IBGE 2022
// (build/geojson/municipios.geojson — 5572 features, 555MB).
//
// Decisões (ver retorno do agent / contexto S01):
//   • cod_municipio_tse: TEMPORARIAMENTE = cod_ibge (CD_MUN) como INT.
//     Tabela TSE↔IBGE oficial ainda não foi baixada. A spec 001-ingestao-tse
//     em S02 será responsável por reconciliar com o código TSE real
//     (4 dígitos numéricos, distinto do IBGE 7-dígitos).
//     TODO[S02-spec-001]: re-rodar este import OU rodar update separado
//     com o de-para oficial do TSE.
//
//   • centroide: aproximação por bbox (média de xMin/xMax e yMin/yMax).
//     Não temos @turf/centroid e adicionar lib fora da stack canônica
//     exigiria ADR. Para um país com municípios em sua maioria pequenos
//     e convexos isso é suficiente para tooltip/label placement;
//     se precisar de centroide geométrico real, swap por turf depois.
//
//   • idempotência: ON CONFLICT (cod_ibge) DO UPDATE SET ...
//
// Execução:
//   set -a && . ./.env.local && set +a && node --import tsx data-pipeline/ibge-import.ts
//   ou: tsx data-pipeline/ibge-import.ts  (já com env carregado)
//
// Para o orquestrador: este arquivo NÃO foi adicionado a package.json scripts.
// O orquestrador consolida scripts em F1.

import { createReadStream } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

// Pool (WebSocket) requer ws polyfill em Node (Edge runtime tem WS nativo).
neonConfig.webSocketConstructor = ws;

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 500;
const LOG_EVERY = 500;

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEOJSON_PATH = resolve(__dirname, "../build/geojson/municipios.geojson");

const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error(
    "DATABASE_URL_UNPOOLED (ou DATABASE_URL) não definido. Rode `vercel env pull` ou `set -a && . ./.env.local`.",
  );
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

type Coord = [number, number];
type Ring = Coord[];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

interface FeatureProps {
  CD_MUN: string;
  NM_MUN: string;
  SIGLA_UF: string;
}

interface MunicipioRow {
  codIbge: string;
  codMunicipioTse: number;
  uf: string;
  nome: string;
  lon: number;
  lat: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Conserta mojibake double-encoded (Latin-1 lido como UTF-8 e re-encodado).
 * Os nomes no GeoJSON vêm como "UrutaÃ­" (bytes c3 83 c2 ad) — uma volta de
 * `Buffer.from(s, 'latin1').toString('utf8')` recupera "Urutaí".
 *
 * Função idempotente para strings já-corretas: se a string não contém o
 * pattern de mojibake (sequências c3 8X etc), retorna como está.
 */
function fixMojibake(s: string): string {
  if (!/[À-ÿ]/.test(s)) return s; // ASCII puro — nada a fazer
  try {
    const fixed = Buffer.from(s, "latin1").toString("utf8");
    // Se o resultado contém caracteres de substituição (U+FFFD), reverteu errado.
    if (fixed.includes("�")) return s;
    return fixed;
  } catch {
    return s;
  }
}

/**
 * Centroide aproximado pela média do bounding box de toda a geometria.
 * Aceita Polygon ou MultiPolygon (GeoJSON spec).
 *
 * TODO[performance/precision]: trocar por turf.centroid se virar ADR.
 */
function bboxCentroid(geometry: { type: string; coordinates: Polygon | MultiPolygon }): {
  lon: number;
  lat: number;
} {
  let xMin = Infinity;
  let yMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;

  const visitRing = (ring: Ring) => {
    for (const [x, y] of ring) {
      if (x < xMin) xMin = x;
      if (y < yMin) yMin = y;
      if (x > xMax) xMax = x;
      if (y > yMax) yMax = y;
    }
  };

  if (geometry.type === "Polygon") {
    for (const ring of geometry.coordinates as Polygon) visitRing(ring);
  } else if (geometry.type === "MultiPolygon") {
    for (const poly of geometry.coordinates as MultiPolygon) {
      for (const ring of poly) visitRing(ring);
    }
  } else {
    throw new Error(`Geometria inesperada: ${geometry.type}`);
  }

  return { lon: (xMin + xMax) / 2, lat: (yMin + yMax) / 2 };
}

/**
 * Faz UPSERT batch via $N placeholders. PostGIS centroide é construído inline.
 *
 * Layout dos placeholders por linha (6 colunas):
 *   $1: cod_ibge, $2: cod_municipio_tse, $3: uf, $4: nome, $5: lon, $6: lat
 */
async function upsertBatch(pool: Pool, rows: MunicipioRow[]): Promise<void> {
  if (rows.length === 0) return;

  const values: unknown[] = [];
  const tuples: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const base = i * 6;
    const r = rows[i];
    if (!r) continue;
    tuples.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, ST_SetSRID(ST_MakePoint($${base + 5}, $${base + 6}), 4326)::geography)`,
    );
    values.push(r.codIbge, r.codMunicipioTse, r.uf, r.nome, r.lon, r.lat);
  }

  const sql = `
    INSERT INTO municipios (cod_ibge, cod_municipio_tse, uf, nome, geo_centroid)
    VALUES ${tuples.join(", ")}
    ON CONFLICT (cod_ibge) DO UPDATE SET
      cod_municipio_tse = EXCLUDED.cod_municipio_tse,
      uf = EXCLUDED.uf,
      nome = EXCLUDED.nome,
      geo_centroid = EXCLUDED.geo_centroid
  `;

  await pool.query(sql, values);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main — streaming line-by-line.
//
// O GeoJSON local foi gerado uma feature por linha (linhas 1-4 = header
// "{ \"type\":\"FeatureCollection\", ...\"features\":[", e cada feature é
// uma linha separada terminada por `,` ou `]}`). Vamos extrair JSON de cada
// linha que comece com `{"type":"Feature"`.
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log(`[ibge-import] fonte: ${GEOJSON_PATH}`);
  console.log(`[ibge-import] batch=${BATCH_SIZE}, log_every=${LOG_EVERY}`);

  const pool = new Pool({ connectionString: databaseUrl });

  // Conta antes para diff útil no relatório.
  const before = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM municipios",
  );
  console.log(`[ibge-import] municipios antes: ${before.rows[0]?.count ?? "?"}`);

  const stream = createReadStream(GEOJSON_PATH, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let processed = 0;
  let inserted = 0;
  let errors = 0;
  let batch: MunicipioRow[] = [];

  try {
    for await (const rawLine of rl) {
      // Aceita tanto linhas que terminam em `,` quanto a última que termina
      // em `]}` ou `]` — strip trailing chars não-JSON.
      let line = rawLine.trim();
      if (!line.startsWith('{"type":"Feature"')) continue;
      // Remove vírgula trailing.
      if (line.endsWith(",")) line = line.slice(0, -1);
      // Algumas linhas podem ter `]}` colado no fim (caso raríssimo do exporter).
      // Não trata aqui — se parse falhar, conta como erro e segue.

      let feat: {
        properties: FeatureProps;
        geometry: { type: string; coordinates: Polygon | MultiPolygon };
      };
      try {
        feat = JSON.parse(line);
      } catch (e) {
        errors++;
        if (errors <= 3) {
          console.error(`[ibge-import] parse fail (linha ignorada): ${(e as Error).message}`);
        }
        continue;
      }

      const props = feat.properties;
      if (!props?.CD_MUN || !props.NM_MUN || !props.SIGLA_UF) {
        errors++;
        continue;
      }

      const codIbge = props.CD_MUN;
      if (codIbge.length !== 7) {
        // Esperamos 7 dígitos sempre — se vier diferente, registra erro.
        errors++;
        continue;
      }
      const codMunicipioTse = Number.parseInt(codIbge, 10); // PLACEHOLDER — ver header.
      if (!Number.isFinite(codMunicipioTse)) {
        errors++;
        continue;
      }

      const uf = props.SIGLA_UF.toUpperCase();
      const nome = fixMojibake(props.NM_MUN);

      let centroid: { lon: number; lat: number };
      try {
        centroid = bboxCentroid(feat.geometry);
      } catch (e) {
        errors++;
        console.error(`[ibge-import] centroide fail ${codIbge}: ${(e as Error).message}`);
        continue;
      }

      batch.push({
        codIbge,
        codMunicipioTse,
        uf,
        nome,
        lon: centroid.lon,
        lat: centroid.lat,
      });

      processed++;

      if (batch.length >= BATCH_SIZE) {
        await upsertBatch(pool, batch);
        inserted += batch.length;
        batch = [];
      }

      if (processed % LOG_EVERY === 0) {
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(
          `[ibge-import] processados=${processed}, inseridos=${inserted}, erros=${errors}, t=${elapsed}s`,
        );
      }
    }

    // Flush final.
    if (batch.length > 0) {
      await upsertBatch(pool, batch);
      inserted += batch.length;
      batch = [];
    }

    const after = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM municipios",
    );

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log("─".repeat(60));
    console.log(`[ibge-import] DONE`);
    console.log(`  processados : ${processed}`);
    console.log(`  upsertados  : ${inserted}`);
    console.log(`  erros       : ${errors}`);
    console.log(`  count antes : ${before.rows[0]?.count ?? "?"}`);
    console.log(`  count depois: ${after.rows[0]?.count ?? "?"}`);
    console.log(`  tempo       : ${elapsed}s`);
    console.log("─".repeat(60));

    if (errors > 0) {
      console.warn(`[ibge-import] ATENÇÃO: ${errors} erros encontrados — revise logs.`);
    }
  } finally {
    await pool.end();
  }
}

await main();
