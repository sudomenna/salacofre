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

import { colorForRank } from "@/lib/utils/cand-color";
import { formatCI, formatPercent, formatVotes } from "@/lib/utils/format";
import { siglaExibicao } from "@/lib/utils/sigla-partido";

export interface CandidateBarProps {
  nome: string;
  partido: string;
  /**
   * Cor token (var(--color-cand-N) / var(--color-pt) etc). NUNCA hex
   * partidário direto. Quando ausente e `rank` é passado, derivamos via
   * `colorForRank(rank)` (paleta neutra por rank — S05/F3B, ADR-0013).
   */
  cor?: string;
  /**
   * Rank semântico do candidato (1 = líder). Usado como fallback de cor
   * quando `cor` não vier no payload (ex.: fixtures antigos pré-S05) e
   * para garantir paleta neutra dinâmica. Quando ambos `cor` e `rank`
   * são passados, `cor` tem prioridade — payload é fonte de verdade.
   */
  rank?: number;
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
  rank,
  pctProjetado,
  pctLower,
  pctUpper,
  votos,
  alignRight = false,
  className,
}: CandidateBarProps) {
  // Resolução de cor: payload tem prioridade; sem payload, derivamos por rank;
  // sem nenhum dos dois, caímos no token de fallback neutro (cand-1 = mesmo
  // hex de --color-pt). Constituição § 2 — sempre token, nunca hex literal.
  const corResolvida: string =
    cor ?? (typeof rank === "number" ? colorForRank(rank) : "var(--color-cand-1)");
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
              {/* Desenhado ⇒ abreviado (2026-09-19); o `ariaLabel` acima segue
                  com a sigla inteira. */}
              ({siglaExibicao(partido)})
            </span>
          </div>
        </div>
        <div className={numberClass}>
          <div
            className="font-serif text-3xl font-semibold tabular-nums leading-none"
            style={{ color: corResolvida }}
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
            backgroundColor: corResolvida,
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
