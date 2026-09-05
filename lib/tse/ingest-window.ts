/**
 * lib/tse/ingest-window.ts
 *
 * Janela de ingestão configurável (RF-002).
 *
 * Por que isto existe (2026-09-05): a janela original — 17h-04h BRT, fixa em
 * `app/api/ingest/route.ts` — assumia apuração real. Os simulados oficiais
 * TSE de set/2026 rodam **9h-17h BRT**, uma janela diurna que o código
 * antigo não conseguia representar (só sabia lidar com o cruzamento de
 * meia-noite). Este módulo generaliza a janela via `INGEST_WINDOW` (env,
 * formato "HH-HH") e cobre os dois formatos: diurno (início < fim, ex.:
 * "9-17") e noturno cruzando meia-noite (início > fim, ex.: "17-04").
 *
 * BRT = UTC-3, sem DST (Brasil aboliu horário de verão em 2019) — conversão
 * é uma subtração fixa em todos os casos, ano todo.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IngestWindow {
  /** Hora de início, em BRT, 0-23 (inclusive). */
  startHourBrt: number;
  /** Hora de fim, em BRT, 0-23 (exclusivo — RF-002: "04:00:01, no new
   *  execution fires" vira "hora 4 já está fora"). */
  endHourBrt: number;
}

// ---------------------------------------------------------------------------
// parseIngestWindow
// ---------------------------------------------------------------------------

const WINDOW_RE = /^(\d{1,2})-(\d{1,2})$/;

/**
 * parseIngestWindow — parseia `INGEST_WINDOW` (formato "HH-HH", 0-23 cada
 * lado) em `{ startHourBrt, endHourBrt }`.
 *
 * @param raw - Default: `process.env.INGEST_WINDOW ?? "17-04"` (janela de
 *              apuração real, preservando o comportamento anterior quando a
 *              env var não está setada).
 * @throws Error em formato inválido (não é "HH-HH", ou alguma hora fora de
 *         0-23) — falha rápida na inicialização do route handler em vez de
 *         aceitar silenciosamente uma janela nunca-verdadeira ou
 *         sempre-verdadeira.
 */
export function parseIngestWindow(
  raw: string = process.env.INGEST_WINDOW ?? "17-04",
): IngestWindow {
  const trimmed = raw.trim();
  const match = WINDOW_RE.exec(trimmed);

  if (!match) {
    throw new Error(
      `[ingest-window] INGEST_WINDOW inválida: "${raw}" — formato esperado "HH-HH" (ex.: "17-04", "9-17").`,
    );
  }

  const startHourBrt = Number(match[1]);
  const endHourBrt = Number(match[2]);

  if (startHourBrt < 0 || startHourBrt > 23 || endHourBrt < 0 || endHourBrt > 23) {
    throw new Error(
      `[ingest-window] INGEST_WINDOW inválida: "${raw}" — horas devem estar entre 0 e 23.`,
    );
  }

  return { startHourBrt, endHourBrt };
}

// ---------------------------------------------------------------------------
// isWithinIngestWindow
// ---------------------------------------------------------------------------

/** Converte a hora UTC de `now` para a hora BRT correspondente (0-23). */
function toBrtHour(now: Date): number {
  return (now.getUTCHours() + 24 - 3) % 24;
}

/**
 * isWithinIngestWindow — `true` quando `now` cai dentro de `window`.
 *
 * Dois regimes:
 *   - Diurno (`startHourBrt < endHourBrt`, ex.: "9-17"): dentro quando
 *     `start <= horaBRT < end`.
 *   - Cruzando meia-noite (`startHourBrt > endHourBrt`, ex.: "17-04"):
 *     dentro quando `horaBRT >= start OU horaBRT < end`.
 *
 * `startHourBrt === endHourBrt` não é um caso suportado explicitamente (seria
 * ambíguo — "janela de 0h" ou "24h por dia"); tratamos como diurno vazio
 * (sempre fora), forçando o operador a escolher uma janela não-degenerada.
 */
export function isWithinIngestWindow(now: Date, window: IngestWindow): boolean {
  const h = toBrtHour(now);
  const { startHourBrt, endHourBrt } = window;

  if (startHourBrt < endHourBrt) {
    return h >= startHourBrt && h < endHourBrt;
  }

  if (startHourBrt > endHourBrt) {
    return h >= startHourBrt || h < endHourBrt;
  }

  return false;
}
