// @vitest-environment happy-dom
/**
 * tests/unit/components/MunicipioTable.votos.test.tsx
 *
 * Os **votos** na lista de municípios (RF-037), e o **orçamento de largura**
 * que decide onde eles cabem. A paginação está em `MunicipioTable.test.tsx`;
 * a ordem, em `MunicipioTable.ordem.test.tsx`.
 *
 * Contexto: em 2026-09-20 03h05 (`d5765c4`) a coluna de votos saiu da tabela
 * sem que ninguém tivesse pedido — foi efeito colateral do corte para três
 * colunas. Este arquivo existe para que ela não possa sair de novo em
 * silêncio, e para que a conta que justifica o formato dela seja executável.
 *
 * ## Como testar largura sem layout
 *
 * ⚠️ `getBoundingClientRect()` devolve **zero** no happy-dom: nada aqui finge
 * medir layout. O que este arquivo faz é outra coisa — ele guarda as medidas
 * REAIS como constantes e confere a ARITMÉTICA do orçamento contra elas.
 *
 * As medidas abaixo foram tomadas em 2026-09-20 no Chromium (Playwright
 * 1.60), com as fontes reais do projeto — os `.woff2` que o `next/font`
 * self-hospeda em `.next/static/media/` — e com `Range.selectNodeContents()`,
 * que mede os GLIFOS. Medir `element.getBoundingClientRect()` mediria a caixa,
 * que inclui o padding, e foi exatamente esse erro que fez a tabela de 03h05
 * ser declarada "sem truncar" quando truncava.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CELULA_PAD_X_PX,
  COL_APURADO_PX,
  COL_MARGEM_PX,
  estadoDosVotos,
  larguraDoNome,
  type MunicipioRow,
  MunicipioTable,
  textoDosVotos,
} from "@/components/blocks/MunicipioTable";

/* ---------------------------------------------------------------------------
 * As medidas. Cada número é um glifo medido, não uma estimativa.
 * ------------------------------------------------------------------------ */

/** `"São Bernardo do Campo"` em Archivo 400 13px (`--text-sm`). */
const SAO_BERNARDO_PX = 143.81;
/** `"São José dos Campos"`, o segundo caso de teste que o dono nomeou. */
const SAO_JOSE_PX = 130.8;
/** `"Campo Grande"` (88,89px) + `gap` de 4px + o kicker `" · capital"` (56,94px). */
const CAPITAL_MAIS_LARGA_PX = 149.83;
/** `"9.322.444 eleitores"` (São Paulo) em JetBrains Mono 400 11px (`--type-data`). */
const SUBTITULO_PIOR_CASO_PX = 125.42;
/** `"54.5%"` em Archivo 400 13px — pior caso da coluna "Apurado". */
const APURADO_PIOR_CASO_PX = 36.88;
/** `"9.322.444"` em JetBrains Mono 11px: o mínimo de uma coluna de votos. */
const NUMERO_DE_VOTOS_PX = 59.42;

/**
 * As larguras REAIS da tabela nas três rotas de estado, medidas a partir do
 * `<AppShellSplit>` (`--container-sidebar: 400px`, `--container-mobile: 430px`)
 * e do padding do `<main>`.
 *
 * 🔴 Repare que a série **não é crescente**. É o fato que derruba qualquer
 * `@media (min-width: …)` para esta tabela: a janela cresce e a tabela
 * encolhe, porque a partir de 960px o conteúdo se muda para a coluna de
 * painéis, que é mais estreita que a moldura mobile.
 */
const TABELA_POR_VIEWPORT = {
  "360 (celular)": 326,
  "430 (celular grande)": 396,
  "768 (tablet retrato)": 380,
  "1440 (desktop, coluna de 400px)": 352,
} as const;

function mkRow(over: Partial<MunicipioRow> & { nome: string }): MunicipioRow {
  return {
    cod_ibge: over.cod_ibge ?? "3548708",
    lider: 13,
    liderCor: "var(--color-cand-1)",
    liderNome: "Lula",
    margemPp: 12.3,
    pctApurado: 54.47,
    eleitorado: 587_412,
    ...over,
  };
}

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function votosDe(doc: Document): string[] {
  return [...doc.querySelectorAll('[data-testid="municipio-votos"]')].map(
    (e) => e.textContent ?? "",
  );
}

/* =========================================================================
 * 1. Os votos existem na tela
 * ====================================================================== */

describe("<MunicipioTable /> — os votos na linha", () => {
  it("(a) 🔴 o número de votos aparece na linha do município", () => {
    // Mutação que morre aqui: apagar a segunda linha do subtítulo, que é o
    // estado em que `d5765c4` deixou a tabela.
    const doc = parse(
      <MunicipioTable
        rows={[mkRow({ nome: "São Bernardo do Campo", votosReportados: 213_008 })]}
      />,
    );
    expect(votosDe(doc)).toEqual(["213.008 votos"]);
  });

  it("(b) 🔴 o eleitorado NÃO foi trocado pelos votos — os dois convivem", () => {
    // Mutação que morre aqui: reaproveitar a linha do eleitorado para os
    // votos. O eleitorado é a chave da ORDEM da lista; sem ele à vista, a
    // ordenação vira arbitrária aos olhos do leitor.
    const doc = parse(
      <MunicipioTable
        rows={[
          mkRow({ nome: "São Bernardo do Campo", eleitorado: 587_412, votosReportados: 213_008 }),
        ]}
      />,
    );
    expect(doc.querySelector('[data-testid="municipio-sub"]')?.textContent).toBe(
      "587.412 eleitores",
    );
    expect(votosDe(doc)).toEqual(["213.008 votos"]);
  });

  it("(c) cada município carregado traz a sua própria linha de votos", () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      mkRow({
        nome: `Município ${i}`,
        cod_ibge: `35${String(i).padStart(5, "0")}`,
        eleitorado: 900_000 - i,
        votosReportados: 1_000 + i,
      }),
    );
    const doc = parse(<MunicipioTable rows={rows} />);
    // 20 é a primeira leva — a linha de votos segue a paginação, não a duplica.
    expect(votosDe(doc)).toHaveLength(20);
    expect(votosDe(doc)[0]).toBe("1.000 votos");
  });

  it("(d) 🔴 o número vai EXATO, nunca abreviado", () => {
    // Mutação que morre aqui: `Intl.NumberFormat(..., {notation: "compact"})`
    // ou qualquer divisão por 1.000/1.000.000. Em JetBrains Mono a abreviação
    // de milhares não economiza um pixel sequer ("238.276" e "238 mil" têm 7
    // caracteres cada) e acima de um milhão ela esconderia uma faixa de 100 mil
    // votos sob o mesmo rótulo.
    const doc = parse(
      <MunicipioTable
        rows={[
          mkRow({
            nome: "São Paulo",
            cod_ibge: "3550308",
            eleitorado: 9_322_444,
            votosReportados: 4_132_887,
          }),
          mkRow({
            nome: "Sorocaba",
            cod_ibge: "3552205",
            eleitorado: 500_123,
            votosReportados: 238_276,
          }),
        ]}
      />,
    );
    const texto = doc.body.textContent ?? "";
    expect(texto).toContain("4.132.887 votos");
    expect(texto).toContain("238.276 votos");
    expect(texto).not.toMatch(/\bmi\b/);
    expect(texto).not.toMatch(/\bmil\b/);
  });

  it("(e) 🔴 dois municípios próximos nunca exibem o mesmo número", () => {
    // O risco que o dono nomeou: abreviação que colapsa vizinhos. 4.132.887 e
    // 4.149.001 cairiam ambos em "4,1 mi".
    const doc = parse(
      <MunicipioTable
        rows={[
          mkRow({
            nome: "A",
            cod_ibge: "3500001",
            eleitorado: 9_000_000,
            votosReportados: 4_132_887,
          }),
          mkRow({
            nome: "B",
            cod_ibge: "3500002",
            eleitorado: 8_000_000,
            votosReportados: 4_149_001,
          }),
        ]}
      />,
    );
    const vistos = votosDe(doc);
    expect(vistos).toEqual(["4.132.887 votos", "4.149.001 votos"]);
    expect(new Set(vistos).size).toBe(2);
  });

  it("(f) o número exato continua no `textContent` — busca da página e leitor de tela", () => {
    const doc = parse(
      <MunicipioTable rows={[mkRow({ nome: "São Paulo", votosReportados: 4_132_887 })]} />,
    );
    // Nada de `title`, `aria-label` ou gaveta como ÚNICO lugar: o número está
    // no texto da linha, que é onde Ctrl+F e o leitor de tela chegam.
    expect(doc.body.textContent).toContain("4.132.887");
  });

  it("(g) singular: 1 voto, não 1 votos", () => {
    const doc = parse(
      <MunicipioTable rows={[mkRow({ nome: "Serra da Saudade", votosReportados: 1 })]} />,
    );
    expect(votosDe(doc)).toEqual(["1 voto"]);
  });
});

/* =========================================================================
 * 2. Os três estados — e o zero que não pode ser fabricado
 * ====================================================================== */

describe("estadoDosVotos() — três estados, nunca dois", () => {
  it("(h) 🔴 sem número publicado é `desconhecido`, e desconhecido não vira linha", () => {
    // Mutação que morre aqui: `votosReportados ?? 0`. O `?? 0` é o default
    // silencioso que já mordeu este projeto três vezes.
    expect(estadoDosVotos({ votosReportados: undefined, pctApurado: 54 })).toEqual({
      tipo: "desconhecido",
    });
    expect(textoDosVotos({ tipo: "desconhecido" })).toBeNull();

    const doc = parse(<MunicipioTable rows={[mkRow({ nome: "Sem número" })]} />);
    expect(doc.querySelectorAll('[data-testid="municipio-votos"]')).toHaveLength(0);
    expect(doc.body.textContent).not.toContain("0 votos");
  });

  it("(i) 🔴 zero votos + zero apurado NÃO é '0 votos' — é 'aguardando boletim'", () => {
    // 🔴 A mutação nomeada pelo dono: município sem apuração exibindo "0".
    // Trocar o texto por "0 votos" (ou por qualquer frase que afirme que a
    // contagem terminou em zero) reprova aqui. A tela fala do NOSSO estado,
    // não do mundo — decisão do dono de 2026-09-14.
    expect(estadoDosVotos({ votosReportados: 0, pctApurado: 0 })).toEqual({ tipo: "sem_apuracao" });
    expect(textoDosVotos({ tipo: "sem_apuracao" })).toBe("aguardando boletim");

    const doc = parse(
      <MunicipioTable rows={[mkRow({ nome: "Não começou", votosReportados: 0, pctApurado: 0 })]} />,
    );
    expect(votosDe(doc)).toEqual(["aguardando boletim"]);
    expect(doc.body.textContent).not.toContain("0 votos");
  });

  it("(j) 🔴 zero votos COM apuração é um fato medido, e aí o zero aparece", () => {
    // O outro lado da mesma regra, e a razão de os estados serem três: um
    // boletim só de brancos e nulos zera `Σ votos_reportados` sem zerar
    // `pct_apurado`. Esconder esse zero seria esconder uma medição de verdade.
    // Mutação que morre aqui: colapsar `medido{0}` em `sem_apuracao`.
    expect(estadoDosVotos({ votosReportados: 0, pctApurado: 3.2 })).toEqual({
      tipo: "medido",
      votos: 0,
    });
    const doc = parse(
      <MunicipioTable
        rows={[mkRow({ nome: "Só brancos", votosReportados: 0, pctApurado: 3.2 })]}
      />,
    );
    expect(votosDe(doc)).toEqual(["0 votos"]);
  });

  it("(k) `pctApurado` não-numérico não promove o zero a medição", () => {
    // `!(x > 0)` e não `x === 0`: NaN reprova as duas comparações, e o estado
    // seguro diante de um percentual que não é número é "não apuramos ainda".
    expect(estadoDosVotos({ votosReportados: 0, pctApurado: Number.NaN })).toEqual({
      tipo: "sem_apuracao",
    });
  });

  it("(l) NaN/Infinity em `votosReportados` é desconhecido, não zero", () => {
    expect(estadoDosVotos({ votosReportados: Number.NaN, pctApurado: 10 })).toEqual({
      tipo: "desconhecido",
    });
    expect(estadoDosVotos({ votosReportados: Number.POSITIVE_INFINITY, pctApurado: 10 })).toEqual({
      tipo: "desconhecido",
    });
  });
});

/* =========================================================================
 * 3. O orçamento de largura — a aritmética que o layout obedece
 * ====================================================================== */

describe("larguraDoNome() — o orçamento que impede o nome de truncar", () => {
  it("(m) 🔴 a 326px (celular de 360) o nome cabe inteiro nos dois casos do dono", () => {
    // 🔴 A mutação nomeada pelo dono, traduzida para o que existe: devolver o
    // orçamento anterior (margem 96px, apurado 72px, `px-3`) dá 134px ao nome
    // — menos que os 143,81px de "São Bernardo do Campo". Era o estado REAL de
    // `d5765c4`, e reprova aqui.
    const nome = larguraDoNome(TABELA_POR_VIEWPORT["360 (celular)"]);
    expect(nome).toBe(166);
    expect(nome).toBeGreaterThanOrEqual(SAO_BERNARDO_PX);
    expect(nome).toBeGreaterThanOrEqual(SAO_JOSE_PX);
    // E o orçamento antigo, explicitamente, para nomear o que reprovaria:
    expect(326 - 96 - 72 - 2 * 12).toBeLessThan(SAO_BERNARDO_PX);
  });

  it("(n) 🔴 a capital mais larga cabe com o kicker `· capital` junto", () => {
    // O kicker é `flex: none`: quem encolhe é o nome. Sem esta folga, "Campo
    // Grande · capital" truncaria o NOME e a capital ficaria "Campo Gra… ·
    // CAPITAL" — pior que não marcar.
    expect(larguraDoNome(326)).toBeGreaterThanOrEqual(CAPITAL_MAIS_LARGA_PX);
  });

  it("(o) o subtítulo cabe em uma linha em todas as larguras reais do app", () => {
    // Se não coubesse, a linha quebraria e a altura da linha da tabela passaria
    // a variar de município para município — lista serrilhada.
    for (const [viewport, tabela] of Object.entries(TABELA_POR_VIEWPORT)) {
      expect(larguraDoNome(tabela), viewport).toBeGreaterThanOrEqual(SUBTITULO_PIOR_CASO_PX);
    }
  });

  it("(p) as duas colunas numéricas continuam cabendo no próprio conteúdo", () => {
    // A coluna de margem NÃO perdeu conteúdo na mudança: 96−24 e 88−16 dão os
    // mesmos 72px. A redução da caixa pagou o padding, não o dado.
    expect(COL_MARGEM_PX - 2 * CELULA_PAD_X_PX).toBe(72);
    expect(COL_APURADO_PX - 2 * CELULA_PAD_X_PX).toBeGreaterThanOrEqual(APURADO_PIOR_CASO_PX);
  });

  it("(q) 🔴 uma QUARTA coluna de votos só caberia num aparelho, e sumiria nos outros três", () => {
    // 🔴 A terceira mutação nomeada pelo dono: pôr os votos em coluna. Esta é
    // a conta que a proíbe — e ela proíbe por um motivo mais específico que
    // "não cabe".
    //
    // Uma coluna de votos custa 59,42px de número mais o padding. O que sobra
    // para o nome tem de segurar o PIOR caso que a lista garantidamente exibe,
    // e esse não é "São Bernardo do Campo" (143,81px): é a **capital**
    // (149,83px com o kicker `· capital`), que está no topo da lista de toda
    // UF porque é quase sempre o maior colégio eleitoral dela.
    //
    // Com a quarta coluna, o nome cabe no celular de 430 e mais em lugar
    // nenhum: trunca no celular de 360, no tablet de 768 (que passa raspando
    // nos 143,81px de São Bernardo e reprova na capital) e no desktop de 1440.
    // Uma coluna que aparece num aparelho e some no menor E nos dois maiores
    // não é progressive disclosure, é defeito intermitente — e é por isso que
    // ela não existe em largura nenhuma.
    //
    // Mutação que morre aqui: acrescentar a coluna (a conta deixa de fechar
    // assim que a coluna do nome passa a dividir a tabela com uma quarta).
    const colunaDeVotos = NUMERO_DE_VOTOS_PX + 2 * CELULA_PAD_X_PX;
    const cabe = (tabela: number) => larguraDoNome(tabela) - colunaDeVotos >= CAPITAL_MAIS_LARGA_PX;

    expect(cabe(TABELA_POR_VIEWPORT["360 (celular)"])).toBe(false);
    expect(cabe(TABELA_POR_VIEWPORT["768 (tablet retrato)"])).toBe(false);
    expect(cabe(TABELA_POR_VIEWPORT["1440 (desktop, coluna de 400px)"])).toBe(false);
    // O único que comporta — e sozinho não sustenta uma apresentação.
    expect(cabe(TABELA_POR_VIEWPORT["430 (celular grande)"])).toBe(true);

    expect(Object.values(TABELA_POR_VIEWPORT).filter(cabe)).toHaveLength(1);
  });

  it("(r) 🔴 a tabela mais larga do app é a do CELULAR, não a do desktop", () => {
    // O fato que derruba `@media (min-width: …)` como instrumento aqui. Se um
    // dia esta asserção quebrar, foi o shell que mudou (`--container-sidebar`
    // em `AppShellSplit.module.css`), e aí a decisão da quarta coluna pode ser
    // reaberta — com medição nova.
    expect(TABELA_POR_VIEWPORT["430 (celular grande)"]).toBeGreaterThan(
      TABELA_POR_VIEWPORT["1440 (desktop, coluna de 400px)"],
    );
    expect(TABELA_POR_VIEWPORT["768 (tablet retrato)"]).toBeGreaterThan(
      TABELA_POR_VIEWPORT["1440 (desktop, coluna de 400px)"],
    );
  });
});

/* =========================================================================
 * 4. O contrato de colunas e de não-vazamento
 * ====================================================================== */

describe("<MunicipioTable /> — contrato de colunas", () => {
  it("(s) 🔴 três colunas, com as larguras do orçamento", () => {
    const doc = parse(<MunicipioTable rows={[mkRow({ nome: "Santos", votosReportados: 10 })]} />);
    const cols = [...doc.querySelectorAll("colgroup col")];
    expect(cols).toHaveLength(3);
    // A do nome não declara largura: ela é o resto, e é isso que faz
    // `larguraDoNome()` descrever o layout de verdade.
    expect(cols[0]?.getAttribute("style")).toBeNull();
    expect(cols[1]?.getAttribute("style")).toContain(`${COL_MARGEM_PX}px`);
    expect(cols[2]?.getAttribute("style")).toContain(`${COL_APURADO_PX}px`);
    expect(doc.querySelectorAll("thead th")).toHaveLength(3);
  });

  it("(t) 🔴 toda célula usa o padding do orçamento, cabeçalho inclusive", () => {
    // Mutação que morre aqui: voltar qualquer célula para `px-3`. Uma só já
    // desalinha a coluna e come 8px do nome.
    const doc = parse(<MunicipioTable rows={[mkRow({ nome: "Santos", votosReportados: 10 })]} />);
    const celulas = [...doc.querySelectorAll("thead th, tbody td")];
    expect(celulas).toHaveLength(6);
    for (const c of celulas) {
      expect(c.className).toContain("px-2");
      expect(c.className).not.toContain("px-3");
    }
  });

  it("(u) 🔴 as duas linhas do subtítulo são `nowrap` e contidas", () => {
    // É o que garante altura de linha uniforme e o que impede o subtítulo de
    // empurrar a tabela para os lados (constituição § 4 / o incidente dos
    // 2.424px de rolagem lateral).
    const doc = parse(
      <MunicipioTable
        rows={[mkRow({ nome: "São Paulo", eleitorado: 9_322_444, votosReportados: 4_132_887 })]}
      />,
    );
    for (const sel of ['[data-testid="municipio-sub"]', '[data-testid="municipio-votos"]']) {
      const estilo = doc.querySelector(sel)?.getAttribute("style") ?? "";
      expect(estilo, sel).toContain("nowrap");
      expect(estilo, sel).toContain("ellipsis");
    }
  });

  it("(v) a célula de margem não deixa um nome longo vazar para fora", () => {
    // `liderNome` é o primeiro nome da candidatura e não tem limite de
    // comprimento; sem ponto de quebra, a palavra sairia da célula e a página
    // ganharia rolagem lateral.
    const doc = parse(
      <MunicipioTable
        rows={[mkRow({ nome: "Santos", liderNome: "Maximiliano", votosReportados: 10 })]}
      />,
    );
    const tds = [...doc.querySelectorAll("tbody td")];
    expect(tds[1]?.getAttribute("style")).toContain("anywhere");
  });

  it("(w) nenhum `sr-only` dentro da `<table>`", () => {
    // Regra do projeto: `sr-only` depende de `width:1px`, e tabela trata
    // largura como MÍNIMO — ver `tests/unit/design-system/sr-only-tabela.test.ts`.
    const doc = parse(
      <MunicipioTable
        rows={[mkRow({ nome: "Santos", votosReportados: 10 })]}
        onSelect={() => {}}
      />,
    );
    expect(doc.querySelectorAll("table .sr-only")).toHaveLength(0);
  });
});
