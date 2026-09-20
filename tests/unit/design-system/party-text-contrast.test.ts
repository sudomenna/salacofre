/**
 * tests/unit/design-system/party-text-contrast.test.ts
 *
 * **O gate de legibilidade da cor de partido usada como TEXTO.**
 *
 * O par `-chip`/`-ink` cobre o caso "rótulo em cima da cor do partido"
 * (`party-chip-contrast.test.ts`). Este arquivo cobre o caso simétrico e mais
 * comum na tela: **a cor do partido escrevendo sobre o papel** — o número
 * grande de um termômetro, o nome do líder numa lista, qualquer valor colorido
 * por identidade. O token é `--party-<slug>-text`, e a constituição § 4 (WCAG
 * 2.1 AA, SC 1.4.3) exige ≥ 4,5:1 contra a superfície em que ele cai.
 *
 * O que motivou o gate (medido em 2026-09-07, antes da correção):
 *
 *   - não existia token nenhum para este caso, e quem precisava de "a cor do
 *     partido, mas como texto" usava a base — que é cor de **preenchimento**;
 *   - medidas contra `--surface-page` (#f3f4f6), quatro bases reprovam sem
 *     margem para discussão: PSOL 2,08:1, PSB 2,20:1, o fallback cinza 2,39:1 e
 *     NOVO 2,72:1. Ao todo, **14 das 31** ficam abaixo de 4,5:1;
 *   - o `-chip` não substitui: em 19 dos 31 partidos ele é uma cor **clara**
 *     (foi escolhido para contrastar com uma tinta, não com o papel).
 *     `--party-psol-chip` é o próprio #d6a400.
 *
 * Os números acima são **os de 07/09**, preservados porque descrevem o defeito
 * que motivou o gate. Em 08/09 seis bases mudaram para resolver colisões entre
 * partidos (ver `party-separation.test.ts`): PSB passou a `#b6a92a` (2,19:1) e o
 * chip é claro em 21 dos 31 — mesma conclusão, números atualizados em
 * `docs/design-system/tokens.md`. O teste mede o CSS commitado, não estes
 * números.
 *
 * O gate mede **duas** superfícies, não uma. O mesmo número aparece dentro de um
 * card (`--surface-card`, #fbfbfc) e direto sobre o fundo da página
 * (`--surface-page`, #f3f4f6). A página é a mais escura das duas e portanto a
 * que manda; medir as duas mantém o número visível e faz uma futura troca de
 * papel falhar aqui em vez de na tela.
 *
 * **A colorimetria é reimplementada aqui de propósito**, sem importar
 * `scripts/gen-party-scale.ts`: um teste que reusa a função do gerador não
 * verifica o gerador, verifica a si mesmo. Se as duas implementações
 * divergirem, este teste falha — que é o comportamento desejado.
 *
 * O ΔE76 dos tokens `-text` contra os hexes oficiais (constituição § 2) é
 * cobrado em `party-delta-e.test.ts`, que já mede todos os tokens de partido —
 * escurecer para ganhar contraste é exatamente o movimento capaz de aproximar a
 * cor do fim do gradiente escuro que muitos manuais de partido publicam.
 *
 * Cross-refs:
 *   - Constituição § 4: `docs/constitution.md`
 *   - Gerador: `scripts/gen-party-scale.ts` (seção 5c)
 *   - Consumidor: `lib/utils/party-color.ts` → `textForParty()`
 *   - Superfícies: `app/globals.css` (`--surface-page`, `--surface-card`)
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Contrato numérico
// ---------------------------------------------------------------------------

/** Mínimo de contraste de texto da constituição § 4 (WCAG 2.1 AA, SC 1.4.3). */
const CONTRAST_FLOOR = 4.5;

/**
 * As duas superfícies de papel do kit, com o hex literal — `--surface-page` e
 * `--surface-card` em `app/globals.css`.
 *
 * Ficam literais aqui pelo mesmo motivo que a colorimetria é reimplementada:
 * este teste não deve depender de nada que o CSS gerado ou o gerador possam
 * mudar junto com o que está sendo verificado. O teste de sincronia com
 * `app/globals.css` está logo abaixo.
 */
const SURFACES = [
  { token: "--surface-page", hex: "#f3f4f6" },
  { token: "--surface-card", hex: "#fbfbfc" },
] as const;

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
const GLOBALS_CSS = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");

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
 * só o último valor visto: mediria a tinta escura contra o papel claro, e o
 * gate reprovaria a paleta certa pelo motivo errado.
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

/** Superfícies de papel do tema escuro — `--paper-1` e `--paper-0` em dark. */
const DARK_SURFACES = [
  { token: "--surface-page", hex: "#14171b" },
  { token: "--surface-card", hex: "#1c1f24" },
] as const;

const THEMES = [
  {
    id: "claro",
    tokens: parseTokens(blockOf(TOKENS_CSS, "@theme static {")),
    surfaces: SURFACES,
    /** Direção em que a tinta se move quando a base reprova sobre o papel. */
    direcao: "mais escura" as const,
  },
  {
    id: "escuro",
    tokens: parseTokens(blockOf(TOKENS_CSS, ':root[data-theme="dark"] {')),
    surfaces: DARK_SURFACES,
    direcao: "mais clara" as const,
  },
] as const;

/** Tokens do tema claro — usados pelos testes que citam números medidos nele. */
const TOKENS = THEMES[0].tokens;

/** Estados de corrida (`tie`, `none`): não são partido e não viram texto. */
const STATE_TOKENS = new Set(["tie", "none"]);

/** Slugs de partido presentes no CSS, deduzidos dos tokens `-text`. */
const PARTY_SLUGS = [...TOKENS.keys()]
  .filter((n) => n.endsWith("-text"))
  .map((n) => n.slice(0, -"-text".length))
  .filter((s) => !STATE_TOKENS.has(s))
  .sort();

// ---------------------------------------------------------------------------
// O gate — vale nos dois temas
// ---------------------------------------------------------------------------

for (const theme of THEMES) {
  const T = theme.tokens;
  const slugs = [...T.keys()]
    .filter((n) => n.endsWith("-text"))
    .map((n) => n.slice(0, -"-text".length))
    .filter((s) => !STATE_TOKENS.has(s))
    .sort();

  describe(`[tema ${theme.id}] constituição § 4 — a cor de partido usada como texto`, () => {
    it("todo partido tem o token -text (sem ele, textForParty aponta para o vazio)", () => {
      expect(slugs.length).toBe(32);
      for (const slug of slugs) {
        expect(T.get(`${slug}-text`), `--party-${slug}-text ausente`).toMatch(/^#[0-9a-f]{6}$/);
      }
    });

    it.each(slugs)("--party-%s-text lê em toda superfície de papel", (slug) => {
      const text = T.get(`${slug}-text`) as string;
      const base = T.get(slug) as string;

      for (const surface of theme.surfaces) {
        const ratio = contrastRatio(text, surface.hex);
        expect(
          ratio,
          [
            `Tema ${theme.id}. --party-${slug}-text (${text}) sobre ${surface.token} ` +
              `(${surface.hex}) dá ${ratio.toFixed(2)}:1.`,
            "",
            "A constituição § 4 (WCAG 2.1 AA, SC 1.4.3) exige 4.5:1 para texto — sem exceção por",
            "tamanho de fonte. Medidas do partido, para referência:",
            ...theme.surfaces.map(
              (s) =>
                `  base  ${base} sobre ${s.hex}: ${contrastRatio(base, s.hex).toFixed(2)}:1` +
                `   ·   text ${text}: ${contrastRatio(text, s.hex).toFixed(2)}:1`,
            ),
            "",
            "Rode `pnpm gen:party-scale` — ele move a tinta em L* (matiz preservada) até as duas",
            "superfícies passarem, e falha em vez de emitir um texto ilegível. Se o CSS foi",
            "editado à mão, esta é a divergência.",
          ].join("\n"),
        ).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
      }
    });

    it("as superfícies deste teste são as que app/globals.css declara", () => {
      // Se `--surface-page` deixar de ser o hex medido aqui, o teste passa a
      // medir contra um papel que não existe mais — e o gate vira decoração.
      const [page, card] = theme.surfaces;
      const escopo =
        theme.id === "claro"
          ? GLOBALS_CSS
          : (GLOBALS_CSS.split(':root[data-theme="dark"] {')[1] ?? "");
      expect(escopo).toMatch(new RegExp(`--paper-1:\\s*${page.hex}\\s*;`));
      expect(escopo).toMatch(new RegExp(`--paper-0:\\s*${card.hex}\\s*;`));
      // Os semânticos derivam dos primitivos e são declarados uma vez só, no
      // `:root` claro — é justamente por isso que trocar os primitivos no
      // escuro move os dois de graça.
      expect(GLOBALS_CSS).toMatch(/--surface-page:\s*var\(--paper-1\)\s*;/);
      expect(GLOBALS_CSS).toMatch(/--surface-card:\s*var\(--paper-0\)\s*;/);
    });

    it("o -text só diverge da base onde a base reprovava (ou colidia)", () => {
      // Onde a base já lê, a identidade do partido chega intacta ao componente
      // — mover sem necessidade afastaria a cor da identidade de graça. No
      // escuro há uma segunda razão legítima para divergir: separação de ΔE76
      // 12 do partido vizinho (ADR-0031), gateada em party-separation.test.ts.
      for (const slug of slugs) {
        const base = T.get(slug) as string;
        const text = T.get(`${slug}-text`) as string;
        const baseLe = theme.surfaces.every((s) => contrastRatio(base, s.hex) >= CONTRAST_FLOOR);
        if (!baseLe) {
          expect(text, `--party-${slug}-text deveria divergir da base ilegível ${base}`).not.toBe(
            base,
          );
        } else if (theme.id === "claro") {
          expect(
            text,
            `--party-${slug}-text (${text}) divergiu da base (${base}), que já dava ` +
              `${contrastRatio(base, theme.surfaces[0].hex).toFixed(2)}:1`,
          ).toBe(base);
        }
      }
    });

    it(`onde diverge, o -text é ${theme.direcao} que a base (intensidade, não outra cor)`, () => {
      // O § 2 v1.3 permite variar intensidade e proíbe variar matiz. A guarda de
      // matiz é o teste de arco em `tests/unit/utils/party-color.test.ts`; aqui
      // checamos a direção — oposta nos dois temas, porque o papel é.
      for (const slug of slugs) {
        const base = T.get(slug) as string;
        const text = T.get(`${slug}-text`) as string;
        if (text === base) continue;
        const maisClara = relativeLuminance(text) > relativeLuminance(base);
        expect(
          maisClara,
          `tema ${theme.id}: --party-${slug}-text (${text}) devia ser ${theme.direcao} que a ` +
            `base (${base})`,
        ).toBe(theme.direcao === "mais clara");
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Por que o token existe — e por que não dá para reusar base nem chip
// (números medidos no tema CLARO)
// ---------------------------------------------------------------------------

describe("por que a base não serve de texto", () => {
  it("14 das 31 bases reprovam 4,5:1 sobre --surface-page", () => {
    // É este número que torna `color: var(--party-<slug>)` num número grande
    // indefensável — quase metade da paleta ficaria abaixo do piso do § 4.
    const page = SURFACES[0].hex;
    const reprovam = PARTY_SLUGS.filter(
      (slug) => contrastRatio(TOKENS.get(slug) as string, page) < CONTRAST_FLOOR,
    );
    expect(reprovam.length).toBe(14);
    // Os quatro piores casos, nomeados: são os que o § 4 quebra de forma mais
    // gritante e os que a documentação de tokens já citava.
    for (const slug of ["psol", "psb", "outros", "novo"]) {
      expect(reprovam, `--party-${slug} deveria estar entre as bases que reprovam`).toContain(slug);
    }
  });

  it("o -text só diverge da base onde a base reprovava", () => {
    // Onde a base já lê, a identidade do partido chega intacta ao componente —
    // escurecer sem necessidade afastaria a cor da identidade de graça.
    const page = SURFACES[0].hex;
    for (const slug of PARTY_SLUGS) {
      const base = TOKENS.get(slug) as string;
      const text = TOKENS.get(`${slug}-text`) as string;
      const baseLe = SURFACES.every((s) => contrastRatio(base, s.hex) >= CONTRAST_FLOOR);
      if (baseLe) {
        expect(
          text,
          `--party-${slug}-text (${text}) divergiu da base (${base}), que já dava ` +
            `${contrastRatio(base, page).toFixed(2)}:1`,
        ).toBe(base);
      } else {
        expect(text, `--party-${slug}-text deveria divergir da base ilegível ${base}`).not.toBe(
          base,
        );
      }
    }
  });

  it("onde diverge, o -text é mais ESCURO que a base (intensidade, não outra cor)", () => {
    // O § 2 v1.3 permite variar intensidade e proíbe variar matiz. A guarda de
    // matiz é o teste de arco em `tests/unit/utils/party-color.test.ts`; aqui
    // checamos a direção: escurecer, nunca clarear nem trocar de tom.
    for (const slug of PARTY_SLUGS) {
      const base = TOKENS.get(slug) as string;
      const text = TOKENS.get(`${slug}-text`) as string;
      if (text === base) continue;
      expect(
        relativeLuminance(text),
        `--party-${slug}-text (${text}) não é mais escuro que a base (${base})`,
      ).toBeLessThan(relativeLuminance(base));
    }
  });
});

describe("por que o chip não serve de texto", () => {
  it("o chip é claro demais em boa parte da paleta — são problemas opostos", () => {
    // O chip contrasta com uma TINTA; o -text contrasta com o PAPEL. Reusar um
    // pelo outro reprova exatamente onde mais dói (PSOL: o chip é #d6a400).
    const page = SURFACES[0].hex;
    const chipReprova = PARTY_SLUGS.filter(
      (slug) => contrastRatio(TOKENS.get(`${slug}-chip`) as string, page) < CONTRAST_FLOOR,
    );
    expect(chipReprova.length).toBeGreaterThan(0);
    expect(chipReprova).toContain("psol");
    // ...e o -text correspondente passa, que é a razão de os dois coexistirem.
    for (const slug of chipReprova) {
      expect(contrastRatio(TOKENS.get(`${slug}-text`) as string, page)).toBeGreaterThanOrEqual(
        CONTRAST_FLOOR,
      );
    }
  });
});
