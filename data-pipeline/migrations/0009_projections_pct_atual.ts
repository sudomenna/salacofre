/**
 * 0009 — `projections.pct_atual`: a base "apurado" do gráfico da noite
 *
 * ## Problema
 *
 * O orchestrator (`api/model/project.py`) calcula, a cada ciclo, quantos votos
 * **já apurados** cada candidatura tem — e descarta o número. `projections`
 * guarda só o projetado (`pct_projetado*`, `votos_projetados`). O resultado é
 * que a série "apurado" da spec 020 não tem passado, e passado não se
 * reconstrói depois: o EA20 publica o acumulado corrente, não o histórico.
 * Cada ciclo que roda sem estas colunas é um ponto do gráfico perdido para
 * sempre. Por isso esta migration tem PRAZO: precisa estar no banco de
 * produção antes de 04/10/2026.
 *
 * ## ⚠️ `pct_apurado` e `pct_atual` são coisas OPOSTAS
 *
 * As duas colunas ficam lado a lado, as duas são 0–100, e elas medem coisas
 * diferentes:
 *
 *   - `pct_apurado` (já existia) — o **progresso da apuração** no escopo da
 *     linha. 37 = "37% das seções já foram apuradas".
 *   - `pct_atual` (esta migration) — a **fatia de votos da candidatura** sobre
 *     os votos já apurados. 37 = "esta candidatura tem 37% dos votos contados
 *     até agora".
 *
 * O nome `pct_atual` é mantido porque é o que o dicionário Python,
 * `EdgeUfCandidate` e `EdgeCandidate` já usam ponta a ponta — um quarto nome
 * criaria mais uma tradução na pilha. Ver design da spec 020 § 2.1.
 *
 * ## Por que as três colunas, e por que anuláveis sem DEFAULT
 *
 *   - `pct_atual` — o que o gráfico desenha. `numeric(8,5)` espelha
 *     `pct_projetado` (mesma fronteira de escala 0–100).
 *   - `votos_atuais` — o numerador. `pct_atual` tem denominador móvel (os
 *     votos válidos crescem a noite toda) e percentual não se re-agrega. Sem o
 *     numerador, a série nacional não se reconstrói a partir das UFs sem rodar
 *     o modelo de novo.
 *   - `dado_ts` — a hora do **boletim** (ADR-0038), não a do cálculo. Sem ela
 *     o eixo horizontal do gráfico vira o relógio do servidor, que é
 *     exatamente o que o ADR-0038 proíbe. `projections.ts` continua sendo
 *     "quando o Python rodou" e não muda de significado.
 *
 * Anuláveis e **sem `DEFAULT`** de propósito. Duas razões:
 *
 *   1. `ADD COLUMN` sem default é O(1) em PG 11+ (só metadado, sem reescrita
 *      da tabela). Com default e NOT NULL, o mesmo comando reescreveria uma
 *      tabela append-only que só cresce.
 *   2. `NULL` é o valor **honesto** para as linhas antigas: não foi medido.
 *      `0` seria uma afirmação — "esta candidatura tinha zero voto às 20h15" —
 *      e o gráfico a desenharia como um mergulho ao chão. A regra dos três
 *      estados (não começou / não sabemos / apurando) proíbe fabricar o zero.
 *      A guarda no fim deste script reprova se alguém acrescentar um default.
 *
 * ## O índice
 *
 * `ix_proj_serie (cargo, turno, uf, candidato_id, ts)` serve a leitura da
 * série — uma linha do gráfico é exatamente um prefixo desta chave. O
 * `ix_proj_lookup` existente para em `uf` e obrigaria a varrer todas as
 * candidaturas da UF para desenhar uma.
 *
 * ## Idempotência
 *
 * Todo o DDL é `ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`.
 * Rodar duas vezes não muda nada e não toca em linha existente (constituição
 * § 10 — append-only: zero UPDATE, zero DELETE aqui).
 *
 * Reproduzir contra Neon:
 *   set -a; . ./.env.local; set +a
 *   node --experimental-strip-types data-pipeline/migrations/0009_projections_pct_atual.ts
 *
 * Cross-refs: spec 020 (`docs/specs/020-evolucao-da-apuracao/design.md` § 2),
 * ADR-0038 (`dado_ts`), constituição § 10.
 */
import { getPool } from "../_tse-common.ts";

const DDL = [
  `ALTER TABLE projections ADD COLUMN IF NOT EXISTS pct_atual numeric(8,5)`,
  `ALTER TABLE projections ADD COLUMN IF NOT EXISTS votos_atuais bigint`,
  `ALTER TABLE projections ADD COLUMN IF NOT EXISTS dado_ts timestamptz`,
  `CREATE INDEX IF NOT EXISTS ix_proj_serie
     ON projections (cargo, turno, uf, candidato_id, ts)`,
];

const COLUNAS_NOVAS = ["pct_atual", "votos_atuais", "dado_ts"] as const;

async function main(): Promise<void> {
  const pool = getPool();
  try {
    for (const sql of DDL) {
      const nome =
        /ADD COLUMN (?:IF NOT EXISTS )?([a-z_]+)/.exec(sql)?.[1] ??
        /CREATE INDEX (?:IF NOT EXISTS )?([a-z_]+)/.exec(sql)?.[1] ??
        "?";
      await pool.query(sql);
      console.log(`[0009] ok: ${nome}`);
    }

    const { rows: cols } = await pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_name = 'projections'
          AND column_name = ANY($1::text[])
        ORDER BY column_name`,
      [[...COLUNAS_NOVAS]],
    );

    const achadas = new Set(cols.map((c) => c.column_name));
    const faltando = COLUNAS_NOVAS.filter((c) => !achadas.has(c));
    if (faltando.length > 0) {
      throw new Error(`coluna(s) ausente(s) após o DDL: ${faltando.join(", ")}`);
    }

    // Guarda: `NULL` é o valor honesto de linha não medida. Um DEFAULT (ou um
    // NOT NULL) transformaria "não foi medido" em "mediu zero" — ver o bloco
    // "Por que anuláveis sem DEFAULT" acima.
    for (const c of cols) {
      console.log(
        `[0009] ${c.column_name}: ${c.data_type}, nullable=${c.is_nullable}, ` +
          `default=${c.column_default ?? "—"}`,
      );
      if (c.is_nullable !== "YES" || c.column_default !== null) {
        throw new Error(
          `${c.column_name} precisa ser anulável e SEM default — ` +
            `NULL é "não foi medido", 0 seria uma afirmação falsa (spec 020 § 2.1).`,
        );
      }
    }

    const { rows: idx } = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
        WHERE tablename = 'projections' AND indexname = 'ix_proj_serie'`,
    );
    if (idx.length === 0) {
      throw new Error("ix_proj_serie não existe após o CREATE INDEX");
    }
    console.log(`[0009] ix_proj_serie: ${idx[0]?.indexdef}`);

    const { rows: linhas } = await pool.query<{ total: string; medidas: string }>(
      `SELECT COUNT(*)::text                                   AS total,
              COUNT(*) FILTER (WHERE pct_atual IS NOT NULL)::text AS medidas
         FROM projections`,
    );
    console.log(
      `[0009] projections: ${linhas[0]?.total} linhas, ${linhas[0]?.medidas} com ` +
        `pct_atual medido (as anteriores ficam NULL de propósito).`,
    );
    console.log(
      "[0009] próximo passo: nada a importar. Quem povoa as colunas é o " +
        "ciclo do modelo (api/model/project.py, insert_projections).",
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[0009] falha:", err instanceof Error ? err.message : err);
  process.exit(1);
});
