/**
 * tests/unit/utils/lider-por-base.test.ts
 *
 * `liderIdPorBase` / `ordenarTopCandidatosPorBase` — pedido do dono,
 * 2026-09-20: "se no parcial o líder for Flávio, pinta PL; se a projeção der
 * Lula, pinta a cor do Lula". Ver a docstring de
 * `lib/utils/lider-por-base.ts` para o achado que motiva este arquivo:
 * `EdgeUfRow.lider` e `top_candidatos[0].id` são, por construção do produtor
 * (`api/model/project.py`), SEMPRE o mesmo candidato — o líder por
 * `pct_projetado`, nunca por `pct_atual`. Os casos abaixo travam que a base
 * "parcial" de fato lê `pct_atual`, e que a ausência dele nunca vira um `0`
 * fabricado.
 *
 * Auditoria de mutação (aplicada manualmente, não automatizada):
 *
 *   M1 trocar `usouParcial = viewMode === "parcial" && temLeituraParcialCompleta(top)`
 *      por `viewMode === "parcial"` (remove a guarda de honestidade)
 *      → mata (d): com `pct_atual` ausente em id=22, a ordem parcial "ingênua"
 *        trataria o ausente como pior que 0 seria (comparador usa `?? 0`),
 *        dando [13, 33, 22] em vez do fallback correto [33, 13, 22] (ordem de
 *        projeção). `liderIdPorBase` também mudaria de 33 para 13 no mesmo
 *        caso (h).
 *   M2 trocar `rankByParcial`/`rankByProjecao` de lugar (usar projeção quando
 *      deveria usar parcial, e vice-versa) → mata (b) e (a): as duas ordens
 *      são construídas para DIVERGIR uma da outra.
 *   M3 trocar `row.top_candidatos[0]?.id ?? row.lider` por só `row.lider` no
 *      fallback → mata (h): `row.lider` (99, sentinela que não aparece em
 *      `top_candidatos`) nunca deveria vazar quando `top_candidatos` não é
 *      vazio.
 */

import { describe, expect, it } from "vitest";

import type { EdgeUfRow } from "@/lib/edge-config/types";
import {
  liderIdPorBase,
  ordenarTopCandidatosPorBase,
  type TopCandidatoUf,
} from "@/lib/utils/lider-por-base";

function tc(id: number, pct: number, pct_atual?: number): TopCandidatoUf {
  return pct_atual === undefined ? { id, pct } : { id, pct, pct_atual };
}

/** Só os dois campos que `liderIdPorBase` lê — `Pick<EdgeUfRow, ...>`. */
function row(
  lider: number,
  top_candidatos: TopCandidatoUf[],
): Pick<EdgeUfRow, "lider" | "top_candidatos"> {
  return { lider, top_candidatos };
}

const ids = (top: readonly TopCandidatoUf[]) => top.map((t) => t.id);

describe("ordenarTopCandidatosPorBase", () => {
  it("(a) viewMode proj — ordena por pct_projetado desc, ignora pct_atual", () => {
    // Projetado: 22(50) > 13(30) > 33(20). Apurado: 33(60) > 13(10) > 22(5) —
    // ORDEM OPOSTA à projetada, de propósito: só a projeção pode estar
    // decidindo aqui.
    const top = [tc(13, 30, 10), tc(22, 50, 5), tc(33, 20, 60)];
    const { ordenados, usouParcial } = ordenarTopCandidatosPorBase(top, "proj");
    expect(ids(ordenados)).toEqual([22, 13, 33]);
    expect(usouParcial).toBe(false);
  });

  it("(b) viewMode parcial, todo `pct_atual` presente — ordena por pct_atual desc", () => {
    const top = [tc(13, 30, 10), tc(22, 50, 5), tc(33, 20, 60)];
    const { ordenados, usouParcial } = ordenarTopCandidatosPorBase(top, "parcial");
    expect(ids(ordenados)).toEqual([33, 13, 22]);
    expect(usouParcial).toBe(true);
  });

  it("(c) viewMode parcial, `top_candidatos` vazio — degrada para proj (vazio) sem lançar", () => {
    const { ordenados, usouParcial } = ordenarTopCandidatosPorBase([], "parcial");
    expect(ordenados).toEqual([]);
    expect(usouParcial).toBe(false);
  });

  it("(d) viewMode parcial, `pct_atual` ausente em UM candidato — cai na ordem de PROJEÇÃO inteira, nunca trata o ausente como 0", () => {
    // Se o ausente virasse 0, a ordem parcial "ingênua" seria [13(10), 33(0-real),
    // 22(0-fabricado)] → mas o id 22 tem pct_atual real 5, então o resultado
    // errado seria [13, 22, 33] só se a comparação usasse os dois "0" com
    // desempate por pct_projetado — o ponto é que NADA disso deveria rodar:
    // a função inteira precisa recusar ordenar por parcial quando falta UM.
    const top = [tc(13, 30, 10), tc(22, 50), tc(33, 20, 60)];
    const { ordenados, usouParcial } = ordenarTopCandidatosPorBase(top, "parcial");
    expect(usouParcial).toBe(false);
    // Mesma ordem de (a): por pct_projetado desc — 22(50) > 13(30) > 33(20).
    expect(ids(ordenados)).toEqual([22, 13, 33]);
  });
});

describe("liderIdPorBase", () => {
  it("(e) viewMode proj — devolve o topo de `top_candidatos` mesmo quando `pct_atual` discorda", () => {
    const r = row(99, [tc(13, 30, 10), tc(22, 50, 5), tc(33, 20, 60)]);
    expect(liderIdPorBase(r, "proj")).toBe(22);
  });

  it("(f) viewMode proj, `top_candidatos` vazio — cai em `row.lider`", () => {
    const r = row(99, []);
    expect(liderIdPorBase(r, "proj")).toBe(99);
  });

  it("(g) viewMode parcial — devolve quem lidera o APURADO, não o projetado", () => {
    const r = row(22, [tc(13, 30, 10), tc(22, 50, 5), tc(33, 20, 60)]);
    // `row.lider` (99→22 aqui) e `top_candidatos[0].id` (22) concordam — o
    // caso real de hoje (ambos vêm do mesmo `ordered[0]` no produtor). Só a
    // base PARCIAL discrimina: o apurado real é 33, não 22.
    expect(liderIdPorBase(r, "parcial")).toBe(33);
  });

  it("(h) viewMode parcial, `pct_atual` ausente em algum candidato — cai no líder de PROJEÇÃO (`top_candidatos[0]`), nunca em `row.lider` sozinho", () => {
    // `row.lider` é um sentinela (999) que NÃO aparece em `top_candidatos` —
    // se ele vazasse aqui, seria a prova de que o fallback errado (M3) rodou.
    const r = row(999, [tc(13, 30, 10), tc(22, 50), tc(33, 20, 60)]);
    expect(liderIdPorBase(r, "parcial")).toBe(22);
  });

  it("(i) viewMode parcial, `top_candidatos` vazio — cai em `row.lider`", () => {
    const r = row(99, []);
    expect(liderIdPorBase(r, "parcial")).toBe(99);
  });
});
