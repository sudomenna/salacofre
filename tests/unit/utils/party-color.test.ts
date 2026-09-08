// @vitest-environment happy-dom
/**
 * tests/unit/utils/party-color.test.ts
 *
 * Cobertura do helper `lib/utils/party-color.ts` (ADR-0024, Bloco 1).
 * Escrito no padrão de `tests/unit/utils/cand-color.test.ts`.
 *
 * Garante:
 *   - mapping determinístico sigla → token (constituição § 6)
 *   - fallback `--party-outros` para sigla desconhecida/vazia/federação
 *   - `resolvePartyHex` lê CSS custom properties em runtime
 *   - SSR-safety e token ausente → fallback (nunca string vazia p/ o MapLibre)
 *   - **sincronia** entre `KNOWN_PARTY_SLUGS` e `app/tokens-party.css`
 *   - **a invariante constitucional § 2**: matiz constante no chip e nos 5
 *     níveis de um mesmo partido — só a intensidade varia
 *   - `partyChipInk` devolve o **par** `-chip`/`-ink` (o contraste do § 4 é
 *     propriedade do par; o gate numérico está em
 *     `tests/unit/design-system/party-chip-contrast.test.ts`)
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  colorForParty,
  intensityForParty,
  intensityLevelForBand,
  intensityLevelForMargin,
  isFederationSigla,
  KNOWN_PARTY_SLUGS,
  normalizePartySlug,
  PARTY_FALLBACK_HEX,
  PARTY_FALLBACK_SLUG,
  PARTY_INTENSITY_THRESHOLDS_PP,
  type PartyIntensity,
  partyChipInk,
  resolvePartyHex,
} from "@/lib/utils/party-color";

// ---------------------------------------------------------------------------
// Leitura do CSS gerado — usada pelos testes de sincronia e de matiz
// ---------------------------------------------------------------------------

const TOKENS_CSS_PATH = path.resolve(import.meta.dirname, "../../../app/tokens-party.css");
const tokensCss = readFileSync(TOKENS_CSS_PATH, "utf8");

/** Todos os `--party-<nome>: #hex;` do arquivo gerado. */
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

const TOKENS = parseTokens(tokensCss);

describe("normalizePartySlug", () => {
  it("normaliza caixa e espaço", () => {
    expect(normalizePartySlug("PT")).toBe("pt");
    expect(normalizePartySlug("  MDB  ")).toBe("mdb");
    expect(normalizePartySlug("uNiAo")).toBe("uniao");
  });

  it("remove acento — a sigla do TSE pode vir acentuada", () => {
    expect(normalizePartySlug("Missão")).toBe("missao");
    expect(normalizePartySlug("UNIÃO")).toBe("uniao");
  });

  it("sigla desconhecida cai no fallback", () => {
    expect(normalizePartySlug("XYZ")).toBe(PARTY_FALLBACK_SLUG);
    // Siglas que o TSE aposentou: DEMOCRATA substituiu PMB (02/12/2025) e
    // MOBILIZA substituiu PMN. As velhas não têm token — cinza, nunca erro.
    expect(normalizePartySlug("PMB")).toBe(PARTY_FALLBACK_SLUG);
    expect(normalizePartySlug("PMN")).toBe(PARTY_FALLBACK_SLUG);
  });

  it("cobre os 30 partidos registrados para 2026", () => {
    // O `- 1` desconta `outros`, que é fallback, não partido.
    expect(KNOWN_PARTY_SLUGS.size - 1).toBe(30);
    for (const sigla of ["PDT", "PSDB", "PC do B", "PV", "Solidariedade", "Mobiliza"]) {
      expect(normalizePartySlug(sigla)).not.toBe(PARTY_FALLBACK_SLUG);
    }
    // A pontuação e o espaço da forma como o TSE publica não atrapalham.
    expect(normalizePartySlug("PC do B")).toBe("pcdob");
    expect(normalizePartySlug("DEMOCRATA")).toBe("democrata");
  });

  it("sigla vazia, nula ou indefinida cai no fallback", () => {
    expect(normalizePartySlug("")).toBe(PARTY_FALLBACK_SLUG);
    expect(normalizePartySlug("   ")).toBe(PARTY_FALLBACK_SLUG);
    expect(normalizePartySlug(null)).toBe(PARTY_FALLBACK_SLUG);
    expect(normalizePartySlug(undefined)).toBe(PARTY_FALLBACK_SLUG);
  });

  it("é determinístico — mesma entrada, mesmo slug (constituição § 6)", () => {
    for (const sigla of ["PT", "pl", "Missão", "XYZ", ""]) {
      expect(normalizePartySlug(sigla)).toBe(normalizePartySlug(sigla));
    }
  });
});

describe("isFederationSigla", () => {
  // ADR-0024: federação usa a cor do partido-líder; a composição das
  // federações 2026 ainda não está no repo, então cai em --party-outros.
  it("detecta federação por separador entre siglas", () => {
    expect(isFederationSigla("PT/PCdoB/PV")).toBe(true);
    expect(isFederationSigla("PSOL + REDE")).toBe(true);
  });

  it("detecta federação pela palavra", () => {
    expect(isFederationSigla("Federação Brasil da Esperança")).toBe(true);
    expect(isFederationSigla("FED. PSDB CIDADANIA")).toBe(true);
  });

  it("não confunde partido isolado com federação", () => {
    for (const sigla of ["PT", "PL", "MDB", "PSOL", "REDE", "União Brasil"]) {
      expect(isFederationSigla(sigla)).toBe(false);
    }
  });

  it("federação resolve para o fallback, nunca para um partido inventado", () => {
    expect(colorForParty("PT/PV")).toBe("var(--party-outros)");
    expect(colorForParty("Federação Brasil da Esperança")).toBe("var(--party-outros)");
  });
});

describe("colorForParty", () => {
  it("retorna o token do partido", () => {
    expect(colorForParty("PT")).toBe("var(--party-pt)");
    expect(colorForParty("PL")).toBe("var(--party-pl)");
    expect(colorForParty("MDB")).toBe("var(--party-mdb)");
  });

  it("retorna var(--party-outros) para sigla desconhecida ou ausente", () => {
    expect(colorForParty("XYZ")).toBe("var(--party-outros)");
    expect(colorForParty(undefined)).toBe("var(--party-outros)");
    expect(colorForParty("")).toBe("var(--party-outros)");
  });

  it("não depende de rank nem de ordem de apuração (ADR-0024)", () => {
    // A mesma sigla dá a mesma cor não importa quantas vezes seja consultada
    // nem em que contexto — é a invariante "estável a noite inteira" do § 2.
    expect(colorForParty("PT")).toBe(colorForParty("pt"));
    expect(colorForParty("MDB")).toBe(colorForParty(" mdb "));
  });
});

describe("intensityForParty", () => {
  it("mapeia sigla + nível para o token de intensidade", () => {
    expect(intensityForParty("MDB", 4)).toBe("var(--party-mdb-4)");
    expect(intensityForParty("PT", 1)).toBe("var(--party-pt-1)");
    expect(intensityForParty("PL", 5)).toBe("var(--party-pl-5)");
  });

  it("sigla desconhecida usa a rampa do fallback", () => {
    expect(intensityForParty("XYZ", 2)).toBe("var(--party-outros-2)");
  });

  it("nível inválido cai em 1 — na dúvida, 'apertado', nunca 'decidido'", () => {
    expect(intensityForParty("PT", 0 as PartyIntensity)).toBe("var(--party-pt-1)");
    expect(intensityForParty("PT", 9 as PartyIntensity)).toBe("var(--party-pt-1)");
    expect(intensityForParty("PT", Number.NaN as PartyIntensity)).toBe("var(--party-pt-1)");
  });
});

describe("intensityLevelForMargin", () => {
  const [t1, t2, t3, t4] = PARTY_INTENSITY_THRESHOLDS_PP;

  it("mapeia as cinco faixas de margem", () => {
    expect(intensityLevelForMargin(0)).toBe(1);
    expect(intensityLevelForMargin(1.9)).toBe(1);
    expect(intensityLevelForMargin(3)).toBe(2);
    expect(intensityLevelForMargin(7)).toBe(3);
    expect(intensityLevelForMargin(12)).toBe(4);
    expect(intensityLevelForMargin(30)).toBe(5);
  });

  it("os limiares são inclusivos à esquerda", () => {
    expect(intensityLevelForMargin(t1)).toBe(2);
    expect(intensityLevelForMargin(t2)).toBe(3);
    expect(intensityLevelForMargin(t3)).toBe(4);
    expect(intensityLevelForMargin(t4)).toBe(5);
  });

  it("ignora o sinal — margem é magnitude, a identidade vem da sigla", () => {
    for (const m of [0.5, 3, 7, 12, 30]) {
      expect(intensityLevelForMargin(-m)).toBe(intensityLevelForMargin(m));
    }
  });

  it("margem não-finita cai em 1 (leitura conservadora)", () => {
    expect(intensityLevelForMargin(Number.NaN)).toBe(1);
    expect(intensityLevelForMargin(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("é monotônica não-decrescente na margem", () => {
    let prev = 0;
    for (let m = 0; m <= 40; m += 0.25) {
      const level = intensityLevelForMargin(m);
      expect(level).toBeGreaterThanOrEqual(prev);
      prev = level;
    }
  });
});

describe("intensityLevelForBand", () => {
  // As 4 bandas do modelo (NeedleBand) são os níveis 1–4. O nível 5
  // ("decisivo") NÃO é uma banda da agulha: é o estado `chamada`/`decidido_1t`
  // da UF, que vive em outro campo do payload.
  it("mapeia as quatro magnitudes de NeedleBand para 1..4", () => {
    expect(intensityLevelForBand("tossup")).toBe(1);
    expect(intensityLevelForBand("lean_a")).toBe(2);
    expect(intensityLevelForBand("lean_b")).toBe(2);
    expect(intensityLevelForBand("likely_a")).toBe(3);
    expect(intensityLevelForBand("likely_b")).toBe(3);
    expect(intensityLevelForBand("very_likely_a")).toBe(4);
    expect(intensityLevelForBand("very_likely_b")).toBe(4);
  });

  it("descarta o sufixo _a/_b — quem lidera vem da sigla, não da banda", () => {
    expect(intensityLevelForBand("lean_a")).toBe(intensityLevelForBand("lean_b"));
    expect(intensityLevelForBand("very_likely_a")).toBe(intensityLevelForBand("very_likely_b"));
  });

  it("nunca retorna 5 — 'decisivo' não é banda da agulha", () => {
    const bands = [
      "tossup",
      "lean_a",
      "lean_b",
      "likely_a",
      "likely_b",
      "very_likely_a",
      "very_likely_b",
    ] as const;
    for (const b of bands) {
      expect(intensityLevelForBand(b)).toBeLessThan(5);
    }
  });
});

// ---------------------------------------------------------------------------
// Sincronia com o CSS gerado
// ---------------------------------------------------------------------------

describe("sincronia com app/tokens-party.css", () => {
  // KNOWN_PARTY_SLUGS é a projeção da tabela PARTY_BASE do gerador para o
  // runtime. Se as duas saírem de sincronia, componentes emitem `var()` para
  // um token que não existe — e a cor some sem erro. Este bloco é a guarda.
  it("todo slug conhecido tem token base no CSS gerado", () => {
    for (const slug of KNOWN_PARTY_SLUGS) {
      expect(TOKENS.has(slug), `--party-${slug} ausente em app/tokens-party.css`).toBe(true);
    }
  });

  it("todo slug conhecido tem os 5 níveis de intensidade", () => {
    for (const slug of KNOWN_PARTY_SLUGS) {
      for (const level of [1, 2, 3, 4, 5]) {
        expect(TOKENS.has(`${slug}-${level}`), `--party-${slug}-${level} ausente`).toBe(true);
      }
    }
  });

  it("todo slug conhecido tem o par chip/tinta do <PartyTag filled>", () => {
    // Um sem o outro não garante nada: o contraste do § 4 é propriedade do par.
    // O gate numérico está em tests/unit/design-system/party-chip-contrast.test.ts.
    for (const slug of KNOWN_PARTY_SLUGS) {
      expect(TOKENS.has(`${slug}-chip`), `--party-${slug}-chip ausente`).toBe(true);
      expect(TOKENS.has(`${slug}-ink`), `--party-${slug}-ink ausente`).toBe(true);
    }
  });

  it("partyChipInk devolve o par de tokens que existe no CSS", () => {
    for (const [sigla, slug] of [
      ["PT", "pt"],
      ["MDB", "mdb"],
      ["Missão", "missao"],
      ["XYZ", PARTY_FALLBACK_SLUG],
      [undefined, PARTY_FALLBACK_SLUG],
      ["PT/PV", PARTY_FALLBACK_SLUG],
    ] as const) {
      const par = partyChipInk(sigla);
      expect(par).toEqual({
        background: `var(--party-${slug}-chip)`,
        ink: `var(--party-${slug}-ink)`,
      });
      expect(TOKENS.has(`${slug}-chip`)).toBe(true);
      expect(TOKENS.has(`${slug}-ink`)).toBe(true);
    }
  });

  it("partyChipInk não é colorForParty — para MDB e Rede o chip diverge da base", () => {
    // Os dois verdes de meio-tom em que nenhuma tinta serve sobre a base. Usar
    // `colorForParty` no fundo de um chip sólido reintroduz a falha de contraste
    // exatamente nesses dois, e em silêncio.
    for (const slug of ["mdb", "rede"]) {
      expect(TOKENS.get(`${slug}-chip`)).not.toBe(TOKENS.get(slug));
    }
    expect(partyChipInk("MDB").background).not.toBe(colorForParty("MDB"));
  });

  it("todo token de partido no CSS está em KNOWN_PARTY_SLUGS", () => {
    // Estados de corrida não são partidos e não têm rampa.
    const estados = new Set(["tie", "none"]);
    for (const name of TOKENS.keys()) {
      const slug = name.replace(/-(?:[1-5]|chip|ink)$/, "");
      if (estados.has(slug)) continue;
      expect(
        KNOWN_PARTY_SLUGS.has(slug),
        `--party-${slug} no CSS mas fora de KNOWN_PARTY_SLUGS`,
      ).toBe(true);
    }
  });

  it("PARTY_FALLBACK_HEX bate com o token --party-outros do CSS", () => {
    expect(TOKENS.get(PARTY_FALLBACK_SLUG)).toBe(PARTY_FALLBACK_HEX);
  });

  it("nenhum token usa color-mix() ou oklch() — o MapLibre não resolve nenhum dos dois", () => {
    expect(tokensCss).not.toMatch(/--party-[a-z0-9-]+\s*:\s*(color-mix|oklch)/);
  });

  it("o bloco é @theme static — sem `static` o Tailwind v4 poda os tokens", () => {
    expect(tokensCss).toMatch(/@theme\s+static\s*\{/);
  });
});

// ---------------------------------------------------------------------------
// Invariante constitucional § 2 — matiz estável, só a intensidade varia
// ---------------------------------------------------------------------------

describe("constituição § 2 — matiz constante no chip e nos 5 níveis", () => {
  /** sRGB → CIE Lab (D65). Reimplementado aqui de propósito: o teste não deve
   * reusar a mesma função do gerador, senão validaria o código contra si
   * mesmo. */
  function hexToLab(hex: string): [number, number, number] {
    const lin = (v: number) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const r = lin(Number.parseInt(hex.slice(1, 3), 16));
    const g = lin(Number.parseInt(hex.slice(3, 5), 16));
    const b = lin(Number.parseInt(hex.slice(5, 7), 16));
    const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
    const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
    const Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
    const f = (t: number) => (t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  }

  function hue(hex: string): number {
    const [, a, b] = hexToLab(hex);
    return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  }

  function chroma(hex: string): number {
    const [, a, b] = hexToLab(hex);
    return Math.hypot(a, b);
  }

  /** Menor distância angular entre duas matizes, em graus. */
  function hueDelta(h1: number, h2: number): number {
    const d = Math.abs(h1 - h2) % 360;
    return d > 180 ? 360 - d : d;
  }

  // Não há mais exceção: PT e PL usavam as rampas literais do kit, que —
  // medido — derivam 16,2° e 16,5° de matiz do nível 1 ao 4, exatamente o que
  // o § 2 v1.3 proíbe. Desde 2026-09-07 os dois são gerados pela mesma regra
  // dos demais, e a invariante vale para a paleta inteira.
  // Cinza institucional: acromático (C* ≈ 0), onde a matiz é indefinida.
  const ACROMATICOS = new Set(["outros"]);

  const derivados = [...KNOWN_PARTY_SLUGS].filter((s) => !ACROMATICOS.has(s));

  it("cobre os partidos de rampa derivada", () => {
    expect(derivados.length).toBe(30);
  });

  /**
   * Medimos o desvio de matiz como **arco ponderado pelo croma** (C* · Δh em
   * radianos), não como ângulo puro.
   *
   * O ângulo isolado é a métrica errada perto do neutro: em `--party-democrata`
   * (C* ≈ 8, um cinza-ardósia) o arredondamento para 8 bits por canal move a
   * matiz 2,7° — que soa muito, mas equivale a 0,36 unidade Lab, abaixo do
   * limiar de percepção (~1,0). Já os mesmos 2,7° num vermelho de C* 67 seriam
   * 3,2 unidades, claramente visíveis. O arco é o que o § 2 realmente proíbe:
   * mudança **perceptível** de matiz entre os níveis.
   *
   * Referência de escala: a rampa literal do PT (que este repositório deixou
   * de emitir justamente por isso) deriva 16,2° do nível 1 ao 4, o que dá 18,9
   * unidades — ~50× o limiar. Uma quebra real de matiz não passa despercebida
   * por este teste.
   */
  const JND_LAB = 1.0;

  // O `chip` entra na mesma medida que os 5 níveis. Para MDB e Rede ele é a
  // base **escurecida** — a única saída para um verde de meio-tom em que nem a
  // tinta clara nem a escura chegam a 4,5:1 (§ 4). Escurecer é variar
  // intensidade, o que o § 2 v1.3 permite; o que ele proíbe é variar matiz, e é
  // isso que este teste cobra também do chip.
  const SUFIXOS = ["chip", "1", "2", "3", "4", "5"] as const;

  it.each(derivados)("--party-%s mantém a matiz no chip e nos 5 níveis", (slug) => {
    const base = TOKENS.get(slug);
    expect(base, `--party-${slug} ausente`).toBeDefined();
    const hBase = hue(base as string);

    for (const sufixo of SUFIXOS) {
      const hex = TOKENS.get(`${slug}-${sufixo}`) as string;
      expect(hex, `--party-${slug}-${sufixo} ausente`).toBeDefined();
      const deltaDeg = hueDelta(hue(hex), hBase);
      const arco = chroma(hex) * (deltaDeg * (Math.PI / 180));
      expect(
        arco,
        `--party-${slug}-${sufixo} (${hex}) desviou ${deltaDeg.toFixed(1)}° da matiz base ` +
          `${hBase.toFixed(1)}° = ${arco.toFixed(2)} unidades Lab`,
      ).toBeLessThan(JND_LAB);
    }
  });

  it("--party-outros é acromático nos níveis derivados (cinza fica cinza)", () => {
    for (const level of [1, 2, 3, 5]) {
      const hex = TOKENS.get(`outros-${level}`) as string;
      expect(chroma(hex), `--party-outros-${level} (${hex}) não é neutro`).toBeLessThan(1);
    }
  });

  it("todo token é hex literal de 6 dígitos (contrato do MapLibre)", () => {
    for (const [name, hex] of TOKENS) {
      expect(hex, `--party-${name}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

// ---------------------------------------------------------------------------
// Resolução para o MapLibre
// ---------------------------------------------------------------------------

describe("resolvePartyHex (DOM)", () => {
  // happy-dom não injeta o CSS do app; injetamos um <style> com um recorte
  // real dos tokens gerados, mesmo padrão de cand-color.test.ts.
  beforeEach(() => {
    const style = document.createElement("style");
    style.id = "test-party-tokens";
    style.textContent = `
      :root {
        --party-pt: ${TOKENS.get("pt")};
        --party-pt-1: ${TOKENS.get("pt-1")};
        --party-pt-5: ${TOKENS.get("pt-5")};
        --party-mdb: ${TOKENS.get("mdb")};
        --party-mdb-3: ${TOKENS.get("mdb-3")};
        --party-outros: ${TOKENS.get("outros")};
      }
    `;
    document.head.appendChild(style);
  });

  afterEach(() => {
    document.getElementById("test-party-tokens")?.remove();
  });

  it("resolve o token base do partido", () => {
    expect(resolvePartyHex("PT")).toBe(TOKENS.get("pt"));
    expect(resolvePartyHex("MDB")).toBe(TOKENS.get("mdb"));
  });

  it("resolve o token de intensidade quando o nível é dado", () => {
    expect(resolvePartyHex("PT", 1)).toBe(TOKENS.get("pt-1"));
    expect(resolvePartyHex("PT", 5)).toBe(TOKENS.get("pt-5"));
    expect(resolvePartyHex("MDB", 3)).toBe(TOKENS.get("mdb-3"));
  });

  it("sigla desconhecida resolve para o hex de --party-outros", () => {
    expect(resolvePartyHex("XYZ")).toBe(TOKENS.get("outros"));
    expect(resolvePartyHex(undefined)).toBe(TOKENS.get("outros"));
  });

  it("token ausente cai no fallback, nunca em string vazia", () => {
    // Sem esta guarda o MapLibre receberia "" e pintaria a camada de preto.
    // --party-mdb-1 não está no <style> injetado acima.
    expect(resolvePartyHex("MDB", 1)).toBe(PARTY_FALLBACK_HEX);
  });
});

describe("resolvePartyHex (SSR)", () => {
  it("retorna o fallback sem window/document", () => {
    // Mesmo contrato de resolveCandHex: componentes de mapa são
    // dynamic({ ssr: false }) (ADR-0010), então este caminho só aparece em
    // renderToStaticMarkup de teste/snapshot — mas não pode crashar.
    const w = globalThis.window;
    const d = globalThis.document;
    try {
      // @ts-expect-error — simulação de ambiente de servidor
      globalThis.window = undefined;
      // @ts-expect-error — simulação de ambiente de servidor
      globalThis.document = undefined;
      expect(resolvePartyHex("PT")).toBe(PARTY_FALLBACK_HEX);
      expect(resolvePartyHex("PT", 4)).toBe(PARTY_FALLBACK_HEX);
    } finally {
      globalThis.window = w;
      globalThis.document = d;
    }
  });
});
