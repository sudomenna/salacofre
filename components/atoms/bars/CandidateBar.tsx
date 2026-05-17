/**
 * components/atoms/bars/CandidateBar.tsx
 *
 * Barra horizontal proporcional para um candidato — exibe nome, partido,
 * %, votos e CI95 ao lado/abaixo da barra. Usada por `<HeadlineScore />`
 * (RF-022, RF-023) e por `<DecisiveUFsGrid />` (cards estreitos).
 *
 * Server Component puro — sem state, sem hooks, sem 'use client'.
 *
 * A11y
 *   - role="meter" + aria-valuemin/max/now e aria-label descritivo.
 *   - Números em tabular-nums (CSS global).
 */

import { formatCI, formatPercent, formatVotes } from "@/lib/utils/format";

export interface CandidateBarProps {
  nome: string;
  partido: string;
  /** Cor token (var(--color-pt) etc). NUNCA hex partidário direto. */
  cor: string;
  /** Percentual projetado (0-100). */
  pctProjetado: number;
  /** CI95 lower (0-100). */
  pctLower?: number;
  /** CI95 upper (0-100). */
  pctUpper?: number;
  /** Votos projetados. */
  votos?: number;
  /** Largura "máxima" semântica: o percentual 100% equivale a essa largura. */
  alignRight?: boolean;
  className?: string;
}

export function CandidateBar({
  nome,
  partido,
  cor,
  pctProjetado,
  pctLower,
  pctUpper,
  votos,
  alignRight = false,
  className,
}: CandidateBarProps) {
  const pctSafe = Number.isFinite(pctProjetado) ? Math.max(0, Math.min(100, pctProjetado)) : 0;
  const ariaLabel = `${nome} (${partido}): ${formatPercent(pctSafe)} projetado${
    typeof pctLower === "number" && typeof pctUpper === "number"
      ? ` — intervalo ${formatCI(pctLower, pctUpper)}`
      : ""
  }${typeof votos === "number" ? `, ${formatVotes(votos)} votos` : ""}`;

  const containerClass = ["flex flex-col gap-2", className].filter(Boolean).join(" ");
  const headerClass = alignRight
    ? "flex items-baseline justify-between flex-row-reverse"
    : "flex items-baseline justify-between";
  const numberClass = alignRight ? "text-right" : "text-left";

  return (
    <div className={containerClass}>
      <div className={headerClass}>
        <div className={alignRight ? "text-right" : "text-left"}>
          <div className="text-lg font-medium" style={{ fontFamily: "var(--font-serif)" }}>
            {nome}{" "}
            <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              ({partido})
            </span>
          </div>
        </div>
        <div className={numberClass}>
          <div
            className="font-serif text-3xl font-semibold tabular-nums leading-none"
            style={{ color: cor }}
          >
            {formatPercent(pctSafe, 1)}
          </div>
        </div>
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: meter nativo não estiliza o suficiente. */}
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pctSafe)}
        aria-label={ariaLabel}
        className="relative h-3 w-full overflow-hidden rounded-sm border"
        style={{
          backgroundColor: "var(--color-bg-muted)",
          borderColor: "var(--color-border)",
        }}
      >
        <div
          className="h-full"
          style={{
            width: `${pctSafe}%`,
            backgroundColor: cor,
            marginLeft: alignRight ? "auto" : 0,
          }}
        />
      </div>
      {(typeof votos === "number" ||
        (typeof pctLower === "number" && typeof pctUpper === "number")) && (
        <div
          className={`flex flex-wrap items-baseline gap-x-3 text-xs ${
            alignRight ? "justify-end" : ""
          }`}
          style={{ color: "var(--color-text-muted)" }}
        >
          {typeof votos === "number" && (
            <span className="tabular-nums">{formatVotes(votos)} votos</span>
          )}
          {typeof pctLower === "number" && typeof pctUpper === "number" && (
            <span className="tabular-nums">CI95: {formatCI(pctLower, pctUpper)}</span>
          )}
        </div>
      )}
    </div>
  );
}
