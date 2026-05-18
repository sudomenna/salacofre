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

  // -------------------------------------------------------------------------
  // S05/F4 — Multi-candidato (Fase 4: pages dispatch + integração)
  // Fixture é 1T (turno=1) com 11 candidatos e P(2T)=0.65 → modo multi-1t.
  // -------------------------------------------------------------------------

  it("(h) TurnoBadge mostra '1º turno' no header (multi-1t)", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    expect(html).toContain("1º turno");
    expect(html).toContain('aria-label="Turno atual: 1º turno"');
  });

  it("(i) RaceTypeIndicator mostra contagem de candidatos em 1T", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    // Fixture S05 tem 11 candidatos com pct >= 0,5% (todos passam o
    // threshold de 0,5% do RaceTypeIndicator em 1T).
    expect(html).toMatch(/Disputa entre \d+ candidatos/);
  });

  it("(j) TwoRoundIndicator renderiza com P(2T)=65% (fixture)", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    // Fixture: p_segundo_turno_overall = 0.65 → 65%, fora do gate trivial
    // (|0.65 − 0.5| > 0.1), então o medidor renderiza.
    expect(html).toContain("65% de chance de ir a 2º turno");
    // `role="meter"` com aria-valuenow=65
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuenow="65"');
  });

  it("(k) CandidateRanking renderiza candidatos rank 3..6", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    // Fixture: rank 3 = Candidato MDB, 4 = PDT, 5 = UNIÃO, 6 = NOVO
    expect(html).toContain("Candidato MDB");
    expect(html).toContain("Candidato PDT");
    expect(html).toContain("Candidato UNIÃO");
    expect(html).toContain("Candidato NOVO");
  });

  it("(l) MinorCandidatesList renderiza rank 7+", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    // Fixture rank 7..11: PTB, UP, PCB, PSTU, DC
    expect(html).toContain("Candidato PTB");
    expect(html).toContain("Candidato UP");
    expect(html).toContain("Candidato DC");
  });

  it("(m) HeadlineScore mode=multi-1t menciona o terceiro candidato no headline", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    // Em multi-1t, o headline vira "X lidera, Z briga pela 2ª vaga".
    // Z é o rank 3 (Candidato MDB no fixture).
    expect(html).toMatch(/lidera, Candidato MDB briga pela 2ª vaga/);
  });

  it("(n) Agulha em variant=national-1t — labels 'Decide 1T' / '2º turno'", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    // Variant `national-1t` deve renderizar polos "2º turno" (esq) e
    // "Decide 1T (lider)" (dir) em vez dos nomes dos top-2.
    expect(html).toContain("2º turno");
    expect(html).toMatch(/Decide 1T \(Candidato PT\)/);
  });
});
