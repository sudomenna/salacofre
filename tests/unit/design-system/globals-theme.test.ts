/**
 * tests/unit/design-system/globals-theme.test.ts
 *
 * Guarda estrutural do `app/globals.css` depois da migração para Tailwind v4
 * `@theme static` (ADR-0025, Bloco 0 do redesign Atlas Menna).
 *
 * Por que este teste existe
 *   - `@theme` **sem** `static` faz o Tailwind v4 descartar as variáveis que
 *     nenhuma classe utilitária referencia. `lib/utils/cand-color.ts` lê os
 *     tokens de cor por `getComputedStyle` para alimentar o MapLibre em hex
 *     (`setPaintProperty` não aceita `var()`), e a maioria desses tokens NÃO
 *     aparece em classe nenhuma — só em `style` inline. Sem `static`, o mapa
 *     ficaria cinza em silêncio, sem erro de build e sem teste vermelho.
 *   - `tailwind.config.ts` (formato v3) nunca era carregado pelo build v4:
 *     `max-w-container` e `bg-bg-muted` eram no-ops silenciosos. O arquivo foi
 *     removido; este teste impede que classes órfãs voltem.
 *
 * O que NÃO cobre: se o CSS **emitido** de fato contém as variáveis — isso
 * depende do build e é verificado em `tests/e2e/tokens.spec.ts`, contra a
 * página real.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const css = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");

/** Conteúdo do primeiro bloco `@theme static { ... }` (chaves balanceadas). */
function themeStaticBlock(source: string): string {
  const start = source.indexOf("@theme static {");
  if (start === -1) return "";
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return "";
}

const block = themeStaticBlock(css);

describe("app/globals.css — @theme static", () => {
  it("declara o tema com a opção `static`, nunca `@theme` puro", () => {
    expect(css).toContain("@theme static {");
    // `@theme inline` é permitido (mapeia as variáveis do next/font);
    // `@theme` sem opção nenhuma, não.
    expect(css).not.toMatch(/@theme\s*\{/);
  });

  it("mantém dentro do bloco os tokens que o MapLibre lê por getComputedStyle", () => {
    const lidosPeloMapa = [
      ...Array.from({ length: 6 }, (_, i) => `--color-cand-${i + 1}:`),
      "--color-cand-other:",
      ...Array.from({ length: 6 }, (_, i) => `--color-cand-band-${i + 1}:`),
      "--color-cand-band-other:",
      "--color-tossup:",
    ];
    for (const token of lidosPeloMapa) {
      expect(block, `${token} precisa estar em @theme static`).toContain(token);
    }
  });

  it("declara --container-page, que gera a utilitária max-w-page", () => {
    expect(block).toContain("--container-page: 1280px;");
  });

  it("mantém a cascata de trilha (ADR-0019) fora do @theme", () => {
    // `--trilha-accent` é redefinida condicionalmente por `main[data-trilha]`;
    // dentro de `@theme` viraria um token de tema global e perderia o sentido.
    expect(block).not.toContain("--trilha-accent");
    expect(css).toContain('main[data-trilha="pres"]');
    expect(css).toContain('main[data-trilha="gov"]');
  });

  it("declara as três fontes via @theme inline, apontando para o next/font", () => {
    // As famílias vêm de `next/font/google` (app/layout.tsx), que injeta
    // `--font-sans-src`/`--font-serif-src`/`--font-mono-src` numa classe do
    // <html>. O `@theme inline` mapeia para os nomes finais; declarar uma
    // família literal aqui significaria uma fonte que o app não baixa.
    const inlineStart = css.indexOf("@theme inline {");
    expect(inlineStart).toBeGreaterThan(-1);
    const inlineBlock = css.slice(inlineStart, css.indexOf("}", inlineStart));
    for (const par of [
      ["--font-sans", "--font-sans-src"],
      ["--font-serif", "--font-serif-src"],
      ["--font-mono", "--font-mono-src"],
    ]) {
      expect(inlineBlock).toContain(`${par[0]}: var(${par[1]})`);
    }
    // Nenhuma família literal fora do mapeamento.
    expect(css).not.toContain('"JetBrains Mono", monospace');
    expect(block).not.toContain("--font-mono");
  });

  it("mantém os tokens que o kit consome por var() fora do namespace --text-*", () => {
    // `--text-*` é o namespace de font-size do Tailwind v4: declarar
    // `--text-muted: <cor>` dentro do `@theme` geraria uma utilitária
    // `text-muted` com uma cor no lugar de um tamanho.
    for (const token of ["--text-primary", "--text-secondary", "--text-muted", "--text-faint"]) {
      expect(block, `${token} não pode estar em @theme`).not.toContain(`${token}:`);
      expect(css, `${token} precisa existir em :root`).toContain(`${token}:`);
    }
  });

  it("mantém em hex literal todo token que o MapLibre lê", () => {
    // `setPaintProperty` não aceita `var()`; o valor precisa chegar resolvido.
    const literais = [/--color-cand-\d: #[0-9a-f]{6}/, /--map-stroke: #[0-9a-f]{6}/];
    for (const re of literais) {
      expect(block, `${re} precisa ser hex literal`).toMatch(re);
    }
  });
});
