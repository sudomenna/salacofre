// @vitest-environment happy-dom
/**
 * tests/unit/components/ProjectionThermometer.test.tsx
 *
 * Unit tests do `<ProjectionThermometer />` — átomo do hero de 1º turno
 * (S07/Fase 2). Cobre a11y do meter, geometria da faixa de IC, marcador do
 * apurado, rótulo do denominador e fallback de cor por rank (ADR-0013).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProjectionThermometer } from "@/components/atoms/bars/ProjectionThermometer";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

/** Props mínimas válidas — cada teste sobrescreve o que interessa. */
function render(over: Partial<React.ComponentProps<typeof ProjectionThermometer>> = {}) {
  return parse(
    <ProjectionThermometer
      id="t-abstencao"
      titulo="Abstenção"
      base="eleitores_instalados"
      cor="var(--color-part-abstencao)"
      corBand="var(--color-part-abstencao-band)"
      pctProjetado={21.4}
      pctLower={19.8}
      pctUpper={23.0}
      pctAtual={20.1}
      {...over}
    />,
  );
}

describe("<ProjectionThermometer />", () => {
  it("(a) expõe role=meter com aria-valuemax = scaleMax e aria-valuenow arredondado", () => {
    const doc = render({ scaleMax: 60, pctProjetado: 43.2 });
    const meter = doc.querySelector('[role="meter"]');
    expect(meter).not.toBeNull();
    expect(meter?.getAttribute("aria-valuemin")).toBe("0");
    expect(meter?.getAttribute("aria-valuemax")).toBe("60");
    expect(meter?.getAttribute("aria-valuenow")).toBe("43");
    // aria-label completo: valor + base + IC + apurado
    const label = meter?.getAttribute("aria-label") ?? "";
    expect(label).toContain("Abstenção");
    expect(label).toContain("dos eleitores das seções instaladas");
    expect(label).toContain("intervalo de");
    expect(label).toContain("apurado");
  });

  it("(b) posiciona a faixa lower→upper em % de scaleMax", () => {
    // scaleMax 60: lower 12 → left 20%; upper 24 → width (24-12)/60 = 20%
    const doc = render({ scaleMax: 60, pctProjetado: 18, pctLower: 12, pctUpper: 24 });
    const band = doc.querySelector('[data-testid="thermometer-band"]');
    const style = band?.getAttribute("style") ?? "";
    expect(style).toContain("left:20%");
    expect(style).toContain("width:20%");
    // tick do projetado: 18/60 = 30%
    const tick = doc.querySelector('[data-testid="thermometer-tick"]');
    expect(tick?.getAttribute("style") ?? "").toContain("left:30%");
  });

  it("(c) pctAtual null → sem marcador de apurado e rodapé 'sem apuração'", () => {
    const doc = render({ pctAtual: null });
    expect(doc.querySelector('[data-testid="thermometer-apurado"]')).toBeNull();
    expect(doc.body.textContent ?? "").toContain("sem apuração");

    const comApurado = render({ pctAtual: 20.1 });
    expect(comApurado.querySelector('[data-testid="thermometer-apurado"]')).not.toBeNull();
    expect(comApurado.body.textContent ?? "").toContain("apurado 20,1%");
  });

  it("(d) rotula o denominador conforme a base", () => {
    const votaveis = render({ base: "votaveis" });
    expect(votaveis.body.textContent ?? "").toContain("% dos votos a votáveis");
    // Nunca "% dos válidos": pvap do TSE é sobre votos a votáveis concorrentes.
    expect(votaveis.body.textContent ?? "").not.toContain("% dos válidos");

    const comparecimento = render({ base: "comparecimento" });
    expect(comparecimento.body.textContent ?? "").toContain("% do comparecimento");

    const instalados = render({ base: "eleitores_instalados" });
    expect(instalados.body.textContent ?? "").toContain("% dos eleitores das seções instaladas");
  });

  it("(e) sem `cor`, deriva a cor do rank (ADR-0013)", () => {
    const doc = render({ cor: undefined, corBand: undefined, rank: 3 });
    const tick = doc.querySelector('[data-testid="thermometer-tick"]');
    expect(tick?.getAttribute("style") ?? "").toContain("var(--color-cand-3)");
    const band = doc.querySelector('[data-testid="thermometer-band"]');
    expect(band?.getAttribute("style") ?? "").toContain("var(--color-cand-band-3)");

    // Sem cor e sem rank → token neutro, nunca hex partidário (constituição § 2).
    const semRank = render({ cor: undefined, corBand: undefined });
    const tickNeutro = semRank.querySelector('[data-testid="thermometer-tick"]');
    expect(tickNeutro?.getAttribute("style") ?? "").toContain("var(--color-cand-other)");
  });

  it("(e2) o número NUNCA usa a cor de preenchimento, nem quando só `cor` vem", () => {
    // Este é o defeito que o axe-core pegou na home em 2026-09-07 (violação
    // `serious`, desktop e mobile): o número grande saía pintado com `cor`, a
    // cor de PREENCHIMENTO do candidato. Em rank 3 isso é `--color-cand-3`
    // (#c97c1f) sobre `--surface-page` (#f3f4f6) = 2,99:1 — abaixo até do piso
    // de 3:1 de texto grande, e muito abaixo dos 4,5:1 do § 4.
    //
    // As três formas de um caller chegar aqui, todas cobertas:
    //   1. `cor` + `rank` (o caminho de <ProjectionThermometers />);
    //   2. só `cor`, no formato do payload (`EdgeCandidate.cor`);
    //   3. nem `cor` nem `rank`.
    const numero = (doc: Document) =>
      doc.querySelector('[data-testid="thermometer-numero"]')?.getAttribute("style") ?? "";

    const comRank = render({ cor: "var(--color-cand-3)", corBand: undefined, rank: 3 });
    expect(numero(comRank)).toContain("var(--color-cand-3-strong)");
    expect(numero(comRank)).not.toContain("color:var(--color-cand-3)");

    // Só `cor`: o rank é recuperado de dentro da própria string do payload
    // (`rankFromColorVar`), então nem esse caller cai no preenchimento.
    const soCor = render({ cor: "var(--color-cand-3)", corBand: undefined });
    expect(numero(soCor)).toContain("var(--color-cand-3-strong)");

    // Sem nada: neutro medido (#6e6e6e, 4,63:1 sobre --surface-page).
    const semNada = render({ cor: undefined, corBand: undefined });
    expect(numero(semNada)).toContain("var(--color-cand-other)");

    // O preenchimento continua sendo `cor` — a correção é no texto, não na
    // identidade visual da faixa/tick.
    expect(
      comRank.querySelector('[data-testid="thermometer-tick"]')?.getAttribute("style"),
    ).toContain("var(--color-cand-3)");
  });

  it("(e3) o caso do axe: rank 3 sem `cor` no payload resolve para a variante -strong", () => {
    // `<ProjectionThermometers />` passa `cor={c.cor ?? colorForRank(rank)}`;
    // quando o payload vem sem `cor`, é este o caminho.
    const doc = render({ cor: undefined, corBand: undefined, rank: 3, pctProjetado: 4.5 });
    const style =
      doc.querySelector('[data-testid="thermometer-numero"]')?.getAttribute("style") ?? "";
    expect(style).toContain("var(--color-cand-3-strong)");
    expect(doc.body.textContent ?? "").toContain("4,5%");
  });

  it("(e4) corTexto explícito vence, e a sigla do partido é o fallback do ADR-0024", () => {
    const explicito = render({
      cor: "var(--color-cand-2)",
      rank: 2,
      corTexto: "var(--color-text)",
    });
    expect(
      explicito.querySelector('[data-testid="thermometer-numero"]')?.getAttribute("style") ?? "",
    ).toContain("var(--color-text)");

    // Sem rank e sem corTexto, a sigla resolve pela paleta de partido — que tem
    // token de texto próprio, medido em ≥ 4,5:1 sobre o papel.
    const porPartido = render({ cor: undefined, corBand: undefined, partido: "PSOL" });
    expect(
      porPartido.querySelector('[data-testid="thermometer-numero"]')?.getAttribute("style") ?? "",
    ).toContain("var(--party-psol-text)");
  });

  it("(f) faz clamp de valores fora de [0, scaleMax]", () => {
    const doc = render({ scaleMax: 50, pctProjetado: 130, pctLower: -20, pctUpper: 400 });
    const meter = doc.querySelector('[role="meter"]');
    expect(meter?.getAttribute("aria-valuenow")).toBe("50");
    const band = doc.querySelector('[data-testid="thermometer-band"]');
    const style = band?.getAttribute("style") ?? "";
    expect(style).toContain("left:0%");
    expect(style).toContain("width:100%");
    expect(
      doc.querySelector('[data-testid="thermometer-tick"]')?.getAttribute("style") ?? "",
    ).toContain("left:100%");
  });

  it("(g) lower === upper → sem faixa e nota 'IC indisponível'", () => {
    const doc = render({ pctProjetado: 14.3, pctLower: 14.3, pctUpper: 14.3, pctAtual: null });
    expect(doc.querySelector('[data-testid="thermometer-band"]')).toBeNull();
    expect(doc.body.textContent ?? "").toContain("IC indisponível");
    expect(doc.querySelector('[role="meter"]')?.getAttribute("aria-label") ?? "").toContain(
      "intervalo de confiança indisponível",
    );
  });

  it("(h) estado aguardando mantém o meter no DOM zerado (ADR-0017)", () => {
    const doc = render({ aguardando: true, pctAtual: null });
    const meter = doc.querySelector('[role="meter"]');
    expect(meter).not.toBeNull();
    expect(meter?.getAttribute("aria-valuenow")).toBe("0");
    expect(meter?.getAttribute("aria-label") ?? "").toContain("aguardando projeção");
    expect(doc.querySelector('[data-testid="thermometer-band"]')).toBeNull();
    expect(doc.querySelector("#t-abstencao")?.getAttribute("data-estado")).toBe("aguardando");
    expect(doc.body.textContent ?? "").toContain("aguardando projeção");
  });
});
