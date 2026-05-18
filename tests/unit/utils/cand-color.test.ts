// @vitest-environment happy-dom
/**
 * tests/unit/utils/cand-color.test.ts
 *
 * Cobertura do helper `lib/utils/cand-color.ts` (ADR-0013, S05/F2).
 * Garante:
 *   - mapping determinístico rank → token (constituição § 6)
 *   - fallback `--color-cand-other` para rank fora do intervalo
 *   - `resolveCandHex` lê CSS custom properties em runtime
 *   - SSR-safety: `resolveCandHex` retorna fallback sem window
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  bandForRank,
  colorForRank,
  MAX_CAND_RANK,
  resolveBandHex,
  resolveCandHex,
} from "@/lib/utils/cand-color";

describe("colorForRank", () => {
  it("retorna var(--color-cand-1) para rank 1", () => {
    expect(colorForRank(1)).toBe("var(--color-cand-1)");
  });

  it(`retorna var(--color-cand-${MAX_CAND_RANK}) para rank MAX_CAND_RANK`, () => {
    expect(colorForRank(MAX_CAND_RANK)).toBe(`var(--color-cand-${MAX_CAND_RANK})`);
  });

  it("retorna var(--color-cand-other) para rank acima de MAX_CAND_RANK", () => {
    expect(colorForRank(MAX_CAND_RANK + 1)).toBe("var(--color-cand-other)");
    expect(colorForRank(99)).toBe("var(--color-cand-other)");
  });

  it("retorna var(--color-cand-other) para rank 0 ou negativo", () => {
    expect(colorForRank(0)).toBe("var(--color-cand-other)");
    expect(colorForRank(-1)).toBe("var(--color-cand-other)");
  });

  it("retorna var(--color-cand-other) para NaN ou Infinity", () => {
    expect(colorForRank(Number.NaN)).toBe("var(--color-cand-other)");
    expect(colorForRank(Number.POSITIVE_INFINITY)).toBe("var(--color-cand-other)");
  });
});

describe("bandForRank", () => {
  it("retorna var(--color-cand-band-3) para rank 3", () => {
    expect(bandForRank(3)).toBe("var(--color-cand-band-3)");
  });

  it("retorna var(--color-cand-band-other) para rank fora do intervalo", () => {
    expect(bandForRank(0)).toBe("var(--color-cand-band-other)");
    expect(bandForRank(MAX_CAND_RANK + 5)).toBe("var(--color-cand-band-other)");
  });
});

describe("resolveCandHex (DOM)", () => {
  // happy-dom não injeta automaticamente o CSS de app/globals.css.
  // Injetamos um <style> com os tokens para simular o documento real.
  beforeEach(() => {
    const style = document.createElement("style");
    style.id = "test-tokens";
    style.textContent = `
      :root {
        --color-cand-1: #d33732;
        --color-cand-2: #2a52be;
        --color-cand-3: #c97c1f;
        --color-cand-other: #6e6e6e;
        --color-cand-band-1: #f0c9c8;
        --color-cand-band-other: #d9d9d9;
      }
    `;
    document.head.appendChild(style);
  });

  afterEach(() => {
    document.getElementById("test-tokens")?.remove();
  });

  it("resolve rank 1 para o hex do token --color-cand-1", () => {
    expect(resolveCandHex(1)).toBe("#d33732");
  });

  it("resolve rank 2 para o hex de --color-cand-2", () => {
    expect(resolveCandHex(2)).toBe("#2a52be");
  });

  it("resolve rank fora do intervalo para o hex de --color-cand-other", () => {
    expect(resolveCandHex(99)).toBe("#6e6e6e");
    expect(resolveCandHex(0)).toBe("#6e6e6e");
  });

  it("resolveBandHex(1) retorna o hex de --color-cand-band-1", () => {
    expect(resolveBandHex(1)).toBe("#f0c9c8");
  });

  it("resolveBandHex fora do intervalo retorna --color-cand-band-other", () => {
    expect(resolveBandHex(MAX_CAND_RANK + 1)).toBe("#d9d9d9");
  });
});
