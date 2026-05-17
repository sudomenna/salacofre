/**
 * lib/tse/repository.ts
 *
 * Persistence layer for the TSE ingestion pipeline.
 *
 * Covers: RF-004 (append-only snapshots), RF-003 (hash-based dedup),
 *         RNF-032 / RNF-033 (structured logs + ingest metrics).
 *
 * Constituição § 10: snapshots are APPEND-ONLY. This file contains zero
 * UPDATE, DELETE, UPSERT or ON CONFLICT clauses. constitution-guard will
 * validate this post-facto (gate T24).
 *
 * ---- Turno decision (ambiguidade do briefing) ----
 *
 * The `Target` type (lib/tse/targets.ts) does NOT carry `turno` because a
 * single target (uf × cargo × zona × url) is reused across both rounds when
 * the election reaches a second round. The URL changes between round 1 and
 * round 2 (different `codEleicao` path), but `Target` is not the natural
 * place to encode that distinction — it would couple target-building to the
 * electoral calendar.
 *
 * Decision **b**: pass `turno` as a separate parameter to both
 * `getLastEtagAndHash` and `insertSnapshot`. This keeps `Target` stateless
 * and lets the caller (T08 route handler) supply the round from an env var
 * (e.g. `TSE_TURNO=1`) or derive it from the electoral calendar. The route
 * handler is the correct place for that logic because it is the boundary that
 * knows "which election cycle is running right now".
 *
 * T08 note: read `turno` from `process.env.TSE_TURNO` (must be '1' or '2').
 * Default to 1 if absent (preview / pre-election scenario). Validate at
 * startup, not in the hot path here.
 */

import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { EA20 } from "./ea20-schema";
import { IngestError } from "./errors";
import { logDebug, logError } from "./log";
import type { Target } from "./targets";

// ---------------------------------------------------------------------------
// getLastEtagAndHash
// ---------------------------------------------------------------------------

/**
 * Fetches the most recent ETag and payload hash for a given
 * (cargo, turno, uf, cod_zona) combination.
 *
 * Used by the route handler BEFORE calling fetchEA20:
 *   1. The ETag is forwarded in `If-None-Match` to the TSE CDN (RF-003).
 *   2. The hash is used for secondary dedup inside `insertSnapshot` (RF-004).
 *
 * Returns `{ etag: null, hash: null }` when no previous snapshot exists for
 * this combination (first ingest for a given zone).
 *
 * @throws IngestError('persist', ...) on database error.
 */
export async function getLastEtagAndHash(args: {
  target: Target;
  turno: number;
}): Promise<{ etag: string | null; hash: string | null }> {
  const { target, turno } = args;

  try {
    const rows = await db
      .select({
        etag: schema.snapshots.etag,
        hash: schema.snapshots.hashPayload,
      })
      .from(schema.snapshots)
      .where(
        and(
          eq(schema.snapshots.cargo, target.cargo),
          eq(schema.snapshots.turno, turno),
          eq(schema.snapshots.uf, target.uf),
          eq(schema.snapshots.codZona, target.codZona),
        ),
      )
      .orderBy(desc(schema.snapshots.ts))
      .limit(1);

    // noUncheckedIndexedAccess: rows[0] may be undefined when there are no
    // prior snapshots for this zone. This is the expected first-ingest path.
    const row = rows[0];
    if (!row) {
      return { etag: null, hash: null };
    }

    return {
      etag: row.etag ?? null,
      hash: row.hash,
    };
  } catch (err) {
    if (err instanceof IngestError) throw err;
    throw new IngestError(
      "persist",
      `getLastEtagAndHash falhou para ${target.uf} cargo=${target.cargo} zona=${target.codZona} turno=${turno}`,
      err,
    );
  }
}

// ---------------------------------------------------------------------------
// insertSnapshot
// ---------------------------------------------------------------------------

/**
 * Inserts a new snapshot row (APPEND-ONLY — no UPDATE, DELETE or UPSERT).
 *
 * Secondary dedup: if the supplied `hash` matches the most recent row's
 * hash for this (cargo, turno, uf, cod_zona), the insert is skipped and
 * `null` is returned. This is expected in steady state (TSE CDN may not
 * always set ETags correctly — T04 risk note) and is logged at `debug`
 * level to avoid noise in production logs.
 *
 * The primary dedup path is the ETag via `If-None-Match` in `fetchEA20`;
 * this secondary dedup is a content-level safety net.
 *
 * DB column note: the hash is stored in `hash_payload` (char(64)) — NOT
 * a column named `hash`. The Drizzle schema field is `hashPayload`.
 *
 * @returns `bigint` with the generated `id` on a real insert,
 *          `null` when the row was skipped due to hash dedup.
 *
 * @throws IngestError('persist', ...) on database error.
 */
export async function insertSnapshot(args: {
  target: Target;
  turno: number;
  etag: string | null;
  hash: string;
  payload: EA20;
  pctApurado: number;
  votosTotal: number;
}): Promise<bigint | null> {
  const { target, turno, etag, hash, payload, pctApurado, votosTotal } = args;

  // Secondary dedup: check the last stored hash before writing.
  // We call getLastEtagAndHash here (short query, hits ix_snap_lookup index)
  // rather than requiring the caller to pass the last hash, so this function
  // is self-contained and correct even if called directly in tests.
  // getLastEtagAndHash already wraps all errors as IngestError('persist'),
  // so no additional try/catch is needed here.
  const last = await getLastEtagAndHash({ target, turno });
  const lastHash = last.hash;

  if (lastHash !== null && lastHash === hash) {
    logDebug("insertSnapshot skipped — hash idêntico ao último snapshot (dedup)", {
      uf: target.uf,
      cargo: target.cargo,
      turno,
      codZona: target.codZona,
      hash,
    });
    return null;
  }

  // Perform the INSERT. Append-only: no ON CONFLICT, no RETURNING update.
  // Constituição § 10.
  try {
    const inserted = await db
      .insert(schema.snapshots)
      .values({
        cargo: target.cargo,
        turno,
        uf: target.uf,
        codZona: target.codZona,
        etag: etag ?? null,
        hashPayload: hash,
        payload: payload as Record<string, unknown>,
        pctApurado: String(pctApurado),
        votosTotal,
        ts: new Date(),
      })
      .returning({ id: schema.snapshots.id });

    // noUncheckedIndexedAccess: .returning() always returns at least one row
    // on a successful INSERT, but the type is T[] so we must guard.
    const row = inserted[0];
    if (!row) {
      throw new IngestError(
        "persist",
        "INSERT em snapshots não retornou id — comportamento inesperado do driver",
      );
    }

    return row.id;
  } catch (err) {
    if (err instanceof IngestError) throw err;
    throw new IngestError(
      "persist",
      `insertSnapshot falhou para ${target.uf} cargo=${target.cargo} zona=${target.codZona} turno=${turno}`,
      err,
    );
  }
}

// ---------------------------------------------------------------------------
// logIngestRun
// ---------------------------------------------------------------------------

/**
 * Records a completed ingest cycle in `ingest_log`.
 *
 * Covers: RNF-032 (structured logs), RNF-033 (metrics: duration and
 * files_changed are the primary signals consumed by the /_status dashboard,
 * spec 012, sprint S07).
 *
 * Called once per `/api/ingest` invocation, after all targets have been
 * processed, regardless of individual target errors (errors counter reflects
 * how many targets failed in this cycle).
 *
 * @returns `bigint` with the generated `id` of the log row.
 * @throws IngestError('persist', ...) on database error — the route handler
 *         should log and swallow this to avoid masking the primary metrics
 *         already captured. The exception is still thrown so the caller can
 *         decide its own error handling policy.
 */
export async function logIngestRun(args: {
  durationMs: number;
  filesFetched: number;
  filesChanged: number;
  errors: number;
  notes?: string | null;
}): Promise<bigint> {
  const { durationMs, filesFetched, filesChanged, errors, notes } = args;

  try {
    const inserted = await db
      .insert(schema.ingestLog)
      .values({
        durationMs,
        filesFetched,
        filesChanged,
        errors,
        notes: notes ?? null,
        ts: new Date(),
      })
      .returning({ id: schema.ingestLog.id });

    const row = inserted[0];
    if (!row) {
      throw new IngestError(
        "persist",
        "INSERT em ingest_log não retornou id — comportamento inesperado do driver",
      );
    }

    return row.id;
  } catch (err) {
    if (err instanceof IngestError) throw err;

    const ingestErr = new IngestError(
      "persist",
      `logIngestRun falhou: durationMs=${durationMs} filesFetched=${filesFetched} filesChanged=${filesChanged} errors=${errors}`,
      err,
    );
    logError("logIngestRun falhou — ciclo de ingestão pode não ter sido registrado", {
      error: ingestErr,
    });
    throw ingestErr;
  }
}
