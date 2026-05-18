/**
 * components/atoms/badges/RaceTypeIndicator.tsx
 *
 * Texto descritivo do tipo da disputa — "Disputa entre N candidatos"
 * em 1T ou "Segundo turno entre A e B" em 2T. Atomo informacional
 * usado em headers e contexto do hero multi-camada.
 *
 * Cobertura
 *   - RF-030.8 (ranking multi-camada — S05/F4c, ADR-0017).
 *   - Suporte ao princípio ADR-0017: deixa explícito o "shape" da
 *     corrida sem o usuário precisar contar dots.
 *
 * Server Component puro — sem 'use client', sem state.
 *
 * Lógica
 *   - 1T: conta candidatos com `pct_projetado >= 0.5` (>= 0,5%). Usa
 *     plural/singular ("1 candidato" / "N candidatos"). O threshold
 *     0,5% é menor que o color-lock de 1% (ADR-0013): aqui é só pra
 *     EVITAR contar lista de "outros" (10 partidos com pct < 0,5%);
 *     o objetivo é número honesto, não enxuto.
 *   - 2T: pega os 2 primeiros (caller passa candidatos já ordenados
 *     por rank/pct desc).
 *
 * A11y
 *   - Texto solto — leitor de tela lê linearmente.
 *   - Cor neutra (`--color-text-muted`) — constituição § 2.
 */

import type { EdgeCandidate, Turno } from "@/lib/edge-config/types";

export interface RaceTypeIndicatorProps {
  candidatos: EdgeCandidate[];
  turno: Turno;
  className?: string;
}

/**
 * Threshold de "candidato real" em 1T — pct_projetado >= 0.5%.
 * Abaixo disso entra na contagem de "outros" e não no headline.
 */
const PCT_THRESHOLD_1T = 0.5;

export function RaceTypeIndicator({ candidatos, turno, className }: RaceTypeIndicatorProps) {
  const classes = ["text-sm", className].filter(Boolean).join(" ");

  if (turno === 2) {
    const a = candidatos[0];
    const b = candidatos[1];
    if (!a || !b) {
      // Fallback raro (payload 2T incompleto) — degrada graciosamente.
      return (
        <p className={classes} style={{ color: "var(--color-text-muted)" }}>
          Segundo turno
        </p>
      );
    }
    return (
      <p className={classes} style={{ color: "var(--color-text-muted)" }}>
        Segundo turno entre {a.nome} e {b.nome}
      </p>
    );
  }

  // 1T
  const n = candidatos.filter(
    (c) => Number.isFinite(c.pct_projetado) && c.pct_projetado >= PCT_THRESHOLD_1T,
  ).length;
  const word = n === 1 ? "candidato" : "candidatos";

  return (
    <p className={classes} style={{ color: "var(--color-text-muted)" }}>
      Disputa entre {n} {word}
    </p>
  );
}
