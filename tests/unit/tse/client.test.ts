/**
 * tests/unit/tse/client.test.ts
 *
 * Unit tests for lib/tse/client.ts (fetchEA20) and lib/tse/retry.ts (withRetry).
 *
 * Covers: RF-001, RF-003, RNF-011.
 * Task: T17 (client with mocked fetch), T05 coverage (withRetry).
 *
 * Strategy:
 *   - fetch is replaced via vi.stubGlobal('fetch', mockFn) — no MSW, no
 *     AbortSignal manipulation. Timeout is simulated by making the mock
 *     throw a DOMException with name='TimeoutError', which mirrors what
 *     AbortSignal.timeout() injects when the deadline is exceeded. This
 *     keeps tests instantaneous while exercising the exact branch in client.ts.
 *   - withRetry tests use baseMs: 10 to avoid sleeping 7 s during the suite.
 *     A comment on each affected test calls this out explicitly.
 *   - vi.unstubAllGlobals() in afterEach ensures fetch stubs do not leak
 *     across tests regardless of execution order.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchEA20 } from "@/lib/tse/client";
import { IngestError, TSEError } from "@/lib/tse/errors";
import { withRetry } from "@/lib/tse/retry";

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

const FIXTURES_DIR = resolve(process.cwd(), "tests/fixtures/tse/2022");

function loadFixtureText(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf8");
}

// Raw text of the SP zona-1 fixture — used as a valid EA20 body throughout.
const FIXTURE_SP_Z1_TEXT = loadFixtureText("presidente-sp-z0001.json");
const TEST_URL =
  "https://resultados.tse.jus.br/oficial/544/dados/SP/SP71072/SP71072-c0001-z0001-e000544.json";

// ---------------------------------------------------------------------------
// Mock helper
// ---------------------------------------------------------------------------

/**
 * Stubs the global fetch to resolve once with a synthetic Response.
 * Returns the vi.fn() so individual tests can inspect call arguments.
 *
 * Note: the WHATWG Response constructor rejects null-body status codes (204,
 * 304) per spec. For those statuses we return a plain object that satisfies
 * the interface subset used by client.ts (status, ok, headers.get, text).
 * This keeps the mock self-contained without MSW or a polyfill.
 */
function mockFetchOnce(response: {
  status?: number;
  body?: string | object;
  headers?: Record<string, string>;
}): ReturnType<typeof vi.fn> {
  const status = response.status ?? 200;
  const bodyText =
    typeof response.body === "string"
      ? response.body
      : response.body !== undefined
        ? JSON.stringify(response.body)
        : "";
  const headersMap = new Map(Object.entries(response.headers ?? {}));

  // For statuses that the Response constructor rejects (204, 304, etc.) we
  // build a minimal duck-typed object instead of a real Response.
  const isNullBodyStatus = status === 204 || status === 304;
  let mockResponse: unknown;
  if (isNullBodyStatus) {
    mockResponse = {
      status,
      ok: status >= 200 && status < 300,
      headers: {
        get: (name: string) => headersMap.get(name.toLowerCase()) ?? headersMap.get(name) ?? null,
      },
      text: async () => "",
    };
  } else {
    const headers = new Headers(response.headers ?? {});
    mockResponse = new Response(bodyText, { status, headers });
  }

  const fetchMock = vi.fn().mockResolvedValueOnce(mockResponse);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// fetchEA20 — happy paths
// ---------------------------------------------------------------------------

describe("fetchEA20 — 200 fresh", () => {
  it("returns kind:fresh with parsed data when response is valid EA20", async () => {
    mockFetchOnce({ status: 200, body: FIXTURE_SP_Z1_TEXT });

    const result = await fetchEA20({ url: TEST_URL });

    expect(result.kind).toBe("fresh");
    if (result.kind !== "fresh") return; // narrow for TS
    expect(result.data.cdabr).toBe("SP");
    expect(result.etag).toBeNull(); // no ETag header in mock
  });

  it("hash is a 64-char lowercase hex string (SHA-256)", async () => {
    mockFetchOnce({ status: 200, body: FIXTURE_SP_Z1_TEXT });

    const result = await fetchEA20({ url: TEST_URL });
    if (result.kind !== "fresh") throw new Error("expected fresh");

    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hash is deterministic — same body produces same hash on consecutive calls", async () => {
    // Two separate mock setups, same body text.
    const mockFn = vi
      .fn()
      .mockResolvedValueOnce(new Response(FIXTURE_SP_Z1_TEXT, { status: 200 }))
      .mockResolvedValueOnce(new Response(FIXTURE_SP_Z1_TEXT, { status: 200 }));
    vi.stubGlobal("fetch", mockFn);

    const r1 = await fetchEA20({ url: TEST_URL });
    const r2 = await fetchEA20({ url: TEST_URL });

    if (r1.kind !== "fresh" || r2.kind !== "fresh") throw new Error("expected both fresh");
    expect(r1.hash).toBe(r2.hash);
  });

  it("different bodies produce different hashes", async () => {
    const fixture2Text = loadFixtureText("presidente-sp-z0002.json");
    const mockFn = vi
      .fn()
      .mockResolvedValueOnce(new Response(FIXTURE_SP_Z1_TEXT, { status: 200 }))
      .mockResolvedValueOnce(new Response(fixture2Text, { status: 200 }));
    vi.stubGlobal("fetch", mockFn);

    const r1 = await fetchEA20({ url: TEST_URL });
    const r2 = await fetchEA20({ url: TEST_URL });

    if (r1.kind !== "fresh" || r2.kind !== "fresh") throw new Error("expected both fresh");
    expect(r1.hash).not.toBe(r2.hash);
  });
});

describe("fetchEA20 — ETag handling", () => {
  it("captures ETag header from 200 response preserving quotes", async () => {
    mockFetchOnce({
      status: 200,
      body: FIXTURE_SP_Z1_TEXT,
      headers: { ETag: '"abc-123"' },
    });

    const result = await fetchEA20({ url: TEST_URL });
    if (result.kind !== "fresh") throw new Error("expected fresh");

    // ETag value must be preserved verbatim including surrounding double-quotes.
    expect(result.etag).toBe('"abc-123"');
  });

  it("sends If-None-Match when etag is provided", async () => {
    const mockFn = mockFetchOnce({ status: 304 });

    await fetchEA20({ url: TEST_URL, etag: '"abc-123"' });

    const [, init] = mockFn.mock.calls[0] as [string, RequestInit];
    const headers = init?.headers as Record<string, string>;
    expect(headers?.["If-None-Match"]).toBe('"abc-123"');
  });

  it("does NOT send If-None-Match when etag is absent", async () => {
    const mockFn = mockFetchOnce({ status: 200, body: FIXTURE_SP_Z1_TEXT });

    await fetchEA20({ url: TEST_URL });

    const [, init] = mockFn.mock.calls[0] as [string, RequestInit];
    const headers = init?.headers as Record<string, string>;
    expect(headers).not.toHaveProperty("If-None-Match");
  });

  it("does NOT send If-None-Match when etag is null", async () => {
    const mockFn = mockFetchOnce({ status: 200, body: FIXTURE_SP_Z1_TEXT });

    await fetchEA20({ url: TEST_URL, etag: null });

    const [, init] = mockFn.mock.calls[0] as [string, RequestInit];
    const headers = init?.headers as Record<string, string>;
    expect(headers).not.toHaveProperty("If-None-Match");
  });

  it("does NOT send If-None-Match when etag is undefined", async () => {
    const mockFn = mockFetchOnce({ status: 200, body: FIXTURE_SP_Z1_TEXT });

    await fetchEA20({ url: TEST_URL, etag: undefined });

    const [, init] = mockFn.mock.calls[0] as [string, RequestInit];
    const headers = init?.headers as Record<string, string>;
    expect(headers).not.toHaveProperty("If-None-Match");
  });

  it("does NOT send If-None-Match when etag is empty string", async () => {
    const mockFn = mockFetchOnce({ status: 200, body: FIXTURE_SP_Z1_TEXT });

    await fetchEA20({ url: TEST_URL, etag: "" });

    const [, init] = mockFn.mock.calls[0] as [string, RequestInit];
    const headers = init?.headers as Record<string, string>;
    expect(headers).not.toHaveProperty("If-None-Match");
  });
});

// ---------------------------------------------------------------------------
// fetchEA20 — 304 Not Modified
// ---------------------------------------------------------------------------

describe("fetchEA20 — 304 Not Modified", () => {
  it("returns kind:not_modified for 304 response", async () => {
    mockFetchOnce({ status: 304 });

    const result = await fetchEA20({ url: TEST_URL, etag: '"abc-123"' });

    expect(result).toStrictEqual({ kind: "not_modified" });
  });

  it("sends If-None-Match header when etag provided on 304 path", async () => {
    const mockFn = mockFetchOnce({ status: 304 });

    await fetchEA20({ url: TEST_URL, etag: '"abc-123"' });

    const [, init] = mockFn.mock.calls[0] as [string, RequestInit];
    const headers = init?.headers as Record<string, string>;
    expect(headers?.["If-None-Match"]).toBe('"abc-123"');
  });
});

// ---------------------------------------------------------------------------
// fetchEA20 — 404 Not Found
// ---------------------------------------------------------------------------

describe("fetchEA20 — 404 Not Found", () => {
  it("returns kind:not_found for 404 response (does not throw)", async () => {
    mockFetchOnce({ status: 404 });

    const result = await fetchEA20({ url: TEST_URL });

    expect(result).toStrictEqual({ kind: "not_found" });
  });
});

// ---------------------------------------------------------------------------
// fetchEA20 — error paths
// ---------------------------------------------------------------------------

describe("fetchEA20 — 5xx throws TSEError", () => {
  it("throws TSEError with correct status, url and bodySample on 500", async () => {
    mockFetchOnce({ status: 500, body: "Internal Error" });

    await expect(fetchEA20({ url: TEST_URL })).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof TSEError &&
        err.status === 500 &&
        err.url === TEST_URL &&
        typeof err.bodySample === "string" &&
        err.bodySample.length <= 500,
    );
  });

  it("TSEError bodySample is truncated to ≤500 chars for large bodies", async () => {
    const longBody = "x".repeat(600);
    mockFetchOnce({ status: 503, body: longBody });

    await expect(fetchEA20({ url: TEST_URL })).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof TSEError &&
        // BODY_SAMPLE_MAX_LEN=500; truncated string appends '…[truncated]' (13 chars)
        (err.bodySample?.length ?? 0) <= 500 + "[truncated]".length + 5,
    );
  });
});

describe("fetchEA20 — network error", () => {
  it("throws IngestError reason:network when fetch rejects with a TypeError", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchEA20({ url: TEST_URL })).rejects.toSatisfy(
      (err: unknown) => err instanceof IngestError && err.reason === "network",
    );
  });

  it("throws IngestError reason:network on ENOTFOUND-style Error", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("ENOTFOUND resultados.tse.jus.br"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchEA20({ url: TEST_URL })).rejects.toSatisfy(
      (err: unknown) => err instanceof IngestError && err.reason === "network",
    );
  });
});

describe("fetchEA20 — timeout", () => {
  it("throws IngestError reason:timeout when fetch rejects with DOMException name=TimeoutError", async () => {
    // AbortSignal.timeout() causes fetch to reject with a DOMException whose
    // name is 'TimeoutError' (spec) or 'AbortError' (older builds). We simulate
    // this by throwing the same exception type from the mock, which is what
    // actually happens at runtime — we do NOT manipulate AbortSignal or add
    // real delays, keeping the test instantaneous.
    const timeoutErr = new DOMException("signal timed out", "TimeoutError");
    const fetchMock = vi.fn().mockRejectedValueOnce(timeoutErr);
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchEA20({ url: TEST_URL })).rejects.toSatisfy(
      (err: unknown) => err instanceof IngestError && err.reason === "timeout",
    );
  });

  it("throws IngestError reason:timeout when fetch rejects with DOMException name=AbortError (older runtimes)", async () => {
    const abortErr = new DOMException("The operation was aborted", "AbortError");
    const fetchMock = vi.fn().mockRejectedValueOnce(abortErr);
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchEA20({ url: TEST_URL })).rejects.toSatisfy(
      (err: unknown) => err instanceof IngestError && err.reason === "timeout",
    );
  });
});

describe("fetchEA20 — parse errors", () => {
  it("throws IngestError reason:parse when body is invalid JSON", async () => {
    mockFetchOnce({ status: 200, body: "not json {{" });

    await expect(fetchEA20({ url: TEST_URL })).rejects.toSatisfy(
      (err: unknown) => err instanceof IngestError && err.reason === "parse",
    );
  });

  it("throws IngestError reason:parse when body is valid JSON but fails EA20Schema", async () => {
    // '{}' is valid JSON but missing all required EA20 fields — Zod throws ZodError,
    // which client.ts wraps as IngestError('parse', ...).
    mockFetchOnce({ status: 200, body: "{}" });

    await expect(fetchEA20({ url: TEST_URL })).rejects.toSatisfy(
      (err: unknown) => err instanceof IngestError && err.reason === "parse",
    );
  });
});

describe("fetchEA20 — User-Agent header", () => {
  it("always sends the required User-Agent on every request", async () => {
    const mockFn = mockFetchOnce({ status: 200, body: FIXTURE_SP_Z1_TEXT });

    await fetchEA20({ url: TEST_URL });

    const [, init] = mockFn.mock.calls[0] as [string, RequestInit];
    const headers = init?.headers as Record<string, string>;
    expect(headers?.["User-Agent"]).toBe("SalaCofre/1.0 (interessado-divulgacao-cadastrado)");
  });
});

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------

describe("withRetry — 5xx retry exhaustion", () => {
  it("calls fn exactly 3 times and re-throws the last TSEError when all attempts fail", async () => {
    // NOTE: baseMs: 10 to avoid sleeping 1s+2s = 3s during this test.
    let callCount = 0;
    const fn = async (): Promise<never> => {
      callCount++;
      throw new TSEError(500, TEST_URL, "server error");
    };

    await expect(withRetry(fn, { attempts: 3, baseMs: 10 })).rejects.toBeInstanceOf(TSEError);

    expect(callCount).toBe(3);
  });
});

describe("withRetry — parse error is NOT retried", () => {
  it("calls fn exactly once and propagates immediately on IngestError('parse',...)", async () => {
    // NOTE: baseMs: 10 — irrelevant here because parse errors are fail-fast
    // and withRetry never sleeps before propagating them. Documented for
    // symmetry with tests that do rely on baseMs.
    let callCount = 0;
    const fn = async (): Promise<never> => {
      callCount++;
      throw new IngestError("parse", "schema mismatch");
    };

    await expect(withRetry(fn, { attempts: 3, baseMs: 10 })).rejects.toSatisfy(
      (err: unknown) => err instanceof IngestError && err.reason === "parse",
    );

    expect(callCount).toBe(1);
  });
});

describe("withRetry — network/timeout errors are retried", () => {
  it("calls fn 3 times and returns success when first 2 calls throw IngestError('network',...)", async () => {
    // NOTE: baseMs: 10 to avoid sleeping real time. With attempts=3 the max
    // sleep is 10ms + 20ms = 30ms — well within test timeout.
    let callCount = 0;
    const fn = async (): Promise<string> => {
      callCount++;
      if (callCount < 3) {
        throw new IngestError("network", "ECONNRESET");
      }
      return "success";
    };

    const result = await withRetry(fn, { attempts: 3, baseMs: 10 });
    expect(result).toBe("success");
    expect(callCount).toBe(3);
  });

  it("retries IngestError('timeout',...) and succeeds on subsequent attempt", async () => {
    // NOTE: baseMs: 10 — same rationale as above.
    let callCount = 0;
    const fn = async (): Promise<string> => {
      callCount++;
      if (callCount === 1) {
        throw new IngestError("timeout", "5000ms timeout");
      }
      return "recovered";
    };

    const result = await withRetry(fn, { attempts: 3, baseMs: 10 });
    expect(result).toBe("recovered");
    expect(callCount).toBe(2);
  });
});

describe("withRetry — non-retryable 4xx cancels immediately", () => {
  it("propagates TSEError(404,...) immediately without sleeping", async () => {
    // TSEError with status < 500 is not retryable per defaultShouldRetry.
    // The elapsed time should be well under 100ms because withRetry does NOT
    // sleep before propagating a non-retryable error.
    let callCount = 0;
    const fn = async (): Promise<never> => {
      callCount++;
      // 404 from fetchEA20 never reaches withRetry (it returns not_found),
      // but TSEError(404) CAN be thrown by lower-level callers — we verify
      // withRetry honours the shouldRetry contract in this edge case.
      throw new TSEError(404, TEST_URL);
    };

    const t0 = Date.now();
    await expect(withRetry(fn, { attempts: 3, baseMs: 1000 })).rejects.toBeInstanceOf(TSEError);
    const elapsed = Date.now() - t0;

    expect(callCount).toBe(1);
    // baseMs is 1000ms; if withRetry slept we'd see ≥1s. Tight budget confirms
    // immediate propagation.
    expect(elapsed).toBeLessThan(100);
  });
});
