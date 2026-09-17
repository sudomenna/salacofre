// @vitest-environment happy-dom
/**
 * tests/unit/components/RaceTypeIndicator.preEleicao.test.tsx — RF-156.
 *
 * **M7** — o teste roda os dois modos **sobre o mesmo array** e exige números
 * diferentes. Um teste só do modo pré passaria com `PCT_THRESHOLD_1T` removido
 * de vez, e aí a contagem honesta de 04/10 ("quantos são competitivos") viraria
 * "quantos estão no JSON".
 *
 * A cobertura geral do componente continua em `RaceTypeIndicator.test.tsx`;
 * este arquivo é só a fase pré e o par que a discrimina.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RaceTypeIndicator } from "@/components/atoms/badges/RaceTypeIndicator";
import {
  candidatosComProjecao,
  candidatosZerados,
  NOMES_PRESIDENCIAIS,
} from "@/tests/fixtures/spec-019/payloads";

function texto(node: React.ReactElement): string {
  const doc = new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
  return doc.body.textContent ?? "";
}

describe("RF-156 — conta quem concorre, não quem pontuou", () => {
  it("(M7) o MESMO array produz 12 em fase pré e 7 em fase normal", () => {
    const candidatos = candidatosComProjecao();
    const acimaDoLimiar = candidatos.filter((c) => c.pct_projetado >= 0.5).length;

    // O array tem de ser capaz de separar os dois modos — senão o teste
    // compara 12 com 12 e não prova nada.
    expect(acimaDoLimiar).toBe(7);
    expect(candidatos).toHaveLength(12);

    const pre = texto(<RaceTypeIndicator candidatos={candidatos} preEleicao turno={1} />);
    const normal = texto(<RaceTypeIndicator candidatos={candidatos} turno={1} />);

    expect(pre).toBe("Disputa entre 12 candidatos");
    expect(normal).toBe(`Disputa entre ${acimaDoLimiar} candidatos`);
    expect(pre).not.toBe(normal);
  });

  it('com 12 candidaturas zeradas, fase pré diz 12 — hoje diria "0"', () => {
    const zerados = candidatosZerados();
    expect(zerados.every((c) => c.pct_projetado === 0)).toBe(true);

    expect(texto(<RaceTypeIndicator candidatos={zerados} preEleicao turno={1} />)).toBe(
      `Disputa entre ${NOMES_PRESIDENCIAIS.length} candidatos`,
    );
    // O par que prova que o limiar continua existindo: o mesmo array em modo
    // normal produz a contagem estruturalmente zerada que motivou o RF.
    expect(texto(<RaceTypeIndicator candidatos={zerados} turno={1} />)).toBe(
      "Disputa entre 0 candidatos",
    );
  });

  it("o número vem de `candidatos.length`, nunca de literal no JSX (lição D8 da spec 017)", () => {
    for (const n of [1, 2, 5, 31]) {
      const recorte = candidatosZerados().slice(0, n);
      const esperado =
        n === 1 ? "Disputa entre 1 candidato" : `Disputa entre ${recorte.length} candidatos`;
      expect(texto(<RaceTypeIndicator candidatos={recorte} preEleicao turno={1} />)).toBe(esperado);
    }
  });

  it("`turno === 2` em fase pré cai no ramo de fallback já existente", () => {
    // Não existe 2º turno antes do 1º; o ramo não precisa de caso novo, e a
    // prop `preEleicao` não pode vazar para ele.
    const dois = candidatosZerados().slice(0, 2);
    const pre = texto(<RaceTypeIndicator candidatos={dois} preEleicao turno={2} />);
    const normal = texto(<RaceTypeIndicator candidatos={dois} turno={2} />);
    expect(pre).toBe(normal);
    expect(pre).toContain("Segundo turno entre");
    expect(pre).not.toContain("Disputa entre");
  });

  it("sem a prop, o default é fase NORMAL (o estado de 04/10 em diante)", () => {
    const candidatos = candidatosComProjecao();
    expect(texto(<RaceTypeIndicator candidatos={candidatos} turno={1} />)).toBe(
      texto(<RaceTypeIndicator candidatos={candidatos} preEleicao={false} turno={1} />),
    );
  });
});
