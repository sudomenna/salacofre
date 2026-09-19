// @vitest-environment happy-dom
/**
 * tests/unit/components/camara-hemiciclo-peso.test.tsx
 *
 * 🔴 **O gate que faltava.** Os três orçamentos de RNF-007
 * (`tests/e2e/perf-budget.spec.ts`) somam `request.resourceType() === "script"`.
 * O hemiciclo é zero JavaScript — ele é **invisível** para os três. O custo
 * dele é HTML: uma bolinha por cadeira, ~513 elementos `<circle>`, servidos em
 * toda visita a `/deputado-federal`.
 *
 * Um widget sem gate é um widget que cresce sem ninguém ver. O `perf-budget`
 * ganhou um caso que mede o corpo do documento, mas ele depende de um servidor
 * de pé; este arquivo mede o markup **determinístico** do componente e roda em
 * todo `pnpm test`. É o que de fato morde num PR.
 *
 * Medições de 2026-09-18 (`renderToStaticMarkup`, UTF-8, sem compressão):
 *
 *   - hemiciclo com 513 cadeiras .... 28.333 B
 *   - hemiciclo com 531 cadeiras .... 29.462 B
 *   - grade das 27 UFs, sem bandeira  24.110 B
 *   - `<main>` inteiro da rota ...... 91.124 B
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CamaraHemiciclo } from "@/components/blocks/CamaraHemiciclo";
import type { EdgeBancadaNacional } from "@/lib/edge-config/types";
import depSim from "@/tests/fixtures/simulacao/deputado.json" with { type: "json" };

const KIB = 1024;

/**
 * Teto do hemiciclo no pior caso coberto (531 cadeiras), em bytes de markup.
 *
 * ⚠️ 2026-09-19: 531 **não é o número da eleição de 2026** e não está por vir — o
 * PLP 177/2023 foi vetado em julho/2025 e o STF manteve as 513 (ADR-0049, emenda).
 * O teto continua calibrado em 531 de propósito: um orçamento medido acima do N
 * real dá margem sem afrouxar o gate, e as duas regressões abaixo aparecem do
 * mesmo jeito com 513.
 *
 * 36 KiB é folga de ~25% sobre os 29.462 B medidos — e é apertado o bastante
 * para pegar as duas regressões que realmente aconteceriam:
 *
 *   1. **perder o agrupamento por `<g>`** e repetir `fill`/`stroke`/
 *      `stroke-width` em cada `<circle>`: ~+70 B × 531 ≈ +37 KB;
 *   2. **dar um `<title>` a cada cadeira** (a "melhoria" óbvia para tooltip):
 *      ~+40 B × 531 ≈ +21 KB — e de quebra 531 tooltips que o leitor de tela
 *      teria de atravessar.
 */
const TETO_HEMICICLO_BYTES = 36 * KIB;

function bytes(markup: string): number {
  return Buffer.byteLength(markup, "utf8");
}

const bancadaSim = (depSim as unknown as { bancada: EdgeBancadaNacional }).bancada;

describe("CamaraHemiciclo — peso do markup (o gate que o RNF-007 não dá)", () => {
  it("o plenário da fixture cabe no teto", () => {
    const peso = bytes(renderToStaticMarkup(<CamaraHemiciclo bancada={bancadaSim} />));
    expect(peso, `hemiciclo em ${(peso / KIB).toFixed(1)} KiB`).toBeLessThan(TETO_HEMICICLO_BYTES);
  });

  it("o pior caso (531 cadeiras) também cabe", () => {
    const peso = bytes(
      renderToStaticMarkup(<CamaraHemiciclo bancada={{ ...bancadaSim, total_cadeiras: 531 }} />),
    );
    expect(peso, `hemiciclo 531 em ${(peso / KIB).toFixed(1)} KiB`).toBeLessThan(
      TETO_HEMICICLO_BYTES,
    );
  });

  it("🔴 o agrupamento por `<g>` existe, e é ele que segura o peso", () => {
    // Anti-engano: o teto sozinho não discrimina o agrupamento se alguém
    // encolher o desenho por outro caminho. Aqui a estrutura é medida direto —
    // são poucos `<g>` para muitos `<circle>`.
    const markup = renderToStaticMarkup(<CamaraHemiciclo bancada={bancadaSim} />);
    const circles = (markup.match(/<circle/g) ?? []).length;
    const grupos = (markup.match(/<g /g) ?? []).length;

    expect(circles).toBe(bancadaSim.total_cadeiras);
    expect(grupos, "um <g> por cadeira — o agrupamento se perdeu").toBeLessThan(circles / 10);
    // E nenhuma cor repetida dentro do `<circle>`.
    expect(markup).not.toMatch(/<circle[^>]*fill=/);
  });
});
