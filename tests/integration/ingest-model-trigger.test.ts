/**
 * tests/integration/ingest-model-trigger.test.ts
 *
 * T16a — Integration test: `/api/ingest` dispara `POST /api/model/project`
 * fire-and-forget 1× por cargo ativo (1=Presidente, 3=Governador) ao fim do
 * ciclo, e SOMENTE quando `changed > 0`.
 *
 * Cobre: RF-019 (re-cálculo do modelo a cada snapshot novo), acoplamento
 * `/api/ingest` → `/api/model/project` (spec 002, Fase 5, T16).
 *
 * Estratégia
 *   - Reusa fixtures sintéticas + mock de `listIngestTargets` do padrão S02
 *     (cf. `tests/integration/ingest-cycle.test.ts`).
 *   - `fetch` global é stubbed pra (1) servir fixtures EA20 nas URLs
 *     `test.invalid`, (2) interceptar chamadas a `/api/model/project` e
 *     contar/responder controladamente, (3) deixar passar Neon DB.
 *   - Cenário A: ciclo com `changed > 0` (sentinels limpos) → fetch ao
 *     modelo é chamado 2× (cargo 1 e cargo 3) com turno=1.
 *   - Cenário B: 2º ciclo (ETag hit, `changed === 0`) → fetch ao modelo
 *     NÃO é chamado.
 *   - Cenário C: endpoint modelo retorna 500 → `/api/ingest` ainda responde
 *     200 (fire-and-forget; resiliência do cron).
 *
 * Sentinels: uf='ZM', cod_zona 99020/99021/99022 — distintos dos T18 (99001),
 * T19 (99010..99012) para não colidir com outros runs paralelos.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import type { Target } from "@/lib/tse/targets";

// ---------------------------------------------------------------------------
// vi.mock hoisting
// ---------------------------------------------------------------------------

// 2026-09-05 — route.ts agora também importa getActiveCargos de
// lib/tse/targets (hardening pré-simulado: TSE_CARGOS substitui o array
// hardcoded ACTIVE_CARGOS). O mock precisa fornecer as duas exports, senão
// route.ts recebe `undefined` e quebra ao chamar getActiveCargos() dentro
// do bloco de model-trigger — usamos importOriginal para herdar o resto do
// módulo real (buildEA20Url, getTseBaseUrl, etc.) e só sobrescrever
// listIngestTargets.
vi.mock("@/lib/tse/targets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tse/targets")>();
  return {
    ...actual,
    listIngestTargets: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/ingest/route";
import { listIngestTargets } from "@/lib/tse/targets";

// ---------------------------------------------------------------------------
// Sentinels
// ---------------------------------------------------------------------------

const TEST_UF = "ZM";
const TEST_ZONES = [99020, 99021, 99022] as const;
const TEST_COD_MUNICIPIO_TSE = 99998;
const FIXTURES_DIR = resolve(process.cwd(), "tests/fixtures/tse/2022");

const SYNTHETIC_URLS = [
  "https://test.invalid/zm-z99020-c0001.json",
  "https://test.invalid/zm-z99021-c0001.json",
  "https://test.invalid/zm-z99022-c0001.json",
] as const;

function loadFixtureText(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf8");
}

const FIXTURE_TEXTS: Record<string, string> = {
  [SYNTHETIC_URLS[0]]: loadFixtureText("presidente-sp-z0001.json"),
  [SYNTHETIC_URLS[1]]: loadFixtureText("presidente-sp-z0002.json"),
  [SYNTHETIC_URLS[2]]: loadFixtureText("presidente-rj-z0001.json"),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSyntheticTargets(): Target[] {
  return TEST_ZONES.map((codZona, i) => ({
    uf: TEST_UF,
    cargo: 1 as const,
    nivel: "zona" as const,
    codMunicipioTse: TEST_COD_MUNICIPIO_TSE,
    codZona,
    url: SYNTHETIC_URLS[i] as string,
    codEleicao: "ele2026/test",
  }));
}

function buildReq(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/ingest", {
    method: "POST",
    headers,
  });
}

function cronHeaders(): Record<string, string> {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET não definida no ambiente de teste");
  return { "x-cron-secret": secret };
}

// ---------------------------------------------------------------------------
// Fetch mock with model-trigger capture
// ---------------------------------------------------------------------------

const nativeFetch = globalThis.fetch;

interface ModelCall {
  url: string;
  body: { cargo: number; turno: number; trigger_ts: string };
  modelSecret: string | null;
}

/**
 * Cria um mock de fetch que:
 *  - serve fixtures EA20 para URLs sintéticas TSE (`test.invalid`);
 *  - captura chamadas a `/api/model/project` em `calls` (array externo);
 *  - retorna 200 OK no modelo por default (override via `modelStatus`);
 *  - pass-through pra Neon DB (Drizzle usa HTTP no Neon serverless driver).
 */
function makeFetchMock(opts: {
  capture: ModelCall[];
  modelStatus?: number;
}): ReturnType<typeof vi.fn> {
  const modelStatus = opts.modelStatus ?? 200;
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr =
      typeof url === "string" ? url : url instanceof URL ? url.href : (url as Request).url;

    // Captura chamadas pro endpoint do modelo.
    if (urlStr.endsWith("/api/model/project")) {
      const headersRaw = init?.headers;
      const headers =
        headersRaw instanceof Headers
          ? headersRaw
          : new Headers(headersRaw as Record<string, string> | undefined);
      const rawBody =
        typeof init?.body === "string" ? init.body : init?.body ? String(init.body) : "{}";
      let parsedBody: ModelCall["body"];
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        parsedBody = { cargo: -1, turno: -1, trigger_ts: "" };
      }
      opts.capture.push({
        url: urlStr,
        body: parsedBody,
        modelSecret: headers.get("x-model-secret"),
      });
      return new Response(JSON.stringify({ ok: modelStatus < 400 }), {
        status: modelStatus,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fixtures TSE.
    if (urlStr.includes("test.invalid")) {
      const headersRaw = init?.headers;
      const headers =
        headersRaw instanceof Headers
          ? headersRaw
          : new Headers(headersRaw as Record<string, string> | undefined);
      const ifNoneMatch = headers.get("if-none-match");
      if (ifNoneMatch && ifNoneMatch.length > 0 && FIXTURE_TEXTS[urlStr] !== undefined) {
        return {
          status: 304,
          ok: false,
          headers: { get: (_n: string) => null },
          text: async () => "",
        } as unknown as Response;
      }
      const body = FIXTURE_TEXTS[urlStr];
      if (body === undefined) return new Response("Not Found", { status: 404 });
      const etag = `"etag-${urlStr.slice(-10)}"`;
      return new Response(body, {
        status: 200,
        headers: { ETag: etag, "Content-Type": "application/json" },
      });
    }

    // Pass-through (Neon DB).
    return nativeFetch(url as string, init);
  });
}

async function cleanupTestData(): Promise<void> {
  await db.execute(sql`
    DELETE FROM snapshots
    WHERE uf = ${TEST_UF}
      AND cod_zona IN (${TEST_ZONES[0]}, ${TEST_ZONES[1]}, ${TEST_ZONES[2]})
  `);
}

/**
 * `after()` do Next 16 agenda o fetch fora do hot path. Em testes
 * (sem runtime Vercel), ele degrada para Promise síncrono mas pode demorar
 * 1 microtask pra disparar. Pequeno yield para que as chamadas registradas
 * apareçam no array antes de `expect`.
 */
async function waitForAfterCallbacks(ms = 50): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("T16 — /api/ingest dispara /api/model/project (integration)", { timeout: 30000 }, () => {
  let originalCronSecret: string | undefined;
  let originalCronEnabled: string | undefined;
  let originalWindowOverride: string | undefined;
  let originalTurno: string | undefined;
  let originalCodEleicao: string | undefined;
  let originalModelSecret: string | undefined;
  let originalInternalBaseUrl: string | undefined;
  let originalVercelUrl: string | undefined;

  beforeAll(async () => {
    originalCronSecret = process.env.CRON_SECRET;
    originalCronEnabled = process.env.CRON_ENABLED;
    originalWindowOverride = process.env.INGEST_WINDOW_OVERRIDE;
    originalTurno = process.env.TSE_TURNO;
    originalCodEleicao = process.env.TSE_COD_ELEICAO;
    originalModelSecret = process.env.MODEL_SECRET;
    originalInternalBaseUrl = process.env.INTERNAL_BASE_URL;
    originalVercelUrl = process.env.VERCEL_URL;

    process.env.TSE_COD_ELEICAO = "ele2026/test";
    process.env.INGEST_WINDOW_OVERRIDE = "true";
    process.env.CRON_ENABLED = "true";
    process.env.TSE_TURNO = "1";
    process.env.MODEL_SECRET = "test-model-secret";
    process.env.INTERNAL_BASE_URL = "http://localhost:13000";
    delete process.env.VERCEL_URL;

    await cleanupTestData();
  });

  afterAll(async () => {
    if (originalCronSecret !== undefined) process.env.CRON_SECRET = originalCronSecret;
    else delete process.env.CRON_SECRET;
    if (originalCronEnabled !== undefined) process.env.CRON_ENABLED = originalCronEnabled;
    else delete process.env.CRON_ENABLED;
    if (originalWindowOverride !== undefined)
      process.env.INGEST_WINDOW_OVERRIDE = originalWindowOverride;
    else delete process.env.INGEST_WINDOW_OVERRIDE;
    if (originalTurno !== undefined) process.env.TSE_TURNO = originalTurno;
    else delete process.env.TSE_TURNO;
    if (originalCodEleicao !== undefined) process.env.TSE_COD_ELEICAO = originalCodEleicao;
    else delete process.env.TSE_COD_ELEICAO;
    if (originalModelSecret !== undefined) process.env.MODEL_SECRET = originalModelSecret;
    else delete process.env.MODEL_SECRET;
    if (originalInternalBaseUrl !== undefined)
      process.env.INTERNAL_BASE_URL = originalInternalBaseUrl;
    else delete process.env.INTERNAL_BASE_URL;
    if (originalVercelUrl !== undefined) process.env.VERCEL_URL = originalVercelUrl;
    else delete process.env.VERCEL_URL;

    await cleanupTestData();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // Cenários A + B compartilham estado (A popula snapshots/etags; B verifica
  // ETag dedup). Limpeza só no final do par.
  // -------------------------------------------------------------------------

  describe("cenários A+B — par com estado compartilhado", () => {
    afterAll(async () => {
      await cleanupTestData();
    });

    it("A1. dispatches POST /api/model/project para cada cargo ativo quando changed>0", async () => {
      const captured: ModelCall[] = [];
      vi.mocked(listIngestTargets).mockResolvedValue(buildSyntheticTargets());
      vi.stubGlobal("fetch", makeFetchMock({ capture: captured }));

      const req = buildReq(cronHeaders());
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.filesChanged).toBe(3);

      await waitForAfterCallbacks();

      // 2 chamadas: cargo 1 (Presidente) + cargo 3 (Governador), turno 1.
      expect(captured).toHaveLength(2);
      const cargos = captured.map((c) => c.body.cargo).sort((a, b) => a - b);
      expect(cargos).toEqual([1, 3]);

      // Todas com turno 1, trigger_ts ISO, secret válida, URL pro base correto.
      for (const call of captured) {
        expect(call.body.turno).toBe(1);
        expect(call.body.trigger_ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(call.modelSecret).toBe("test-model-secret");
        expect(call.url).toBe("http://localhost:13000/api/model/project");
      }
    });

    it("B1. 2º ciclo (ETag hit em todas as zonas) → 0 chamadas ao modelo", async () => {
      // Cenário A já populou snapshots+etags. Este ciclo deve hit todos os
      // ETags e retornar changed=0 → modelo NÃO disparado.
      const captured: ModelCall[] = [];
      vi.mocked(listIngestTargets).mockResolvedValue(buildSyntheticTargets());
      vi.stubGlobal("fetch", makeFetchMock({ capture: captured }));

      const req = buildReq(cronHeaders());
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.filesChanged).toBe(0);

      await waitForAfterCallbacks();

      // Crítico: modelo NÃO foi chamado.
      expect(captured).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Cenário C: modelo retorna 500 → ingest ainda responde 200 (fire-and-forget)
  // -------------------------------------------------------------------------

  describe("cenário C — falha no modelo NÃO afeta response do ingest", () => {
    beforeAll(async () => {
      await cleanupTestData();
    });

    afterAll(async () => {
      await cleanupTestData();
    });

    it("C1. modelo retorna 500 → /api/ingest responde 200 ok e captura 2 tentativas", async () => {
      const captured: ModelCall[] = [];
      vi.mocked(listIngestTargets).mockResolvedValue(buildSyntheticTargets());
      vi.stubGlobal("fetch", makeFetchMock({ capture: captured, modelStatus: 500 }));

      const req = buildReq(cronHeaders());
      const res = await POST(req);

      // Response do ingest é 200 ok, sem depender do modelo.
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.filesChanged).toBe(3);

      await waitForAfterCallbacks();

      // As tentativas saíram (ambos os cargos foram chamados), mesmo que
      // tenham recebido 500 — fire-and-forget.
      expect(captured).toHaveLength(2);
    });
  });
});
