/**
 * tests/unit/tse/rate-limiter.test.ts
 *
 * Unit tests para lib/tse/rate-limiter.ts (createTokenBucket + singleton).
 *
 * Cobre: RF-001 (respeitar o limite de 100 req/s/IP do TSE).
 *
 * Estratégia: relógio e sleep injetados via TokenBucketOptions — o "sleep"
 * apenas avança um relógio virtual em vez de esperar tempo real, tornando o
 * teste instantâneo mesmo simulando segundos de espera.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createTokenBucket, getTseRateLimiter, resetTseRateLimiter } from "@/lib/tse/rate-limiter";

// ---------------------------------------------------------------------------
// Virtual clock helper
// ---------------------------------------------------------------------------

function makeVirtualClock(): { now: () => number; sleep: (ms: number) => Promise<void> } {
  let clock = 0;
  return {
    now: () => clock,
    sleep: async (ms: number) => {
      clock += ms;
    },
  };
}

// ---------------------------------------------------------------------------
// createTokenBucket
// ---------------------------------------------------------------------------

describe("createTokenBucket", () => {
  it("burst inicial não espera — as primeiras `ratePerSec` chamadas são imediatas", async () => {
    const { now, sleep } = makeVirtualClock();
    const bucket = createTokenBucket({ ratePerSec: 10, now, sleep });

    for (let i = 0; i < 10; i++) {
      await bucket.acquire();
    }

    expect(bucket.stats.waitedMs).toBe(0);
    expect(bucket.stats.acquired).toBe(10);
  });

  it("10 rps → 25 acquire() concorrentes levam >= 1.5s virtuais de espera acumulada", async () => {
    const { now, sleep } = makeVirtualClock();
    const bucket = createTokenBucket({ ratePerSec: 10, now, sleep });

    const calls = Array.from({ length: 25 }, () => bucket.acquire());
    await Promise.all(calls);

    // Primeiras 10 saem do burst sem espera; as 15 restantes precisam
    // esperar ~100ms cada (1/10s) para repor 1 token — total ~1500ms.
    expect(bucket.stats.waitedMs).toBeGreaterThanOrEqual(1500);
    expect(bucket.stats.acquired).toBe(25);
  });

  it("stats.maxQueue reflete o pico de chamadas concorrentes aguardando", async () => {
    const { now, sleep } = makeVirtualClock();
    const bucket = createTokenBucket({ ratePerSec: 5, now, sleep });

    const calls = Array.from({ length: 12 }, () => bucket.acquire());
    expect(bucket.stats.maxQueue).toBe(12);
    await Promise.all(calls);
  });

  it("tryAcquire nunca espera — retorna false quando o bucket está vazio", async () => {
    const { now, sleep } = makeVirtualClock();
    const bucket = createTokenBucket({ ratePerSec: 2, burst: 2, now, sleep });

    expect(bucket.tryAcquire()).toBe(true);
    expect(bucket.tryAcquire()).toBe(true);
    expect(bucket.tryAcquire()).toBe(false); // bucket vazio, relógio não andou
    expect(bucket.stats.waitedMs).toBe(0);
  });

  it("respeita `burst` diferente de `ratePerSec`", async () => {
    const { now, sleep } = makeVirtualClock();
    const bucket = createTokenBucket({ ratePerSec: 10, burst: 3, now, sleep });

    await bucket.acquire();
    await bucket.acquire();
    await bucket.acquire();
    expect(bucket.stats.waitedMs).toBe(0); // 3 tokens de burst, sem espera

    await bucket.acquire(); // 4ª chamada — precisa esperar 1/10s = 100ms
    expect(bucket.stats.waitedMs).toBeGreaterThanOrEqual(100);
  });

  it("lança erro para ratePerSec <= 0", () => {
    expect(() => createTokenBucket({ ratePerSec: 0 })).toThrow();
    expect(() => createTokenBucket({ ratePerSec: -5 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// getTseRateLimiter (singleton + env)
// ---------------------------------------------------------------------------

describe("getTseRateLimiter", () => {
  afterEach(() => {
    resetTseRateLimiter();
    vi.unstubAllEnvs();
  });

  // Default 40, não 50: com o cron por cargo (ADR-0035 D3) duas invocações
  // podem correr no mesmo IP com buckets independentes. 2 × 50 daria
  // exatamente os 100 rps do teto do TSE, e a constituição § 1 exige teto
  // "bem abaixo" do limite documentado — 2 × 40 = 80 devolve a margem.
  it("usa default 40 rps quando TSE_MAX_RPS está ausente (§ 1: margem agregada)", () => {
    vi.stubEnv("TSE_MAX_RPS", "");
    const bucket = getTseRateLimiter();

    // Burst default = ratePerSec; 40 tryAcquire() consecutivos devem passar,
    // o 41º deve falhar (relógio real não anda entre chamadas síncronas).
    let succeeded = 0;
    for (let i = 0; i < 41; i++) {
      if (bucket.tryAcquire()) succeeded++;
    }
    expect(succeeded).toBe(40);
  });

  it("respeita TSE_MAX_RPS dentro do clamp [1, 50]", () => {
    vi.stubEnv("TSE_MAX_RPS", "5");
    const bucket = getTseRateLimiter();

    let succeeded = 0;
    for (let i = 0; i < 10; i++) {
      if (bucket.tryAcquire()) succeeded++;
    }
    expect(succeeded).toBe(5);
  });

  // RF-010.3 (spec 001): a taxa efetiva nunca pode passar de 50 req/s, teto de
  // segurança abaixo dos 100 req/s documentados pelo TSE. Se este teste falhar
  // por o clamp ter subido, a spec é que manda — revise RF-010.3 antes do código.
  it("clampa valores acima de 50 para 50 (teto RF-010.3)", () => {
    vi.stubEnv("TSE_MAX_RPS", "500");
    const bucket = getTseRateLimiter();

    let succeeded = 0;
    for (let i = 0; i < 60; i++) {
      if (bucket.tryAcquire()) succeeded++;
    }
    expect(succeeded).toBe(50);
  });

  it("clampa valores abaixo de 1 para 1", () => {
    vi.stubEnv("TSE_MAX_RPS", "0");
    const bucket = getTseRateLimiter();

    let succeeded = 0;
    for (let i = 0; i < 3; i++) {
      if (bucket.tryAcquire()) succeeded++;
    }
    expect(succeeded).toBe(1);
  });

  it("reaproveita a mesma instância entre chamadas até resetTseRateLimiter()", () => {
    vi.stubEnv("TSE_MAX_RPS", "10");
    const a = getTseRateLimiter();
    const b = getTseRateLimiter();
    expect(a).toBe(b);

    resetTseRateLimiter();
    const c = getTseRateLimiter();
    expect(c).not.toBe(a);
  });
});
