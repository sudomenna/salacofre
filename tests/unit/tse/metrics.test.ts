// T20 — Unit tests do calculateLagSeconds (lib/tse/metrics.ts).
//
// Cobre cálculo de lag TSE→agora, base pro alerta RNF-034.
// TSE devolve dg no formato oficial `dd/mm/aaaa` (confirmado no dicionário
// EA20 2026-07-10 — ver docs/reference/tse-2026-leiautes.md) + hg (HH:mm:ss)
// em horário BRT (UTC-3, sem DST). `ddMMyyyy` (sem barras) também é aceito
// por compatibilidade retroativa com fixtures legadas.

import { describe, expect, it } from "vitest";
import { calculateLagSeconds } from "@/lib/tse/metrics";

describe("calculateLagSeconds", () => {
  it("calcula lag positivo para dg/hg no passado recente (formato oficial dd/mm/aaaa)", () => {
    // 04/10/2026 20:00:00 BRT = 23:00:00 UTC
    const tseTs = "04/10/2026";
    const tseHg = "20:00:00";
    const now = new Date("2026-10-04T23:01:00.000Z"); // 60s depois
    expect(calculateLagSeconds(tseTs, tseHg, now)).toBeCloseTo(60, 0);
  });

  it("retorna ~0 quando agora === tse timestamp (dd/mm/aaaa)", () => {
    const now = new Date("2026-10-04T23:00:00.000Z"); // 20:00 BRT
    expect(calculateLagSeconds("04/10/2026", "20:00:00", now)).toBeCloseTo(0, 0);
  });

  it("retorna negativo se tse ts está no futuro (clock skew, dd/mm/aaaa)", () => {
    const now = new Date("2026-10-04T23:00:00.000Z"); // 20:00 BRT
    const lag = calculateLagSeconds("04/10/2026", "20:00:30", now); // tse 30s no futuro
    expect(lag).toBeLessThan(0);
  });

  it("aceita também o formato legado ddMMyyyy (compatibilidade retroativa)", () => {
    const now = new Date("2026-10-04T23:01:00.000Z");
    expect(calculateLagSeconds("04102026", "20:00:00", now)).toBeCloseTo(60, 0);
  });

  it("dd/mm/aaaa e ddMMyyyy produzem o mesmo resultado para a mesma data", () => {
    const now = new Date("2026-10-04T23:01:00.000Z");
    const comBarras = calculateLagSeconds("04/10/2026", "20:00:00", now);
    const semBarras = calculateLagSeconds("04102026", "20:00:00", now);
    expect(comBarras).toBeCloseTo(semBarras, 6);
  });

  it("throw em dg malformado", () => {
    const now = new Date();
    expect(() => calculateLagSeconds("invalid", "20:00:00", now)).toThrow();
  });

  it("throw em dg com formato de data ambíguo/incompleto (ex.: barras faltando dígito)", () => {
    const now = new Date();
    expect(() => calculateLagSeconds("4/10/2026", "20:00:00", now)).toThrow();
  });

  it("throw em hg malformado", () => {
    const now = new Date();
    expect(() => calculateLagSeconds("04/10/2026", "not-a-time", now)).toThrow();
  });
});
