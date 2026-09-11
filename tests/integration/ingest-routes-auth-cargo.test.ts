/**
 * tests/integration/ingest-routes-auth-cargo.test.ts
 *
 * Testes das DUAS rotas de ingestão introduzidas/alteradas em 2026-09-11
 * (ADR-0035 D3, achados (A) e (B) do plano
 * `perfeito-monte-um-plano-eventual-candle.md`):
 *
 *   - `app/api/ingest/route.ts` (sem cargo) — agora aceita GET além de POST,
 *     e `Authorization: Bearer <CRON_SECRET>` além de `x-cron-secret`.
 *   - `app/api/ingest/[cargo]/route.ts` (novo) — resolve o segmento de rota
 *     para um cargo (1|3, aceitando também os aliases `presidente`/
 *     `governador`), rejeita segmento inválido com 400 ANTES de checar auth,
 *     e mantém um lock anti-overlap INDEPENDENTE por cargo
 *     (`getLastIngestRun(cargo)`, lib/tse/repository.ts).
 *
 * O ciclo completo (targets → fetch → snapshot → dedup) já é coberto por
 * `tests/integration/ingest-cycle.test.ts` — aqui os targets são mockados
 * como `[]` (lista vazia) sempre que o objetivo do teste é auth/roteamento/
 * lock, não a mecânica de ingestão em si.
 */

import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/lib/db";

// ---------------------------------------------------------------------------
// vi.mock hoisting — mesma estratégia de tests/integration/ingest-cycle.test.ts
// ---------------------------------------------------------------------------

vi.mock("@/lib/tse/targets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tse/targets")>();
  return {
    ...actual,
    listIngestTargets: vi.fn(),
  };
});

import { GET as ingestCargoGet, POST as ingestCargoPost } from "@/app/api/ingest/[cargo]/route";
import { GET as ingestGet, POST as ingestPost } from "@/app/api/ingest/route";
import { listIngestTargets } from "@/lib/tse/targets";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireCronSecret(): string {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET não definida no ambiente de teste");
  return secret;
}

function buildReq(method: "GET" | "POST", headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/ingest", { method, headers });
}

function bearerHeaders(): Record<string, string> {
  return { authorization: `Bearer ${requireCronSecret()}` };
}

function legacyHeaders(): Record<string, string> {
  return { "x-cron-secret": requireCronSecret() };
}

/** Constrói o `RouteContext` esperado por app/api/ingest/[cargo]/route.ts. */
function cargoContext(cargo: string) {
  return { params: Promise.resolve({ cargo }) };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("rotas de ingestão — auth (Bearer/x-cron-secret) e cargo (segmento)", {
  timeout: 30000,
}, () => {
  let originalCronEnabled: string | undefined;
  let originalWindowOverride: string | undefined;
  let originalTurno: string | undefined;
  let originalCodEleicao: string | undefined;

  beforeAll(() => {
    originalCronEnabled = process.env.CRON_ENABLED;
    originalWindowOverride = process.env.INGEST_WINDOW_OVERRIDE;
    originalTurno = process.env.TSE_TURNO;
    originalCodEleicao = process.env.TSE_COD_ELEICAO;

    process.env.CRON_ENABLED = "true";
    process.env.INGEST_WINDOW_OVERRIDE = "true";
    process.env.TSE_TURNO = "1";
    process.env.TSE_COD_ELEICAO = "ele2026/test";
  });

  afterAll(() => {
    if (originalCronEnabled !== undefined) process.env.CRON_ENABLED = originalCronEnabled;
    else delete process.env.CRON_ENABLED;
    if (originalWindowOverride !== undefined) {
      process.env.INGEST_WINDOW_OVERRIDE = originalWindowOverride;
    } else {
      delete process.env.INGEST_WINDOW_OVERRIDE;
    }
    if (originalTurno !== undefined) process.env.TSE_TURNO = originalTurno;
    else delete process.env.TSE_TURNO;
    if (originalCodEleicao !== undefined) process.env.TSE_COD_ELEICAO = originalCodEleicao;
    else delete process.env.TSE_COD_ELEICAO;
  });

  beforeEach(() => {
    vi.mocked(listIngestTargets).mockReset();
    vi.mocked(listIngestTargets).mockResolvedValue([]);
  });

  // -------------------------------------------------------------------------
  // /api/ingest (sem cargo) — GET com Bearer, POST com x-cron-secret
  // -------------------------------------------------------------------------

  describe("/api/ingest (sem segmento — todos os cargos)", () => {
    it("GET + Authorization: Bearer <CRON_SECRET> → 200 ok:true (achado A — caminho do Vercel Cron)", async () => {
      const res = await ingestGet(buildReq("GET", bearerHeaders()));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it("POST + x-cron-secret → 200 ok:true (caminho manual do runbook)", async () => {
      const res = await ingestPost(buildReq("POST", legacyHeaders()));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it("GET + x-cron-secret também funciona (aceito nos dois verbos)", async () => {
      const res = await ingestGet(buildReq("GET", legacyHeaders()));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it("POST + Authorization: Bearer também funciona (aceito nos dois verbos)", async () => {
      const res = await ingestPost(buildReq("POST", bearerHeaders()));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it("sem nenhum dos dois headers → 401", async () => {
      const res = await ingestGet(buildReq("GET"));
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toMatchObject({ error: "unauthorized" });
    });

    it("Bearer com segredo errado → 401", async () => {
      const res = await ingestGet(buildReq("GET", { authorization: "Bearer segredo-errado" }));
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // /api/ingest/[cargo] — resolução de segmento
  // -------------------------------------------------------------------------

  describe("/api/ingest/[cargo] — resolução de segmento", () => {
    it("segmento '1' → cargo Presidente, 200 ok:true", async () => {
      const res = await ingestCargoGet(buildReq("GET", bearerHeaders()), cargoContext("1"));
      expect(res.status).toBe(200);
      expect((await res.json()).ok).toBe(true);
    });

    it("segmento 'presidente' → cargo 1, 200 ok:true", async () => {
      const res = await ingestCargoGet(
        buildReq("GET", bearerHeaders()),
        cargoContext("presidente"),
      );
      expect(res.status).toBe(200);
      expect((await res.json()).ok).toBe(true);
    });

    it("segmento '3' → cargo Governador, 200 ok:true", async () => {
      const res = await ingestCargoPost(buildReq("POST", legacyHeaders()), cargoContext("3"));
      expect(res.status).toBe(200);
      expect((await res.json()).ok).toBe(true);
    });

    it("segmento 'governador' → cargo 3, 200 ok:true", async () => {
      const res = await ingestCargoPost(
        buildReq("POST", legacyHeaders()),
        cargoContext("governador"),
      );
      expect(res.status).toBe(200);
      expect((await res.json()).ok).toBe(true);
    });

    it("segmento inválido → 400 { error: 'invalid_cargo' }, mesmo SEM header de auth", async () => {
      const res = await ingestCargoGet(buildReq("GET"), cargoContext("2"));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toMatchObject({ error: "invalid_cargo" });
    });

    it("segmento vazio/lixo → 400", async () => {
      const res = await ingestCargoGet(buildReq("GET", bearerHeaders()), cargoContext("senador"));
      expect(res.status).toBe(400);
    });

    it("segmento válido mas auth ausente → 401 (auth roda DEPOIS da validação de segmento)", async () => {
      const res = await ingestCargoGet(buildReq("GET"), cargoContext("1"));
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Lock anti-overlap independente por cargo (ADR-0035 D3)
  // -------------------------------------------------------------------------

  describe("lock anti-overlap — independente por cargo", () => {
    async function cleanupLockMarkers(): Promise<void> {
      await db.execute(sql`
        DELETE FROM ingest_log
        WHERE notes LIKE '%route-cargo-lock-test%'
      `);
    }

    beforeAll(async () => {
      await cleanupLockMarkers();
    });

    afterAll(async () => {
      await cleanupLockMarkers();
    });

    // Limpa os marcadores SINTÉTICOS (tagueados com `test_marker`) entre
    // testes — sem isso, o marcador `running:true` inserido manualmente por
    // um teste nunca é "resolvido" (a rota real só grava a linha final
    // `running:false` quando o ciclo COMPLETA; um ciclo que retorna
    // `skipped: overlap` nunca chega lá) e continua bloqueando o mesmo
    // cargo no teste seguinte, dentro da janela de 6min do lock. As linhas
    // que a própria rota grava (sem `test_marker`) NÃO são apagadas aqui —
    // elas já se resolvem sozinhas (running:false ao final do ciclo).
    afterEach(async () => {
      await cleanupLockMarkers();
    });

    it("marcador running=true do cargo 1 bloqueia só o cargo 1, não o cargo 3", async () => {
      // Marcador sintético — simula um ciclo do cargo 1 ainda "em voo".
      await db.insert(schema.ingestLog).values({
        durationMs: 0,
        filesFetched: 0,
        filesChanged: 0,
        errors: 0,
        notes: JSON.stringify({
          running: true,
          turno: 1,
          env: "preview",
          cargo: 1,
          test_marker: "route-cargo-lock-test",
        }),
      });

      const resCargo1 = await ingestCargoGet(buildReq("GET", bearerHeaders()), cargoContext("1"));
      expect(resCargo1.status).toBe(200);
      const bodyCargo1 = await resCargo1.json();
      expect(bodyCargo1).toMatchObject({ skipped: "overlap" });

      const resCargo3 = await ingestCargoGet(buildReq("GET", bearerHeaders()), cargoContext("3"));
      expect(resCargo3.status).toBe(200);
      const bodyCargo3 = await resCargo3.json();
      // Cargo 3 não tem marcador `running` seu — segue em frente normalmente.
      expect(bodyCargo3.ok).toBe(true);
      expect(bodyCargo3.skipped).toBeUndefined();
    });

    it("marcador running=true do ciclo SEM cargo (/api/ingest) não bloqueia /api/ingest/[cargo]", async () => {
      await db.insert(schema.ingestLog).values({
        durationMs: 0,
        filesFetched: 0,
        filesChanged: 0,
        errors: 0,
        notes: JSON.stringify({
          running: true,
          turno: 1,
          env: "preview",
          test_marker: "route-cargo-lock-test",
          // Sem `cargo` — representa um ciclo de /api/ingest (todos os cargos).
        }),
      });

      const resCargo1 = await ingestCargoGet(buildReq("GET", bearerHeaders()), cargoContext("1"));
      const bodyCargo1 = await resCargo1.json();
      expect(bodyCargo1.ok).toBe(true);
      expect(bodyCargo1.skipped).toBeUndefined();
    });
  });
});
