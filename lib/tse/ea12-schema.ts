/**
 * lib/tse/ea12-schema.ts
 *
 * Zod schema do EA12 — "Arquivo de configuração de municípios" do TSE.
 *
 * Fonte: PDF oficial `TSE-EA12-Arquivo-de-configuracao-de-municipios.md`
 * (versão 2026-05-22), extraído em
 * `tse_docs/txt/tse-ea12-arquivo-de-configuracao-de-municipios.txt`.
 *
 * Nome do arquivo: `mun-e<número da eleição>-cm.json` — **um único arquivo por
 * eleição**, publicado sob `comum/config/`. Ex.: `mun-e012345-cm.json`.
 *
 * Por que ele importa (ADR-0035 D1): o EA12 é a única fonte oficial do mapa
 * completo município → zonas. Sem ele, o pipeline deriva os pares
 * (município × zona) do CSV de eleitorado 2024 — uma aproximação boa mas de
 * outro ciclo. Com ele, os pares são os que o TSE efetivamente publicará como
 * arquivos EA20 em 2026.
 *
 * `.passthrough()` em todos os níveis: o TSE adiciona campos sem aviso (ver a
 * nota equivalente em `ea20-schema.ts`). Só a ausência ou o tipo errado dos
 * campos que o pipeline consome deve falhar.
 *
 * Nenhum campo numérico vira número aqui. `cd` (município) vem com **cinco
 * dígitos preenchidos com zero à esquerda** e `z[]` com **quatro** — a
 * conversão é explícita, via `parseCodigoTse`, para o valor bruto do TSE
 * continuar auditável (constituição § 6).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Elemento: mu (município ou localidade do exterior)
// ---------------------------------------------------------------------------

export const EA12MunicipioSchema = z
  .object({
    /** Código do município na Justiça Eleitoral, 5 dígitos com zeros à esquerda. Ex.: "00001". */
    cd: z.string(),
    /** Código IBGE do município, 5 dígitos com zeros à esquerda (campo do TSE). */
    cdi: z.string().optional(),
    /** Nome do município. */
    nm: z.string(),
    /** "s" = é capital da UF; "n" = não é. */
    c: z.string().optional(),
    /** Zonas eleitorais do município — 4 dígitos com zeros à esquerda. Ex.: ["0001","0002"]. */
    z: z.array(z.string()),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Elemento: abr (abrangência — uma UF; "zz" para o Exterior)
// ---------------------------------------------------------------------------

export const EA12AbrangenciaSchema = z
  .object({
    /** Sigla da UF em minúsculas no arquivo do TSE. Ex.: "am", "sp", "zz". */
    cd: z.string(),
    /** Nome descritivo da UF. */
    ds: z.string().optional(),
    mu: z.array(EA12MunicipioSchema),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export const EA12Schema = z
  .object({
    /** Data da geração — "dd/mm/aaaa". */
    dg: z.string(),
    /** Hora da geração — "hh:mm:ss". */
    hg: z.string(),
    /** Código identificador da geração; serve de chave de cache. */
    idg: z.string(),
    /** Fase: "s" = simulado, "o" = oficial. */
    f: z.string(),
    abr: z.array(EA12AbrangenciaSchema),
  })
  .passthrough();

export type EA12Municipio = z.infer<typeof EA12MunicipioSchema>;
export type EA12Abrangencia = z.infer<typeof EA12AbrangenciaSchema>;
export type EA12 = z.infer<typeof EA12Schema>;

// ---------------------------------------------------------------------------
// Derivação dos pares
// ---------------------------------------------------------------------------

/** Um par (UF, município, zona) — a unidade de ingestão do pipeline 2026. */
export interface EA12Par {
  uf: string;
  codMunicipioTse: number;
  codZona: number;
  nomeMunicipio: string;
  capital: boolean;
}

/**
 * Converte um código do TSE preenchido com zeros à esquerda ("00001", "0043")
 * no inteiro correspondente. Retorna `null` para string vazia ou não-numérica —
 * quem chama decide se isso é erro.
 */
export function parseCodigoTse(raw: string): number | null {
  const t = raw.trim();
  if (t.length === 0 || !/^\d+$/.test(t)) return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

export interface DerivarParesOptions {
  /**
   * UFs a ignorar, em maiúsculas. Default `["ZZ"]` — o Exterior é uma
   * pseudo-UF de votos em trânsito, sem município em `municipios`.
   */
  excluirUfs?: readonly string[];
}

/**
 * Achata o EA12 na lista de pares (UF, município, zona).
 *
 * Linhas malformadas (código não-numérico) são descartadas e contadas em
 * `descartados` — nunca silenciosamente corrigidas.
 */
export function derivarPares(
  ea12: EA12,
  opts: DerivarParesOptions = {},
): { pares: EA12Par[]; descartados: number } {
  const excluir = new Set((opts.excluirUfs ?? ["ZZ"]).map((u) => u.toUpperCase()));
  const pares: EA12Par[] = [];
  let descartados = 0;

  for (const abr of ea12.abr) {
    const uf = abr.cd.trim().toUpperCase();
    if (uf.length !== 2 || excluir.has(uf)) continue;
    for (const mu of abr.mu) {
      const codMunicipioTse = parseCodigoTse(mu.cd);
      if (codMunicipioTse == null) {
        descartados++;
        continue;
      }
      const capital = (mu.c ?? "").trim().toLowerCase() === "s";
      for (const rawZona of mu.z) {
        const codZona = parseCodigoTse(rawZona);
        if (codZona == null) {
          descartados++;
          continue;
        }
        pares.push({
          uf,
          codMunicipioTse,
          codZona,
          nomeMunicipio: mu.nm,
          capital,
        });
      }
    }
  }

  return { pares, descartados };
}

/** Valida um JSON já parseado. Lança `ZodError` com o caminho do campo ruim. */
export function parseEA12(raw: unknown): EA12 {
  return EA12Schema.parse(raw);
}
