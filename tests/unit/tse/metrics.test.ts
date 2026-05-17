// T20 — Unit tests do calculateLagSeconds (lib/tse/metrics.ts).
//
// Cobre cálculo de lag TSE→agora, base pro alerta RNF-034.
// TSE devolve dg (ddMMyyyy) + hg (HH:mm:ss) em horário BRT (UTC-3, sem DST).

import { describe, expect, it } from "vitest";
import { calculateLagSeconds } from "@/lib/tse/metrics";

describe("calculateLagSeconds", () => {
  it("calcula lag positivo para dg/hg no passado recente", () => {
    // 04/10/2026 20:00:00 BRT = 23:00:00 UTC
    const tseTs = "04102026";
    const tseHg = "20:00:00";
    const now = new Date("2026-10-04T23:01:00.000Z"); // 60s depois
    expect(calculateLagSeconds(tseTs, tseHg, now)).toBeCloseTo(60, 0);
  });

  it("retorna ~0 quando agora === tse timestamp", () => {
    const now = new Date("2026-10-04T23:00:00.000Z"); // 20:00 BRT
    expect(calculateLagSeconds("04102026", "20:00:00", now)).toBeCloseTo(0, 0);
  });

  it("retorna negativo se tse ts está no futuro (clock skew)", () => {
    const now = new Date("2026-10-04T23:00:00.000Z"); // 20:00 BRT
    const lag = calculateLagSeconds("04102026", "20:00:30", now); // tse 30s no futuro
    expect(lag).toBeLessThan(0);
  });

  it("throw em dg malformado", () => {
    const now = new Date();
    expect(() => calculateLagSeconds("invalid", "20:00:00", now)).toThrow();
  });

  it("throw em hg malformado", () => {
    const now = new Date();
    expect(() => calculateLagSeconds("04102026", "not-a-time", now)).toThrow();
  });
});
