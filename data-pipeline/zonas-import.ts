// data-pipeline/zonas-import.ts
//
// Popula a tabela `zonas` a partir de UNION DISTINCT de
// historical_results + eleitorado. Não requer fonte externa.
//
// Estratégia:
//   UNION de (uf, cod_zona, cod_municipio_tse) das duas tabelas,
//   priorizando cod_municipio_tse não-nulo. nome fica NULL (opcional).
//
// Idempotente via ON CONFLICT (uf, cod_zona) DO UPDATE.
// Dependência: migration 0002_zonas_pk_fix.sql já aplicada (PK = uf, cod_zona).
//
// IMPORTANTE: rodar APÓS tse-mapping-reconcile.ts para que cod_municipio_tse
//   em historical_results e eleitorado já referenciem municipios corretamente.
//
// Uso:
//   set -a && . ./.env.local && set +a
//   node --experimental-strip-types data-pipeline/zonas-import.ts

import { getPool } from "./_tse-common.ts";

const BATCH_SIZE = 500;

// SQL que faz UNION DISTINCT das duas fontes, priorizando historical_results
// (dados de 2018/2022 tendem a ter cod_municipio_tse mais limpo pós-reconcile).
// Usa MIN(cod_municipio_tse) como tiebreaker se a mesma zona aparecer nas 2 fontes.
//
// Filtra UF = 'ZZ': o TSE usa essa pseudo-UF para votos em trânsito (voto fora do
// domicílio eleitoral). Não são zonas geográficas reais; não têm municipio em municipios.
const UNION_SQL = `
  SELECT
    uf,
    cod_zona,
    MIN(cod_municipio_tse) AS cod_municipio_tse
  FROM (
    SELECT uf, cod_zona, cod_municipio_tse
    FROM historical_results
    WHERE cod_municipio_tse IS NOT NULL
      AND uf <> 'ZZ'
    UNION ALL
    SELECT uf, cod_zona, cod_municipio_tse
    FROM eleitorado
    WHERE cod_municipio_tse IS NOT NULL
      AND uf <> 'ZZ'
  ) sub
  GROUP BY uf, cod_zona
  ORDER BY uf, cod_zona
`;

const UPSERT_SQL = `
INSERT INTO zonas (uf, cod_zona, cod_municipio_tse, nome)
SELECT * FROM UNNEST(
  $1::char(2)[],  -- uf
  $2::int4[],     -- cod_zona
  $3::int4[],     -- cod_municipio_tse
  $4::text[]      -- nome (NULL)
)
ON CONFLICT (uf, cod_zona) DO UPDATE SET
  cod_municipio_tse = EXCLUDED.cod_municipio_tse
`;

interface ZonaRow {
  uf: string;
  cod_zona: number;
  cod_municipio_tse: number;
}

async function main(): Promise<void> {
  const t0 = Date.now();
  console.log("[zonas-import] iniciando");

  const pool = getPool();

  try {
    // 1. Conta antes
    const { rows: before } = await pool.query<{ cnt: string }>(
      "SELECT COUNT(*)::text AS cnt FROM zonas",
    );
    console.log(`  zonas antes: ${before[0]?.cnt ?? "?"}`);

    // 2. Coleta todas as zonas distintas
    console.log("  coletando zonas de historical_results UNION eleitorado...");
    const { rows: zonaRows } = await pool.query<ZonaRow>(UNION_SQL);
    console.log(`  ${zonaRows.length} zonas distintas encontradas`);

    // 3. Verifica que cod_municipio_tse referencia municipios existentes
    // (pós-reconcile, a cobertura deve ser ≥99%)
    const codsMun = [...new Set(zonaRows.map((r) => r.cod_municipio_tse))];
    const { rows: munCheck } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM municipios WHERE cod_municipio_tse = ANY($1::int4[])`,
      [codsMun],
    );
    const munFound = Number(munCheck[0]?.cnt ?? 0);
    const munMissing = codsMun.length - munFound;
    console.log(
      `  cod_municipio_tse distintos: ${codsMun.length}, em municipios: ${munFound}, ausentes: ${munMissing}`,
    );
    if (munMissing > 0) {
      // Identifica quais estão faltando (até 10 para o log)
      const { rows: missing } = await pool.query<{ cod: number }>(
        `
        SELECT DISTINCT cod_municipio_tse AS cod
        FROM (
          SELECT cod_municipio_tse FROM historical_results
          UNION ALL
          SELECT cod_municipio_tse FROM eleitorado
        ) sub
        WHERE NOT EXISTS (
          SELECT 1 FROM municipios m WHERE m.cod_municipio_tse = sub.cod_municipio_tse
        )
        LIMIT 10
        `,
      );
      console.warn(
        `  WARN: ${munMissing} cod_municipio_tse sem correspondência em municipios (amostra: ${missing.map((r) => r.cod).join(", ")})`,
      );
      console.warn(
        `  WARN: Zonas com cod_municipio_tse sem FK válida serão inseridas sem FK (constraint não aplicada em zonas→municipios para robustez).`,
      );
    }

    // 4. Upsert em batches
    let inserted = 0;
    for (let i = 0; i < zonaRows.length; i += BATCH_SIZE) {
      const batch = zonaRows.slice(i, i + BATCH_SIZE);
      if (batch.length === 0) break;
      await pool.query(UPSERT_SQL, [
        batch.map((r) => r.uf),
        batch.map((r) => r.cod_zona),
        batch.map((r) => r.cod_municipio_tse),
        batch.map(() => null), // nome = NULL
      ]);
      inserted += batch.length;
    }

    // 5. Resultado final
    const { rows: after } = await pool.query<{ cnt: string }>(
      "SELECT COUNT(*)::text AS cnt FROM zonas",
    );
    const { rows: byUf } = await pool.query<{ uf: string; cnt: string }>(
      "SELECT uf, COUNT(*)::text AS cnt FROM zonas GROUP BY uf ORDER BY uf",
    );

    console.log("\n─────────────────────────────────────────────────");
    console.log("[zonas-import] RESULTADO FINAL");
    console.log(`  zonas antes    : ${before[0]?.cnt ?? "?"}`);
    console.log(`  zonas depois   : ${after[0]?.cnt ?? "?"}`);
    console.log(`  upserts        : ${inserted}`);
    console.log(`  tempo          : ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log("\n  por UF:");
    for (const r of byUf) {
      console.log(`    ${r.uf}: ${r.cnt} zonas`);
    }
    console.log("─────────────────────────────────────────────────");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Falha em zonas-import:", err);
  process.exit(1);
});
