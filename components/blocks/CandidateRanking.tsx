/**
 * components/blocks/CandidateRanking.tsx
 *
 * Camada 2 do hero multi-candidato (ADR-0017 — transparência total).
 * Lista vertical compacta dos candidatos rank 3..6: dot de cor + nome +
 * partido + pct_projetado + mini-barra horizontal.
 *
 * O CALLER filtra qual subset entra aqui (tipicamente rank 3..6). Este
 * componente é "burro": só recebe os candidatos a exibir e renderiza.
 *
 * Cobertura
 *   - RF-030.8 (ranking multi-camada — S05/F4c, ADR-0017).
 *
 * Server Component puro — sem 'use client'.
 *
 * Ordem visual
 *   - Renderiza na ordem do array (caller já passa em rank ASC).
 *
 * A11y
 *   - `<ul>` + `<li>` semânticos (role implícito; biome regra
 *     `noRedundantRoles` proíbe `role="list"/"listitem"` explícito).
 *   - Cada `<li>` tem `aria-label` completo (nome + pct), assim leitor
 *     de tela não precisa concatenar nodes; texto visível continua para
 *     leitor visual.
 */

import type { EdgeCandidate } from "@/lib/edge-config/types";
import { formatPercent } from "@/lib/utils/format";

export interface CandidateRankingProps {
  /** Candidatos a exibir — caller filtra o slice (ex. rank 3..6). */
  candidatos: EdgeCandidate[];
  className?: string;
}

export function CandidateRanking({ candidatos, className }: CandidateRankingProps) {
  if (!candidatos || candidatos.length === 0) return null;

  const containerClass = ["flex flex-col gap-3", className].filter(Boolean).join(" ");

  return (
    <ul className={containerClass}>
      {candidatos.map((c) => {
        const pctSafe = Number.isFinite(c.pct_projetado)
          ? Math.max(0, Math.min(100, c.pct_projetado))
          : 0;
        const pctLabel = formatPercent(pctSafe, 1);
        const ariaLabel = `${c.nome} ${pctLabel}`;

        return (
          <li key={c.id} aria-label={ariaLabel} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: c.cor }}
                />
                <span className="truncate text-sm font-medium">
                  {c.nome}{" "}
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                    ({c.partido})
                  </span>
                </span>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{pctLabel}</span>
            </div>
            {/* Mini-barra horizontal — proporcional ao pct_projetado */}
            <div
              aria-hidden="true"
              className="h-1 w-full overflow-hidden rounded-sm"
              style={{ backgroundColor: "var(--color-bg-muted)" }}
            >
              <div className="h-full" style={{ width: `${pctSafe}%`, background: c.cor }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
