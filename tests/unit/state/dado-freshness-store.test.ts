/**
 * tests/unit/state/dado-freshness-store.test.ts — ADR-0038 D4 (virada de
 * 2026-09-13).
 *
 * A store que liga quem **busca** o `dado_ts` (a moldura do mapa, no
 * `layout.tsx`) a quem **julga** o `dado_ts` (o `<DadoParadoBanner>`, no
 * `page.tsx`). São árvores React irmãs, sem pai comum montável no cliente.
 *
 * O que se fixa aqui é o contrato que o banner depende para não dar alarme
 * falso — e cada um dos três itens já foi, nesta base, uma classe de bug real:
 *
 *   1. **poller ≠ relógio.** Existir quem busque e ter recebido algo são
 *      perguntas diferentes. Colapsá-las num campo só faz o banner ou reavaliar
 *      quando não devia (alarme falso) ou nunca reavaliar (o defeito original).
 *   2. **`string` | `null` | `undefined` são três estados**, nunca dois. É a
 *      regra de ADR-0038 D1, e o `??` que a viola é o mesmo "default silencioso
 *      de enum" que já mordeu este repositório três vezes.
 *   3. **publicar o mesmo valor não notifica ninguém.** Sem a guarda, todo
 *      ciclo de 60 s rerrenderiza o banner — justo no cenário em que ele
 *      deveria estar parado.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { useDadoFrescorStore } from "@/lib/state/dado-freshness-store";

const estado = () => useDadoFrescorStore.getState();

beforeEach(() => {
  useDadoFrescorStore.setState({ pollers: {}, relogios: {} });
});

describe("registrarPoller", () => {
  it("(a) conta em vez de ligar um booleano — StrictMode monta duas vezes", () => {
    const baixa1 = estado().registrarPoller(1);
    const baixa2 = estado().registrarPoller(1);
    expect(estado().pollers[1]).toBe(2);

    // A primeira baixa NÃO pode desligar o cargo: ainda há um poller vivo.
    baixa1();
    expect(estado().pollers[1]).toBe(1);

    baixa2();
    expect(estado().pollers[1]).toBeUndefined();
  });

  it("(b) a baixa é idempotente — chamar duas vezes não zera poller alheio", () => {
    const baixa = estado().registrarPoller(3);
    estado().registrarPoller(3);
    baixa();
    baixa();
    baixa();
    expect(estado().pollers[3]).toBe(1);
  });

  it("(c) cargos são chaves independentes: a moldura de `gov` não autoriza a de `pres`", () => {
    estado().registrarPoller(3);
    expect(estado().pollers[3]).toBe(1);
    expect(estado().pollers[1]).toBeUndefined();
    // É o que mantém as duas telas de Deputado Federal (cargo 6) sem timer.
    expect(estado().pollers[6]).toBeUndefined();
  });
});

describe("publicarDadoTs", () => {
  it("(d) 'nunca publicou' e 'publicou undefined' são distinguíveis", () => {
    // Sem invólucro, os dois seriam `relogios[1] === undefined` — e o banner
    // trataria um payload pré-ADR-0038 (campo ausente, D1 item 3) como se o
    // poller ainda estivesse em voo.
    expect(estado().relogios[1]).toBeUndefined();

    estado().publicarDadoTs(1, undefined);
    expect(estado().relogios[1]).toEqual({ dadoTs: undefined });
    expect(estado().relogios[1]).not.toBeUndefined();
  });

  it("(e) `null` viaja cru — não vira `undefined` nem string", () => {
    estado().publicarDadoTs(1, null);
    expect(estado().relogios[1]?.dadoTs).toBeNull();
  });

  it("(f) a string viaja intacta", () => {
    estado().publicarDadoTs(5, "2026-10-04T23:00:00.000Z");
    expect(estado().relogios[5]?.dadoTs).toBe("2026-10-04T23:00:00.000Z");
  });

  it("(g) republicar o MESMO valor não troca a referência (nada rerrenderiza)", () => {
    estado().publicarDadoTs(1, "2026-10-04T23:00:00.000Z");
    const antes = estado().relogios;
    estado().publicarDadoTs(1, "2026-10-04T23:00:00.000Z");
    expect(estado().relogios).toBe(antes);

    // Mas um valor NOVO tem de trocar, senão o relógio congela na tela.
    estado().publicarDadoTs(1, "2026-10-04T23:01:00.000Z");
    expect(estado().relogios).not.toBe(antes);
    expect(estado().relogios[1]?.dadoTs).toBe("2026-10-04T23:01:00.000Z");
  });
});
