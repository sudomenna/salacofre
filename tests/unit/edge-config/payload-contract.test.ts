/**
 * tests/unit/edge-config/payload-contract.test.ts
 *
 * Trava do contrato do payload publicado no Edge Config depois da S07/Fase 2
 * (extrapolação do apurado — decisões E1/E2 do plano).
 *
 * Por que este arquivo existe: as páginas leem os fixtures com
 * `as unknown as EdgePayload` (`app/page.tsx:115`), o que APAGA a checagem de
 * tipo. Um fixture com `metodo.tipo: "swing_2022"` ou com um bloco
 * `comparecimento` malformado passaria pelo `tsc` sem reclamar e só quebraria
 * na tela. Aqui a verificação é em runtime, sobre os três fixtures reais.
 *
 * O que este teste NÃO faz: validar o payload inteiro (isso é papel do
 * `writeEdgePayload`, coberto em `writer.test.ts`). Ele cobre exatamente os
 * campos que a Fase 2 acrescentou ou estreitou.
 *
 * Fonte de verdade do shape: docs/architecture/data-model.md § Payload.
 */

import { describe, expect, it } from "vitest";

import type { EdgeBaseComparecimento, EdgePayload } from "@/lib/edge-config/types";
import govFixture from "@/tests/fixtures/edge-config/gov-current.json" with { type: "json" };
import nationalFixture from "@/tests/fixtures/edge-config/projection-current.json" with {
  type: "json",
};
import nationalT2Fixture from "@/tests/fixtures/edge-config/projection-current-t2.json" with {
  type: "json",
};

const FIXTURES: Array<[string, unknown]> = [
  ["projection-current.json", nationalFixture],
  ["projection-current-t2.json", nationalT2Fixture],
  ["gov-current.json", govFixture],
];

/** Tipos de método aceitos pelo contrato (união fechada desde S07/Fase 2). */
const METODOS = new Set(["extrapolacao_apurado", "imputado_nacional"]);

function isPct(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
}

/** Valida `EdgeBaseComparecimento` — o bloco novo da 2ª base (E2). */
function assertBaseComparecimento(bloco: EdgeBaseComparecimento, onde: string): void {
  expect(isPct(bloco.pct_projetado), `${onde}.pct_projetado`).toBe(true);
  expect(isPct(bloco.lower), `${onde}.lower`).toBe(true);
  expect(isPct(bloco.upper), `${onde}.upper`).toBe(true);
  expect(bloco.lower <= bloco.upper, `${onde}: lower <= upper`).toBe(true);
  expect(
    bloco.pct_atual === null || isPct(bloco.pct_atual),
    `${onde}.pct_atual é number|null`,
  ).toBe(true);
}

describe("contrato do payload — S07/Fase 2 (extrapolação do apurado)", () => {
  for (const [nome, raw] of FIXTURES) {
    it(`${nome} decoda com os tipos novos`, () => {
      // O cast é o mesmo que as páginas fazem; as asserções abaixo é que
      // provam que o cast não está mentindo.
      const payload = raw as unknown as EdgePayload;

      expect(payload.national.candidatos.length).toBeGreaterThan(0);

      // 1) `comparecimento` é opcional em candidato — ausente nos 3 fixtures
      //    (todos pré-Fase 2), e quando presente precisa ter o shape certo.
      for (const c of payload.national.candidatos) {
        if (c.comparecimento !== undefined) {
          assertBaseComparecimento(c.comparecimento, `${nome}: candidato ${c.id}`);
        }
      }

      // 2) `metodo.tipo` virou união fechada — um fixture com o valor antigo
      //    ("swing_2022" etc.) tem que falhar aqui, não na tela.
      const metodo = payload.national.participacao?.metodo;
      if (metodo) {
        expect(METODOS.has(metodo.tipo), `${nome}: metodo.tipo "${metodo.tipo}"`).toBe(true);
        expect(Number.isInteger(metodo.n_zonas)).toBe(true);
        expect(isPct(metodo.pct_apurado)).toBe(true);
        if (metodo.n_zonas_imputadas !== undefined) {
          expect(Number.isInteger(metodo.n_zonas_imputadas)).toBe(true);
        }
      }

      // 3) `outros.comparecimento` — mesma regra do candidato.
      const outros = payload.national.participacao?.outros;
      if (outros?.comparecimento) {
        assertBaseComparecimento(outros.comparecimento, `${nome}: outros`);
      }

      // 4) `swing_vs_2022` aceita null desde a Fase 2; os fixtures ainda
      //    trazem número. Nenhum consumidor pode assumir non-null.
      for (const row of payload.por_uf) {
        expect(
          row.swing_vs_2022 === null || Number.isFinite(row.swing_vs_2022),
          `${nome}: ${row.sigla}.swing_vs_2022`,
        ).toBe(true);
      }
    });
  }

  it("um payload COM a 2ª base satisfaz o contrato (shape que o modelo vai emitir)", () => {
    // Espelha o que `estimate_uf_candidatos` passa a produzir na Fase 1 do
    // plano — o TS aqui é a checagem: se o nome de um campo mudar no
    // `types.ts`, este bloco para de compilar.
    const comparecimento: EdgeBaseComparecimento = {
      pct_atual: 32.4,
      pct_projetado: 33.0,
      lower: 31.8,
      upper: 34.2,
    };
    assertBaseComparecimento(comparecimento, "sintético");

    const metodo: NonNullable<NonNullable<EdgePayload["national"]["participacao"]>["metodo"]> = {
      tipo: "imputado_nacional",
      n_zonas: 0,
      pct_apurado: 0,
      n_zonas_imputadas: 7,
    };
    expect(METODOS.has(metodo.tipo)).toBe(true);
  });
});
