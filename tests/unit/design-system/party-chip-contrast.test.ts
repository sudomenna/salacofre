/**
 * tests/unit/design-system/party-chip-contrast.test.ts
 *
 * **O gate de legibilidade do chip sólido.**
 *
 * `<PartyTag filled>` pinta o fundo com a cor do partido e escreve a sigla por
 * cima. A constituição § 4 (WCAG 2.1 AA, SC 1.4.3) exige **≥ 4,5:1** entre as
 * duas — e essa é uma propriedade do *par*, não de nenhuma das cores sozinha.
 * Este arquivo mede, para cada partido, o par `--party-<slug>-chip` /
 * `--party-<slug>-ink` **como está no CSS commitado**.
 *
 * O que motivou o gate (medido em 2026-09-07, antes da correção):
 *
 *   - a variante `filled` usava `--text-inverse` (tinta clara) para todo mundo,
 *     e a sigla ficava quase invisível em PSOL (#d6a400, 2,21:1), PSB
 *     (#c9a227, 2,34:1), NOVO (#e07b1d, 2,89:1) e no fallback cinza
 *     (#9aa0a8, 2,55:1);
 *   - trocar por uma tinta escura fixa não resolve: das 31 bases, **19 pedem a
 *     clara e 12 pedem a escura**. Nenhuma tinta única serve — daí um par por
 *     partido;
 *   - e dois verdes de meio-tom reprovam com as **duas** tintas — MDB
 *     (#2e8b57: 4,23:1 contra o preto, 4,10:1 contra o branco) e Rede
 *     (#3d8f3d: 4,45:1 e 3,91:1) — daí o chip poder ser a base escurecida.
 *
 * Os hexes acima são **os de 07/09**, preservados porque descrevem o defeito que
 * motivou o gate. Em 08/09 seis bases mudaram para resolver colisões entre
 * partidos (ver `party-separation.test.ts`): a divisão hoje é 21 tinta clara /
 * 10 escura, e o MDB é `#408a50` (4,25:1 e 4,09:1) — mesma conclusão, números
 * atualizados em `docs/design-system/tokens.md`. O teste mede o CSS commitado,
 * não estes números.
 *
 * **A colorimetria é reimplementada aqui de propósito**, sem importar
 * `scripts/gen-party-scale.ts`: um teste que reusa a função do gerador não
 * verifica o gerador, verifica a si mesmo. Se as duas implementações
 * divergirem, este teste falha — que é o comportamento desejado.
 *
 * O ΔE76 do chip contra os hexes oficiais (constituição § 2) é cobrado em
 * `party-delta-e.test.ts`, que já mede todos os tokens de partido.
 *
 * Cross-refs:
 *   - Constituição § 4: `docs/constitution.md`
 *   - Gerador: `scripts/gen-party-scale.ts` (seção 5b)
 *   - Consumidor: `lib/utils/party-color.ts` → `partyChipInk()`
 *   - Componente: `components/atoms/data/PartyTag.tsx`
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Contrato numérico
// ---------------------------------------------------------------------------

/** Mínimo de contraste de texto da constituição § 4 (WCAG 2.1 AA, SC 1.4.3). */
const CONTRAST_FLOOR = 4.5;

/** As duas tintas do kit — `--ink-0` e `--paper-0` em `app/globals.css`. */
const INK_DARK = "#14171b";
const INK_LIGHT = "#fbfbfc";

// ---------------------------------------------------------------------------
// Colorimetria WCAG — reimplementada (ver docblock)
// ---------------------------------------------------------------------------

/** Luminância relativa WCAG 2.1 de um hex sRGB. */
function relativeLuminance(hex: string): number {
  const channel = (i: number) => {
    const c = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** Razão de contraste WCAG 2.1 — (claro + 0,05) / (escuro + 0,05). */
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ---------------------------------------------------------------------------
// Entrada: o CSS commitado
// ---------------------------------------------------------------------------

const ROOT = path.resolve(import.meta.dirname, "../../..");
const TOKENS_CSS = readFileSync(path.join(ROOT, "app/tokens-party.css"), "utf8");

function parseTokens(css: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /--party-([a-z0-9-]+)\s*:\s*(#[0-9a-f]{6})\s*;/g;
  let m = re.exec(css);
  while (m !== null) {
    if (m[1] && m[2]) map.set(m[1], m[2]);
    m = re.exec(css);
  }
  return map;
}

/**
 * O CSS tem **dois** blocos de token desde o dark mode (ADR-0025 § 5) — o claro
 * em `@theme static { … }` e o escuro em `:root[data-theme="dark"] { … }` — com
 * os mesmos nomes de propósito. Um parser que varra o arquivo inteiro guardaria
 * só o último valor visto e mediria o chip escuro contra as tintas claras.
 */
function blockOf(css: string, opener: string): string {
  const start = css.indexOf(opener);
  if (start === -1) throw new Error(`bloco não encontrado em tokens-party.css: ${opener}`);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(start, i + 1);
    }
  }
  throw new Error(`bloco não fechado em tokens-party.css: ${opener}`);
}

/** Estados de corrida (`tie`, `none`): não são partido e não têm chip. */
const STATE_TOKENS = new Set(["tie", "none"]);

/**
 * As duas tintas candidatas de cada tema. No claro são `--ink-0` e `--paper-0`
 * do bloco claro; no escuro, os primitivos escuros do kit (`--paper-1` #14171b
 * e `--ink-0` #eceef1). O par chip/tinta é auto-contido — o que ele precisa
 * garantir é que a sigla se leia SOBRE o chip, não contra a página.
 */
const THEMES = [
  {
    id: "claro",
    tokens: parseTokens(blockOf(TOKENS_CSS, "@theme static {")),
    inkDark: INK_DARK,
    inkLight: INK_LIGHT,
    /** Direção em que o chip se move quando a base reprova. */
    direcao: "mais escuro" as const,
  },
  {
    id: "escuro",
    tokens: parseTokens(blockOf(TOKENS_CSS, ':root[data-theme="dark"] {')),
    inkDark: "#14171b",
    inkLight: "#eceef1",
    direcao: "mais claro" as const,
  },
] as const;

/** Tokens do tema claro — usados pelos testes que citam números medidos nele. */
const TOKENS = THEMES[0].tokens;

const PARTY_SLUGS = [...TOKENS.keys()]
  .filter((n) => n.endsWith("-chip"))
  .map((n) => n.slice(0, -"-chip".length))
  .filter((s) => !STATE_TOKENS.has(s))
  .sort();

// ---------------------------------------------------------------------------
// O gate — vale nos dois temas
// ---------------------------------------------------------------------------

for (const theme of THEMES) {
  const T = theme.tokens;
  const slugs = [...T.keys()]
    .filter((n) => n.endsWith("-chip"))
    .map((n) => n.slice(0, -"-chip".length))
    .filter((s) => !STATE_TOKENS.has(s))
    .sort();

  describe(`[tema ${theme.id}] constituição § 4 — o par chip/tinta do <PartyTag filled>`, () => {
    it("todo partido tem os dois tokens do par (um sem o outro não garante nada)", () => {
      expect(slugs.length).toBe(32);
      for (const slug of slugs) {
        expect(T.get(`${slug}-chip`), `--party-${slug}-chip ausente`).toMatch(/^#[0-9a-f]{6}$/);
        expect(T.get(`${slug}-ink`), `--party-${slug}-ink ausente`).toMatch(/^#[0-9a-f]{6}$/);
      }
    });

    it.each(slugs)("--party-%s: chip + ink dão pelo menos 4.5:1", (slug) => {
      const chip = T.get(`${slug}-chip`) as string;
      const ink = T.get(`${slug}-ink`) as string;
      const ratio = contrastRatio(chip, ink);
      expect(
        ratio,
        [
          `Tema ${theme.id}. --party-${slug}-chip (${chip}) com --party-${slug}-ink (${ink}) dá ` +
            `${ratio.toFixed(2)}:1.`,
          "",
          "A constituição § 4 (WCAG 2.1 AA, SC 1.4.3) exige 4.5:1 para texto — e a sigla do",
          "<PartyTag filled> é texto. Contraste medido para referência com as duas tintas:",
          `  contra ${theme.inkDark} : ${contrastRatio(chip, theme.inkDark).toFixed(2)}:1`,
          `  contra ${theme.inkLight}: ${contrastRatio(chip, theme.inkLight).toFixed(2)}:1`,
          "",
          "Rode `pnpm gen:party-scale` — ele move o chip em L* (matiz preservada) até a tinta",
          "oposta passar, e falha em vez de emitir um par ilegível. Se o CSS foi editado à",
          "mão, esta é a divergência.",
        ].join("\n"),
      ).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
    });

    it.each(slugs)("--party-%s-ink é uma das duas tintas do tema, e a melhor delas", (slug) => {
      const chip = T.get(`${slug}-chip`) as string;
      const ink = T.get(`${slug}-ink`) as string;
      // Só as duas do tema: uma tinta "quase preta" ou "quase branca" inventada
      // sairia do kit e ninguém teria medido o resto do sistema contra ela.
      expect([theme.inkDark, theme.inkLight], `--party-${slug}-ink: ${ink}`).toContain(ink);
      const dark = contrastRatio(chip, theme.inkDark);
      const light = contrastRatio(chip, theme.inkLight);
      const esperada = dark >= light ? theme.inkDark : theme.inkLight;
      expect(
        ink,
        `Tema ${theme.id}. --party-${slug}-chip (${chip}) contrasta ${dark.toFixed(2)}:1 com ` +
          `${theme.inkDark} e ${light.toFixed(2)}:1 com ${theme.inkLight} — a tinta emitida ` +
          `devia ser ${esperada}.`,
      ).toBe(esperada);
    });

    it(`onde o chip diverge da base, ele é ${theme.direcao} (intensidade, não outra cor)`, () => {
      // O § 2 v1.3 permite variar intensidade e proíbe variar matiz. A guarda de
      // matiz é o teste de arco em `tests/unit/utils/party-color.test.ts`; aqui
      // checamos a direção — que é oposta nos dois temas, porque o papel é.
      for (const slug of slugs) {
        const base = T.get(slug) as string;
        const chip = T.get(`${slug}-chip`) as string;
        if (chip === base) continue;
        const mais = relativeLuminance(chip) > relativeLuminance(base);
        expect(
          mais,
          `tema ${theme.id}: --party-${slug}-chip (${chip}) devia ser ${theme.direcao} que a ` +
            `base (${base})`,
        ).toBe(theme.direcao === "mais claro");
      }
    });
  });
}

// ---------------------------------------------------------------------------
// A repartição que justifica o par existir (números medidos no tema CLARO)
// ---------------------------------------------------------------------------

describe("por que nenhuma tinta fixa serve", () => {
  it("as duas tintas são usadas — nenhuma sozinha cobriria a paleta", () => {
    const claras = PARTY_SLUGS.filter((s) => TOKENS.get(`${s}-ink`) === INK_LIGHT).length;
    const escuras = PARTY_SLUGS.length - claras;
    // Números medidos sobre os chips (não sobre as bases): MDB e Rede escurecem
    // e por isso viram tinta clara, enquanto as bases delas pediriam a escura —
    // daí 22/10 aqui contra os 20/12 medidos nas bases pelo teste abaixo
    // (eram 21/10 e 19/12 antes do PTB entrar na paleta em 2026-09-20 — o PTB
    // pede tinta clara nos dois papéis, então soma 1 em cada "claras").
    expect(claras).toBeGreaterThan(0);
    expect(escuras).toBeGreaterThan(0);
    expect(claras + escuras).toBe(32);
  });

  it("medido nas bases: 20 partidos pedem tinta clara e 12 pedem escura", () => {
    // É este número que torna `--text-inverse` fixo indefensável: qualquer
    // tinta única reprova uma dúzia de partidos ou mais.
    const bases = PARTY_SLUGS.map((s) => TOKENS.get(s) as string);
    const claras = bases.filter(
      (hex) => contrastRatio(hex, INK_LIGHT) > contrastRatio(hex, INK_DARK),
    ).length;
    expect({ claras, escuras: bases.length - claras }).toEqual({ claras: 20, escuras: 12 });
  });

  it("MDB e Rede são exatamente os partidos cuja base reprova com as duas tintas", () => {
    // O chip deles precisa divergir da base; o de todos os outros não precisa.
    const reprovam = PARTY_SLUGS.filter((slug) => {
      const base = TOKENS.get(slug) as string;
      return (
        Math.max(contrastRatio(base, INK_DARK), contrastRatio(base, INK_LIGHT)) < CONTRAST_FLOOR
      );
    });
    expect(reprovam.sort()).toEqual(["mdb", "rede"]);
  });

  it("o chip só diverge da base onde a base reprovava — nos outros 29 é a própria base", () => {
    const divergem: string[] = [];
    for (const slug of PARTY_SLUGS) {
      if (TOKENS.get(`${slug}-chip`) !== TOKENS.get(slug)) divergem.push(slug);
    }
    expect(divergem.sort()).toEqual(["mdb", "rede"]);
  });

  it("onde o chip diverge, ele é mais ESCURO que a base (intensidade, não outra cor)", () => {
    // O § 2 v1.3 permite variar intensidade e proíbe variar matiz. A guarda de
    // matiz é o teste de arco em `tests/unit/utils/party-color.test.ts`; aqui
    // checamos a direção: escurecer, nunca clarear nem trocar de tom.
    for (const slug of ["mdb", "rede"]) {
      const base = TOKENS.get(slug) as string;
      const chip = TOKENS.get(`${slug}-chip`) as string;
      expect(
        relativeLuminance(chip),
        `--party-${slug}-chip (${chip}) não é mais escuro que a base (${base})`,
      ).toBeLessThan(relativeLuminance(base));
    }
  });
});
