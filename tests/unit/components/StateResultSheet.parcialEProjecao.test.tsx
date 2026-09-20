// @vitest-environment happy-dom
/**
 * tests/unit/components/StateResultSheet.parcialEProjecao.test.tsx
 *
 * 2026-09-20 — a ficha do mapa passa a mostrar **apurado e projetado** por
 * candidatura (decisão do dono: "a ficha do mapa deve mostrar apurado e
 * projetado; as fichas municipais só mostram o apurado").
 *
 * ## O que este arquivo tranca, e por que não é o óbvio
 *
 * "Os dois números aparecem" é a parte fácil e a menos perigosa. O risco real
 * está na **ausência**: `EdgeUfRow.top_candidatos[].pct_atual` é OPCIONAL e
 * falta em três situações legítimas (payload pré-2026-09-19,
 * `model_fallback_tier`, e UF sem nenhuma zona apurada em cargo 1, onde o
 * número vem de `impute_uf_from_national`). Um `?? 0` na formatação
 * transformaria "não temos o apurado desta candidatura" em "esta candidatura
 * teve 0,0%" — dois dos três estados que o dono separou em 14/09 (não começou
 * / não sabemos / apurando), colapsados num só, na tela de um resultado
 * eleitoral.
 *
 * E o remédio ingênuo para isso tem o defeito SIMÉTRICO: esconder a parcial
 * sempre que ela for falsy (`tc.pct_atual ? … : null`) apaga o **zero medido**,
 * que é um fato — "nenhum voto apurado para esta candidatura ainda". Por isso o
 * bloco 3 existe: sem ele, um teste que só cobre a ausência passa com a
 * implementação que também come o zero de verdade.
 *
 * ## A armadilha das fixtures, medida
 *
 * `tests/fixtures/simulacao/governador.json` tem `pct_atual` em **106 de 106**
 * `top_candidatos`; `tests/fixtures/edge-config/projection-current.json` e
 * `gov-current.json` têm em **0 de 81**. Ver a lição "fixture do simulado é
 * mais rica que produção": ver a tela certa no `dev:sim` não prova o caminho da
 * ausência, e rodar contra as fixtures de produção não prova o caminho do par.
 * Daí os quatro cenários abaixo serem construídos à mão, e um deles ser o
 * MISTO — que é o que um payload em transição produz e nenhuma das fixtures
 * tem.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StateResultSheet } from "@/components/blocks/StateResultSheet";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";

type Cargo = "pres" | "gov" | "sen";
const CARGOS: Cargo[] = ["pres", "gov", "sen"];
type Top = EdgeUfRow["top_candidatos"];

/**
 * Os números são todos DIFERENTES entre si — de propósito.
 *
 * Com `pct` e `pct_atual` parecidos (ou iguais), uma implementação que lesse o
 * campo errado nas duas colunas passaria: é a mesma armadilha nomeada no topo
 * de `tests/unit/components/serie-apuracao-chart.test.tsx`. Aqui a parcial da
 * 1ª candidatura (40,2%) é MENOR que a projeção dela (44,6%) e a da 2ª (33,8%)
 * é MAIOR que a projeção (31,2%): as duas bases andam em direções opostas, e
 * trocá-las não produz nenhum par plausível.
 */
const COMPLETO: Top = [
  { id: 15, pct: 44.6, pct_atual: 40.2, nome: "VALMIR DE FRANCISQUINHO", partido: "PODEMOS" },
  { id: 22, pct: 31.2, pct_atual: 33.8, nome: "WELLINGTON FAGUNDES", partido: "PT" },
  { id: 13, pct: 12.0, pct_atual: 14.7, nome: "MARIA DO CARMO", partido: "PL" },
];

/** Sem o campo em NENHUMA linha — payload pré-19/09 ou `model_fallback_tier`. */
const SEM_PARCIAL: Top = COMPLETO.map(({ pct_atual: _drop, ...resto }) => resto);

/** Payload em TRANSIÇÃO: 1ª e 3ª com o campo, 2ª sem. */
const MISTO: Top = COMPLETO.map((tc, i) =>
  i === 1 ? (({ pct_atual: _drop, ...resto }) => resto)(tc) : tc,
);

function row(top: Top): EdgeUfRow {
  return {
    sigla: "SP",
    pct_apurado: 42.5,
    lider: 15,
    margem_atual: 6.4,
    margem_projetada: 13.4,
    margem_projetada_ci: [10.0, 16.8],
    chamada: false,
    swing_vs_2022: null,
    top_candidatos: top,
    vai_a_2t: null,
    bucket: "indefinido",
  };
}

function parse(top: Top, cargo: Cargo = "pres"): Document {
  const html = renderToStaticMarkup(
    <StateResultSheet
      open
      onClose={() => {}}
      row={row(top)}
      candidatos={[] as EdgeCandidate[]}
      cargo={cargo}
    />,
  );
  return new DOMParser().parseFromString(html, "text/html");
}

function linhas(doc: Document): HTMLElement[] {
  return Array.from(
    doc.querySelectorAll<HTMLElement>("[data-testid='state-sheet-candidatos'] > li"),
  );
}

function celula(li: HTMLElement, qual: "parcial" | "proj"): HTMLElement | null {
  return li.querySelector<HTMLElement>(`[data-testid='state-sheet-cand-${qual}']`);
}

/** Todo percentual desenhado dentro de um `<li>`, na ordem do DOM. */
function percentuais(li: HTMLElement): string[] {
  return (li.textContent ?? "").match(/\d+,\d%/g) ?? [];
}

describe("<StateResultSheet /> — os dois números por candidatura", () => {
  // -------------------------------------------------------------------
  // 1. Com o dado completo: os DOIS aparecem, cada um no seu rótulo
  // -------------------------------------------------------------------

  it.each(CARGOS)('cargo="%s" — cada linha mostra parcial E projeção', (cargo) => {
    // 🔴 MUTAÇÃO ALVO (2 do briefing): apagar o bloco da parcial, ou o da
    // projeção, quando os dois existem. Qualquer um dos dois mata este caso.
    const li = linhas(parse(COMPLETO, cargo));
    expect(li).toHaveLength(3);
    for (const l of li) {
      expect(celula(l, "parcial")).not.toBeNull();
      expect(celula(l, "proj")).not.toBeNull();
      expect(percentuais(l)).toHaveLength(2);
    }
  });

  it("cada número está na SUA coluna — trocar as duas reprova", () => {
    // O par (40,2 parcial / 44,6 projeção) anda para CIMA e o par
    // (33,8 / 31,2) anda para BAIXO. Uma leitura trocada produziria
    // "44,6 parcial / 40,2 proj." na 1ª linha — que este caso reprova.
    const [primeira, segunda] = linhas(parse(COMPLETO));
    expect(primeira).toBeDefined();
    expect(segunda).toBeDefined();
    if (!primeira || !segunda) return;
    expect(celula(primeira, "parcial")?.textContent).toContain("40,2%");
    expect(celula(primeira, "proj")?.textContent).toContain("44,6%");
    expect(celula(segunda, "parcial")?.textContent).toContain("33,8%");
    expect(celula(segunda, "proj")?.textContent).toContain("31,2%");
  });

  it("os rótulos são as palavras do produto: 'parcial' e 'proj.'", () => {
    // `components/atoms/tables/CandidateResultRow.tsx` já usa exatamente estas
    // duas. Um sinônimo aqui ("apurado", "atual", "estimado") criaria um
    // segundo nome para a mesma coisa dentro do mesmo produto.
    const [primeira] = linhas(parse(COMPLETO));
    expect(primeira).toBeDefined();
    if (!primeira) return;
    expect((celula(primeira, "parcial")?.textContent ?? "").toLowerCase()).toContain("parcial");
    expect((celula(primeira, "proj")?.textContent ?? "").toLowerCase()).toContain("proj.");
  });

  it("'proj.' é desenhado mas NÃO audível; 'projeção' é audível mas não duplicado", () => {
    // Sem o `aria-hidden` na abreviação, o leitor de tela ouve "proj.
    // projeção" em cada linha — três vezes por ficha. Sem o `sr-only`, ouve
    // "proj." e precisa adivinhar.
    const [primeira] = linhas(parse(COMPLETO));
    expect(primeira).toBeDefined();
    if (!primeira) return;
    const proj = celula(primeira, "proj");
    const abreviado = Array.from(proj?.querySelectorAll("span") ?? []).find((s) =>
      (s.textContent ?? "").includes("proj."),
    );
    expect(abreviado?.getAttribute("aria-hidden")).toBe("true");
    const srOnly = Array.from(proj?.querySelectorAll(".sr-only") ?? [])
      .map((n) => n.textContent ?? "")
      .join(" ");
    expect(srOnly.toLowerCase()).toContain("projeção");
    expect(srOnly.toLowerCase()).not.toContain("proj.");
  });

  it("nenhum dos dois números sai da árvore de acessibilidade", () => {
    // Um `aria-hidden` num ancestral esconderia metade do resultado de quem
    // não enxerga, sem nenhum sinal na tela.
    for (const l of linhas(parse(COMPLETO))) {
      for (const qual of ["parcial", "proj"] as const) {
        let cur: Element | null = celula(l, qual);
        expect(cur).not.toBeNull();
        for (; cur && cur.tagName !== "BODY"; cur = cur.parentElement) {
          expect(cur.getAttribute("aria-hidden")).not.toBe("true");
        }
      }
    }
  });

  // -------------------------------------------------------------------
  // 2. 🔴 Sem `pct_atual`: só a projeção, e NUNCA um zero fabricado
  // -------------------------------------------------------------------

  it.each(CARGOS)('cargo="%s" — sem `pct_atual`, nenhuma célula de parcial', (cargo) => {
    for (const l of linhas(parse(SEM_PARCIAL, cargo))) {
      expect(celula(l, "parcial")).toBeNull();
      expect(celula(l, "proj")).not.toBeNull();
      expect(percentuais(l)).toHaveLength(1);
    }
  });

  it("🔴 sem `pct_atual`, a ficha NÃO escreve 0,0% em lugar nenhum da lista", () => {
    // 🔴 MUTAÇÃO ALVO (1 do briefing): `formatPercent(tc.pct_atual ?? 0, 1)`
    // com a célula sempre presente. A ficha passaria a afirmar que três
    // candidaturas tiveram zero voto apurado — um resultado eleitoral
    // inventado. Este é o caso que morre.
    const lista = parse(SEM_PARCIAL).querySelector("[data-testid='state-sheet-candidatos']");
    expect(lista?.textContent).not.toContain("0,0%");
    // E a palavra também não pode sobrar sozinha: um rótulo "parcial" sem
    // número ao lado é a mesma afirmação, escrita de outro jeito.
    expect((lista?.textContent ?? "").toLowerCase()).not.toContain("parcial");
  });

  it("sem `pct_atual`, a PROJEÇÃO continua inteira — a ausência não leva a linha junto", () => {
    const lista = parse(SEM_PARCIAL).querySelector("[data-testid='state-sheet-candidatos']");
    for (const esperado of ["44,6%", "31,2%", "12,0%"]) {
      expect(lista?.textContent).toContain(esperado);
    }
  });

  // -------------------------------------------------------------------
  // 3. 🔴 O zero MEDIDO é um fato e continua na tela
  // -------------------------------------------------------------------

  it("`pct_atual: 0` é um FATO e aparece como 0,0% — não é tratado como ausência", () => {
    // 🔴 MUTAÇÃO ALVO: `tc.pct_atual ? <parcial/> : null`. Essa implementação
    // passa em TODOS os casos do bloco 2 e falha só aqui — é o caso que separa
    // "não medimos" de "medimos zero". Sem ele, o remédio para o zero
    // fabricado vira o defeito espelhado: apagar o zero verdadeiro.
    const [zerada] = linhas(
      parse([{ id: 99, pct: 3.4, pct_atual: 0, nome: "AINDA SEM VOTO", partido: "PSOL" }]),
    );
    expect(zerada).toBeDefined();
    if (!zerada) return;
    expect(celula(zerada, "parcial")).not.toBeNull();
    expect(celula(zerada, "parcial")?.textContent).toContain("0,0%");
  });

  // -------------------------------------------------------------------
  // 4. 🔴 Payload em TRANSIÇÃO — o caso que nenhuma fixture do repo tem
  // -------------------------------------------------------------------

  it("misto: a decisão é POR LINHA, não pela lista inteira", () => {
    // Uma implementação que decidisse uma vez para a ficha toda ("alguma linha
    // tem o campo? então mostra a coluna") ou desenharia 0,0% na 2ª ou
    // apagaria a parcial das outras duas. As duas saídas morrem aqui.
    const li = linhas(parse(MISTO));
    expect(li).toHaveLength(3);
    const temParcial = li.map((l) => celula(l, "parcial") !== null);
    expect(temParcial).toEqual([true, false, true]);
    expect(li[1]?.textContent).not.toContain("0,0%");
    expect(li[0]?.textContent).toContain("40,2%");
    expect(li[2]?.textContent).toContain("14,7%");
  });

  // -------------------------------------------------------------------
  // 5. Não regride o que já estava certo
  // -------------------------------------------------------------------

  it("as <Figure> do topo seguem intactas — 'Apurado' é da UF, não da candidatura", () => {
    const doc = parse(COMPLETO);
    expect(doc.body.textContent).toContain("Apurado");
    expect(doc.body.textContent).toContain("42,5%");
  });

  it("nenhum hex literal no markup (constituição § 2)", () => {
    const html = renderToStaticMarkup(
      <StateResultSheet
        open
        onClose={() => {}}
        row={row(COMPLETO)}
        candidatos={[] as EdgeCandidate[]}
        cargo="sen"
      />,
    );
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("nenhuma <table> na ficha — `sr-only` dentro de tabela empurra a página", () => {
    // Regra de 2026-09-19: `sr-only` depende de `width:1px`, e `<table>` trata
    // largura como MÍNIMO. A ficha ganhou `sr-only` novo nesta passada, então
    // a guarda vale de novo. Ver `tests/unit/design-system/sr-only-tabela.test.ts`.
    expect(parse(COMPLETO).querySelectorAll("table")).toHaveLength(0);
  });

  it("o nome NÃO trunca — a linha cresce, o nome não corta", () => {
    // Medido no Chromium a 360px em 20/09: com os dois números à DIREITA do
    // nome, 3 de 4 candidaturas reais truncavam; com os números na própria
    // linha, 0 de 4. O que este caso unitário consegue travar é a causa
    // estrutural — `truncate` (que é `overflow:hidden` + reticências) de volta
    // no nome. `getBoundingClientRect` zera no happy-dom, então medir layout
    // aqui seria fingir; a classe é o que resta e é o que basta.
    for (const l of linhas(parse(COMPLETO))) {
      const nome = l.querySelector("[data-testid='state-sheet-cand-nome']");
      expect(nome).not.toBeNull();
      expect(nome?.className ?? "").not.toContain("truncate");
    }
  });
});
