/**
 * tests/unit/api/edge-write.test.ts
 *
 * Unit tests for POST /api/_internal/edge-write (spec 002, T15).
 *
 * Estratégia
 *   - Mocka `writeProjection` via `vi.mock` (hoisted) — não queremos bater
 *     em api.vercel.com nem testar a serialização real aqui (isso já está
 *     coberto em `tests/unit/edge-config/writer.test.ts`). Foco do teste é
 *     o handler: auth, validação Zod, mapeamento de erros.
 *   - Constrói `NextRequest` direto (sem subir Next dev), igual ao padrão
 *     de `tests/integration/ingest-cycle.test.ts`.
 *   - MODEL_SECRET é manipulado em `beforeEach` / `afterEach` com snapshot
 *     do env original.
 */

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// vi.mock — writeProjection (hoisted)
// ---------------------------------------------------------------------------

vi.mock("@/lib/edge-config/writer", () => ({
  writeProjection: vi.fn(),
}));

// Import post-mock
import { POST } from "@/app/api/_internal/edge-write/route";
import { writeProjection } from "@/lib/edge-config/writer";

// ---------------------------------------------------------------------------
// Env management
// ---------------------------------------------------------------------------

let originalSecret: string | undefined;

beforeEach(() => {
  originalSecret = process.env.MODEL_SECRET;
  process.env.MODEL_SECRET = "test-secret-xyz";
  // Cala logs estruturados que iriam poluir output do test.
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.MODEL_SECRET;
  } else {
    process.env.MODEL_SECRET = originalSecret;
  }
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Constrói um body válido para o endpoint — mínimo necessário para passar
 * pelo schema Zod do route. Caller pode mutar antes de serializar.
 */
function validBody() {
  return {
    payload: {
      ts: "2026-10-04T20:00:00Z",
      cargo: 1 as const,
      turno: 1 as const,
      pct_apurado_total: 0,
      ufs_apuradas: 0,
      national: {
        candidatos: [],
        needle_position: 0,
        needle_band: "tossup",
      },
      por_uf: [{ sigla: "SP" /* shape passthrough — só `sigla` matters here */ }, { sigla: "RJ" }],
      insights: [],
      composition: { pre_election: 1, model: 0, actual_results: 0 },
    },
  };
}

/** Cria um NextRequest POST sintético com headers opcionais. */
function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/_internal/edge-write", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/_internal/edge-write — auth", () => {
  it("retorna 401 quando x-model-secret está ausente", async () => {
    const req = makeRequest(validBody());

    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("unauthorized");
    expect(writeProjection).not.toHaveBeenCalled();
  });

  it("retorna 401 quando x-model-secret está errado", async () => {
    const req = makeRequest(validBody(), { "x-model-secret": "wrong" });

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(writeProjection).not.toHaveBeenCalled();
  });

  it("retorna 500 quando MODEL_SECRET não está configurado no env", async () => {
    delete process.env.MODEL_SECRET;
    const req = makeRequest(validBody(), { "x-model-secret": "anything" });

    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("misconfigured");
    expect(writeProjection).not.toHaveBeenCalled();
  });
});

describe("POST /api/_internal/edge-write — body validation", () => {
  it("retorna 400 quando body não tem campo `payload`", async () => {
    const req = makeRequest({ foo: "bar" }, { "x-model-secret": "test-secret-xyz" });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string; detail: unknown };
    expect(json.error).toBe("invalid_body");
    expect(json.detail).toBeTruthy();
    expect(writeProjection).not.toHaveBeenCalled();
  });

  it("retorna 400 quando payload tem cargo inválido (5 — não é 1 nem 3)", async () => {
    const body = validBody();
    // biome-ignore lint/suspicious/noExplicitAny: cast pra forçar cargo inválido no teste
    (body.payload as any).cargo = 5;
    const req = makeRequest(body, { "x-model-secret": "test-secret-xyz" });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(writeProjection).not.toHaveBeenCalled();
  });

  it("retorna 400 quando body não é JSON válido", async () => {
    // Construímos um NextRequest com body que não parseia.
    const req = new NextRequest("http://localhost/api/_internal/edge-write", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-model-secret": "test-secret-xyz",
      },
      body: "{ not valid json",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("invalid_json");
    expect(writeProjection).not.toHaveBeenCalled();
  });
});

describe("POST /api/_internal/edge-write — happy path", () => {
  it("retorna 200 com keys_written quando writeProjection sucede", async () => {
    vi.mocked(writeProjection).mockResolvedValueOnce(undefined);

    const req = makeRequest(validBody(), { "x-model-secret": "test-secret-xyz" });

    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; keys_written: number };
    expect(json.ok).toBe(true);
    // 1 nacional + 2 UFs no body de teste = 3 chaves
    expect(json.keys_written).toBe(3);
    expect(writeProjection).toHaveBeenCalledOnce();
  });
});

describe("POST /api/_internal/edge-write — failure mapping", () => {
  it("retorna 500 com mensagem quando writeProjection lança", async () => {
    vi.mocked(writeProjection).mockRejectedValueOnce(
      new Error("writeProjection: 1/3 chave(s) falharam — projection:uf:SP: http 500"),
    );

    const req = makeRequest(validBody(), { "x-model-secret": "test-secret-xyz" });

    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string; detail: string };
    expect(json.error).toBe("edge_write_failed");
    expect(json.detail).toContain("projection:uf:SP");
  });
});
