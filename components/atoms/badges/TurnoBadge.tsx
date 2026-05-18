/**
 * components/atoms/badges/TurnoBadge.tsx
 *
 * Chip pequeno indicando o turno atual ("1º turno" / "2º turno"). Usado
 * em headers e contextos compactos onde o leitor precisa identificar
 * rapidamente em qual corrida está olhando.
 *
 * Cobertura: S05/F4c — multi-candidato (ADR-0017, RF-030.8 contexto).
 *
 * Server Component puro — sem state, sem hooks, sem 'use client'.
 *
 * A11y
 *   - `role="status"` para que o leitor de tela anuncie o contexto.
 *   - `aria-label` descritivo (ex. "Turno atual: 1º turno").
 *
 * Cor (constituição § 2): neutra — NÃO partidária. Border + bg via
 * tokens `--color-text-muted` / `--color-bg-muted`.
 */

import type { Turno } from "@/lib/edge-config/types";

export interface TurnoBadgeProps {
  turno: Turno;
  className?: string;
}

export function TurnoBadge({ turno, className }: TurnoBadgeProps) {
  const label = turno === 1 ? "1º turno" : "2º turno";

  const classes = [
    "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      role="status"
      aria-label={`Turno atual: ${label}`}
      className={classes}
      style={{
        borderColor: "var(--color-text-muted)",
        backgroundColor: "var(--color-bg-muted)",
        color: "var(--color-text-muted)",
      }}
    >
      {label}
    </span>
  );
}
