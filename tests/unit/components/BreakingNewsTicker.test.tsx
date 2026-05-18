// @vitest-environment happy-dom
/**
 * tests/unit/components/BreakingNewsTicker.test.tsx — S06/F4d (Fase 3).
 *
 * Limitações de teste:
 *   - Os testes usam `renderToStaticMarkup` (SSR), então `useEffect` /
 *     `setInterval` NÃO disparam. Validamos o markup inicial em ambos os
 *     modos (rotação vs reduced) via prop `reducedMotion` override.
 *   - Rotação temporal real é coberta por testes de integração / e2e
 *     em Playwright (fora do escopo desta unit).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BreakingNewsTicker } from "@/components/blocks/BreakingNewsTicker";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

const SAMPLE = [
  { ts: "2026-10-04T22:15:00-03:00", texto: "SP chamada para Tarcísio (REP)" },
  { ts: "2026-10-04T22:10:00-03:00", texto: "RJ vai para o 2º turno" },
  { ts: "2026-10-04T22:05:00-03:00", texto: "Lula passa de 50%+1 no agregado nacional" },
];

describe("<BreakingNewsTicker />", () => {
  it("(a) sem chamadas → não renderiza nada", () => {
    const doc = parse(<BreakingNewsTicker chamadas={[]} />);
    const section = doc.querySelector('[data-testid="breaking-news-ticker"]');
    expect(section).toBeNull();
  });

  it("(b) modo rotativo: aria-live=polite + role=status", () => {
    const doc = parse(<BreakingNewsTicker chamadas={SAMPLE} reducedMotion={false} />);
    const section = doc.querySelector('[data-testid="breaking-news-ticker"]');
    expect(section?.getAttribute("data-mode")).toBe("rotating");
    expect(section?.getAttribute("aria-live")).toBe("polite");
    expect(section?.getAttribute("role")).toBe("status");
  });

  it("(c) modo rotativo: exibe a primeira chamada inicialmente", () => {
    const doc = parse(<BreakingNewsTicker chamadas={SAMPLE} reducedMotion={false} />);
    const current = doc.querySelector('[data-testid="ticker-current-text"]');
    expect(current?.textContent ?? "").toContain("Tarcísio");
  });

  it("(d) reduced mode: lista TODAS as chamadas empilhadas, sem rotação", () => {
    const doc = parse(<BreakingNewsTicker chamadas={SAMPLE} reducedMotion={true} />);
    const section = doc.querySelector('[data-testid="breaking-news-ticker"]');
    expect(section?.getAttribute("data-mode")).toBe("reduced");
    const text = doc.body.textContent ?? "";
    expect(text).toContain("Tarcísio");
    expect(text).toContain("2º turno");
    expect(text).toContain("50%");
    const items = doc.querySelectorAll("li");
    expect(items.length).toBe(3);
  });

  it("(e) reduced mode: sem aria-live (lista estática)", () => {
    const doc = parse(<BreakingNewsTicker chamadas={SAMPLE} reducedMotion={true} />);
    const section = doc.querySelector('[data-testid="breaking-news-ticker"]');
    expect(section?.getAttribute("aria-live")).toBeNull();
  });

  it("(f) formata horário em pt-BR (HH:mm)", () => {
    const doc = parse(<BreakingNewsTicker chamadas={SAMPLE} reducedMotion={true} />);
    const text = doc.body.textContent ?? "";
    // O horário formatado pode variar pela timezone do runner; verificamos
    // que existe um padrão HH:MM dentro do markup.
    expect(/\d{2}:\d{2}/.test(text)).toBe(true);
  });
});
