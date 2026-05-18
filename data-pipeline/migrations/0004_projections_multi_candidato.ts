// data-pipeline/migrations/0004_projections_multi_candidato.ts
//
// Migration aplicada em S05/F4c (2026-05-17) — ADR-0014 + ADR-0015 (K-1 3-tier).
//
// Adiciona duas colunas em `projections`:
//   - `model_fallback_tier smallint` — qual tier do K-1 fallback foi usado
//     na linha (1=direto/partido, 2=prior pesquisa com CI inflado,
//     3=modelo desabilitado). Permite auditoria de comportamento.
//   - `cenario_2t_json jsonb` — dump dos top-3 cenários 2T NA HORA do snapshot
//     (só faz sentido no nacional, `uf IS NULL`). Reconstrução histórica do
//     "termômetro de cenários 2T" sem precisar dos resamples originais.
//
// Constituição § 10 — append-only: migration só `ADD COLUMN IF NOT EXISTS`,
// nunca `ALTER` destrutivo nem UPDATE em rows existentes (rows legadas ficam
// com NULL nas colunas novas — semantica "tier desconhecido").
//
// Reproduzir contra Neon:
//   set -a && . ./.env.local && set +a && pnpm tsx data-pipeline/migrations/0004_projections_multi_candidato.ts
//
// Resultado esperado:
//   antes: { total: '<N>', with_tier: '0', with_cenario: '0' }
//   depois: { total: '<N>', with_tier: '0', with_cenario: '0' }
//   (as colunas existem mas valores ficam NULL até o próximo ciclo do modelo
//    com código S05 rodar e INSERTar linhas novas com os campos populados)
//
// Cross-refs:
//   - ADR-0014 (Métricas multi-candidato como primeira classe)
//   - ADR-0015 (K-1 fallback 3-tier)
//   - Schema: lib/db/schema.ts (projections)
//   - Sprint: docs/sprints/2026-S05-f4c-multi-candidato.md
//
// Idempotência: `ADD COLUMN IF NOT EXISTS` é seguro para re-executar.

import { getPool } from "../_tse-common.ts";

async function main(): Promise<void> {
  const pool = getPool();
  try {
    const before = await pool
      .query(`
      SELECT
        COUNT(*) AS total,
        COUNT(model_fallback_tier) FILTER (WHERE 1=1) AS with_tier,
        COUNT(cenario_2t_json) FILTER (WHERE 1=1) AS with_cenario
      FROM projections
    `)
      .catch(() => ({ rows: [{ total: "0", with_tier: "—", with_cenario: "—" }] }));
    console.log("antes:", before.rows[0]);

    await pool.query(`
      ALTER TABLE projections
        ADD COLUMN IF NOT EXISTS model_fallback_tier smallint
    `);
    await pool.query(`
      ALTER TABLE projections
        ADD COLUMN IF NOT EXISTS cenario_2t_json jsonb
    `);

    const after = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(model_fallback_tier) AS with_tier,
        COUNT(cenario_2t_json) AS with_cenario
      FROM projections
    `);
    console.log("depois:", after.rows[0]);
    console.log("OK — colunas existem; rows pré-S05 ficam NULL até o próximo ciclo do modelo.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Falha na migration:", err);
  process.exit(1);
});
