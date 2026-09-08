/**
 * components/atoms/data/ProbabilityMeter.tsx
 *
 * Medidor de chance (0–100) do design system Atlas Menna (ADR-0025, Bloco 1).
 * Portado de `docs/design-system/atlas-menna/components/data/ProbabilityMeter.jsx`.
 *
 * Regra editorial do kit, mantida aqui pela constituição § 8 (transparência
 * metodológica): **um medidor de probabilidade nunca vai ao ar sem uma linha
 * dizendo como foi calculado**. Daí a prop `note`.
 *
 * Server Component puro — zero JS novo (RNF-007a).
 *
 * Divergências deliberadas em relação ao `.jsx` do kit:
 *   - o preenchimento usa `--accent-strong` (#9E6A1C) e não `--accent`
 *     (#C98A2B). Medido contra a calha `--surface-sunken` (#E9EBEE):
 *     `--accent` dá **2.46:1** e `--accent-strong` dá **3.88:1**. WCAG 1.4.11
 *     (objeto gráfico necessário para entender o conteúdo) pede 3:1, e a
 *     constituição § 4 adota WCAG 2.1 AA — o ocre puro reprovaria.
 *   - `tone="pt" | "pl"` foi removido: dependia de `--party-pt`/`--party-pl`,
 *     tokens que ainda não existem (ADR-0024 / `lib/utils/party-color.ts`).
 *     Cor ligada a dado entra por `color`, sempre como `var(--token)`.
 *   - `role="meter"` + `aria-valuenow/min/max/valuetext`: sem isso a barra é
 *     uma `<div>` colorida muda para leitor de tela (RNF-022/023).
 */

import type { CSSProperties } from "react";

export interface ProbabilityMeterProps {
  /** Rótulo — ex. "Chance de 2º turno". Vira o nome acessível do medidor. */
  label: string;
  /** Probabilidade em 0–100. */
  pct: number;
  /** Como o número foi calculado. Obrigatório editorialmente (constituição § 8). */
  note?: string;
  /** Cor do preenchimento ligada a dado. `var(--token)`. Default: ocre forte. */
  color?: string;
  className?: string;
  style?: CSSProperties;
}

function clampPct(pct: number): number {
  if (Number.isNaN(pct)) return 0;
  return Math.max(0, Math.min(100, pct));
}

export function ProbabilityMeter({
  label,
  pct,
  note,
  color = "var(--accent-strong)",
  className,
  style,
}: ProbabilityMeterProps) {
  const value = clampPct(pct);
  const rounded = Math.round(value);

  return (
    <div
      data-testid="probability-meter"
      className={className}
      style={{ display: "grid", gap: "var(--space-2)", ...style }}
    >
      <div className="flex items-baseline justify-between" style={{ gap: "var(--space-3)" }}>
        <span style={{ font: "var(--type-body-sm)", color: "var(--text-primary)" }}>{label}</span>
        <span data-testid="probability-meter-value" style={{ font: "var(--type-figure)" }}>
          {rounded}
          <span style={{ font: "var(--type-figure-sm)", color: "var(--text-secondary)" }}>%</span>
        </span>
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: meter nativo não estiliza. */}
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={rounded}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${rounded}%`}
        data-testid="probability-meter-track"
        className="flex overflow-hidden"
        style={{ height: 8, borderRadius: "var(--radius-sm)", background: "var(--surface-sunken)" }}
      >
        <div
          data-testid="probability-meter-fill"
          style={{
            width: `${value}%`,
            background: color,
            transition: "width var(--dur-slow) var(--ease-out)",
          }}
        />
      </div>
      {note ? (
        <div
          data-testid="probability-meter-note"
          style={{
            font: "var(--type-body-sm)",
            fontSize: "var(--text-xs)",
            color: "var(--text-muted)",
          }}
        >
          {note}
        </div>
      ) : null}
    </div>
  );
}
