/**
 * tests/unit/tse/ingest-window.test.ts
 *
 * Unit tests para lib/tse/ingest-window.ts.
 *
 * Cobre: RF-002 (janela de ingestão), agora configurável para acomodar a
 * janela diurna dos simulados TSE (9h-17h BRT) além da janela noturna de
 * apuração real (17h-04h BRT).
 */

import { describe, expect, it } from "vitest";
import { isWithinIngestWindow, parseIngestWindow } from "@/lib/tse/ingest-window";

describe("parseIngestWindow", () => {
  it('parseia "17-04" (janela noturna cruzando meia-noite)', () => {
    expect(parseIngestWindow("17-04")).toEqual({ startHourBrt: 17, endHourBrt: 4 });
  });

  it('parseia "9-17" (janela diurna, simulados TSE)', () => {
    expect(parseIngestWindow("9-17")).toEqual({ startHourBrt: 9, endHourBrt: 17 });
  });

  it("lança erro para formato inválido", () => {
    expect(() => parseIngestWindow("abc")).toThrow();
    expect(() => parseIngestWindow("17")).toThrow();
    expect(() => parseIngestWindow("17-04-00")).toThrow();
    expect(() => parseIngestWindow("")).toThrow();
  });

  it("lança erro para horas fora de 0-23", () => {
    expect(() => parseIngestWindow("24-04")).toThrow();
    expect(() => parseIngestWindow("17-25")).toThrow();
  });

  it("usa INGEST_WINDOW do ambiente como default quando `raw` não é passado", () => {
    const original = process.env.INGEST_WINDOW;
    try {
      process.env.INGEST_WINDOW = "10-18";
      expect(parseIngestWindow()).toEqual({ startHourBrt: 10, endHourBrt: 18 });
    } finally {
      if (original !== undefined) process.env.INGEST_WINDOW = original;
      else delete process.env.INGEST_WINDOW;
    }
  });

  it('default "17-04" quando INGEST_WINDOW está ausente', () => {
    const original = process.env.INGEST_WINDOW;
    try {
      delete process.env.INGEST_WINDOW;
      expect(parseIngestWindow()).toEqual({ startHourBrt: 17, endHourBrt: 4 });
    } finally {
      if (original !== undefined) process.env.INGEST_WINDOW = original;
    }
  });
});

describe("isWithinIngestWindow", () => {
  describe('janela "17-04" (noturna, cruza meia-noite)', () => {
    const window = parseIngestWindow("17-04");

    it("20h UTC (17h BRT — início da janela) está dentro", () => {
      expect(isWithinIngestWindow(new Date("2026-10-04T20:00:00.000Z"), window)).toBe(true);
    });

    it("07h UTC (04h BRT — exatamente o fim) está fora", () => {
      expect(isWithinIngestWindow(new Date("2026-10-05T07:00:00.000Z"), window)).toBe(false);
    });

    it("06h UTC (03h BRT — 1h antes do fim) está dentro", () => {
      expect(isWithinIngestWindow(new Date("2026-10-05T06:00:00.000Z"), window)).toBe(true);
    });

    it("15h UTC (12h BRT — meio do dia) está fora", () => {
      expect(isWithinIngestWindow(new Date("2026-10-04T15:00:00.000Z"), window)).toBe(false);
    });
  });

  describe('janela "9-17" (diurna, simulados TSE)', () => {
    const window = parseIngestWindow("9-17");

    it("12h UTC (9h BRT — início da janela) está dentro", () => {
      expect(isWithinIngestWindow(new Date("2026-09-15T12:00:00.000Z"), window)).toBe(true);
    });

    it("20h UTC (17h BRT — exatamente o fim) está fora", () => {
      expect(isWithinIngestWindow(new Date("2026-09-15T20:00:00.000Z"), window)).toBe(false);
    });

    it("19h UTC (16h BRT — 1h antes do fim) está dentro", () => {
      expect(isWithinIngestWindow(new Date("2026-09-15T19:00:00.000Z"), window)).toBe(true);
    });

    it("03h UTC (0h BRT — madrugada) está fora", () => {
      expect(isWithinIngestWindow(new Date("2026-09-15T03:00:00.000Z"), window)).toBe(false);
    });
  });
});
