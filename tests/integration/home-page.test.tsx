// @vitest-environment happy-dom
/**
 * tests/integration/home-page.test.tsx
 *
 * Smoke test do `app/page.tsx` — verifica que a home renderiza usando o
 * fixture estável e contém todos os componentes esperados (RF-021..030.6).
 *
 * Não é E2E (sem browser real). Apenas valida a árvore SSR mínima e a
 * presença de signals dos componentes principais — guard contra regressões
 * estruturais (esquecer de mountar um block).
 *
 * Nomes de candidatos são parametrizados via fixture pra evitar acoplamento
 * com nomes específicos (fixture S05 usa "Candidato PT" / "Candidato PL"
 * em vez dos nomes históricos S04 "Lula"/"Bolsonaro").
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HomePage from "@/app/page";
import fixture from "@/tests/fixtures/edge-config/projection-current.json" with { type: "json" };

// Top-2 names do fixture — lidos dinâmicamente pra resistir a renomes.
const FIXTURE_CANDIDATOS = (fixture as { national: { candidatos: Array<{ nome: string }> } })
  .national.candidatos;
const NOME_TOP1 = FIXTURE_CANDIDATOS[0]?.nome ?? "Candidato PT";
const NOME_TOP2 = FIXTURE_CANDIDATOS[1]?.nome ?? "Candidato PL";

describe("HomePage (integration / smoke)", () => {
  it("(a) renderiza e contém o headline com candidatos (top-2 da fixture)", async () => {
    // Server Component async — chamamos manualmente
    const node = await HomePage();
    const html = renderToStaticMarkup(node);

    expect(html).toContain("Apuração Presidencial 2026");
    expect(html).toContain(NOME_TOP1);
    expect(html).toContain(NOME_TOP2);
  });

  it("(b) contém o footer constitucional § 1", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Não oficial");
    expect(html).toContain("TSE");
  });

  it("(c) contém agulha (SVG com aria-label de Forecast nacional)", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Forecast nacional");
  });

  it("(d) contém UFs decisivas e tabela agrupada por margem", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    expect(html).toContain("UFs decisivas");
    expect(html).toContain("Resultados por estado");
    // siglas conhecidas do fixture
    expect(html).toContain(">SP<");
    expect(html).toContain(">MG<");
  });

  it("(e) contém ForecastTransparency (constituição § 8)", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    expect(html).toContain("O que está movendo o forecast");
  });

  it("(f) ApuracaoMeta — timestamp + ufs apuradas", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Apurado");
    expect(html).toContain("/27");
  });

  it("(g) LiveBadge presente", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    expect(html).toContain("AO VIVO");
  });
});
