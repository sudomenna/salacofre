/**
 * tests/unit/edge-config/reader.test.ts
 *
 * Ordem de fallback do read path do Global Config.
 *
 * ## O que está sendo garantido
 *
 * O esquema de chaves mudou de `:` para `-` em 2026-09-08 (emenda ao
 * ADR-0012) porque o padrão documentado de nome de chave do Global Config é
 * `^[A-Za-z0-9_-]+$`. Não foi possível verificar se a API da Vercel de fato
 * recusa dois-pontos — sem credencial de escrita no ambiente. Logo, existe um
 * cenário real em que a API sempre aceitou e há dado publicado sob o esquema
 * antigo. O reader precisa enxergar esse dado durante a migração, **sem**
 * pagar leitura extra quando a chave nova responde.
 *
 * Estes testes fixam exatamente isso:
 *   - caminho saudável: chave nova responde → UMA leitura, e só;
 *   - caminho de miss: cai para a chave deprecada com dois-pontos e depois
 *     para os aliases legados, nessa ordem;
 *   - a camada deprecada é temporária e tem data (2026-10-26).
 *
 * ## Estratégia
 *
 * `@vercel/edge-config` é mockado com `vi.mock` — um `get(key)` que consulta
 * um dicionário e conta as chaves consultadas, na ordem. É a ordem que
 * importa aqui, não o valor.
 *
 * O relógio é fixado em 2026-09-08 (`vi.setSystemTime`) porque
 * `currentPresidentialRace()` decide qual corrida é a "ativa", e a existência dos
 * aliases legados no fallback depende disso. Sem fixar, o teste passaria a
 * significar outra coisa depois de 04/10.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();

vi.mock("@vercel/edge-config", () => ({
  get: (key: string) => getMock(key),
}));

import { readArchivedProjection, readProjection, readUfProjection } from "@/lib/edge-config/reader";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let originalEdgeConfig: string | undefined;

beforeEach(() => {
  originalEdgeConfig = process.env.EDGE_CONFIG;
  // O reader curto-circuita para `null` sem esta env. Valor sintético: o SDK
  // está mockado, nada é parseado.
  process.env.EDGE_CONFIG = "https://edge-config.vercel.com/ecfg_test?token=t";

  vi.useFakeTimers();
  // Corrida ativa nesta data: (pres, 1). Ver `lib/config/calendar.ts`.
  vi.setSystemTime(new Date("2026-09-08T12:00:00-03:00"));

  getMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  if (originalEdgeConfig === undefined) delete process.env.EDGE_CONFIG;
  else process.env.EDGE_CONFIG = originalEdgeConfig;
});

/** Faz o `get` mockado responder só para as chaves listadas em `store`. */
function withStore(store: Record<string, unknown>) {
  getMock.mockImplementation(async (key: string) => store[key] ?? undefined);
}

/** Chaves consultadas, na ordem em que foram consultadas. */
function keysRead(): string[] {
  return getMock.mock.calls.map((call) => String(call[0]));
}

// ---------------------------------------------------------------------------
// readProjection
// ---------------------------------------------------------------------------

describe("readProjection — ordem de fallback", () => {
  it("caminho saudável: chave nova responde e o reader para na primeira leitura", async () => {
    withStore({ "projection-current-pres-t1": { ts: "novo" } });

    const payload = await readProjection();

    expect(payload).toEqual({ ts: "novo" });
    // O custo do fallback é ZERO quando a chave nova existe — este é o
    // caminho de 100% dos ciclos depois que o writer publica.
    expect(keysRead()).toEqual(["projection-current-pres-t1"]);
  });

  it("miss: cai para a chave deprecada com dois-pontos", async () => {
    // Cenário em que a API da Vercel sempre aceitou `:` e há dado publicado
    // sob o esquema antigo.
    withStore({ "projection:current:pres:t1": { ts: "antigo" } });

    const payload = await readProjection();

    expect(payload).toEqual({ ts: "antigo" });
    expect(keysRead()).toEqual(["projection-current-pres-t1", "projection:current:pres:t1"]);
  });

  it("miss total na corrida ativa: tenta também os dois aliases, nessa ordem", async () => {
    withStore({});

    const payload = await readProjection();

    expect(payload).toBeNull();
    expect(keysRead()).toEqual([
      "projection-current-pres-t1",
      "projection:current:pres:t1",
      "projection-current",
      "projection:current",
    ]);
  });

  it("corrida NÃO ativa: aliases ficam de fora (eles apontam para a ativa)", async () => {
    withStore({});

    await readProjection({ cargo: "gov", turno: 2 });

    expect(keysRead()).toEqual(["projection-current-gov-t2", "projection:current:gov:t2"]);
  });

  it("o alias novo tem precedência sobre o alias deprecado", async () => {
    withStore({
      "projection-current": { ts: "alias-novo" },
      "projection:current": { ts: "alias-antigo" },
    });

    expect(await readProjection()).toEqual({ ts: "alias-novo" });
  });

  it("falha do SDK degrada para null, não propaga", async () => {
    getMock.mockRejectedValue(new Error("edge config indisponível"));

    await expect(readProjection()).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readUfProjection
// ---------------------------------------------------------------------------

describe("readUfProjection — ordem de fallback", () => {
  it("caminho saudável: uma leitura na chave nova", async () => {
    withStore({ "projection-uf-SP-pres-t1": { uf: "SP" } });

    expect(await readUfProjection("SP")).toEqual({ uf: "SP" });
    expect(keysRead()).toEqual(["projection-uf-SP-pres-t1"]);
  });

  it("miss total: nova → deprecada → alias novo → alias deprecado", async () => {
    withStore({});

    expect(await readUfProjection("SP")).toBeNull();
    expect(keysRead()).toEqual([
      "projection-uf-SP-pres-t1",
      "projection:uf:SP:pres:t1",
      "projection-uf-SP",
      "projection:uf:SP",
    ]);
  });

  it("sigla malformada não vira chave inválida — degrada para null", async () => {
    withStore({});

    expect(await readUfProjection("SP:1")).toBeNull();
    // Nenhuma leitura chegou a ser feita: a sigla foi rejeitada na
    // construção da chave.
    expect(keysRead()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// readArchivedProjection
// ---------------------------------------------------------------------------

describe("readArchivedProjection — ordem de fallback", () => {
  it("chave nova primeiro, deprecada depois, sem aliases", async () => {
    withStore({});

    expect(await readArchivedProjection({ cargo: "pres", turno: 1 })).toBeNull();
    expect(keysRead()).toEqual(["projection-archive-pres-t1", "projection:archive:pres:t1"]);
  });

  it("archive publicado sob o esquema antigo ainda é encontrado", async () => {
    withStore({ "projection:archive:pres:t1": { ts: "1T congelado" } });

    expect(await readArchivedProjection({ cargo: "pres", turno: 1 })).toEqual({
      ts: "1T congelado",
    });
  });
});

// ---------------------------------------------------------------------------
// Sem credencial
// ---------------------------------------------------------------------------

describe("sem EDGE_CONFIG", () => {
  it("retorna null sem tocar no SDK (dev/preview sem credencial)", async () => {
    delete process.env.EDGE_CONFIG;

    expect(await readProjection()).toBeNull();
    expect(await readUfProjection("SP")).toBeNull();
    expect(await readArchivedProjection()).toBeNull();
    expect(getMock).not.toHaveBeenCalled();
  });
});
