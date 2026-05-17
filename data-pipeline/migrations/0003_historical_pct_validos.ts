// data-pipeline/migrations/0003_historical_pct_validos.ts
//
// Migration aplicada em 2026-05-17 (S04/F0.2 — carry-over #4 da retro S03):
// preenche `historical_results.pct_validos` que estava NULL para todos os
// 57.190 registros de 2022. Carga inicial da S01 inseriu só `votos`, deixando
// `pct_validos` derivado em aberto.
//
// SQL: pct_validos = votos / Σ(votos OVER PARTITION BY ano,turno,cargo,uf,zona)
//
// Reproduzir contra Neon:
//   set -a && . ./.env.local && set +a && pnpm tsx data-pipeline/migrations/0003_historical_pct_validos.ts
//
// Resultado esperado:
//   antes: { total: '57190', with_pct: '0' }
//   depois: { total: '57190', with_pct: '57190' }
//
// Cross-refs:
//   - Retrospective S03: docs/sprints/2026-S03-f3-modelo.md (carry-over #4)
//   - Bug descoberto em: T22 da S03 (model-validator gate OT-4)
//   - Schema: lib/db/schema.ts (historical_results)
//
// Idempotência: filtro `WHERE h.pct_validos IS NULL` torna a query segura
// pra re-rodar — re-execução é no-op.

import { getPool } from "../_tse-common.ts";

async function main(): Promise<void> {
  const pool = getPool();
  try {
    const before = await pool.query(`
      SELECT COUNT(*) AS total, COUNT(pct_validos) AS with_pct
      FROM historical_results WHERE ano = 2022
    `);
    console.log("antes:", before.rows[0]);

    const result = await pool.query(`
      WITH totals AS (
        SELECT ano, turno, cargo, uf, cod_zona, SUM(votos)::float AS total_votos
        FROM historical_results
        WHERE ano = 2022 AND votos IS NOT NULL AND votos > 0
        GROUP BY ano, turno, cargo, uf, cod_zona
      )
      UPDATE historical_results h
      SET pct_validos = h.votos::float / NULLIF(t.total_votos, 0)
      FROM totals t
      WHERE h.ano = t.ano AND h.turno = t.turno AND h.cargo = t.cargo
        AND h.uf = t.uf AND h.cod_zona = t.cod_zona
        AND h.pct_validos IS NULL
        AND h.votos IS NOT NULL
    `);
    console.log(`UPDATE: ${result.rowCount ?? 0} linhas afetadas`);

    const after = await pool.query(`
      SELECT COUNT(*) AS total, COUNT(pct_validos) AS with_pct
      FROM historical_results WHERE ano = 2022
    `);
    console.log("depois:", after.rows[0]);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Falha na migration:", err);
  process.exit(1);
});
