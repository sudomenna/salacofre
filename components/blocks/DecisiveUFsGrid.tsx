/**
 * components/blocks/DecisiveUFsGrid.tsx
 *
 * Top 6 UFs por contribuição ao swing nacional. Cobertura: RF-024.
 *
 * Cada card mostra:
 *   - Sigla da UF
 *   - Líder atual + margem projetada (com sinal)
 *   - Mini-bar (margem projetada visualizada como faixa)
 *   - Swing vs 2022 (pp)
 *   - Link para `/uf/[sigla]`
 *
 * "Contribuição ao swing" — proxy didático: usamos `|swing_vs_2022|`
 * ponderado por `pct_apurado` para estimar quanto a UF está movendo o
 * forecast. Não é o cálculo formal do modelo (que vive em
 * `lib/model/`), mas serve para destacar as UFs que mais variaram.
 *
 * Server Component puro. Sem estado, sem hooks.
 *
 * A11y
 *   - `<section aria-labelledby>` para landmark.
 *   - Cada card é `<a>` (navegável por teclado, anunciado como link).
 */

import type { EdgeUfRow } from "@/lib/edge-config/types";
import { formatPercent, formatPp } from "@/lib/utils/format";

export interface DecisiveUFsGridProps {
  rows: EdgeUfRow[];
  /** ID do candidato A (líder global) — para colorir corretamente quando A vence. */
  candidatoAId: number | null;
  /** Cor token do candidato A (default vermelho PT). */
  corA?: string;
  /** Cor token do candidato B (default azul PL). */
  corB?: string;
  className?: string;
  /** Quantos cards mostrar. Default 6. */
  top?: number;
}

function decisiveScore(row: EdgeUfRow): number {
  // |swing| ponderado pelo quanto a UF já se "definiu". UFs com swing alto e
  // alguma apuração são as que mais movem o forecast.
  return Math.abs(row.swing_vs_2022) * (0.3 + (row.pct_apurado / 100) * 0.7);
}

export function DecisiveUFsGrid({
  rows,
  candidatoAId,
  corA = "var(--color-pt)",
  corB = "var(--color-pl)",
  className,
  top = 6,
}: DecisiveUFsGridProps) {
  // Sort descrescente por contribuição
  const sorted = [...rows].sort((x, y) => decisiveScore(y) - decisiveScore(x)).slice(0, top);

  return (
    <section
      aria-labelledby="decisive-ufs-heading"
      className={["flex flex-col gap-3", className].filter(Boolean).join(" ")}
    >
      <header>
        <h2
          id="decisive-ufs-heading"
          className="text-xl"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          UFs decisivas
        </h2>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          As UFs com maior contribuição ao swing nacional vs. 2022.
        </p>
      </header>
      <ul
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
        aria-label="Lista de UFs decisivas"
      >
        {sorted.map((row) => {
          const isA = row.lider === candidatoAId;
          const cor = isA ? corA : corB;
          const margemSafe = Math.max(0, Math.min(100, Math.abs(row.margem_projetada)));
          return (
            <li
              key={row.sigla}
              className="rounded-md border"
              style={{ borderColor: "var(--color-border)" }}
            >
              <a
                href={`/uf/${row.sigla}`}
                className="block p-3 hover:bg-bg-muted"
                style={{ color: "var(--color-text)" }}
              >
                <div className="flex items-baseline justify-between">
                  <span
                    className="text-2xl font-semibold tabular-nums"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {row.sigla}
                  </span>
                  <span
                    className="text-xs tabular-nums"
                    style={{ color: "var(--color-text-muted)" }}
                    title={`${formatPercent(row.pct_apurado, 0)} apurado`}
                  >
                    {formatPercent(row.pct_apurado, 0)}
                  </span>
                </div>
                <div
                  className="mt-1 text-xs tabular-nums"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Margem projetada: {formatPp(row.margem_projetada)}
                </div>
                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-sm"
                  style={{ backgroundColor: "var(--color-bg-muted)" }}
                  aria-hidden="true"
                >
                  <div
                    className="h-full"
                    style={{
                      width: `${margemSafe}%`,
                      backgroundColor: cor,
                    }}
                  />
                </div>
                <div
                  className="mt-2 text-xs tabular-nums"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Swing vs 2022: {formatPp(row.swing_vs_2022)}
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
