// @vitest-environment happy-dom
/**
 * tests/unit/components/StateResultSheet.rf105Rf106.test.tsx
 *
 * 2026-09-18 (3ª rodada) — a ficha de estado (`<StateResultSheet>`, aberta ao
 * clicar numa UF no mapa nacional) ganha dois requisitos da spec 016 que ela
 * não tinha:
 *
 *   - **RF-105** — em Senado (2 vagas por UF) não há hierarquia entre 1º e
 *     2º colocado. A antiga linha "Líder: <nome>" dava tratamento especial
 *     só ao 1º — esta rodada substitui por um marcador (`<VagaBadge>`,
 *     reaproveitado de `ResultPanel.tsx`) nas DUAS primeiras linhas do
 *     ranking, com o MESMO tratamento. Presidente/Governador (1 vaga)
 *     continuam sem marcador nenhum.
 *   - **RF-106** — "2 vagas por estado" precisa estar em QUALQUER tela de
 *     Senador. A ficha cobre o resto da página quando aberta (mobile: bottom
 *     sheet; desktop: cartão sobre o mapa) — sem o texto aqui, abri-la
 *     esconderia justamente o aviso que justifica pintar o mapa pelo 1º
 *     colocado.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StateResultSheet } from "@/components/blocks/StateResultSheet";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

const CANDIDATOS: EdgeCandidate[] = [13, 22, 99].map(
  (id, i) =>
    ({
      id,
      nome: `Candidato ${id}`,
      partido: ["PT", "PL", "PSOL"][i],
      cor: "var(--color-cand-1)",
      votos_atuais: 1,
      votos_projetados: 1,
      pct_atual: 40 - i * 10,
      pct_projetado: 40 - i * 10,
      pct_projetado_lower: 0,
      pct_projetado_upper: 100,
      p_vitoria: 0.3,
      rank: i + 1,
      p_passa_2t: 0.3,
      p_fecha_1t: 0,
    }) as EdgeCandidate,
);

const ROW_3_CANDIDATOS: EdgeUfRow = {
  sigla: "SP",
  pct_apurado: 40,
  lider: 13,
  margem_atual: 10,
  margem_projetada: 10,
  margem_projetada_ci: [8, 12],
  chamada: false,
  swing_vs_2022: null,
  top_candidatos: [
    { id: 13, pct: 40, nome: "FERNANDA DA SILVA", partido: "PT", sqcand: "1" },
    { id: 22, pct: 30, nome: "MARCOS DE OLIVEIRA", partido: "PL", sqcand: "2" },
    { id: 99, pct: 29, nome: "TERCEIRO COLOCADO", partido: "PSOL", sqcand: "3" },
  ],
  vai_a_2t: null,
  bucket: "indefinido",
};

/**
 * A MESMA UF num payload de 2026-09-19 em diante: `top_candidatos` passou de 3
 * para 4 entradas (`TOP_CANDIDATOS_POR_UF = 4`, `api/model/project.py`, por
 * decisão do dono de mostrar quatro candidaturas nas telas de resumo de UF).
 *
 * 🔴 Esta fixture existe porque `ROW_3_CANDIDATOS` **não discrimina a
 * mudança**: com três itens de entrada, `toHaveLength(3)` continua verde tanto
 * com a ficha cortando em 3 quanto sem corte nenhum. Só uma fixture de 4
 * distingue os dois comportamentos — e a ficha nunca teve `.slice()`, então
 * sem este caso a cobertura descreveria um produto que não existe mais.
 */
const ROW_4_CANDIDATOS: EdgeUfRow = {
  ...ROW_3_CANDIDATOS,
  top_candidatos: [
    ...ROW_3_CANDIDATOS.top_candidatos,
    { id: 44, pct: 1, nome: "QUARTO COLOCADO", partido: "NOVO", sqcand: "4" },
  ],
};

function render(cargo: "pres" | "gov" | "sen", row: EdgeUfRow = ROW_3_CANDIDATOS): Document {
  return parse(
    <StateResultSheet open onClose={() => {}} row={row} candidatos={CANDIDATOS} cargo={cargo} />,
  );
}

function linhasDoRanking(doc: Document): HTMLElement[] {
  return Array.from(
    doc.querySelectorAll<HTMLElement>("[data-testid='state-sheet-candidatos'] > li"),
  );
}

describe("<StateResultSheet /> — RF-105: marcador de vaga sem hierarquia entre 1º e 2º", () => {
  it('cargo="sen" — EXATAMENTE 2 linhas carregam o marcador de vaga', () => {
    // Mutação: trocar `index < vagas` por `index === 0` (só o 1º) ou remover
    // `multiVaga &&` (todas as 3 linhas) faz este teste falhar.
    const doc = render("sen");
    const marcadores = doc.querySelectorAll('[data-testid="result-vaga-marker"]');
    expect(marcadores).toHaveLength(2);
  });

  it('cargo="sen" — as vagas marcadas são a 1ª e a 2ª linha do ranking, não a 2ª e a 3ª', () => {
    const doc = render("sen");
    const linhas = linhasDoRanking(doc);
    expect(linhas).toHaveLength(3);
    expect(linhas[0]?.querySelector('[data-testid="result-vaga-marker"]')).not.toBeNull();
    expect(linhas[1]?.querySelector('[data-testid="result-vaga-marker"]')).not.toBeNull();
    expect(linhas[2]?.querySelector('[data-testid="result-vaga-marker"]')).toBeNull();
  });

  it('cargo="pres" e "gov" — ZERO marcadores de vaga (não regride: 1 vaga não tem "ocupantes")', () => {
    for (const cargo of ["pres", "gov"] as const) {
      const doc = render(cargo);
      expect(doc.querySelectorAll('[data-testid="result-vaga-marker"]')).toHaveLength(0);
    }
  });

  it('cargo="sen" — a linha "Líder:" isolada NÃO existe mais (era o tratamento hierárquico que RF-105 proíbe)', () => {
    const doc = render("sen");
    expect(doc.querySelector('[data-testid="state-sheet-lider"]')).toBeNull();
  });

  it('cargo="pres" e "gov" — a linha "Líder:" CONTINUA existindo (1 vaga: o líder é o único ocupante)', () => {
    for (const cargo of ["pres", "gov"] as const) {
      const doc = render(cargo);
      expect(doc.querySelector('[data-testid="state-sheet-lider"]')).not.toBeNull();
    }
  });

  // -------------------------------------------------------------------
  // 2026-09-19 — payload com QUATRO candidaturas por UF (decisão do dono).
  //
  // A ficha nunca cortou o array (`row.top_candidatos.map(...)`, sem
  // `.slice()`), então as quatro linhas saem "de graça". O que NÃO sai de
  // graça é a prova: os casos acima rodam sobre uma fixture de 3 e ficariam
  // verdes tanto com corte quanto sem.
  // -------------------------------------------------------------------

  it("payload com 4 candidaturas → a gaveta renderiza as QUATRO linhas", () => {
    // Mutação alvo: introduzir `.slice(0, 3)` (ou qualquer corte) no
    // `row.top_candidatos.map(...)` de `StateResultSheet.tsx`.
    const doc = render("sen", ROW_4_CANDIDATOS);
    expect(linhasDoRanking(doc)).toHaveLength(4);
    expect(doc.body.textContent ?? "").toContain("QUARTO COLOCADO");
  });

  it('cargo="sen" com 4 candidaturas → ainda EXATAMENTE 2 marcadores, e nas duas primeiras linhas', () => {
    // O marcador é contado do TOPO (`index < vagas`). Mutação alvo: trocar por
    // uma regra escrita de trás para frente ("todas menos a última"), que com
    // três entradas produzia o mesmo resultado e com quatro marcaria três
    // ocupantes para duas cadeiras.
    const doc = render("sen", ROW_4_CANDIDATOS);
    const linhas = linhasDoRanking(doc);

    expect(doc.querySelectorAll('[data-testid="result-vaga-marker"]')).toHaveLength(2);
    expect(linhas[0]?.querySelector('[data-testid="result-vaga-marker"]')).not.toBeNull();
    expect(linhas[1]?.querySelector('[data-testid="result-vaga-marker"]')).not.toBeNull();
    expect(linhas[2]?.querySelector('[data-testid="result-vaga-marker"]')).toBeNull();
    expect(linhas[3]?.querySelector('[data-testid="result-vaga-marker"]')).toBeNull();
  });

  it('cargo="pres" e "gov" com 4 candidaturas → ZERO marcadores (1 vaga não tem "ocupantes")', () => {
    for (const cargo of ["pres", "gov"] as const) {
      const doc = render(cargo, ROW_4_CANDIDATOS);
      expect(linhasDoRanking(doc)).toHaveLength(4);
      expect(doc.querySelectorAll('[data-testid="result-vaga-marker"]')).toHaveLength(0);
    }
  });
});

describe('<StateResultSheet /> — RF-106: "2 vagas por estado" em toda tela de Senador', () => {
  it('cargo="sen" — o texto "2 vagas por estado" está presente', () => {
    // Mutação: remover o bloco `{multiVaga ? <p>...</p> : null}` faz este
    // teste falhar.
    const doc = render("sen");
    expect(doc.body.textContent).toContain("2 vagas por estado");
  });

  it('cargo="pres" e "gov" — o texto NÃO aparece (1 vaga por estado, não 2)', () => {
    for (const cargo of ["pres", "gov"] as const) {
      const doc = render(cargo);
      expect(doc.body.textContent).not.toContain("2 vagas por estado");
    }
  });
});
