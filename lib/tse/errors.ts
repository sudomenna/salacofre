/**
 * lib/tse/errors.ts
 *
 * Error types for the TSE ingestion pipeline.
 *
 * Covers: RNF-032 (structured logs — these classes serialise via toJSON()
 * so the logger emits stable, machine-readable error payloads).
 *
 * Two layers:
 *   - TSEError    — HTTP/transport-level failure when fetching from
 *                   resultados.tse.jus.br. Carries status, url and a
 *                   truncated body sample for forensic context.
 *   - IngestError — pipeline-level failure with a categorical reason
 *                   ('parse' | 'persist' | 'network' | 'timeout'),
 *                   wrapping the original Error via the ES2022 Error.cause
 *                   pattern so root-cause is preserved without inheritance.
 *
 * Both implement toJSON() returning a serialisable shape WITHOUT a stack
 * trace. Rationale: Vercel Functions logs are world-visible to anyone with
 * project access and stacks leak filesystem paths from the runtime image.
 * If a debugger needs the stack it can call `.stack` directly outside the
 * structured log path.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum length, in characters, of a response body sample stored on a
 * TSEError. Picked to give enough context to recognise an HTML error page
 * or a JSON error envelope without bloating the structured log line
 * (Vercel Functions logs have a per-line byte cap).
 */
export const BODY_SAMPLE_MAX_LEN = 500;

// ---------------------------------------------------------------------------
// TSEError — HTTP/transport failure
// ---------------------------------------------------------------------------

/**
 * Serialised shape of a TSEError. Stable contract for downstream log
 * consumers (dashboards, alert rules).
 */
export interface TSEErrorJSON {
  name: "TSEError";
  message: string;
  status: number;
  url: string;
  bodySample?: string;
  retryAfterMs?: number;
}

export class TSEError extends Error {
  public override readonly name = "TSEError" as const;
  public readonly status: number;
  public readonly url: string;
  /** Truncated to BODY_SAMPLE_MAX_LEN chars. May be undefined if no body
   *  was captured (e.g. network abort before headers). */
  public readonly bodySample: string | undefined;
  /**
   * Parsed `Retry-After` header (429/503), in milliseconds. `undefined` when
   * the response had no `Retry-After` header or it failed to parse.
   *
   * 2026-09-05 — a FAQ técnica do simulado TSE confirma rate limit de
   * 100 req/s/IP → bloqueio de 10min. `retry.ts` usa este valor para honrar
   * o tempo de espera pedido pelo servidor em vez do backoff exponencial
   * fixo, que pode ser tempo demais ou de menos.
   */
  public readonly retryAfterMs: number | undefined;

  constructor(status: number, url: string, bodySample?: string, retryAfterMs?: number) {
    super(`TSE fetch failed: ${status} ${url}`);
    this.status = status;
    this.url = url;
    this.bodySample =
      bodySample === undefined
        ? undefined
        : bodySample.length > BODY_SAMPLE_MAX_LEN
          ? `${bodySample.slice(0, BODY_SAMPLE_MAX_LEN)}…[truncated]`
          : bodySample;
    this.retryAfterMs = retryAfterMs;

    // Restore prototype chain for `instanceof` to work when this class is
    // transpiled to ES5 by older toolchains. Harmless on modern targets.
    Object.setPrototypeOf(this, TSEError.prototype);
  }

  toJSON(): TSEErrorJSON {
    const json: TSEErrorJSON = {
      name: this.name,
      message: this.message,
      status: this.status,
      url: this.url,
    };
    if (this.bodySample !== undefined) {
      json.bodySample = this.bodySample;
    }
    if (this.retryAfterMs !== undefined) {
      json.retryAfterMs = this.retryAfterMs;
    }
    return json;
  }
}

// ---------------------------------------------------------------------------
// IngestError — pipeline failure with categorical reason
// ---------------------------------------------------------------------------

export type IngestErrorReason = "parse" | "persist" | "network" | "timeout";

/**
 * Serialised shape of an IngestError. `cause` is recursively serialised:
 * if it is itself a {@link TSEError}/{@link IngestError} (or any Error
 * with a `toJSON`), that representation is used; otherwise it falls back
 * to `{ name, message }` for Error and to a structured fallback for
 * unknown values (string, number, plain object, etc.).
 */
export interface IngestErrorJSON {
  name: "IngestError";
  message: string;
  reason: IngestErrorReason;
  cause?: unknown;
}

export class IngestError extends Error {
  public override readonly name = "IngestError" as const;
  public readonly reason: IngestErrorReason;
  /** Original error preserved via the ES2022 Error.cause pattern.
   *  Stored on both `this.cause` (standard) and `this.causeRaw` is NOT
   *  exposed — we only rely on the standard property. */
  public override readonly cause: unknown;

  constructor(reason: IngestErrorReason, message: string, cause?: unknown) {
    // Pass cause to the base Error constructor so `err.cause` is set per
    // the ES2022 standard and tools that already understand it (Node
    // inspector, Vitest diff renderer) pick it up automatically.
    super(message, cause === undefined ? undefined : { cause });
    this.reason = reason;
    this.cause = cause;

    Object.setPrototypeOf(this, IngestError.prototype);
  }

  toJSON(): IngestErrorJSON {
    const json: IngestErrorJSON = {
      name: this.name,
      message: this.message,
      reason: this.reason,
    };
    if (this.cause !== undefined) {
      json.cause = serialiseCause(this.cause);
    }
    return json;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Serialise an arbitrary `cause` value for log emission.
 *
 * Resolution order:
 *   1. If the value has a callable `toJSON()` → use it (handles TSEError,
 *      IngestError, and any user-defined Error with toJSON).
 *   2. If the value is an Error → `{ name, message }` (NO stack — see
 *      privacy note at top of file).
 *   3. Otherwise → return as-is and let JSON.stringify handle it. The
 *      logger has a final replacer/try-catch to neutralise circular refs
 *      and unserialisable values.
 *
 * Exported so the logger can reuse the same logic on raw `ctx.error`
 * entries that are not wrapped in a TSEError/IngestError.
 */
export function serialiseCause(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === "object") {
    const maybeWithToJSON = value as { toJSON?: () => unknown };
    if (typeof maybeWithToJSON.toJSON === "function") {
      try {
        return maybeWithToJSON.toJSON();
      } catch {
        // Fall through to Error/primitive handling below.
      }
    }
    if (value instanceof Error) {
      return { name: value.name, message: value.message };
    }
  }

  return value;
}
