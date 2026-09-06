/**
 * lib/utils/cand-color.ts
 *
 * Helper canônico para resolver cor de candidato por rank.
 *
 * Princípios
 *   - Constituição § 2 (neutralidade): cores via tokens, nunca oficiais
 *     partidárias. Mapping é por **rank** projetado, não por sigla.
 *   - ADR-0013: paleta neutra de 6 cores principais cobre top-6
 *     candidatos com pct_apurado ≥ 1%; rank 7+ (ou pct < 1%) cai em
 *     `--color-cand-other` (cinza). Orchestrator Python congela rank
 *     ("color lock") quando pct_apurado cruza 1% para evitar troca de
 *     cor durante a noite.
 *   - Determinismo (constituição § 6): mesmo rank → mesmo token. Sem
 *     `Math.random()`, sem mutação global.
 *
 * Quem usa
 *   - **Front-end (componentes UI)** — overrides defensivos quando o
 *     payload Edge Config vem com `cor: null/undefined` (ex.: mocks de
 *     teste, fixtures antigas, fallback se orchestrator pular o campo).
 *     Em produção, o orchestrator publica `cor = "var(--color-cand-{rank})"`
 *     direto no `EdgeCandidate`, então componentes consomem `c.cor`
 *     diretamente.
 *   - **Mapas (MapLibre)** — `setPaintProperty` não aceita `var()` em
 *     paint values; precisa do hex resolvido em runtime via
 *     `getComputedStyle` (ver `resolveCandHex`).
 *   - **Stories / fixtures de teste** — gera arrays de candidatos
 *     sintéticos com cores corretas sem hardcoded strings espalhadas.
 *
 * Cross-refs
 *   - Tokens: `app/globals.css` (--color-cand-1..6, --color-cand-other,
 *     --color-cand-band-1..6, --color-cand-band-other)
 *   - Docs: `docs/design-system/tokens.md` § Paleta multi-candidato
 *   - ADR: 0013 (a ser formalizado na Fase 4 de S05/F2)
 */

/**
 * Quantidade máxima de cores principais na paleta. Rank > MAX_CAND_RANK
 * cai em `--color-cand-other`. Definido em 6 pra cobrir o cenário 1T
 * 2026 (≥6 candidatos com pct projetado ≥ 1%) sem explosão de paleta.
 */
export const MAX_CAND_RANK = 6;

/** Token CSS literal pra cor principal — usado direto em `style={{ background: ... }}`. */
export type CandColorVar = `var(--color-cand-${number})` | "var(--color-cand-other)";

/** Token CSS literal pra versão band (clara) — fundos de mapa, pull-quotes. */
export type CandBandVar = `var(--color-cand-band-${number})` | "var(--color-cand-band-other)";

/**
 * Retorna o token CSS literal pra um rank dado (1..MAX_CAND_RANK).
 * Rank fora do intervalo → `--color-cand-other` (cinza).
 *
 * Exemplo:
 *   colorForRank(1) === "var(--color-cand-1)"
 *   colorForRank(7) === "var(--color-cand-other)"
 *   colorForRank(0) === "var(--color-cand-other)"
 */
export function colorForRank(rank: number): CandColorVar {
  if (!Number.isFinite(rank) || rank < 1 || rank > MAX_CAND_RANK) {
    return "var(--color-cand-other)";
  }
  return `var(--color-cand-${rank})` as CandColorVar;
}

/**
 * Versão clara (band) — pra fundos suaves (mapa fill, pull-quote bg).
 * Mesma lógica de fallback de `colorForRank`.
 *
 * Exemplo:
 *   bandForRank(3) === "var(--color-cand-band-3)"
 *   bandForRank(99) === "var(--color-cand-band-other)"
 */
export function bandForRank(rank: number): CandBandVar {
  if (!Number.isFinite(rank) || rank < 1 || rank > MAX_CAND_RANK) {
    return "var(--color-cand-band-other)";
  }
  return `var(--color-cand-band-${rank})` as CandBandVar;
}

/**
 * Resolve o hex (#RRGGBB) em runtime no cliente. Necessário pra
 * `MapLibre setPaintProperty`, que não aceita `var(--...)` em paint
 * values — precisa de string CSS literal.
 *
 * SSR-safe: retorna `"#d9d9d9"` (mesmo do --color-tossup) no servidor
 * onde `document` não existe. Componentes de mapa só renderizam no
 * cliente via `next/dynamic({ ssr: false })` (ADR-0010), então o
 * fallback SSR nunca aparece em produção — mas evita crash em
 * `renderToStaticMarkup` em testes/snapshots.
 */
export function resolveCandHex(rank: number): string {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return "#d9d9d9";
  }
  const cssVar =
    !Number.isFinite(rank) || rank < 1 || rank > MAX_CAND_RANK
      ? "--color-cand-other"
      : `--color-cand-${rank}`;
  return getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
}

/** Mesmo de `resolveCandHex` mas pra band (clara). */
export function resolveBandHex(rank: number): string {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return "#d9d9d9";
  }
  const cssVar =
    !Number.isFinite(rank) || rank < 1 || rank > MAX_CAND_RANK
      ? "--color-cand-band-other"
      : `--color-cand-band-${rank}`;
  return getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
}

/** Token CSS literal pra versão escura — fundos sólidos com texto branco. */
export type CandStrongVar = `var(--color-cand-${number}-strong)` | "var(--color-cand-other)";

/**
 * Versão escura (strong) — pra **fundo sólido com texto branco por cima**.
 *
 * Existe porque `--color-cand-3` (âmbar) e `--color-cand-5` (lilás) não têm
 * contraste suficiente com branco: o avatar de iniciais do `<CandidateRow />`
 * ficava em ~3:1, falhando WCAG 1.4.3 / RNF-022 (achado do `a11y-perf-auditor`
 * em 2026-09-05, já previsto como watch item em `globals.css`). Os tokens
 * `--color-cand-N-strong` já existiam para isso e não estavam sendo usados.
 *
 * **Não substitui `colorForRank`.** Aquela continua sendo a cor de identidade do
 * candidato (barras, ticks, linhas) e é congelada pelo ADR-0013. Use esta
 * **apenas** quando houver texto por cima do preenchimento.
 *
 * Exemplo:
 *   strongForRank(3) === "var(--color-cand-3-strong)"
 *   strongForRank(99) === "var(--color-cand-other)"
 */
export function strongForRank(rank: number): CandStrongVar {
  if (!Number.isFinite(rank) || rank < 1 || rank > MAX_CAND_RANK) {
    return "var(--color-cand-other)";
  }
  return `var(--color-cand-${rank}-strong)` as CandStrongVar;
}

/**
 * Extrai o rank de uma string CSS var produzida por `colorForRank()`.
 * Ex: `"var(--color-cand-3)"` → 3 | `"var(--color-cand-other)"` → undefined.
 * Útil pra componentes (como `<WinnerBanner />`) que precisam decidir
 * cor de texto adaptativa baseada no rank do candidato, mas só recebem
 * a string `cor` do payload (não o rank numérico).
 * Retorna `undefined` se a string não corresponder ao padrão esperado.
 */
export function rankFromColorVar(cor: string | undefined | null): number | undefined {
  if (!cor) return undefined;
  const match = cor.match(/--color-cand-(\d+)/);
  if (!match) return undefined;
  const rank = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(rank) || rank < 1 || rank > MAX_CAND_RANK) return undefined;
  return rank;
}
