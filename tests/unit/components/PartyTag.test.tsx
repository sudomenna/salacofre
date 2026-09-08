// @vitest-environment happy-dom
/**
 * tests/unit/components/PartyTag.test.tsx
 *
 * `<PartyTag />` — chip de sigla partidária (ADR-0025, Bloco 1).
 *
 * O que estes testes travam:
 *   - o átomo NÃO mapeia sigla → cor. Esse mapeamento é do ADR-0024 e mora em
 *     `lib/utils/party-color.ts`; aqui a cor entra por prop e, sem ela, cai no
 *     fallback `--party-outros`;
 *   - `filled` usa o PAR cor + tinta que o caller passa, nunca uma tinta fixa:
 *     `--text-inverse` cravado deixava a sigla a 2,21:1 sobre `--party-psol`
 *     (constituição § 4 exige 4,5:1), e não há tinta única que sirva — das 31
 *     bases, 19 pedem clara e 12 pedem escura. O par medido vem de
 *     `partyChipInk()`; o gate numérico é
 *     `tests/unit/design-system/party-chip-contrast.test.ts`;
 *   - cor só por token, nunca hex literal (constituição § 2);
 *   - o ponto colorido é decorativo (`aria-hidden`): a informação é a sigla.
 */

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  PARTY_TAG_FALLBACK_COLOR,
  PARTY_TAG_FALLBACK_INK,
  PartyTag,
} from "@/components/atoms/data/PartyTag";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function tag(doc: Document): HTMLElement | null {
  return doc.querySelector("[data-testid='party-tag']");
}

/** Código do componente sem comentários — o cabeçalho fala de "use client",
 *  `useState` etc. justamente para explicar por que eles não estão lá. */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("<PartyTag />", () => {
  it("(a) renderiza a sigla e a expõe em data-sigla", () => {
    const el = tag(parse(<PartyTag sigla="PT" />));
    expect(el?.textContent).toBe("PT");
    expect(el?.getAttribute("data-sigla")).toBe("PT");
    expect(el?.getAttribute("style")).toContain("uppercase");
  });

  it("(b) sem color, borda e ponto caem no fallback --party-outros", () => {
    const doc = parse(<PartyTag sigla="XYZ" />);
    expect(PARTY_TAG_FALLBACK_COLOR).toBe("var(--party-outros, var(--color-cand-other))");
    expect(tag(doc)?.getAttribute("style")).toContain(PARTY_TAG_FALLBACK_COLOR);
    expect(doc.querySelector("[data-testid='party-tag-dot']")?.getAttribute("style")).toContain(
      PARTY_TAG_FALLBACK_COLOR,
    );
  });

  it("(c) a cor vem por prop, sempre como token", () => {
    const style = tag(parse(<PartyTag sigla="PT" color="var(--color-cand-1)" />))?.getAttribute(
      "style",
    );
    expect(style).toContain("border:1px solid var(--color-cand-1)");
  });

  it("(d) filled pinta o fundo com `color` e o rótulo com `ink` (nunca #fff)", () => {
    const node = (
      <PartyTag sigla="PL" filled color="var(--party-pl-chip)" ink="var(--party-pl-ink)" />
    );
    const html = renderToStaticMarkup(node);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const el = tag(parse(node));
    expect(el?.getAttribute("data-filled")).toBe("true");
    expect(el?.getAttribute("style")).toContain("background:var(--party-pl-chip)");
    expect(el?.getAttribute("style")).toContain("color:var(--party-pl-ink)");
  });

  it("(d2) filled não usa mais uma tinta fixa — 19 partidos pedem clara, 12 escura", () => {
    // A regressão que este teste tranca: `color: var(--text-inverse)` cravado no
    // átomo deixava a sigla a 2,21:1 sobre --party-psol e 2,34:1 sobre
    // --party-psb, contra o mínimo de 4,5:1 da constituição § 4. Nenhuma tinta
    // única resolve — a tinta é do par que o caller passa.
    const src = codeOf("components/atoms/data/PartyTag.tsx");
    expect(src).not.toContain("--text-inverse");
    const a = tag(parse(<PartyTag sigla="A" filled color="var(--x)" ink="var(--ink-a)" />));
    const b = tag(parse(<PartyTag sigla="B" filled color="var(--y)" ink="var(--ink-b)" />));
    expect(a?.getAttribute("style")).toContain("color:var(--ink-a)");
    expect(b?.getAttribute("style")).toContain("color:var(--ink-b)");
  });

  it("(d3) o default de `ink` é o par medido do fallback cinza (6,82:1)", () => {
    // Sem prop nenhuma, cor e tinta são o par de --party-outros, que o gerador
    // mediu. É o par inteiro que é seguro: passar `color` sem `ink` volta a ser
    // inseguro, e o átomo não tem como avisar (não conhece sigla, não resolve
    // token, roda no servidor). Ver o docblock do componente.
    expect(PARTY_TAG_FALLBACK_INK).toBe("var(--party-outros-ink, var(--text-primary))");
    const el = tag(parse(<PartyTag sigla="XYZ" filled />));
    expect(el?.getAttribute("style")).toContain(`color:${PARTY_TAG_FALLBACK_INK}`);
    expect(el?.getAttribute("style")).toContain(`background:${PARTY_TAG_FALLBACK_COLOR}`);
  });

  it("(d4) na variante de contorno a tinta é sempre --text-primary, ignorando `ink`", () => {
    // Contorno é o caminho seguro por construção: o texto vai sobre papel
    // (≥ 15:1), qualquer que seja a cor da borda.
    const el = tag(parse(<PartyTag sigla="PT" color="var(--party-pt)" ink="var(--qualquer)" />));
    expect(el?.getAttribute("style")).toContain("color:var(--text-primary)");
    expect(el?.getAttribute("style")).not.toContain("var(--qualquer)");
  });

  it("(e) o ponto só existe na variante de contorno, e é decorativo", () => {
    const outline = parse(<PartyTag sigla="PT" />);
    expect(
      outline.querySelector("[data-testid='party-tag-dot']")?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(
      parse(<PartyTag sigla="PT" filled />).querySelector("[data-testid='party-tag-dot']"),
    ).toBeNull();
  });

  it("(f) os dois tamanhos ficam na escala do kit — sem fontSize fora de token", () => {
    for (const size of ["sm", "md"] as const) {
      const style = tag(parse(<PartyTag sigla="PT" size={size} />))?.getAttribute("style") ?? "";
      expect(style).toContain("font-size:var(--text-2xs)");
    }
    expect(tag(parse(<PartyTag sigla="PT" size="sm" />))?.getAttribute("style")).toContain(
      "height:16px",
    );
    expect(tag(parse(<PartyTag sigla="PT" size="md" />))?.getAttribute("style")).toContain(
      "height:20px",
    );
  });

  it("(g) o arquivo não exporta nem implementa mapeamento sigla → cor", () => {
    const src = codeOf("components/atoms/data/PartyTag.tsx");
    expect(src).not.toContain("partyColor");
    expect(src).not.toMatch(/--party-(pt|pl|psd|psol|mdb)\b/);
  });
});
