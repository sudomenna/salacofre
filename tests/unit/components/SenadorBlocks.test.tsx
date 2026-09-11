// @vitest-environment happy-dom
/**
 * tests/unit/components/SenadorBlocks.test.tsx
 *
 * Os dois blocos que a spec 016 estendeu sem criar componente novo:
 *
 *   - `<ChancesPanel eleitos>` — RF-103. A pergunta do medidor deixa de ser
 *     "quem vence" e passa a ser "quem se elege", que numa corrida de duas
 *     vagas é outra pergunta, com outra resposta.
 *   - `<ForecastTransparency granularidade cadenciaMinutos>` — RF-108. Os
 *     dois fatos que o leitor não tem como inferir da tela: a projeção é em
 *     nível de estado (não zona a zona) e muda a cada 5 minutos.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChancesPanel } from "@/components/blocks/ChancesPanel";
import { ForecastTransparency } from "@/components/blocks/ForecastTransparency";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

const ELEITOS = [
  { id: 1, nome: "Ana Lima", p: 0.97, pctProjetado: 40 },
  { id: 2, nome: "Bruno Reis", p: 0.61, pctProjetado: 30 },
  { id: 3, nome: "Célia Mota", p: 0.42, pctProjetado: 29 },
];

describe("<ChancesPanel eleitos /> — RF-103", () => {
  it("(a) um medidor por candidatura, com o rótulo de ELEIÇÃO, não de vitória", () => {
    const doc = parse(<ChancesPanel eleitos={ELEITOS} escopo="SP" pctApurado={62} vagas={2} />);
    const texto = doc.body.textContent ?? "";

    expect(doc.querySelectorAll("[role='meter']").length).toBe(3);
    expect(texto).toContain("Ana Lima se elege em SP");
    expect(texto).toContain("Célia Mota se elege em SP");
    // "vence" pressupõe uma vaga; aqui elegem-se duas.
    expect(texto).not.toMatch(/ana lima vence/i);
  });

  it("(b) a nota diz de onde vem o número e sobre quantas vagas (constituição § 8)", () => {
    const doc = parse(<ChancesPanel eleitos={ELEITOS} escopo="SP" pctApurado={62} vagas={2} />);
    const texto = doc.body.textContent ?? "";

    expect(texto).toMatch(/reamostragens/i);
    expect(texto).toContain("entre os 2 primeiros");
  });

  it("(c) `p_eleito` some os medidores de 2º turno — cargo de turno único", () => {
    // Se um caller passar os dois, o de 2º turno não pode aparecer: Senador
    // não tem segundo turno, e o medidor inventaria um evento inexistente.
    const doc = parse(
      <ChancesPanel eleitos={ELEITOS} pSegundoTurno={0.8} pctApurado={62} vagas={2} />,
    );
    expect(doc.body.textContent).not.toMatch(/2º turno/i);
    expect(doc.querySelectorAll("[role='meter']").length).toBe(3);
  });

  it("(d) sem `eleitos`, o painel volta ao comportamento anterior", () => {
    const doc = parse(<ChancesPanel liderNome="Ana" pSegundoTurno={0.8} pctApurado={62} />);
    expect(doc.body.textContent).toMatch(/2º turno/i);
  });

  it("(e) candidatura sem `p_eleito` numérico não vira medidor de 0%", () => {
    const doc = parse(
      <ChancesPanel
        eleitos={[
          { id: 1, nome: "Ana", p: 0.9 },
          { id: 2, nome: "Bruno", p: Number.NaN },
        ]}
        pctApurado={10}
        vagas={2}
      />,
    );
    expect(doc.querySelectorAll("[role='meter']").length).toBe(1);
  });
});

describe("<ForecastTransparency /> — RF-108", () => {
  it("(f) declara nível de estado e cadência, em texto e sem clique", () => {
    const doc = parse(
      <ForecastTransparency cadenciaMinutos={5} granularidade="uf" pctApurado={40} variant="uf" />,
    );
    const nota = doc.querySelector("[data-testid='forecast-cadencia']")?.textContent ?? "";

    expect(nota).toMatch(/nível do estado/i);
    expect(nota).toMatch(/não um por zona eleitoral/i);
    expect(nota).toContain("a cada 5 minutos");
    // Nada de `<details>`/`title`: a aceitação diz "legível sem clique".
    expect(doc.querySelector("details")).toBeNull();
  });

  it("(g) explica por que não há mapa de municípios neste cargo", () => {
    const doc = parse(
      <ForecastTransparency cadenciaMinutos={5} granularidade="uf" pctApurado={40} />,
    );
    expect(doc.body.textContent).toMatch(/mapa de munic/i);
  });

  it("(h) em granularidade de zona o bloco não diz nada de novo", () => {
    // Contraprova: as rotas de Presidente e Governador não podem ganhar uma
    // frase nova por efeito colateral.
    const doc = parse(<ForecastTransparency granularidade="zona" pctApurado={40} />);
    expect(doc.querySelector("[data-testid='forecast-cadencia']")).toBeNull();
  });

  it("(i) sem as props novas, o bloco é idêntico ao de antes", () => {
    const antes = renderToStaticMarkup(<ForecastTransparency pctApurado={40} variant="uf" />);
    const depois = renderToStaticMarkup(
      <ForecastTransparency granularidade={undefined} pctApurado={40} variant="uf" />,
    );
    expect(depois).toBe(antes);
  });

  it("(j) cadência de 1 minuto sai no singular", () => {
    const doc = parse(<ForecastTransparency cadenciaMinutos={1} pctApurado={40} />);
    expect(doc.querySelector("[data-testid='forecast-cadencia']")?.textContent).toContain(
      "a cada 1 minuto.",
    );
  });
});
