/**
 * components/blocks/NationalWinnerBanner.tsx
 *
 * Banner nacional "ELEITO" — análogo ao `<WinnerBanner />` (UF), mas pro
 * agregado nacional. Aparece quando o líder atinge threshold de chamada
 * (p_vitoria >= 0.99 ou apuração >= 99%).
 *
 * Cobertura
 *   - Inspirado em RF-032 (WinnerBanner UF) — versão nacional para o
 *     placar presidencial. Próximo nível semântico: "chamada final".
 *   - ADR-0013 (cores por rank — banner usa cor do rank 1 / líder).
 *   - Constituição § 2 (neutralidade — cor via token, nunca partidária).
 *
 * Server Component puro. Caller passa o slice nacional + total apurado.
 *
 * Gate de renderização
 *   - Em 1T: só renderiza se `vai_a_2t === false` (sinal binário do
 *     payload — orchestrator declara que NÃO vai a 2T no agregado
 *     nacional) E threshold atingido.
 *   - Em 2T: qualquer threshold atingido (não há "vai a 2T" — o 2T já é).
 *   - Threshold combinado (OR): `p_vitoria_lider >= 0.99` OU
 *     `pct_apurado_total >= 99.0`. A primeira é probabilística (modelo
 *     muito confiante), a segunda é factual (apuração quase 100%).
 *   - `national.candidato_a_id == null` → null (pré-apuração).
 *
 * Como o líder é resolvido
 *   - Procuramos o candidato com `rank === 1` no array. Se ausente,
 *     fallback para `national.candidato_a_id` (lookup por id). Se ambos
 *     falharem, não renderiza (degradação silenciosa).
 *
 * A11y
 *   - `role="status"` + `aria-live="polite"` — quando o banner aparecer
 *     mid-apuração, screen readers anunciam de forma não-intrusiva.
 *   - Cor de texto adaptativa via `rank` (ranks 1–2 = fundo escuro =
 *     texto branco; rank 3+ = fundo médio = texto escuro). Mesmo padrão
 *     do `<WinnerBanner />` UF.
 */

import type { CSSProperties } from "react";

import type { EdgeCandidate, EdgeNational, Turno } from "@/lib/edge-config/types";
import { formatPercent } from "@/lib/utils/format";

/** Threshold mínimo de p_vitoria do líder para "chamada final". */
export const NATIONAL_WIN_P_THRESHOLD = 0.99;
/** Threshold mínimo de apuração total para "chamada final". */
export const NATIONAL_WIN_PCT_APURADO_THRESHOLD = 99.0;

export interface NationalWinnerBannerProps {
  national: EdgeNational;
  /** Lista completa de candidatos do payload (alimenta lookup por id). */
  candidatos: EdgeCandidate[];
  /**
   * % total apurado da corrida (0–100). Vem do `EdgePayload.pct_apurado_total`.
   * O caller é responsável por passar — não está em `EdgeNational`.
   */
  pctApuradoTotal: number;
  /** Turno (1 ou 2). Em 1T exige `vai_a_2t === false` no payload (não há aqui — caller filtra). */
  turno: Turno;
  /**
   * Sinal binário do orchestrator: a eleição NÃO vai a 2T no agregado
   * nacional. Em 1T, exigimos `false` para renderizar. Em 2T, ignorado.
   * Convenção: `null` é tratado como `undefined` (sem sinal, não renderiza
   * em 1T por segurança). Em 2T sempre passa.
   *
   * Source: derivado de `p_segundo_turno_overall` no caller — quando
   * o caller passa esta prop, ele já decidiu o status do agregado.
   */
  vaiA2t?: boolean | null;
  className?: string;
}

/** Ranks 1 e 2 têm fundos escuros (vermelho/azul); demais são médios/claros. */
function shouldUseDarkText(rank: number | undefined): boolean {
  return rank != null && rank >= 3;
}

export function NationalWinnerBanner({
  national,
  candidatos,
  pctApuradoTotal,
  turno,
  vaiA2t,
  className,
}: NationalWinnerBannerProps) {
  // Gate 1: sem líder identificado.
  if (national.candidato_a_id == null) return null;

  // Resolve líder: rank 1 primeiro, fallback por id.
  const lider =
    candidatos.find((c) => (c.rank ?? -1) === 1) ??
    candidatos.find((c) => c.id === national.candidato_a_id);
  if (!lider) return null;

  // Gate 2 (turno 1): exige `vai_a_2t === false` (não vai a 2T no agregado).
  // null/undefined em 1T = sem sinal → não renderiza por segurança.
  if (turno === 1 && vaiA2t !== false) return null;

  // Gate 3: threshold (p_vitoria OR pct_apurado_total).
  const meetsPVitoria = lider.p_vitoria >= NATIONAL_WIN_P_THRESHOLD;
  const meetsApurado = pctApuradoTotal >= NATIONAL_WIN_PCT_APURADO_THRESHOLD;
  if (!meetsPVitoria && !meetsApurado) return null;

  // Cor + texto adaptativo
  const rank = lider.rank ?? 1;
  const useDarkText = shouldUseDarkText(rank);
  const style: CSSProperties = {
    backgroundColor: lider.cor,
    color: useDarkText ? "var(--color-text)" : "#ffffff",
  };

  const pctLabel = formatPercent(lider.pct_projetado, 1);
  const ariaLabel = `Presidente eleito: ${lider.nome} (${lider.partido}) com ${pctLabel}.`;
  const containerClass = ["flex flex-col gap-1 rounded-md px-6 py-5", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className={containerClass}
      style={style}
    >
      <span className="text-xs font-semibold uppercase tracking-wider opacity-90">ELEITO</span>
      <strong className="text-3xl font-semibold leading-tight md:text-4xl">
        {lider.nome} é {turno === 2 ? "eleito" : "eleito no 1º turno"}
      </strong>
      <span className="text-sm opacity-90">
        {lider.partido} · {pctLabel}
      </span>
    </div>
  );
}
