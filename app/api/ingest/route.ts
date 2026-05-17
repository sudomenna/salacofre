/**
 * app/api/ingest/route.ts
 *
 * POST /api/ingest — TSE EA20 ingestion handler.
 *
 * Invoked by Vercel Cron every 60 s during the apuration window (ADR-0011).
 * Each invocation executes ONE complete cycle: discover targets, fetch EA20
 * files (conditional with If-None-Match), deduplicate, persist append-only,
 * log run metrics.
 *
 * Covers: RF-001, RF-002, RF-003, RF-004, RNF-006, RNF-016, RNF-032.
 * Constituição § 1 (transparência — User-Agent identificável via client.ts).
 * Constituição § 10 (append-only — repository.ts, zero UPDATE/DELETE here).
 * ADR-0011 (cadência 60 s; maxDuration 60 s exported below).
 * ADR-0001 (Postgres somente no write path — read path usa Edge Config).
 */

import type { NextRequest } from "next/server";
import { after, NextResponse } from "next/server";
import { notifySlack } from "@/lib/tse/alerts";
import { fetchEA20 } from "@/lib/tse/client";
import { parseEA20Numeric } from "@/lib/tse/ea20-schema";
import { serialiseCause } from "@/lib/tse/errors";
import { logDebug, logError, logInfo, logWarn } from "@/lib/tse/log";
import { calculateLagSeconds } from "@/lib/tse/metrics";
import { getLastEtagAndHash, insertSnapshot, logIngestRun } from "@/lib/tse/repository";
import { withRetry } from "@/lib/tse/retry";
import { listIngestTargets } from "@/lib/tse/targets";

// ---------------------------------------------------------------------------
// Vercel runtime config
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

/**
 * maxDuration = 60 s — budget matches the Vercel Cron interval (ADR-0011).
 * Vercel Pro default is 60 s; Fluid Compute allows up to 800 s but we
 * deliberately match the interval so back-to-back invocations never overlap.
 * Budget breakdown: ~500 ms target-list DB query + N GETs in parallel
 * (CONCURRENCY=20) + ~200 ms logIngestRun. For preview (~500 targets / 20
 * slots = 25 waves × avg 800 ms/wave = ~20 s), there is comfortable margin.
 */
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Helpers — window check
// ---------------------------------------------------------------------------

/**
 * isWithinIngestWindow — returns true when `now` falls within the apuration
 * window: 17h00–04h00 BRT on the day of counting.
 *
 * BRT = UTC-3. Brasil abolished daylight saving time in 2019, so BRT is
 * permanent year-round — no DST offset to handle.
 *
 * Conversions:
 *   17:00 BRT = 20:00 UTC  (window start)
 *   04:00 BRT = 07:00 UTC  (window end, next calendar day)
 *
 * Because the window crosses midnight UTC, we accept the hour if:
 *   utcHour >= 20  (20, 21, 22, 23)
 *   OR utcHour < 7 (0, 1, 2, 3, 4, 5, 6)
 *
 * Note: utcHour === 7 corresponds to exactly 04:00 BRT — outside the window
 * (RF-002 acceptance: "04:00:01, no new execution fires").
 */
function isWithinIngestWindow(now: Date): boolean {
  const utcHour = now.getUTCHours();
  return utcHour >= 20 || utcHour < 7;
}

// ---------------------------------------------------------------------------
// Helpers — turno
// ---------------------------------------------------------------------------

/**
 * parseTurnoEnv — reads TSE_TURNO from the environment.
 *
 * Default: 1 (pre-election / preview / first-round scenario).
 * Valid values: '1' or '2' only. Any other value throws a descriptive Error
 * so the route handler can return 500 with a clear misconfiguration signal
 * rather than silently persisting data in the wrong round.
 */
function parseTurnoEnv(): 1 | 2 {
  const raw = process.env.TSE_TURNO;
  if (raw === undefined || raw === "1") return 1;
  if (raw === "2") return 2;
  throw new Error(
    `TSE_TURNO inválido: "${raw}" — apenas "1" ou "2" são aceitos. Corrija a env var e redeploy.`,
  );
}

// ---------------------------------------------------------------------------
// Semaphore — bounded concurrency without external deps
// ---------------------------------------------------------------------------

/**
 * CONCURRENCY — maximum parallel in-flight EA20 GETs per invocation.
 *
 * Set to 20 as a conservative initial value for preview (~500 targets).
 * With 20 slots and an average round-trip of ~500 ms per file, 500 targets
 * complete in ~25 waves × 500 ms ≈ 12.5 s — well within the 60 s budget.
 *
 * TODO(S03): tune based on production metrics. Production has ~73k targets
 * × 2 cargos = ~146k GETs/cycle. At 20 concurrency and 500 ms avg RTT,
 * that would be ~3650 s — far beyond maxDuration. Production will need
 * either higher concurrency, partitioned cron jobs, or Fluid Compute.
 */
const CONCURRENCY = 20;

// ---------------------------------------------------------------------------
// Model trigger (T16 — Fase 5)
// ---------------------------------------------------------------------------

/**
 * ACTIVE_CARGOS — cargos para os quais disparamos `/api/model/project` ao fim
 * do ciclo de ingestão (RF-019). S03 cobre presidente (1) e governador (3).
 *
 * Cada cargo gera UM fire-and-forget independente do outro. Falha em um não
 * bloqueia o outro nem o response do `/api/ingest`.
 */
const ACTIVE_CARGOS = [1, 3] as const;

/**
 * resolveInternalBaseUrl — base URL pra `/api/model/project` no mesmo deploy.
 *
 * Resolução em ordem:
 *   1. `INTERNAL_BASE_URL` explícita (override de teste / staging custom).
 *   2. `VERCEL_URL` injetada pelo runtime Vercel em preview/prod (sem scheme).
 *   3. `http://localhost:${PORT ?? 3000}` em dev local.
 *
 * Por que NÃO usar `req.headers.get('host')`? Em Vercel o host externo pode
 * ser um domínio customizado que não roteia interno-pra-interno; `VERCEL_URL`
 * é sempre o `*.vercel.app` que aceita auto-chamadas.
 */
function resolveInternalBaseUrl(): string {
  const explicit = process.env.INTERNAL_BASE_URL;
  if (explicit && explicit.length > 0) return explicit.replace(/\/$/, "");

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl && vercelUrl.length > 0) return `https://${vercelUrl}`;

  const port = process.env.PORT ?? "3000";
  return `http://localhost:${port}`;
}

/**
 * triggerModel — fire-and-forget POST para `/api/model/project` por cargo.
 *
 * Best-effort: erros são logados como warn e nunca propagam. O modelo
 * recomputa a cada ciclo (RF-019), então uma falha aqui se auto-corrige em
 * <60s. A persistência canônica (`projections`) é responsabilidade do próprio
 * endpoint Python — não bloqueamos o cron à espera.
 *
 * Usa `after()` do Next 16 (ex-`waitUntil`) quando disponível para garantir
 * que a serverless function não seja "freed" antes do fetch sair (Vercel
 * cancela connections de funções já encerradas). Em runtime non-Vercel
 * (testes/dev local) `after()` ainda funciona mas degrada para um Promise
 * sem hold — o `void fetch` então é suficiente.
 */
function triggerModel(opts: {
  baseUrl: string;
  cargo: number;
  turno: 1 | 2;
  triggerTs: string;
  modelSecret: string;
}): void {
  const { baseUrl, cargo, turno, triggerTs, modelSecret } = opts;
  const url = `${baseUrl}/api/model/project`;

  // Encapsulada como Promise pra entregar pra `after()` E para que erros
  // sejam capturados num catch único (sem unhandled rejection).
  const run = async () => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "x-model-secret": modelSecret,
          "content-type": "application/json",
        },
        body: JSON.stringify({ cargo, turno, trigger_ts: triggerTs }),
      });
      // Não bloqueia o ciclo — apenas registra resultado pra observabilidade.
      // Status 5xx do modelo = recompute do próximo ciclo se ressincroniza.
      if (!res.ok) {
        logWarn("model-trigger non-2xx", {
          cargo,
          turno,
          status: res.status,
          url,
        });
      }
    } catch (err) {
      logWarn("model-trigger-failed", {
        cargo,
        turno,
        url,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // `after()` é exportado por `next/server` em Next 16. Em ambientes que não
  // garantem o ciclo (test env sem Next runtime), `after()` pode `throw` —
  // o try/catch garante fallback para `void run()` puro.
  //
  // CRÍTICO: passamos um *thunk* (`() => Promise`) para `after()`, NÃO o
  // Promise já em execução. Isso (a) deixa `after()` decidir quando rodar
  // e (b) evita rodar duas vezes se o `after()` throw após o Promise já
  // ter começado.
  try {
    after(run);
  } catch {
    void run();
  }
}

function buildSemaphore(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  return async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
    // Wait for a free slot
    if (active >= limit) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      const next = queue.shift();
      if (next !== undefined) {
        next();
      }
    }
  };
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  const t0 = Date.now();

  // --------------------------------------------------------------------------
  // 1. Auth — RNF-016 (cron-only endpoint)
  // --------------------------------------------------------------------------

  const provided = req.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    logError("CRON_SECRET não configurada — abortando invocação", {});
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  if (provided !== expected) {
    // No extra log here — avoid leaking whether the secret is set or not.
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // --------------------------------------------------------------------------
  // 2. Feature flags + window check — RF-002
  // --------------------------------------------------------------------------

  const enabled = process.env.CRON_ENABLED !== "false";
  if (!enabled) {
    logInfo("ingest skipped — CRON_ENABLED=false", {});
    return NextResponse.json({ skipped: "cron_disabled" });
  }

  const override = process.env.INGEST_WINDOW_OVERRIDE === "true";
  if (!override && !isWithinIngestWindow(new Date())) {
    logDebug("ingest skipped — fora da janela 17h-04h BRT", {
      utcHour: new Date().getUTCHours(),
    });
    return NextResponse.json({ skipped: "out_of_window" });
  }

  // --------------------------------------------------------------------------
  // 3. Parse turno — inline validation (fail-fast)
  // --------------------------------------------------------------------------

  let turno: 1 | 2;
  try {
    turno = parseTurnoEnv();
  } catch (err) {
    logError("TSE_TURNO inválido — abortando", {
      error: serialiseCause(err),
    });
    return NextResponse.json({ error: "misconfigured", detail: String(err) }, { status: 500 });
  }

  // --------------------------------------------------------------------------
  // 4. Resolve targets
  // --------------------------------------------------------------------------

  const env = process.env.VERCEL_ENV === "production" ? "production" : "preview";

  let targets: Awaited<ReturnType<typeof listIngestTargets>>;
  try {
    targets = await listIngestTargets(env);
  } catch (err) {
    logError("listIngestTargets falhou — abortando ciclo", {
      error: serialiseCause(err),
      env,
    });
    return NextResponse.json({ error: "targets_unavailable" }, { status: 500 });
  }

  logInfo("ingest ciclo iniciado", {
    targets: targets.length,
    turno,
    env,
    override,
  });

  // --------------------------------------------------------------------------
  // 5. Per-target loop with bounded concurrency
  // --------------------------------------------------------------------------

  let changed = 0;
  let unchanged = 0;
  let notFoundCount = 0;
  let errorsCount = 0;
  let maxLagSeconds: number | null = null;

  const withSlot = buildSemaphore(CONCURRENCY);

  const promises = targets.map((target) =>
    withSlot(async () => {
      // -----------------------------------------------------------------------
      // 5a. Fetch last ETag + hash for this target
      // -----------------------------------------------------------------------
      let lastEtag: string | null;
      let lastHash: string | null;

      try {
        const last = await getLastEtagAndHash({ target, turno });
        lastEtag = last.etag;
        lastHash = last.hash;
      } catch (err) {
        logError("getLastEtagAndHash falhou — target pulado", {
          url: target.url,
          uf: target.uf,
          cargo: target.cargo,
          codZona: target.codZona,
          error: serialiseCause(err),
        });
        errorsCount++;
        return;
      }

      // -----------------------------------------------------------------------
      // 5b. Fetch EA20 (with ETag, with retry)
      // -----------------------------------------------------------------------
      let result: Awaited<ReturnType<typeof fetchEA20>>;
      try {
        result = await withRetry(() => fetchEA20({ url: target.url, etag: lastEtag }));
      } catch (err) {
        logError("fetchEA20 falhou após retries — target pulado", {
          url: target.url,
          uf: target.uf,
          cargo: target.cargo,
          codZona: target.codZona,
          error: serialiseCause(err),
        });
        errorsCount++;
        return;
      }

      // -----------------------------------------------------------------------
      // 5c. Route on result kind
      // -----------------------------------------------------------------------

      if (result.kind === "not_modified") {
        unchanged++;
        return;
      }

      if (result.kind === "not_found") {
        notFoundCount++;
        logDebug("zona sem dados (404) — pulando", { url: target.url });
        return;
      }

      // result.kind === 'fresh'

      // Secondary dedup: if the fetched hash matches what we already stored,
      // the TSE CDN returned different bytes but semantically identical content
      // (e.g. whitespace normalisation). Skip to avoid a duplicate snapshot.
      if (result.hash === lastHash) {
        unchanged++;
        return;
      }

      // -----------------------------------------------------------------------
      // 5d. Extract pctApurado + votosTotal from abr[0]
      // -----------------------------------------------------------------------

      const abr = result.data.abr[0];

      if (abr === undefined) {
        // abr is empty — zone exists in TSE but has no aggregated data yet.
        // Not an error (it's a valid "pending" state); we skip without
        // incrementing the error counter.
        logWarn("EA20 abr vazio — zona sem dados apurados ainda", {
          url: target.url,
          uf: target.uf,
          cargo: target.cargo,
          codZona: target.codZona,
        });
        return;
      }

      // pctApurado: use `psa` (% seções apuradas — the field that signals
      // how much of the zone has been counted, independent of vote type).
      //
      // votosTotal: use `tc` (comparecimento = total voters who showed up).
      // This captures all votes cast including blancos and nulos, making it
      // a better "total votes processed" signal for the ingest metrics than
      // `tvn` (nominais only) or `tvv` (válidos, excludes brancos+nulos).
      // If downstream model needs narrower counts, it reads them from `payload`.
      let pctApurado: number;
      let votosTotal: number;

      try {
        pctApurado = parseEA20Numeric(abr.psa);
      } catch {
        // Non-fatal: persist the snapshot with pctApurado=0 and log for
        // investigation. TSE has occasionally emitted malformed percent
        // strings (e.g. empty "psa" early in counting).
        logWarn("parseEA20Numeric falhou em abr.psa — usando 0", {
          url: target.url,
          raw: abr.psa,
        });
        pctApurado = 0;
      }

      try {
        votosTotal = parseEA20Numeric(abr.tc);
      } catch {
        logWarn("parseEA20Numeric falhou em abr.tc — usando 0", {
          url: target.url,
          raw: abr.tc,
        });
        votosTotal = 0;
      }

      // -----------------------------------------------------------------------
      // 5e. Calculate TSE lag (RNF-033) — best-effort, never aborts ingest
      // -----------------------------------------------------------------------

      try {
        const lagSeconds = calculateLagSeconds(result.data.dg, result.data.hg);
        if (maxLagSeconds === null || lagSeconds > maxLagSeconds) {
          maxLagSeconds = lagSeconds;
        }
      } catch (err) {
        // Malformed dg/hg is unusual but non-fatal. Log and continue.
        logWarn("calculateLagSeconds falhou — lag não medido para este snapshot", {
          url: target.url,
          dg: result.data.dg,
          hg: result.data.hg,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // -----------------------------------------------------------------------
      // 5f. Persist snapshot (append-only — constituição § 10)
      // -----------------------------------------------------------------------

      try {
        await insertSnapshot({
          target,
          turno,
          etag: result.etag,
          hash: result.hash,
          payload: result.data,
          pctApurado,
          votosTotal,
        });
        changed++;
      } catch (err) {
        logError("insertSnapshot falhou — target pulado", {
          url: target.url,
          uf: target.uf,
          cargo: target.cargo,
          codZona: target.codZona,
          error: serialiseCause(err),
        });
        errorsCount++;
      }
    }),
  );

  await Promise.all(promises);

  // --------------------------------------------------------------------------
  // 6. Log ingest run + return summary
  // --------------------------------------------------------------------------

  const durationMs = Date.now() - t0;

  // --------------------------------------------------------------------------
  // 6a. Trigger modelo (RF-019) — fire-and-forget, 1× por cargo ativo.
  //
  // Só dispara quando o ciclo produziu mudança (`changed > 0`); ciclos
  // 100% dedup (ETag/hash) não recomputam o modelo. Cada cargo é
  // independente; falhas são logadas e não bloqueiam o response.
  // --------------------------------------------------------------------------

  let modelTriggered: number[] = [];
  if (changed > 0) {
    const modelSecret = process.env.MODEL_SECRET;
    if (!modelSecret) {
      logWarn("model-trigger skipped — MODEL_SECRET não configurada", {
        changed,
        env,
      });
    } else {
      const baseUrl = resolveInternalBaseUrl();
      const triggerTs = new Date().toISOString();
      for (const cargo of ACTIVE_CARGOS) {
        triggerModel({ baseUrl, cargo, turno, triggerTs, modelSecret });
      }
      modelTriggered = [...ACTIVE_CARGOS];
      logInfo("model-trigger dispatched", {
        cargos: modelTriggered,
        turno,
        baseUrl,
      });
    }
  }

  try {
    await logIngestRun({
      durationMs,
      filesFetched: targets.length,
      filesChanged: changed,
      errors: errorsCount,
      notes: JSON.stringify({
        turno,
        env,
        unchanged,
        not_found: notFoundCount,
        ...(modelTriggered.length > 0 ? { model_triggered: modelTriggered } : {}),
      }),
    });
  } catch (err) {
    // logIngestRun failing must not suppress the primary metrics response.
    // The error is already logged inside logIngestRun itself.
    logError("logIngestRun falhou — métricas do ciclo não persistidas", {
      error: serialiseCause(err),
    });
  }

  logInfo("ingest ciclo concluído", {
    durationMs,
    filesFetched: targets.length,
    filesChanged: changed,
    unchanged,
    notFound: notFoundCount,
    errors: errorsCount,
    maxLagSeconds,
    turno,
    env,
  });

  // ----------------------------------------------------------------------------
  // 7. Slack alerts (RNF-034) — fire-and-forget, nunca bloqueia o response.
  // ----------------------------------------------------------------------------

  // TS narrowing perde o reassign dentro do async closure de `Promise.all`,
  // então fazemos o cast explícito aqui.
  const lagFinal = maxLagSeconds as number | null;
  if (lagFinal !== null && lagFinal > 60) {
    void notifySlack({
      severity: "warn",
      msg: `tse.lag_seconds > 60 (atual: ${lagFinal.toFixed(1)}s)`,
      ctx: { maxLagSeconds: lagFinal, filesChanged: changed, errors: errorsCount, env, turno },
    });
  }
  if (errorsCount >= 3) {
    void notifySlack({
      severity: "error",
      msg: `${errorsCount} erros consecutivos no ciclo`,
      ctx: { errors: errorsCount, filesFetched: targets.length, env, turno },
    });
  }

  return NextResponse.json({
    ok: true,
    durationMs,
    filesFetched: targets.length,
    filesChanged: changed,
    unchanged,
    notFound: notFoundCount,
    errors: errorsCount,
  });
}
