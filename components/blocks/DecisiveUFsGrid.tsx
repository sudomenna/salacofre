/**
 * components/blocks/DecisiveUFsGrid.tsx
 *
 * Top N UFs por "decisividade": quanto a UF pode mudar o resultado. Cobertura: RF-024.
 *
 * Cada card mostra:
 *   - Sigla da UF
 *   - Líder atual + margem projetada (com sinal) — barra pintada com `colorForRank()`
 *   - Mini-bar (margem projetada visualizada como faixa)
 *   - Swing vs 2022 (pp)
 *   - Link para `/uf/[sigla]`
 *
 * Fórmula de "decisivo" (S05/F3B — refator)
 *   `score = |margem_projetada| × (pct_apurado / 100)`  invertido depois pra
 *   que MENOR margem com MAIS apurado = MAIOR score. Em outras palavras:
 *   `score_dec = pct_apurado × (1 / (1 + |margem|))`. UFs com duelo local
 *   apertado E muita apuração ficam no topo (são as "tossup quase decididas"
 *   onde poucos pontos viram a chamada). Isso bate com a intuição de mesa
 *   de TV: na noite, o que mais "pesa" é a UF que ainda pode virar com pouco.
 *
 *   Pré-S05 a fórmula era `|swing_vs_2022| × pct_apurado` — útil pra história
 *   "swing", mas confunde com a view "swing" do mapa. A nova fórmula prioriza
 *   *incerteza × peso* e é o canon do bloco "decisivas".
 *
 * Server Component puro. Sem estado, sem hooks.
 *
 * A11y
 *   - `<section aria-labelledby>` para landmark.
 *   - Cada card é `<a>` (navegável por teclado, anunciado como link).
 */

import type { EdgeUfRow } from "@/lib/edge-config/types";
import { colorForRank } from "@/lib/utils/cand-color";
import { formatPercent, formatPp } from "@/lib/utils/format";

export interface DecisiveUFsGridProps {
  rows: EdgeUfRow[];
  /**
   * Mapping `candidato_id → rank nacional` (S05/F3B). Habilita paleta N-way
   * por líder local: UF com líder rank 3 → barra âmbar. Quando omitido, o
   * componente degrada para "líder = rank 1 (vermelho)" usando `candidatoAId`
   * (back-compat S04). Calculado em `app/page.tsx`.
   */
  rankByLider?: Record<number, number>;
  /**
   * ID do candidato A (líder global). Mantido para back-compat S04 — quando
   * `rankByLider` é omitido, usado pra resolver "isA → corA, senão corB".
   */
  candidatoAId: number | null;
  /** Cor token do candidato A (default cand-1 = vermelho). Usado só em modo back-compat. */
  corA?: string;
  /** Cor token do candidato B (default cand-2 = azul). Usado só em modo back-compat. */
  corB?: string;
  className?: string;
  /** Quantos cards mostrar. Default 6. */
  top?: number;
}

/**
 * Score "decisivo" (S05/F3B): UFs onde poucos pontos podem virar a chamada,
 * ponderado por quanto já apurou. Formula:
 *   `pct_apurado × max_margin_top2_uf × pct_apurado`
 * onde `max_margin_top2_uf` aqui é `1 / (1 + |margem|)` — inverte a margem
 * (menos margem = mais decisivo). Para uma UF "100% apurada e empate
 * técnico" o score é alto; para "100% apurada com margem 30pp" o score é
 * baixo. Garantia: scoreDecisivo é sempre 0 quando pct_apurado = 0
 * (UFs ainda não apuradas não são "decisivas no momento").
 */
function decisiveScore(row: EdgeUfRow): number {
  const pesoMargem = 1 / (1 + Math.abs(row.margem_projetada));
  return (row.pct_apurado / 100) * pesoMargem;
}

export function DecisiveUFsGrid({
  rows,
  rankByLider,
  candidatoAId,
  corA = "var(--color-cand-1)",
  corB = "var(--color-cand-2)",
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
          // Cor por rank quando temos `rankByLider`; fallback S04 quando não.
          const rankDoLider = rankByLider?.[row.lider];
          const cor =
            typeof rankDoLider === "number"
              ? colorForRank(rankDoLider)
              : row.lider === candidatoAId
                ? corA
                : corB;
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
