/**
 * lib/tse/ingest-handler.ts
 *
 * runIngestCycle — corpo do handler de ingestão EA20, extraído de
 * `app/api/ingest/route.ts` (2026-09-11, ADR-0035 D3 — cron por cargo).
 *
 * Por que foi extraído para cá: até esta mudança, `app/api/ingest/route.ts`
 * exportava SÓ `POST` e o handler não sabia filtrar por cargo. Duas rotas
 * precisam do mesmo corpo agora — `/api/ingest` (todos os cargos ativos,
 * preview/uso manual) e `/api/ingest/[cargo]` (um cargo por invocação, usado
 * pelo cron real) — então o corpo vira uma função importável por ambas em vez
 * de viver dentro de um único `route.ts`.
 *
 * Achado (A) do plano `perfeito-monte-um-plano-eventual-candle.md` (2026-09-11):
 * a doc oficial da Vercel (vercel.com/docs/cron-jobs, seção "Securing cron
 * jobs") confirma que o Vercel Cron dispara **HTTP GET** e manda o segredo em
 * **`Authorization: Bearer <CRON_SECRET>`**. O handler anterior só aceitava
 * `POST` + `x-cron-secret` — logo as 3 entradas de `vercel.ts` nunca invocaram
 * a ingestão de verdade (a doc também confirma que um caminho/verbo inválido
 * "ainda executa" o cron job, então isso falhava em silêncio com 405). Todo
 * ciclo real até 2026-09-11 foi disparado manualmente via
 * `curl -X POST -H "x-cron-secret"` (docs/operations/runbook.md,
 * docs/testing/tse-simulados.md). `extractProvidedSecret` abaixo aceita os
 * dois caminhos, em GET e em POST, por simetria.
 *
 * Achado (B): query string em `path` de cron NÃO é documentada pela Vercel;
 * dois crons no MESMO horário só podem ser distinguidos por **segmento de
 * rota** (exemplo literal da doc: `/api/sync-slack-team/T0CAQ10TZ` vs
 * `/T4BOE34OP`). Por isso o caminho principal passou a ser
 * `app/api/ingest/[cargo]/route.ts`, não uma query string `?cargo=`.
 *
 * Cobre: RF-001, RF-002, RF-003, RF-004, RNF-006, RNF-016, RNF-032.
 * Constituição § 1 (transparência — User-Agent identificável via client.ts).
 * Constituição § 10 (append-only — repository.ts, zero UPDATE/DELETE aqui).
 * ADR-0011 (cadência 60 s do cron). ADR-0001 (Postgres só no write path).
 * ADR-0035 D3 (cron por cargo, lock anti-overlap por cargo).
 */

import type { NextRequest } from "next/server";
import { after, NextResponse } from "next/server";
import type { AcompanhamentoPrevious } from "@/lib/tse/acompanhamento";
import { detectChangedUfs } from "@/lib/tse/acompanhamento";
import { notifySlack } from "@/lib/tse/alerts";
import { fetchEA20, getClientStats, resetClientStats } from "@/lib/tse/client";
import { parseEA20Numeric } from "@/lib/tse/ea20-schema";
import { serialiseCause } from "@/lib/tse/errors";
import { isWithinIngestWindow, parseIngestWindow } from "@/lib/tse/ingest-window";
import { logDebug, logError, logInfo, logWarn } from "@/lib/tse/log";
import { calculateLagSeconds } from "@/lib/tse/metrics";
import { getTseRateLimiter } from "@/lib/tse/rate-limiter";
import {
  getLastEtagAndHash,
  getLastIngestRun,
  insertSnapshot,
  logIngestRun,
} from "@/lib/tse/repository";
import { withRetry } from "@/lib/tse/retry";
import { getActiveCargos, listIngestTargets } from "@/lib/tse/targets";

// ---------------------------------------------------------------------------
// Estado de gating EA14 (acompanhamento) — módulo-level, reaproveitado entre
// invocações pelo Fluid Compute (mesmo padrão do rate limiter singleton em
// lib/tse/rate-limiter.ts). Guarda o ETag do último EA14 200 + o hash por UF
// do ciclo anterior, para que `detectChangedUfs` possa enviar `If-None-Match`
// e comparar hashes sem precisar de uma tabela nova no Postgres.
// ---------------------------------------------------------------------------

let acompanhamentoState: AcompanhamentoPrevious | null = null;

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
// Auth — Bearer (Vercel Cron) ou x-cron-secret (manual/runbook)
// ---------------------------------------------------------------------------

/**
 * extractProvidedSecret — RNF-016 (endpoint restrito ao cron).
 *
 * Aceita, nesta ordem:
 *   1. `Authorization: Bearer <secret>` — caminho oficial do Vercel Cron
 *      (vercel.com/docs/cron-jobs, "Securing cron jobs"; ver achado (A) no
 *      cabeçalho deste arquivo).
 *   2. `x-cron-secret: <secret>` — caminho manual do runbook
 *      (docs/operations/runbook.md) e do protocolo de simulado
 *      (docs/testing/tse-simulados.md). Mantido para não quebrar nenhum dos
 *      dois em produção.
 *
 * Não distingue, no retorno de erro, qual dos dois caminhos foi tentado —
 * evita vazar qual mecanismo de auth está configurado.
 */
function extractProvidedSecret(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const match = /^bearer\s+(.+)$/i.exec(authHeader.trim());
    if (match?.[1]) return match[1];
  }
  return req.headers.get("x-cron-secret");
}

// ---------------------------------------------------------------------------
// Semaphore — bounded concurrency without external deps
// ---------------------------------------------------------------------------

/**
 * CONCURRENCY — maximum parallel in-flight EA20 GETs per invocation.
 *
 * Lido de `INGEST_CONCURRENCY` (default 20) para permitir calibrar durante
 * os simulados sem redeploy. Note que concorrência e taxa são controles
 * ORTOGONAIS: este semáforo limita quantas requisições ficam simultaneamente
 * em voo; `getTseRateLimiter()` (lib/tse/rate-limiter.ts) limita quantas
 * SAEM por segundo (RF-010.3 — limite de 100 req/s/IP do TSE, agora dividido
 * em até 50 rps por invocação de cargo). Um CONCURRENCY alto com
 * TSE_MAX_RPS baixo apenas faz mais requisições esperarem na fila do rate
 * limiter — não estoura o limite do TSE.
 *
 * Valor inválido (não-numérico, <= 0) cai no default 20 com um warn.
 */
function getIngestConcurrency(): number {
  const DEFAULT_CONCURRENCY = 20;
  const raw = process.env.INGEST_CONCURRENCY;
  if (raw === undefined || raw.trim() === "") return DEFAULT_CONCURRENCY;

  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(
      `[ingest] INGEST_CONCURRENCY inválida: "${raw}" — usando default ${DEFAULT_CONCURRENCY}.`,
    );
    return DEFAULT_CONCURRENCY;
  }
  return Math.floor(parsed);
}

const CONCURRENCY = getIngestConcurrency();

// ---------------------------------------------------------------------------
// Model trigger (T16 — Fase 5)
// ---------------------------------------------------------------------------

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
// runIngestCycle
// ---------------------------------------------------------------------------

export interface RunIngestCycleOptions {
  /**
   * Cargo do ciclo — `undefined` significa "todos os cargos ativos"
   * (`getActiveCargos()`/`TSE_CARGOS`), usado por `/api/ingest` (preview e
   * uso manual). `1` ou `3` restringe alvos, lock anti-overlap e
   * model-trigger a um único cargo — usado por `/api/ingest/[cargo]`
   * (caminho do cron real, ADR-0035 D3).
   */
  cargo?: 1 | 3;
}

export async function runIngestCycle(
  req: NextRequest,
  opts: RunIngestCycleOptions = {},
): Promise<NextResponse> {
  const t0 = Date.now();
  const cargoDoCiclo = opts.cargo;

  // --------------------------------------------------------------------------
  // 1. Auth — RNF-016 (cron-only endpoint)
  // --------------------------------------------------------------------------

  const provided = extractProvidedSecret(req);
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    logError("CRON_SECRET não configurada — abortando invocação", {});
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  if (provided !== expected) {
    // No extra log here — avoid leaking whether the secret is set or not,
    // nem qual dos dois caminhos de auth (Bearer/x-cron-secret) foi tentado.
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

  // RF-002 hardening: janela configurável via INGEST_WINDOW ("17-04"
  // apuração real; "9-17" simulados TSE, 9h-17h BRT).
  let ingestWindow: ReturnType<typeof parseIngestWindow>;
  try {
    ingestWindow = parseIngestWindow();
  } catch (err) {
    logError("INGEST_WINDOW inválida — abortando", { error: serialiseCause(err) });
    return NextResponse.json({ error: "misconfigured", detail: String(err) }, { status: 500 });
  }

  const override = process.env.INGEST_WINDOW_OVERRIDE === "true";
  if (!override && !isWithinIngestWindow(new Date(), ingestWindow)) {
    logDebug("ingest skipped — fora da janela de ingestão configurada", {
      utcHour: new Date().getUTCHours(),
      ingestWindow,
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

  const env = process.env.VERCEL_ENV === "production" ? "production" : "preview";

  // --------------------------------------------------------------------------
  // 3b. Lock anti-overlap simples (RF-002 hardening), agora **por cargo**
  //     (ADR-0035 D3).
  //
  // `maxDuration` é 300s (2026-09-11 — fan-out por par pode chegar a ~6.100
  // GETs por cargo por ciclo) porque o rate limiter/429 podem alongar um
  // ciclo além do intervalo do cron. Em vez de um lock de banco "de verdade"
  // (SELECT ... FOR UPDATE, advisory lock), usamos a última linha de
  // `ingest_log` **cujo `notes.cargo` bate com o cargo deste ciclo** (ou sem
  // `cargo`, quando o ciclo é de todos os cargos): se ela marca
  // `running: true` e é recente (<6min), um ciclo anterior do MESMO cargo
  // ainda está em voo (ou travou) — pula este ciclo em vez de rodar em
  // paralelo. Dois cargos diferentes têm locks independentes — um ciclo do
  // cargo 1 nunca bloqueia um ciclo do cargo 3 (duas invocações simultâneas
  // são o desenho esperado, ver ADR-0035 D3 e o comentário de RF-010.3 em
  // lib/tse/rate-limiter.ts). Falha ao ler o lock é fail-open: um lock
  // ilegível não deve travar o pipeline inteiro.
  // --------------------------------------------------------------------------

  const OVERLAP_LOCK_WINDOW_MS = 6 * 60 * 1000;

  try {
    const lastRun = await getLastIngestRun(cargoDoCiclo);
    if (lastRun?.notes?.running === true) {
      const ageMs = Date.now() - lastRun.ts.getTime();
      if (ageMs < OVERLAP_LOCK_WINDOW_MS) {
        logInfo("ingest skipped — ciclo anterior ainda em voo (overlap lock)", {
          ageMs,
          env,
          turno,
          cargo: cargoDoCiclo ?? "all",
        });
        return NextResponse.json({ skipped: "overlap" });
      }
    }
  } catch (err) {
    logWarn("getLastIngestRun falhou — seguindo sem lock anti-overlap (fail-open)", {
      error: serialiseCause(err),
    });
  }

  // Marca o início do ciclo (append-only — a linha final com `running:false`
  // + métricas vem no passo 6). Falha ao gravar o marcador não aborta o
  // ciclo — só reduz a eficácia do lock no próximo invocation.
  try {
    await logIngestRun({
      durationMs: 0,
      filesFetched: 0,
      filesChanged: 0,
      errors: 0,
      notes: JSON.stringify({
        running: true,
        turno,
        env,
        ...(cargoDoCiclo !== undefined ? { cargo: cargoDoCiclo } : {}),
      }),
    });
  } catch (err) {
    logWarn("logIngestRun (marcador de início) falhou — seguindo sem lock gravado", {
      error: serialiseCause(err),
    });
  }

  // Zera os contadores de client stats (429/404/304) e captura o
  // `waitedMs` acumulado do rate limiter ANTES do ciclo — o rate limiter é
  // um singleton do processo (Fluid Compute reutiliza instâncias), então
  // reportamos o DELTA deste ciclo, não o total acumulado desde o boot.
  resetClientStats();
  const waitedMsBefore = getTseRateLimiter().stats.waitedMs;

  // --------------------------------------------------------------------------
  // 4. Resolve targets — filtrados por cargo quando `opts.cargo` está setado.
  // --------------------------------------------------------------------------

  let targets: Awaited<ReturnType<typeof listIngestTargets>>;
  try {
    targets = await listIngestTargets(env, { cargo: cargoDoCiclo });
  } catch (err) {
    logError("listIngestTargets falhou — abortando ciclo", {
      error: serialiseCause(err),
      env,
      cargo: cargoDoCiclo ?? "all",
    });
    return NextResponse.json({ error: "targets_unavailable" }, { status: 500 });
  }

  logInfo("ingest ciclo iniciado", {
    targets: targets.length,
    turno,
    env,
    override,
    cargo: cargoDoCiclo ?? "all",
  });

  // --------------------------------------------------------------------------
  // 4b. EA14 gating (acompanhamento) — opt-in via TSE_ACOMPANHAMENTO=on
  // --------------------------------------------------------------------------
  //
  // Quando ligado, filtra `targets` para só as UFs que o EA14 (1 GET)
  // sinalizou como mudadas desde o último ciclo — reduz drasticamente o
  // número de GETs de EA20 em ciclos "parados" (madrugada, entre
  // totalizações). Alvos de nível "br" nunca são filtrados por esta etapa —
  // o próprio EA14 já É o resumo nacional, não há um segundo arquivo pra
  // comparar contra.
  if (process.env.TSE_ACOMPANHAMENTO === "on") {
    const ufsNoCiclo = [...new Set(targets.filter((t) => t.nivel !== "br").map((t) => t.uf))];

    if (ufsNoCiclo.length > 0) {
      try {
        const signals = await detectChangedUfs({
          ufs: ufsNoCiclo,
          previous: acompanhamentoState,
        });

        const changedUfs = new Set(signals.filter((s) => s.changed).map((s) => s.uf));
        const etagDoCiclo =
          signals.find((s) => s.etag !== null)?.etag ?? acompanhamentoState?.etag ?? null;
        const hashes: Record<string, string> = { ...acompanhamentoState?.hashes };
        for (const s of signals) {
          if (s.hash !== null) hashes[s.uf] = s.hash;
        }
        acompanhamentoState = { etag: etagDoCiclo, hashes };

        const targetsAntes = targets.length;
        targets = targets.filter((t) => t.nivel === "br" || changedUfs.has(t.uf));

        logInfo("EA14 gating aplicado", {
          ufsAnalisadas: ufsNoCiclo.length,
          ufsMudadas: changedUfs.size,
          targetsAntes,
          targetsDepois: targets.length,
        });
      } catch (err) {
        // detectChangedUfs já é fail-open internamente (nunca deveria
        // rejeitar), mas mantemos um fail-open de segunda camada aqui: se
        // por algum motivo a chamada lançar, seguimos com `targets`
        // inalterado (equivalente a "tudo mudou").
        logWarn("EA14 gating falhou — seguindo sem filtro (fail-open)", {
          error: serialiseCause(err),
        });
      }
    }
  }

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
          codMunicipioTse: target.codMunicipioTse,
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
          codMunicipioTse: target.codMunicipioTse,
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
      // 5d. Extract pctApurado + votosTotal from the root `s`/`e` elements
      // -----------------------------------------------------------------------
      //
      // O EA20 real NÃO tem um array `abr[]` de abrangências dentro do
      // arquivo — cada arquivo já É uma única abrangência (codificada em
      // `tpabr`/`cdabr` e no nome do arquivo). Os totais vivem em objetos de
      // raiz `s` (seções) e `e` (eleitores), exigidos pelo Zod schema
      // (EA20Schema.s / .e são required).

      // pctApurado: `s.psa` (% seções apuradas — sinaliza quanto da
      // abrangência já foi contado, independente do tipo de voto).
      //
      // votosTotal: `e.c` (comparecimento = total de eleitores que
      // compareceram). Captura todos os votos dados, incluindo brancos e
      // nulos — melhor sinal de "total de votos processados" para as
      // métricas de ingest do que `v.vnom` (só nominais) ou `v.vv` (válidos,
      // exclui brancos+nulos). Se o modelo precisar de contagens mais
      // estreitas, ele lê do `payload` bruto.
      let pctApurado: number;
      let votosTotal: number;

      try {
        pctApurado = parseEA20Numeric(result.data.s.psa);
      } catch {
        // Non-fatal: persist the snapshot with pctApurado=0 and log for
        // investigation. TSE has occasionally emitted malformed percent
        // strings (e.g. empty "psa" early in counting).
        logWarn("parseEA20Numeric falhou em s.psa — usando 0", {
          url: target.url,
          raw: result.data.s.psa,
        });
        pctApurado = 0;
      }

      try {
        votosTotal = parseEA20Numeric(result.data.e.c);
      } catch {
        logWarn("parseEA20Numeric falhou em e.c — usando 0", {
          url: target.url,
          raw: result.data.e.c,
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
          codMunicipioTse: target.codMunicipioTse,
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
  // 6a. Trigger modelo (RF-019) — fire-and-forget.
  //
  // Só dispara quando o ciclo produziu mudança (`changed > 0`); ciclos
  // 100% dedup (ETag/hash) não recomputam o modelo.
  //
  // Quando `opts.cargo` está setado (caminho do cron real,
  // `/api/ingest/[cargo]`), dispara só para ESSE cargo — o ciclo já é
  // restrito a um cargo, então não há razão pra também recomputar o outro
  // (ele tem seu próprio ciclo/cron independente). Quando `opts.cargo` é
  // `undefined` (ciclo de todos — `/api/ingest`), mantém o comportamento
  // anterior: um trigger fire-and-forget por cargo ativo
  // (`getActiveCargos()`).
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

      let activeCargos: Array<1 | 3>;
      if (cargoDoCiclo !== undefined) {
        activeCargos = [cargoDoCiclo];
      } else {
        // getActiveCargos() nunca deveria lançar (pior caso, cai no default
        // [1,3] — ver lib/tse/targets.ts), mas isolamos com try/catch mesmo
        // assim: um throw não capturado aqui pularia o marcador final
        // `running:false` (passo 6 abaixo) e deixaria o lock anti-overlap
        // preso por até 6min, bloqueando o próximo ciclo sem necessidade.
        try {
          activeCargos = getActiveCargos();
        } catch (err) {
          logWarn("getActiveCargos falhou — model-trigger pulado neste ciclo", {
            error: serialiseCause(err),
          });
          activeCargos = [];
        }
      }

      for (const cargo of activeCargos) {
        triggerModel({ baseUrl, cargo, turno, triggerTs, modelSecret });
      }
      modelTriggered = [...activeCargos];
      logInfo("model-trigger dispatched", {
        cargos: modelTriggered,
        turno,
        baseUrl,
      });
    }
  }

  // Snapshot dos contadores de client stats (429/404/304) e do delta de
  // waitedMs do rate limiter — ver comentário no passo 3b sobre por que é
  // um delta e não o total acumulado do processo.
  const clientStatsSnapshot = getClientStats();
  const waitedMs = getTseRateLimiter().stats.waitedMs - waitedMsBefore;

  try {
    await logIngestRun({
      durationMs,
      filesFetched: targets.length,
      filesChanged: changed,
      errors: errorsCount,
      notes: JSON.stringify({
        running: false,
        turno,
        env,
        ...(cargoDoCiclo !== undefined ? { cargo: cargoDoCiclo } : {}),
        unchanged,
        not_found: notFoundCount,
        rateLimited: clientStatsSnapshot.rateLimited,
        waitedMs,
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
    cargo: cargoDoCiclo ?? "all",
    rateLimited: clientStatsSnapshot.rateLimited,
    waitedMs,
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
  if (clientStatsSnapshot.rateLimited > 0) {
    // 429 sustentado é o sinal mais direto de que TSE_MAX_RPS/INGEST_CONCURRENCY
    // estão desalinhados com o limite real de 100 req/s/IP do TSE (ou outro
    // processo compartilha o IP).
    void notifySlack({
      severity: "error",
      msg: `${clientStatsSnapshot.rateLimited} respostas 429 (rate limited) neste ciclo`,
      ctx: { rateLimited: clientStatsSnapshot.rateLimited, waitedMs, env, turno },
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
    rateLimited: clientStatsSnapshot.rateLimited,
    waitedMs,
  });
}
