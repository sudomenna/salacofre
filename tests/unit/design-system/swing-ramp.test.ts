/**
 * tests/unit/design-system/swing-ramp.test.ts
 *
 * A rampa da vista "variação desde 2022" (`components/blocks/_swingRamp.ts`).
 *
 * 🔴 **Esta rampa nunca teve teste.** Desde a S04 o comentário em
 * `NationalChoroplethMap.test.tsx` mandava para `tests/e2e/national-map.spec.ts`
 * — um arquivo que **nunca foi escrito**. Sete meses de "validado em e2e"
 * apontando para o vazio.
 *
 * E o que ela escondia: até 18/09 as duas pontas da rampa devolviam o MESMO
 * token. Uma UF que subiu 15 pontos e uma que caiu 15 pintavam igual. O defeito
 * era invisível porque `swing_vs_2022` era `None` em toda UF — o mapa inteiro
 * caía no ramo neutro.
 *
 * ## A régua: ΔE76, não razão de contraste
 *
 * Razão de contraste é medida de LUMINÂNCIA. Dois tons de luminância parecida e
 * matiz oposta — cinza-azulado e ocre, por exemplo — passam por ela sem
 * reclamação. Por isso a constituição § 2 usa **ΔE76** (distância perceptual em
 * Lab) para separar preenchimentos, com piso **10**, e é essa a régua aqui.
 *
 * ⚠️ Um caso mede **o instrumento**, não o produto: confere o ΔE76 de um par
 * conhecido (preto × branco = 100,0). Sem ele, uma fórmula de Lab quebrada
 * devolveria zero para tudo e os testes abaixo passariam afirmando o contrário
 * do que medem.
 */

import { describe, expect, it } from "vitest";

import { FILL_OPACITY, fillOpacityExpression, swingToColor } from "@/components/blocks/_swingRamp";

const PISO_DELTA_E = 10;

/** Paleta real, copiada de `app/globals.css` (os dois blocos de tema). */
const PALETA = {
  claro: {
    "--color-tossup": "#d9d9d9",
    "--color-band-likely": "#888888",
    "--color-band-very_likely": "#444444",
    "--accent": "#c98a2b",
    "--accent-soft": "#f4e7cf",
    "--map-uncounted": "#e1e4e8",
  },
  escuro: {
    "--color-tossup": "#393939",
    "--color-band-likely": "#59616d",
    "--color-band-very_likely": "#818b99",
    "--accent": "#e0a33f",
    "--accent-soft": "#3a2e17",
    "--map-uncounted": "#2b3037",
  },
} as const;

function leitorDe(tema: keyof typeof PALETA) {
  return (nome: string) => (PALETA[tema] as Record<string, string>)[nome] ?? "";
}

function lab(hex: string): [number, number, number] {
  const n = hex.replace("#", "");
  const [r = 0, g = 0, b = 0] = [0, 2, 4].map((i) => {
    const c = Number.parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE76(a: string, b: string): number {
  const [A, B] = [lab(a), lab(b)];
  return Math.sqrt((A[0] - B[0]) ** 2 + (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2);
}

describe("swingToColor — a direção, que é o que estava quebrado", () => {
  it("o instrumento mede: ΔE76(preto, branco) ≈ 100", () => {
    expect(deltaE76("#000000", "#ffffff")).toBeGreaterThan(99);
    expect(deltaE76("#000000", "#000000")).toBe(0);
  });

  it.each([
    "claro",
    "escuro",
  ] as const)("🔴 [%s] alta forte e queda forte NÃO podem ser a mesma cor (eram, até 18/09)", (tema) => {
    const g = leitorDe(tema);
    const alta = swingToColor(15, g);
    const queda = swingToColor(-15, g);
    expect(alta, "alta e queda devolveram o MESMO token — o defeito voltou").not.toBe(queda);
    expect(deltaE76(alta, queda)).toBeGreaterThanOrEqual(PISO_DELTA_E);
  });

  it.each([
    "claro",
    "escuro",
  ] as const)("[%s] os quatro degraus mais o neutro se separam por ΔE76 ≥ 10, dois a dois", (tema) => {
    const g = leitorDe(tema);
    const degraus = {
      "queda forte": swingToColor(-15, g),
      "queda leve": swingToColor(-5, g),
      neutro: swingToColor(0.5, g),
      "alta leve": swingToColor(5, g),
      "alta forte": swingToColor(15, g),
    };
    // Guarda do instrumento: nenhum token pode vir vazio, ou o ΔE viraria
    // ruído entre strings inválidas.
    for (const [nome, hex] of Object.entries(degraus)) {
      expect(hex, `degrau "${nome}" veio vazio`).toMatch(/^#[0-9a-f]{6}$/i);
    }
    const nomes = Object.keys(degraus);
    const falhas: string[] = [];
    for (let i = 0; i < nomes.length; i++) {
      for (let j = i + 1; j < nomes.length; j++) {
        const [a, b] = [nomes[i] as string, nomes[j] as string];
        const d = deltaE76(degraus[a as keyof typeof degraus], degraus[b as keyof typeof degraus]);
        if (d < PISO_DELTA_E) falhas.push(`${a} × ${b} = ${d.toFixed(1)}`);
      }
    }
    expect(falhas, "par de degraus abaixo do piso de ΔE76 da constituição § 2").toEqual([]);
  });

  it.each([
    "claro",
    "escuro",
  ] as const)("[%s] o limiar é EM 2, e o teste tem caso NO limiar", (tema) => {
    const g = leitorDe(tema);
    // Um teste só com 0 e 5 passa tanto com `< 2` quanto com `<= 2` ou `< 1`.
    // O caso que discrimina é o que vale exatamente 2.
    expect(swingToColor(1.99, g)).toBe(g("--color-tossup"));
    expect(swingToColor(2, g)).not.toBe(g("--color-tossup"));
    expect(swingToColor(-2, g)).not.toBe(g("--color-tossup"));
  });
});

describe("fillOpacityExpression — o terceiro estado", () => {
  const LINHAS = [
    { sigla: "SP", swing_vs_2022: 12.9 },
    { sigla: "AC", swing_vs_2022: null },
    { sigla: "MG", swing_vs_2022: -10.9 },
  ];

  it("🔴 UF SEM comparação sai com preenchimento ZERO, não com a cor de 'não mudou'", () => {
    const expr = fillOpacityExpression("swing", LINHAS);
    expect(Array.isArray(expr), "esperava expressão por feição, veio escalar").toBe(true);
    const arr = expr as unknown[];
    // ["match", ["get","SIGLA_UF"], "AC", 0, 0.88]
    expect(arr[0]).toBe("match");
    expect(arr).toContain("AC");
    expect(arr[arr.indexOf("AC") + 1]).toBe(0);
    expect(arr[arr.length - 1]).toBe(FILL_OPACITY);
    // E as que TÊM comparação não podem entrar na lista de zerados.
    expect(arr).not.toContain("SP");
    expect(arr).not.toContain("MG");
  });

  it("🔴 quando NENHUMA UF tem comparação, NÃO zera tudo — o mapa em branco parece defeito", () => {
    // Achado da tela, 18/09: no modo simulado (sem 2022) o mapa virou 27
    // contornos vazios, sem uma palavra dizendo por quê. A ambiguidade que o
    // preenchimento zero resolve só existe quando os dois estados convivem.
    const todasNulas = [
      { sigla: "SP", swing_vs_2022: null },
      { sigla: "AC", swing_vs_2022: null },
    ];
    expect(fillOpacityExpression("swing", todasNulas)).toBe(FILL_OPACITY);
  });

  it("sem nenhuma UF sem comparação, volta a ser o escalar (não deixa expressão órfã)", () => {
    expect(fillOpacityExpression("swing", [{ sigla: "SP", swing_vs_2022: 1 }])).toBe(FILL_OPACITY);
  });

  it("fora da vista swing é sempre o escalar — senão a opacidade zerada vira resíduo", () => {
    for (const view of ["winner", "margin", "turnout"]) {
      expect(fillOpacityExpression(view, LINHAS), `view ${view} devolveu expressão`).toBe(
        FILL_OPACITY,
      );
    }
  });
});
