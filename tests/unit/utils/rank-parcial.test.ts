/**
 * tests/unit/utils/rank-parcial.test.ts
 *
 * `rankByParcial` — a derivação do rank exibido nas três rotas de UF
 * (Presidente, Governador, Senador) e, a partir da spec 020, o comparador que
 * o produtor Python precisa espelhar para escolher as 4 candidaturas do
 * gráfico de evolução.
 *
 * ## Por que os casos são estes, e não `[30, 20, 10]`
 *
 * O critério tem TRÊS níveis (`pct_atual` desc → `pct_projetado` desc → `id`
 * asc) e um teste que só ordena percentuais distintos passa com os dois
 * desempates destruídos — não discrimina nada. Cada `it` abaixo é construído
 * para que EXATAMENTE um nível decida e os outros apontem para uma ordem
 * DIFERENTE, de modo que quebrar aquele nível mude o resultado.
 *
 * Auditoria de mutação (6 mutações; cada linha nomeia um caso que quebra):
 *
 *   M1 remover `pct_atual`        → (a) vira [1,3,2] (cai no projetado); ✗
 *   M2 inverter `pct_atual`       → (a) vira [1,3,2];                    ✗
 *   M3 remover `pct_projetado`    → (b) vira [1,2,3] (cai no id),
 *                                   (d) vira [1,2,3];                    ✗
 *   M4 inverter `pct_projetado`   → (b) vira [1,3,2], (d) vira [1,3,2];  ✗
 *   M5 remover `id`               → (c) mantém a ordem de entrada
 *                                   [7,2,5] (sort é estável);            ✗
 *   M6 inverter `id`              → (c) vira [7,5,2];                    ✗
 *
 * Nenhuma das seis sobrevive.
 */

import { describe, expect, it } from "vitest";

import type { EdgeUfCandidate } from "@/lib/edge-config/types";
import { rankByParcial } from "@/lib/utils/rank-parcial";

function cand(id: number, pct_atual: number, pct_projetado: number): EdgeUfCandidate {
  return {
    id,
    nome: `Candidato ${id}`,
    partido: "P",
    cor: "var(--color-cand-1)",
    votos_atuais: Math.round(pct_atual * 1000),
    votos_projetados: Math.round(pct_projetado * 1000),
    pct_atual,
    pct_projetado,
    ci95: { lower: pct_projetado, upper: pct_projetado },
  };
}

const ids = (cs: readonly EdgeUfCandidate[]) => cs.map((c) => c.id);

describe("rankByParcial", () => {
  it("(a) `pct_atual` desc decide — mesmo com projetado e id apontando para a ordem oposta", () => {
    // Apurado: 2 > 3 > 1. Projetado: 1 > 3 > 2 (ordem INVERTIDA). Id: 1 < 2 < 3.
    // Só o apurado produz [2, 3, 1] — é o número que o leitor confere contra
    // o boletim do TSE, e é ele que tem que mandar assim que há apuração.
    const entrada = [cand(1, 10.0, 50.0), cand(2, 30.0, 20.0), cand(3, 20.0, 30.0)];

    expect(ids(rankByParcial(entrada))).toEqual([2, 3, 1]);
  });

  it("(b) empate em `pct_atual`: `pct_projetado` desc decide — e aponta o oposto do id", () => {
    // Todos com 12,5% apurado (o critério primário não separa ninguém).
    // Projetado: 2 > 3 > 1. Id asc daria [1, 2, 3]. Só o projetado dá [2,3,1].
    const entrada = [cand(1, 12.5, 20.0), cand(2, 12.5, 40.0), cand(3, 12.5, 30.0)];

    expect(ids(rankByParcial(entrada))).toEqual([2, 3, 1]);
  });

  it("(c) empate em `pct_atual` E `pct_projetado`: só o `id` asc decide", () => {
    // Entrada deliberadamente FORA de ordem de id — se o desempate final
    // sumir, `Array.prototype.sort` é estável e devolveria [7, 2, 5].
    const entrada = [cand(7, 8.0, 8.0), cand(2, 8.0, 8.0), cand(5, 8.0, 8.0)];

    expect(ids(rankByParcial(entrada))).toEqual([2, 5, 7]);
  });

  it("(d) antes do primeiro boletim (`pct_atual` 0 em todos), o projetado evita líder arbitrário", () => {
    // Esta é a situação REAL às 17h de 04/10: nenhuma zona apurada, todos os
    // `pct_atual` em 0. Sem o desempate por `pct_projetado` a ordem cairia na
    // do array de origem e a página abriria a noite com o candidato 1 como
    // "líder" — na numeração, na margem e na barra de maioria.
    const entrada = [cand(1, 0, 18.0), cand(2, 0, 42.0), cand(3, 0, 25.0)];

    expect(ids(rankByParcial(entrada))).toEqual([2, 3, 1]);
    // O líder é quem o prior pré-eleitoral aponta, não quem chegou primeiro
    // no array.
    expect(rankByParcial(entrada)[0]?.id).toBe(2);
  });

  it("(e) não muta a entrada — `<ResultPanel>` e o produtor leem o mesmo array", () => {
    const entrada = [cand(1, 10.0, 10.0), cand(2, 30.0, 30.0)];
    const antes = ids(entrada);

    const saida = rankByParcial(entrada);

    expect(ids(entrada)).toEqual(antes);
    expect(saida).not.toBe(entrada);
  });

  it("(f) lista vazia e lista de um só não quebram", () => {
    expect(rankByParcial([])).toEqual([]);
    expect(ids(rankByParcial([cand(9, 0, 0)]))).toEqual([9]);
  });
});
