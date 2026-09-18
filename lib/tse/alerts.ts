/**
 * lib/tse/alerts.ts
 *
 * Slack alerting helper for the TSE ingestion pipeline.
 *
 * Covers: RNF-034 (alertas — Slack como canal primário).
 *
 * Design notes:
 *   - Fire-and-forget: `notifySlack` NEVER throws. Any failure (missing env
 *     var, network error, 4xx/5xx from Slack) is caught and logged as a warn
 *     via lib/tse/log.ts. Callers use `void notifySlack(...)` to make the
 *     intent explicit and to satisfy `@typescript-eslint/no-floating-promises`.
 *   - 3-second timeout via `AbortSignal.timeout(3000)`. The ingest cycle runs
 *     inside a 60s Vercel Function budget; a stalled Slack POST must not block
 *     the cycle or consume its remaining time.
 *   - If `SLACK_WEBHOOK_URL` is absent, the function silently returns after a
 *     debug log. This is intentional for local dev and preview environments
 *     that have not configured the webhook.
 *   - Slack 4xx responses (invalid webhook, revoked token) are treated as a
 *     warn, not an error: the ingest cycle is unaffected and the operator can
 *     investigate via Vercel logs. We do NOT retry — Slack delivery is best-effort.
 *   - Message format: plain `text` field for compatibility with legacy Slack
 *     clients / notification bots that parse only `text`. The `blocks` field
 *     is intentionally omitted to keep the dependency surface minimal.
 */

import { logDebug, logWarn } from "./log";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SlackAlertPayload {
  severity: "warn" | "error" | "critical";
  msg: string;
  /** Optional structured context serialised as a JSON code block in the message. */
  ctx?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Abort any Slack POST that hasn't completed within this many ms. */
const SLACK_TIMEOUT_MS = 3_000;

// ---------------------------------------------------------------------------
// alertasDoCiclo — a REGRA, separada do transporte (RF-057)
// ---------------------------------------------------------------------------

/** Limiar de defasagem que dispara alerta — RF-057. */
export const LAG_ALERTA_SEGUNDOS = 60;

/** Erros consecutivos num ciclo que disparam alerta. */
export const ERROS_ALERTA = 3;

export interface EstadoDoCiclo {
  /** `tse.lag_seconds` do ciclo. `null` quando não houve leitura com hora. */
  lagSegundos: number | null;
  errosConsecutivos: number;
  /** Respostas 429 do CDN do TSE neste ciclo. */
  rateLimited: number;
  /** Contexto solto que vai junto na mensagem (ambiente, turno, contagens). */
  ctx?: Record<string, unknown>;
}

/**
 * alertasDoCiclo — decide QUAIS alarmes um ciclo deve emitir.
 *
 * ## Por que isto é uma função separada
 *
 * Até 2026-09-18 as três condições viviam soltas dentro de `runIngestCycle`,
 * depois de tudo que precisa de banco e de rede. Consequência medida: o RF-057
 * tinha **zero teste** — nem unitário nem de integração — porque chegar
 * àquelas linhas exigia Postgres, lock anti-overlap e CDN. A coluna da matriz
 * dizia "manual (forçar)", e o manual nunca foi feito.
 *
 * A regra é aritmética pura e não tem por que morar lá. Aqui ela é testável
 * sem banco, sem rede e **sem `SLACK_WEBHOOK_URL`** — o transporte
 * (`notifySlack`) continua sendo outra coisa, e falha de canal não pode
 * apagar a decisão de alarmar.
 *
 * ⚠️ **Não faz I/O e não lança.** Devolve o que deveria ser enviado; quem
 * chama envia.
 */
export function alertasDoCiclo(estado: EstadoDoCiclo): SlackAlertPayload[] {
  const ctx = estado.ctx ?? {};
  const out: SlackAlertPayload[] = [];

  // 🔴 `> 60`, não `>= 60`: o RF-057 diz "IF tse.lag_seconds > 60". Exatamente
  // 60 s é a meta cumprida no limite, não uma violação.
  if (estado.lagSegundos !== null && estado.lagSegundos > LAG_ALERTA_SEGUNDOS) {
    out.push({
      severity: "warn",
      msg: `tse.lag_seconds > ${LAG_ALERTA_SEGUNDOS} (atual: ${estado.lagSegundos.toFixed(1)}s)`,
      ctx: { ...ctx, maxLagSeconds: estado.lagSegundos },
    });
  }

  // ⚠️ `lagSegundos === null` NÃO alarma, e é deliberado: significa "nenhuma
  // leitura trouxe hora do boletim", que é ausência de informação, não
  // defasagem grande. Alarmar aqui confundiria "não sei" com "está ruim" — a
  // mesma distinção de três estados que o vigia externo respeita.

  if (estado.errosConsecutivos >= ERROS_ALERTA) {
    out.push({
      severity: "error",
      msg: `${estado.errosConsecutivos} erros consecutivos no ciclo`,
      ctx: { ...ctx, errors: estado.errosConsecutivos },
    });
  }

  if (estado.rateLimited > 0) {
    // 429 sustentado é o sinal mais direto de que TSE_MAX_RPS/INGEST_CONCURRENCY
    // estão desalinhados com o limite real de 100 req/s/IP do TSE (ou outro
    // processo compartilha o IP).
    out.push({
      severity: "error",
      msg: `${estado.rateLimited} respostas 429 (rate limited) neste ciclo`,
      ctx: { ...ctx, rateLimited: estado.rateLimited },
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// notifySlack
// ---------------------------------------------------------------------------

/**
 * notifySlack — fire-and-forget Slack Incoming Webhook notification.
 *
 * Reads `SLACK_WEBHOOK_URL` from the environment. If absent, skips silently.
 * Never throws; all errors are surfaced via logWarn.
 *
 * @example
 * // In route handler — use `void` to mark fire-and-forget intentionally:
 * void notifySlack({ severity: 'warn', msg: 'tse.lag_seconds > 60', ctx: { maxLagSeconds: 90 } });
 */
export async function notifySlack(payload: SlackAlertPayload): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    logDebug("slack webhook not configured, skipping", {
      severity: payload.severity,
      msg: payload.msg,
    });
    return;
  }

  const severityLabel = payload.severity.toUpperCase();

  // Build the plain-text message. If ctx is provided, append it as a JSON
  // code block for quick forensic context in the Slack message.
  let text = `[${severityLabel}] ${payload.msg}`;

  if (payload.ctx !== undefined) {
    try {
      const ctxJson = JSON.stringify(payload.ctx, null, 2);
      text += `\n\`\`\`${ctxJson}\`\`\``;
    } catch {
      // ctx serialisation failure is non-fatal — send without context block.
      text += "\n[ctx: serialização falhou]";
    }
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
      // Bypass any caching — each alert is a unique, time-sensitive event.
      cache: "no-store",
    });

    if (!res.ok) {
      logWarn("slack alert failed: resposta não-ok", {
        status: res.status,
        severity: payload.severity,
        msg: payload.msg,
      });
    }
  } catch (err) {
    // Covers: network failures, DNS errors, AbortError (timeout), etc.
    logWarn("slack alert failed", {
      error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
      severity: payload.severity,
      msg: payload.msg,
    });
  }
}
