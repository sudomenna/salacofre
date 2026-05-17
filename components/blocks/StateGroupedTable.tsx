/**
 * components/blocks/StateGroupedTable.tsx
 *
 * Tabela "Resultados por estado" agrupada por margem em 5 colunas:
 *   1. Líder A confortável  (margem ≥ 10)
 *   2. Líder A apertado     (0 < margem < 10)
 *   3. Em disputa           (|margem| < 3 OR CI95 cruza 0 — placeholder)
 *   4. Líder B apertado     (0 < margem < 10)
 *   5. Líder B confortável  (margem ≥ 10)
 *
 * Cobertura: RF-030.6.
 *
 * Nota: as labels usam os nomes dos candidatos passados via props. Default
 * "Lula" / "Bolsonaro". O agrupamento é por `lider` + `|margem_projetada|`.
 *
 * Server Component puro. Sem hooks.
 *
 * A11y
 *   - `<table>` semântico, com `<caption>` + `<thead>` + `<tbody>`.
 *   - Linhas vinculadas a `/uf/[sigla]`.
 */

import type { EdgeUfRow } from "@/lib/edge-config/types";
import { formatPercent, formatPp } from "@/lib/utils/format";

export interface StateGroupedTableProps {
  rows: EdgeUfRow[];
  candidatoAId: number | null;
  candidatoAName?: string;
  candidatoBName?: string;
  corA?: string;
  corB?: string;
  /** Limites em pp. Default: comfortable >= 10, tossup < 3. */
  comfortableThreshold?: number;
  tossupThreshold?: number;
  className?: string;
}

type Bucket = "a_safe" | "a_close" | "tossup" | "b_close" | "b_safe";

function bucketFor(
  row: EdgeUfRow,
  candidatoAId: number | null,
  comfortable: number,
  tossup: number,
): Bucket {
  const abs = Math.abs(row.margem_projetada);
  if (abs < tossup) return "tossup";
  const isA = row.lider === candidatoAId;
  if (isA) return abs >= comfortable ? "a_safe" : "a_close";
  return abs >= comfortable ? "b_safe" : "b_close";
}

export function StateGroupedTable({
  rows,
  candidatoAId,
  candidatoAName = "Líder A",
  candidatoBName = "Líder B",
  corA = "var(--color-pt)",
  corB = "var(--color-pl)",
  comfortableThreshold = 10,
  tossupThreshold = 3,
  className,
}: StateGroupedTableProps) {
  const groups: Record<Bucket, EdgeUfRow[]> = {
    a_safe: [],
    a_close: [],
    tossup: [],
    b_close: [],
    b_safe: [],
  };
  rows.forEach((row) => {
    groups[bucketFor(row, candidatoAId, comfortableThreshold, tossupThreshold)].push(row);
  });
  // Dentro de cada bucket, ordena por |margem| decrescente (mais "definidos" primeiro)
  (Object.keys(groups) as Bucket[]).forEach((k) => {
    groups[k].sort((a, b) => Math.abs(b.margem_projetada) - Math.abs(a.margem_projetada));
  });

  const headers: Array<{ id: Bucket; label: string; color: string }> = [
    { id: "a_safe", label: `${candidatoAName} confortável`, color: corA },
    { id: "a_close", label: `${candidatoAName} apertado`, color: corA },
    { id: "tossup", label: "Em disputa", color: "var(--color-tossup)" },
    { id: "b_close", label: `${candidatoBName} apertado`, color: corB },
    { id: "b_safe", label: `${candidatoBName} confortável`, color: corB },
  ];

  // Altura uniforme das colunas — max length
  const maxLen = Math.max(...headers.map((h) => groups[h.id].length));

  return (
    <section
      aria-labelledby="state-grouped-table-heading"
      className={["flex flex-col gap-3", className].filter(Boolean).join(" ")}
    >
      <header>
        <h2
          id="state-grouped-table-heading"
          className="text-xl"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Resultados por estado
        </h2>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          UFs agrupadas pela margem projetada (líder atual).
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            27 UFs agrupadas em 5 colunas pela margem projetada.
          </caption>
          <thead>
            <tr>
              {headers.map((h) => (
                <th
                  key={h.id}
                  scope="col"
                  className="border-b px-2 py-2 text-left text-xs font-medium uppercase tracking-wide"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="mr-1 inline-block h-2 w-2 rounded-sm align-middle"
                    style={{ backgroundColor: h.color }}
                  />
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxLen }).map((_, rowIdx) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: linhas são posicionais por construção (buckets ordenados por |margem|); sem id estável.
              <tr key={`row-${rowIdx}`}>
                {headers.map((h) => {
                  const row = groups[h.id][rowIdx];
                  return (
                    <td
                      key={h.id}
                      className="border-b px-2 py-1.5 align-top"
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      {row ? (
                        <a
                          href={`/uf/${row.sigla}`}
                          className="flex items-baseline justify-between gap-2"
                          style={{ color: "var(--color-text)" }}
                        >
                          <span className="font-medium tabular-nums">{row.sigla}</span>
                          <span
                            className="text-xs tabular-nums"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            {formatPp(row.margem_projetada)} · {formatPercent(row.pct_apurado, 0)}
                          </span>
                        </a>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
