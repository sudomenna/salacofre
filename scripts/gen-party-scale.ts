/**
 * scripts/gen-party-scale.ts
 *
 * Gera `app/tokens-party.css` — a paleta editorial por partido/federação
 * exigida pela constituição § 2 (v1.3) e fixada pelo ADR-0024.
 *
 * Uso:
 *   pnpm gen:party-scale              # regrava app/tokens-party.css
 *   pnpm gen:party-scale --report     # + tabela L*, C*, h, ΔE76 de auditoria
 *   pnpm gen:party-scale --check      # não escreve; falha se o arquivo estiver
 *                                     # fora de sincronia com a tabela-fonte
 *
 * Sai com código ≠ 0 (em qualquer modo) se algum token — base, chip ou nível —
 * ficar a menos de `DELTA_E_FLOOR` de um hex oficial de partido, se algum par
 * `-chip`/`-ink` ficar abaixo de `CHIP_CONTRAST_FLOOR`, ou se a rampa de algum
 * partido deixar de ser estritamente decrescente em L*.
 *
 * ---------------------------------------------------------------------------
 * Por que um gerador, e não CSS escrito à mão
 * ---------------------------------------------------------------------------
 * Cada partido precisa de 5 intensidades (`--party-<sigla>-1..5`) que variam
 * **só em intensidade, nunca em matiz** — é literalmente o texto do § 2 v1.3:
 *
 *   "apenas a **intensidade** (claro↔saturado) pode variar com a margem
 *    projetada, nunca a matiz"
 *
 * Escrever 30 × 5 = 150 hexes à mão não é auditável: ninguém consegue verificar
 * a olho que `--party-mdb-3` tem a mesma matiz de `--party-mdb`. Derivando os 5
 * níveis de um único hex base em CIE LCh — matiz (h) **fixa**, L* e C* variando
 * por nível — a invariante constitucional passa a valer por construção, e este
 * script vira o artefato que um revisor recomputa para conferir.
 *
 * ---------------------------------------------------------------------------
 * A guarda de ΔE76 mora aqui, não só na documentação
 * ---------------------------------------------------------------------------
 * A lição que motivou esta versão: **uma rampa derivada cria violação que a cor
 * base não tinha.** `--party-pp` (#2C6FB0) está a ΔE 20,5 do azul do PP; o
 * nível 5 derivado dele caía a ΔE 8,3 do #234F74 que o PP usa no site — abaixo
 * do mínimo constitucional, sem que nada no processo reclamasse. Por isso o
 * gerador carrega os hexes oficiais (`scripts/data/party-official-hexes.json`),
 * valida **base + 5 níveis contra todos os hexes de cada partido**, empurra o
 * que violar para fora do raio proibido preservando a matiz, e **falha** se
 * ainda assim sobrar violação. O mesmo cálculo é refeito sobre o CSS commitado
 * por `tests/unit/design-system/party-delta-e.test.ts`, para que nem edição
 * manual nem mudança na tabela de oficiais reintroduza o problema.
 *
 * ---------------------------------------------------------------------------
 * Hex pré-computado, nunca color-mix()/oklch()
 * ---------------------------------------------------------------------------
 * O MapLibre lê token de cor por `getComputedStyle` e passa a string para
 * `setPaintProperty`, que só aceita cor CSS literal. `color-mix()` e `oklch()`
 * chegam de volta do `getComputedStyle` como a função não resolvida (ou como
 * `oklch(...)`, que o parser de cores do MapLibre rejeita) — o mapa ficaria
 * cinza em silêncio. Por isso todo token emitido aqui é **#RRGGBB literal**.
 * Mesma regra de ouro documentada no topo de `app/globals.css`.
 *
 * ---------------------------------------------------------------------------
 * Determinismo (constituição § 6)
 * ---------------------------------------------------------------------------
 * Mesma tabela-fonte → byte a byte o mesmo arquivo. Sem `Math.random()`, sem
 * data/hora no conteúdo gerado, busca binária com número **fixo** de iterações,
 * varredura do solver de ΔE em grade fixa com desempate explícito.
 * `--check` existe para o CI provar isso.
 *
 * Cross-refs:
 *   - ADR-0024 `docs/architecture/adrs/0024-paleta-editorial-por-partido.md`
 *   - Constituição § 2 (v1.3) `docs/constitution.md`
 *   - Kit: `docs/design-system/atlas-menna/tokens/colors.css`
 *   - Hexes oficiais: `scripts/data/party-official-hexes.json`
 *   - Consumidor: `lib/utils/party-color.ts`
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// ===========================================================================
// 1. TABELA-FONTE — sigla → hex base
// ===========================================================================
// **Este é o único lugar onde um hex editorial de partido é declarado.** Para
// adicionar um partido: acrescente uma linha aqui, uma entrada em
// `scripts/data/party-official-hexes.json` e a sigla em `KNOWN_PARTY_SLUGS`
// (`lib/utils/party-color.ts`); os 5 níveis saem sozinhos.
//
// Origem dos hexes: kit Atlas Menna,
// `docs/design-system/atlas-menna/tokens/colors.css:37-76`, com três correções
// e seis inclusões feitas em 2026-09-07 sob a leitura estrita do § 2 (ΔE76
// medido contra **todo** hex oficial documentado, não só a cor primária):
//
//   --party-pt            #C0223B → #C62E49   (era ΔE 6,25 de #B9142C, o fim
//                                              do gradiente no manual do PT)
//   --party-republicanos  #1F5FA8 → #2A548A   (era ΔE 2,92 de #005DAA, o
//                                              --primary-color do site)
//   --party-uniao         #2255A4 → #124287   (era ΔE 10,17 de #254AA5 —
//                                              passava a constituição, não a
//                                              margem operacional de 12)
//   + PDT, PSDB, PCdoB, PV, Solidariedade e MOBILIZA, que não tinham token.
//
// Com isso a paleta cobre os 30 partidos registrados para 2026. Note que
// **PMB não existe mais**: o TSE homologou a renomeação para DEMOCRATA em
// 02/12/2025 (nº 35), e MOBILIZA é o antigo PMN.

interface PartyEntry {
  /** Slug do token: `--party-<slug>`. Minúsculo, sem acento, sem separador. */
  slug: string;
  /**
   * Hex base — a **cor de identidade** do partido, a que vale em chip, tag e
   * legenda. Não é mais o nível 4: desde a correção de 2026-09-07 os cinco
   * níveis são alvos de L* / C* (ver `LIGHT_RAMP`), e o base é a âncora de
   * **matiz** de todos eles.
   */
  base: string;
  /** Nome por extenso, só para o comentário do CSS gerado. */
  nome: string;
  /**
   * Cinza institucional: a rampa sai **acromática** (C* = 0 em todos os
   * níveis), variando só em L*. Sem isto, aplicar C* = 48 ao matiz residual de
   * um cinza (#9AA0A8 tem C* ≈ 3,6) produziria um azul de verdade no nível 3 —
   * e "outros" deixaria de ler como neutro, que é a única coisa que ele
   * precisa comunicar.
   */
  neutral?: boolean;
}

const PARTY_BASE: readonly PartyEntry[] = [
  // Polos presidenciais.
  { slug: "pt", base: "#C62E49", nome: "PT" },
  { slug: "pl", base: "#2247B8", nome: "PL" },
  // Demais partidos com token no kit.
  { slug: "psd", base: "#2F8F6B", nome: "PSD" },
  { slug: "novo", base: "#E07B1D", nome: "NOVO" },
  { slug: "avante", base: "#7A4FB3", nome: "Avante" },
  { slug: "missao", base: "#1E7F8C", nome: "Missão" },
  { slug: "prtb", base: "#6B7A2C", nome: "PRTB" },
  { slug: "up", base: "#8C2F5C", nome: "UP" },
  { slug: "pco", base: "#A1332B", nome: "PCO" },
  { slug: "dc", base: "#3B6FB0", nome: "DC" },
  { slug: "pstu", base: "#9E2B2B", nome: "PSTU" },
  { slug: "pcb", base: "#B63A2E", nome: "PCB" },
  { slug: "democrata", base: "#4B5563", nome: "Democrata (ex-PMB)" },
  { slug: "republicanos", base: "#2A548A", nome: "Republicanos" },
  { slug: "psb", base: "#C9A227", nome: "PSB" },
  { slug: "rede", base: "#3D8F3D", nome: "Rede" },
  { slug: "pp", base: "#2C6FB0", nome: "PP" },
  { slug: "pode", base: "#2E9C8F", nome: "Podemos" },
  { slug: "cidadania", base: "#C46A9C", nome: "Cidadania" },
  { slug: "agir", base: "#7C6E5B", nome: "Agir" },
  { slug: "psol", base: "#D6A400", nome: "PSOL" },
  { slug: "mdb", base: "#2E8B57", nome: "MDB" },
  { slug: "uniao", base: "#124287", nome: "União Brasil" },
  { slug: "prd", base: "#6A5ACD", nome: "PRD" },
  // Incluídos em 2026-09-07 — hexes escolhidos com ΔE76 ≥ 25 contra toda a
  // paleta já existente (distinguíveis entre si) e revalidados contra os
  // hexes oficiais de cada um sob a mesma regra dos demais.
  { slug: "pdt", base: "#784B02", nome: "PDT" },
  { slug: "psdb", base: "#C37B61", nome: "PSDB" },
  { slug: "pcdob", base: "#6B4B7D", nome: "PCdoB" },
  { slug: "pv", base: "#AC2C92", nome: "PV" },
  { slug: "solidariedade", base: "#EB4784", nome: "Solidariedade" },
  { slug: "mobiliza", base: "#3E89F9", nome: "Mobiliza (ex-PMN)" },
  // Fallback universal — sigla desconhecida, ausente, ou federação sem
  // composição resolvida (ADR-0024 § Decisão).
  { slug: "outros", base: "#9AA0A8", nome: "Outros / não mapeado", neutral: true },
];

/**
 * Estados de corrida que não pertencem a partido nenhum. Emitidos como hex
 * literal do kit, sem rampa: "empate" e "sem projeção" não têm intensidade por
 * margem — são justamente a ausência de margem.
 */
const STATE_TOKENS: ReadonlyArray<{ name: string; hex: string; nota: string }> = [
  { name: "tie", hex: "#B8BCC4", nota: "empate técnico" },
  { name: "none", hex: "#E1E4E8", nota: "sem projeção / não apurado" },
];

// ===========================================================================
// 2. A REGRA DA RAMPA
// ===========================================================================
// Matiz (h) do partido **preservada em todos os níveis**; L* e C* fixos por
// nível, iguais para todos os partidos. Nível 1 = disputa apertada (tossup),
// nível 5 = decisivo.
//
// ---------------------------------------------------------------------------
// De onde saem os cinco alvos (e por que o nível 4 deixou de ser o hex base)
// ---------------------------------------------------------------------------
// A versão anterior fixava L* / C* só nos níveis 1–3 e usava o **hex base** como
// nível 4, com o nível 5 relativo a ele. Isso só ordena quando o base é mais
// escuro que L* 58 — verdade para PT e PL, que originaram a regra, e falso
// para quem tem base clara. Medido no CSS que essa regra gerava:
//
//   --party-psol : nível 3 em L* 58,2 e nível 4 em L* 70,1 — o "decisivo"
//                  saía MAIS CLARO que o "provável";
//   --party-pode : níveis 3 e 4 em L* 58,2 e 58,4 — indistinguíveis;
//   --party-agir : croma despencava de C* 47,8 (nível 3) para 12,8 (nível 4),
//                  porque o base é um marrom dessaturado.
//
// A rampa é uma **escala de margem**, não a identidade do partido: quem carrega
// a identidade é `--party-<sigla>`. Então os cinco níveis passam a ser alvos
// absolutos, medidos nas rampas que o designer entregou para PT e PL:
//
//   nível | PT do kit    | PL do kit    | alvo adotado
//   ------|--------------|--------------|--------------
//     1   | 89,9 /  9,7  | 90,0 / 10,6  | L* 90 · C* 10
//     2   | 75,6 / 26,1  | 76,7 / 25,5  | L* 76 · C* 26
//     3   | 58,9 / 47,7  | 57,6 / 47,9  | L* 58 · C* 48
//     4   | 42,3 / 66,7  | 34,6 / 69,8  | L* 42 · C* 66
//     5   | 29,3 / 53,1  | 23,0 / 57,2  | L* 29 · C* 53
//
// Nos níveis 4 e 5 as duas rampas do kit divergem, e o alvo segue **o PT**:
//
//   - a cadência de L* do PT é a regular das duas (−14, −18, −16, −13 contra
//     −13, −19, −23, −12 do PL), e cadência regular é o que faz cada degrau da
//     escala valer o mesmo tanto de "margem" para o leitor;
//   - L* 23 (o nível 5 do PL) é escuro demais para servir de alvo universal:
//     em matizes de gamut estreito (`--party-pode`, h 183,6°) o croma máximo
//     em L* 23 cai para ~17, e os níveis 4 e 5 colapsariam num par de
//     verde-escuros quase iguais;
//   - C* 53 / C* 66 = 0,80, exatamente o fator de croma que a regra relativa
//     anterior já aplicava ao nível 5.
//
// Distância mínima entre níveis adjacentes: 13 unidades de L*, ~13× o limiar
// de percepção — a ordem é visível em todo degrau, em toda matiz.

/** Alvos de L* por nível (1..5). Estritamente decrescente por construção. */
const RAMP_L: readonly [number, number, number, number, number] = [90, 76, 58, 42, 29];

/** Alvos de C* por nível (1..5). Reduzidos ao gamut da matiz de cada partido. */
const RAMP_C: readonly [number, number, number, number, number] = [10, 26, 48, 66, 53];

/**
 * Rampas literais que o designer entregou no kit (tema claro), mantidas
 * **só como referência de auditoria**: `--report` mede o ΔE76 entre cada nível
 * gerado e o valor correspondente aqui, para que o desvio em relação ao
 * desenho original seja um número, não uma impressão.
 *
 * Elas deixaram de ser emitidas em 2026-09-07: medidas, as duas derivam 16,2°
 * (PT) e 16,5° (PL) de matiz entre os níveis 1 e 4 — o § 2 v1.3 proíbe
 * explicitamente ("apenas a intensidade pode variar, nunca a matiz"). Como o
 * hex base do PT mudou de qualquer forma (ΔE 6,25 de #B9142C), manter a rampa
 * literal significaria manter uma exceção constitucional para reproduzir uma
 * cor que já não é a do partido no produto.
 */
const KIT_RAMPS: Readonly<Record<string, readonly [string, string, string, string, string]>> = {
  pt: ["#F6DCE0", "#EBA9B3", "#DC6A7B", "#C0223B", "#8A1128"],
  pl: ["#DCE2F6", "#AEBCEB", "#6F86DA", "#2247B8", "#142E85"],
};

// BLOCO 2 (dark mode): `buildRamp()` recebe os alvos como parâmetro justamente
// para que o tema escuro seja **uma chamada a mais**, não uma refatoração —
// algo na linha de `DARK_L = [22, 34, 46, 60, 74]` (crescente: no escuro o
// "decisivo" é o mais claro) emitido dentro de `[data-theme="dark"] { … }`.
// A guarda de ΔE76 e o solver abaixo valem igual lá.

// ===========================================================================
// 3. COLORIMETRIA — sRGB ↔ CIE XYZ ↔ Lab ↔ LCh (D65, observador 2°)
// ===========================================================================
// Implementada aqui de propósito: nenhuma dependência nova (culori, chroma-js,
// color). São ~60 linhas de fórmula fechada, e é a **mesma** conversão que o
// ΔE76 do § 2 usa — ter as duas coisas no mesmo arquivo é o que torna o
// critério constitucional recomputável por um revisor.

/** Ponto branco D65, observador padrão 2° (o mesmo que o sRGB assume). */
const WHITE_D65 = { X: 0.95047, Y: 1.0, Z: 1.08883 } as const;

/** δ = 6/29 — quebra entre o ramo cúbico e o ramo linear de f() no CIELAB. */
const LAB_DELTA = 6 / 29;

interface Rgb {
  r: number;
  g: number;
  b: number;
}
interface Lab {
  L: number;
  a: number;
  b: number;
}
interface Lch {
  L: number;
  C: number;
  h: number;
}

function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`Hex inválido: "${hex}" (esperado #RRGGBB)`);
  }
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const byte = (v: number) => {
    // `v` já chegou dentro de [0, 255] (o clamp de gamut garante isso antes do
    // round). O min/max aqui é rede de segurança contra o épsilon do round —
    // não é clipping por canal, que distorceria a matiz.
    const n = Math.min(255, Math.max(0, Math.round(v)));
    return n.toString(16).padStart(2, "0");
  };
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/** sRGB 8-bit → canal linear em [0, 1] (transfer function da IEC 61966-2-1). */
function srgbToLinear(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Canal linear em [0, 1] → sRGB em [0, 255] (não arredondado). */
function linearToSrgb(linear: number): number {
  const c = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return c * 255;
}

function rgbToLab(rgb: Rgb): Lab {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);

  // Matriz sRGB (D65) → XYZ.
  const X = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const Z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;

  const f = (t: number) => (t > LAB_DELTA ** 3 ? Math.cbrt(t) : t / (3 * LAB_DELTA ** 2) + 4 / 29);
  const fx = f(X / WHITE_D65.X);
  const fy = f(Y / WHITE_D65.Y);
  const fz = f(Z / WHITE_D65.Z);

  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** Lab → RGB linear (ainda **sem** clamp — pode sair de [0,1] fora do gamut). */
function labToLinearRgb(lab: Lab): { r: number; g: number; b: number } {
  const fy = (lab.L + 16) / 116;
  const fx = fy + lab.a / 500;
  const fz = fy - lab.b / 200;

  const finv = (t: number) => (t > LAB_DELTA ? t ** 3 : 3 * LAB_DELTA ** 2 * (t - 4 / 29));
  const X = WHITE_D65.X * finv(fx);
  const Y = WHITE_D65.Y * finv(fy);
  const Z = WHITE_D65.Z * finv(fz);

  return {
    r: 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
    g: -0.969266 * X + 1.8760108 * Y + 0.041556 * Z,
    b: 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
  };
}

function labToLch(lab: Lab): Lch {
  const C = Math.hypot(lab.a, lab.b);
  // atan2(0, 0) = 0 é determinístico; para C ≈ 0 a matiz é indefinida e
  // irrelevante (nenhum nível acromático usa h).
  const deg = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  return { L: lab.L, C, h: (deg + 360) % 360 };
}

function lchToLab({ L, C, h }: Lch): Lab {
  const rad = (h * Math.PI) / 180;
  return { L, a: C * Math.cos(rad), b: C * Math.sin(rad) };
}

export function hexToLch(hex: string): Lch {
  return labToLch(rgbToLab(hexToRgb(hex)));
}

export function hexToLab(hex: string): Lab {
  return rgbToLab(hexToRgb(hex));
}

/**
 * ΔE76 (CIE 1976) entre dois hexes — a métrica que a constituição § 2 v1.3
 * exige (≥ 10) entre o hex editorial do SalaCofre e o hex oficial do partido.
 * Distância euclidiana em Lab, sem correção de percepção; é justamente a
 * simplicidade que a torna auditável ("qualquer agente pode recomputar").
 */
export function deltaE76(hexA: string, hexB: string): number {
  const a = rgbToLab(hexToRgb(hexA));
  const b = rgbToLab(hexToRgb(hexB));
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
}

// ---------------------------------------------------------------------------
// Contraste WCAG — outra métrica, outro eixo
// ---------------------------------------------------------------------------
// ΔE76 e contraste WCAG **não são a mesma coisa e não se substituem**: ΔE76 mede
// distância perceptual em Lab (é a guarda de neutralidade política do § 2, "não
// pareça a cor do partido"), enquanto o contraste WCAG é uma razão de
// luminância relativa (é a guarda de legibilidade do § 4, "dá para ler o
// rótulo"). Uma cor pode estar a ΔE76 40 de outra e ainda assim ter 1,2:1 de
// contraste — dois azuis de mesma luminância, por exemplo. Por isso as duas
// medidas convivem aqui, cada uma com seu gate.
//
// A fórmula é a da WCAG 2.1 (SC 1.4.3): luminância relativa com a mesma
// linearização sRGB de `srgbToLinear`, e razão (L_claro + 0,05) / (L_escuro + 0,05).

/** Luminância relativa WCAG 2.1 de um hex sRGB, em [0, 1]. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** Razão de contraste WCAG 2.1 entre dois hexes. Simétrica, em [1, 21]. */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// ---------------------------------------------------------------------------
// Clamp de gamut
// ---------------------------------------------------------------------------
// Nem toda matiz alcança C* = 48 em L* = 58 dentro do sRGB — um amarelo não
// existe escuro e saturado, um azul não existe claro e saturado. A resposta
// **não** é clipar canal a canal (isso muda a matiz: cortar o vermelho de um
// laranja estourado o empurra para amarelo, e a invariante do § 2 é exatamente
// "nunca a matiz"). A resposta é **reduzir o croma** mantendo L* e h, até o
// ponto em que a cor volta a caber — o mesmo comportamento do `gamut mapping`
// do CSS Color 4.

/** Tolerância do teste de gamut: absorve o erro de ponto flutuante da matriz. */
const GAMUT_EPS = 1e-7;

function inGamut(L: number, C: number, h: number): boolean {
  const { r, g, b } = labToLinearRgb(lchToLab({ L, C, h }));
  return [r, g, b].every((v) => v >= -GAMUT_EPS && v <= 1 + GAMUT_EPS);
}

/**
 * Iterações da busca binária. **Fixo** (não é "até convergir") para garantir
 * determinismo bit a bit: 40 bisseções sobre [0, 200] dão precisão ~2e-10,
 * muito abaixo do passo de 1/255 do hex final.
 */
const GAMUT_SEARCH_STEPS = 40;

/** Teto de croma da busca. Nenhuma cor sRGB passa de C* ≈ 132. */
const GAMUT_SEARCH_CEILING = 200;

/** Maior C* que cabe no sRGB em (L*, h). Converge **por baixo**: sempre válido. */
function maxChroma(L: number, h: number): number {
  if (!inGamut(L, 0, h)) return 0;
  let lo = 0;
  let hi = GAMUT_SEARCH_CEILING;
  for (let i = 0; i < GAMUT_SEARCH_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(L, mid, h)) lo = mid;
    else hi = mid;
  }
  return lo;
}

function lchToHex(L: number, C: number, h: number): string {
  const lin = labToLinearRgb(lchToLab({ L, C, h }));
  return rgbToHex({
    r: linearToSrgb(Math.min(1, Math.max(0, lin.r))),
    g: linearToSrgb(Math.min(1, Math.max(0, lin.g))),
    b: linearToSrgb(Math.min(1, Math.max(0, lin.b))),
  });
}

// ===========================================================================
// 4. HEXES OFICIAIS E O RAIO PROIBIDO
// ===========================================================================

/**
 * Piso operacional de ΔE76 contra hex oficial. A constituição § 2 v1.3 fixa o
 * **mínimo em 10**; aqui usamos 12 para deixar 2 unidades de folga contra
 * revisão de fonte — se um hex oficial for corrigido, ou uma fonte melhor
 * aparecer, uma cor a ΔE 10,3 vira violação constitucional com um ajuste
 * mínimo do lado do partido. A justificativa completa está no `_meta` de
 * `scripts/data/party-official-hexes.json`.
 */
export const DELTA_E_FLOOR = 12;

/**
 * Folga usada **durante a busca**, não na verificação. O solver trabalha em
 * L* / C* contínuos, mas o token emitido é hex de 8 bits por canal: o
 * arredondamento move a cor até ~0,5 unidade Lab e pode reempurrá-la para
 * dentro do raio proibido. Buscar com raio 12,75 e conferir com 12 no hex
 * final resolve isso sem tolerância escondida na verificação.
 */
const SEARCH_MARGIN = 0.75;

export interface OfficialHex {
  hex: string;
  role: string;
  source_type: string;
  url?: string;
  confidence?: string;
  note?: string;
}

interface OfficialEntry {
  party: string;
  official: OfficialHex[];
  note?: string;
}

const OFFICIAL_PATH = path.resolve(import.meta.dirname, "data", "party-official-hexes.json");

/**
 * Hexes oficiais por token, com fonte preservada. Ler do JSON (e não embutir a
 * tabela aqui) é o que permite ao teste em `tests/unit/design-system/` refazer
 * exatamente a mesma conta sobre o CSS commitado, sem importar o gerador.
 */
export function loadOfficialHexes(): Record<string, OfficialEntry> {
  const raw = JSON.parse(readFileSync(OFFICIAL_PATH, "utf8")) as Record<string, unknown>;
  const out: Record<string, OfficialEntry> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "_meta") continue;
    out[key] = value as OfficialEntry;
  }
  return out;
}

/**
 * Disco proibido de um hex oficial, projetado no plano (L*, C*) da matiz `h`.
 *
 * A geometria fecha em três linhas e é o que torna o empurrão auditável.
 * Escrevendo o oficial em Lab como (L₀, a₀, b₀) e o nosso ponto como
 * (L, C·cos h, C·sin h), com `p = a₀·cos h + b₀·sin h` (projeção do vetor de
 * croma do oficial sobre a nossa matiz) e `q² = a₀² + b₀² − p²` (o que sobra
 * perpendicular a ela):
 *
 *   ΔE76² = (L − L₀)² + (C − p)² + q²
 *
 * Ou seja: **a matiz fixa vira uma constante aditiva q²**. Ficar a ΔE ≥ r de um
 * oficial é exatamente ficar fora do disco de centro (L₀, p) e raio
 * √(r² − q²) no plano (L, C) — e se q ≥ r o oficial está longe o bastante *só*
 * por diferença de matiz, sem restringir nada. Nada aqui mexe em h.
 */
interface Disc {
  L: number;
  p: number;
  r: number;
  official: OfficialHex;
}

function discsForHue(h: number, officials: readonly OfficialHex[], radius: number): Disc[] {
  const rad = (h * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const out: Disc[] = [];
  for (const o of officials) {
    const lab = hexToLab(o.hex);
    const p = lab.a * cos + lab.b * sin;
    const q2 = Math.max(0, lab.a * lab.a + lab.b * lab.b - p * p);
    const r2 = radius * radius - q2;
    if (r2 > 0) out.push({ L: lab.L, p, r: Math.sqrt(r2), official: o });
  }
  return out;
}

/** Intervalos de C* proibidos em (L, h) — corte horizontal dos discos. */
function forbiddenChromaIntervals(L: number, discs: readonly Disc[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const d of discs) {
    const s2 = d.r * d.r - (L - d.L) ** 2;
    if (s2 > 0) {
      const s = Math.sqrt(s2);
      out.push([d.p - s, d.p + s]);
    }
  }
  return out;
}

// ===========================================================================
// 5. O SOLVER — empurrar para fora do raio proibido sem tocar na matiz
// ===========================================================================
// Quando um nível cai dentro de algum disco, procuramos o ponto **mais próximo
// do alvo** que satisfaz, ao mesmo tempo:
//
//   (a) fora de todos os discos proibidos    → ΔE76 ≥ 12,75 contra todo oficial
//   (b) dentro do gamut sRGB                 → 0 ≤ C ≤ maxChroma(L, h)
//   (c) L* abaixo do nível anterior por pelo menos LEVEL_MIN_GAP
//                                            → a rampa continua ordenada
//
// minimizando `custo = (W_L·ΔL)² + ΔC²`. O peso W_L = 2 diz que **desviar em
// L* é duas vezes mais caro que desviar em C***, e a razão é assimétrica: L* é
// o eixo que ordena a escala (é ele que faz "decisivo" parecer mais forte que
// "provável"), enquanto um nível menos cromático apenas parece mais discreto —
// não mente sobre a margem.
//
// A busca é uma **grade fixa em L*** (±10 em passos de 0,25) com solução
// **fechada em C*** para cada L: dentro de um L, o melhor croma só pode ser o
// alvo (se livre) ou a borda de um intervalo proibido, do gamut, ou o zero.
// Grade fixa + desempate explícito = mesmo resultado em toda máquina, que é o
// que a constituição § 6 cobra.

/** Peso de ΔL* no custo, relativo a ΔC*. Ver comentário acima. */
const SOLVER_W_L = 2;

/** Amplitude da varredura em L*, para cada lado do alvo. */
const SOLVER_L_SLACK = 10;

/** Passo da varredura em L*. 0,25 é ~4× mais fino que o menor passo visível. */
const SOLVER_L_STEP = 0.25;

/** Distância mínima em L* entre dois níveis vizinhos, depois de empurrados. */
const LEVEL_MIN_GAP = 8;

/** Épsilon usado para sair de um intervalo aberto por dentro do contínuo. */
const INTERVAL_EPS = 1e-4;

/** Menor croma viável em (L, h) mais próximo do alvo. `null` = nenhum. */
function bestChromaAt(
  L: number,
  target: number,
  intervals: ReadonlyArray<[number, number]>,
  cMax: number,
): number | null {
  const feasible = (c: number) =>
    c >= 0 && c <= cMax && intervals.every(([lo, hi]) => !(c > lo && c < hi));

  const candidates: number[] = [Math.min(Math.max(target, 0), cMax)];
  for (const [lo, hi] of intervals) {
    candidates.push(lo - INTERVAL_EPS, hi + INTERVAL_EPS);
  }
  candidates.push(0, cMax);

  let best: number | null = null;
  let bestKey: [number, number] | null = null;
  for (const c of candidates) {
    if (!feasible(c)) continue;
    // Desempate explícito: menor |ΔC|; empatou, menor croma (mais conservador).
    const key: [number, number] = [round6(Math.abs(c - target)), round6(c)];
    if (bestKey === null || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
      best = c;
      bestKey = key;
    }
  }
  return best;
}

/** Arredonda para 6 casas — comparação de chaves imune a ruído de float. */
function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

interface SolvedLevel {
  L: number;
  C: number;
  /** Deslocado do alvo por causa do ΔE76 (não por causa do gamut). */
  pushed: boolean;
}

function solveLevel(
  targetL: number,
  targetC: number,
  h: number,
  discs: readonly Disc[],
  minL: number,
  maxL: number,
): SolvedLevel | null {
  const steps = Math.round(SOLVER_L_SLACK / SOLVER_L_STEP);
  let best: { L: number; C: number } | null = null;
  let bestKey: [number, number, number] | null = null;

  for (let k = -steps; k <= steps; k++) {
    const L = targetL + k * SOLVER_L_STEP;
    if (L < minL || L > maxL) continue;
    const cMax = maxChroma(L, h);
    const c = bestChromaAt(L, targetC, forbiddenChromaIntervals(L, discs), cMax);
    if (c === null) continue;
    const cost = (SOLVER_W_L * (L - targetL)) ** 2 + (c - targetC) ** 2;
    const key: [number, number, number] = [round6(cost), round6(Math.abs(L - targetL)), round6(c)];
    if (bestKey === null || lexLess(key, bestKey)) {
      best = { L, C: c };
      bestKey = key;
    }
  }
  if (best === null) return null;
  return {
    L: best.L,
    C: best.C,
    pushed: Math.abs(best.L - targetL) > 1e-9 || Math.abs(best.C - targetC) > 1e-9,
  };
}

function lexLess(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av < bv;
  }
  return false;
}

// ===========================================================================
// 5b. O PAR CHIP / TINTA — legibilidade do rótulo sobre a cor do partido
// ===========================================================================
// **O problema que este bloco resolve.** `<PartyTag filled>` pinta o fundo com
// a cor do partido e o rótulo com uma tinta. Enquanto a tinta era fixa
// (`--text-inverse`, quase branco), a sigla ficava ilegível em cima de todo
// partido de base clara — `--party-psol` (#d6a400) dava 2,21:1, `--party-psb`
// 2,34:1, `--party-novo` 2,89:1, `--party-outros` 2,55:1 — contra o mínimo de
// 4,5:1 da constituição § 4 (WCAG 2.1 AA, SC 1.4.3).
//
// **Por que nenhuma tinta fixa serve.** Medindo as 31 bases contra as duas
// tintas do kit (`--ink-0` #14171b e `--paper-0` #fbfbfc), 19 pedem a tinta
// clara e 12 pedem a escura. Qualquer escolha única reprova o outro grupo. A
// tinta, portanto, é **por partido**, e sai medida daqui — não escolhida a olho
// no componente.
//
// **Por que dois partidos ainda precisam de um chip diferente da base.** Verde
// de meio-tom é o caso em que as duas tintas falham ao mesmo tempo:
//
//   --party-mdb  #2e8b57 → 4,23:1 contra o preto, 4,10:1 contra o branco
//   --party-rede #3d8f3d → 4,45:1 contra o preto, 3,91:1 contra o branco
//
// Nenhuma tinta salva essas duas: a base está no meio da escala de luminância,
// longe dos dois extremos. A saída é **escurecer o fundo do chip**, o que é
// permitido pelo § 2 v1.3 — "apenas a intensidade (claro↔saturado) pode variar
// com a margem projetada, **nunca a matiz**" — e é exatamente o que o resto
// deste gerador já faz nos 5 níveis: L* desce, C* é reclampado ao gamut da
// matiz, h não se move. O chip escurecido continua sendo a cor do partido, uma
// intensidade dela.
//
// **Duas coisas que o chip escurecido não pode quebrar.** Escurecer move o
// ponto em Lab e pode empurrá-lo *para dentro* de um disco proibido de hex
// oficial (foi assim que `--party-pp` nível 5 caiu a ΔE 8,3 do azul do PP). Por
// isso a busca só aceita um candidato que passe **o mesmo** `DELTA_E_FLOOR` dos
// demais tokens, medido no hex final contra todos os oficiais do partido. E o
// gate de contraste abaixo falha a geração se algum par sobrar abaixo de 4,5:1.
//
// **Por que o token de tinta é hex literal e não `var(--ink-0)`.** O chip pode
// ser desenhado em contexto sem os tokens de tema resolvidos (um `<svg>`
// standalone, um e-mail, um snapshot de teste que só importa
// `tokens-party.css`). Emitindo `#14171b`/`#fbfbfc` literais, o par chega
// sempre completo — e o valor fica auditável no diff, que é o ponto de um
// arquivo gerado.

/** Tinta escura do kit — `--ink-0` em `app/globals.css`. */
const CHIP_INK_DARK = "#14171b";

/** Tinta clara do kit — `--paper-0` em `app/globals.css`. */
const CHIP_INK_LIGHT = "#fbfbfc";

/** Mínimo de contraste de texto da constituição § 4 (WCAG 2.1 AA, SC 1.4.3). */
export const CHIP_CONTRAST_FLOOR = 4.5;

/**
 * Passo da varredura em L* ao escurecer. 0,25 é o mesmo passo do solver de
 * ΔE76 — fino o bastante para o chip não escurecer mais do que o necessário, e
 * grosso o bastante para a busca ser um número fixo de iterações.
 */
const CHIP_L_STEP = 0.25;

interface GeneratedChip {
  /** Fundo do chip. Igual à base, ou uma intensidade mais escura dela. */
  hex: string;
  /** Tinta sobre o chip: `CHIP_INK_DARK` ou `CHIP_INK_LIGHT`, o que contrasta mais. */
  ink: string;
  /** Contraste WCAG medido entre `hex` e `ink`. */
  contrast: number;
  /** `true` quando a base não admitia nenhuma tinta e o chip precisou escurecer. */
  darkened: boolean;
  /** Melhor contraste que a **base** alcançava, com qualquer das duas tintas. */
  baseBestContrast: number;
  /** L* da base e do chip (contínuos, pré-arredondamento 8-bit). */
  baseL: number;
  chipL: number;
  /** ΔE76 entre a base e o chip — 0 quando o chip é a própria base. */
  deltaEFromBase: number;
  /** Pior ΔE76 do chip contra os hexes oficiais (`Infinity` se não há). */
  worstDeltaE: number;
  worstAgainst: OfficialHex | null;
}

/** A tinta que contrasta mais com `hex`, e o contraste que ela dá. */
function bestInkFor(hex: string): { ink: string; contrast: number } {
  const dark = contrastRatio(hex, CHIP_INK_DARK);
  const light = contrastRatio(hex, CHIP_INK_LIGHT);
  // Desempate explícito (determinismo, § 6): empatou, fica a tinta escura.
  return dark >= light
    ? { ink: CHIP_INK_DARK, contrast: dark }
    : { ink: CHIP_INK_LIGHT, contrast: light };
}

/**
 * Resolve o par `--party-<slug>-chip` / `--party-<slug>-ink`.
 *
 * Caminho curto: se a base já admite alguma tinta com ≥ 4,5:1, o chip **é** a
 * base — a identidade do partido chega intacta ao componente, que é o
 * comportamento desejado em 29 dos 31 casos.
 *
 * Caminho longo: desce L* em passos de `CHIP_L_STEP` a partir da base, com C*
 * reclampado ao gamut da matiz a cada passo (h intocada), e para no **primeiro**
 * ponto que satisfaz as duas restrições ao mesmo tempo — contraste ≥ 4,5:1 com a
 * tinta clara e ΔE76 ≥ `DELTA_E_FLOOR` contra todos os oficiais do partido.
 * Parar no primeiro é o que mantém o chip o mais próximo possível da identidade.
 *
 * Devolve `null` quando nem o preto absoluto resolve — o que só aconteceria se a
 * matiz estivesse cercada pela paleta oficial do partido em toda a coluna de L*.
 */
function buildChip(
  entry: PartyEntry,
  baseLch: Lch,
  officials: readonly OfficialHex[],
): GeneratedChip | null {
  const base = entry.base.toLowerCase();
  const fromBase = bestInkFor(base);

  if (fromBase.contrast >= CHIP_CONTRAST_FLOOR) {
    const { delta, official } = worstAgainstOfficials(base, officials);
    return {
      hex: base,
      ink: fromBase.ink,
      contrast: fromBase.contrast,
      darkened: false,
      baseBestContrast: fromBase.contrast,
      baseL: baseLch.L,
      chipL: baseLch.L,
      deltaEFromBase: 0,
      worstDeltaE: delta,
      worstAgainst: official,
    };
  }

  // Índice inteiro em vez de `L -= passo` acumulado: mesmo resultado bit a bit
  // em qualquer máquina, sem erro de ponto flutuante somando ao longo da busca.
  const steps = Math.floor(baseLch.L / CHIP_L_STEP);
  for (let k = 1; k <= steps; k++) {
    const L = baseLch.L - k * CHIP_L_STEP;
    const C = Math.min(baseLch.C, maxChroma(L, baseLch.h));
    const hex = lchToHex(L, C, baseLch.h);
    if (contrastRatio(hex, CHIP_INK_LIGHT) < CHIP_CONTRAST_FLOOR) continue;
    const { delta, official } = worstAgainstOfficials(hex, officials);
    // O chip escurecido é medido contra os oficiais como qualquer outro token:
    // escurecer pode empurrar a cor para dentro de um disco proibido.
    if (delta < DELTA_E_FLOOR) continue;
    const ink = bestInkFor(hex);
    return {
      hex,
      ink: ink.ink,
      contrast: ink.contrast,
      darkened: true,
      baseBestContrast: fromBase.contrast,
      baseL: baseLch.L,
      chipL: L,
      deltaEFromBase: deltaE76(base, hex),
      worstDeltaE: delta,
      worstAgainst: official,
    };
  }
  return null;
}

// ===========================================================================
// 6. GERAÇÃO
// ===========================================================================

interface GeneratedLevel {
  level: 1 | 2 | 3 | 4 | 5;
  hex: string;
  /** Lightness / croma / matiz medidos **no hex final** (pós-round 8-bit). */
  measured: Lch;
  /** Croma reduzido para caber no gamut sRGB da matiz. */
  clamped: boolean;
  /** Croma reduzido para não ficar acima do nível seguinte (anti-inversão). */
  ordered: boolean;
  /** Deslocado em L* / C* para sair do raio proibido de um hex oficial. */
  pushed: boolean;
  /** C* do alvo da rampa, antes de qualquer ajuste. */
  requestedChroma: number;
  /** C* depois do gamut e da ordenação, antes do empurrão de ΔE76. */
  gamutChroma: number;
  /** L* / C* efetivamente emitidos (contínuos, pré-arredondamento 8-bit). */
  effectiveL: number;
  effectiveChroma: number;
  /** Pior ΔE76 contra os hexes oficiais do partido (`Infinity` se não há). */
  worstDeltaE: number;
  worstAgainst: OfficialHex | null;
}

interface GeneratedParty {
  entry: PartyEntry;
  baseLch: Lch;
  levels: GeneratedLevel[];
  /** Par de fundo/tinta do chip sólido — ver seção 5b. */
  chip: GeneratedChip;
  officials: OfficialHex[];
  baseDeltaE: number;
  baseAgainst: OfficialHex | null;
}

function worstAgainstOfficials(
  hex: string,
  officials: readonly OfficialHex[],
): { delta: number; official: OfficialHex | null } {
  let delta = Number.POSITIVE_INFINITY;
  let official: OfficialHex | null = null;
  for (const o of officials) {
    const d = deltaE76(hex, o.hex);
    if (d < delta) {
      delta = d;
      official = o;
    }
  }
  return { delta, official };
}

/**
 * Constrói os 5 níveis de um partido. Três passadas, nesta ordem:
 *
 *   1. **alvo ∧ gamut** — C* do nível, reduzido ao que a matiz alcança em L*;
 *   2. **ordenação de croma** — varredura de trás para frente garantindo
 *      C₁ ≤ C₂ ≤ C₃ ≤ C₄ e C₅ ≤ C₄. É o que impede a inversão que existia em
 *      `--party-agir` (C* 47,8 → 12,8 do nível 3 para o 4): quando a matiz não
 *      alcança o croma do nível 4, o nível 3 desce junto em vez de o 4 ficar
 *      mais pálido que ele. O formato final é o do kit — croma sobe até o 4 e
 *      recua no 5;
 *   3. **empurrão de ΔE76** — só onde o alvo cai dentro de um disco proibido.
 *
 * A ordem importa: empurrar antes de ordenar faria a ordenação desfazer o
 * empurrão e reintroduzir a violação.
 */
function buildRamp(entry: PartyEntry, officials: readonly OfficialHex[]): GeneratedParty {
  const baseLch = hexToLch(entry.base);
  const h = baseLch.h;
  const discs = entry.neutral ? [] : discsForHue(h, officials, DELTA_E_FLOOR + SEARCH_MARGIN);

  // Passada 1 — alvo ∧ gamut.
  const chroma: number[] = [];
  const clamped: boolean[] = [];
  for (let i = 0; i < 5; i++) {
    const target = entry.neutral ? 0 : (RAMP_C[i] ?? 0);
    const c = entry.neutral ? 0 : Math.min(target, maxChroma(RAMP_L[i] ?? 0, h));
    chroma.push(c);
    clamped.push(!entry.neutral && c < target - 1e-9);
  }

  // Passada 2 — ordenação de croma.
  const ordered: boolean[] = [false, false, false, false, false];
  for (let i = 2; i >= 0; i--) {
    const next = chroma[i + 1] ?? 0;
    if ((chroma[i] ?? 0) > next) {
      chroma[i] = next;
      ordered[i] = true;
    }
  }
  if ((chroma[4] ?? 0) > (chroma[3] ?? 0)) {
    chroma[4] = chroma[3] ?? 0;
    ordered[4] = true;
  }

  // Passada 3 — empurrão de ΔE76, com a rampa resolvida do topo para a base
  // para que o piso de L* de cada nível seja o L* **já decidido** do anterior.
  const levels: GeneratedLevel[] = [];
  let previousL: number | null = null;
  for (let i = 0; i < 5; i++) {
    const targetL = RAMP_L[i] ?? 0;
    const targetC = chroma[i] ?? 0;
    const maxL =
      previousL === null
        ? targetL + SOLVER_L_SLACK
        : Math.min(targetL + SOLVER_L_SLACK, previousL - LEVEL_MIN_GAP);
    const solved = solveLevel(targetL, targetC, h, discs, targetL - SOLVER_L_SLACK, maxL);
    if (solved === null) {
      throw new Error(
        `--party-${entry.slug}-${i + 1}: nenhum ponto em L* ∈ [${(targetL - SOLVER_L_SLACK).toFixed(1)}, ${maxL.toFixed(1)}] ` +
          `na matiz ${h.toFixed(1)}° fica a ΔE76 ≥ ${DELTA_E_FLOOR} de todos os hexes oficiais do partido.\n` +
          `A matiz base #${entry.base} está cercada demais pela paleta oficial: escolha outro hex base em PARTY_BASE.`,
      );
    }
    const hex = lchToHex(solved.L, solved.C, h);
    const { delta, official } = worstAgainstOfficials(hex, officials);
    levels.push({
      level: (i + 1) as 1 | 2 | 3 | 4 | 5,
      hex,
      measured: hexToLch(hex),
      clamped: clamped[i] ?? false,
      ordered: ordered[i] ?? false,
      pushed: solved.pushed,
      requestedChroma: entry.neutral ? 0 : (RAMP_C[i] ?? 0),
      gamutChroma: targetC,
      effectiveL: solved.L,
      effectiveChroma: solved.C,
      worstDeltaE: delta,
      worstAgainst: official,
    });
    previousL = solved.L;
  }

  const chip = buildChip(entry, baseLch, officials);
  if (chip === null) {
    throw new Error(
      `--party-${entry.slug}-chip: nenhuma intensidade da matiz ${h.toFixed(1)}° chega a ` +
        `${CHIP_CONTRAST_FLOOR.toFixed(1)}:1 com a tinta clara sem cair a menos de ΔE76 ` +
        `${DELTA_E_FLOOR} de um hex oficial de ${entry.nome}.\n` +
        `A matiz base ${entry.base} está cercada pela paleta oficial do partido em toda a coluna ` +
        "de L*: escolha outro hex base em PARTY_BASE.",
    );
  }

  const base = worstAgainstOfficials(entry.base.toLowerCase(), officials);
  return {
    entry,
    baseLch,
    levels,
    chip,
    officials: [...officials],
    baseDeltaE: base.delta,
    baseAgainst: base.official,
  };
}

// ===========================================================================
// 7. VALIDAÇÃO — o que faz a geração falhar
// ===========================================================================

interface Violation {
  token: string;
  hex: string;
  deltaE: number;
  official: OfficialHex;
  party: string;
}

/** Base + 5 níveis × todos os hexes oficiais do partido. Sem exceção. */
function deltaEViolations(parties: readonly GeneratedParty[]): Violation[] {
  const out: Violation[] = [];
  for (const p of parties) {
    const check = (token: string, hex: string) => {
      for (const o of p.officials) {
        const d = deltaE76(hex, o.hex);
        if (d < DELTA_E_FLOOR) {
          out.push({ token, hex, deltaE: d, official: o, party: p.entry.nome });
        }
      }
    };
    check(`--party-${p.entry.slug}`, p.entry.base.toLowerCase());
    // O chip entra no mesmo gate: quando ele diverge da base (por escurecimento),
    // é uma cor nova, e cor nova de partido se mede contra os oficiais como
    // qualquer outra. `--party-<slug>-ink` fica **fora** de propósito: é preto ou
    // branco do kit, não uma cor de partido — medi-lo contra a paleta oficial
    // seria uma pergunta sem sentido.
    check(`--party-${p.entry.slug}-chip`, p.chip.hex);
    for (const lv of p.levels) check(`--party-${p.entry.slug}-${lv.level}`, lv.hex);
  }
  return out;
}

/**
 * Gate de legibilidade da constituição § 4: todo par chip/tinta emitido precisa
 * dar ≥ 4,5:1. `buildChip` já só devolve pares que passam — este gate existe
 * para que uma mudança futura em `PARTY_BASE`, nas tintas, ou no próprio
 * `buildChip` não consiga emitir um chip ilegível em silêncio.
 */
function contrastViolations(
  parties: readonly GeneratedParty[],
): Array<{ party: GeneratedParty; contrast: number }> {
  return parties
    .filter((p) => p.chip.contrast < CHIP_CONTRAST_FLOOR)
    .map((p) => ({ party: p, contrast: p.chip.contrast }));
}

function formatContrastViolations(
  violations: ReadonlyArray<{ party: GeneratedParty; contrast: number }>,
): string {
  const lines = [
    `${violations.length} par(es) chip/tinta abaixo de ${CHIP_CONTRAST_FLOOR.toFixed(1)}:1 — ` +
      "a sigla ficaria ilegível sobre o chip sólido.",
    "Isso viola a constituição § 4 (WCAG 2.1 AA, SC 1.4.3: contraste mínimo de texto 4.5:1).",
    "",
  ];
  for (const { party, contrast } of violations) {
    const c = party.chip;
    lines.push(`  --party-${party.entry.slug}-chip: ${c.hex} (${party.entry.nome})`);
    lines.push(
      `    contraste ${contrast.toFixed(2)}:1 contra --party-${party.entry.slug}-ink ${c.ink}`,
    );
    lines.push(
      `    a base ${party.entry.base.toLowerCase()} alcançava no máximo ` +
        `${c.baseBestContrast.toFixed(2)}:1 com qualquer das duas tintas`,
    );
  }
  lines.push("");
  lines.push(
    "`buildChip` escurece o fundo (matiz preservada) até a tinta clara passar; se ele parou\n" +
      "antes, foi o piso de ΔE76 contra os hexes oficiais do partido que bloqueou a descida.\n" +
      "Nesse caso o hex base precisa mudar em PARTY_BASE — não relaxe nenhum dos dois pisos.",
  );
  return lines.join("\n");
}

/**
 * A rampa é lida como escala de margem — 1 = disputa apertada, 5 = decisivo —
 * então L* **precisa** cair estritamente do nível 1 ao 5. Onde não cai,
 * "decisivo" aparece mais claro que "provável" e a escala mente para o leitor.
 * Medido no hex final, não no alvo contínuo.
 */
function monotonicityViolations(parties: readonly GeneratedParty[]): string[] {
  const out: string[] = [];
  for (const p of parties) {
    for (let i = 1; i < p.levels.length; i++) {
      const prev = p.levels[i - 1];
      const cur = p.levels[i];
      if (!prev || !cur) continue;
      if (cur.measured.L >= prev.measured.L) {
        out.push(
          `--party-${p.entry.slug}: nível ${cur.level} (L* ${cur.measured.L.toFixed(1)}) não é mais ` +
            `escuro que o nível ${prev.level} (L* ${prev.measured.L.toFixed(1)})`,
        );
      }
    }
  }
  return out;
}

/** Aviso, não erro: croma caindo do nível 3 para o 4 (a rampa fica achatada). */
function chromaInversions(parties: readonly GeneratedParty[]): string[] {
  const out: string[] = [];
  for (const p of parties) {
    if (p.entry.neutral) continue;
    for (let i = 1; i < 4; i++) {
      const prev = p.levels[i - 1];
      const cur = p.levels[i];
      if (!prev || !cur) continue;
      // 0,6 absorve o ruído do arredondamento 8-bit.
      if (cur.measured.C < prev.measured.C - 0.6) {
        out.push(
          `--party-${p.entry.slug}: C* cai de ${prev.measured.C.toFixed(1)} (nível ${prev.level}) ` +
            `para ${cur.measured.C.toFixed(1)} (nível ${cur.level})`,
        );
      }
    }
  }
  return out;
}

function formatViolations(violations: readonly Violation[]): string {
  const lines = [
    `${violations.length} token(s) a menos de ΔE76 ${DELTA_E_FLOOR} de um hex oficial de partido.`,
    "Isso viola a constituição § 2 v1.3 (mínimo 10) ou a margem operacional deste repositório (12).",
    "",
  ];
  for (const v of violations) {
    lines.push(`  ${v.token}: ${v.hex}`);
    lines.push(
      `    ΔE76 ${v.deltaE.toFixed(2)} contra ${v.official.hex} — ${v.party}, ${v.official.role}`,
    );
    lines.push(
      `    fonte: ${v.official.source_type}${v.official.url ? ` · ${v.official.url}` : ""}` +
        `${v.official.confidence ? ` (confiança ${v.official.confidence})` : ""}`,
    );
  }
  lines.push("");
  lines.push(
    "Se o token violando é o base (`--party-<sigla>`), escolha outro hex em PARTY_BASE.\n" +
      "Se é um nível, o solver não achou saída na matiz do base — a matiz está cercada\n" +
      "pela paleta oficial do partido e o hex base precisa mudar de matiz.",
  );
  return lines.join("\n");
}

// ===========================================================================
// 8. EMISSÃO DO CSS
// ===========================================================================

const HEADER = `/* =============================================================================
 * app/tokens-party.css — ARQUIVO GERADO. NÃO EDITE À MÃO.
 *
 *   Gerador : scripts/gen-party-scale.ts
 *   Comando : pnpm gen:party-scale
 *   Fonte   : a tabela \`PARTY_BASE\` (sigla → hex base) dentro do gerador,
 *             cujos hexes vêm do kit Atlas Menna
 *             (docs/design-system/atlas-menna/tokens/colors.css:37-76), e a
 *             tabela de hexes oficiais em scripts/data/party-official-hexes.json.
 *
 * Qualquer edição manual aqui é perdida na próxima geração. Para mudar uma
 * cor, mude \`PARTY_BASE\` no gerador e rode o comando acima.
 *
 * -----------------------------------------------------------------------------
 * O que estes tokens são
 * -----------------------------------------------------------------------------
 * A paleta editorial por partido/federação da constituição § 2 (v1.3), fixada
 * pelo ADR-0024. Uma cor por partido, **estável a noite inteira**: a matiz (h
 * em CIE LCh) é idêntica nos 5 níveis; só L* e C* mudam. O nível é função da
 * margem projetada — 1 = disputa apertada, 5 = decisivo — resolvido por
 * \`lib/utils/party-color.ts\`.
 *
 * \`--party-<sigla>\` é a cor de **identidade** (contorno, ponto, legenda);
 * \`--party-<sigla>-1..5\` é a **escala de margem**. Desde 2026-09-07 o nível 4
 * não é mais o hex base literal: os cinco níveis têm alvos de L* / C* iguais para
 * todos os partidos, o que é o que garante L* estritamente decrescente do 1 ao
 * 5 em toda matiz (antes, quem tinha base clara saía com o "decisivo" mais
 * claro que o "provável").
 *
 * Nunca são as cores oficiais dos partidos: § 2 v1.3 exige ΔE76 ≥ 10 contra o
 * hex oficial documentado, e este gerador aplica um piso de 12 — verificado
 * sobre a base e os 5 níveis de cada partido, contra **todos** os hexes
 * oficiais dele, e refeito sobre este arquivo por
 * \`tests/unit/design-system/party-delta-e.test.ts\`.
 *
 * -----------------------------------------------------------------------------
 * O par \`-chip\` / \`-ink\` — superfície sólida com rótulo legível
 * -----------------------------------------------------------------------------
 * \`--party-<sigla>-chip\` é o **fundo** de um chip sólido (\`<PartyTag filled>\`) e
 * \`--party-<sigla>-ink\` é a **tinta** a usar em cima dele. Os dois se usam
 * **sempre juntos**: o par é medido aqui em ≥ 4,5:1 (constituição § 4, WCAG 2.1
 * AA), e trocar um sem o outro desfaz a garantia.
 *
 * Não existe tinta única que sirva: das 31 bases, 19 pedem a tinta clara
 * (#fbfbfc) e 12 pedem a escura (#14171b). E duas — MDB (#2e8b57) e Rede
 * (#3d8f3d), verdes de meio-tom — reprovam com **as duas**, então o chip delas é
 * a base escurecida (mesma matiz, só L* e C* mudam, como manda o § 2 v1.3). Onde o
 * chip diverge da base, o comentário na linha diz de quanto e por quê.
 *
 * Em React, o par vem pronto de \`partyChipInk(sigla)\` em \`lib/utils/party-color.ts\`.
 *
 * -----------------------------------------------------------------------------
 * Duas regras que este arquivo não pode quebrar
 * -----------------------------------------------------------------------------
 * 1. \`@theme static\` — sem \`static\`, o Tailwind v4 descarta variáveis que não
 *    aparecem em nenhuma classe utilitária, e \`resolvePartyHex()\` receberia
 *    string vazia do \`getComputedStyle\`: o mapa ficaria cinza em silêncio.
 * 2. **Hex literal**, nunca \`color-mix()\` nem \`oklch()\` — o MapLibre lê estes
 *    tokens por \`getComputedStyle\` e passa a string direto para
 *    \`setPaintProperty\`, que não resolve nenhum dos dois.
 *
 * Dark mode (\`[data-theme="dark"]\`) entra no Bloco 2: mais um bloco emitido por
 * este mesmo gerador, com alvos de L* crescentes no lugar de \`RAMP_L\`.
 * ========================================================================== */

@theme static {`;

function emitCss(parties: readonly GeneratedParty[]): string {
  const out: string[] = [HEADER];

  for (const [i, party] of parties.entries()) {
    const { entry, baseLch } = party;
    const lch = `L* ${baseLch.L.toFixed(1)} · C* ${baseLch.C.toFixed(1)} · h ${baseLch.h.toFixed(1)}°`;
    const de = Number.isFinite(party.baseDeltaE)
      ? `ΔE76 ${party.baseDeltaE.toFixed(1)} de ${party.baseAgainst?.hex}`
      : "sem hex oficial conhecido";
    const origem = entry.neutral ? "rampa acromática (C* = 0) — cinza institucional" : de;
    // Sem linha em branco logo após `@theme static {` — o formatter do Biome
    // a remove, e o arquivo gerado precisa já sair formatado (senão
    // `pnpm lint` e `pnpm gen:party-scale --check` brigam entre si).
    if (i > 0) out.push("");
    out.push(`  /* ${entry.nome} — base ${lch} · ${origem} */`);
    out.push(`  --party-${entry.slug}: ${entry.base.toLowerCase()};`);

    // Par chip/tinta — sempre os dois juntos, nesta ordem, logo abaixo da base:
    // quem lê o arquivo precisa ver que são um par, não dois tokens soltos.
    const c = party.chip;
    const tinta = c.ink === CHIP_INK_DARK ? "tinta escura" : "tinta clara";
    if (c.darkened) {
      out.push(
        `  --party-${entry.slug}-chip: ${c.hex}; ` +
          `/* base escurecida L* ${c.baseL.toFixed(1)} → ${c.chipL.toFixed(1)} (matiz intacta): ` +
          `a base parava em ${c.baseBestContrast.toFixed(2)}:1 com as duas tintas · ` +
          `agora ${c.contrast.toFixed(2)}:1 · ΔE76 ${c.deltaEFromBase.toFixed(1)} da base, ` +
          `${c.worstDeltaE.toFixed(1)} de ${c.worstAgainst?.hex} */`,
      );
    } else {
      out.push(
        `  --party-${entry.slug}-chip: ${c.hex}; ` +
          `/* = base · ${c.contrast.toFixed(2)}:1 com a tinta abaixo */`,
      );
    }
    out.push(
      `  --party-${entry.slug}-ink: ${c.ink}; ` +
        `/* ${tinta} sobre o chip — ${c.contrast.toFixed(2)}:1 (§ 4 exige 4.5:1) */`,
    );

    for (const lv of party.levels) {
      const notes: string[] = [];
      if (lv.clamped) {
        notes.push(
          `C* ${lv.requestedChroma.toFixed(1)} → ${lv.gamutChroma.toFixed(1)} (gamut sRGB)`,
        );
      } else if (lv.ordered) {
        notes.push(`C* alinhado ao nível seguinte (${lv.gamutChroma.toFixed(1)})`);
      }
      if (lv.pushed) {
        const moves: string[] = [];
        const targetL = RAMP_L[lv.level - 1] ?? 0;
        if (Math.abs(lv.effectiveL - targetL) > 1e-9) {
          moves.push(`L* ${targetL.toFixed(1)} → ${lv.effectiveL.toFixed(1)}`);
        }
        if (Math.abs(lv.effectiveChroma - lv.gamutChroma) > 1e-9) {
          moves.push(`C* ${lv.gamutChroma.toFixed(1)} → ${lv.effectiveChroma.toFixed(1)}`);
        }
        notes.push(
          `${moves.join(", ")} p/ ΔE76 ${lv.worstDeltaE.toFixed(1)} de ${lv.worstAgainst?.hex}`,
        );
      }
      const flag = notes.length > 0 ? ` /* ${notes.join(" · ")} */` : "";
      out.push(`  --party-${entry.slug}-${lv.level}: ${lv.hex};${flag}`);
    }
  }

  out.push("");
  out.push("  /* Estados de corrida — sem partido, logo sem rampa por margem. */");
  for (const s of STATE_TOKENS) {
    out.push(`  --party-${s.name}: ${s.hex.toLowerCase()}; /* ${s.nota} */`);
  }

  out.push("}");
  out.push("");
  return out.join("\n");
}

// ===========================================================================
// 9. CLI
// ===========================================================================

function report(parties: readonly GeneratedParty[]): string {
  const rows: string[] = [];
  rows.push("");
  rows.push("Auditoria — L*, C* e h e ΔE76 medidos no hex final (pós-arredondamento 8-bit).");
  rows.push(
    "A matiz (h) precisa ser constante e L* estritamente decrescente dentro de cada partido.",
  );
  rows.push("");
  for (const p of parties) {
    const baseDe = Number.isFinite(p.baseDeltaE)
      ? `ΔE ${p.baseDeltaE.toFixed(2)} (${p.baseAgainst?.hex})`
      : "sem oficial";
    rows.push(`${p.entry.nome} (--party-${p.entry.slug}) — base ${p.entry.base} · ${baseDe}`);
    const c = p.chip;
    rows.push(
      `  chip   ${c.hex} + ink ${c.ink} → ${c.contrast.toFixed(2)}:1` +
        (c.darkened
          ? `  (base dava ${c.baseBestContrast.toFixed(2)}:1 · escurecida ΔE76 ` +
            `${c.deltaEFromBase.toFixed(1)} · ΔE76 ${c.worstDeltaE.toFixed(2)} do oficial)`
          : "  (= base)"),
    );
    rows.push("  nível  hex        L*      C*      h       ΔE76   contra    nota");
    for (const lv of p.levels) {
      const notes = [
        lv.clamped ? "gamut" : "",
        lv.ordered ? "ordem" : "",
        lv.pushed ? "ΔE-push" : "",
      ]
        .filter(Boolean)
        .join("+");
      const de = Number.isFinite(lv.worstDeltaE) ? lv.worstDeltaE.toFixed(2) : "—";
      rows.push(
        `  ${String(lv.level).padEnd(6)} ${lv.hex}    ` +
          `${lv.measured.L.toFixed(1).padStart(5)}  ` +
          `${lv.measured.C.toFixed(1).padStart(5)}  ` +
          `${lv.measured.h.toFixed(1).padStart(6)}  ` +
          `${de.padStart(6)}   ${(lv.worstAgainst?.hex ?? "—").padEnd(9)} ${notes}`,
      );
    }
    const kit = KIT_RAMPS[p.entry.slug];
    if (kit) {
      const diffs = p.levels.map(
        (lv, i) => `${lv.level}: ${deltaE76(lv.hex, kit[i] ?? lv.hex).toFixed(1)}`,
      );
      rows.push(`  desvio ΔE76 da rampa literal do kit → ${diffs.join("  ")}`);
    }
    rows.push("");
  }
  return rows.join("\n");
}

function main(): void {
  const argv = process.argv.slice(2);
  const wantReport = argv.includes("--report");
  const checkOnly = argv.includes("--check");

  const official = loadOfficialHexes();
  const parties = PARTY_BASE.map((entry) =>
    buildRamp(entry, official[`--party-${entry.slug}`]?.official ?? []),
  );

  // ---- gates: nada é escrito se algum falhar -----------------------------
  const violations = deltaEViolations(parties);
  if (violations.length > 0) {
    console.error(formatViolations(violations));
    process.exitCode = 1;
    return;
  }
  const lowContrast = contrastViolations(parties);
  if (lowContrast.length > 0) {
    console.error(formatContrastViolations(lowContrast));
    process.exitCode = 1;
    return;
  }
  const monotonic = monotonicityViolations(parties);
  if (monotonic.length > 0) {
    console.error(
      `${monotonic.length} rampa(s) não estritamente decrescente(s) em L* — a escala de margem\n` +
        "ficaria fora de ordem (o nível mais 'decisivo' não seria o mais escuro):",
    );
    for (const m of monotonic) console.error(`  ${m}`);
    process.exitCode = 1;
    return;
  }

  const css = emitCss(parties);
  const target = path.resolve(import.meta.dirname, "..", "app", "tokens-party.css");

  if (checkOnly) {
    if (!existsSync(target) || readFileSync(target, "utf8") !== css) {
      console.error(
        "app/tokens-party.css está fora de sincronia com a tabela-fonte.\n" +
          "Rode `pnpm gen:party-scale` e commite o resultado.",
      );
      process.exitCode = 1;
      return;
    }
    console.log("app/tokens-party.css em sincronia com a tabela-fonte.");
    if (wantReport) console.log(report(parties));
    return;
  }

  writeFileSync(target, css, "utf8");

  const clamped = parties.flatMap((p) => p.levels.filter((lv) => lv.clamped));
  const pushed = parties.flatMap((p) =>
    p.levels.filter((lv) => lv.pushed).map((lv) => ({ slug: p.entry.slug, lv })),
  );
  const semFonte = parties.filter((p) => !p.entry.neutral && p.officials.length === 0);

  console.log(
    `app/tokens-party.css gerado — ${parties.length} partidos × 5 níveis + ${STATE_TOKENS.length} estados.`,
  );
  console.log(
    `ΔE76 ≥ ${DELTA_E_FLOOR} contra todo hex oficial: OK em ${parties.length * 7} tokens ` +
      "(base + chip + 5 níveis por partido; `-ink` é preto/branco do kit, não cor de partido).",
  );
  console.log(`${clamped.length} nível(is) com croma reduzido ao gamut sRGB (matiz preservada).`);

  const darkenedChips = parties.filter((p) => p.chip.darkened);
  const inkLight = parties.filter((p) => p.chip.ink === CHIP_INK_LIGHT).length;
  const worstChip = parties.reduce((a, b) => (a.chip.contrast <= b.chip.contrast ? a : b));
  console.log(
    `Par chip/tinta ≥ ${CHIP_CONTRAST_FLOOR.toFixed(1)}:1 (§ 4): OK em ${parties.length} partidos ` +
      `— ${inkLight} com tinta clara, ${parties.length - inkLight} com tinta escura; ` +
      `pior par: --party-${worstChip.entry.slug} ${worstChip.chip.contrast.toFixed(2)}:1.`,
  );
  if (darkenedChips.length === 0) {
    console.log("Nenhum chip precisou escurecer — todas as bases admitem alguma tinta.");
  } else {
    console.log(
      `${darkenedChips.length} chip(s) escurecido(s) porque a base reprovava com as duas tintas:`,
    );
    for (const p of darkenedChips) {
      const c = p.chip;
      console.log(
        `  --party-${p.entry.slug}-chip: ${p.entry.base.toLowerCase()} → ${c.hex} ` +
          `(${c.baseBestContrast.toFixed(2)}:1 → ${c.contrast.toFixed(2)}:1, ` +
          `ΔE76 ${c.deltaEFromBase.toFixed(1)} da base, ${c.worstDeltaE.toFixed(2)} do oficial)`,
      );
    }
  }
  if (pushed.length === 0) {
    console.log("Nenhum nível precisou de empurrão por ΔE76.");
  } else {
    console.log(`${pushed.length} nível(is) empurrado(s) para fora do raio proibido:`);
    for (const { slug, lv } of pushed) {
      console.log(
        `  --party-${slug}-${lv.level}: ${lv.hex} — ΔE76 ${lv.worstDeltaE.toFixed(2)} de ` +
          `${lv.worstAgainst?.hex} (${lv.worstAgainst?.role})`,
      );
    }
  }

  const inversions = chromaInversions(parties);
  if (inversions.length > 0) {
    console.warn(
      `\nAVISO — ${inversions.length} rampa(s) com croma caindo antes do nível 4. ` +
        "L* continua ordenado\n(a escala não mente), mas o degrau fica mais achatado do que o do kit:",
    );
    for (const i of inversions) console.warn(`  ${i}`);
  }

  if (semFonte.length > 0) {
    console.warn(
      `\nAVISO — ${semFonte.length} partido(s) sem hex oficial localizado. ` +
        "Não há do que se afastar,\nentão o piso de ΔE76 não é aplicável — revisitar quando houver fonte:",
    );
    for (const p of semFonte) {
      console.warn(`  --party-${p.entry.slug} (${p.entry.nome})`);
    }
  }

  if (wantReport) console.log(report(parties));
}

// Só executa quando invocado como script. Sem esta guarda, `import` deste
// módulo (testes, ou qualquer consumidor de `deltaE76`/`hexToLch`) reescreveria
// `app/tokens-party.css` como efeito colateral.
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  main();
}
