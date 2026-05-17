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
