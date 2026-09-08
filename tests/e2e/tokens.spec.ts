import { expect, test } from "@playwright/test";

/**
 * tests/e2e/tokens.spec.ts
 *
 * Guarda de runtime dos tokens do tema (ADR-0025, Bloco 0 do redesign).
 *
 * O modo de falha que este spec existe para pegar: o Tailwind v4 descarta
 * variáveis de `@theme` que nenhuma classe utilitária referencia. Quase todos
 * os tokens de cor deste projeto só aparecem em `style` inline
 * (`var(--color-cand-3)`) ou são lidos por `getComputedStyle` para alimentar o
 * MapLibre em hex (`lib/utils/cand-color.ts` — `setPaintProperty` não aceita
 * `var()`). Se alguém trocar `@theme static` por `@theme`, o build continua
 * verde, os testes unitários continuam verdes, e o mapa fica cinza em produção.
 *
 * `tests/unit/design-system/globals-theme.test.ts` cobre a fonte; este cobre o
 * CSS **emitido**, que é o que o navegador realmente vê.
 */

/** Tokens que o mapa resolve em hex — nenhum deles aparece em classe utilitária. */
const TOKENS_DO_MAPA = [
  "--color-cand-1",
  "--color-cand-2",
  "--color-cand-3",
  "--color-cand-4",
  "--color-cand-5",
  "--color-cand-6",
  "--color-cand-other",
  "--color-cand-band-1",
  "--color-cand-band-6",
  "--color-cand-band-other",
  "--color-tossup",
];

test.describe("tokens do tema no CSS emitido", () => {
  test("todo token lido pelo MapLibre resolve para um hex no <html>", async ({ page }) => {
    await page.goto("/");
    const valores = await page.evaluate((tokens) => {
      const cs = getComputedStyle(document.documentElement);
      return Object.fromEntries(tokens.map((t) => [t, cs.getPropertyValue(t).trim()]));
    }, TOKENS_DO_MAPA);

    for (const token of TOKENS_DO_MAPA) {
      expect(valores[token], `${token} veio vazio — @theme perdeu o \`static\`?`).toMatch(
        /^#[0-9a-f]{3,8}$/i,
      );
    }
  });

  test("--container-page vale 1280px e o <main> respeita a largura", async ({ page }) => {
    await page.goto("/");
    const containerPage = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--container-page").trim(),
    );
    expect(containerPage).toBe("1280px");

    const maxWidth = await page.evaluate(() => {
      const main = document.querySelector("main");
      return main ? getComputedStyle(main).maxWidth : null;
    });
    expect(maxWidth).toBe("1280px");
  });

  test("as fontes do next/font continuam resolvendo por var(--font-*)", async ({ page }) => {
    await page.goto("/");
    // Bloco 1: as famílias passaram a ser Spectral (display), Archivo (corpo) e
    // JetBrains Mono (números). Os consumidores reais usam `style={{ fontFamily: "var(--font-serif)" }}`;
    // se o `@theme inline` deixar de emitir a variável em `:root`, a família
    // cai no fallback do navegador sem nenhum erro visível.
    const fontes = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        sans: cs.getPropertyValue("--font-sans").trim(),
        serif: cs.getPropertyValue("--font-serif").trim(),
        body: getComputedStyle(document.body).fontFamily,
      };
    });
    expect(fontes.sans).not.toBe("");
    expect(fontes.serif).not.toBe("");
    expect(fontes.body).toContain("Archivo");
  });

  test("a cascata de trilha sobrevive à migração de tokens", async ({ page }) => {
    await page.goto("/");
    const accent = await page.evaluate(() => {
      const main = document.querySelector("main[data-trilha='pres']");
      return main ? getComputedStyle(main).getPropertyValue("--trilha-accent").trim() : null;
    });
    expect(accent).toBe("#17365c");
  });
});
