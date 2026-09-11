// T14 — Verificação de cobertura RF-008 / RF-009 contra Neon real.
//
// RF-008 (Must): mapeamento zona↔município↔UF (IBGE × TSE) populado.
// RF-009 (Must): eleitorado por zona para ano=2026 (estimativa baseada
//                em TSE 2024 enquanto TSE 2026 não publica).
//
// ─── Limiares reescritos na migration 0006 (ADR-0035 D1) ────────────────────
//
// A unidade das duas tabelas passou a ser o PAR (município × zona). Os
// limiares antigos (2.600 zonas / 2.500 linhas de eleitorado) passariam
// mesmo com o colapso zona→município intacto, que é justamente o bug que a
// 0006 conserta. Os novos números vêm do CSV oficial do TSE
// (`eleitorado_local_votacao_2024`, 1º turno), medido em 2026-09-11:
//
//   6.085 pares · 2.619 zonas · 5.569 municípios · 155.910.528+ eleitores ·
//   1.636 zonas cobrindo de 2 a 8 municípios
//
// Os limiares ficam abaixo desses valores com folga, para não quebrar quando
// o TSE publicar o eleitorado 2026 (ou o EA12) com números um pouco outros.
//
// Gaps conhecidos e legítimos enquanto a fonte for o CSV 2024:
//   - DF não tem município e não vota em pleito municipal → 0 pares de DF.
//   - Fernando de Noronha (distrito estadual de PE), idem.
//   - Boa Esperança do Norte (MT, cod TSE 73709) é município novo, ausente da
//     base IBGE 2022 de `municipios` → excluído por `--skip-orphans`.
// Os três se resolvem quando `zonas-import.ts --ea12` puder usar o EA12 2026.

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";

async function countOf(query: ReturnType<typeof sql>): Promise<number> {
  const r = await db.execute<{ n: number }>(query);
  return r.rows[0]?.n ?? 0;
}

describe("RF-008 — mapeamento par (município × zona) ↔ UF", () => {
  it("zonas tem ao menos 6.000 pares e nenhum órfão contra municipios", async (ctx) => {
    const total = await countOf(sql`SELECT COUNT(*)::int AS n FROM zonas`);
    if (total === 0) {
      console.warn(
        "[geo-coverage] tabela `zonas` vazia — rode `pnpm db:migrate:0006` " +
          "(migration 0006 + eleitorado-import + zonas-import).",
      );
      ctx.skip();
    }

    expect(total).toBeGreaterThanOrEqual(6_000);

    const municipios = await countOf(
      sql`SELECT COUNT(DISTINCT cod_municipio_tse)::int AS n FROM zonas`,
    );
    expect(municipios).toBeGreaterThanOrEqual(5_500);

    const orphans = await countOf(
      sql`SELECT COUNT(*)::int AS n
          FROM zonas z
          LEFT JOIN municipios m ON m.cod_municipio_tse = z.cod_municipio_tse
          WHERE m.cod_municipio_tse IS NULL`,
    );
    expect(orphans).toBe(0);
  });

  it("a relação zona↔município é muitos-para-muitos (≥1.500 zonas multi-município)", async (ctx) => {
    const total = await countOf(sql`SELECT COUNT(*)::int AS n FROM zonas`);
    if (total === 0) {
      console.warn("[geo-coverage] tabela `zonas` vazia — rode `pnpm db:migrate:0006`.");
      ctx.skip();
    }

    // Este é o teste que o esquema antigo (uma linha por zona) reprovava por
    // construção: com PK (uf, cod_zona) o resultado seria necessariamente 0.
    const multi = await countOf(
      sql`SELECT COUNT(*)::int AS n FROM (
            SELECT uf, cod_zona
              FROM zonas
             GROUP BY uf, cod_zona
            HAVING COUNT(DISTINCT cod_municipio_tse) > 1
          ) s`,
    );
    expect(multi).toBeGreaterThanOrEqual(1_500);
  });
});

describe("RF-009 — eleitorado por par para 2026", () => {
  it("ano=2026 tem ao menos 6.000 pares distribuídos em ≥25 UFs", async (ctx) => {
    const total = await countOf(sql`SELECT COUNT(*)::int AS n FROM eleitorado WHERE ano = 2026`);
    if (total === 0) {
      console.warn("[geo-coverage] `eleitorado` vazia para 2026 — rode `pnpm db:migrate:0006`.");
      ctx.skip();
    }

    expect(total).toBeGreaterThanOrEqual(6_000);

    const ufs = await countOf(
      sql`SELECT COUNT(DISTINCT uf)::int AS n FROM eleitorado WHERE ano = 2026`,
    );
    // DF gap conhecido — exigimos 25+ (26 esperados, 27 quando 2026 publicar).
    expect(ufs).toBeGreaterThanOrEqual(25);
  });

  it("o eleitorado total bate com o CSV do TSE (155–157 milhões)", async (ctx) => {
    const total = await countOf(sql`SELECT COUNT(*)::int AS n FROM eleitorado WHERE ano = 2026`);
    if (total === 0) {
      console.warn("[geo-coverage] `eleitorado` vazia para 2026 — rode `pnpm db:migrate:0006`.");
      ctx.skip();
    }

    // A soma por par tem que reproduzir o total nacional: nenhum eleitor pode
    // ter sido duplicado ao espalhar a zona pelos seus municípios.
    const soma = await countOf(
      sql`SELECT COALESCE(SUM(eleitores_aptos), 0)::int AS n
            FROM eleitorado WHERE ano = 2026`,
    );
    expect(soma).toBeGreaterThanOrEqual(155_000_000);
    expect(soma).toBeLessThanOrEqual(157_000_000);
  });
});
