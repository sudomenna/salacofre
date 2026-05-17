// data-pipeline/validate-coverage.ts
//
// Reporta gaps de cobertura entre historical_results / eleitorado e municipios.
// Não bloqueia — só lista o que está faltando pro orquestrador decidir.
//
// Uso:
//   set -a && . ./.env.local && set +a
//   node --experimental-strip-types data-pipeline/validate-coverage.ts

import { getPool } from "./_tse-common.ts";

async function main(): Promise<void> {
  const pool = getPool();
  try {
    const [{ rows: histGaps }, { rows: eltGaps }, { rows: histCounts }, { rows: eltTotal }] =
      await Promise.all([
        pool.query(`
          SELECT DISTINCT h.uf, h.cod_municipio_tse
          FROM historical_results h
          LEFT JOIN municipios m ON m.cod_municipio_tse = h.cod_municipio_tse
          WHERE h.cod_municipio_tse IS NOT NULL AND m.cod_municipio_tse IS NULL
          ORDER BY h.uf, h.cod_municipio_tse
          LIMIT 50
        `),
        pool.query(`
          SELECT DISTINCT e.uf, e.cod_municipio_tse
          FROM eleitorado e
          LEFT JOIN municipios m ON m.cod_municipio_tse = e.cod_municipio_tse
          WHERE m.cod_municipio_tse IS NULL
          ORDER BY e.uf, e.cod_municipio_tse
          LIMIT 50
        `),
        pool.query(`
          SELECT ano, turno, cargo, COUNT(*)::int AS rows
          FROM historical_results
          GROUP BY 1,2,3 ORDER BY 1,2,3
        `),
        pool.query(`
          SELECT ano, COUNT(*)::int AS zonas, SUM(eleitores_aptos)::bigint AS aptos_total
          FROM eleitorado GROUP BY ano ORDER BY ano
        `),
      ]);

    console.log("=== historical_results × municipios ===");
    console.log(`gaps (até 50): ${histGaps.length}`);
    for (const g of histGaps) console.log(`  ${g.uf} ${g.cod_municipio_tse}`);

    console.log("\n=== eleitorado × municipios ===");
    console.log(`gaps (até 50): ${eltGaps.length}`);
    for (const g of eltGaps) console.log(`  ${g.uf} ${g.cod_municipio_tse}`);

    console.log("\n=== historical_results: counts por (ano, turno, cargo) ===");
    for (const c of histCounts) {
      console.log(`  ano=${c.ano} turno=${c.turno} cargo=${c.cargo}: ${c.rows.toLocaleString()}`);
    }
    console.log("\n=== eleitorado: zonas por ano ===");
    for (const c of eltTotal) {
      console.log(`  ano=${c.ano}: ${c.zonas.toLocaleString()} zonas, ${c.aptos_total} aptos`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Falha em validate-coverage:", err);
  process.exit(1);
});
