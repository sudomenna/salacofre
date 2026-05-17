/**
 * lib/tse/ea20-schema.ts
 *
 * Zod schema for the TSE EA20 result file format.
 *
 * Design ref: docs/specs/001-ingestao-tse/design.md § "Schema EA20 (parcial relevante)"
 * Covers: RF-001 (fail-fast validation pre-acceptance), ADR-0002 (CDN polling).
 *
 * Key invariant: ALL numeric values from TSE arrive as strings with BR decimal
 * notation (comma as decimal separator, optional dot as thousands separator).
 * The schema preserves them as strings. Callers that need numeric values use
 * parseEA20Numeric() explicitly — this keeps the raw payload intact for audit.
 *
 * Top-level uses .strict() to detect any schema drift when TSE changes EA20
 * without notice. A parse failure surfaces immediately via ZodError (fail-fast),
 * allowing the ingest pipeline to alert rather than silently accept garbage.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Leaf schemas
// ---------------------------------------------------------------------------

/** Single seção record. TSE may add fields — keep .passthrough() at leaf level
 *  to avoid false alarms on harmless additions inside deeply nested arrays. */
const SecaoSchema = z
  .object({
    ns: z.string(), // número da seção
  })
  .passthrough();

/** Per-candidate record inside an abr entry. */
const CandidatoSchema = z
  .object({
    seq: z.string(), // sequência do candidato
    n: z.string(), // número na urna
    nm: z.string(), // nome completo
    nmu: z.string(), // nome na urna
    cc: z.string(), // código do cargo
    pn: z.string(), // partido número
    pnm: z.string(), // partido nome
    sg: z.string(), // sigla do partido
    st: z.string(), // situação (eleito, não eleito, etc.)
    vap: z.string(), // votos apurados (integer BR-string)
    pvap: z.string(), // % votos sobre válidos (BR decimal)
    e: z.string(), // eleito flag
  })
  .passthrough();

/** Per-zone (abr) aggregation record. */
const AbrSchema = z
  .object({
    cd: z.string(), // sigla UF
    cdmu: z.string(), // código do município TSE
    cdze: z.string(), // código da zona eleitoral
    s: z.array(SecaoSchema), // seções da zona

    // Percentages and totals — all BR numeric strings
    psa: z.string(), // % seções apuradas  (ex: "100,00")
    pst: z.string(), // % seções totalizadas
    tap: z.string(), // total aptos
    tc: z.string(), // total comparecimento
    pc: z.string(), // % comparecimento
    ta: z.string(), // total abstenção
    pa: z.string(), // % abstenção
    tvn: z.string(), // votos nominais
    pvn: z.string(), // % votos nominais
    tvl: z.string(), // votos legenda
    tvb: z.string(), // votos brancos
    pvb: z.string(), // % brancos
    tvnu: z.string(), // votos nulos
    pvnu: z.string(), // % nulos
    tvv: z.string(), // votos válidos

    cand: z.array(CandidatoSchema),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Top-level EA20 schema
// ---------------------------------------------------------------------------

/**
 * EA20Schema — strict at the top level to catch TSE schema drift early.
 *
 * Why .strict() here but .passthrough() inside AbrSchema/CandidatoSchema:
 * The top-level envelope is the most stable part of the format. Unknown fields
 * at the root almost certainly mean a breaking format change that needs a human
 * decision. Inner record shapes evolve more frequently (new candidate flags,
 * extra seção metadata) and unknown fields there are usually harmless.
 */
export const EA20Schema = z
  .object({
    dg: z.string(), // data de geração ddMMyyyy
    hg: z.string(), // hora HH:mm:ss
    f: z.literal("o"), // ambiente: 'o' = oficial
    cdabr: z.string(), // sigla da UF raiz
    abr: z.array(AbrSchema),
  })
  .strict();

export type EA20 = z.infer<typeof EA20Schema>;

// Re-export inner types for consumers that need to reference sub-shapes
export type EA20Abr = z.infer<typeof AbrSchema>;
export type EA20Candidato = z.infer<typeof CandidatoSchema>;

// ---------------------------------------------------------------------------
// Numeric helper
// ---------------------------------------------------------------------------

/**
 * parseEA20Numeric — converts a TSE BR-formatted numeric string to a JS number.
 *
 * TSE format: optional dot as thousands separator, comma as decimal separator.
 * Examples:
 *   "1.234,56"  → 1234.56
 *   "100,00"    → 100
 *   "42"        → 42
 *   "0"         → 0
 *
 * Throws on:
 *   - Empty string (RF-001: fail-fast; never return NaN masked as 0)
 *   - Non-numeric content (letters, double commas, etc.)
 *
 * Usage pattern: call this at point-of-use, not in the Zod schema itself,
 * so the raw string is preserved in the snapshot payload for audit.
 */
export function parseEA20Numeric(s: string): number {
  if (s === "") {
    throw new Error(`parseEA20Numeric: received empty string — TSE field must not be blank`);
  }

  // Remove thousands separator (dot) then swap decimal separator (comma → dot)
  const normalised = s.replace(/\./g, "").replace(",", ".");

  const value = Number(normalised);

  if (Number.isNaN(value)) {
    throw new Error(`parseEA20Numeric: cannot convert "${s}" to number — unexpected format`);
  }

  return value;
}
