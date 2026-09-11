// data-pipeline/migrations/0006_pares_municipio_zona.ts
//
// Migration — o par (município × zona) vira a unidade de chave do pipeline.
// Referência: ADR-0035 (D1/D2/D3) e o diagnóstico medido em
// `docs/_meta/diagnostico-colapso-zona-municipio-2026-09-10.md`.
//
// ─── Por quê ────────────────────────────────────────────────────────────────
//
// A premissa "uma zona vive em um município" é falsa. Medido no CSV oficial do
// TSE (`eleitorado_local_votacao_2024`, 1º turno): 2.619 zonas, 5.569
// municípios, **6.085 pares** — 1.636 zonas (62,5 %) cobrem de 2 a 8
// municípios. A relação é muitos-para-muitos e o par é a interseção: mais
// fino que as duas visões, e ambas deriváveis dele por soma.
//
// Enquanto a chave for `(uf, cod_zona)`:
//   - `eleitorado` credita a zona inteira ao primeiro município visto
//     (26,1 % do eleitorado sob rótulo errado);
//   - `zonas` escolhe `MIN(cod_municipio_tse)` (31,2 % dos votos no município
//     errado no mapa; 3.392 municípios estruturalmente invisíveis);
//   - `snapshots` não guarda município nenhum, e em 2026 o TSE publica um EA20
//     **por par** — dois arquivos da mesma zona colidiriam na dedup.
//
// ─── O que esta migration faz ───────────────────────────────────────────────
//
//   1. `zonas`     — PK `(uf, cod_zona)` → `(uf, cod_municipio_tse, cod_zona)`;
//                    nova coluna `fonte text` (`'ea12'` | `'csv'`).
//                    A FK para `municipios(cod_municipio_tse)` é preservada.
//   2. `eleitorado` — PK `(ano, uf, cod_zona)` → `(ano, uf, cod_municipio_tse,
//                    cod_zona)`.
//   3. `snapshots`  — nova coluna `cod_municipio_tse integer NOT NULL DEFAULT 0`
//                    (sentinel 0 para abrangências BR/UF, como já se faz com
//                    `cod_zona`) + índice `ix_snap_lookup_par`. `ADD COLUMN`
//                    com DEFAULT constante é só metadado no Postgres ≥ 11 —
//                    não reescreve a tabela, o append-only segue intacto.
//                    `ix_snap_lookup` (chave antiga) é **mantido**.
//   4. `municipios` — nova coluna `capital boolean NOT NULL DEFAULT false` +
//                    seed das 27 capitais por `cod_ibge`. O EA12 do TSE traz
//                    esse bit em `mu[].c`; até o EA12 2026 existir, a lista
//                    estática abaixo (fato público, IBGE) é a fonte.
//   5. `snapshots`  — **limpeza única** das linhas de ensaio (ver abaixo).
//
// `ingest_log`, `projections` e `historical_results` **não** são tocados.
//
// ─── Limpeza única de `snapshots` (decisão E3 do plano, ADR-0035 D3) ────────
//
// A constituição § 10 declara `snapshots` append-only. Isso protege os
// snapshots **do TSE**: é o que permite reproduzir qualquer número exibido.
// As 10.604 linhas presentes em 2026-09-11 não são do TSE — são do ensaio de
// 2026-09-05 contra `scripts/tse-mock-server.ts` (payload sintético, seed
// determinística). Mantê-las depois da mudança de chave só produziria dedup
// ambígua: linhas sem município (sentinel 0) convivendo com linhas por par.
// O usuário autorizou a limpeza única em 2026-09-11 (E3).
//
// Guarda de idempotência e de segurança: o DELETE é restrito a
// `ts < CUTOFF_ENSAIO`. Rodar a migration de novo depois de um ciclo real de
// ingestão **não** apaga nada — o corte é anterior a esta migration existir.
//
// ─── Idempotência ───────────────────────────────────────────────────────────
//
// Todas as etapas são `IF NOT EXISTS` ou guardadas por `DO $$` que inspeciona
// `pg_index`/`pg_constraint` antes de agir (mesmo padrão de
// `lib/db/migrations/0002_zonas_pk_fix.sql` e de `0005_municipios_mesorregiao.ts`).
// Rodar 2× é seguro; a segunda execução é no-op e imprime as mesmas contagens.
//
// ─── Como rodar ─────────────────────────────────────────────────────────────
//
//   set -a; . ./.env.local; set +a
//   node --experimental-strip-types data-pipeline/migrations/0006_pares_municipio_zona.ts
//
// Depois dela, na ordem: `eleitorado-import.ts` e `zonas-import.ts`
// (ver `pnpm db:migrate:0006`).
//
// Cross-refs:
//   - ADR-0035 — par como unidade de ingestão (emenda o ADR-0002 quanto à PK
//     de `zonas`; nota em 0021/0023: o estimador continua por zona).
//   - `lib/db/schema.ts` — atualizado no mesmo commit desta migration.
//   - `docs/architecture/data-model.md` § Schema.

import { getPool } from "../_tse-common.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Limpeza única — corte temporal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Instante em que esta migration foi escrita. Só linhas ANTERIORES a ele são
 * apagadas — tudo que o pipeline gravar daqui pra frente é intocável (§ 10).
 */
const CUTOFF_ENSAIO = "2026-09-11T00:00:00Z";

// ─────────────────────────────────────────────────────────────────────────────
// Capitais — cod_ibge (7 dígitos). Fato público; conferido um a um.
// O EA12 (`mu[].c = 's'`) substitui esta lista assim que o arquivo 2026 existir
// — `zonas-import.ts --ea12` reescreve a coluna a partir dele.
// ─────────────────────────────────────────────────────────────────────────────

const CAPITAIS: ReadonlyArray<readonly [codIbge: string, uf: string, nome: string]> = [
  ["1200401", "AC", "Rio Branco"],
  ["2704302", "AL", "Maceió"],
  ["1600303", "AP", "Macapá"],
  ["1302603", "AM", "Manaus"],
  ["2927408", "BA", "Salvador"],
  ["2304400", "CE", "Fortaleza"],
  ["5300108", "DF", "Brasília"],
  ["3205309", "ES", "Vitória"],
  ["5208707", "GO", "Goiânia"],
  ["2111300", "MA", "São Luís"],
  ["5103403", "MT", "Cuiabá"],
  ["5002704", "MS", "Campo Grande"],
  ["3106200", "MG", "Belo Horizonte"],
  ["1501402", "PA", "Belém"],
  ["2507507", "PB", "João Pessoa"],
  ["4106902", "PR", "Curitiba"],
  ["2611606", "PE", "Recife"],
  ["2211001", "PI", "Teresina"],
  ["3304557", "RJ", "Rio de Janeiro"],
  ["2408102", "RN", "Natal"],
  ["4314902", "RS", "Porto Alegre"],
  ["1100205", "RO", "Porto Velho"],
  ["1400100", "RR", "Boa Vista"],
  ["4205407", "SC", "Florianópolis"],
  ["3550308", "SP", "São Paulo"],
  ["2800308", "SE", "Aracaju"],
  ["1721000", "TO", "Palmas"],
];

// ─────────────────────────────────────────────────────────────────────────────
// DDL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Troca a PK de uma tabela apenas se a PK atual for exatamente `fromCols`.
 * Postgres não tem `ALTER ... REPLACE PRIMARY KEY`; o DO block inspeciona
 * `pg_index` (mesmo padrão da 0002) para não repetir o trabalho na 2ª run.
 */
function ddlSwapPk(table: string, fromCols: string[], toCols: string[]): string {
  const fromArray = fromCols.map((c) => `'${c}'`).join(", ");
  return `
    DO $$
    DECLARE
      pk_name text;
      pk_cols text[];
    BEGIN
      SELECT c.conname,
             ARRAY(
               SELECT a.attname::text
               FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
               JOIN pg_attribute a
                 ON a.attrelid = c.conrelid AND a.attnum = k.attnum
               ORDER BY k.ord
             )
        INTO pk_name, pk_cols
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = '${table}' AND c.contype = 'p';

      IF pk_name IS NULL THEN
        RAISE EXCEPTION 'Tabela ${table} sem PRIMARY KEY — estado inesperado, abortando';
      END IF;

      IF pk_cols = ARRAY[${fromArray}]::text[] THEN
        RAISE NOTICE 'trocando PK de ${table}: % -> (${toCols.join(", ")})', pk_cols;
        EXECUTE format('ALTER TABLE ${table} DROP CONSTRAINT %I', pk_name);
        ALTER TABLE ${table} ADD PRIMARY KEY (${toCols.join(", ")});
      ELSE
        RAISE NOTICE 'PK de ${table} já é % — nada a fazer', pk_cols;
      END IF;
    END
    $$
  `;
}

const DDL_ZONAS_FONTE = `
  ALTER TABLE zonas ADD COLUMN IF NOT EXISTS fonte text
`;

const DDL_SNAPSHOTS_COL = `
  ALTER TABLE snapshots
    ADD COLUMN IF NOT EXISTS cod_municipio_tse integer NOT NULL DEFAULT 0
`;

// CONCURRENTLY não pode rodar dentro de um bloco de transação. A chamada sai
// pelo protocolo simples (pool.query sem parâmetros) justamente por isso.
const DDL_SNAPSHOTS_IX_CONCURRENT = `
  CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_snap_lookup_par
    ON snapshots (cargo, turno, uf, cod_municipio_tse, cod_zona, ts)
`;

const DDL_SNAPSHOTS_IX_PLAIN = `
  CREATE INDEX IF NOT EXISTS ix_snap_lookup_par
    ON snapshots (cargo, turno, uf, cod_municipio_tse, cod_zona, ts)
`;

const DDL_MUNICIPIOS_CAPITAL = `
  ALTER TABLE municipios
    ADD COLUMN IF NOT EXISTS capital boolean NOT NULL DEFAULT false
`;

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

interface Counts {
  zonas: string;
  zonas_municipios: string;
  eleitorado: string;
  eleitorado_municipios: string;
  snapshots: string;
  snapshots_com_municipio: string;
  municipios: string;
  capitais: string;
}

async function readCounts(pool: import("@neondatabase/serverless").Pool): Promise<Partial<Counts>> {
  // Defensivo: colunas novas podem ainda não existir na 1ª run.
  const one = async (label: keyof Counts, sql: string): Promise<[string, string]> => {
    try {
      const r = await pool.query<{ n: string }>(sql);
      return [label, r.rows[0]?.n ?? "?"];
    } catch {
      return [label, "n/d (coluna ainda não existe)"];
    }
  };
  const pairs = await Promise.all([
    one("zonas", `SELECT COUNT(*)::text AS n FROM zonas`),
    one("zonas_municipios", `SELECT COUNT(DISTINCT cod_municipio_tse)::text AS n FROM zonas`),
    one("eleitorado", `SELECT COUNT(*)::text AS n FROM eleitorado WHERE ano = 2026`),
    one(
      "eleitorado_municipios",
      `SELECT COUNT(DISTINCT cod_municipio_tse)::text AS n FROM eleitorado WHERE ano = 2026`,
    ),
    one("snapshots", `SELECT COUNT(*)::text AS n FROM snapshots`),
    one(
      "snapshots_com_municipio",
      `SELECT COUNT(*)::text AS n FROM snapshots WHERE cod_municipio_tse <> 0`,
    ),
    one("municipios", `SELECT COUNT(*)::text AS n FROM municipios`),
    one("capitais", `SELECT COUNT(*)::text AS n FROM municipios WHERE capital`),
  ]);
  return Object.fromEntries(pairs) as Partial<Counts>;
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const pool = getPool();
  try {
    console.log("[0006] antes:", await readCounts(pool));

    // ── 1. zonas: PK de par + coluna fonte ───────────────────────────────
    console.log("\n[1/5] zonas — PK (uf, cod_municipio_tse, cod_zona) + coluna fonte");
    await pool.query(DDL_ZONAS_FONTE);
    await pool.query(
      ddlSwapPk("zonas", ["uf", "cod_zona"], ["uf", "cod_municipio_tse", "cod_zona"]),
    );
    // A FK zonas → municipios não é afetada pela troca de PK; confirmamos que
    // segue viva para não descobrir isso só no importador.
    const fk = await pool.query<{ n: string }>(`
      SELECT COUNT(*)::text AS n
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'zonas' AND c.contype = 'f'
    `);
    console.log(`      FK(s) em zonas preservadas: ${fk.rows[0]?.n ?? "?"}`);

    // ── 2. eleitorado: PK de par ─────────────────────────────────────────
    console.log("\n[2/5] eleitorado — PK (ano, uf, cod_municipio_tse, cod_zona)");
    await pool.query(
      ddlSwapPk(
        "eleitorado",
        ["ano", "uf", "cod_zona"],
        ["ano", "uf", "cod_municipio_tse", "cod_zona"],
      ),
    );

    // ── 3. snapshots: coluna + índice do par ─────────────────────────────
    console.log("\n[3/5] snapshots — cod_municipio_tse + ix_snap_lookup_par");
    await pool.query(DDL_SNAPSHOTS_COL);
    try {
      await pool.query(DDL_SNAPSHOTS_IX_CONCURRENT);
      console.log("      ix_snap_lookup_par criado (CONCURRENTLY)");
    } catch (err) {
      console.warn(`      CONCURRENTLY falhou (${(err as Error).message}); usando CREATE INDEX`);
      await pool.query(DDL_SNAPSHOTS_IX_PLAIN);
      console.log("      ix_snap_lookup_par criado (bloqueante)");
    }
    const ix = await pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'snapshots' ORDER BY indexname`,
    );
    console.log(`      índices em snapshots: ${ix.rows.map((r) => r.indexname).join(", ")}`);

    // ── 4. municipios.capital + seed das 27 capitais ─────────────────────
    console.log("\n[4/5] municipios — coluna capital + seed das 27 capitais");
    await pool.query(DDL_MUNICIPIOS_CAPITAL);
    const upd = await pool.query(
      `UPDATE municipios SET capital = true
       WHERE cod_ibge = ANY($1::char(7)[]) AND capital IS DISTINCT FROM true`,
      [CAPITAIS.map(([cod]) => cod)],
    );
    console.log(`      capitais marcadas nesta run: ${upd.rowCount ?? 0}`);
    const capCheck = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM municipios WHERE capital`,
    );
    const capTotal = Number(capCheck.rows[0]?.n ?? 0);
    console.log(`      capitais na tabela: ${capTotal} (esperado 27)`);
    if (capTotal !== CAPITAIS.length) {
      const faltando = await pool.query<{ cod: string }>(
        `SELECT c AS cod FROM UNNEST($1::char(7)[]) c
         WHERE NOT EXISTS (SELECT 1 FROM municipios m WHERE m.cod_ibge = c)`,
        [CAPITAIS.map(([cod]) => cod)],
      );
      if (faltando.rows.length > 0) {
        console.warn(
          `      WARN: cod_ibge de capital ausente em municipios: ${faltando.rows
            .map((r) => r.cod.trim())
            .join(", ")}`,
        );
      }
    }

    // ── 5. limpeza única de snapshots (E3 / ADR-0035 D3) ─────────────────
    console.log("\n[5/5] snapshots — limpeza única das linhas de ensaio (E3 / ADR-0035 D3)");
    const antesSnap = await pool.query<{ total: string; alvo: string; depois: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE ts <  $1::timestamptz)::text AS alvo,
              COUNT(*) FILTER (WHERE ts >= $1::timestamptz)::text AS depois
         FROM snapshots`,
      [CUTOFF_ENSAIO],
    );
    const s = antesSnap.rows[0];
    console.log(
      `      snapshots: ${s?.total} no total — ${s?.alvo} anteriores a ${CUTOFF_ENSAIO} (ensaio), ` +
        `${s?.depois} posteriores (preservados, § 10)`,
    );
    const del = await pool.query(`DELETE FROM snapshots WHERE ts < $1::timestamptz`, [
      CUTOFF_ENSAIO,
    ]);
    console.log(`      linhas apagadas: ${del.rowCount ?? 0}`);
    const depoisSnap = await pool.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM snapshots`);
    console.log(`      snapshots restantes: ${depoisSnap.rows[0]?.n ?? "?"}`);

    // ── relatório final ──────────────────────────────────────────────────
    console.log("\n[0006] depois:", await readCounts(pool));
    console.log(`[0006] concluída em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log(
      "[0006] próximo passo: eleitorado-import.ts e depois zonas-import.ts " +
        "(as tabelas ainda estão chaveadas por zona até serem reimportadas).",
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Falha na migration 0006:", err);
  process.exit(1);
});
