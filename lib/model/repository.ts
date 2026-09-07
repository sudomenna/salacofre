/**
 * lib/model/repository.ts
 *
 * Persistence layer for the statistical projection model (spec 002).
 *
 * Covers: RF-019 (persistir cálculos do modelo), RF-020 (replay/auditoria
 * via histórico append-only de projeções), RF-012 (médias ponderadas por
 * eleitorado da zona — `getEleitoradoByZone`).
 *
 * Constituição § 10: `projections` é APPEND-ONLY tal como `snapshots`.
 * Este arquivo contém **zero** UPDATE, DELETE, UPSERT ou ON CONFLICT.
 * Toda re-execução do modelo gera linhas novas com `ts` distinto — replay
 * histórico do modelo é literalmente a leitura ordenada por `ts`.
 * `constitution-guard` valida (gate antes de `shipped`).
 *
 * ---- Decisão: Drizzle ORM API vs raw SQL ----
 *
 * Mistura intencional:
 *   - `insertProjection` / `insertProjectionsBatch` → Drizzle API
 *     (`db.insert(schema.projections).values(...)`). É um INSERT simples
 *     contra schema tipado; Drizzle dá type safety de graça e o overhead
 *     é zero comparado ao raw SQL.
 *   - `getLatestSnapshotsByZone` → raw SQL via `db.execute(sql\`...\`)`.
 *     A consulta usa CTE + `ROW_NUMBER() OVER (PARTITION BY ...)` para
 *     pegar 1 linha por (uf, cod_zona). O DSL do Drizzle não expressa
 *     window functions sem `.$with()` verboso, e este é o hot path do
 *     modelo (chamado a cada execução). Raw SQL é mais legível e tem
 *     custo runtime idêntico — a query é executada pelo Postgres, não
 *     pelo ORM.
 *   - `getHistoricalResults2022` / `getEleitoradoByZone` → Drizzle API
 *     (filtros simples por igualdade; type inference automática).
 *
 * ---- Decisão: tipos NUMERIC do Postgres ----
 *
 * O driver `@neondatabase/serverless` (e `neon-http`) devolve colunas
 * `NUMERIC` como **string** em JavaScript (preservação de precisão).
 * Isto é importante para o consumidor Python (`api/model/project.py`)
 * que vai consumir essas linhas via HTTP — o JSON terá `"pct_validos":
 * "0.55300"`, não `0.553`. O lado Python deve `Decimal(s)` ou `float(s)`
 * conforme o caso. As funções aqui devolvem `number` quando seguro
 * (via `parseFloat`) para reduzir conversão repetida do lado de cá.
 *
 * Já `pct_apurado` em `snapshots` (lido em `getLatestSnapshotsByZone`)
 * volta como string do driver — convertido para `number` no caminho de
 * leitura.
 *
 * ---- Logging ----
 *
 * Reusa `logDebug`/`logError` de `lib/tse/log.ts` (mesmo backbone JSON-line,
 * RNF-032). Não criamos `lib/model/log.ts` separado por consistência operacional —
 * `/api/model/project` e `/api/ingest` produzem o mesmo formato de log para
 * o dashboard `/_status` (spec 012).
 */

import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { NewProjection } from "@/lib/db/schema";
import { logDebug, logError } from "@/lib/tse/log";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Erro de persistência do modelo. Não usa `IngestError` (do TSE) porque
 * a stage 'persist' lá é específica do pipeline de ingestão; aqui o
 * domínio é cálculo/projeção.
 */
export class ModelRepositoryError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ModelRepositoryError";
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// insertProjection — single row
// ---------------------------------------------------------------------------

/**
 * Insere uma única linha em `projections` (append-only — constituição § 10).
 *
 * Tipicamente usado em testes ou caminhos de fallback (RF-017, RF-018).
 * Para a saída completa do modelo (nacional + 27 UFs × N candidatos),
 * use {@link insertProjectionsBatch}.
 *
 * @returns `bigint` com o `id` gerado.
 * @throws ModelRepositoryError em erro de DB.
 */
export async function insertProjection(p: NewProjection): Promise<bigint> {
  try {
    const inserted = await db
      .insert(schema.projections)
      .values(p)
      .returning({ id: schema.projections.id });

    const row = inserted[0];
    if (!row) {
      throw new ModelRepositoryError(
        "INSERT em projections não retornou id — comportamento inesperado do driver",
      );
    }
    return row.id;
  } catch (err) {
    if (err instanceof ModelRepositoryError) throw err;
    throw new ModelRepositoryError(
      `insertProjection falhou para cargo=${p.cargo} turno=${p.turno} uf=${p.uf ?? "NACIONAL"} candidato=${p.candidatoId}`,
      err,
    );
  }
}

// ---------------------------------------------------------------------------
// insertProjectionsBatch — bulk
// ---------------------------------------------------------------------------

/**
 * Insere múltiplas linhas em `projections` numa única chamada (append-only).
 *
 * Uma execução do modelo gera ~150 linhas (nacional + 27 UFs × ~5 candidatos
 * relevantes). Sem UPSERT, sem ON CONFLICT — re-execuções geram **linhas novas**
 * com `ts` mais recente. Replay histórico é literalmente
 * `SELECT ... FROM projections WHERE cargo=? AND turno=? ORDER BY ts`.
 *
 * Retorna 0 imediatamente quando `ps` é vazio (evita o erro de "values must
 * not be empty" do Drizzle).
 *
 * @returns número de linhas inseridas.
 * @throws ModelRepositoryError em erro de DB.
 */
export async function insertProjectionsBatch(ps: NewProjection[]): Promise<number> {
  if (ps.length === 0) {
    logDebug("insertProjectionsBatch chamado com array vazio — no-op");
    return 0;
  }

  try {
    const inserted = await db
      .insert(schema.projections)
      .values(ps)
      .returning({ id: schema.projections.id });

    return inserted.length;
  } catch (err) {
    if (err instanceof ModelRepositoryError) throw err;
    const errBound = new ModelRepositoryError(
      `insertProjectionsBatch falhou (n=${ps.length})`,
      err,
    );
    logError("insertProjectionsBatch falhou", {
      n: ps.length,
      error: errBound,
    });
    throw errBound;
  }
}

// ---------------------------------------------------------------------------
// getLatestSnapshotsByZone — hot path do modelo
// ---------------------------------------------------------------------------

/**
 * Linha por zona representando o snapshot mais recente para (cargo, turno).
 *
 * `payload` é o EA20 cru (JSONB) — o consumidor parseia conforme a
 * necessidade. `pctApurado` vem como `number` (já convertido da string
 * do driver NUMERIC).
 */
export type LatestSnapshotRow = {
  uf: string;
  codZona: number;
  pctApurado: number;
  payload: unknown;
};

/**
 * Retorna o snapshot mais recente por zona para (cargo, turno).
 *
 * Estratégia: CTE com `ROW_NUMBER() OVER (PARTITION BY uf, cod_zona ORDER BY
 * ts DESC)` — pega a primeira linha de cada partição. Vai atravessar
 * o índice `ix_snap_lookup (cargo, turno, uf, cod_zona, ts)` que existe
 * no schema (lib/db/schema.ts:126), portanto o `WHERE cargo=? AND turno=?`
 * + ORDER BY ts dentro de cada partição é index-only-friendly.
 *
 * Hot path: chamado a cada execução do modelo. Em corrida real (~5500
 * zonas com pelo menos uma atualização durante apuração), a query traz
 * uma linha por zona — payload é a parte mais cara (JSONB).
 *
 * @throws ModelRepositoryError em erro de DB.
 */
export async function getLatestSnapshotsByZone(
  cargo: number,
  turno: number,
): Promise<LatestSnapshotRow[]> {
  try {
    const result = await db.execute<{
      uf: string;
      cod_zona: number;
      pct_apurado: string | null;
      payload: unknown;
    }>(sql`
      WITH ranked AS (
        SELECT
          uf,
          cod_zona,
          pct_apurado,
          payload,
          ROW_NUMBER() OVER (
            PARTITION BY uf, cod_zona
            ORDER BY ts DESC, id DESC
          ) AS rn
        FROM snapshots
        WHERE cargo = ${cargo} AND turno = ${turno}
      )
      SELECT uf, cod_zona, pct_apurado, payload
      FROM ranked
      WHERE rn = 1
    `);

    return result.rows.map((r) => ({
      uf: r.uf,
      codZona: r.cod_zona,
      // NUMERIC volta como string; null preserva ausência.
      pctApurado: r.pct_apurado === null ? 0 : Number.parseFloat(r.pct_apurado),
      payload: r.payload,
    }));
  } catch (err) {
    throw new ModelRepositoryError(
      `getLatestSnapshotsByZone falhou para cargo=${cargo} turno=${turno}`,
      err,
    );
  }
}

// ---------------------------------------------------------------------------
// getHistoricalResults2022
// ---------------------------------------------------------------------------

/**
 * Linha de resultado histórico 2022 reduzida aos campos usados pelo modelo:
 * UF/zona/candidato/percentual sobre válidos. Driver retorna NUMERIC como
 * string; convertemos para `number` para reduzir conversão repetida no Python.
 *
 * `pctValidos` pode ser null no DB (algumas linhas históricas em zonas sem
 * apuração efetiva); preservamos como `number | null` ao invés de coerce para 0.
 */
export type HistoricalResultRow = {
  uf: string;
  codZona: number;
  codCandidato: number;
  pctValidos: number | null;
};

/**
 * Lê todos os resultados históricos 2022 para (cargo, turno).
 *
 * NÃO é insumo da projeção desde o ADR-0021: a extrapolação do apurado
 * (RF-011/RF-012) não consulta 2022. O histórico sobrevive apenas para a
 * **comparação descritiva** exibida ao leitor (`swing_vs_2022` no payload de
 * UF) — fato observado, não ingrediente do cálculo.
 *
 * Atravessa o índice `ix_hist_lookup (ano, turno, cargo, uf, cod_zona)`.
 *
 * @throws ModelRepositoryError em erro de DB.
 */
export async function getHistoricalResults2022(
  cargo: number,
  turno: number,
): Promise<HistoricalResultRow[]> {
  try {
    const rows = await db
      .select({
        uf: schema.historicalResults.uf,
        codZona: schema.historicalResults.codZona,
        codCandidato: schema.historicalResults.codCandidato,
        pctValidos: schema.historicalResults.pctValidos,
      })
      .from(schema.historicalResults)
      .where(
        and(
          eq(schema.historicalResults.ano, 2022),
          eq(schema.historicalResults.turno, turno),
          eq(schema.historicalResults.cargo, cargo),
        ),
      );

    return rows.map((r) => ({
      uf: r.uf,
      codZona: r.codZona,
      codCandidato: r.codCandidato,
      // NUMERIC volta como string; null = preserve.
      pctValidos: r.pctValidos === null ? null : Number.parseFloat(r.pctValidos),
    }));
  } catch (err) {
    throw new ModelRepositoryError(
      `getHistoricalResults2022 falhou para cargo=${cargo} turno=${turno}`,
      err,
    );
  }
}

// ---------------------------------------------------------------------------
// getEleitoradoByZone
// ---------------------------------------------------------------------------

/**
 * Eleitorado por zona para um ano (tipicamente 2026 ou 2022 para replay).
 *
 * Chave do Map: `"{uf}:{cod_zona}"` (string) — formato canônico para
 * lookup O(1) durante o cálculo de média ponderada (RF-012). UF tem 2 chars,
 * cod_zona é int — concatenar com ':' evita colisão entre `"SP:1"` e
 * `"S:P1"` etc.
 *
 * Valor: número de eleitores aptos (int).
 *
 * @throws ModelRepositoryError em erro de DB.
 */
export async function getEleitoradoByZone(ano: number): Promise<Map<string, number>> {
  try {
    const rows = await db
      .select({
        uf: schema.eleitorado.uf,
        codZona: schema.eleitorado.codZona,
        eleitoresAptos: schema.eleitorado.eleitoresAptos,
      })
      .from(schema.eleitorado)
      .where(eq(schema.eleitorado.ano, ano));

    const m = new Map<string, number>();
    for (const r of rows) {
      m.set(`${r.uf}:${r.codZona}`, r.eleitoresAptos);
    }
    return m;
  } catch (err) {
    throw new ModelRepositoryError(`getEleitoradoByZone falhou para ano=${ano}`, err);
  }
}
