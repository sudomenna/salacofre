/**
 * 0007 — Boa Esperança do Norte (MT) entra em `municipios`
 *
 * ## Problema
 *
 * `municipios` foi populada a partir da malha do IBGE de 2022
 * (`data-pipeline/ibge-import.ts`). **Boa Esperança do Norte (MT)** só foi
 * instalado em **1º de janeiro de 2025** — criação aprovada em 2000, mas
 * reconhecida pelo STF apenas em outubro de 2023 —, então não existe naquela
 * malha. MT tem 141 linhas na nossa base contra 142 municípios reais.
 *
 * Consequência medida em 2026-09-11: o município aparece em `eleitorado`
 * (4.243 eleitores aptos, zona 43), que não tem FK, mas **não entra em
 * `zonas`**, que tem `FK cod_municipio_tse → municipios ON DELETE RESTRICT`.
 * Como `lib/tse/targets.ts` enumera os alvos de ingestão a partir de `zonas`,
 * o par `(MT, 73709, 43)` nunca seria requisitado ao TSE — os votos daquele
 * município ficariam de fora, em silêncio. Enquanto isso, `zonas-import.ts`
 * só conseguia rodar com `--skip-orphans`, que rebaixa o aborto a aviso.
 *
 * ## Código IBGE — de onde veio
 *
 * `5101837`, confirmado no portal oficial da própria prefeitura
 * (`boaesperancadonorte.mt.gov.br/pages/codigos-de-identificacao-do-municipio`,
 * consultado em 2026-09-11), que publica IBGE 5101837, inscrição estadual
 * 278009 e código TOM 1182. O site do IBGE (`cidades.ibge.gov.br` e
 * `ibge.gov.br/cidades-e-estados`) responde **403 a cliente não-navegador**,
 * então não foi possível confirmar direto na fonte primária por automação —
 * mesma limitação já registrada para `www.tse.jus.br` em `tse_docs/README.md`.
 * O código TSE `73709` **não** foi pesquisado: veio do próprio CSV de
 * eleitorado do TSE, que é a fonte de verdade para esse campo.
 *
 * `geo_centroid` e `populacao` ficam NULL (ambos nullable). **Atenção**: o
 * mapa municipal pinta por `cod_ibge` via PMTiles
 * (`components/atoms/maps/ChoroplethMapUF.tsx`, `promoteId: "CD_MUN"`), e o
 * arquivo `municipios.pmtiles` foi gerado da mesma malha de 2022 — é provável
 * que este município **não tenha polígono lá** e siga sem pintar, mesmo com o
 * dado correto. Regerar o PMTiles é trabalho separado; a lacuna de dado é esta
 * migration, a lacuna de desenho não.
 *
 * ## Idempotência
 *
 * `ON CONFLICT (cod_ibge) DO NOTHING`. Rodar duas vezes não muda nada.
 *
 * Reproduzir contra Neon:
 *   set -a && . ./.env.local && set +a && \
 *     node --experimental-strip-types data-pipeline/migrations/0007_municipio_boa_esperanca_do_norte.ts
 *
 * Depois desta migration, `zonas-import.ts` roda **sem** `--skip-orphans` e o
 * total de pares sobe de 6.109 para 6.110.
 *
 * Cross-refs: ADR-0035 D1 (par como unidade de ingestão),
 * `docs/_meta/handoff-2026-09-11.md` § Pendências.
 */
import { getPool } from "../_tse-common.ts";

const COD_IBGE = "5101837";
const COD_TSE = 73709;
const UF = "MT";
const NOME = "Boa Esperança do Norte";

async function main(): Promise<void> {
  const pool = getPool();
  try {
    const antes = await pool.query<{ n: string }>(
      "SELECT COUNT(*) AS n FROM municipios WHERE uf = $1",
      [UF],
    );
    console.log(`[0007] municípios de ${UF} antes: ${antes.rows[0]?.n}`);

    const jaExiste = await pool.query(
      "SELECT cod_ibge FROM municipios WHERE cod_ibge = $1 OR cod_municipio_tse = $2",
      [COD_IBGE, COD_TSE],
    );
    if ((jaExiste.rowCount ?? 0) > 0) {
      console.log("[0007] já presente — no-op.");
    } else {
      const r = await pool.query(
        `INSERT INTO municipios (cod_ibge, cod_municipio_tse, uf, nome, capital)
         VALUES ($1, $2, $3, $4, false)
         ON CONFLICT (cod_ibge) DO NOTHING`,
        [COD_IBGE, COD_TSE, UF, NOME],
      );
      console.log(`[0007] inserido: ${r.rowCount} linha(s) — ${NOME} (${COD_IBGE}/${COD_TSE})`);
    }

    const depois = await pool.query<{ n: string }>(
      "SELECT COUNT(*) AS n FROM municipios WHERE uf = $1",
      [UF],
    );
    console.log(`[0007] municípios de ${UF} depois: ${depois.rows[0]?.n} (esperado 142)`);

    const orfaos = await pool.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM eleitorado e
       WHERE e.ano = 2026
         AND NOT EXISTS (SELECT 1 FROM municipios m WHERE m.cod_municipio_tse = e.cod_municipio_tse)`,
    );
    console.log(`[0007] pares de eleitorado sem município correspondente: ${orfaos.rows[0]?.n}`);
    console.log("[0007] próximo passo: rodar zonas-import.ts SEM --skip-orphans.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[0007] falha:", err);
  process.exit(1);
});
