/**
 * tests/unit/edge-config/writer.test.ts
 *
 * Unit tests for lib/edge-config/writer.ts.
 *
 * Covers
 *   - T03 acceptance: "unit test que mocka `fetch` e confirma PATCH com
 *     payload correto".
 *   - RF-020 (write side da projeção).
 *   - ADR-0001 (Edge Config no read path — este é o gatekeeper de gravação).
 *
 * Strategy
 *   - `fetch` global é stubado via `vi.stubGlobal('fetch', mockFn)` igual a
 *     `tests/unit/tse/client.test.ts` — sem MSW. Resposta é construída via
 *     `new Response(body, { status })` que é nativo no runtime do vitest.
 *   - Variáveis de ambiente são manipuladas direto em `process.env` e
 *     restauradas em `afterEach` para não vazar entre testes.
 *   - `vi.spyOn(console, ...)` captura warn / log estruturados para
 *     assertar o no-op sem credencial.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EdgePayload } from "@/lib/edge-config/types";
import { writeEdgePayload, writeProjection } from "@/lib/edge-config/writer";

// ---------------------------------------------------------------------------
// Env management
// ---------------------------------------------------------------------------

const ENV_KEYS = ["EDGE_CONFIG_TOKEN", "EDGE_CONFIG_ID", "EDGE_CONFIG"] as const;

/** Snapshot original das envs antes de cada teste. */
const originalEnv: Record<(typeof ENV_KEYS)[number], string | undefined> = {
  EDGE_CONFIG_TOKEN: undefined,
  EDGE_CONFIG_ID: undefined,
  EDGE_CONFIG: undefined,
};

beforeEach(() => {
  // Snapshot e limpa.
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  // Restaura o ambiente original — outros testes podem depender.
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stuba `fetch` para resolver uma vez. Retorna a `vi.fn()` para inspeção. */
function mockFetchOnce(status: number, body: string | object = "") {
  const responseBody = typeof body === "string" ? body : JSON.stringify(body);
  const mock = vi.fn().mockResolvedValueOnce(new Response(responseBody, { status }));
  vi.stubGlobal("fetch", mock);
  return mock;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("writeEdgePayload — happy path", () => {
  it("envia PATCH com URL, headers e body corretos quando ambas credenciais estão setadas", async () => {
    process.env.EDGE_CONFIG_TOKEN = "test-token-abc";
    process.env.EDGE_CONFIG_ID = "ecfg_testid123";

    const fetchMock = mockFetchOnce(200, { status: "ok" });

    const payload = { ts: "2026-10-04T20:00:00Z", cargo: 1, turno: 1 };
    await writeEdgePayload("projection:current", payload);

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("fetch not called");
    const [url, init] = call as [string, RequestInit];

    // URL deve usar o ID e o endpoint /items.
    expect(url).toBe("https://api.vercel.com/v1/edge-config/ecfg_testid123/items");

    // Verb + headers.
    expect(init.method).toBe("PATCH");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-token-abc",
      "Content-Type": "application/json",
    });

    // Body: { items: [{ operation: "upsert", key, value }] }
    const parsedBody = JSON.parse(init.body as string);
    expect(parsedBody).toEqual({
      items: [
        {
          operation: "upsert",
          key: "projection:current",
          value: payload,
        },
      ],
    });
  });

  it("aceita EDGE_CONFIG (connection string) e extrai o ecfg_* corretamente", async () => {
    process.env.EDGE_CONFIG_TOKEN = "tok";
    process.env.EDGE_CONFIG = "https://edge-config.vercel.com/ecfg_fromConnString?token=readtoken";

    const fetchMock = mockFetchOnce(200);
    await writeEdgePayload("k", { a: 1 });

    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("fetch not called");
    expect(call[0]).toBe("https://api.vercel.com/v1/edge-config/ecfg_fromConnString/items");
  });

  it("dá preferência a EDGE_CONFIG_ID explícito sobre EDGE_CONFIG", async () => {
    process.env.EDGE_CONFIG_TOKEN = "tok";
    process.env.EDGE_CONFIG_ID = "ecfg_explicit";
    process.env.EDGE_CONFIG = "https://edge-config.vercel.com/ecfg_fromConnString?token=x";

    const fetchMock = mockFetchOnce(200);
    await writeEdgePayload("k", { a: 1 });

    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("fetch not called");
    const url = call[0] as string;
    expect(url).toContain("ecfg_explicit");
    expect(url).not.toContain("ecfg_fromConnString");
  });
});

describe("writeEdgePayload — no-op friendly", () => {
  it("não chama fetch quando EDGE_CONFIG_TOKEN está ausente; loga warn estruturado", async () => {
    process.env.EDGE_CONFIG_ID = "ecfg_present";
    // EDGE_CONFIG_TOKEN faltando.

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // `lib/tse/log` escreve em console.error para warn — capturamos.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(writeEdgePayload("k", { a: 1 })).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    // Garante que a linha de log inclui a chave e a razão.
    const logged = errorSpy.mock.calls[0]?.[0] as string;
    expect(logged).toContain("edge-config write skipped");
    expect(logged).toContain('"key":"k"');
    expect(logged).toContain('"hasToken":false');
  });

  it("não chama fetch quando o ID do Edge Config não pode ser resolvido", async () => {
    process.env.EDGE_CONFIG_TOKEN = "tok-only";
    // Sem EDGE_CONFIG_ID e sem EDGE_CONFIG.

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await writeEdgePayload("k", {});

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("writeEdgePayload — error handling", () => {
  it("lança Error com status e snippet do corpo quando fetch retorna 401", async () => {
    process.env.EDGE_CONFIG_TOKEN = "bad-token";
    process.env.EDGE_CONFIG_ID = "ecfg_x";

    mockFetchOnce(401, { error: { message: "invalid token" } });

    // Uma única chamada — o snippet do body é parte da MESMA mensagem do error.
    await expect(writeEdgePayload("projection:current", {})).rejects.toThrow(
      /http 401.*invalid token/s,
    );
  });

  it("lança Error com status quando fetch retorna 403", async () => {
    process.env.EDGE_CONFIG_TOKEN = "tok";
    process.env.EDGE_CONFIG_ID = "ecfg_x";

    mockFetchOnce(403, "forbidden");

    await expect(writeEdgePayload("k", {})).rejects.toThrow(/http 403/);
  });

  it("encadeia cause quando o fetch falha por rede", async () => {
    process.env.EDGE_CONFIG_TOKEN = "tok";
    process.env.EDGE_CONFIG_ID = "ecfg_x";

    const netErr = new Error("ECONNREFUSED");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(netErr));

    await expect(writeEdgePayload("k", {})).rejects.toMatchObject({
      message: expect.stringMatching(/network/),
      cause: netErr,
    });
  });
});

describe("writeEdgePayload — 200 resolves", () => {
  it("resolve sem erro quando fetch retorna 200", async () => {
    process.env.EDGE_CONFIG_TOKEN = "tok";
    process.env.EDGE_CONFIG_ID = "ecfg_x";

    mockFetchOnce(200, { ok: true });

    await expect(writeEdgePayload("k", { hello: "world" })).resolves.toBeUndefined();
  });

  it("resolve em 204 No Content também (Vercel API às vezes retorna 204)", async () => {
    process.env.EDGE_CONFIG_TOKEN = "tok";
    process.env.EDGE_CONFIG_ID = "ecfg_x";

    // 204 não aceita body via Response constructor — passar string vazia.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 })));

    await expect(writeEdgePayload("k", {})).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// writeProjection (T14) — multi-key serialization
// ---------------------------------------------------------------------------

/**
 * Builda um EdgePayload mínimo com N UFs no `por_uf`. Não cobre todos os
 * campos do shape (national/composition/insights são placeholders) — o
 * teste se importa com a quantidade de chaves gravadas, não com o
 * conteúdo do payload em si.
 */
function buildPayload(ufs: string[]): EdgePayload {
  return {
    ts: "2026-10-04T20:00:00Z",
    cargo: 1,
    turno: 1,
    pct_apurado_total: 12.5,
    ufs_apuradas: ufs.length,
    national: {
      candidatos: [],
      needle_position: 0,
      needle_band: "tossup",
      candidato_a_id: null,
      candidato_b_id: null,
      p_segundo_turno_overall: null,
      cenarios_2t: [],
    },
    por_uf: ufs.map((sigla) => ({
      sigla,
      pct_apurado: 0,
      lider: 1,
      margem_atual: 0,
      margem_projetada: 0,
      margem_projetada_ci: [-5, 5],
      chamada: false,
      swing_vs_2022: 0,
      top_candidatos: [],
      vai_a_2t: null,
      bucket: "indefinido" as const,
    })),
    insights: [],
    composition: { pre_election: 1, model: 0, actual_results: 0 },
  };
}

describe("writeProjection — multi-key fan-out", () => {
  it("grava chaves nomeadas + aliases legacy (2 nacionais + 2 por UF) quando tudo OK", async () => {
    process.env.EDGE_CONFIG_TOKEN = "tok";
    process.env.EDGE_CONFIG_ID = "ecfg_proj";

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const payload = buildPayload(["SP", "RJ", "MG"]);
    await writeProjection(payload);

    // 2 nacionais (nomeada + alias) + 2 × 3 UFs (nomeada + alias) = 8 chamadas (S05/F4c ADR-0012).
    expect(fetchMock).toHaveBeenCalledTimes(8);

    // Extrai todos os `key` enviados nos bodies.
    const keysWritten = fetchMock.mock.calls.map((call) => {
      const init = call[1] as RequestInit;
      const body = JSON.parse(init.body as string) as {
        items: Array<{ key: string }>;
      };
      return body.items[0]?.key;
    });

    // Nomeadas (S05+).
    expect(keysWritten).toContain("projection:current:pres:t1");
    expect(keysWritten).toContain("projection:uf:SP:pres:t1");
    expect(keysWritten).toContain("projection:uf:RJ:pres:t1");
    expect(keysWritten).toContain("projection:uf:MG:pres:t1");
    // Aliases legacy (backward-compat S04).
    expect(keysWritten).toContain("projection:current");
    expect(keysWritten).toContain("projection:uf:SP");
    expect(keysWritten).toContain("projection:uf:RJ");
    expect(keysWritten).toContain("projection:uf:MG");
  });

  it("warna quando payload nacional ultrapassa 450KB", async () => {
    process.env.EDGE_CONFIG_TOKEN = "tok";
    process.env.EDGE_CONFIG_ID = "ecfg_proj";

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Infla `insights` com strings longas para ultrapassar 450KB.
    // 1 char ≈ 1 byte em JSON ASCII. 500_000 chars > 450 KB com folga.
    const payload = buildPayload(["SP"]);
    payload.insights = ["x".repeat(500_000)];

    await writeProjection(payload);

    // Procura a linha de warn "oversize" entre as chamadas de console.error.
    const warnedOversize = errorSpy.mock.calls.some((call) =>
      String(call[0]).includes("edge-config projection oversize"),
    );
    expect(warnedOversize).toBe(true);
  });

  it("best-effort: se uma UF falha (500), demais continuam e exceção final agrega", async () => {
    process.env.EDGE_CONFIG_TOKEN = "tok";
    process.env.EDGE_CONFIG_ID = "ecfg_proj";

    // Mock por URL: tudo OK exceto chaves SP (nomeada + alias) → 500.
    // O Vercel API é uma URL única para todas as chaves; diferenciamos
    // pela key dentro do body.
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? "{}") as {
        items?: Array<{ key?: string }>;
      };
      const key = body.items?.[0]?.key ?? "";
      // Ambas chaves SP (nomeada e alias) falham.
      if (key === "projection:uf:SP" || key === "projection:uf:SP:pres:t1") {
        return Promise.resolve(new Response(JSON.stringify({ error: "boom" }), { status: 500 }));
      }
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    const payload = buildPayload(["SP", "RJ", "MG"]);

    // 2 chaves SP falham (nomeada + alias) de 8 totais → "2/8".
    await expect(writeProjection(payload)).rejects.toThrow(
      /writeProjection: 2\/8 chave\(s\) falharam.*projection:uf:SP/s,
    );

    // Mesmo com SP falhando, RJ e MG foram tentados (8 chamadas ao todo).
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });
});
