// data-pipeline/tse-mapping-reconcile.ts
//
// Corrige municipios.cod_municipio_tse com o código TSE real (4-5 dígitos),
// substituindo o placeholder IBGE 7-dígitos que foi inserido por ibge-import.ts.
//
// Estratégia (fallback por nome normalizado):
//   1. Lê pares (SG_UF, CD_MUNICIPIO, NM_MUNICIPIO) do CSV cacheado:
//      - build/tse-archives/eleitorado_local_votacao_2024/ (5.571 municípios, sem DF)
//      - build/tse-archives/votacao_partido_munzona_2022/votacao_partido_munzona_2022_DF.csv (DF)
//   2. Para cada município TSE, busca correspondência em municipios por (uf, nome normalizado).
//      Normalização: upper + remover diacríticos + trim + colapsar espaços múltiplos.
//   3. Faz UPDATE municipios SET cod_municipio_tse = <real> WHERE cod_ibge = <ibge>.
//   4. Reporta cobertura final e municípios sem match (warnings).
//
// Idempotente: pode ser rodado múltiplas vezes sem efeito colateral (ON CONFLICT UNIQUE update).
//
// Uso:
//   set -a && . ./.env.local && set +a
//   node --experimental-strip-types data-pipeline/tse-mapping-reconcile.ts

import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CACHE_DIR, getPool, iterCsv, readCsvHeader, toIntOrNull } from "./_tse-common.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// Aliases manuais: IBGE norm → TSE norm
//
// Casos onde a grafia difere além de diacríticos simples:
//   - Renomeações (Januário Cicco era Boa Saúde no TSE)
//   - Grafias alternativas (Graccho vs Gracho, Thomé vs Tomé)
//   - Nomes D'apostrophe vs D' sem apostrophe
//   - IBGE water-body codes sem TSE (Lagoa Mirim, Lagoa dos Patos, RS 4300001/4300002)
//     → mapeados para SKIP (sem código TSE, não é município real)
//
// Key: "UF|NOME_IBGE_NORMALIZADO"  →  TSE nome normalizado (para lookup na tsePairs map)
//       ou "SKIP" para entradas que não são municípios reais e devem ser ignoradas.
// ─────────────────────────────────────────────────────────────────────────────

// Entradas com TSE code direto (bypass do nome-match): cod_ibge → cod_municipio_tse
// Usamos cod_ibge como chave para evitar ambiguidade.
const MANUAL_IBGE_TO_TSE: Record<string, number | "SKIP"> = {
  // RN: Açu → ASSÚ (TSE usa Assú, IBGE usa Açu)
  "2400208": 16039,
  // RN: Arês → AREZ (TSE usa grafia antiga)
  "2401206": 16233,
  // RN: Januário Cicco → BOA SAÚDE (TSE ainda não atualizou o nome)
  "2405306": 17035,
  // MG: Dona Euzébia → DONA EUSÉBIA (acento diferente)
  "3122900": 44571,
  // MG: Olhos-d'Água → OLHOS D'ÁGUA (hífen vs espaço)
  "3145455": 41203,
  // MG: Pingo-d'Água → PINGO D'ÁGUA
  "3150539": 41360,
  // MG: Sem-Peixe → SEM PEIXE (hífen vs espaço)
  "3165560": 40827,
  // MG: São Tomé das Letras → SÃO THOMÉ DAS LETRAS (Thomé vs Tomé)
  "3165206": 53031,
  // MT: Santo Antônio de Leverger → SANTO ANTÔNIO DO LEVERGER (preposição)
  "5107800": 91553,
  // PA: Eldorado do Carajás → ELDORADO DOS CARAJÁS (artigo diferente)
  "1502954": 4120,
  // PE: Fernando de Noronha (território especial — TSE código 30015, só aparece em 2022)
  "2605459": 30015,
  // PR: Munhoz de Melo → MUNHOZ DE MELLO (duplo L)
  "4116307": 77119,
  // RO: Alvorada D'Oeste → ALVORADA DO OESTE (apostrophe vs preposição)
  "1100346": 337,
  // RO: Espigão D'Oeste → ESPIGÃO DO OESTE
  "1100098": 256,
  // RS: Lagoa Mirim — não é município real (IBGE water body code 4300001)
  "4300001": "SKIP",
  // RS: Lagoa dos Patos — não é município real (IBGE water body code 4300002)
  "4300002": "SKIP",
  // SE: Amparo do São Francisco → AMPARO DE SÃO FRANCISCO (preposição)
  "2800100": 31011,
  // SE: Gracho Cardoso → GRACCHO CARDOSO (cc duplo no TSE)
  "2802601": 31518,
  // SP: São Luiz do Paraitinga → SÃO LUÍS DO PARAITINGA (Luiz vs Luís)
  "3550001": 71013,
  // BA: Camacan → CAMACÃ (sem til no IBGE, com til no TSE)
  "2905602": 34118,
};

// ─────────────────────────────────────────────────────────────────────────────
// Normalização de nome de município para match fuzzy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normaliza nome de município para comparação case-insensitive e sem diacríticos.
 * Aplica: upper → remover diacríticos → trim → colapsar espaços.
 *
 * Exemplos:
 *   "Acrelândia" → "ACRELANDIA"
 *   "ACRELÂNDIA" → "ACRELANDIA"
 *   "São Paulo"  → "SAO PAULO"
 *   "SÃO PAULO"  → "SAO PAULO"
 */
export function normalizeMunicipalityName(name: string): string {
  return name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove combining diacritics
    .replace(/\s+/g, " ")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Coleta de pares TSE (uf, cod_municipio_tse, nm_municipio) das fixtures
// ─────────────────────────────────────────────────────────────────────────────

interface TseMunEntry {
  uf: string;
  codMunicipioTse: number;
  nomeTse: string;
  nomeNorm: string;
}

/**
 * Lê pares (SG_UF, CD_MUNICIPIO, NM_MUNICIPIO) do CSV de eleitorado 2024.
 * Retorna entradas deduplicadas por (uf, codMunicipioTse).
 */
async function collectFromEleitorado2024(): Promise<TseMunEntry[]> {
  const dir = resolve(CACHE_DIR, "eleitorado_local_votacao_2024");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".csv"));
  if (files.length === 0) {
    throw new Error(`Nenhum CSV em ${dir}. Rode eleitorado-import.ts primeiro.`);
  }
  const csvPath = resolve(dir, files[0]!);
  console.log(`  [eleitorado] lendo ${csvPath.split("/").pop()}`);

  const header = await readCsvHeader(csvPath);
  const iUf = header.get("SG_UF");
  const iCod = header.get("CD_MUNICIPIO");
  const iNome = header.get("NM_MUNICIPIO");
  if (iUf === undefined || iCod === undefined || iNome === undefined) {
    throw new Error(`Colunas SG_UF / CD_MUNICIPIO / NM_MUNICIPIO ausentes em eleitorado CSV`);
  }

  const seen = new Map<string, TseMunEntry>(); // key = "UF|cod"
  for await (const fields of iterCsv(csvPath)) {
    const uf = (fields[iUf] ?? "").trim();
    const codRaw = toIntOrNull(fields[iCod]);
    const nome = (fields[iNome] ?? "").trim();
    if (uf.length !== 2 || codRaw == null || !nome) continue;
    const key = `${uf}|${codRaw}`;
    if (!seen.has(key)) {
      seen.set(key, {
        uf,
        codMunicipioTse: codRaw,
        nomeTse: nome,
        nomeNorm: normalizeMunicipalityName(nome),
      });
    }
  }
  console.log(`  [eleitorado] ${seen.size} municípios distintos coletados`);
  return [...seen.values()];
}

/**
 * Coleta o DF a partir do CSV de votação 2022 (DF não aparece em eleitorado 2024
 * porque não há eleição municipal no DF).
 * Colunas 2022 (1-indexed): SG_UF=11, CD_MUNICIPIO=14, NM_MUNICIPIO=15.
 */
async function collectDfFrom2022(): Promise<TseMunEntry[]> {
  const dir = resolve(CACHE_DIR, "votacao_partido_munzona_2022");
  const dfCsv = resolve(dir, "votacao_partido_munzona_2022_DF.csv");
  console.log(`  [DF-2022] lendo ${dfCsv.split("/").pop()}`);

  const header = await readCsvHeader(dfCsv);
  const iUf = header.get("SG_UF");
  const iCod = header.get("CD_MUNICIPIO");
  const iNome = header.get("NM_MUNICIPIO");
  if (iUf === undefined || iCod === undefined || iNome === undefined) {
    throw new Error(`Colunas SG_UF / CD_MUNICIPIO / NM_MUNICIPIO ausentes em DF CSV 2022`);
  }

  const seen = new Map<string, TseMunEntry>();
  for await (const fields of iterCsv(dfCsv)) {
    const uf = (fields[iUf] ?? "").trim();
    if (uf !== "DF") continue;
    const codRaw = toIntOrNull(fields[iCod]);
    const nome = (fields[iNome] ?? "").trim();
    if (codRaw == null || !nome) continue;
    const key = `${uf}|${codRaw}`;
    if (!seen.has(key)) {
      seen.set(key, {
        uf,
        codMunicipioTse: codRaw,
        nomeTse: nome,
        nomeNorm: normalizeMunicipalityName(nome),
      });
    }
  }
  console.log(`  [DF-2022] ${seen.size} municípios DF coletados`);
  return [...seen.values()];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const t0 = Date.now();
  console.log("[tse-mapping-reconcile] iniciando");

  // 1. Coletar pares TSE
  console.log("\n=== Fase 1: coleta de pares TSE ===");
  const [entriesEleitorado, entriesDf] = await Promise.all([
    collectFromEleitorado2024(),
    collectDfFrom2022(),
  ]);

  // Dedup: eleitorado tem precedência; DF complementa
  const tsePairs = new Map<string, TseMunEntry>();
  for (const e of [...entriesEleitorado, ...entriesDf]) {
    const key = `${e.uf}|${e.nomeNorm}`;
    if (!tsePairs.has(key)) tsePairs.set(key, e);
  }
  console.log(`  total TSE pairs: ${tsePairs.size}`);

  // 2. Carregar municipios da tabela
  console.log("\n=== Fase 2: carrega municipios do Postgres ===");
  const pool = getPool();

  interface MunicipioRow {
    cod_ibge: string;
    uf: string;
    nome: string;
    cod_municipio_tse_atual: number;
  }

  const { rows: municipiosRows } = await pool.query<MunicipioRow>(
    "SELECT cod_ibge, uf, nome, cod_municipio_tse AS cod_municipio_tse_atual FROM municipios ORDER BY uf, nome",
  );
  console.log(`  municipios carregados: ${municipiosRows.length}`);

  // 3. Match por (uf, nome normalizado) + aliases manuais
  console.log("\n=== Fase 3: match por (uf, nome normalizado) + aliases manuais ===");

  interface UpdateRow {
    codIbge: string;
    codMunicipioTseNovo: number;
    nomeTse: string;
  }

  const updates: UpdateRow[] = [];
  const warnings: string[] = [];
  const skipped: string[] = [];
  const byUf = new Map<string, number>(); // UF → matched count

  for (const mun of municipiosRows) {
    // Passo 1: verifica alias manual (tem precedência sobre nome-match)
    const manualEntry = MANUAL_IBGE_TO_TSE[mun.cod_ibge];
    if (manualEntry !== undefined) {
      if (manualEntry === "SKIP") {
        skipped.push(
          `SKIP (water body / no-TSE) uf=${mun.uf} ibge=${mun.cod_ibge} nome="${mun.nome}"`,
        );
        byUf.set(mun.uf, (byUf.get(mun.uf) ?? 0) + 1); // conta como "tratado"
        continue;
      }
      if (mun.cod_municipio_tse_atual !== manualEntry) {
        updates.push({
          codIbge: mun.cod_ibge,
          codMunicipioTseNovo: manualEntry,
          nomeTse: `[manual] ${mun.nome}`,
        });
      }
      byUf.set(mun.uf, (byUf.get(mun.uf) ?? 0) + 1);
      continue;
    }

    // Passo 2: match por nome normalizado
    const nomeNorm = normalizeMunicipalityName(mun.nome);
    const key = `${mun.uf}|${nomeNorm}`;
    const tse = tsePairs.get(key);
    if (!tse) {
      warnings.push(
        `NO_MATCH uf=${mun.uf} ibge=${mun.cod_ibge} nome="${mun.nome}" norm="${nomeNorm}"`,
      );
      continue;
    }
    if (mun.cod_municipio_tse_atual !== tse.codMunicipioTse) {
      updates.push({
        codIbge: mun.cod_ibge,
        codMunicipioTseNovo: tse.codMunicipioTse,
        nomeTse: tse.nomeTse,
      });
    }
    byUf.set(mun.uf, (byUf.get(mun.uf) ?? 0) + 1);
  }

  const matched = municipiosRows.length - warnings.length;
  console.log(`  matches: ${matched}/${municipiosRows.length}`);
  console.log(`  skipped (no TSE code expected): ${skipped.length}`);
  console.log(`  updates necessários: ${updates.length}`);
  console.log(`  warnings (sem match): ${warnings.length}`);
  if (skipped.length > 0) {
    for (const s of skipped) console.log(`    ${s}`);
  }

  // 4. Aplicar updates em batch
  console.log("\n=== Fase 4: aplica UPDATEs ===");
  let updated = 0;
  const BATCH_SIZE = 500;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    if (batch.length === 0) break;
    // UPDATE via UNNEST para eficiência
    const codIbges = batch.map((r) => r.codIbge);
    const codsTse = batch.map((r) => r.codMunicipioTseNovo);
    await pool.query(
      `
      UPDATE municipios
      SET cod_municipio_tse = upd.cod_municipio_tse
      FROM UNNEST($1::char(7)[], $2::int4[]) AS upd(cod_ibge, cod_municipio_tse)
      WHERE municipios.cod_ibge = upd.cod_ibge
      `,
      [codIbges, codsTse],
    );
    updated += batch.length;
    if (updated % 1000 === 0 || i + BATCH_SIZE >= updates.length) {
      console.log(`  atualizado ${updated} de ${updates.length}...`);
    }
  }
  console.log(`  ${updated} linhas atualizadas`);

  // 5. Verificação final
  // Placeholders: cod_municipio_tse com 7+ dígitos = ainda tem código IBGE.
  // Exceção: entradas SKIP (Lagoa Mirim RS=4300001, Lagoa dos Patos RS=4300002)
  // são water bodies do IBGE sem TSE — aceitamos que ficam com código IBGE.
  const skipCodes = new Set(
    Object.entries(MANUAL_IBGE_TO_TSE)
      .filter(([, v]) => v === "SKIP")
      .map(([k]) => k),
  );

  console.log("\n=== Fase 5: verificação final ===");
  const { rows: afterRows } = await pool.query<{
    uf: string;
    cnt: string;
    placeholder_cnt: string;
  }>(
    `
    SELECT uf,
           COUNT(*)::text AS cnt,
           COUNT(*) FILTER (WHERE LENGTH(cod_municipio_tse::text) >= 7)::text AS placeholder_cnt
    FROM municipios
    GROUP BY uf
    ORDER BY uf
    `,
  );

  let totalMuns = 0;
  let totalPlaceholders = 0;
  let ufsWithPlaceholders = 0;
  for (const r of afterRows) {
    const cnt = Number(r.cnt);
    const ph = Number(r.placeholder_cnt);
    totalMuns += cnt;
    totalPlaceholders += ph;
    if (ph > 0) {
      ufsWithPlaceholders++;
      console.log(
        `  WARN: ${r.uf} ainda tem ${ph}/${cnt} placeholders (inclui ${skipCodes.size > 0 ? "possíveis water-bodies" : "gaps"})`,
      );
    }
  }

  // Real gaps = placeholders minus known SKIP entries
  const realGaps = totalPlaceholders - skipCodes.size;
  const coveredPct = (((totalMuns - realGaps) / totalMuns) * 100).toFixed(2);
  console.log("\n─────────────────────────────────────────────────");
  console.log("[tse-mapping-reconcile] RESULTADO FINAL");
  console.log(`  municipios totais        : ${totalMuns}`);
  console.log(`  com cod TSE real         : ${totalMuns - realGaps} (${coveredPct}%)`);
  console.log(`  water-bodies sem TSE (ok): ${skipCodes.size}`);
  console.log(`  gaps reais (cod IBGE)    : ${realGaps}`);
  console.log(`  UFs com placeholder      : ${ufsWithPlaceholders}`);
  console.log(`  warnings sem match       : ${warnings.length}`);
  console.log(`  updates aplicados        : ${updated}`);
  console.log(`  tempo total              : ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log("─────────────────────────────────────────────────");

  if (warnings.length > 0) {
    console.log("\n=== Municípios sem match TSE (warnings) ===");
    for (const w of warnings) {
      console.log(`  ${w}`);
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Falha em tse-mapping-reconcile:", err);
  process.exit(1);
});
