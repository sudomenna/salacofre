// @vitest-environment happy-dom
/**
 * tests/unit/components/ChancesPanel.test.tsx
 *
 * S07/Bloco 2 — o painel de chances, primeiro consumidor do átomo
 * `<ProbabilityMeter />`.
 *
 * O que estes testes fixam é a regra central do componente: **um medidor só
 * existe quando o campo correspondente existe no payload**. O protótipo do kit
 * calcula as duas probabilidades no browser com uma normal e um sigma
 * inventados; aqui elas vêm prontas do bootstrap do orchestrator, e a ausência
 * do campo é um estado legítimo — não um zero.
 *
 * Renderização por `renderToStaticMarkup`: Server Component puro, sem estado.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChancesPanel } from "@/components/blocks/ChancesPanel";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function meters(doc: Document): Element[] {
  return [...doc.querySelectorAll('[role="meter"]')];
}

describe("<ChancesPanel />", () => {
  it("(a) com os dois campos do payload nacional, desenha os dois medidores do protótipo", () => {
    const doc = parse(
      <ChancesPanel
        pSegundoTurno={0.65}
        liderNome="Candidato PT"
        liderPFecha1t={0.05}
        liderPctProjetado={43.2}
        pctApurado={23.4}
      />,
    );

    const m = meters(doc);
    expect(m).toHaveLength(2);
    expect(m[0]?.getAttribute("aria-label")).toBe("Chance de ir ao 2º turno");
    expect(m[0]?.getAttribute("aria-valuenow")).toBe("65");
    expect(m[1]?.getAttribute("aria-label")).toBe("Candidato PT vence no 1º turno");
    expect(m[1]?.getAttribute("aria-valuenow")).toBe("5");
  });

  it("(b) sem `p_fecha_1t`, o segundo medidor cai na probabilidade da agulha e diz isso", () => {
    const doc = parse(
      <ChancesPanel
        liderNome="Tarcísio"
        liderPVitoria={0.7}
        liderPctProjetado={52}
        pctApurado={62}
        escopo="SP"
      />,
    );

    const m = meters(doc);
    // Só um: `p_segundo_turno_overall` não existe no payload de UF.
    expect(m).toHaveLength(1);
    expect(m[0]?.getAttribute("aria-label")).toBe("Tarcísio vence em SP");
    expect(m[0]?.getAttribute("aria-valuenow")).toBe("70");

    // Constituição § 8 — a nota diz de onde o número vem e o que falta.
    const nota = doc.querySelector('[data-testid="probability-meter-note"]')?.textContent ?? "";
    expect(nota).toContain("Projeção 52,0%");
    expect(nota).toContain("62,0% apurado");
    expect(nota).toContain("posiciona a agulha");
  });

  it("(c) `p_fecha_1t` vence `p_vitoria` — as duas leituras nunca aparecem juntas", () => {
    const doc = parse(
      <ChancesPanel
        liderNome="Candidato PT"
        liderPFecha1t={0.4}
        liderPVitoria={0.9}
        pctApurado={50}
        escopo="SP"
      />,
    );

    const m = meters(doc);
    expect(m).toHaveLength(1);
    expect(m[0]?.getAttribute("aria-label")).toBe("Candidato PT vence no 1º turno");
    expect(m[0]?.getAttribute("aria-valuenow")).toBe("40");
  });

  it("(d) sem nenhum campo, o painel inteiro sai do DOM (nada de filete órfão)", () => {
    const html = renderToStaticMarkup(
      <ChancesPanel liderNome="Candidato PT" pctApurado={0} pSegundoTurno={null} />,
    );
    expect(html).toBe("");
  });

  it("(e) todo medidor sai com nota — regra editorial do kit e constituição § 8", () => {
    const doc = parse(
      <ChancesPanel
        pSegundoTurno={0.65}
        liderNome="Candidato PT"
        liderPFecha1t={0.05}
        pctApurado={23.4}
      />,
    );
    const notas = doc.querySelectorAll('[data-testid="probability-meter-note"]');
    expect(notas).toHaveLength(meters(doc).length);
    for (const n of notas) {
      expect((n.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
  });

  it("(f) o preenchimento nunca usa cor de partido (constituição § 2 / ADR-0024)", () => {
    const html = renderToStaticMarkup(
      <ChancesPanel pSegundoTurno={0.65} liderNome="Candidato PT" pctApurado={23.4} />,
    );
    expect(html).toContain("var(--accent-strong)");
    expect(html).not.toMatch(/var\(--party-/);
    expect(html).not.toMatch(/var\(--color-cand-/);
  });

  it("(g) valores fora de [0, 1] e NaN não vazam para o medidor", () => {
    const doc = parse(<ChancesPanel pSegundoTurno={1.4} pctApurado={10} />);
    expect(meters(doc)[0]?.getAttribute("aria-valuenow")).toBe("100");

    const nan = renderToStaticMarkup(<ChancesPanel pSegundoTurno={Number.NaN} pctApurado={10} />);
    // NaN não é dado: o painel some, em vez de anunciar 0%.
    expect(nan).toBe("");
  });
});
