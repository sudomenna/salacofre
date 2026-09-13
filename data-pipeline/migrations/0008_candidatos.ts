/**
 * 0008 — `candidatos` e `partidos`: o cadastro de candidaturas 2026
 *
 * ## Problema
 *
 * Não existe, em lugar nenhum do sistema, uma estrutura que ligue número de
 * urna a pessoa. `snapshots` carrega `cand[].n` (número) e `cand[].vap`
 * (votos); o EA20 de resultado **não** traz nome nem partido por extenso. Por
 * isso `api/model/project.py:2810` e `:3275` escrevem `f"Candidato {id}"` — e
 * em 04/10/2026 a tela diria "Candidato 13 lidera", um número interno,
 * publicado como se fosse informação legível (spec 018, ADR-0039).
 *
 * Esta migration cria o destino da importação do Portal de Dados Abertos do
 * TSE: `candidatos` (uma linha por candidatura) e `partidos` (tabela de
 * referência número → sigla/nome, extraída do mesmo CSV).
 *
 * ## Por que NÃO há UNIQUE INDEX sobre (cargo, uf, numero)
 *
 * Porque a chave **não é única nem na fonte oficial**. Medido em 2026-09-13
 * contra `consulta_cand_2026.zip` gerado pelo TSE em 12/09: **52 colisões
 * brutas** nos quatro cargos do produto e **4 que sobrevivem ao filtro de
 * publicabilidade** (ADR-0040) — todas na Bahia, todas do DC, todas sob
 * recurso:
 *
 *   3|BA|27   ARIEL CAPISTRANO (50002535253, DEFERIDO EM PRAZO RECURSAL)
 *             ESTÊVÃO          (50002536579, INDEFERIDO EM PRAZO RECURSAL)
 *   6|BA|2717 BRUNO ELIAS      (50002544001 e 50002542554, MESMO nome)
 *   6|BA|2727 MARLI LIMA       (50002543999 e 50002542551, MESMO nome)
 *   6|BA|2744 DURVAL NETO / NETO DA KOMBI (50002554210 e 50002542552)
 *
 * Um `UNIQUE INDEX` aqui não protegeria nada: quebraria a importação contra o
 * dado real do TSE. O desenho que sobrevive é índice **não-único** + função de
 * desempate determinística (`data-pipeline/candidatos-resolve.ts`, ADR-0042
 * item 5). Ver também RF-143, cujo critério de aceitação **reprova** uma
 * migration que crie a constraint.
 *
 * ## Sem FK para `projections`
 *
 * `projections` é append-only (constituição § 10) e nasce do EA20, que tem
 * precedência absoluta sobre o cadastro na noite da apuração (ADR-0039). Uma
 * FK travaria a inserção de um número que o TSE publique no boletim antes de o
 * cadastro chegar — exatamente o caso que a precedência existe para permitir.
 * A relação é verificada por **query de reconciliação** no importador, que
 * conta e reporta quantos `(cargo, uf, candidato_id)` já apurados não acham
 * candidatura, em vez de impedir a escrita.
 *
 * ## Sem PII
 *
 * O CSV de 50 colunas traz `NR_CPF_CANDIDATO`, `DS_EMAIL` e
 * `NR_TITULO_ELEITORAL_CANDIDATO`. Nenhuma coluna aqui os recebe, e o parser
 * não os mapeia — nem transitoriamente (constituição § 5, RNF-019, ADR-0039).
 * Se alguém acrescentar uma coluna de PII a esta tabela, o teste de conjunto
 * de chaves em `tests/unit/data-pipeline/candidatos-parse.test.ts` reprova
 * antes de a migration rodar.
 *
 * ## Idempotência
 *
 * Todo o DDL é `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`.
 * Rodar duas vezes não muda nada e não toca em linha existente.
 *
 * Reproduzir contra Neon:
 *   set -a; . ./.env.local; set +a
 *   node --experimental-strip-types data-pipeline/migrations/0008_candidatos.ts
 *
 * Depois desta migration, rodar `data-pipeline/candidatos-import.ts`.
 *
 * ## Por que `candidatos` e `numero integer` (divergência já reconciliada)
 *
 * O esboço original do design § D9 dizia `candidaturas` com `numero text`. O
 * design foi corrigido em 13/09 e hoje descreve o que está aqui; este bloco
 * fica como registro do raciocínio, não como divergência aberta. A forma é — `candidatos`, alinhada ao caminho já
 * escrito em `lib/blob/paths.ts` (`candidatos/uf/<SIGLA>/<cargo>.json`), e
 * `numero integer` porque há **zero** ocorrências de zero à esquerda em
 * `NR_CANDIDATO` nos 8.323 registros dos quatro cargos (2 a 4 dígitos).
 * ⚠️ O contrato do payload (design § D2) mantém `numero` como **string** — a
 * conversão acontece na serialização da fatia, não aqui, e o EA20 publica
 * `cand[].n` como string (`lib/tse/ea20-schema.ts:78`).
 *
 * Cross-refs: ADR-0039 (fonte), ADR-0040 (publicabilidade fail-closed),
 * ADR-0042 (chave de identidade), spec 018 RF-140/RF-141/RF-143/RF-152,
 * `docs/architecture/data-model.md`.
 */
import { getPool } from "../_tse-common.ts";

const DDL = [
  `CREATE TABLE IF NOT EXISTS candidatos (
     sq_candidato        bigint      PRIMARY KEY,
     ano                 smallint    NOT NULL DEFAULT 2026,
     cd_eleicao          integer     NOT NULL,
     turno               smallint    NOT NULL DEFAULT 1,
     cargo               smallint    NOT NULL,
     uf                  char(2)     NOT NULL,
     numero              integer     NOT NULL,
     nome                text        NOT NULL,
     nome_urna           text        NOT NULL,
     partido_sigla       varchar(20) NOT NULL,
     partido_numero      smallint    NOT NULL,
     partido_nome        text,
     federacao_sigla     varchar(40),
     coligacao_nome      text,
     situacao_julgamento text        NOT NULL,
     inserido_urna       boolean     NOT NULL,
     substituido         boolean     NOT NULL DEFAULT false,
     sq_substituido      bigint,
     publicavel          boolean     NOT NULL,
     foto_ok             boolean     NOT NULL DEFAULT false,
     fonte_ts            timestamptz NOT NULL,
     importado_ts        timestamptz NOT NULL DEFAULT now()
   )`,
  // NÃO-ÚNICO, de propósito. Ver bloco "Por que NÃO há UNIQUE INDEX" acima.
  `CREATE INDEX IF NOT EXISTS ix_cand_cargo_uf ON candidatos (cargo, uf)`,
  `CREATE INDEX IF NOT EXISTS ix_cand_publicavel ON candidatos (cargo, uf) WHERE publicavel`,
  `CREATE INDEX IF NOT EXISTS ix_cand_busca
     ON candidatos USING gin (to_tsvector('portuguese', nome_urna || ' ' || nome))`,
  `CREATE TABLE IF NOT EXISTS partidos (
     numero smallint    PRIMARY KEY,
     sigla  varchar(20) NOT NULL,
     nome   text        NOT NULL
   )`,
];

async function main(): Promise<void> {
  const pool = getPool();
  try {
    for (const sql of DDL) {
      const nome = /CREATE (TABLE|INDEX)[^(]*?(IF NOT EXISTS )?([a-z_]+)/.exec(sql)?.[3] ?? "?";
      await pool.query(sql);
      console.log(`[0008] ok: ${nome}`);
    }

    const { rows: cols } = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM information_schema.columns WHERE table_name = 'candidatos'`,
    );
    console.log(`[0008] candidatos: ${cols[0]?.n} colunas (esperado 22)`);

    // Guarda estrutural: a constraint que o ADR-0042 proíbe não pode existir.
    const { rows: unicos } = await pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'candidatos' AND indexdef ILIKE '%UNIQUE%'
          AND indexdef ILIKE '%numero%'`,
    );
    if (unicos.length > 0) {
      throw new Error(
        `Índice ÚNICO sobre numero encontrado (${unicos.map((r) => r.indexname).join(", ")}). ` +
          `Ver ADR-0042 item 5: (cargo, uf, numero) colide 4× no dado real do TSE.`,
      );
    }
    console.log("[0008] nenhum índice único sobre `numero` — como o ADR-0042 exige.");

    const { rows: pii } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'candidatos'
          AND (column_name ILIKE '%cpf%' OR column_name ILIKE '%email%'
               OR column_name ILIKE '%titulo%' OR column_name ILIKE '%nascimento%')`,
    );
    if (pii.length > 0) {
      throw new Error(
        `Coluna de PII em candidatos: ${pii.map((r) => r.column_name).join(", ")} ` +
          `(constituição § 5, RNF-019).`,
      );
    }
    console.log("[0008] nenhuma coluna de PII — constituição § 5.");

    const { rows: linhas } = await pool.query<{ c: string; p: string }>(
      `SELECT (SELECT COUNT(*)::text FROM candidatos) AS c,
              (SELECT COUNT(*)::text FROM partidos)   AS p`,
    );
    console.log(`[0008] linhas atuais — candidatos: ${linhas[0]?.c}, partidos: ${linhas[0]?.p}`);
    console.log(
      "[0008] próximo passo: node --experimental-strip-types " +
        "data-pipeline/candidatos-import.ts",
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[0008] falha:", err instanceof Error ? err.message : err);
  process.exit(1);
});
