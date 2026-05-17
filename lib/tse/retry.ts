/**
 * lib/tse/retry.ts
 *
 * Generic exponential-backoff retry wrapper for the TSE ingestion pipeline.
 *
 * Covers: RF-001 (resiliência do pipeline), RNF-011 (recuperação automática).
 * Design ref: docs/specs/001-ingestao-tse/design.md § "Tratamento de falhas".
 *
 * Retry policy (defaults):
 *   - 3 attempts maximum.
 *   - Exponential backoff: baseMs * 2^(attempt-1).
 *     attempt 1 fails → wait 1s
 *     attempt 2 fails → wait 2s
 *     attempt 3 fails → wait 4s (then re-throw)
 *   - Retryable: TSEError(status >= 500), IngestError(reason='network'|'timeout').
 *   - NOT retryable: IngestError(reason='parse') — a broken schema is
 *     deterministic; retrying wastes 7s+ before surfacing the same failure.
 *     IngestError(reason='persist') — a DB constraint violation won't fix
 *     itself in 1s either; fail-fast and let the next cron cycle handle it.
 *     TSEError(4xx) — auth/permission errors won't resolve without operator
 *     action. Note: 304 and 404 never throw from fetchEA20 — they are
 *     returned as { kind: 'not_modified' | 'not_found' } and never reach here.
 *   - Unknown errors: NOT retried (fail-fast to surface unexpected issues).
 *
 * Wallclock budget (default 3 attempts, 5s fetch timeout each):
 *   Max sleep total : 1s + 2s + 4s = 7s
 *   Max fetch total : 3 × 5s = 15s
 *   Worst-case total: ~22s per target (well within Vercel Pro 60s maxDuration
 *   for a single target; T08 uses a concurrency semaphore to bound aggregate
 *   time across all targets).
 *
 * No jitter is applied. The TSE CDN serves a large number of independent
 * files; each target follows its own backoff clock so natural desynchronisation
 * avoids the thundering-herd problem. Jitter may be added in a future chore
 * if correlated retries become observable.
 */

import { IngestError, TSEError } from "./errors";
import { logDebug } from "./log";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /**
   * Maximum number of attempts (including the first try).
   * Must be >= 1. Default: 3.
   */
  attempts?: number;

  /**
   * Base delay in milliseconds for exponential backoff.
   * Delay before attempt n+1 = baseMs * 2^(n-1).
   * Default: 1000.
   */
  baseMs?: number;

  /**
   * Predicate that decides whether a thrown error warrants another attempt.
   * Receives the error and the 1-based attempt number that just failed.
   * Default: retry iff TSEError(status >= 500) or IngestError(reason
   * 'network' | 'timeout').
   */
  shouldRetry?: (err: unknown, attempt: number) => boolean;

  /**
   * Called between attempts (after the sleep delay has been calculated, but
   * before sleeping). Useful for custom logging or metrics.
   * Default: logDebug with { attempt, delayMs, error }.
   */
  onRetry?: (err: unknown, attempt: number, nextDelayMs: number) => void;
}

// ---------------------------------------------------------------------------
// Default shouldRetry
// ---------------------------------------------------------------------------

/**
 * Default retry predicate.
 *
 * Retryable:
 *   - TSEError with status >= 500 (transient server-side errors).
 *   - IngestError with reason 'network' or 'timeout' (transient transport
 *     failures — DNS flap, TCP reset, CDN timeout).
 *
 * NOT retryable (fail-fast):
 *   - IngestError reason='parse': broken EA20 schema is deterministic; retry
 *     won't fix it, and it should trigger an alert, not silent backoff.
 *   - IngestError reason='persist': DB failures need operator investigation.
 *   - TSEError with 4xx status: permission/auth issues won't self-heal.
 *   - Any unknown error type: surface immediately so unexpected failures
 *     aren't silently swallowed.
 */
function defaultShouldRetry(err: unknown): boolean {
  if (err instanceof TSEError) {
    return err.status >= 500;
  }
  if (err instanceof IngestError) {
    return err.reason === "network" || err.reason === "timeout";
  }
  return false;
}

// ---------------------------------------------------------------------------
// Default onRetry
// ---------------------------------------------------------------------------

/**
 * Default retry hook: emits a debug-level structured log entry.
 *
 * Deliberately uses logDebug (not logInfo/logWarn). During peak ingestion
 * with ~73k targets, even 1% retry rate generates ~730 log lines per cycle
 * at info level. Debug only activates when LOG_LEVEL=debug.
 */
function defaultOnRetry(err: unknown, attempt: number, nextDelayMs: number): void {
  logDebug("tse:retry", {
    attempt,
    delayMs: nextDelayMs,
    error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
  });
}

// ---------------------------------------------------------------------------
// Sleep helper
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------

/**
 * Execute `fn` with exponential-backoff retry.
 *
 * @param fn   - Async (or sync-returning) factory called on each attempt.
 *               If `fn` throws synchronously the `try` block catches it the
 *               same as an async rejection, so callers need not worry about
 *               this distinction.
 * @param opts - Optional tuning (see {@link RetryOptions}).
 * @returns    - The resolved value of `fn()` on the first successful attempt.
 * @throws     - The last error thrown by `fn` once all attempts are exhausted,
 *               OR the first error when `shouldRetry` returns false (cancelled
 *               immediately without sleeping — avoids latency for fail-fast
 *               errors like parse failures).
 *               Errors are re-thrown as-is (never wrapped) so callers can
 *               `instanceof`-check TSEError / IngestError directly.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts?: RetryOptions): Promise<T> {
  const maxAttempts = opts?.attempts ?? 3;
  const baseMs = opts?.baseMs ?? 1_000;
  const shouldRetry = opts?.shouldRetry ?? defaultShouldRetry;
  const onRetry = opts?.onRetry ?? defaultOnRetry;

  // Validate attempts upfront so callers get a clear error rather than an
  // infinite loop or silent zero-attempt execution.
  if (maxAttempts < 1) {
    throw new Error("attempts deve ser >= 1");
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // `await` captures both async rejections AND synchronous throws from
      // `fn` (if `fn` throws before returning a Promise, the expression
      // evaluates to a rejected Promise, which the try/catch handles).
      return await fn();
    } catch (err) {
      lastError = err;

      const isLastAttempt = attempt === maxAttempts;

      // If this error is not retryable, re-throw immediately without sleeping.
      // Fail-fast is important for parse errors — sleeping 1s+ before
      // propagating a deterministic failure adds latency with no benefit.
      if (!shouldRetry(err, attempt)) {
        throw err;
      }

      // If we've exhausted all attempts, fall through to the re-throw below.
      if (isLastAttempt) {
        break;
      }

      // Compute delay: baseMs * 2^(attempt-1)
      // attempt=1 → baseMs * 1 = 1s
      // attempt=2 → baseMs * 2 = 2s
      // attempt=3 → baseMs * 4 = 4s (only reached if maxAttempts > 3)
      const delayMs = baseMs * 2 ** (attempt - 1);

      onRetry(err, attempt, delayMs);

      await sleep(delayMs);
    }
  }

  // Re-throw the last error as-is (no wrapping) so the caller's instanceof
  // checks against TSEError / IngestError remain valid.
  throw lastError;
}
