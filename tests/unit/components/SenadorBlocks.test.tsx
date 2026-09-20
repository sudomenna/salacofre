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
 *     a cadência de 5 minutos; e, no modo `uf` (hoje só Deputado Federal),
 *     também que a projeção é em nível de estado.
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

  // ---------------------------------------------------------------------------
  // `eleitosProj` — o elenco acompanha a base ativa (2026-09-20)
  //
  // A escolha de QUAIS candidaturas entram é de quem chama (a página recorta
  // `vagas + 1` em cada ordenação). O que se mede aqui é o contrato do painel:
  // elencos iguais ⇒ DOM idêntico ao de antes; diferentes ⇒ os dois no DOM sob
  // `data-view-only`, que é o que a cascata de `app/globals.css` sabe resolver
  // sem uma linha de JavaScript.
  // ---------------------------------------------------------------------------
  const PROJ = [
    { id: 1, nome: "Ana Lima", p: 0.97, pctProjetado: 40 },
    { id: 2, nome: "Bruno Reis", p: 0.61, pctProjetado: 30 },
    { id: 4, nome: "Davi Nunes", p: 0.13, pctProjetado: 29 },
  ];

  it("(e2) elencos iguais nas duas bases: um grupo só, sem invólucro de base", () => {
    // O caso comum, e a razão de o custo em nós ser zero quase sempre. Também
    // é a contraprova de (e3): sem ele, um painel que SEMPRE duplicasse
    // passaria naquele teste.
    const comProj = renderToStaticMarkup(
      <ChancesPanel
        eleitos={ELEITOS}
        eleitosProj={[...ELEITOS]}
        escopo="SP"
        pctApurado={62}
        vagas={2}
      />,
    );
    const semProj = renderToStaticMarkup(
      <ChancesPanel eleitos={ELEITOS} escopo="SP" pctApurado={62} vagas={2} />,
    );

    expect(comProj).toBe(semProj);
    expect(
      new DOMParser().parseFromString(comProj, "text/html").querySelectorAll("[data-view-only]")
        .length,
    ).toBe(0);
  });

  it("(e3) elencos diferentes: os dois no DOM, cada um sob a sua base", () => {
    const doc = parse(
      <ChancesPanel eleitos={ELEITOS} eleitosProj={PROJ} escopo="SP" pctApurado={62} vagas={2} />,
    );
    const parcial = doc.querySelector("[data-view-only='parcial']");
    const proj = doc.querySelector("[data-view-only='proj']");

    expect(parcial?.textContent).toContain("Célia Mota se elege em SP");
    expect(parcial?.textContent).not.toContain("Davi Nunes");
    expect(proj?.textContent).toContain("Davi Nunes se elege em SP");
    expect(proj?.textContent).not.toContain("Célia Mota");

    // 🔴 O atributo mora num `<div>` NU. Numa `.grid` ele teria de vencer a
    // utilitária de display na cascata — corrida que o cabeçalho do arquivo
    // recusa explicitamente, e que nenhum teste de texto pegaria.
    expect(parcial?.className).toBe("");
    expect(proj?.className).toBe("");
  });

  it("(e4) o filtro de `p` vale nas DUAS bases — nem zero, nem medidor órfão", () => {
    const doc = parse(
      <ChancesPanel
        eleitos={[
          { id: 1, nome: "Ana", p: 0.9 },
          { id: 3, nome: "Célia", p: 0.4 },
        ]}
        eleitosProj={[
          { id: 1, nome: "Ana", p: 0.9 },
          { id: 4, nome: "Davi", p: Number.NaN },
        ]}
        pctApurado={10}
        vagas={2}
      />,
    );

    expect(doc.querySelector("[data-view-only='proj']")?.textContent).not.toContain("Davi");
    expect(doc.querySelectorAll("[data-view-only='proj'] [role='meter']").length).toBe(1);
    expect(doc.querySelectorAll("[data-view-only='parcial'] [role='meter']").length).toBe(2);
    const valores = [...doc.querySelectorAll("[role='meter']")].map((m) =>
      m.getAttribute("aria-valuenow"),
    );
    expect(valores).not.toContain("0");
  });

  it("(e5) ninguém com `p` em nenhuma das bases: o painel inteiro some", () => {
    // A regra de sempre (sem campo, sem medidor; sem nenhum, sem painel),
    // estendida para duas bases. Um `<Panel>` com moldura e nada dentro seria
    // pior que a ausência: o leitor leria o título como promessa.
    const markup = renderToStaticMarkup(
      <ChancesPanel
        eleitos={[{ id: 1, nome: "Ana", p: Number.NaN }]}
        eleitosProj={[{ id: 2, nome: "Bruno", p: Number.NaN }]}
        pctApurado={10}
        vagas={2}
      />,
    );
    expect(markup).toBe("");
  });
});

describe("<ForecastTransparency /> — RF-108", () => {
  it("(f) no MODO uf, declara nível de estado e cadência — sem clique", () => {
    // Este caso exercita o componente com `granularidade="uf"`, que hoje é o
    // modo de Deputado Federal. Senador saiu desse modo em 2026-09-11 (emenda
    // (b) do ADR-0026) e não deve mais receber esta frase — ver o caso (h) de
    // `tests/unit/pages/senador.test.tsx`, que proíbe o texto na tela real.
    const doc = parse(
      <ForecastTransparency cadenciaMinutos={5} granularidade="uf" pctApurado={40} variant="uf" />,
    );
    const nota = doc.querySelector("[data-testid='forecast-cadencia']")?.textContent ?? "";

    expect(nota).toMatch(/nível do estado/i);
    expect(nota).toMatch(/não os de cada zona eleitoral/i);
    // A escolha é NOSSA, não do TSE — ele publica um arquivo por zona para os
    // cinco cargos (`tse_docs/txt/apresentacao-interessados-2026.txt:196`:
    // 6.083 zonas × 5 cargos = 30.415 arquivos). Atribuir a limitação ao TSE
    // seria informação falsa sobre a fonte oficial (constituição § 8).
    expect(nota).toMatch(/escolha nossa/i);
    expect(nota).not.toMatch(/o TSE publica um boletim agregado/i);
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
