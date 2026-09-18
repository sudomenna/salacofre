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

function render(cargo: "pres" | "gov" | "sen"): Document {
  return parse(
    <StateResultSheet
      open
      onClose={() => {}}
      row={ROW_3_CANDIDATOS}
      candidatos={CANDIDATOS}
      cargo={cargo}
    />,
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
    const linhas = Array.from(
      doc.querySelectorAll<HTMLElement>("[data-testid='state-sheet-candidatos'] > li"),
    );
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
