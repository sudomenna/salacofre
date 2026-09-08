/**
 * tests/unit/blob/uf-detail.test.ts
 *
 * A fronteira campo a campo do ADR-0032 (`splitUfPayload`) e a leitura com
 * degradação explícita (`readUfDetail`).
 *
 * O que estes testes protegem:
 *   - Que `municipios`/`series_temporais` NÃO voltem para o payload gravado no
 *     Global Config. É o campo que, sozinho, excede o limite do store inteiro à
 *     cobertura plena; um regresso aqui só apareceria como escrita recusada na
 *     madrugada da apuração.
 *   - Que o `ts` do Blob seja PRÓPRIO. As duas escritas não são atômicas entre
 *     si, e a UI precisa poder datar o detalhe separadamente do resumo.
 *   - Que toda falha de leitura devolva um MOTIVO, e não `null`. A UI escolhe
 *     o texto do estado "detalhe indisponível" a partir dele (ADR-0017).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { municipiosFrom, readUfDetail, seriesFrom, splitUfPayload } from "@/lib/blob/uf-detail";
import type { EdgeUfMunicipio, UfPayloadInput } from "@/lib/edge-config/types";

const BASE = "https://exemplo.test";
const URL_SP_PRES_T1 = `${BASE}/municipios/uf/SP/pres/t1.json`;

function makeMunicipio(i: number): EdgeUfMunicipio {
  return {
    cod_ibge: `35${String(i).padStart(5, "0")}`,
    nome: `Município ${i}`,
    pct_apurado: 50 + i,
    lider: { candidato_id: 1, partido: "P1", votos: 1000 + i, margem_pp: 5 },
    votos_reportados: { 1: 1000 + i, 2: 800 },
  };
}

function makeInput(municipios: number): UfPayloadInput {
  return {
    uf: "SP",
    ts: "2026-10-04T18:00:00-03:00",
    cargo: 1,
    turno: 1,
    pct_apurado: 42,
    candidatos: [],
    needle_position: 0.3,
    needle_band: "lean_a",
    mesorregioes: [],
    municipios: Array.from({ length: municipios }, (_, i) => makeMunicipio(i)),
    series_temporais: {
      margem: [{ ts: "2026-10-04T18:00:00-03:00", margem_pp: 3 }],
      p_vitoria: [],
      turnout: [],
    },
  };
}

describe("splitUfPayload — a fronteira do ADR-0032", () => {
  it("o payload ARMAZENADO não carrega municipios nem series_temporais", () => {
    const { stored } = splitUfPayload(makeInput(3), "pres", 1);
    expect(stored).not.toHaveProperty("municipios");
    expect(stored).not.toHaveProperty("series_temporais");
    // E o que ficou continua completo.
    expect(stored.uf).toBe("SP");
    expect(stored.pct_apurado).toBe(42);
    expect(stored.mesorregioes).toEqual([]);
  });

  it("o serializado do payload armazenado não menciona os dois campos", () => {
    const { stored } = splitUfPayload(makeInput(50), "pres", 1);
    const json = JSON.stringify(stored);
    expect(json).not.toContain("municipios");
    expect(json).not.toContain("series_temporais");
  });

  it("o detalhe carrega os dois campos e os qualificadores da corrida", () => {
    const { detail } = splitUfPayload(makeInput(3), "gov", 2);
    expect(detail.municipios).toHaveLength(3);
    expect(detail.series_temporais?.margem).toHaveLength(1);
    expect(detail.uf).toBe("SP");
    expect(detail.cargo).toBe("gov");
    expect(detail.turno).toBe(2);
  });

  it("o `ts` do detalhe é PRÓPRIO — não o do payload de Global Config", () => {
    const input = makeInput(1);
    const { detail } = splitUfPayload(input, "pres", 1);
    expect(detail.ts).not.toBe(input.ts);
    expect(Number.isFinite(Date.parse(detail.ts))).toBe(true);
  });

  it("series_temporais ausente vira `null` explícito, não `undefined`", () => {
    const input = makeInput(1);
    input.series_temporais = undefined;
    const { detail } = splitUfPayload(input, "pres", 1);
    expect(detail.series_temporais).toBeNull();
  });
});

describe("readUfDetail — degradação com motivo", () => {
  const savedBase = process.env.BLOB_PUBLIC_BASE_URL;
  const savedToken = process.env.BLOB_READ_WRITE_TOKEN;

  beforeEach(() => {
    process.env.BLOB_PUBLIC_BASE_URL = BASE;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (savedBase === undefined) delete process.env.BLOB_PUBLIC_BASE_URL;
    else process.env.BLOB_PUBLIC_BASE_URL = savedBase;
    if (savedToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = savedToken;
    vi.restoreAllMocks();
  });

  function mockFetch(impl: () => Promise<Response>) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(impl as typeof fetch);
  }

  it("200 com objeto válido → ok, na URL determinística", async () => {
    const detail = {
      ts: "2026-10-04T18:00:30-03:00",
      uf: "SP",
      cargo: "pres",
      turno: 1,
      municipios: [makeMunicipio(0)],
      series_temporais: null,
    };
    const spy = mockFetch(async () => new Response(JSON.stringify(detail), { status: 200 }));

    const result = await readUfDetail("SP", { cargo: "pres", turno: 1 });

    expect(spy).toHaveBeenCalledWith(URL_SP_PRES_T1, {
      next: { revalidate: 60 },
    });
    expect(result.status).toBe("ok");
    expect(municipiosFrom(result)).toHaveLength(1);
    if (result.status === "ok") expect(result.url).toBe(URL_SP_PRES_T1);
  });

  it("404 → not_found, e os acessores coalescem para vazio", async () => {
    mockFetch(async () => new Response("", { status: 404 }));
    const result = await readUfDetail("SP", { cargo: "pres", turno: 1 });
    expect(result).toEqual({
      status: "unavailable",
      reason: "not_found",
      url: URL_SP_PRES_T1,
    });
    expect(municipiosFrom(result)).toEqual([]);
    expect(seriesFrom(result)).toBeNull();
  });

  it("5xx → fetch_error", async () => {
    mockFetch(async () => new Response("boom", { status: 503 }));
    const result = await readUfDetail("SP", { cargo: "pres", turno: 1 });
    expect(result).toMatchObject({ status: "unavailable", reason: "fetch_error" });
  });

  it("rede caiu → fetch_error, sem propagar exceção", async () => {
    mockFetch(async () => {
      throw new Error("ECONNRESET");
    });
    const result = await readUfDetail("SP", { cargo: "pres", turno: 1 });
    expect(result).toMatchObject({ status: "unavailable", reason: "fetch_error" });
  });

  it("JSON inválido → invalid", async () => {
    mockFetch(async () => new Response("não é json", { status: 200 }));
    const result = await readUfDetail("SP", { cargo: "pres", turno: 1 });
    expect(result).toMatchObject({ status: "unavailable", reason: "invalid" });
  });

  it("blob de OUTRA UF → invalid (o objeto é autodescritivo por isto)", async () => {
    mockFetch(
      async () =>
        new Response(
          JSON.stringify({ ts: "x", uf: "RJ", cargo: "pres", turno: 1, municipios: [] }),
          { status: 200 },
        ),
    );
    const result = await readUfDetail("SP", { cargo: "pres", turno: 1 });
    expect(result).toMatchObject({ status: "unavailable", reason: "invalid" });
  });

  it("ambiente sem Blob → not_configured, sem sequer tentar o fetch", async () => {
    delete process.env.BLOB_PUBLIC_BASE_URL;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const spy = mockFetch(async () => new Response("", { status: 200 }));

    const result = await readUfDetail("SP", { cargo: "pres", turno: 1 });

    expect(result).toEqual({ status: "unavailable", reason: "not_configured", url: null });
    expect(spy).not.toHaveBeenCalled();
  });

  it("sigla malformada → invalid, sem lançar", async () => {
    const result = await readUfDetail("SPP", { cargo: "pres", turno: 1 });
    expect(result).toEqual({ status: "unavailable", reason: "invalid", url: null });
  });
});
