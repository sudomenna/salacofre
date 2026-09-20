// @vitest-environment happy-dom
/**
 * tests/unit/components/MunicipioTable.ordem.test.tsx
 *
 * A **ordem** da lista de municípios (RF-037). A paginação está em
 * `MunicipioTable.test.tsx`.
 *
 * Sucessor de `MunicipioTable.topByEleitorado.test.tsx`, apagado em 2026-09-20
 * junto com o modo que ele cobria. Três casos daquele arquivo vieram inteiros
 * porque o que eles fixam não mudou — o empate estável, o subtítulo do
 * eleitorado e, sobretudo, a **verdade de MG** (o caso que provou o conserto do
 * colapso zona↔município). Um caso veio INVERTIDO: a capital deixou de ir para
 * o topo. Outro veio VIRADO DO AVESSO: município sem eleitorado deixou de ser
 * descartado.
 *
 * ## As duas regras que este arquivo existe para travar
 *
 *  1. **Eleitorado decrescente, puro.** O dono pediu "os 20 maiores municípios
 *     em número de eleitores". Ordenar por nome, por código ou pela ordem do
 *     payload reprova aqui.
 *  2. **Ninguém some.** `EdgeUfMunicipio.eleitores` é opcional (ADR-0035 D2).
 *     O modo antigo fazia `filter(r => r.eleitorado != null)`, e diante de um
 *     payload legado isso trocava "todos os municípios" por "nenhum município".
 *     Voltar com aquele filtro reprova aqui.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  type MunicipioRow,
  MunicipioTable,
  ordenarPorEleitorado,
} from "@/components/blocks/MunicipioTable";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function mkRow(over: Partial<MunicipioRow> & { nome: string }): MunicipioRow {
  return {
    cod_ibge: over.cod_ibge ?? `31${over.nome.length}${over.nome.charCodeAt(0)}`,
    lider: 13,
    liderCor: "var(--color-cand-1)",
    liderNome: "Lula",
    margemPp: 5,
    pctApurado: 100,
    votosReportados: 1000,
    ...over,
  };
}

/**
 * Primeiro filho da célula de município = a `NomeCell` (nome + kicker da
 * capital). O subtítulo do eleitorado é o irmão seguinte, e ficaria colado no
 * nome se lêssemos o `textContent` da `<td>` inteira.
 */
function nomesRenderizados(doc: Document): string[] {
  return [...doc.querySelectorAll("tbody tr")].map((tr) =>
    (tr.querySelector("td")?.firstElementChild?.textContent ?? "").trim(),
  );
}

function soNomes(doc: Document): string[] {
  return nomesRenderizados(doc).map((t) => t.split("·")[0]?.trim() ?? "");
}

describe("ordenarPorEleitorado()", () => {
  it("(a) 🔴 ordena por eleitorado decrescente", () => {
    // Mutação que morre aqui: comparar `a.nome`/`b.nome` (ou qualquer outro
    // campo) em vez de `eleitorado`. A ordem de ENTRADA é alfabética crescente
    // de propósito — ordenar por nome devolveria a entrada intacta e passaria
    // se este teste medisse só "mudou alguma coisa".
    const ordem = ordenarPorEleitorado([
      mkRow({ nome: "Aaa", eleitorado: 10 }),
      mkRow({ nome: "Bbb", eleitorado: 300 }),
      mkRow({ nome: "Ccc", eleitorado: 200 }),
    ]).map((r) => r.nome);
    expect(ordem).toEqual(["Bbb", "Ccc", "Aaa"]);
  });

  it("(b) 🔴 município SEM eleitorado vai para o fim — nunca para fora", () => {
    // Mutação que morre aqui: devolver o `filter(r => r.eleitorado != null)`.
    const entrada = [
      mkRow({ nome: "Sem dado" }),
      mkRow({ nome: "Grande", eleitorado: 900 }),
      mkRow({ nome: "Pequeno", eleitorado: 100 }),
      mkRow({ nome: "Sem dado 2" }),
    ];
    const saida = ordenarPorEleitorado(entrada);
    expect(saida.map((r) => r.nome)).toEqual(["Grande", "Pequeno", "Sem dado", "Sem dado 2"]);
    expect(saida).toHaveLength(entrada.length);
  });

  it("(c) 🔴 NENHUM com eleitorado: ordem de origem, lista inteira, nunca vazia", () => {
    const entrada = [mkRow({ nome: "Um" }), mkRow({ nome: "Dois" }), mkRow({ nome: "Três" })];
    const saida = ordenarPorEleitorado(entrada);
    expect(saida.map((r) => r.nome)).toEqual(["Um", "Dois", "Três"]);
    expect(saida).toHaveLength(3);
  });

  it("(d) empate preserva a ordem de entrada (sort estável, ES2019+)", () => {
    const saida = ordenarPorEleitorado([
      mkRow({ nome: "Primeiro", eleitorado: 50_000 }),
      mkRow({ nome: "Segundo", eleitorado: 50_000 }),
      mkRow({ nome: "Terceiro", eleitorado: 50_000 }),
    ]);
    expect(saida.map((r) => r.nome)).toEqual(["Primeiro", "Segundo", "Terceiro"]);
  });

  it("(e) eleitorado 0 é um número, e um número não é ausência", () => {
    // `0` é falsy: uma guarda escrita como `if (r.eleitorado)` mandaria um
    // município de eleitorado zero para o balde dos "sem dado". A guarda é
    // `typeof === "number" && Number.isFinite`.
    const saida = ordenarPorEleitorado([
      mkRow({ nome: "Sem dado" }),
      mkRow({ nome: "Zerado", eleitorado: 0 }),
      mkRow({ nome: "Cheio", eleitorado: 5 }),
    ]);
    expect(saida.map((r) => r.nome)).toEqual(["Cheio", "Zerado", "Sem dado"]);
  });

  it("(f) a lista nunca encolhe, em nenhuma combinação", () => {
    const entrada = [
      mkRow({ nome: "A", eleitorado: 3 }),
      mkRow({ nome: "B" }),
      mkRow({ nome: "C", eleitorado: 1 }),
      mkRow({ nome: "D" }),
      mkRow({ nome: "E", eleitorado: 2 }),
    ];
    expect(ordenarPorEleitorado(entrada)).toHaveLength(entrada.length);
  });
});

describe("<MunicipioTable /> — a ordem que chega à tela", () => {
  it("(g) 🔴 a capital NÃO vai mais para o topo — quem manda é o eleitorado", () => {
    // A regra "capital sempre em primeiro" (decisão E4, 11/09) foi revogada em
    // 2026-09-20: o dono pediu os maiores POR ELEITORES, e uma capital pequena
    // no topo desmentiria o título da lista. O caso é o mesmo de TO que o
    // arquivo antigo usava, com o resultado invertido de propósito.
    const doc = parse(
      <MunicipioTable
        rows={[
          mkRow({ nome: "Araguaína", eleitorado: 120_000 }),
          mkRow({ nome: "Palmas", eleitorado: 90_000, capital: true }),
          mkRow({ nome: "Gurupi", eleitorado: 60_000 }),
        ]}
      />,
    );
    const nomes = nomesRenderizados(doc);

    expect(nomes[0]).toContain("Araguaína");
    expect(nomes[1]).toContain("Palmas");
    expect(nomes[2]).toContain("Gurupi");

    // O que a capital NÃO perdeu: a identidade. O kicker continua, e só nela.
    expect(nomes[1]).toContain("· capital");
    expect(doc.querySelectorAll('[data-testid="municipio-capital"]')).toHaveLength(1);
  });

  it("(h) 🔴 município sem eleitorado aparece na tela, no fim da lista", () => {
    const doc = parse(
      <MunicipioTable
        rows={[
          mkRow({ nome: "Sem eleitorado" }),
          mkRow({ nome: "Com eleitorado", eleitorado: 1000 }),
        ]}
      />,
    );
    expect(soNomes(doc)).toEqual(["Com eleitorado", "Sem eleitorado"]);
    // O que o modo antigo fazia: sumir com a linha inteira.
    expect(doc.body.textContent ?? "").toContain("Sem eleitorado");
    // E o subtítulo só existe onde há número — nada de "0 eleitores" inventado.
    expect(doc.querySelectorAll('[data-testid="municipio-sub"]')).toHaveLength(1);
  });

  it("(i) 🔴 payload legado (ninguém tem eleitorado): lista completa e a legenda explica", () => {
    // Era o estado REAL em produção até 11/09, e continua alcançável: Blob
    // gravado antes da migration 0006 é válido e não traz `eleitores`. O modo
    // antigo devolvia "(0)" e um `<tbody>` vazio.
    const doc = parse(
      <MunicipioTable
        rows={[
          mkRow({ nome: "São Paulo", cod_ibge: "3550308" }),
          mkRow({ nome: "Campinas", cod_ibge: "3509502" }),
        ]}
      />,
    );
    expect(doc.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(soNomes(doc)).toEqual(["São Paulo", "Campinas"]);
    expect(doc.querySelector("h3")?.textContent).toContain("2");
    expect(doc.querySelector('[data-testid="municipios-ordem"]')?.textContent).toContain(
      "não publica o eleitorado por município",
    );
  });

  it("(j) com eleitorado em todos, a legenda declara a ordem", () => {
    const doc = parse(<MunicipioTable rows={[mkRow({ nome: "Uberaba", eleitorado: 238_276 })]} />);
    expect(doc.querySelector('[data-testid="municipios-ordem"]')?.textContent).toContain(
      "do maior para o menor",
    );
  });

  it("(k) com eleitorado em parte, a legenda avisa onde ficam os outros", () => {
    const doc = parse(
      <MunicipioTable
        rows={[mkRow({ nome: "Uberaba", eleitorado: 238_276 }), mkRow({ nome: "Sem dado" })]}
      />,
    );
    expect(doc.querySelector('[data-testid="municipios-ordem"]')?.textContent).toContain(
      "ficam no fim da lista",
    );
  });

  it("(l) subtítulo do eleitorado, em pt-BR", () => {
    const doc = parse(
      <MunicipioTable
        rows={[mkRow({ nome: "Uberaba", eleitorado: 238_276, pctApurado: 54.47 })]}
      />,
    );
    expect(doc.querySelector('[data-testid="municipio-sub"]')?.textContent).toBe(
      "238.276 eleitores",
    );
    // O percentual apurado é COLUNA, não subtítulo — e continua arredondando
    // para uma casa, agora com a VÍRGULA do pt-BR (2026-09-20). O `not` é o
    // que impede a volta do ponto decimal passar despercebida aqui.
    expect(doc.body.textContent ?? "").toContain("54,5%");
    expect(doc.body.textContent ?? "").not.toContain("54.5%");
  });

  /**
   * Critério (iv) do plano de 11/09, e a razão de toda aquela frente de
   * trabalho — preservado inteiro do arquivo antigo.
   *
   * Até a migration 0006 a tabela `zonas` guardava UM município por zona
   * (`MIN(cod_municipio_tse)`), então o eleitorado de 1.636 zonas
   * multi-município caía inteiro no município de menor código. O painel de MG
   * saía com Montes Claros 63 mil eleitores menor, e **Uberaba (7º) e
   * Governador Valadares (9º) simplesmente não apareciam** — cediam lugar a
   * Sete Lagoas e Santa Luzia
   * (`docs/_meta/diagnostico-colapso-zona-municipio-2026-09-10.md:75-88`).
   *
   * Os números são a coluna "Verdade" daquele diagnóstico — soma exata dos
   * pares município×zona do cadastro do TSE, sem rateio (ADR-0035 D2). Entram
   * FORA de ordem de propósito: quem ordena é o componente.
   */
  const MG_VERDADE: Array<[string, number, boolean?]> = [
    ["Governador Valadares", 198_486],
    ["Contagem", 459_110],
    ["Ipatinga", 180_396],
    ["Belo Horizonte", 1_992_984, true],
    ["Uberaba", 238_276],
    ["Betim", 297_070],
    ["Sete Lagoas", 152_319],
    ["Uberlândia", 530_871],
    ["Ribeirão das Neves", 213_114],
    ["Montes Claros", 277_710],
    ["Juiz de Fora", 390_203],
    ["Santa Luzia", 141_158],
  ];

  it("(m) MG: a ordem é a do cadastro real — Uberaba em 7º, G. Valadares em 9º", () => {
    const rows = MG_VERDADE.map(([nome, eleitorado, capital]) =>
      mkRow({ nome, eleitorado, capital }),
    );
    // `inicial={10}` para medir as dez primeiras posições de uma vez; a
    // paginação em si é do outro arquivo.
    const doc = parse(<MunicipioTable rows={rows} inicial={10} />);

    expect(soNomes(doc)).toEqual([
      "Belo Horizonte",
      "Uberlândia",
      "Contagem",
      "Juiz de Fora",
      "Betim",
      "Montes Claros",
      "Uberaba",
      "Ribeirão das Neves",
      "Governador Valadares",
      "Ipatinga",
    ]);

    // Belo Horizonte lidera por ELEITORADO (1.992.984, o maior de MG), e não
    // por ser capital — o que (g) prova com uma UF onde os dois discordam.
    const texto = doc.body.textContent ?? "";
    expect(texto).toContain("238.276 eleitores");
    expect(texto).toContain("198.486 eleitores");
    expect(texto).toContain("277.710 eleitores");
    // E o que a tabela velha listava por engano nessas posições — as duas
    // seguem no DOM, agora nas posições 11 e 12, fora desta primeira leva.
    expect(soNomes(doc)).not.toContain("Sete Lagoas");
    expect(soNomes(doc)).not.toContain("Santa Luzia");
  });
});
