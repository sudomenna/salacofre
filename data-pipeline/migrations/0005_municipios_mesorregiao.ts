// data-pipeline/migrations/0005_municipios_mesorregiao.ts
//
// Migration S06/F4d — Fase 2 (chore do kickoff 2026-05-18).
//
// Adiciona mesorregião IBGE como dimensão geográfica intermediária entre UF e
// município. Usada por `aggregate_by_mesorregiao` (api/model/project.py) para
// alimentar o bloco "Apuração por mesorregião" da página /uf/[sigla]/governador
// (spec 005, T-04 do print 3 NYT-style).
//
// Schema (decisão S06/F4d Fase 2):
//   - Tabela nova `mesorregioes(cod char(4) PK, nome text, uf_sigla char(2))`.
//     Cod IBGE da mesorregião tem 4 dígitos (UF[2]+meso[2]). Ex.: 3510 = SP / Itapeva.
//     A sprint doc menciona `char(40)` — corrigido aqui para `char(4)` que é
//     o tamanho real da chave IBGE. Documentado no Retrospective S06.
//   - Coluna nova `municipios.mesorregiao_cod char(4) NULL REFERENCES mesorregioes(cod)`.
//     NULLABLE para forward-compat: dev local sem CSV de população segue
//     funcionando, e o agregador Python omite o bloco mesorregiões quando o
//     campo está NULL para todos os municípios da UF.
//
// Idempotência (constituição § 10 — append-only friendly):
//   - `CREATE TABLE IF NOT EXISTS mesorregioes ...`
//   - `ALTER TABLE municipios ADD COLUMN IF NOT EXISTS mesorregiao_cod ...`
//   - FK adicionada com `IF NOT EXISTS` via DO block (Postgres não suporta
//     `ADD CONSTRAINT IF NOT EXISTS` diretamente).
//   - População via UPSERT (`ON CONFLICT (cod_ibge) DO UPDATE`).
//
// Fonte do dado de mesorregião:
//   O shapefile IBGE 2022 enviado em `docs/ibge-2022/BR_Municipios_2022/`
//   tem schema DBF reduzido: apenas `CD_MUN, NM_MUN, SIGLA_UF, AREA_KM2`
//   (verificado com Python struct em 2026-05-18). NÃO tem `NM_MESO`/`CD_MESO`.
//
//   Esperamos uma das duas fontes em ordem de prioridade:
//     1. `docs/ibge-2022/municipios-mesorregiao.csv` — CSV simples com header
//        `cod_municipio_ibge,cod_meso,nome_meso,uf` (separador `,`,
//        encoding UTF-8). Exemplo de linha:
//          3550308,3515,"Metropolitana de São Paulo",SP
//        Obtenha em: https://ftp.ibge.gov.br/Organizacao_do_Territorio/Divisao_Territorial/2022/
//        (arquivo `RELATORIO_DTB_BRASIL_MUNICIPIO_2022.xls`, exporte como CSV
//        mantendo as 4 colunas acima e renomeie).
//     2. Shapefile IBGE mesorregiões 2022 (`BR_Mesorregioes_2022.shp`) +
//        derivação CD_MUN[0:4] = CD_MESO. Não suportado nesta migration
//        (parsing shapefile requer dep node extra; fora da stack).
//
//   Se NENHUMA fonte estiver disponível, a migration cria o schema e termina
//   com população 0 — não falha. Rows ficam NULL e podem ser populadas em
//   migration futura ou job dedicado quando o CSV chegar. O agregador
//   Python lida graciosamente com `mesorregiao_cod = NULL`.
//
// Cross-refs:
//   - Sprint S06: docs/sprints/2026-S06-f4d-2t-governadores.md § "Fase 2 — Mesorregião"
//   - Spec 005 (página UF Governador): docs/specs/005-pagina-uf-governador/spec.md
//   - Schema canônico: lib/db/schema.ts (ainda não foi atualizado — fazer em PR
//     subsequente quando seed CSV existir; opcional pra esta migration funcionar)
//   - Helper Python: api/model/project.py → `aggregate_by_mesorregiao`
//   - Type frontend: lib/edge-config/types.ts → `EdgeMesorregiao`
//
// Reproduzir contra Neon:
//   set -a && . ./.env.local && set +a && pnpm tsx data-pipeline/migrations/0005_municipios_mesorregiao.ts
//
// Resultado esperado (sem CSV — caso atual em 2026-05-18):
//   antes: { total_munic, with_meso: '0', total_meso: '0' }
//   schema OK
//   [populate] CSV não encontrado em <path> — skipping (NULL ok)
//   depois: { total_munic, with_meso: '0', total_meso: '0' }
//
// Resultado esperado (com CSV presente):
//   antes: { total_munic: '5570', with_meso: '0', total_meso: '0' }
//   schema OK
//   [populate] CSV lido: <N> linhas
//   [populate] mesorregioes inseridas: 137
//   [populate] municipios atualizados: 5570
//   depois: { total_munic: '5570', with_meso: '5570', total_meso: '137' }

import { createReadStream, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { getPool } from "../_tse-common.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const MESO_CSV_PATH = resolve(ROOT, "docs/ibge-2022/municipios-mesorregiao.csv");

// ─────────────────────────────────────────────────────────────────────────────
// Schema DDL — idempotente
// ─────────────────────────────────────────────────────────────────────────────

const DDL_CREATE_MESO_TABLE = `
  CREATE TABLE IF NOT EXISTS mesorregioes (
    cod char(4) PRIMARY KEY,
    nome text NOT NULL,
    uf_sigla char(2) NOT NULL
  )
`;

const DDL_INDEX_MESO_UF = `
  CREATE INDEX IF NOT EXISTS ix_meso_uf ON mesorregioes(uf_sigla)
`;

const DDL_ADD_COLUMN = `
  ALTER TABLE municipios
    ADD COLUMN IF NOT EXISTS mesorregiao_cod char(4)
`;

const DDL_INDEX_MUNIC_MESO = `
  CREATE INDEX IF NOT EXISTS ix_municipio_meso ON municipios(mesorregiao_cod)
`;

// Postgres não tem `ADD CONSTRAINT IF NOT EXISTS` para FK; usamos DO block que
// checa pg_constraint primeiro. Idempotente.
const DDL_ADD_FK = `
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'fk_municipios_mesorregiao'
    ) THEN
      ALTER TABLE municipios
        ADD CONSTRAINT fk_municipios_mesorregiao
        FOREIGN KEY (mesorregiao_cod) REFERENCES mesorregioes(cod)
        ON DELETE SET NULL;
    END IF;
  END
  $$
`;

// ─────────────────────────────────────────────────────────────────────────────
// Tipos e parse CSV
// ─────────────────────────────────────────────────────────────────────────────

interface MesoCsvRow {
  cod_municipio_ibge: string; // 7 dígitos
  cod_meso: string; // 4 dígitos
  nome_meso: string;
  uf: string; // 2 chars
}

/**
 * Parse minimalista de CSV — separador `,`, aspas duplas opcionais. CSV nosso
 * é controlado (exporte manual do XLS IBGE), então não precisa de RFC 4180
 * completo. Tolerante a aspas no `nome_meso` (que contém vírgulas em alguns
 * estados — ex.: "Sul Goiano, Sul de Goiás" não — mas "Vale do Itajaí" sim).
 */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

async function readMesoCsv(path: string): Promise<MesoCsvRow[]> {
  const rows: MesoCsvRow[] = [];
  const stream = createReadStream(path, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
  let isFirst = true;
  // Posicões resolvidas após validação do header.
  let posMunic = -1;
  let posMeso = -1;
  let posNome = -1;
  let posUf = -1;
  for await (const raw of rl) {
    if (!raw) continue;
    const cols = parseCsvLine(raw);
    if (isFirst) {
      const headerIdx: Record<string, number> = {};
      cols.forEach((c, i) => {
        headerIdx[c.trim().toLowerCase()] = i;
      });
      const required = ["cod_municipio_ibge", "cod_meso", "nome_meso", "uf"];
      for (const r of required) {
        if (headerIdx[r] === undefined) {
          throw new Error(
            `CSV ${path} sem coluna "${r}". Header esperado: ${required.join(",")}. ` +
              `Encontrado: ${cols.join(",")}`,
          );
        }
      }
      // Após o for loop validar todos, os 4 são guaranteed numbers.
      posMunic = headerIdx.cod_municipio_ibge as number;
      posMeso = headerIdx.cod_meso as number;
      posNome = headerIdx.nome_meso as number;
      posUf = headerIdx.uf as number;
      isFirst = false;
      continue;
    }
    const cod_municipio_ibge = (cols[posMunic] ?? "").trim();
    const cod_meso = (cols[posMeso] ?? "").trim();
    const nome_meso = (cols[posNome] ?? "").trim();
    const uf = (cols[posUf] ?? "").trim().toUpperCase();
    if (!cod_municipio_ibge || !cod_meso || !nome_meso || !uf) continue;
    if (cod_municipio_ibge.length !== 7) continue; // skip mal-formado
    if (cod_meso.length !== 4) continue;
    if (uf.length !== 2) continue;
    rows.push({ cod_municipio_ibge, cod_meso, nome_meso, uf });
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const pool = getPool();
  try {
    // ── antes ─────────────────────────────────────────────────────────────
    // Defensivo: a tabela `mesorregioes` pode ainda não existir na 1ª run.
    const beforeCounts = await pool
      .query(`
        SELECT
          (SELECT COUNT(*) FROM municipios) AS total_munic,
          (SELECT COUNT(mesorregiao_cod) FROM municipios) AS with_meso,
          (SELECT COUNT(*) FROM mesorregioes) AS total_meso
      `)
      .catch(() => ({
        rows: [
          {
            total_munic: "?",
            with_meso: "0 (col ainda nao existe)",
            total_meso: "0 (tab ainda nao existe)",
          },
        ],
      }));
    console.log("antes:", beforeCounts.rows[0]);

    // ── schema ────────────────────────────────────────────────────────────
    console.log("[schema] criando tabela mesorregioes...");
    await pool.query(DDL_CREATE_MESO_TABLE);
    await pool.query(DDL_INDEX_MESO_UF);
    console.log("[schema] adicionando municipios.mesorregiao_cod...");
    await pool.query(DDL_ADD_COLUMN);
    await pool.query(DDL_INDEX_MUNIC_MESO);
    console.log("[schema] garantindo FK municipios → mesorregioes...");
    await pool.query(DDL_ADD_FK);
    console.log("[schema] OK");

    // ── populate ──────────────────────────────────────────────────────────
    if (!existsSync(MESO_CSV_PATH)) {
      console.log(
        `[populate] CSV não encontrado em ${MESO_CSV_PATH} — schema criado, população skipped.`,
      );
      console.log(
        `[populate] Para popular: obtenha o arquivo "RELATORIO_DTB_BRASIL_MUNICIPIO_2022" em`,
      );
      console.log(
        `[populate]   https://ftp.ibge.gov.br/Organizacao_do_Territorio/Divisao_Territorial/2022/`,
      );
      console.log(
        `[populate] Exporte para CSV (UTF-8) com 4 colunas: cod_municipio_ibge,cod_meso,nome_meso,uf`,
      );
      console.log(`[populate] Salve em ${MESO_CSV_PATH} e re-rode esta migration.`);
    } else {
      console.log(`[populate] lendo ${MESO_CSV_PATH}...`);
      const rows = await readMesoCsv(MESO_CSV_PATH);
      console.log(`[populate] CSV lido: ${rows.length} linhas`);

      // Dedup mesorregiões por (cod, nome, uf).
      const mesoMap = new Map<string, { nome: string; uf: string }>();
      for (const r of rows) {
        if (!mesoMap.has(r.cod_meso)) {
          mesoMap.set(r.cod_meso, { nome: r.nome_meso, uf: r.uf });
        }
      }

      // Insert mesorregioes (UPSERT — idempotente).
      const mesoTuples: string[] = [];
      const mesoValues: unknown[] = [];
      let i = 0;
      for (const [cod, meta] of mesoMap.entries()) {
        const base = i * 3;
        mesoTuples.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
        mesoValues.push(cod, meta.nome, meta.uf);
        i++;
      }
      if (mesoTuples.length > 0) {
        const sqlMeso = `
          INSERT INTO mesorregioes (cod, nome, uf_sigla)
          VALUES ${mesoTuples.join(", ")}
          ON CONFLICT (cod) DO UPDATE SET
            nome = EXCLUDED.nome,
            uf_sigla = EXCLUDED.uf_sigla
        `;
        await pool.query(sqlMeso, mesoValues);
        console.log(`[populate] mesorregioes inseridas/atualizadas: ${mesoMap.size}`);
      }

      // Update municipios.mesorregiao_cod em batch via UNNEST.
      const codIbges: string[] = rows.map((r) => r.cod_municipio_ibge);
      const codMesos: string[] = rows.map((r) => r.cod_meso);
      const sqlMunic = `
        UPDATE municipios m
        SET mesorregiao_cod = upd.cod_meso
        FROM (
          SELECT * FROM UNNEST($1::char(7)[], $2::char(4)[])
            AS t(cod_ibge, cod_meso)
        ) upd
        WHERE m.cod_ibge = upd.cod_ibge
      `;
      const result = await pool.query(sqlMunic, [codIbges, codMesos]);
      console.log(`[populate] municipios atualizados: ${result.rowCount ?? 0}`);
    }

    // ── depois ────────────────────────────────────────────────────────────
    const afterCounts = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM municipios) AS total_munic,
        (SELECT COUNT(mesorregiao_cod) FROM municipios) AS with_meso,
        (SELECT COUNT(*) FROM mesorregioes) AS total_meso
    `);
    console.log("depois:", afterCounts.rows[0]);

    // ── breakdown por UF ───────────────────────────────────────────────────
    const byUf = await pool.query(`
      SELECT
        uf,
        COUNT(*) AS municipios,
        COUNT(mesorregiao_cod) AS com_meso,
        COUNT(DISTINCT mesorregiao_cod) AS meso_distintas
      FROM municipios
      GROUP BY uf
      ORDER BY uf
    `);
    if (byUf.rows.length > 0) {
      console.log("breakdown por UF (top 5):");
      for (const r of byUf.rows.slice(0, 5)) {
        console.log(
          `  ${r.uf}: ${r.municipios} municípios, ${r.com_meso} com meso, ${r.meso_distintas} mesorregiões distintas`,
        );
      }
      if (byUf.rows.length > 5) console.log(`  ... e mais ${byUf.rows.length - 5} UFs`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Falha na migration:", err);
  process.exit(1);
});
