// @vitest-environment happy-dom
/**
 * tests/unit/components/CamaraHemiciclo.test.tsx — o plenário da Câmara.
 *
 * Cada bloco nomeia a mutação que o derruba, e elas foram aplicadas de verdade
 * em 2026-09-18 (relatório da rodada). Um teste que só afirma o que o código
 * faz hoje não discrimina nada; o que discrimina é o teste que morre quando a
 * decisão é desfeita.
 *
 * ⚠️ Os números de cadeira aqui são **deliberadamente diferentes de 513**. Um
 * teste que usa 513 passaria com `513` cravado no JSX, por coincidência — que é
 * exatamente o defeito que o RF-124 existe para impedir.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { assentosDaBancada, CamaraHemiciclo } from "@/components/blocks/CamaraHemiciclo";
import type { EdgeAgremiacaoBancada, EdgeBancadaNacional } from "@/lib/edge-config/types";
import { colorForParty, textForParty } from "@/lib/utils/party-color";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function agr(over: Partial<EdgeAgremiacaoBancada> = {}): EdgeAgremiacaoBancada {
  return {
    cod: "22",
    sigla: "PL",
    nome: "Partido Liberal",
    tipo: "partido",
    componentes: [],
    sigla_lider: "PL",
    cadeiras: 40,
    votos_nominais: 1,
    votos_legenda: 1,
    votos_validos: 2,
    pct_votos: 1,
    ...over,
  };
}

/** Bancada de 120 cadeiras: 60 PL + 40 da federação (7 indefinidas) + 20 sem dono. */
function bancada(over: Partial<EdgeBancadaNacional> = {}): EdgeBancadaNacional {
  return {
    total_cadeiras: 120,
    cadeiras_atribuidas: 100,
    ufs_calculadas: 20,
    ufs_aguardando: 7,
    por_agremiacao: [
      agr({ cod: "22", sigla: "PL", sigla_lider: "PL", cadeiras: 60 }),
      agr({
        cod: "13",
        sigla: "FE BRASIL",
        nome: "Federação Brasil da Esperança",
        tipo: "federacao",
        componentes: ["PT", "PCdoB", "PV"],
        // O líder da federação NÃO é a sigla dela — é o que separa um teste que
        // mede a derivação de um que passa por coincidência.
        sigla_lider: "PT",
        cadeiras: 40,
        cadeiras_indefinidas: 7,
      }),
    ],
    ...over,
  };
}

const circulos = (doc: Document, seletor = "svg") =>
  doc.querySelectorAll(`${seletor} circle`).length;

describe("CamaraHemiciclo — a soma das bolinhas é `total_cadeiras` (RF-125.1)", () => {
  // 🔴 MUTAÇÃO: trocar a distribuição de resto por `floor` simples em
  // `assentosPorArco`. Saem 116 bolinhas em vez de 120, e na tela ninguém vê.
  it("desenha exatamente `total_cadeiras` círculos", () => {
    expect(circulos(parse(<CamaraHemiciclo bancada={bancada()} />))).toBe(120);
  });

  // 🔴 MUTAÇÃO: cravar `513` em qualquer ponto do componente ou da geometria.
  it("🔴 `total_cadeiras: 531` ⇒ 531 bolinhas", () => {
    const b = bancada({
      total_cadeiras: 531,
      cadeiras_atribuidas: 100,
    });
    expect(circulos(parse(<CamaraHemiciclo bancada={b} />))).toBe(531);
  });

  it("os três estados somam o total, e só eles existem", () => {
    const fila = assentosDaBancada(bancada());
    expect(fila).toHaveLength(120);
    expect(fila.filter((a) => a.estado === "definida")).toHaveLength(93);
    expect(fila.filter((a) => a.estado === "indefinida")).toHaveLength(7);
    expect(fila.filter((a) => a.estado === "nao_atribuida")).toHaveLength(20);
  });
});

describe("CamaraHemiciclo — RF-127: a cadeira indefinida vai marcada", () => {
  // 🔴 MUTAÇÃO: ignorar `cadeiras_indefinidas` e pintar as 40 cadeiras da
  // federação como definidas.
  it("`cadeiras_indefinidas: 7` ⇒ 7 bolinhas cinzas NAQUELA agremiação", () => {
    const doc = parse(<CamaraHemiciclo bancada={bancada()} />);
    expect(circulos(doc, 'g[data-estado="indefinida"][data-cod="13"]')).toBe(7);
    expect(circulos(doc, 'g[data-estado="definida"][data-cod="13"]')).toBe(33);
    // E não vazam para a outra agremiação.
    expect(circulos(doc, 'g[data-estado="indefinida"][data-cod="22"]')).toBe(0);
  });

  it("a cadeira indefinida é cinza com anel da agremiação, não cor chapada", () => {
    const doc = parse(<CamaraHemiciclo bancada={bancada()} />);
    const g = doc.querySelector('g[data-estado="indefinida"][data-cod="13"]');
    expect(g?.getAttribute("fill")).toBe("var(--surface-sunken)");
    expect(g?.getAttribute("stroke")).toBe(textForParty("PT"));
  });

  it("`cadeiras_indefinidas` maior que `cadeiras` não rouba cadeira de ninguém", () => {
    const b = bancada({
      total_cadeiras: 10,
      cadeiras_atribuidas: 10,
      por_agremiacao: [agr({ cadeiras: 10, cadeiras_indefinidas: 99 })],
    });
    const fila = assentosDaBancada(b);
    expect(fila).toHaveLength(10);
    expect(fila.every((a) => a.estado === "indefinida")).toBe(true);
  });
});

describe("CamaraHemiciclo — a cadeira sem dono é cinza NEUTRO", () => {
  // 🔴 MUTAÇÃO: preencher o resto com a última agremiação (ou com a primeira),
  // em vez de deixá-lo sem dono. A Câmara aparece cheia antes de estar.
  it("`Σ cadeiras < total` ⇒ o resto é cinza neutro, e não de ninguém", () => {
    const doc = parse(<CamaraHemiciclo bancada={bancada()} />);
    expect(circulos(doc, 'g[data-estado="nao_atribuida"]')).toBe(20);

    const g = doc.querySelector('g[data-estado="nao_atribuida"]');
    expect(g?.getAttribute("fill")).toBe("var(--surface-sunken)");
    // Anel neutro — o contorno é o que impede o disco cinza de encostar no
    // papel sem fronteira (1,07:1). RNF-035.
    expect(g?.getAttribute("stroke")).toBe("var(--text-secondary)");
    expect(g?.getAttribute("data-cod")).toBeNull();
    expect(g?.getAttribute("data-sigla")).toBeNull();
  });

  it("bancada ainda toda por apurar: TODAS as cadeiras nascem cinzas", () => {
    // É o estado que o dono aceitou explicitamente — a noite começa quase toda
    // cinza. Nunca foi visto numa fixture, então mora aqui.
    const b = bancada({
      total_cadeiras: 77,
      cadeiras_atribuidas: 0,
      por_agremiacao: [agr({ cadeiras: 0 }), agr({ cod: "13", sigla: "FE", cadeiras: 0 })],
    });
    const doc = parse(<CamaraHemiciclo bancada={b} />);
    expect(circulos(doc)).toBe(77);
    expect(circulos(doc, 'g[data-estado="nao_atribuida"]')).toBe(77);
    expect(circulos(doc, 'g[data-estado="definida"]')).toBe(0);
  });
});

describe("CamaraHemiciclo — cor de IDENTIDADE, com o piso de contraste (RNF-035)", () => {
  // 🔴 MUTAÇÃO: trocar `textForParty` por `colorForParty`. Passa despercebido
  // em 17 dos 31 partidos (onde os dois tokens coincidem) — por isso o teste
  // usa PSOL, que é justamente um dos que reprovam 3:1 na cor-base, e que
  // lidera a federação PSOL-Rede nesta tela em toda apuração.
  it("a cadeira definida usa a variante `-text`, nunca a cor-base", () => {
    const b = bancada({
      total_cadeiras: 30,
      cadeiras_atribuidas: 30,
      por_agremiacao: [
        agr({
          cod: "18",
          sigla: "PSOL/REDE",
          tipo: "federacao",
          sigla_lider: "PSOL",
          cadeiras: 30,
        }),
      ],
    });
    const g = parse(<CamaraHemiciclo bancada={b} />).querySelector('g[data-estado="definida"]');

    expect(g?.getAttribute("fill")).toBe(textForParty("PSOL"));
    expect(g?.getAttribute("fill")).toBe("var(--party-psol-text)");
    expect(g?.getAttribute("fill"), "voltou para a cor-base, que mede 2,08:1").not.toBe(
      colorForParty("PSOL"),
    );
  });

  it("nenhum token de cor-base de partido aparece no SVG inteiro", () => {
    // Guarda de varredura: pega o caso em que alguém reintroduz `colorForParty`
    // num ramo que o teste acima não toca.
    const svg =
      parse(<CamaraHemiciclo bancada={bancada()} />).querySelector("svg")?.outerHTML ?? "";
    expect(svg).not.toMatch(/var\(--party-[a-z0-9]+\)/);
  });
});

describe("CamaraHemiciclo — a ordem é a MESMA da lista, por tamanho de bancada", () => {
  // 🔴 MUTAÇÃO: trocar o comparador de `ordenarBancada` — por `cod`, por
  // `sigla` alfabética, ou por qualquer eixo ideológico. O teste usa uma
  // bancada em que as três ordens dão resultados diferentes.
  it("as cunhas saem por cadeiras desc, não por sigla nem por `cod`", () => {
    const b = bancada({
      total_cadeiras: 60,
      cadeiras_atribuidas: 60,
      por_agremiacao: [
        agr({ cod: "10", sigla: "AVANTE", sigla_lider: "AVANTE", cadeiras: 5 }),
        agr({ cod: "90", sigla: "PT", sigla_lider: "PT", cadeiras: 40 }),
        agr({ cod: "50", sigla: "MDB", sigla_lider: "MDB", cadeiras: 15 }),
      ],
    });
    const codigos = [...parse(<CamaraHemiciclo bancada={b} />).querySelectorAll("g[data-cod]")].map(
      (g) => g.getAttribute("data-cod"),
    );

    expect(codigos).toEqual(["90", "50", "10"]);
    expect(codigos, "ordenou por `cod`").not.toEqual(["10", "50", "90"]);
    expect(codigos, "ordenou alfabeticamente por sigla").not.toEqual(["10", "50", "90"]);
  });

  it("empate em cadeiras desempata por sigla ascendente, sempre igual", () => {
    const b = bancada({
      total_cadeiras: 20,
      cadeiras_atribuidas: 20,
      por_agremiacao: [
        agr({ cod: "1", sigla: "ZZZ", sigla_lider: "PT", cadeiras: 10 }),
        agr({ cod: "2", sigla: "AAA", sigla_lider: "PL", cadeiras: 10 }),
      ],
    });
    const codigos = [...parse(<CamaraHemiciclo bancada={b} />).querySelectorAll("g[data-cod]")].map(
      (g) => g.getAttribute("data-cod"),
    );
    expect(codigos).toEqual(["2", "1"]);
  });

  it("o `<desc>` diz em texto que a ordem NÃO é ideológica", () => {
    // Sem esta frase o desenho afirma, na imagem, uma leitura que não medimos
    // (constituição §§ 1 e 2). É a defesa que acompanha a ausência de rótulo
    // nas extremidades e a ausência de marcador de maioria.
    const desc = parse(<CamaraHemiciclo bancada={bancada()} />).querySelector("desc")?.textContent;
    expect(desc).toContain("maior bancada primeiro");
    expect(desc).toContain("não representa posição ideológica");
  });

  it("não há rótulo nas extremidades nem marcador de maioria no desenho", () => {
    const svg = parse(<CamaraHemiciclo bancada={bancada()} />).querySelector("svg");
    expect(svg?.querySelectorAll("text")).toHaveLength(0);
    expect(svg?.querySelectorAll("line, rect, path")).toHaveLength(0);
  });
});

describe("CamaraHemiciclo — 🔴 o intervalo de RF-127 NÃO é desenhado aqui", () => {
  // 🔴 MUTAÇÃO: qualquer tentativa de desenhar `cadeiras_ci95` no plenário —
  // bolinhas até o topo da faixa (quebra RF-125.1), hachura, opacidade. O
  // intervalo não tem representação em bolinhas que não invente de quem seriam
  // as cadeiras em disputa, e o payload nacional não diz.
  it("o `<svg>` com faixa em todas as linhas é IDÊNTICO ao sem faixa nenhuma", () => {
    const semFaixa = bancada();
    const comFaixa = bancada({
      por_agremiacao: semFaixa.por_agremiacao.map((a) => ({
        ...a,
        cadeiras_ci95: [a.cadeiras - 5, a.cadeiras + 5] as [number, number],
      })),
    });

    const svgDe = (b: EdgeBancadaNacional) =>
      parse(<CamaraHemiciclo bancada={b} />).querySelector("svg")?.outerHTML ?? "";

    expect(svgDe(comFaixa)).toBe(svgDe(semFaixa));
    expect(svgDe(semFaixa).length).toBeGreaterThan(100);
  });

  it("faixa ausente não vira `[n, n]` em lugar nenhum do widget", () => {
    // O erro que `api/model/cadeiras_bootstrap.py` existe para prevenir do
    // outro lado da fronteira: publicar largura zero afirma uma precisão que a
    // amostra não sustenta.
    const texto = parse(<CamaraHemiciclo bancada={bancada()} />).body.textContent ?? "";
    expect(texto).not.toMatch(/60 a 60/);
    expect(texto).not.toMatch(/40 a 40/);
    expect(texto).not.toMatch(/\[\s*\d+\s*,\s*\d+\s*\]/);
  });
});

describe("CamaraHemiciclo — determinismo e a11y", () => {
  it("duas renderizações da mesma bancada produzem markup idêntico", () => {
    const b = bancada();
    expect(renderToStaticMarkup(<CamaraHemiciclo bancada={b} />)).toBe(
      renderToStaticMarkup(<CamaraHemiciclo bancada={b} />),
    );
  });

  it("`role=img` com `<title>`, e o `aria-describedby` inclui o alvo pedido", () => {
    const doc = parse(<CamaraHemiciclo bancada={bancada()} descritoPorId="bancada-agremiacoes" />);
    const svg = doc.querySelector("svg");

    expect(svg?.getAttribute("role")).toBe("img");
    const labelledBy = svg?.getAttribute("aria-labelledby") ?? "";
    expect(doc.getElementById(labelledBy)?.tagName.toLowerCase()).toBe("title");
    expect((svg?.getAttribute("aria-describedby") ?? "").split(" ")).toContain(
      "bancada-agremiacoes",
    );
  });

  it("o `<title>` nomeia o total lido do payload, não um número fixo", () => {
    const t = parse(<CamaraHemiciclo bancada={bancada({ total_cadeiras: 531 })} />).querySelector(
      "title",
    )?.textContent;
    expect(t).toContain("531");
    expect(t).not.toContain("513");
  });

  it("sem cadeira publicada, o widget não renderiza nada", () => {
    const b = bancada({ total_cadeiras: 0, cadeiras_atribuidas: 0, por_agremiacao: [] });
    expect(renderToStaticMarkup(<CamaraHemiciclo bancada={b} />)).toBe("");
  });
});
