/**
 * tests/unit/scripts/edge-config-prune.test.ts — RF-165.
 *
 * O fiscal existe para o caso em que a transição do RF-166 **não** aconteceu
 * para algum cargo: um payload de setembro no ar, com a faixa "a eleição ainda
 * não começou" por cima, enquanto o país vota. É a alavanca manual de 30
 * segundos que o runbook precisa ter às 20h05 de 04/10.
 *
 * As asserções são sobre **o conjunto que sobrou**, não sobre o que foi
 * apagado: "apaguei duas" passa mesmo tendo apagado as duas erradas.
 */

import { describe, expect, it, vi } from "vitest";

import { FASE_PRE_ELEICAO } from "@/lib/config/fase";
import {
  carregaFaseSemeada,
  type PruneDeps,
  parseCli,
  podar,
  selecionarSemeadas,
} from "@/scripts/edge-config-prune";

const semeado = (cargo: number) => ({ cargo, turno: 1, fase: FASE_PRE_ELEICAO, por_uf: [] });
const real = (cargo: number, pct: number) => ({ cargo, turno: 1, pct_apurado_total: pct });

function deps(store: Map<string, unknown>): PruneDeps {
  return {
    lerStore: async () => new Map(store),
    apagar: async (chave: string) => {
      store.delete(chave);
    },
  };
}

function storeMisto() {
  return new Map<string, unknown>([
    ["projection-current", semeado(1)],
    ["projection-current-pres-t1", semeado(1)],
    ["projection-current-gov-t1", real(3, 0.01)],
    ["projection-current-sen-t1", semeado(5)],
    ["projection-uf-SP-pres-t1", real(1, 12.5)],
    ["alguma-outra-chave", { qualquer: "coisa" }],
  ]);
}

describe("RF-165 — o fiscal de limpeza", () => {
  it("sem argumento, LISTA e não apaga", async () => {
    const store = storeMisto();
    const antes = [...store.keys()].sort();
    const r = await podar(parseCli([]), deps(store));

    expect(r.encontradas.map((a) => a.chave)).toEqual([
      "projection-current",
      "projection-current-pres-t1",
      "projection-current-sen-t1",
    ]);
    expect(r.removidas).toEqual([]);
    expect([...store.keys()].sort()).toEqual(antes);
  });

  it("`--apagar` sem `--confirmar` continua não apagando", async () => {
    const store = storeMisto();
    const antes = [...store.keys()].sort();
    const r = await podar(parseCli(["--apagar"]), deps(store));
    expect(r.encontradas).toHaveLength(3);
    expect(r.removidas).toEqual([]);
    expect([...store.keys()].sort()).toEqual(antes);
  });

  it("🔴 com as duas flags, remove SÓ as que têm `fase` — asserção sobre o que SOBROU", async () => {
    const store = storeMisto();
    const r = await podar(parseCli(["--apagar", "--confirmar"]), deps(store));

    expect(r.sobreviventes).toEqual([
      "alguma-outra-chave",
      "projection-current-gov-t1",
      "projection-uf-SP-pres-t1",
    ]);
    // E o store de verdade concorda com o relatório.
    expect([...store.keys()].sort()).toEqual(r.sobreviventes);
    // 🔴 O payload real de 0,01% apurado — 20h01 de 04/10 — NÃO foi tocado.
    expect(store.get("projection-current-gov-t1")).toEqual(real(3, 0.01));
  });

  it("nunca toca chave sem o campo, mesmo quando ela se parece com uma semeada", async () => {
    // `pct_apurado_total: 0` e `por_uf: []` sem `fase` é o que `emptyPayload()`
    // produz. Um fiscal gateado no percentual apagaria isto — e, nos minutos
    // anteriores às 20h01, apagaria a apuração ao vivo.
    const store = new Map<string, unknown>([
      ["projection-current-sen-t1", { cargo: 5, turno: 1, pct_apurado_total: 0, por_uf: [] }],
    ]);
    const r = await podar(parseCli(["--apagar", "--confirmar"]), deps(store));
    expect(r.encontradas).toEqual([]);
    expect(r.removidas).toEqual([]);
    expect(store.size).toBe(1);
  });

  it("no caminho feliz (transição concluída) não encontra nada", async () => {
    const store = new Map<string, unknown>([
      ["projection-current", real(1, 0.01)],
      ["projection-current-pres-t1", real(1, 0.01)],
    ]);
    const r = await podar(parseCli([]), deps(store));
    expect(r.encontradas).toEqual([]);
  });

  it("varre o store INTEIRO, não uma lista fixa de nomes esperados", async () => {
    // Uma chave semeada sob um nome que o script não previu tem de ser achada.
    const store = new Map<string, unknown>([
      ["projection-uf-AC-gov-t1", semeado(3)],
      ["projection-current-pres-t2", semeado(1)],
    ]);
    const r = await podar(parseCli([]), deps(store));
    expect(r.encontradas.map((a) => a.chave)).toEqual([
      "projection-current-pres-t2",
      "projection-uf-AC-gov-t1",
    ]);
  });

  it("`carregaFaseSemeada` é igualdade exata — gravação fora do contrato não é apagada", () => {
    expect(carregaFaseSemeada({ fase: FASE_PRE_ELEICAO })).toBe(true);
    for (const v of [{}, { fase: "normal" }, { fase: null }, { fase: "" }, null, []]) {
      expect(carregaFaseSemeada(v), JSON.stringify(v)).toBe(false);
    }
  });

  it("o relatório traz cargo, turno e bytes de cada achado", () => {
    const achados = selecionarSemeadas(storeMisto());
    expect(achados.map((a) => a.cargo)).toEqual([1, 1, 5]);
    expect(achados.every((a) => a.turno === 1)).toBe(true);
    expect(achados.every((a) => a.bytes > 0)).toBe(true);
  });

  it("uma falha ao apagar não derruba o ciclo, e a chave conta como sobrevivente", async () => {
    const store = storeMisto();
    const d: PruneDeps = {
      lerStore: async () => new Map(store),
      apagar: async (chave) => {
        if (chave === "projection-current") throw new Error("403 da Vercel");
        store.delete(chave);
      },
    };
    const r = await podar(parseCli(["--apagar", "--confirmar"]), d);
    expect(r.falhas.map((f) => f.chave)).toEqual(["projection-current"]);
    expect(r.sobreviventes).toContain("projection-current");
    expect(r.removidas).toEqual(["projection-current-pres-t1", "projection-current-sen-t1"]);
  });

  it("flag desconhecida é erro, não silêncio", () => {
    expect(() => parseCli(["--apaga"])).toThrow(/Flag desconhecida/);
    expect(parseCli(["--apagar", "--confirmar"])).toEqual({ apagar: true, confirmar: true });
  });
});

describe("RF-165 — o fiscal não deriva a fase de nada além do campo", () => {
  it("não olha `pct_apurado_total`, `por_uf.length` nem `composition.pre_election`", () => {
    const espiaoDeLeitura = vi.fn();
    const armadilha = new Proxy(
      { fase: "normal", pct_apurado_total: 0, por_uf: [], composition: { pre_election: 1 } },
      {
        get(alvo, prop, recv) {
          if (prop !== "fase") espiaoDeLeitura(String(prop));
          return Reflect.get(alvo, prop, recv);
        },
      },
    );
    expect(carregaFaseSemeada(armadilha)).toBe(false);
    expect(espiaoDeLeitura).not.toHaveBeenCalled();
  });
});
