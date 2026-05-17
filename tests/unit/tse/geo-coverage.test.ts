// T14 — Verificação de cobertura RF-008 / RF-009 contra Neon real.
//
// RF-008 (Must): mapeamento zona↔município↔UF (IBGE × TSE) populado.
// RF-009 (Must): eleitorado por zona para ano=2026 (estimativa baseada
//                em TSE 2024 enquanto TSE 2026 não publica).
//
// DF gap conhecido: TSE 2024 cobre apenas eleições municipais, e DF não
// tem município — `eleitorado` legitimamente exclui DF até o TSE publicar
// o ciclo presidencial de 2026.

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";

describe("RF-008 — mapeamento zona↔município↔UF", () => {
  it("zonas tem ao menos 2.600 linhas e nenhuma órfã contra municipios", async () => {
    const total = await db.execute<{ n: number }>(sql`SELECT COUNT(*)::int AS n FROM zonas`);
    expect(total.rows[0]?.n ?? 0).toBeGreaterThanOrEqual(2_600);

    const orphans = await db.execute<{ n: number }>(
      sql`SELECT COUNT(*)::int AS n
          FROM zonas z
          LEFT JOIN municipios m ON m.cod_municipio_tse = z.cod_municipio_tse
          WHERE m.cod_municipio_tse IS NULL`,
    );
    expect(orphans.rows[0]?.n ?? 0).toBe(0);
  });
});

describe("RF-009 — eleitorado por zona para 2026", () => {
  it("ano=2026 tem ao menos 2.500 zonas distribuídas em ≥25 UFs", async () => {
    const total = await db.execute<{ n: number }>(
      sql`SELECT COUNT(*)::int AS n FROM eleitorado WHERE ano = 2026`,
    );
    expect(total.rows[0]?.n ?? 0).toBeGreaterThanOrEqual(2_500);

    const ufs = await db.execute<{ n: number }>(
      sql`SELECT COUNT(DISTINCT uf)::int AS n
          FROM eleitorado
          WHERE ano = 2026`,
    );
    // DF gap conhecido — exigimos 25+ (26 esperados, 27 quando 2026 publicar).
    expect(ufs.rows[0]?.n ?? 0).toBeGreaterThanOrEqual(25);
  });
});
