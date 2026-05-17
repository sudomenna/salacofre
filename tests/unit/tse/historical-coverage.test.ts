// T13 — Verificação de cobertura RF-006 / RF-007 contra Neon real.
//
// RF-006 (Must): historical_results 2022 zona-a-zona, cargos 1+3, turnos 1+2.
// RF-007 (Should): mesmo shape para 2018.
//
// Os dados foram carregados na S01 via data-pipeline/historical-import.ts;
// estes testes garantem que a cobertura permanece intacta no Neon antes
// da spec 001 ir a `shipped`. Falha aqui indica regressão de dados.

import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

describe("RF-006 / RF-007 — cobertura historical_results", () => {
  it("tem dados de 2018 e 2022 com volume mínimo esperado", async () => {
    const rows = await db.execute<{ ano: number; n: number }>(
      sql`SELECT ano::int AS ano, COUNT(*)::int AS n
          FROM historical_results
          GROUP BY ano
          ORDER BY ano`,
    );
    const byAno = new Map(rows.rows.map((r) => [r.ano, r.n]));
    expect(byAno.has(2018)).toBe(true);
    expect(byAno.has(2022)).toBe(true);
    // ~24k linhas por ano segundo S01; threshold conservador.
    expect(byAno.get(2018) ?? 0).toBeGreaterThanOrEqual(20_000);
    expect(byAno.get(2022) ?? 0).toBeGreaterThanOrEqual(20_000);
  });

  it("2022 tem as 4 combinações (cargo, turno) — Presidente+Governador × 1T+2T", async () => {
    const rows = await db.execute<{ cargo: number; turno: number }>(
      sql`SELECT DISTINCT cargo::int AS cargo, turno::int AS turno
          FROM historical_results
          WHERE ano = 2022
          ORDER BY cargo, turno`,
    );
    const combos = rows.rows.map((r) => `${r.cargo}-${r.turno}`).sort();
    expect(combos).toEqual(["1-1", "1-2", "3-1", "3-2"]);
  });
});
