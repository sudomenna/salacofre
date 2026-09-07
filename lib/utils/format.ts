/**
 * lib/utils/format.ts
 *
 * Helpers determinísticos de formatação para a UI (specs 003 e 004).
 *
 * Princípios
 *   - Locale fixo `pt-BR` em todos os Intl.Format — output estável entre
 *     SSR (servidor em UTC) e cliente (qualquer fuso). Sem isso, o React
 *     dispara hydration mismatch (mensagem "Text content did not match").
 *   - `tabular-nums` está globalmente em `globals.css` (`* { ... }`),
 *     mas os números aqui devem ser legíveis também sem CSS — daí
 *     `style: 'decimal'`/`grouping` separator pt-BR (ponto).
 *   - Determinismo (constituição § 6): mesma entrada → mesma saída. Sem
 *     `Date.now()`, sem aleatoriedade.
 *
 * Cobertura: RF-022 (votos absolutos), RF-023 (% + CI), RF-026 (timestamp).
 */

/** TZ canônico do projeto. America/Sao_Paulo == UTC-3 sem horário de verão. */
export const TZ = "America/Sao_Paulo";
const LOCALE = "pt-BR";

/**
 * Formata um percentual em 0–100 com 1 casa decimal por default.
 * `decimals` permite forçar 0 para headers grandes (ex. "53%").
 *
 * Edge cases:
 *   - NaN  → "—" (em-dash, padrão NYT)
 *   - <0   → "0%"
 *   - >100 → "100%"
 */
export function formatPercent(value: number, decimals = 1): string {
  if (Number.isNaN(value)) return "—";
  const clamped = Math.max(0, Math.min(100, value));
  const rounded = Number(clamped.toFixed(decimals));
  return decimals === 0
    ? `${Math.round(rounded)}%`
    : `${rounded.toLocaleString(LOCALE, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}%`;
}

/**
 * Formata votos com separador de milhar pt-BR (ex. 79.812.408).
 *
 * Para a home (RF-022) queremos número cheio — não abreviar para "79M".
 * Abreviações ("8,2M") só na tabela de UFs ou cards estreitos: use
 * `formatVotesCompact` para isso.
 */
export function formatVotes(votes: number): string {
  if (Number.isNaN(votes) || !Number.isFinite(votes)) return "—";
  return Math.round(votes).toLocaleString(LOCALE);
}

/**
 * Abreviado em pt-BR: 8.234.000 → "8,2 mi", 680.000 → "680 mil".
 *
 * Usa thresholds inteiros para previsibilidade. Não usa `Intl.NumberFormat`
 * com `notation: 'compact'` porque o "mil/mi" em pt-BR varia ("mi" ou "M"
 * conforme implementação V8/JSC); aqui forçamos a forma curta NYT-like.
 */
export function formatVotesCompact(votes: number): string {
  if (Number.isNaN(votes) || !Number.isFinite(votes)) return "—";
  const abs = Math.abs(votes);
  if (abs >= 1_000_000) {
    const m = votes / 1_000_000;
    return `${m.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} mi`;
  }
  if (abs >= 1_000) {
    const k = Math.round(votes / 1_000);
    return `${k.toLocaleString(LOCALE)} mil`;
  }
  return votes.toLocaleString(LOCALE);
}

/**
 * Formata um intervalo de confiança 95% em pp (pontos percentuais).
 * `(lower, upper)` vêm em 0-100; saída ex.: "[52,1; 54,3]".
 */
export function formatCI(lower: number, upper: number, decimals = 1): string {
  if (Number.isNaN(lower) || Number.isNaN(upper)) return "—";
  const lo = lower.toLocaleString(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const up = upper.toLocaleString(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `[${lo}; ${up}]`;
}

/**
 * "HH:MM:SS" no fuso de Brasília a partir de um ISO 8601. Determinístico:
 * usa `Intl.DateTimeFormat` com TZ fixa, então o output é o mesmo em SSR e
 * cliente, mesmo se o servidor estiver em UTC.
 *
 * Edge cases:
 *   - ISO inválido → "—"
 */
export function formatTimeHMS(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(LOCALE, {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Margem em pp formatada com sinal explícito: "+2,1 pp" / "-0,8 pp".
 * Útil para a comparação descritiva vs. 2022 (RF-038) e para margens em
 * insights. NaN e `null` são responsabilidade do caller — aqui NaN vira "—".
 */
export function formatPp(value: number, decimals = 1): string {
  if (Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const abs = Math.abs(value).toLocaleString(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sign}${abs} pp`;
}
