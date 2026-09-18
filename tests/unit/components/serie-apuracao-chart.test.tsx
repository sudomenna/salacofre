// @vitest-environment happy-dom
/**
 * tests/unit/components/serie-apuracao-chart.test.tsx
 *
 * Spec 020 — RF-170 a RF-176.
 *
 * ## Como estes testes foram escritos
 *
 * Este repositório tem histórico de teste que passa sem provar nada
 * (`docs/reference/risks.md`; a memória do projeto registra três formas
 * distintas). Cada bloco abaixo nomeia, no título, a **mutação** que ele mata,
 * e as fixtures foram construídas para que essa mutação mude o resultado —
 * não para parecerem realistas.
 *
 * O exemplo canônico: uma fixture em que apurado e projetado têm valores
 * parecidos passa com os dois trocados. Por isso a fixture de T1 tem as duas
 * bases andando em **direções opostas**.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  SerieApuracaoChart,
  type SerieCandidatoView,
} from "@/components/atoms/charts/SerieApuracaoChart";

const ALTURA = 220;

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function html(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

/** Instantes a cada 5 min, como o produtor emite. */
function eixoDe(n: number): string[] {
  return Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(2026, 9, 4, 20, i * 5)).toISOString(),
  );
}

function tracos(doc: Document, cand: number, base: "parcial" | "proj"): Element[] {
  return [...doc.querySelectorAll(`path[data-traco][data-cand="${cand}"][data-base="${base}"]`)];
}

/** Os `y` de um `d` de path, na ordem em que aparecem. */
function ysDoPath(el: Element): number[] {
  const d = el.getAttribute("d") ?? "";
  return [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[2]));
}

function ysDe(doc: Document, cand: number, base: "parcial" | "proj"): number[] {
  return tracos(doc, cand, base).flatMap(ysDoPath);
}

function cand(over: Partial<SerieCandidatoView> & { id: number }): SerieCandidatoView {
  return {
    nome: `Candidata ${over.id}`,
    partido: "PT",
    apurado: [],
    projetado: [],
    ...over,
  };
}

// ---------------------------------------------------------------------------

describe("<SerieApuracaoChart /> — T1: mata a troca de apurado por projetado", () => {
  // As duas bases sobem/descem em direções OPOSTAS de propósito. Com séries
  // parecidas, trocar `apurado` por `projetado` no render não muda nada
  // observável e o teste passaria com o defeito no lugar.
  const doc = parse(
    <SerieApuracaoChart
      eixo={eixoDe(3)}
      cadenciaMin={5}
      candidatos={[cand({ id: 13, apurado: [10, 20, 30], projetado: [40, 35, 31] })]}
      escopo="Brasil"
      titleId="t1"
      height={ALTURA}
    />,
  );

  it("a base apurada sobe (y decresce) e a projetada desce (y cresce)", () => {
    const yParcial = ysDe(doc, 13, "parcial");
    const yProj = ysDe(doc, 13, "proj");

    expect(yParcial.length).toBeGreaterThanOrEqual(2);
    expect(yProj.length).toBeGreaterThanOrEqual(2);

    // Em SVG o eixo y cresce para baixo: valor maior ⇒ y menor.
    const sentidoParcial = Math.sign((yParcial.at(-1) as number) - (yParcial[0] as number));
    const sentidoProj = Math.sign((yProj.at(-1) as number) - (yProj[0] as number));

    expect(sentidoParcial).toBe(-1); // 10 → 30 sobe
    expect(sentidoProj).toBe(1); // 40 → 31 desce
    expect(sentidoParcial).not.toBe(sentidoProj);
  });

  it("as duas bases são renderizadas no servidor, cada uma no seu grupo de visão", () => {
    // RF-172: a alternância é da cascata `data-view-only`, não de JS.
    expect(doc.querySelector('g[data-view-only="parcial"]')).not.toBeNull();
    expect(doc.querySelector('g[data-view-only="proj"]')).not.toBeNull();
  });
});

describe("<SerieApuracaoChart /> — T3: mata o deslocamento do limiar de 2 pontos", () => {
  // Três casos, e o do MEIO é o que discrimina. Um teste só com 0 e 3 pontos
  // passa tanto com `< 2` → `<= 2` quanto com `< 2` → `< 1`.
  function estadoCom(medicoes: (number | null)[]): string | null {
    const doc = parse(
      <SerieApuracaoChart
        eixo={eixoDe(medicoes.length)}
        cadenciaMin={5}
        candidatos={[cand({ id: 13, apurado: medicoes, projetado: medicoes })]}
        escopo="SP"
        titleId="t3"
        height={ALTURA}
      />,
    );
    return doc.querySelector("[data-estado]")?.getAttribute("data-estado") ?? null;
  }

  it("sem eixo → indisponível", () => {
    expect(estadoCom([])).toBe("indisponivel");
  });

  it("uma medição → apurando, sem traço", () => {
    expect(estadoCom([30])).toBe("apurando");
  });

  it("exatamente DUAS medições → desenha (é o caso NO limiar)", () => {
    expect(estadoCom([30, 31])).toBe("ok");
  });
});

describe("<SerieApuracaoChart /> — T5: mata o `?? 0` (ausência virando zero)", () => {
  // Furo no meio. Se qualquer ponto da cadeia trocar `null` por 0, o traço
  // vira UM só, mergulhando até o chão e voltando — e some a evidência de que
  // houve falha de sinal. É a regra dos três estados aplicada ao desenho.
  const doc = parse(
    <SerieApuracaoChart
      eixo={eixoDe(5)}
      cadenciaMin={5}
      candidatos={[
        cand({ id: 13, apurado: [30, 31, null, 33, 34], projetado: [30, 31, 32, 33, 34] }),
      ]}
      escopo="SP"
      titleId="t5"
      height={ALTURA}
    />,
  );

  it("o traço INTERROMPE: dois segmentos, não um", () => {
    expect(tracos(doc, 13, "parcial")).toHaveLength(2);
  });

  it("a base sem furo continua com um segmento só (controle)", () => {
    expect(tracos(doc, 13, "proj")).toHaveLength(1);
  });

  it("nenhuma coordenada desce até a linha de zero", () => {
    // Com valores entre 30 e 34 a régua começa acima de zero; um 0 fabricado
    // cairia MUITO abaixo da área útil do SVG.
    for (const y of ysDe(doc, 13, "parcial")) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(ALTURA);
    }
  });

  it('a célula sem boletim diz "sem medição", e não um número', () => {
    const celulas = [...doc.querySelectorAll('td[data-cand="13"][data-base="parcial"]')];
    expect(celulas).toHaveLength(5);
    expect(celulas[2]?.textContent).toContain("sem medição");
    expect(celulas[2]?.textContent).not.toMatch(/\d/);
  });
});

describe("<SerieApuracaoChart /> — T7: mata a cor por rank", () => {
  // O payload ainda publica `var(--color-cand-{rank})`. Se o componente ler a
  // cor dali em vez do partido, a linha troca de cor numa ultrapassagem — ao
  // vivo, no meio da noite.
  const a = cand({ id: 13, partido: "PT", apurado: [30, 31], projetado: [30, 31] });
  const b = cand({ id: 22, partido: "PL", apurado: [28, 29], projetado: [28, 29] });

  function strokePorId(candidatos: SerieCandidatoView[]): Record<number, string | null> {
    const doc = parse(
      <SerieApuracaoChart
        eixo={eixoDe(2)}
        cadenciaMin={5}
        candidatos={candidatos}
        escopo="Brasil"
        titleId="t7"
        height={ALTURA}
      />,
    );
    return {
      13: tracos(doc, 13, "parcial")[0]?.getAttribute("stroke") ?? null,
      22: tracos(doc, 22, "parcial")[0]?.getAttribute("stroke") ?? null,
    };
  }

  it("a cor de cada candidatura não muda quando a ordem muda", () => {
    const naOrdem = strokePorId([a, b]);
    const invertida = strokePorId([b, a]);

    expect(naOrdem[13]).not.toBeNull();
    expect(naOrdem[22]).not.toBeNull();
    expect(invertida[13]).toBe(naOrdem[13]);
    expect(invertida[22]).toBe(naOrdem[22]);
  });

  it("partidos diferentes recebem cores diferentes", () => {
    const cores = strokePorId([a, b]);
    expect(cores[13]).not.toBe(cores[22]);
  });

  it("o token de cor por rank não aparece no HTML", () => {
    // Asserção NEGATIVA: é a que pega o defeito, porque a positiva
    // ("tem uma cor") passa com a cor errada.
    const saida = html(
      <SerieApuracaoChart
        eixo={eixoDe(2)}
        cadenciaMin={5}
        candidatos={[a, b]}
        escopo="Brasil"
        titleId="t7b"
        height={ALTURA}
      />,
    );
    expect(saida).not.toContain("--color-cand-");
  });
});

describe("<SerieApuracaoChart /> — RF-174: antes do dia da eleição", () => {
  const props = {
    eixo: eixoDe(0),
    cadenciaMin: 5,
    candidatos: [] as SerieCandidatoView[],
    escopo: "Brasil",
    titleId: "pre",
    preEleicao: true,
    height: ALTURA,
  };

  it("desenha os eixos e a frase, sem nenhuma linha", () => {
    const doc = parse(<SerieApuracaoChart {...props} />);
    expect(doc.querySelector("[data-estado]")?.getAttribute("data-estado")).toBe("antes-do-dia");
    expect(doc.querySelectorAll("path[data-traco]")).toHaveLength(0);
    expect(doc.body.textContent).toContain("disponível apenas no dia das eleições");
  });

  it("a palavra “projeção” não aparece em NENHUMA superfície", () => {
    // Inclui rótulo de acessibilidade, título e legenda de tabela — os três
    // lugares que o RF-161 aponta como "os que ninguém revisa".
    const saida = html(<SerieApuracaoChart {...props} />).toLowerCase();
    expect(saida).not.toContain("projeç");
    expect(saida).not.toContain("projec");
  });

  it("os únicos percentuais são os da régua — nenhuma medição vaza", () => {
    // Asserção de IGUALDADE, não de ausência, e a diferença é o teste inteiro.
    // "não contém %" proibiria a própria régua (foi o que aconteceu antes da
    // decisão do dono de 2026-09-17); "contém exatamente a régua" deixa a
    // escala passar e reprova qualquer número FORA dela — que é como um valor
    // fabricado apareceria.
    const doc = parse(<SerieApuracaoChart {...props} />);
    const pcts = [...(doc.body.textContent ?? "").matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map(
      (m) => m[1],
    );
    expect(pcts).toEqual(["0", "10", "20", "30", "40", "50"]);
  });

  it("desenha a régua de horários do protótipo", () => {
    const doc = parse(<SerieApuracaoChart {...props} />);
    const texto = doc.body.textContent ?? "";
    for (const hora of ["17h", "18h", "19h", "20h", "20h30"]) {
      expect(texto).toContain(hora);
    }
  });
});

describe("<SerieApuracaoChart /> — RF-173: Senador elege duas", () => {
  const quatro = [
    cand({ id: 1, partido: "PT", apurado: [30, 32], projetado: [30, 32] }),
    cand({ id: 2, partido: "PL", apurado: [25, 26], projetado: [25, 26] }),
    cand({ id: 3, partido: "MDB", apurado: [20, 19], projetado: [20, 19] }),
    cand({ id: 4, partido: "PSD", apurado: [10, 11], projetado: [10, 11] }),
  ];
  const doc = parse(
    <SerieApuracaoChart
      eixo={eixoDe(2)}
      cadenciaMin={5}
      candidatos={quatro}
      escopo="SP"
      vagas={2}
      titleId="sen"
      height={ALTURA}
    />,
  );

  function espessura(id: number): number {
    return Number(tracos(doc, id, "parcial")[0]?.getAttribute("stroke-width"));
  }

  it("as duas primeiras têm traço mais grosso que as de fora", () => {
    expect(espessura(1)).toBeGreaterThan(espessura(3));
    expect(espessura(2)).toBeGreaterThan(espessura(4));
    expect(espessura(1)).toBe(espessura(2));
    expect(espessura(3)).toBe(espessura(4));
  });

  it("as de fora NÃO são apagadas por opacidade", () => {
    // Opacidade compõe com a cor e derrubou 16 nós para 2,27:1 no axe em
    // 2026-09-08 (`app/globals.css`). Finas, não apagadas.
    const saida = html(
      <SerieApuracaoChart
        eixo={eixoDe(2)}
        cadenciaMin={5}
        candidatos={quatro}
        escopo="SP"
        vagas={2}
        titleId="sen2"
        height={ALTURA}
      />,
    );
    expect(saida).not.toContain("opacity");
  });

  it("desenha a régua da 2ª vaga", () => {
    expect(doc.querySelector('[data-testid="serie-regua-vaga"]')).not.toBeNull();
  });

  it("a legenda da tabela nomeia as duas que ocupam vaga", () => {
    // O destaque por espessura não tem tradução textual automática: sem esta
    // frase, a informação existe só para quem enxerga.
    const legenda = doc.querySelector("caption")?.textContent ?? "";
    expect(legenda).toContain("2 vagas");
    expect(legenda).toContain("Candidata 1");
    expect(legenda).toContain("Candidata 2");
    expect(legenda).not.toContain("Candidata 3");
  });
});

describe("<SerieApuracaoChart /> — RF-176: a tabela acessível", () => {
  const doc = parse(
    <SerieApuracaoChart
      eixo={eixoDe(3)}
      cadenciaMin={5}
      candidatos={[cand({ id: 13, apurado: [30, 31, 32], projetado: [33, 34, 35] })]}
      escopo="SP"
      titleId="a11y"
      height={ALTURA}
    />,
  );

  it("uma linha por instante do eixo", () => {
    expect(doc.querySelectorAll("tbody tr")).toHaveLength(3);
  });

  it("a hora é legível, nunca ISO cru", () => {
    const primeira = doc.querySelector("tbody tr th, tbody tr td")?.textContent ?? "";
    expect(primeira).not.toContain("T20:");
    expect(primeira).not.toContain("Z");
  });

  it("a legenda diz que a projeção não é oficial", () => {
    const legenda = doc.querySelector("caption")?.textContent ?? "";
    expect(legenda.toLowerCase()).toContain("projeção");
    expect(legenda.toLowerCase()).toContain("não");
  });

  it('o CABEÇALHO de cada coluna projetada diz "projeção", não só a legenda', () => {
    // Mutação que este teste mata: tirar a palavra do `<th>` e deixá-la só no
    // `<caption>`. O teste acima continuaria verde — foi essa a lacuna.
    //
    // Por que o `<th>` e não só a legenda (design § 7, regra 3): quem navega a
    // tabela com leitor de tela ouve o cabeçalho da coluna a cada célula, e
    // pode entrar na tabela por uma célula qualquer sem nunca ouvir a legenda.
    // Sem a palavra no cabeçalho, um número projetado é anunciado como se
    // fosse resultado apurado — que é a única coisa que esta spec não pode
    // deixar acontecer.
    const doisCandidatos = parse(
      <SerieApuracaoChart
        eixo={eixoDe(3)}
        cadenciaMin={5}
        candidatos={[
          cand({ id: 13, partido: "PT", apurado: [30, 31, 32], projetado: [33, 34, 35] }),
          cand({ id: 22, partido: "PL", apurado: [20, 21, 22], projetado: [23, 24, 25] }),
        ]}
        escopo="SP"
        titleId="a11y-th"
        height={ALTURA}
      />,
    );
    const cabecalhos = [...doisCandidatos.querySelectorAll('thead th[scope="col"]')].map(
      (th) => th.textContent ?? "",
    );

    // hora + (apurado, projeção) × 2 candidaturas
    expect(cabecalhos).toHaveLength(5);

    const deProjecao = cabecalhos.filter((t) => t.toLowerCase().includes("projeç"));
    const deApurado = cabecalhos.filter((t) => t.toLowerCase().includes("apurado"));

    // UMA coluna de projeção por candidatura — e ela nomeia de quem é, porque
    // um "projeção" solto não diz qual das quatro linhas está sendo lida.
    expect(deProjecao).toHaveLength(2);
    expect(deProjecao.some((t) => t.includes("Candidata 13"))).toBe(true);
    expect(deProjecao.some((t) => t.includes("Candidata 22"))).toBe(true);

    // 🔴 A asserção de contraste, e é ela que impede a mutação preguiçosa de
    // carimbar a palavra nos dois cabeçalhos do par: a coluna irmã é a apurada
    // e NÃO pode se dizer projeção. Sem esta linha, `th → "…— projeção"` em
    // todas as colunas passaria, e a tabela mentiria na direção contrária.
    expect(deApurado).toHaveLength(2);
    for (const t of deApurado) {
      expect(t.toLowerCase()).not.toContain("projeç");
    }
  });

  it("os traços ficam fora da árvore de acessibilidade", () => {
    const svg = doc.querySelector("svg");
    expect(svg?.getAttribute("role")).toBe("img");
  });
});
