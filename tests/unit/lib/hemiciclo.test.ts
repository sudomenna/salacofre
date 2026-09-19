/**
 * tests/unit/lib/hemiciclo.test.ts — a geometria do plenário da Câmara.
 *
 * O que este arquivo protege é **um invariante de contagem**, não uma
 * aparência: a soma das bolinhas tem de ser exatamente `bancada.total_cadeiras`
 * (RF-125.1), e o desenho não pode mudar de forma quando o tamanho da Câmara
 * mudar (RF-124).
 *
 * Cada bloco nomeia a mutação que o derruba. Elas foram aplicadas de verdade em
 * 2026-09-18, não raciocinadas — ver o relatório da rodada.
 */

import { describe, expect, it } from "vitest";

import {
  ARCOS_PADRAO,
  arcosPara,
  assentosPorArco,
  layoutHemiciclo,
  raiosDosArcos,
} from "@/lib/utils/hemiciclo";

describe("hemiciclo — a soma fecha, sempre (RF-125.1)", () => {
  // 🔴 MUTAÇÃO: trocar a distribuição de resto por `floor` simples (apagar o
  // bloco de maiores restos em `assentosPorArco`). A soma passa a perder entre
  // 0 e 11 cadeiras, e o desenho continua bonito.
  it("Σ assentos por arco === total, em 200 tamanhos diferentes", () => {
    const falhas: string[] = [];
    for (let n = 1; n <= 600; n += 3) {
      const arcos = arcosPara(n);
      const soma = assentosPorArco(n, arcos).reduce((a, b) => a + b, 0);
      if (soma !== n) falhas.push(`n=${n}: Σ=${soma}`);
    }
    expect(falhas, "a distribuição de resto perdeu cadeiras").toEqual([]);
  });

  it("o layout devolve exatamente `total` assentos posicionados", () => {
    for (const n of [1, 2, 7, 23, 24, 25, 100, 513, 531, 594]) {
      expect(layoutHemiciclo(n).assentos, `n=${n}`).toHaveLength(n);
      expect(layoutHemiciclo(n).total, `n=${n}`).toBe(n);
    }
  });

  it("total 0 ou negativo não inventa plenário nenhum", () => {
    // Sem cadeira publicada, um desenho de tamanho padrão para preencher o
    // espaço seria número escrito à mão (design 017 § D8).
    expect(layoutHemiciclo(0).assentos).toHaveLength(0);
    expect(layoutHemiciclo(-5).assentos).toHaveLength(0);
    expect(layoutHemiciclo(Number.NaN).assentos).toHaveLength(0);
  });
});

describe("hemiciclo — 🔴 `513` não é constante em lugar nenhum (RF-124)", () => {
  // 🔴 MUTAÇÃO: cravar `513` em qualquer ponto — um `const N = 513`, um
  // `Math.min(total, 513)`, um default de parâmetro.
  it("total 531 produz 531 assentos", () => {
    expect(layoutHemiciclo(531).assentos).toHaveLength(531);
  });

  it("o número de assentos acompanha o total, um a um, na vizinhança de 513", () => {
    for (let n = 505; n <= 535; n++) {
      expect(layoutHemiciclo(n).assentos, `n=${n}`).toHaveLength(n);
    }
  });
});

describe("hemiciclo — o número de ARCOS é constante, e é por isso que é", () => {
  // 🔴 MUTAÇÃO: derivar os arcos de `N` (por exemplo o
  // `clamp(round(sqrt(N/10)), 6, 14)` que o plano desta tarefa propunha).
  // Com 513 ele dá 7 e com um N maior daria 8 — e o leitor veria o plenário
  // mudar de forma por causa de uma decisão do Congresso sobre o tamanho da casa.
  //
  // ⚠️ 2026-09-19: 531 aqui é **caso de robustez, não desfecho por vir**. O PLP
  // 177/2023 foi vetado em julho/2025 e o STF manteve as 513 (ADR-0049, emenda).
  // O caso fica: é justamente por 531 NÃO ser o número da eleição que ele prova
  // que o desenho não escondeu o tamanho da casa em camada nenhuma.
  it("513 e 531 desenham o MESMO número de arcos", () => {
    expect(arcosPara(513)).toBe(ARCOS_PADRAO);
    expect(arcosPara(531)).toBe(ARCOS_PADRAO);
    expect(layoutHemiciclo(513).arcos).toBe(layoutHemiciclo(531).arcos);
  });

  it("de 513 para 531, cada arco muda no máximo 2 cadeiras — e nada mais muda", () => {
    const a = assentosPorArco(513, ARCOS_PADRAO);
    const b = assentosPorArco(531, ARCOS_PADRAO);
    expect(a).toHaveLength(b.length);
    const deltas = a.map((v, i) => (b[i] as number) - v);
    expect(Math.max(...deltas.map(Math.abs)), `deltas: ${deltas.join(",")}`).toBeLessThanOrEqual(2);
    expect(deltas.reduce((x, y) => x + y, 0)).toBe(18);
  });

  it("todo tamanho de Câmara plausível usa os 12 arcos", () => {
    for (const n of [24, 100, 400, 513, 531, 600, 1000]) {
      expect(arcosPara(n), `n=${n}`).toBe(ARCOS_PADRAO);
    }
  });

  // 🔴 MUTAÇÃO: apagar a guarda do extremo pequeno (`total < 2 · arcos`).
  // Com 4 cadeiras e 12 arcos, 8 arcos saem com zero assentos — buracos no
  // meio do desenho que se leem como cadeira faltando. É caminho real: um
  // payload com 4 cadeiras publicadas passa por aqui na primeira meia hora.
  it("abaixo de 2 cadeiras por arco, o número de arcos encolhe — e nenhum arco fica vazio", () => {
    for (let n = 1; n < 2 * ARCOS_PADRAO; n++) {
      const arcos = arcosPara(n);
      expect(arcos, `n=${n}`).toBeLessThanOrEqual(ARCOS_PADRAO);
      expect(arcos, `n=${n}`).toBeGreaterThanOrEqual(1);
      const dist = assentosPorArco(n, arcos);
      expect(
        dist.filter((s) => s === 0),
        `n=${n}: arco vazio em ${dist.join(",")}`,
      ).toEqual([]);
    }
  });
});

describe("hemiciclo — determinismo (constituição § 6)", () => {
  // 🔴 MUTAÇÃO: qualquer `Math.random()` na geometria, ou qualquer dependência
  // de relógio. Também morre se o desempate do resto (`índice de arco
  // crescente`) ou o da varredura (`arco` depois de θ) for removido: sem eles
  // a `sort` deixa de ser total e o resultado passa a depender do algoritmo de
  // ordenação da engine.
  it("mesmo N ⇒ mesmo layout, campo a campo", () => {
    for (const n of [7, 100, 513, 531]) {
      expect(JSON.stringify(layoutHemiciclo(n)), `n=${n}`).toBe(JSON.stringify(layoutHemiciclo(n)));
    }
  });

  it("as coordenadas são estáveis e finitas — 3 casas, sem NaN", () => {
    for (const a of layoutHemiciclo(513).assentos) {
      expect(Number.isFinite(a.cx) && Number.isFinite(a.cy)).toBe(true);
      // No máximo 3 casas na representação decimal — é ela que vai para o
      // atributo do SVG, e é ela que precisa ser idêntica entre plataformas.
      // (Multiplicar por 1000 e comparar com o inteiro NÃO serve: `16.246 *
      // 1000` dá `16245.999999999998` em IEEE-754, e o teste reprovaria código
      // correto.)
      for (const v of [a.cx, a.cy]) {
        expect(String(v), `casas decimais demais em ${v}`).toMatch(/^-?\d+(\.\d{1,3})?$/);
      }
    }
  });

  it("a varredura vai da ESQUERDA para a DIREITA, sem exceção", () => {
    // É o que faz cada agremiação ocupar uma cunha contígua. Se a ordenação
    // inverter ou se perder o desempate, as cunhas se espalham pelo desenho.
    const { assentos, width } = layoutHemiciclo(513);
    const primeiro = assentos[0] as { cx: number };
    const ultimo = assentos[assentos.length - 1] as { cx: number };
    expect(primeiro.cx).toBeLessThan(width / 2);
    expect(ultimo.cx).toBeGreaterThan(width / 2);
    for (let i = 1; i < assentos.length; i++) {
      expect((assentos[i] as { i: number }).i).toBe(i);
    }
  });
});

describe("hemiciclo — a forma do arco", () => {
  it("os raios são igualmente espaçados, do interno ao externo", () => {
    const raios = raiosDosArcos(ARCOS_PADRAO);
    const passos = raios.slice(1).map((r, i) => r - (raios[i] as number));
    for (const p of passos) expect(p).toBeCloseTo(passos[0] as number, 9);
    expect(raios[0]).toBeLessThan(raios[raios.length - 1] as number);
  });

  it("arco externo comporta mais cadeiras que o interno", () => {
    const dist = assentosPorArco(513, ARCOS_PADRAO);
    expect(dist[dist.length - 1]).toBeGreaterThan(dist[0] as number);
  });

  it("nenhum assento sai da caixa do viewBox", () => {
    const { assentos, width, height, raioAssento } = layoutHemiciclo(513);
    for (const a of assentos) {
      expect(a.cx - raioAssento).toBeGreaterThanOrEqual(0);
      expect(a.cx + raioAssento).toBeLessThanOrEqual(width);
      expect(a.cy - raioAssento).toBeGreaterThanOrEqual(0);
      expect(a.cy + raioAssento).toBeLessThanOrEqual(height);
    }
  });
});
