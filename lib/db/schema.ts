// Schema Postgres canônico do SalaCofre.
// Fonte de verdade: docs/architecture/data-model.md.
// IMPORTANTE: snapshots é append-only (constituição § 10). Nunca UPDATE/DELETE.
// PostGIS (GEOGRAPHY) é tratado como text aqui — migração inicial habilita a extensão
// e altera a coluna; Drizzle não tem helper nativo nessa versão.

import {
  bigint,
  bigserial,
  char,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Histórico de eleições GERAIS (Presidente + Governador) — 2018 e 2022.
 * NÃO inclui 2024 (pleito municipal, fora de escopo).
 */
export const historicalResults = pgTable(
  "historical_results",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    ano: smallint("ano").notNull(), // 2018, 2022
    turno: smallint("turno").notNull(), // 1, 2
    cargo: smallint("cargo").notNull(), // 1 = Presidente, 3 = Governador
    uf: char("uf", { length: 2 }).notNull(),
    codMunicipioTse: integer("cod_municipio_tse"),
    codZona: integer("cod_zona").notNull(),
    codCandidato: integer("cod_candidato").notNull(),
    nomeCandidato: text("nome_candidato"),
    partido: varchar("partido", { length: 20 }),
    votos: integer("votos").notNull(),
    pctValidos: numeric("pct_validos", { precision: 8, scale: 5 }),
    pctTotal: numeric("pct_total", { precision: 8, scale: 5 }),
  },
  (t) => [
    uniqueIndex("uq_historical_results").on(
      t.ano,
      t.turno,
      t.cargo,
      t.uf,
      t.codZona,
      t.codCandidato,
    ),
    index("ix_hist_lookup").on(t.ano, t.turno, t.cargo, t.uf, t.codZona),
  ],
);

/** Eleitorado por zona (atualizado para 2026). */
export const eleitorado = pgTable(
  "eleitorado",
  {
    ano: smallint("ano").notNull(),
    uf: char("uf", { length: 2 }).notNull(),
    codMunicipioTse: integer("cod_municipio_tse").notNull(),
    codZona: integer("cod_zona").notNull(),
    eleitoresAptos: integer("eleitores_aptos").notNull(),
    comparecimentoPctHistorico: numeric("comparecimento_pct_historico", {
      precision: 5,
      scale: 4,
    }),
  },
  (t) => [primaryKey({ columns: [t.ano, t.uf, t.codZona] })],
);

/**
 * Mapeamento geográfico — municípios.
 * geoCentroid é GEOGRAPHY(POINT) no SQL; migração inicial cria a extensão PostGIS
 * e altera o tipo da coluna após drizzle gerar como text.
 */
export const municipios = pgTable(
  "municipios",
  {
    codIbge: char("cod_ibge", { length: 7 }).primaryKey(),
    codMunicipioTse: integer("cod_municipio_tse").notNull().unique(),
    uf: char("uf", { length: 2 }).notNull(),
    nome: text("nome").notNull(),
    geoCentroid: text("geo_centroid"), // PostGIS GEOGRAPHY(POINT) — ver nota acima
    populacao: integer("populacao"),
  },
  (t) => [index("ix_municipio_uf").on(t.uf)],
);

export const zonas = pgTable(
  "zonas",
  {
    codZona: integer("cod_zona").primaryKey(),
    codMunicipioTse: integer("cod_municipio_tse")
      .notNull()
      .references(() => municipios.codMunicipioTse),
    uf: char("uf", { length: 2 }).notNull(),
    nome: text("nome"),
  },
  (t) => [index("ix_zona_uf").on(t.uf)],
);

/**
 * Snapshots APPEND-ONLY do TSE durante apuração.
 * Constituição § 10: nunca UPDATE/DELETE. Habilita replay e auditoria.
 */
export const snapshots = pgTable(
  "snapshots",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    cargo: smallint("cargo").notNull(),
    turno: smallint("turno").notNull(),
    uf: char("uf", { length: 2 }).notNull(),
    codZona: integer("cod_zona").notNull(),
    etag: text("etag"), // ETag do TSE para dedup
    pctApurado: numeric("pct_apurado", { precision: 5, scale: 2 }),
    votosTotal: integer("votos_total"),
    payload: jsonb("payload").notNull(), // EA20 cru
    hashPayload: char("hash_payload", { length: 64 }).notNull(), // SHA256
  },
  (t) => [
    index("ix_snap_lookup").on(t.cargo, t.turno, t.uf, t.codZona, t.ts),
    index("ix_snap_ts").on(t.ts),
  ],
);

/**
 * Cálculos de projeção (histórico do modelo).
 *
 * Constituição § 10 — append-only. Nunca UPDATE/DELETE; cada ciclo do modelo
 * gera novas rows com `ts` distinto. Replay = `SELECT ... ORDER BY ts`.
 *
 * S05/F4c (ADR-0014, ADR-0015) — colunas multi-candidato:
 *   - `modelFallbackTier` ∈ {1, 2, 3}: qual tier do K-1 fallback foi usado
 *     na linha (1 = mapping direto OU swing de partido, 2 = prior pesquisa
 *     com CI inflado, 3 = modelo desabilitado). Permite auditoria do
 *     comportamento do modelo por linha.
 *   - `cenario2tJson`: dump JSON do `cenarios_2t` (top-3 pares mais prováveis)
 *     na hora do snapshot — usado pra reconstruir histórico do "termômetro
 *     de cenários 2T" sem precisar dos resamples originais. NULL nas
 *     linhas UF (só faz sentido no nacional, `uf IS NULL`).
 */
export const projections = pgTable(
  "projections",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    cargo: smallint("cargo").notNull(),
    turno: smallint("turno").notNull(),
    uf: char("uf", { length: 2 }), // NULL = nacional
    candidatoId: integer("candidato_id").notNull(),
    votosProjetados: bigint("votos_projetados", { mode: "bigint" }),
    pctProjetado: numeric("pct_projetado", { precision: 8, scale: 5 }),
    pctProjetadoLower: numeric("pct_projetado_lower", { precision: 8, scale: 5 }),
    pctProjetadoUpper: numeric("pct_projetado_upper", { precision: 8, scale: 5 }),
    pVitoria: numeric("p_vitoria", { precision: 5, scale: 4 }),
    pctApurado: numeric("pct_apurado", { precision: 5, scale: 2 }),
    // S05/F4c — ver doc do bloco.
    modelFallbackTier: smallint("model_fallback_tier"),
    cenario2tJson: jsonb("cenario_2t_json"),
  },
  (t) => [index("ix_proj_lookup").on(t.cargo, t.turno, t.uf, t.ts)],
);

/** Log operacional do pipeline de ingest. */
export const ingestLog = pgTable("ingest_log", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  durationMs: integer("duration_ms"),
  filesFetched: integer("files_fetched"),
  filesChanged: integer("files_changed"),
  errors: integer("errors"),
  notes: text("notes"),
});

export type HistoricalResult = typeof historicalResults.$inferSelect;
export type NewHistoricalResult = typeof historicalResults.$inferInsert;
export type Eleitorado = typeof eleitorado.$inferSelect;
export type Municipio = typeof municipios.$inferSelect;
export type Zona = typeof zonas.$inferSelect;
export type Snapshot = typeof snapshots.$inferSelect;
export type NewSnapshot = typeof snapshots.$inferInsert;
export type Projection = typeof projections.$inferSelect;
export type NewProjection = typeof projections.$inferInsert;
export type IngestLog = typeof ingestLog.$inferSelect;
