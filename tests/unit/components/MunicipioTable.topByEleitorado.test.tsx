// @vitest-environment happy-dom
/**
 * tests/unit/components/MunicipioTable.topByEleitorado.test.tsx
 *
 * S06/F4d (Fase 3) — cobre o novo `mode="top-by-eleitorado"` do
 * `<MunicipioTable />`. Default mode coberto em MunicipioTable.test.tsx
 * (intocado — preserva regressão).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { type MunicipioRow, MunicipioTable } from "@/components/blocks/MunicipioTable";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function mkRows(n: number): MunicipioRow[] {
  // Eleitorado decrescente garantido: i=0 tem maior, último tem menor.
  return Array.from({ length: n }, (_, i) => ({
    cod_ibge: `35${String(i).padStart(5, "0")}`,
    nome: `Município ${i + 1}`,
    lider: 13,
    liderCor: "var(--color-cand-1)",
    liderNome: "Lula",
    margemPp: 5,
    pctApurado: 100,
    votosReportados: 1000,
    eleitorado: 1_000_000 - i * 1000,
    deltaVs2022: i % 3 === 0 ? 2.5 : i % 3 === 1 ? -1.4 : null,
  }));
}

describe('<MunicipioTable mode="top-by-eleitorado" />', () => {
  it("(a) renderiza apenas topN municípios (default 15)", () => {
    const doc = parse(<MunicipioTable rows={mkRows(50)} mode="top-by-eleitorado" />);
    const dataRows = doc.querySelectorAll('[data-testid="municipios-top-table"] tbody tr');
    expect(dataRows.length).toBe(15);
  });

  it("(b) topN custom é respeitado", () => {
    const doc = parse(<MunicipioTable rows={mkRows(50)} mode="top-by-eleitorado" topN={5} />);
    const dataRows = doc.querySelectorAll('[data-testid="municipios-top-table"] tbody tr');
    expect(dataRows.length).toBe(5);
  });

  it("(c) ordenação correta: maior eleitorado primeiro", () => {
    const rows = mkRows(20);
    const doc = parse(<MunicipioTable rows={rows} mode="top-by-eleitorado" topN={3} />);
    const firstRow = doc.querySelector('[data-testid="municipios-top-table"] tbody tr:first-child');
    // Município 1 tem eleitorado 1_000_000 (o maior)
    expect(firstRow?.textContent ?? "").toContain("Município 1");
  });

  it("(d) header novo: Eleitorado, Margem, Δ vs 2022", () => {
    const doc = parse(<MunicipioTable rows={mkRows(3)} mode="top-by-eleitorado" />);
    const headers = Array.from(
      doc.querySelectorAll('[data-testid="municipios-top-table"] thead th'),
    ).map((th) => th.textContent ?? "");
    expect(headers).toContain("Município");
    expect(headers).toContain("Eleitorado");
    expect(headers).toContain("Margem");
    expect(headers.some((h) => h.includes("2022"))).toBe(true);
  });

  it("(e) delta=null renderiza como '—'", () => {
    const row: MunicipioRow = {
      cod_ibge: "3550308",
      nome: "São Paulo",
      lider: 13,
      liderCor: "var(--color-cand-1)",
      liderNome: "Lula",
      margemPp: 5,
      pctApurado: 100,
      votosReportados: 1000,
      eleitorado: 9_000_000,
      deltaVs2022: null,
    };
    const doc = parse(<MunicipioTable rows={[row]} mode="top-by-eleitorado" />);
    expect(doc.body.textContent ?? "").toContain("—");
  });

  it("(f) delta positivo tem '+', negativo tem '-'", () => {
    const rows: MunicipioRow[] = [
      {
        cod_ibge: "1",
        nome: "A",
        lider: 13,
        liderCor: "x",
        liderNome: "L",
        margemPp: 5,
        pctApurado: 100,
        votosReportados: 1,
        eleitorado: 2,
        deltaVs2022: 3.2,
      },
      {
        cod_ibge: "2",
        nome: "B",
        lider: 13,
        liderCor: "x",
        liderNome: "L",
        margemPp: 5,
        pctApurado: 100,
        votosReportados: 1,
        eleitorado: 1,
        deltaVs2022: -2.7,
      },
    ];
    const doc = parse(<MunicipioTable rows={rows} mode="top-by-eleitorado" />);
    const text = doc.body.textContent ?? "";
    expect(text).toContain("+3.2pp");
    expect(text).toContain("-2.7pp");
  });

  it("(g) mode default continua funcionando (regressão)", () => {
    const rows: MunicipioRow[] = [
      {
        cod_ibge: "3550308",
        nome: "São Paulo",
        lider: 13,
        liderCor: "var(--color-cand-1)",
        liderNome: "Lula",
        margemPp: 8.2,
        pctApurado: 100,
        votosReportados: 4_213_847,
      },
    ];
    const doc = parse(<MunicipioTable rows={rows} />);
    // Mode default usa header h3 "Municípios (1)" — não "Maiores municípios"
    const h3 = doc.querySelector("h3");
    expect(h3?.textContent ?? "").toContain("Municípios");
    expect(h3?.textContent ?? "").not.toContain("Maiores");
  });

  it("(h) ignora municípios sem campo `eleitorado`", () => {
    const rows: MunicipioRow[] = [
      {
        cod_ibge: "1",
        nome: "Com eleitorado",
        lider: 13,
        liderCor: "x",
        liderNome: "L",
        margemPp: 5,
        pctApurado: 100,
        votosReportados: 1,
        eleitorado: 1000,
      },
      {
        cod_ibge: "2",
        nome: "Sem eleitorado",
        lider: 13,
        liderCor: "x",
        liderNome: "L",
        margemPp: 5,
        pctApurado: 100,
        votosReportados: 1,
        // eleitorado omitido
      },
    ];
    const doc = parse(<MunicipioTable rows={rows} mode="top-by-eleitorado" />);
    const dataRows = doc.querySelectorAll('[data-testid="municipios-top-table"] tbody tr');
    expect(dataRows.length).toBe(1);
    expect(doc.body.textContent ?? "").toContain("Com eleitorado");
    expect(doc.body.textContent ?? "").not.toContain("Sem eleitorado");
  });

  /**
   * Regressão medida em 2026-09-08, e **ainda alcançável** em 2026-09-11:
   * `EdgeUfMunicipio.eleitores` passou a existir (ADR-0035 D2), mas é
   * OPCIONAL — um Blob gravado antes da migration 0006 não traz o campo, e os
   * adaptadores repassam `undefined`. Quando NENHUMA linha tem o dado, o filtro
   * por `eleitorado != null` zera a lista e a tabela sairia só com cabeçalho e
   * "(0)". Neste estado o modo declara a ausência, em texto.
   *
   * O caso simétrico — o campo PRESENTE — está em (j).
   */
  it("(i) sem nenhum eleitorado, declara a ausência em vez de tabela vazia", () => {
    const rows: MunicipioRow[] = [
      {
        cod_ibge: "3550308",
        nome: "São Paulo",
        lider: 13,
        liderCor: "var(--color-cand-1)",
        liderNome: "Lula",
        margemPp: 8.2,
        pctApurado: 100,
        votosReportados: 4_213_847,
        // `eleitorado` ausente — exatamente o que as páginas de UF montam hoje.
      },
    ];
    const doc = parse(<MunicipioTable rows={rows} mode="top-by-eleitorado" />);

    // Nenhuma tabela com cabeçalho e corpo vazio.
    expect(doc.querySelector('[data-testid="municipios-top-table"]')).toBeNull();
    expect(doc.querySelectorAll("tbody tr").length).toBe(0);

    // O leitor recebe o motivo, não um silêncio.
    const vazio = doc.querySelector('[data-testid="municipios-top-empty"]');
    expect(vazio).not.toBeNull();
    expect(vazio?.textContent ?? "").toContain("não é publicado no payload");

    // O título continua sendo o mesmo landmark rotulado (a11y — RNF-023).
    expect(doc.querySelector("h3")?.id).toBe("municipios-top-heading");
  });

  // ===========================================================================
  // 2026-09-11 — o payload passou a publicar `eleitores`/`capital`
  // (ADR-0035 D2), e os adaptadores das duas rotas de UF os repassam. Daqui
  // para baixo, o estado em que o painel EXISTE.
  // ===========================================================================

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
   * capital). O subtítulo é o irmão seguinte, e ficaria colado no nome se
   * lêssemos o `textContent` da `<td>` inteira.
   */
  function nomesRenderizados(doc: Document): string[] {
    return [...doc.querySelectorAll('[data-testid="municipios-top-table"] tbody tr')].map((tr) =>
      (tr.querySelector("td")?.firstElementChild?.textContent ?? "").trim(),
    );
  }

  it("(j) com o campo presente, o painel renderiza — 8 linhas no corte do call site", () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      mkRow({ nome: `Município ${i + 1}`, eleitorado: 1_000_000 - i * 1000 }),
    );
    const doc = parse(<MunicipioTable rows={rows} mode="top-by-eleitorado" topN={8} />);

    expect(doc.querySelector('[data-testid="municipios-top-empty"]')).toBeNull();
    expect(nomesRenderizados(doc)).toHaveLength(8);
  });

  it("(k) a capital vai para o topo mesmo não sendo o maior eleitorado", () => {
    // A ordem de ENTRADA já é decrescente por eleitorado: só a regra da
    // capital pode mover Palmas para a primeira linha.
    const rows = [
      mkRow({ nome: "Araguaína", eleitorado: 120_000 }),
      mkRow({ nome: "Palmas", eleitorado: 90_000, capital: true }),
      mkRow({ nome: "Gurupi", eleitorado: 60_000 }),
    ];
    const doc = parse(<MunicipioTable rows={rows} mode="top-by-eleitorado" topN={8} />);
    const nomes = nomesRenderizados(doc);

    expect(nomes[0]).toContain("Palmas");
    expect(nomes[0]).toContain("· capital");
    expect(nomes[1]).toContain("Araguaína");
    expect(nomes[2]).toContain("Gurupi");
    // Só a capital ganha o kicker.
    expect(doc.querySelectorAll('[data-testid="municipio-capital"]')).toHaveLength(1);
  });

  it("(l) empate em eleitorado preserva a ordem de entrada (sort estável)", () => {
    const rows = [
      mkRow({ nome: "Primeiro", eleitorado: 50_000 }),
      mkRow({ nome: "Segundo", eleitorado: 50_000 }),
      mkRow({ nome: "Terceiro", eleitorado: 50_000 }),
    ];
    const doc = parse(<MunicipioTable rows={rows} mode="top-by-eleitorado" topN={8} />);
    const nomes = nomesRenderizados(doc);

    expect(nomes[0]).toContain("Primeiro");
    expect(nomes[1]).toContain("Segundo");
    expect(nomes[2]).toContain("Terceiro");
  });

  it("(m) subtítulo do protótipo: '<N> eleitores · <X>% apurado'", () => {
    const rows = [mkRow({ nome: "Uberaba", eleitorado: 238_276, pctApurado: 54.47 })];
    const doc = parse(<MunicipioTable rows={rows} mode="top-by-eleitorado" topN={8} />);
    const sub = doc.querySelector('[data-testid="municipio-top-sub"]');

    expect(sub?.textContent).toBe("238.276 eleitores · 54.5% apurado");
  });

  /**
   * Critério (iv) do plano de 11/09, e a razão de toda a frente de trabalho.
   *
   * Até a migration 0006 a tabela `zonas` guardava UM município por zona
   * (`MIN(cod_municipio_tse)`), então o eleitorado de 1.636 zonas
   * multi-município caía inteiro no município de menor código. O painel de MG
   * saía com Montes Claros 63 mil eleitores menor, e **Uberaba (7º) e
   * Governador Valadares (9º) simplesmente não apareciam** — cediam lugar a
   * Sete Lagoas e Santa Luzia
   * (`docs/_meta/diagnostico-colapso-zona-municipio-2026-09-10.md:75-88`).
   *
   * Os números abaixo são a coluna "Verdade" daquele diagnóstico — soma exata
   * dos pares município×zona do cadastro do TSE, sem rateio (ADR-0035 D2).
   * Entram FORA de ordem de propósito: quem ordena é o componente.
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

  it("(n) MG: a ordem é a do cadastro real — Uberaba em 7º, G. Valadares em 9º", () => {
    const rows = MG_VERDADE.map(([nome, eleitorado, capital]) =>
      mkRow({ nome, eleitorado, capital }),
    );
    const doc = parse(<MunicipioTable rows={rows} mode="top-by-eleitorado" topN={10} />);
    const nomes = nomesRenderizados(doc).map((t) => t.split("·")[0]?.trim() ?? "");

    expect(nomes).toEqual([
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

    // O que o colapso zona↔município escondia — agora com o eleitorado certo.
    const texto = doc.body.textContent ?? "";
    expect(texto).toContain("238.276 eleitores");
    expect(texto).toContain("198.486 eleitores");
    expect(texto).toContain("277.710 eleitores");
    // E o que a tabela velha listava por engano nessas posições.
    expect(nomes).not.toContain("Sete Lagoas");
    expect(nomes).not.toContain("Santa Luzia");
  });

  it("(o) no corte real de 8 (decisão E4), Uberaba entra e o 9º fica de fora", () => {
    const rows = MG_VERDADE.map(([nome, eleitorado, capital]) =>
      mkRow({ nome, eleitorado, capital }),
    );
    const doc = parse(<MunicipioTable rows={rows} mode="top-by-eleitorado" topN={8} />);
    const nomes = nomesRenderizados(doc).map((t) => t.split("·")[0]?.trim() ?? "");

    expect(nomes).toHaveLength(8);
    expect(nomes).toContain("Uberaba");
    expect(nomes[7]).toBe("Ribeirão das Neves");
    // Governador Valadares é o 9º colégio real de MG: com topN=8 ele fica
    // legitimamente fora do painel. Aparecer na ORDEM certa é o que (n) fixa;
    // aqui o que se fixa é que o corte é por posição, não por dado perdido.
    expect(nomes).not.toContain("Governador Valadares");
  });
});
