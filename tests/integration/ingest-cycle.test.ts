/**
 * tests/integration/ingest-cycle.test.ts
 *
 * T19 — Integration test: ciclo completo /api/ingest.
 *
 * Cobre: RF-001, RF-002, RF-003, RF-004, RNF-016.
 *
 * Estratégia:
 *   - Importa o route handler diretamente (sem subir Next dev).
 *   - Mocka `listIngestTargets` via vi.mock (opção a) para retornar 3 Targets
 *     sintéticos apontando para URLs únicas.
 *   - Mocka `fetch` global (opção c) para responder com fixtures reais 2022 por URL.
 *   - Usa DB Neon real para testar append-only e ingest_log.
 *   - Sentinel: uf='ZT', codZona 99010/99011/99012 (separados dos T18: 99001).
 *
 * Decisões de implementação:
 *   - vi.mock é hoisted — garante que o mock de targets está ativo antes de
 *     qualquer import do route handler.
 *   - fetch mock retorna 304 quando If-None-Match está presente (simula ETag
 *     dedup real do CDN TSE no 2º ciclo).
 *   - vi.useFakeTimers para testar janela 17h-04h BRT sem depender do relógio real.
 *   - CRON_SECRET/DATABASE_URL chegam via shell (export $(cat .env.local | ...)).
 *   - TSE_COD_ELEICAO setado explicitamente no beforeAll para o targets não
 *     explodir (getCodEleicao() throw se ausente).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import type { Target } from "@/lib/tse/targets";

// ---------------------------------------------------------------------------
// vi.mock hoisting — deve ficar no topo do módulo
// ---------------------------------------------------------------------------

// Mocka listIngestTargets para retornar 3 Targets sintéticos controlados.
// O factory é definido vazio aqui; os Targets reais são injetados em cada
// describe via mockResolvedValue(). Targets apontam para URLs únicas mapeadas
// pelo mockFetch.
vi.mock("@/lib/tse/targets", () => ({
  listIngestTargets: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import post-mock
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/ingest/route";
// Import após vi.mock para garantir que o módulo receba a versão mockada.
import { listIngestTargets } from "@/lib/tse/targets";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_UF = "ZT";
// Sentinels distintos dos T18 (99001..99002) para evitar colisão de dados
const TEST_ZONES = [99010, 99011, 99012] as const;
// Turno 1 — parseTurnoEnv() só aceita "1" ou "2"; turno 9 não é válido.
// Isolamento é garantido por uf='ZT' + cod_zona sintético (não existe na prod).
const _TEST_TURNO = 1;
const TEST_COD_MUNICIPIO_TSE = 99999;
const FIXTURES_DIR = resolve(process.cwd(), "tests/fixtures/tse/2022");

// URLs sintéticas — não apontam para a CDN real (fetch é mockado)
const SYNTHETIC_URLS = [
  "https://test.invalid/zt-z99010-c0001.json",
  "https://test.invalid/zt-z99011-c0001.json",
  "https://test.invalid/zt-z99012-c0001.json",
] as const;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function loadFixtureText(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf8");
}

const FIXTURE_TEXTS: Record<string, string> = {
  [SYNTHETIC_URLS[0]]: loadFixtureText("presidente-sp-z0001.json"),
  [SYNTHETIC_URLS[1]]: loadFixtureText("presidente-sp-z0002.json"),
  [SYNTHETIC_URLS[2]]: loadFixtureText("presidente-rj-z0001.json"),
};

// ---------------------------------------------------------------------------
// Helpers — build synthetic targets
// ---------------------------------------------------------------------------

function buildSyntheticTargets(): Target[] {
  return TEST_ZONES.map((codZona, i) => ({
    uf: TEST_UF,
    cargo: 1 as const,
    codMunicipioTse: TEST_COD_MUNICIPIO_TSE,
    codZona,
    url: SYNTHETIC_URLS[i] as string,
    codEleicao: "ele2026/test",
  }));
}

// ---------------------------------------------------------------------------
// Helpers — build NextRequest
// ---------------------------------------------------------------------------

function buildReq(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/ingest", {
    method: "POST",
    headers,
  });
}

// ---------------------------------------------------------------------------
// Helpers — auth header
// ---------------------------------------------------------------------------

function cronHeaders(): Record<string, string> {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET não definida no ambiente de teste");
  return { "x-cron-secret": secret };
}

// ---------------------------------------------------------------------------
// Helpers — fetch mock factory
// ---------------------------------------------------------------------------

// Referência ao fetch nativo — capturado antes de qualquer stubbing
const nativeFetch = globalThis.fetch;

/**
 * Cria um mock de fetch que:
 *  - Intercepta apenas URLs sintéticas TSE (test.invalid) — passa-through para
 *    URLs reais (Neon DB usa HTTP internamente, não pode ser interceptado).
 *  - Responde com o texto da fixture correspondente a cada URL sintética.
 *  - Retorna 304 quando o cabeçalho If-None-Match está presente (simula CDN
 *    ETag hit no 2º ciclo — o handler persistiu o ETag do 1º ciclo).
 *  - Retorna 404 para URLs sintéticas não mapeadas.
 *
 * ETag fixo por URL: '"etag-<url-suffix>"' — valor simples e determinístico.
 */
function makeFixtureFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr =
      typeof url === "string" ? url : url instanceof URL ? url.href : (url as Request).url;

    // Pass-through: deixa chamadas Neon/DB passarem pelo fetch nativo
    if (!urlStr.includes("test.invalid")) {
      return nativeFetch(url as string, init);
    }

    // Verificar If-None-Match para simular 304 (dedup ETag no 2º ciclo)
    const headersRaw = init?.headers;
    const headers =
      headersRaw instanceof Headers
        ? headersRaw
        : new Headers(headersRaw as Record<string, string> | undefined);

    const ifNoneMatch = headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch.length > 0 && FIXTURE_TEXTS[urlStr] !== undefined) {
      // ETag hit: retorna 304 sem body (sem payload — RFC 7232)
      return {
        status: 304,
        ok: false,
        headers: {
          get: (_name: string) => null,
        },
        text: async () => "",
      } as unknown as Response;
    }

    const body = FIXTURE_TEXTS[urlStr];
    if (body === undefined) {
      return new Response("Not Found", { status: 404 });
    }

    // Retorna 200 com fixture + ETag para o 1º ciclo
    const etag = `"etag-${urlStr.slice(-10)}"`;
    return new Response(body, {
      status: 200,
      headers: { ETag: etag, "Content-Type": "application/json" },
    });
  });
}

// ---------------------------------------------------------------------------
// DB cleanup helpers
// ---------------------------------------------------------------------------

async function cleanupTestData(): Promise<void> {
  await db.execute(sql`
    DELETE FROM snapshots
    WHERE uf = ${TEST_UF}
      AND cod_zona IN (${TEST_ZONES[0]}, ${TEST_ZONES[1]}, ${TEST_ZONES[2]})
  `);
  // ingest_log não tem sentinel fácil de isolar — usamos contagem relativa.
  // Não deletamos ingest_log aqui para não interferir com outros runs simultâneos.
}

async function countSentinelSnapshots(): Promise<number> {
  const result = await db.execute<{ n: string }>(sql`
    SELECT COUNT(*)::text AS n
    FROM snapshots
    WHERE uf = ${TEST_UF}
      AND cod_zona IN (${TEST_ZONES[0]}, ${TEST_ZONES[1]}, ${TEST_ZONES[2]})
  `);
  return Number(result.rows[0]?.n ?? 0);
}

async function countIngestLog(): Promise<number> {
  const result = await db.execute<{ n: string }>(sql`
    SELECT COUNT(*)::text AS n FROM ingest_log
  `);
  return Number(result.rows[0]?.n ?? 0);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("T19 — ciclo completo /api/ingest (integration)", { timeout: 30000 }, () => {
  // Env vars salvas para restaurar após os testes que as alteram
  let originalCronSecret: string | undefined;
  let originalCronEnabled: string | undefined;
  let originalWindowOverride: string | undefined;
  let originalTurno: string | undefined;
  let originalCodEleicao: string | undefined;

  beforeAll(async () => {
    // Salvar estado original das env vars
    originalCronSecret = process.env.CRON_SECRET;
    originalCronEnabled = process.env.CRON_ENABLED;
    originalWindowOverride = process.env.INGEST_WINDOW_OVERRIDE;
    originalTurno = process.env.TSE_TURNO;
    originalCodEleicao = process.env.TSE_COD_ELEICAO;

    // Garantir TSE_COD_ELEICAO definida para que getCodEleicao() não exploda
    process.env.TSE_COD_ELEICAO = "ele2026/test";

    // Limpar dados sentinel anteriores
    await cleanupTestData();
  });

  afterAll(async () => {
    // Restaurar env vars originais
    if (originalCronSecret !== undefined) {
      process.env.CRON_SECRET = originalCronSecret;
    } else {
      delete process.env.CRON_SECRET;
    }
    if (originalCronEnabled !== undefined) {
      process.env.CRON_ENABLED = originalCronEnabled;
    } else {
      delete process.env.CRON_ENABLED;
    }
    if (originalWindowOverride !== undefined) {
      process.env.INGEST_WINDOW_OVERRIDE = originalWindowOverride;
    } else {
      delete process.env.INGEST_WINDOW_OVERRIDE;
    }
    if (originalTurno !== undefined) {
      process.env.TSE_TURNO = originalTurno;
    } else {
      delete process.env.TSE_TURNO;
    }
    if (originalCodEleicao !== undefined) {
      process.env.TSE_COD_ELEICAO = originalCodEleicao;
    } else {
      delete process.env.TSE_COD_ELEICAO;
    }

    // Cleanup final dos dados sentinel
    await cleanupTestData();

    vi.restoreAllMocks();
  });

  beforeEach(() => {
    // Restaurar timers reais entre testes (caso algum use fakeTimers)
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // 1. Auth sem x-cron-secret → 401
  // -------------------------------------------------------------------------

  it("1. request sem x-cron-secret retorna 401 { error: 'unauthorized' }", async () => {
    const req = buildReq(); // sem header
    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: "unauthorized" });
  });

  // -------------------------------------------------------------------------
  // 2. CRON_SECRET ausente → 500 { error: 'misconfigured' }
  // -------------------------------------------------------------------------

  it("2. CRON_SECRET ausente no env → 500 { error: 'misconfigured' }", async () => {
    const saved = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;

    try {
      // Envia qualquer header (não importa — o check é se a env está definida)
      const req = buildReq({ "x-cron-secret": "qualquer" });
      const res = await POST(req);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toMatchObject({ error: "misconfigured" });
    } finally {
      if (saved !== undefined) {
        process.env.CRON_SECRET = saved;
      }
    }
  });

  // -------------------------------------------------------------------------
  // 3. Janela fechada → 200 { skipped: 'out_of_window' }
  // -------------------------------------------------------------------------

  it("3. request fora da janela retorna 200 { skipped: 'out_of_window' }", async () => {
    // 12:00 BRT = 15:00 UTC — fora da janela 17h-04h BRT (20h-07h UTC)
    vi.useFakeTimers({ now: new Date("2026-10-04T15:00:00.000Z") });

    // Garantir que override está desligado para que o check de janela atue
    delete process.env.INGEST_WINDOW_OVERRIDE;

    const req = buildReq(cronHeaders());
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ skipped: "out_of_window" });

    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // 4. CRON_ENABLED=false → 200 { skipped: 'cron_disabled' }
  // -------------------------------------------------------------------------

  it("4. CRON_ENABLED=false retorna 200 { skipped: 'cron_disabled' }", async () => {
    process.env.CRON_ENABLED = "false";

    try {
      const req = buildReq(cronHeaders());
      const res = await POST(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ skipped: "cron_disabled" });
    } finally {
      delete process.env.CRON_ENABLED;
    }
  });

  // -------------------------------------------------------------------------
  // 5 + 6. Ciclo completo: 1º ciclo → filesChanged=3; 2º ciclo → filesChanged=0
  // -------------------------------------------------------------------------

  describe("ciclo completo — 1º e 2º ciclo com Neon real", { timeout: 30000 }, () => {
    let logCountBefore: number;

    beforeAll(async () => {
      // Limpar sentinels para que o 1º ciclo parta de estado limpo
      await cleanupTestData();

      // Configurar env para o ciclo rodar dentro da janela
      process.env.INGEST_WINDOW_OVERRIDE = "true";
      process.env.CRON_ENABLED = "true";
      // Turno 1 — parseTurnoEnv() aceita "1" ou "2" apenas
      process.env.TSE_TURNO = "1";

      logCountBefore = await countIngestLog();
    });

    afterAll(async () => {
      // Limpar dados do ciclo de teste
      await cleanupTestData();

      delete process.env.INGEST_WINDOW_OVERRIDE;
      delete process.env.CRON_ENABLED;
      delete process.env.TSE_TURNO;
    });

    it("5a. 1º ciclo — filesChanged=3, errors=0", async () => {
      // Configurar mocks para este ciclo
      vi.mocked(listIngestTargets).mockResolvedValue(buildSyntheticTargets());
      vi.stubGlobal("fetch", makeFixtureFetch());

      const req = buildReq(cronHeaders());
      const res = await POST(req);

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.ok).toBe(true);
      expect(body.filesChanged).toBe(3);
      expect(body.errors).toBe(0);
    });

    it("5b. 2º ciclo — filesChanged=0 (ETag dedup)", async () => {
      // Mesmo mock: fetch retorna 304 quando If-None-Match está presente
      // (o handler busca o ETag do 1º ciclo do DB e envia como If-None-Match)
      vi.mocked(listIngestTargets).mockResolvedValue(buildSyntheticTargets());
      vi.stubGlobal("fetch", makeFixtureFetch());

      const req = buildReq(cronHeaders());
      const res = await POST(req);

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.ok).toBe(true);
      expect(body.filesChanged).toBe(0);
    });

    it("5c. snapshots no DB: exatamente 3 linhas (não 6 — dedup funcionou)", async () => {
      const count = await countSentinelSnapshots();
      expect(count).toBe(3);
    });

    it("6. ingest_log ganhou pelo menos 2 linhas após 2 ciclos", async () => {
      // S04/F0.6 — relaxado de `.toBe(+2)` para `.toBeGreaterThanOrEqual(+2)`
      // após T16b da S03 acoplar `/api/ingest` ao `/api/model/project` via
      // `after()`. Outros integration tests da spec 002 podem inserir em
      // `ingest_log` durante a mesma sessão vitest (mesmo com singleFork em
      // vitest.config.ts pra serializar pool de forks). O invariante real é
      // "ciclos 5a+5b geraram >=2 linhas em ingest_log" — não "exatamente 2".
      // Refactor mais profundo (marker JSON em `notes` da spec 001 shipped)
      // ficou rejeitado pra não tocar production code shipped.
      const logCountAfter = await countIngestLog();
      expect(logCountAfter).toBeGreaterThanOrEqual(logCountBefore + 2);
    });
  });
});
