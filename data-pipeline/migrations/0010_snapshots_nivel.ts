/**
 * 0010 — `snapshots.nivel`: distinguir zona de agregado UF/BR (spec 021, RF-199)
 *
 * ## Problema
 *
 * O TSE publica, além do EA20 por zona, um arquivo agregado por UF
 * (`<uf>-c<cargo>-e<eleicao>-u.json`) e um agregado nacional só para
 * Presidente (`br-c0001-e<eleicao>-u.json`). Até esta migration, o pipeline
 * SABIA montar essas URLs (`lib/tse/targets.ts::buildEA20UrlUf/Br`) mas nunca
 * as pedia em produção: os 4 cargos ingerem em granularidade `"zona"`
 * (`lib/config/cargos.ts`), e `buildProductionTargetsUf` só era alcançado
 * via `TSE_GRANULARIDADE=uf` — um interruptor de diagnóstico que
 * `scripts/vigia-armado.ts` proíbe explicitamente no dia D.
 *
 * Decisão do dono (2026-09-26): `listIngestTargets` passa a somar os alvos
 * de nível `"uf"`/`"br"` aos de `"zona"` em produção, sempre — ver
 * `lib/tse/targets.ts`. Sem esta coluna, a linha agregada seria gravada com
 * o sentinela `cod_zona = 0` — o MESMO sentinela que o modelo (fora do
 * escopo desta migration; `api/model/project.py`) já usa para decidir entre
 * a família "zona real" e uma família sentinela de uma UF, por FRESCOR. Uma
 * UF que tem as duas famílias (o normal, a partir de agora) descartaria uma
 * inteira sem meio de saber qual era zona de verdade e qual era o agregado
 * do TSE — o dado entraria e sumiria, sem erro.
 *
 * ## O que esta migration faz, e o que ela NÃO faz
 *
 * Faz: cria a coluna `nivel` em `snapshots`, com um CHECK que só aceita os
 * três valores válidos, e escreve `'zona'` em toda linha existente (fato
 * correto — até hoje só zona jamais chegou ao banco).
 *
 * NÃO faz: não muda `api/model/project.py`. `_discard_zero_zona_sentinel_
 * when_real_zonas_exist` continua decidindo por `cod_zona == 0` vs `> 0`,
 * sem consultar esta coluna — ensinar o modelo a usar `nivel` é trabalho
 * separado, fora do escopo de ingestão. Esta migration só garante que o
 * dado FICA distinguível no banco a partir de agora; não garante, sozinha,
 * que ele SOBREVIVE ao filtro atual do modelo.
 *
 * ## Por que NOT NULL DEFAULT, ao contrário da 0009
 *
 * `pct_atual` (migration 0009) é uma MEDIÇÃO — `NULL` é o valor honesto de
 * "não foi medido ainda", e um DEFAULT teria fabricado um zero falso.
 * `nivel` não mede nada: é a NATUREZA da linha, e toda linha gravada até
 * hoje sempre foi de zona (o pipeline nunca produziu UF/BR). Um DEFAULT
 * constante aqui não fabrica fato nenhum — só nomeia o que já era verdade.
 * `ADD COLUMN ... NOT NULL DEFAULT 'zona'` continua sendo só metadado em
 * Postgres ≥ 11 (mesmo raciocínio da 0006 para `cod_municipio_tse`):
 * nenhuma linha existente é reescrita, § 10 intacto.
 *
 * ## Idempotência
 *
 * `ADD COLUMN IF NOT EXISTS` + o CHECK só é criado se `pg_constraint` ainda
 * não o tiver (mesmo padrão de guarda em DO block da migration 0006). Rodar
 * 2× é seguro e não toca nenhuma linha existente.
 *
 * Reproduzir contra Neon:
 *   set -a; . ./.env.local; set +a
 *   node --experimental-strip-types data-pipeline/migrations/0010_snapshots_nivel.ts
 *
 * Cross-refs: spec 021 (`docs/specs/021-votacao-eleitorado/spec.md` RF-199),
 * `lib/tse/targets.ts` (agregado UF/BR somado aos alvos de zona),
 * `lib/db/schema.ts` (atualizado no mesmo commit desta migration),
 * constituição § 10.
 */
import { getPool } from "../_tse-common.ts";

const DDL_COLUNA = `
  ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS nivel varchar(4) NOT NULL DEFAULT 'zona'
`;

const DDL_CHECK = `
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'ck_snapshots_nivel'
    ) THEN
      ALTER TABLE snapshots
        ADD CONSTRAINT ck_snapshots_nivel CHECK (nivel IN ('zona', 'uf', 'br'));
    END IF;
  END
  $$
`;

async function main(): Promise<void> {
  const pool = getPool();
  try {
    console.log("[0010] adicionando snapshots.nivel...");
    await pool.query(DDL_COLUNA);
    console.log("[0010] ok: coluna nivel");

    await pool.query(DDL_CHECK);
    console.log("[0010] ok: constraint ck_snapshots_nivel");

    const { rows: cols } = await pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_name = 'snapshots' AND column_name = 'nivel'`,
    );
    const col = cols[0];
    if (!col) {
      throw new Error("coluna nivel ausente após o DDL");
    }
    console.log(
      `[0010] nivel: ${col.data_type}, nullable=${col.is_nullable}, default=${col.column_default ?? "—"}`,
    );

    // Guarda: ao contrário de `pct_atual` (0009), `nivel` PRECISA ser
    // NOT NULL com default — é a natureza da linha, não uma medição que
    // pode faltar. Um `nivel` anulável reabriria a mesma ambiguidade que
    // esta migration existe para fechar.
    if (col.is_nullable !== "NO" || col.column_default === null) {
      throw new Error(
        "nivel precisa ser NOT NULL com DEFAULT — é a natureza da linha (zona/uf/br), " +
          "não uma medição ausente (spec 021 RF-199).",
      );
    }

    const { rows: chk } = await pool.query<{ pg_get_constraintdef: string }>(
      `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'ck_snapshots_nivel'`,
    );
    if (chk.length === 0) {
      throw new Error("ck_snapshots_nivel não existe após o DO block");
    }
    console.log(`[0010] ck_snapshots_nivel: ${chk[0]?.pg_get_constraintdef}`);

    const { rows: contagem } = await pool.query<{ total: string; por_nivel: string }>(
      `SELECT COUNT(*)::text AS total,
              string_agg(DISTINCT nivel, ',')::text AS por_nivel
         FROM snapshots`,
    );
    console.log(
      `[0010] snapshots: ${contagem[0]?.total} linhas, nivel(is) presente(s): ${
        contagem[0]?.por_nivel ?? "(tabela vazia)"
      }`,
    );
    console.log(
      "[0010] próximo passo: nenhuma reimportação necessária — as linhas existentes já " +
        "eram todas de zona, e o DEFAULT as marcou corretamente. Quem passa a gravar " +
        "'uf'/'br' é o próprio ciclo de ingestão (lib/tse/repository.ts::insertSnapshot), " +
        "a partir do próximo deploy.",
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[0010] falha:", err instanceof Error ? err.message : err);
  process.exit(1);
});
