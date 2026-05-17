/**
 * lib/tse/metrics.ts
 *
 * Metrics helpers for the TSE ingestion pipeline.
 *
 * Covers: RNF-033 (custom metrics: lag_seconds, files_changed, errors).
 *
 * Design notes:
 *   - `calculateLagSeconds` computes the wall-clock delta between the TSE
 *     generation timestamp embedded in every EA20 payload (fields `dg` + `hg`,
 *     BRT timezone, UTC-3 year-round after Brazil abolished DST in 2019) and
 *     the ingestion moment (`now`).
 *   - A high lag (>60s) is the primary signal that either the TSE CDN is not
 *     publishing new results or our polling is stalled. The route handler
 *     (`app/api/ingest/route.ts`) tracks the max lag per cycle and fires a
 *     Slack alert if the threshold is exceeded (T20, lib/tse/alerts.ts).
 *   - `IngestCycleMetrics` is a plain data record — no classes, no external
 *     deps. Consumers can log it via `logInfo('ingest.cycle.metrics', metrics)`.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IngestCycleMetrics {
  durationMs: number;
  filesFetched: number;
  filesChanged: number;
  errors: number;
  /** Largest TSE-to-ingest lag observed across all snapshots in this cycle.
   *  null when no fresh snapshots were processed (all 304/404/error). */
  lagSeconds: number | null;
}

// ---------------------------------------------------------------------------
// calculateLagSeconds
// ---------------------------------------------------------------------------

/**
 * calculateLagSeconds — compute lag between TSE generation time and `now`.
 *
 * @param ea20Dg - EA20 `dg` field: date formatted as ddMMyyyy (e.g. "04102026")
 * @param ea20Hg - EA20 `hg` field: time formatted as HH:mm:ss (e.g. "20:15:30")
 * @param now    - Reference instant; defaults to `new Date()`. Injection point
 *                 for deterministic unit testing.
 *
 * @returns Elapsed seconds as a floating-point number. Positive means the TSE
 *          published the result before `now` (expected). Negative means the
 *          TSE timestamp is in the future, which indicates a clock skew issue.
 *
 * @throws {Error} If `dg` or `hg` do not match the expected format or produce
 *                 an invalid date. Callers should catch and handle (e.g. log +
 *                 skip the lag metric for that snapshot) rather than letting an
 *                 anomalous TSE field abort the entire ingest cycle.
 *
 * BRT = UTC-3. Brasil abolished daylight saving time in 2019, so BRT is
 * permanently UTC-3 with no DST offset to handle.
 *
 * Example:
 *   dg = "04102026", hg = "20:15:30"
 *   → tseTimestamp = new Date('2026-10-04T20:15:30-03:00')
 *                  = 2026-10-04T23:15:30Z
 *   If now = 2026-10-04T23:16:00Z → lag = 30s
 */
export function calculateLagSeconds(
  ea20Dg: string,
  ea20Hg: string,
  now: Date = new Date(),
): number {
  // ----- Parse dg (ddMMyyyy) -------------------------------------------------
  if (!/^\d{8}$/.test(ea20Dg)) {
    throw new Error(`calculateLagSeconds: dg "${ea20Dg}" não segue formato ddMMyyyy esperado`);
  }

  const dd = ea20Dg.slice(0, 2);
  const mm = ea20Dg.slice(2, 4);
  const yyyy = ea20Dg.slice(4, 8);

  // ----- Parse hg (HH:mm:ss) ------------------------------------------------
  if (!/^\d{2}:\d{2}:\d{2}$/.test(ea20Hg)) {
    throw new Error(`calculateLagSeconds: hg "${ea20Hg}" não segue formato HH:mm:ss esperado`);
  }

  // ----- Build ISO 8601 string with BRT offset (-03:00) ---------------------
  // Example: "2026-10-04T20:15:30-03:00"
  const iso = `${yyyy}-${mm}-${dd}T${ea20Hg}-03:00`;

  const tseTimestamp = new Date(iso);

  if (Number.isNaN(tseTimestamp.getTime())) {
    throw new Error(
      `calculateLagSeconds: timestamp construído "${iso}" é inválido (data ou hora fora do range)`,
    );
  }

  return (now.getTime() - tseTimestamp.getTime()) / 1000;
}
