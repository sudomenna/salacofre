/**
 * tests/unit/api/edge-write.test.ts
 *
 * Unit tests for POST /api/internal/edge-write (spec 002, T15).
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
  writeDeputadoProjection: vi.fn(),
}));

// Import post-mock
import { POST } from "@/app/api/internal/edge-write/route";
import { writeDeputadoProjection, writeProjection } from "@/lib/edge-config/writer";

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

/**
 * Body mínimo do envelope PROPORCIONAL (spec 017 / design 017 § D1 e D5).
 *
 * Não é `validBody()` com o cargo trocado: o envelope é outro — `bancada` no
 * lugar de `national`, mais `atualizacao_min` (RF-128). É essa diferença que
 * a rota usa para escolher o writer.
 */
function validDeputadoBody(): {
  payload: Record<string, unknown>;
  payloads_uf?: Record<string, unknown>;
} {
  return {
    payload: {
      ts: "2026-10-04T20:00:00Z",
      cargo: 6 as const,
      turno: 1 as const,
      pct_apurado_total: 12.5,
      ufs_apuradas: 3,
      atualizacao_min: 15,
      bancada: {
        total_cadeiras: 513,
        cadeiras_atribuidas: 70,
        ufs_calculadas: 3,
        ufs_aguardando: 24,
        por_agremiacao: [],
      },
      por_uf: [{ sigla: "SP" }, { sigla: "RJ" }],
      insights: [],
      composition: { pre_election: 0, model: 1, actual_results: 0 },
    },
  };
}

/** Cria um NextRequest POST sintético com headers opcionais. */
function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/internal/edge-write", {
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

describe("POST /api/internal/edge-write — auth", () => {
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

describe("POST /api/internal/edge-write — body validation", () => {
  it("retorna 400 quando body não tem campo `payload`", async () => {
    const req = makeRequest({ foo: "bar" }, { "x-model-secret": "test-secret-xyz" });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string; detail: unknown };
    expect(json.error).toBe("invalid_body");
    expect(json.detail).toBeTruthy();
    expect(writeProjection).not.toHaveBeenCalled();
  });

  it("retorna 400 quando payload tem cargo fora da tabela canônica (7 = Dep. Estadual)", async () => {
    // Era o cargo 5 que este teste usava como inválido, até 2026-09-11: com a
    // spec 016, Senador passou a ser suportado. O que segue inválido são os
    // cargos que o produto deliberadamente NÃO cobre — 7/8 (assembleias
    // estaduais/distrital) e os vices (2, 4), que não têm votação própria.
    for (const cargoForaDoEscopo of [2, 4, 7, 8, 99]) {
      const body = validBody();
      // biome-ignore lint/suspicious/noExplicitAny: cast pra forçar cargo inválido no teste
      (body.payload as any).cargo = cargoForaDoEscopo;
      const res = await POST(makeRequest(body, { "x-model-secret": "test-secret-xyz" }));

      expect(res.status, `cargo ${cargoForaDoEscopo} deveria dar 400`).toBe(400);
    }
    expect(writeProjection).not.toHaveBeenCalled();
  });

  it("aceita o cargo 5 (Senador) no envelope majoritário", async () => {
    vi.mocked(writeProjection).mockClear();
    const body = validBody();
    // biome-ignore lint/suspicious/noExplicitAny: o tipo do fixture é o payload presidencial
    (body.payload as any).cargo = 5;
    const res = await POST(makeRequest(body, { "x-model-secret": "test-secret-xyz" }));

    expect(res.status).toBe(200);
    expect(writeProjection).toHaveBeenCalled();
  });

  it("cargo 6 no envelope MAJORITÁRIO é rejeitado — não é só um campo a menos", async () => {
    // Até 2026-09-12 este body passava e chamava `writeProjection`. Duplamente
    // errado: ia para a chave `projection-current-pres-t1` (ver a correção de
    // `cargoFromTseNumeric`) e, se tivesse ido para a chave certa, iria sem
    // `bancada` — o payload inteiro da corrida proporcional. Asserção
    // negativa: o caminho majoritário não pode voltar a aceitar cargo 6.
    vi.mocked(writeProjection).mockClear();
    vi.mocked(writeDeputadoProjection).mockClear();
    const body = validBody();
    // biome-ignore lint/suspicious/noExplicitAny: o tipo do fixture é o payload presidencial
    (body.payload as any).cargo = 6;
    const res = await POST(makeRequest(body, { "x-model-secret": "test-secret-xyz" }));

    expect(res.status).toBe(400);
    expect(writeProjection).not.toHaveBeenCalled();
    expect(writeDeputadoProjection).not.toHaveBeenCalled();
  });

  it("cargo 6 no envelope de Deputado vai para writeDeputadoProjection, não writeProjection", async () => {
    vi.mocked(writeProjection).mockClear();
    vi.mocked(writeDeputadoProjection).mockClear();
    const res = await POST(
      makeRequest(validDeputadoBody(), { "x-model-secret": "test-secret-xyz" }),
    );

    expect(res.status).toBe(200);
    expect(writeDeputadoProjection).toHaveBeenCalledTimes(1);
    // A trava de D1: o envelope proporcional NUNCA passa pelo caminho
    // majoritário, cujo `EdgeNational` não tem referente nesta corrida.
    expect(writeProjection).not.toHaveBeenCalled();
  });

  it("rejeita sigla inválida dentro de payloads_uf do cargo 6 — ela vira caminho de Blob", async () => {
    vi.mocked(writeDeputadoProjection).mockClear();
    const body = validDeputadoBody();
    body.payloads_uf = { SP: { uf: "S/P", agremiacoes: [] } };
    const res = await POST(makeRequest(body, { "x-model-secret": "test-secret-xyz" }));

    expect(res.status).toBe(400);
    expect(writeDeputadoProjection).not.toHaveBeenCalled();
  });

  it("retorna 400 quando uma sigla de por_uf não formaria chave válida", async () => {
    // A sigla é o único componente do nome de chave do Global Config que vem
    // de fora do código — ela entra literalmente em
    // `projection-uf-<SIGLA>-<cargo>-t<turno>`. Barrar aqui, na borda, com um
    // 400 explicativo, é melhor que estourar lá dentro do `writeProjection`
    // como falha parcial de gravação no meio da apuração.
    for (const badSigla of ["SP:1", "S", "SPX", "", "sp/rj"]) {
      const body = validBody();
      body.payload.por_uf = [{ sigla: badSigla }];
      const req = makeRequest(body, { "x-model-secret": "test-secret-xyz" });

      const res = await POST(req);

      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string; detail: unknown };
      expect(json.error).toBe("invalid_body");
      expect(JSON.stringify(json.detail)).toContain("A-Za-z0-9_-");
      expect(writeProjection).not.toHaveBeenCalled();
    }
  });

  it("aceita sigla de 2 letras — o caso normal segue passando", async () => {
    vi.mocked(writeProjection).mockResolvedValueOnce(undefined);
    const body = validBody();
    body.payload.por_uf = [{ sigla: "SP" }, { sigla: "DF" }];

    const res = await POST(makeRequest(body, { "x-model-secret": "test-secret-xyz" }));

    expect(res.status).toBe(200);
    expect(writeProjection).toHaveBeenCalledOnce();
  });

  it("retorna 400 quando body não é JSON válido", async () => {
    // Construímos um NextRequest com body que não parseia.
    const req = new NextRequest("http://localhost/api/internal/edge-write", {
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

describe("POST /api/internal/edge-write — happy path", () => {
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

describe("POST /api/internal/edge-write — failure mapping", () => {
  it("retorna 500 com mensagem quando writeProjection lança", async () => {
    vi.mocked(writeProjection).mockRejectedValueOnce(
      new Error("writeProjection: 1/3 chave(s) falharam — projection-uf-SP: http 500"),
    );

    const req = makeRequest(validBody(), { "x-model-secret": "test-secret-xyz" });

    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string; detail: string };
    expect(json.error).toBe("edge_write_failed");
    expect(json.detail).toContain("projection-uf-SP");
  });
});
