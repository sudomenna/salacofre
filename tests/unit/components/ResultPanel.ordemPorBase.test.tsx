// @vitest-environment happy-dom
/**
 * tests/unit/components/ResultPanel.ordemPorBase.test.tsx
 *
 * "Tudo acompanha a base ativa" (decisão do dono, 2026-09-20).
 *
 * Até aqui a home ordenava a lista por PROJEÇÃO (a ordem que o produtor
 * publica) e as três rotas de UF ordenavam por PARCIAL, e nenhuma das duas
 * reagia ao controle "Parcial / Projeção" do shell. Agora as quatro telas
 * seguem a base que está na tela — lista, numeração, destaque de margem e
 * ocupação de vaga.
 *
 * ## Como se testa uma ordem que o CSS resolve
 *
 * `data-view` é estado de cliente e as rotas são estáticas (ADR-0025 §§ 2 e
 * 5), então o servidor emite UMA lista, na ordem da projeção, e a cascata de
 * `app/globals.css` reposiciona as linhas com `order` quando a base é
 * "Parcial". O happy-dom não faz layout — `getBoundingClientRect()` devolve
 * zeros —, então **não se mede pixel aqui**. Mede-se o contrato dos dois
 * lados, e os dois estão neste arquivo:
 *
 *   1. o que o componente EMITE: `--ord-parcial` / `--ord-proj` por linha,
 *      os dois números da esquerda, os dois marcadores de vaga;
 *   2. o que a folha de estilo LÊ: a regra de `app/globals.css` que liga cada
 *      custom property à sua base. Sem (2), apagar a regra — ou trocar as duas
 *      propriedades entre si — deixaria (1) verde com a tela congelada numa
 *      base só.
 *
 * ## A fixture
 *
 * As duas ordens são invertidas de ponta a ponta, de propósito: qualquer
 * asserção que "passe pelas duas" por coincidência aqui estaria medindo a
 * fixture, não o código.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResultPanel, type ResultPanelCandidate } from "@/components/blocks/ResultPanel";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function cand(
  id: number,
  nome: string,
  partido: string,
  pctAtual: number,
  pctProjetado: number,
): ResultPanelCandidate {
  return {
    id,
    nome,
    partido,
    cor: `var(--color-cand-${id})`,
    votos_atuais: Math.round(pctAtual * 10_000),
    pct_atual: pctAtual,
    pct_projetado: pctProjetado,
  };
}

/**
 * Quatro candidaturas em que as duas bases discordam em TODAS as posições:
 *
 *   por `pct_atual`     → Célia (60) · Bruno (20) · Ana (10) · Davi (2)
 *   por `pct_projetado` → Ana (40)   · Bruno (30) · Célia (29) · Davi (1)
 */
const INVERTIDA: ResultPanelCandidate[] = [
  cand(1, "Ana Lima", "PT", 10, 40),
  cand(2, "Bruno Reis", "PL", 20, 30),
  cand(3, "Célia Mota", "MDB", 60, 29),
  cand(4, "Davi Nunes", "PSOL", 2, 1),
];

/** As linhas na ordem de uma base, lidas pela custom property que o CSS usa. */
function ordemDaBase(doc: Document, base: "parcial" | "proj"): string[] {
  const linhas = [...doc.querySelectorAll("li[data-ord]")];
  return linhas
    .map((li) => {
      const style = li.getAttribute("style") ?? "";
      const m = style.match(new RegExp(`--ord-${base}:\\s*(\\d+)`));
      return { pos: m ? Number(m[1]) : Number.NaN, nome: li.textContent ?? "" };
    })
    .sort((a, b) => a.pos - b.pos)
    .map((x) => x.nome);
}

/**
 * A CÉLULA do número à esquerda — e não a linha inteira.
 *
 * A linha tem outros `data-view-only` dentro (a barra de cada base), então uma
 * busca no `<li>` mediria a coisa errada. O número é o primeiro item da grade
 * de quatro faixas de `<CandidateResultRow>`.
 */
function celulaDoNumero(doc: Document, nomeCompleto: string): Element | null | undefined {
  return [...doc.querySelectorAll("li[data-ord]")]
    .find((li) => li.textContent?.includes(nomeCompleto))
    ?.querySelector('[data-testid="candidate-result-row"] > span[aria-hidden="true"]');
}

function renderPainel(over: Partial<React.ComponentProps<typeof ResultPanel>> = {}) {
  return parse(
    <ResultPanel candidatos={INVERTIDA} pctApurado={62} title="SP" titleId="t" {...over} />,
  );
}

describe("<ResultPanel /> — a ordem da lista acompanha a base ativa", () => {
  it("(a) na base `parcial` a ordem é a de `pct_atual` desc", () => {
    const nomes = ordemDaBase(renderPainel(), "parcial");

    expect(nomes[0]).toContain("Célia Mota");
    expect(nomes[1]).toContain("Bruno Reis");
    expect(nomes[2]).toContain("Ana Lima");
    expect(nomes[3]).toContain("Davi Nunes");
  });

  it("(b) na base `proj` a ordem é a de `pct_projetado` desc", () => {
    const nomes = ordemDaBase(renderPainel(), "proj");

    expect(nomes[0]).toContain("Ana Lima");
    expect(nomes[1]).toContain("Bruno Reis");
    expect(nomes[2]).toContain("Célia Mota");
    expect(nomes[3]).toContain("Davi Nunes");
  });

  it("(c) a ordem do DOM é a da PROJEÇÃO, e a linha declara isso", () => {
    // Não é detalhe: é a ordem em que a página abre (o servidor escreve
    // `data-view="proj"` no `<html>`) e a que leitor de tela e `Ctrl+F` veem.
    const doc = renderPainel();
    const linhas = [...doc.querySelectorAll("li[data-ord]")];

    expect(linhas.map((li) => li.getAttribute("data-ord"))).toEqual([
      "proj",
      "proj",
      "proj",
      "proj",
    ]);
    expect(linhas[0]?.textContent).toContain("Ana Lima");
    expect(linhas[2]?.textContent).toContain("Célia Mota");
  });

  it("(d) a cascata que lê as duas propriedades existe, e não está trocada", () => {
    // Contraparte obrigatória de (a)/(b): sem esta regra, as custom properties
    // são decoração e a lista fica congelada na ordem do DOM.
    const css = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf-8").replace(
      /\s+/g,
      " ",
    );

    expect(css).toContain(':root[data-view="parcial"] [data-ord] { order: var(--ord-parcial); }');
    expect(css).toContain(':root[data-view="proj"] [data-ord] { order: var(--ord-proj); }');
  });
});

describe("<ResultPanel /> — o número da esquerda acompanha a base", () => {
  it("(e) cada linha carrega as DUAS posições, cada uma sob a sua base", () => {
    // Ana é a 1ª na projeção e a 3ª na parcial.
    const ana = celulaDoNumero(renderPainel(), "Ana Lima");

    expect(ana?.querySelector('[data-view-only="parcial"]')?.textContent).toBe("3");
    expect(ana?.querySelector('[data-view-only="proj"]')?.textContent).toBe("1");
  });

  it("(f) quando as duas posições coincidem, sai UM número só", () => {
    // Bruno é o 2º nas duas bases — a linha não paga nós por uma diferença
    // que não existe. Idem para uma corrida em que ninguém troca de lugar.
    const bruno = celulaDoNumero(renderPainel(), "Bruno Reis");

    expect(bruno?.querySelectorAll("[data-view-only]")).toHaveLength(0);
    expect(bruno?.textContent).toBe("2");
  });

  it("(g) o número NÃO vem do `rank` do payload quando ele contradiz a base", () => {
    // Na home o payload traz `rank` (a colocação na projeção). Se a linha o
    // imprimisse direto, a base parcial mostraria "2, 1, 3" de cima para baixo:
    // texto de uma base, posição de outra.
    const comRank = INVERTIDA.map((c, i) => ({ ...c, rank: i + 1 }));
    const doc = parse(<ResultPanel candidatos={comRank} pctApurado={62} title="BR" titleId="t" />);
    const celia = celulaDoNumero(doc, "Célia Mota");

    // Célia é a 1ª na parcial e a 3ª na projeção — e o `rank` do payload dela
    // é 3. O número da base parcial tem de ser 1.
    expect(celia?.querySelector('[data-view-only="parcial"]')?.textContent).toBe("1");
    expect(celia?.querySelector('[data-view-only="proj"]')?.textContent).toBe("3");
  });
});

describe("<ResultPanel /> — o destaque de margem acompanha a base", () => {
  it("(h) cada figura mede o par DAQUELA base, e o rótulo nomeia o líder dela", () => {
    const doc = renderPainel();
    const parcial = doc.querySelector("[data-testid='result-margem-parcial']")?.textContent ?? "";
    const proj = doc.querySelector("[data-testid='result-margem-proj']")?.textContent ?? "";

    // Parcial: Célia 60 − Bruno 20 = 40 pp.
    expect(parcial).toContain("40,0");
    expect(parcial.toLowerCase()).toContain("margem célia");
    // Projeção: Ana 40 − Bruno 30 = 10 pp.
    expect(proj).toContain("10,0");
    expect(proj.toLowerCase()).toContain("margem ana");

    // 🔴 O defeito que isto mata: a figura de projeção mostrando o número
    // projetado sob o nome de quem lidera a PARCIAL.
    expect(proj.toLowerCase()).not.toContain("margem célia");
  });

  it("(i) cada barra de maioria desenha o líder e o 2º da sua base", () => {
    const doc = renderPainel();
    const rotulos = (base: string) =>
      [
        ...(doc
          .querySelector(`[data-view-only="${base}"] [data-testid="vote-bar"]`)
          ?.querySelectorAll("[data-testid='vote-bar-segment']") ?? []),
      ].map((s) => s.getAttribute("data-label"));

    expect(rotulos("parcial")).toEqual(["Célia", "Outros", "Bruno"]);
    expect(rotulos("proj")).toEqual(["Ana", "Outros", "Bruno"]);
  });
});

describe("<ResultPanel vagas={2} /> — a ocupação de vaga acompanha a base", () => {
  const renderSenado = () => renderPainel({ vagas: 2 });

  it("(j) quem ocupa vaga em uma base só é marcado só naquela base", () => {
    const doc = renderSenado();
    const li = (nome: string) =>
      [...doc.querySelectorAll("li[data-ord]")].find((x) => x.textContent?.includes(nome));

    // Projeção elege Ana e Bruno; parcial elege Célia e Bruno.
    expect(li("Ana Lima")?.getAttribute("data-vaga")).toBe("proj");
    expect(li("Bruno Reis")?.getAttribute("data-vaga")).toBe("true");
    expect(li("Célia Mota")?.getAttribute("data-vaga")).toBe("parcial");
    expect(li("Davi Nunes")?.getAttribute("data-vaga")).toBeNull();
  });

  it("(k) o marcador exclusivo de uma base só aparece naquela base", () => {
    const doc = renderSenado();
    const ana = [...doc.querySelectorAll("li[data-ord]")].find((x) =>
      x.textContent?.includes("Ana Lima"),
    );
    const marcador = ana?.querySelector("[data-testid='result-vaga-marker']");

    expect(marcador?.parentElement?.getAttribute("data-view-only")).toBe("proj");
  });

  it("(l) o RÓTULO do marcador concorda com a base que está na tela", () => {
    // Uma tela dizendo "vaga projetada" embaixo de números parciais seria pior
    // que o defeito que esta mudança corrige.
    const doc = renderSenado();
    const texto = (nome: string) =>
      (
        [...doc.querySelectorAll("li[data-ord]")]
          .find((x) => x.textContent?.includes(nome))
          ?.querySelector("[data-testid='result-vaga-marker']")?.textContent ?? ""
      ).toLowerCase();

    expect(texto("Célia Mota")).toContain("parcial");
    expect(texto("Célia Mota")).not.toContain("projetada");
    expect(texto("Ana Lima")).toContain("projetada");

    // Bruno ocupa nas duas: os dois rótulos ficam no DOM, cada um sob a sua
    // base — nunca os dois visíveis ao mesmo tempo.
    const bruno = [...doc.querySelectorAll("li[data-ord]")].find((x) =>
      x.textContent?.includes("Bruno Reis"),
    );
    const marcadorBruno = bruno?.querySelector("[data-testid='result-vaga-marker']");
    expect(marcadorBruno?.querySelector('[data-view-only="parcial"]')?.textContent).toMatch(
      /parcial/i,
    );
    expect(marcadorBruno?.querySelector('[data-view-only="proj"]')?.textContent).toMatch(
      /projetada/i,
    );
  });
});

describe("<ResultPanel /> — a COR não acompanha a base (constituição § 2)", () => {
  /**
   * Siglas fora da paleta editorial do ADR-0024, para forçar o caminho de
   * fallback de `candidateColor` — `colorForRank`. É o único caminho em que a
   * cor depende de posição, e por isso o único em que a troca de base poderia
   * trocar a tinta de alguém no meio da noite.
   */
  const SEM_PARTIDO_MAPEADO: ResultPanelCandidate[] = [
    cand(1, "Ana Lima", "ZZZ", 10, 40),
    cand(2, "Bruno Reis", "YYY", 20, 30),
    cand(3, "Célia Mota", "WWW", 60, 29),
  ];

  /** Toda cor `--color-cand-N` que o painel atribuiu a esta candidatura. */
  function coresDe(doc: Document, primeiroNome: string, nomeCompleto: string): Set<string> {
    const achadas = new Set<string>();
    const linha = [...doc.querySelectorAll("li[data-ord]")].find((li) =>
      li.textContent?.includes(nomeCompleto),
    );
    for (const m of (linha?.innerHTML ?? "").matchAll(/var\(--color-cand-[\w-]+\)/g)) {
      achadas.add(m[0]);
    }
    for (const seg of doc.querySelectorAll(
      `[data-testid="vote-bar-segment"][data-label="${primeiroNome}"]`,
    )) {
      for (const m of (seg.getAttribute("style") ?? "").matchAll(/var\(--color-cand-[\w-]+\)/g)) {
        achadas.add(m[0]);
      }
    }
    return achadas;
  }

  it("(m) cada candidatura sem partido mapeado tem UMA cor, igual nas duas bases", () => {
    const doc = parse(
      <ResultPanel candidatos={SEM_PARTIDO_MAPEADO} pctApurado={62} title="SP" titleId="t" />,
    );

    // Ana lidera a PROJEÇÃO e Célia lidera a PARCIAL. Se a cor viesse da
    // posição corrente, a barra de projeção pintaria Ana com a cor do 1º e a
    // de parcial pintaria Célia com a MESMA cor — e a linha de pelo menos uma
    // das duas discordaria da barra dela.
    const ana = coresDe(doc, "Ana", "Ana Lima");
    const celia = coresDe(doc, "Célia", "Célia Mota");
    const bruno = coresDe(doc, "Bruno", "Bruno Reis");

    expect(ana.size).toBe(1);
    expect(celia.size).toBe(1);
    expect(bruno.size).toBe(1);

    // E as três tintas são distintas entre si: ninguém herda a cor de outro ao
    // trocar de base.
    expect(new Set([...ana, ...celia, ...bruno]).size).toBe(3);
  });

  it("(n) a cor da candidatura NÃO muda quando a corrida vira do avesso", () => {
    // Mesmíssimas pessoas, mesmo apurado, projeção invertida. A cor é presa a
    // uma base estável (o `rank` do payload quando existe; a posição no
    // apurado quando não), então ela não pode se mexer por causa da projeção.
    const projInvertida = SEM_PARTIDO_MAPEADO.map((c) => ({
      ...c,
      pct_projetado: 100 - c.pct_projetado,
    }));
    const antes = parse(
      <ResultPanel candidatos={SEM_PARTIDO_MAPEADO} pctApurado={62} title="SP" titleId="t" />,
    );
    const depois = parse(
      <ResultPanel candidatos={projInvertida} pctApurado={62} title="SP" titleId="t" />,
    );

    for (const [curto, completo] of [
      ["Ana", "Ana Lima"],
      ["Bruno", "Bruno Reis"],
      ["Célia", "Célia Mota"],
    ] as const) {
      expect([...coresDe(depois, curto, completo)]).toEqual([...coresDe(antes, curto, completo)]);
    }
  });
});

describe('<ResultPanel variant="identidade" /> — a fase pré NÃO reordena', () => {
  it("(o) a ordem é a que quem chama passou: o número na urna (RF-161)", () => {
    // Em fase pré todo `pct` é zero e a ordem é a do número na urna, crescente
    // — quem a fixa é a página (`app/(pres)/page.tsx`). Se o painel ordenasse
    // aqui, ordenaria pelo desempate e produziria o falso favoritismo estável
    // que o RF-161 existe para não haver.
    const zerados: ResultPanelCandidate[] = [
      cand(12, "Ana Lima", "PT", 0, 0),
      cand(13, "Bruno Reis", "PL", 0, 0),
      cand(15, "Célia Mota", "MDB", 0, 0),
    ];
    const doc = parse(
      <ResultPanel
        candidatos={zerados}
        pctApurado={0}
        title="BR"
        titleId="t"
        variant="identidade"
      />,
    );
    const linhas = [...doc.querySelectorAll("[data-testid='result-identidade-lista'] li")];

    expect(linhas.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Ana Lima"),
      expect.stringContaining("Bruno Reis"),
      expect.stringContaining("Célia Mota"),
    ]);
    // E nenhuma linha carrega posição nem `order`: não há ranking a exibir.
    expect(doc.querySelectorAll("li[data-ord]")).toHaveLength(0);
  });
});

describe("<ResultPanel /> — o colapso clipa 6 linhas EM CADA base", () => {
  it("(p) as excedentes de cada base são marcadas separadamente", () => {
    // Nove candidaturas em que as duas ordens discordam no corte do `limit`:
    // quem é 7º no apurado é 2º na projeção.
    const nove: ResultPanelCandidate[] = [
      cand(1, "Um", "PT", 30, 5),
      cand(2, "Dois", "PL", 28, 4),
      cand(3, "Tres", "MDB", 26, 3),
      cand(4, "Quatro", "PSD", 24, 2),
      cand(5, "Cinco", "PDT", 22, 1),
      cand(6, "Seis", "PSB", 20, 0.5),
      cand(7, "Sete", "NOVO", 2, 90),
      cand(8, "Oito", "PP", 1, 80),
      cand(9, "Nove", "PV", 0.5, 70),
    ];
    const doc = parse(<ResultPanel candidatos={nove} pctApurado={62} title="SP" titleId="t" />);

    expect(doc.querySelectorAll('[data-extra-row~="parcial"]')).toHaveLength(3);
    expect(doc.querySelectorAll('[data-extra-row~="proj"]')).toHaveLength(3);

    // E são conjuntos DIFERENTES — é isso que o clip por base resolve.
    const nomes = (base: string) =>
      [...doc.querySelectorAll(`[data-extra-row~="${base}"]`)].map((li) =>
        (li.textContent ?? "").slice(0, 12),
      );
    expect(nomes("parcial")).not.toEqual(nomes("proj"));

    // A regra que clipa mora em `app/globals.css` e é por base.
    const css = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf-8").replace(
      /\s+/g,
      " ",
    );
    expect(css).toContain(
      ':root[data-view="parcial"] [data-collapsed="true"] > [data-extra-row~="parcial"]',
    );
    expect(css).toContain(
      ':root[data-view="proj"] [data-collapsed="true"] > [data-extra-row~="proj"]',
    );
  });
});
