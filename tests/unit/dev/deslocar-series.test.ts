/**
 * tests/unit/dev/deslocar-series.test.ts
 *
 * Spec 020 — o modo simulado reescreve o relógio do payload para "agora" e
 * desloca as séries pelo mesmo delta, para o gráfico não virar uma coluna.
 *
 * A série por canditatura não é um array de pontos: é um objeto
 * `{eixo, cadencia_min, candidatos}`. O laço de deslocamento pulava tudo que
 * não fosse array, então ela passava intacta — e no `pnpm dev:sim` o cabeçalho
 * diria "agora" com o gráfico novo plantado horas atrás.
 */

import { describe, expect, it } from "vitest";

import { deslocarSeries } from "@/lib/dev/simulacao";

const UMA_HORA = 3_600_000;

describe("deslocarSeries — a série por candidatura anda junto", () => {
  const series = {
    margem: [
      { ts: "2026-10-04T20:00:00.000Z", margem_pp: 3 },
      { ts: "2026-10-04T20:05:00.000Z", margem_pp: 4 },
    ],
    por_candidato: {
      eixo: ["2026-10-04T20:00:00.000Z", "2026-10-04T20:05:00.000Z"],
      cadencia_min: 5,
      candidatos: [{ id: 13, nome: "A", partido: "PT", apurado: [10, null], projetado: [11, 12] }],
    },
  };

  it("desloca o eixo pelo MESMO delta das séries antigas", () => {
    // Mutação que isto mata: remover o ramo `por_candidato` do laço — que é o
    // estado anterior a este commit. O eixo voltaria intacto e a asserção cai.
    const out = deslocarSeries(series, UMA_HORA) as typeof series;

    expect(out.por_candidato.eixo).toEqual([
      "2026-10-04T21:00:00.000Z",
      "2026-10-04T21:05:00.000Z",
    ]);
    // Controle: a série antiga continua andando como sempre andou.
    expect(out.margem[0]?.ts).toBe("2026-10-04T21:00:00.000Z");
  });

  it("preserva a forma: a distância entre pontos não muda", () => {
    // Mutação que isto mata: carimbar "agora" em todos os pontos, que
    // colapsaria o gráfico inteiro num instante só.
    const out = deslocarSeries(series, UMA_HORA) as typeof series;
    const [a, b] = out.por_candidato.eixo;
    expect(Date.parse(b as string) - Date.parse(a as string)).toBe(5 * 60_000);
  });

  it("não toca nos valores nem no `null` — só no relógio", () => {
    // Mutação que isto mata: um `?? 0` ou um map que reescreva as medições.
    const out = deslocarSeries(series, UMA_HORA) as typeof series;
    expect(out.por_candidato.candidatos[0]?.apurado).toEqual([10, null]);
    expect(out.por_candidato.cadencia_min).toBe(5);
  });

  it("data impossível fica como está — inventar hora seria fabricar medição", () => {
    const quebrada = { por_candidato: { eixo: ["nao-e-data"], cadencia_min: 5, candidatos: [] } };
    const out = deslocarSeries(quebrada, UMA_HORA) as typeof quebrada;
    expect(out.por_candidato.eixo).toEqual(["nao-e-data"]);
  });

  it("série por candidatura ausente não quebra nada", () => {
    const out = deslocarSeries({ margem: series.margem }, UMA_HORA) as { margem: unknown[] };
    expect(out.margem).toHaveLength(2);
  });
});
