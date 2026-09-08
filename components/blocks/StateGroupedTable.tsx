/**
 * components/blocks/StateGroupedTable.tsx
 *
 * Tabela "Resultados por estado" agrupada por bucket. Cobertura: RF-030.6.
 *
 * Modos (S05/F3B — refator)
 *   - `mode="binary"` (default): 5 colunas (A_safe | A_close | tossup | B_close | B_safe).
 *     Comportamento S04 preservado — usado em 2T e em 1T com 2 candidatos.
 *   - `mode="multi-1t"`: 1 coluna por candidato com >= 1 UF liderando + 1
 *     coluna "Em disputa" (UFs com tossup ou margem < 2pp). Cor do header
 *     vem de `colorForRank(rank)`. Esperado típico em 1T BR: 2-3 colunas
 *     concentrando a maioria das UFs (top-2 dominante) + 1 "Em disputa".
 *
 * Server Component puro. Sem hooks.
 *
 * A11y
 *   - `<table>` semântico, com `<caption>` + `<thead>` + `<tbody>`.
 *   - Linhas vinculadas a `/uf/[sigla]`.
 *
 * As células de UF eram `<a href>` cru até 2026-09-08 e passaram a `<Link>`
 * (ADR-0033 § 1). Um `<a href>` recarrega o documento, e com a moldura
 * persistente isso significa derrubar a moldura inteira — medido no navegador
 * naquele dia: uma marca gravada em `window` não sobrevivia ao clique daqui,
 * mas sobrevivia ao clique num `<Link>`. O HTML rendido é o mesmo `<a href>`
 * indexável; muda só o handler que o App Router acopla.
 */

import Link from "next/link";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";
import { colorForRank } from "@/lib/utils/cand-color";
import { formatPercent, formatPp } from "@/lib/utils/format";

export type StateGroupedTableMode = "binary" | "multi-1t";

export interface StateGroupedTableProps {
  rows: EdgeUfRow[];
  /**
   * Modo de agrupamento. Default `"binary"` mantém o comportamento S04
   * (5 colunas A/B). Em corrida 1T multi-candidato, caller passa `"multi-1t"`
   * pra mostrar 1 coluna por candidato + "Em disputa".
   */
  mode?: StateGroupedTableMode;
  /**
   * Lista nacional de candidatos. Necessário em `mode="multi-1t"` pra
   * resolver `nome` + `rank` por `id` (UF.lider). Opcional em binary
   * (mantém back-compat S04 via `candidatoAName`/`candidatoBName`).
   */
  candidatos?: EdgeCandidate[];
  candidatoAId: number | null;
  /** Usado em mode="binary". S05+: prefira passar `candidatos`. */
  candidatoAName?: string;
  /** Usado em mode="binary". S05+: prefira passar `candidatos`. */
  candidatoBName?: string;
  corA?: string;
  corB?: string;
  /** Limites em pp. Default: comfortable >= 10, tossup < 3. */
  comfortableThreshold?: number;
  tossupThreshold?: number;
  /** Margem (pp) que classifica UF como "Em disputa" em multi-1t. Default 2. */
  multiDisputaThreshold?: number;
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
  mode = "binary",
  candidatos,
  candidatoAId,
  candidatoAName = "Líder A",
  candidatoBName = "Líder B",
  corA = "var(--color-cand-1)",
  corB = "var(--color-cand-2)",
  comfortableThreshold = 10,
  tossupThreshold = 3,
  multiDisputaThreshold = 2,
  className,
}: StateGroupedTableProps) {
  if (mode === "multi-1t") {
    return (
      <MultiTable
        rows={rows}
        candidatos={candidatos ?? []}
        multiDisputaThreshold={multiDisputaThreshold}
        className={className}
      />
    );
  }

  // mode === "binary" — comportamento S04
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
                        <Link
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
                        </Link>
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

// ---------------------------------------------------------------------------
// MultiTable — mode="multi-1t" (1 coluna por candidato + Em disputa)
// ---------------------------------------------------------------------------
interface MultiTableProps {
  rows: EdgeUfRow[];
  candidatos: EdgeCandidate[];
  multiDisputaThreshold: number;
  className?: string;
}

function MultiTable({ rows, candidatos, multiDisputaThreshold, className }: MultiTableProps) {
  // Lookup id → candidato (nome + rank)
  const byId = new Map(candidatos.map((c) => [c.id, c]));

  // Bucket "Em disputa": margem absoluta abaixo do threshold (default 2pp).
  // Demais UFs vão pra coluna do `lider`.
  const disputa: EdgeUfRow[] = [];
  const porLider = new Map<number, EdgeUfRow[]>();
  for (const row of rows) {
    if (Math.abs(row.margem_projetada) < multiDisputaThreshold) {
      disputa.push(row);
      continue;
    }
    const arr = porLider.get(row.lider) ?? [];
    arr.push(row);
    porLider.set(row.lider, arr);
  }

  // Ordena UFs dentro de cada coluna por |margem| desc (mais decisivas primeiro)
  for (const arr of porLider.values()) {
    arr.sort((a, b) => Math.abs(b.margem_projetada) - Math.abs(a.margem_projetada));
  }
  disputa.sort((a, b) => Math.abs(a.margem_projetada) - Math.abs(b.margem_projetada));

  // Headers: 1 por candidato com >= 1 UF + 1 "Em disputa"
  // Ordenação dos candidatos por rank ascendente (rank 1 primeiro)
  type Header = {
    key: string;
    label: string;
    color: string;
    ufs: EdgeUfRow[];
  };

  const candidatoHeaders: Header[] = Array.from(porLider.entries())
    .map(([liderId, ufs]) => {
      const cand = byId.get(liderId);
      const rank = cand?.rank ?? 99;
      const nome = cand?.nome ?? `#${liderId}`;
      return {
        key: `cand-${liderId}`,
        label: nome,
        color: colorForRank(rank),
        ufs,
        rank,
      };
    })
    .sort((a, b) => a.rank - b.rank)
    .map(({ rank, ...h }) => h); // strip rank from final shape

  const disputaHeader: Header = {
    key: "disputa",
    label: "Em disputa",
    color: "var(--color-tossup)",
    ufs: disputa,
  };

  const headers: Header[] = [...candidatoHeaders, disputaHeader];

  // Altura uniforme — max length
  const maxLen = Math.max(0, ...headers.map((h) => h.ufs.length));

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
          UFs agrupadas pelo líder projetado (1º turno).
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            {rows.length} UFs agrupadas em {headers.length} colunas — 1 por candidato + "Em
            disputa".
          </caption>
          <thead>
            <tr>
              {headers.map((h) => (
                <th
                  key={h.key}
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
              // biome-ignore lint/suspicious/noArrayIndexKey: linhas são posicionais por construção (UFs ordenadas por |margem|); sem id estável.
              <tr key={`row-${rowIdx}`}>
                {headers.map((h) => {
                  const row = h.ufs[rowIdx];
                  return (
                    <td
                      key={h.key}
                      className="border-b px-2 py-1.5 align-top"
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      {row ? (
                        <Link
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
                        </Link>
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
