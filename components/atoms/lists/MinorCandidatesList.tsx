/**
 * components/atoms/lists/MinorCandidatesList.tsx
 *
 * Camada 3 do hero multi-candidato (ADR-0017 — transparência total).
 * Lista horizontal compacta dos candidatos "minoritários" (rank 7+ ou
 * pct < 1% — caller decide o filtro): cor dot + nome + pct, separados
 * por middle dot "·". Não é collapsible — em 1T todos candidatos
 * permanecem visíveis (princípio transparência total).
 *
 * Cobertura
 *   - RF-030.8 (ranking multi-camada — S05/F4c, ADR-0017).
 *
 * Server Component puro — sem 'use client'.
 *
 * Layout
 *   - `flex-wrap` para quebrar em múltiplas linhas em mobile.
 *   - Separadores `·` aparecem ENTRE itens, nunca no final.
 *
 * A11y
 *   - `<ul>` + `<li>` semânticos (biome `noRedundantRoles` proíbe
 *     `role="list"/"listitem"` explícito — o role é implícito da tag).
 *   - Cada `<li>` tem `aria-label="<nome> <pct>"`.
 *   - Separador `·` é decorativo (`aria-hidden="true"`).
 */

import type { EdgeCandidate } from "@/lib/edge-config/types";
import { formatPercent } from "@/lib/utils/format";

export interface MinorCandidatesListProps {
  /** Candidatos a exibir — caller filtra (ex. rank 7+, pct < 1%). */
  candidatos: EdgeCandidate[];
  className?: string;
}

export function MinorCandidatesList({ candidatos, className }: MinorCandidatesListProps) {
  if (!candidatos || candidatos.length === 0) return null;

  const containerClass = ["flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]", className]
    .filter(Boolean)
    .join(" ");

  return (
    <ul className={containerClass} style={{ color: "var(--color-text-muted)" }}>
      {candidatos.map((c, i) => {
        const pctSafe = Number.isFinite(c.pct_projetado)
          ? Math.max(0, Math.min(100, c.pct_projetado))
          : 0;
        const pctLabel = formatPercent(pctSafe, 1);
        const isLast = i === candidatos.length - 1;

        return (
          <li
            key={c.id}
            aria-label={`${c.nome} ${pctLabel}`}
            className="inline-flex items-center gap-1"
          >
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: c.cor }}
            />
            <span className="tabular-nums">
              {c.nome} {pctLabel}
            </span>
            {!isLast && (
              <span aria-hidden="true" className="ml-1">
                ·
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
