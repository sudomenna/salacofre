"use client";

/**
 * components/blocks/MunicipioTable.tsx
 *
 * RF-037 — Tabela de municípios paginada/virtualizada.
 *
 * Por que virtualização DIY (window slicing) e NÃO `@tanstack/react-virtual`?
 *   - Bundle above-the-fold da UF precisa ficar <150KB (RNF-007a). Cada dep
 *     adicional pesa. A solução abaixo é ~60 linhas, zero deps, e cobre o
 *     caso de uso (lista plana, altura uniforme, ordem estável).
 *   - Spec 004 design.md § Performance permite "Tanstack Virtual ou solução
 *     custom".
 *
 * Mecânica:
 *   1. Mantém `scrollTop` e `clientHeight` em state.
 *   2. Calcula `startIndex` e `endIndex` da janela visível + overscan.
 *   3. Renderiza apenas as linhas da janela; espaços acima/abaixo são
 *      "spacers" com height = (skippedCount * rowHeight).
 *
 * Performance:
 *   - Para SP (645 municípios) com rowHeight=40 e viewport=600: render
 *     ~20 linhas em vez de 645 → INP estável <200ms.
 *   - `style={{ contain: 'strict' }}` ajuda o browser a isolar reflow.
 *
 * A11y:
 *   - `<table>` semântico (não `<div>` grid). Screen reader navega normal.
 *   - `aria-rowcount` com o total, `aria-rowindex` em cada linha visível.
 *
 * Limitações conscientes:
 *   - Altura de linha fixa (rowHeight prop). Heterogeneidade exige outra
 *     abordagem (measuring) — fora de escopo v1.
 *   - Sem ordenação interativa (out of scope; vem em spec 008 brushing).
 */

import { useEffect, useRef, useState } from "react";

export interface MunicipioRow {
  cod_ibge: string;
  nome: string;
  /** ID do candidato líder no município. */
  lider: number;
  /** Cor do líder (token CSS). */
  liderCor: string;
  /** Sigla curta do líder pra exibir na coluna "margem". */
  liderNome: string;
  /** Margem em pp (sempre positiva — quem está na frente é `lider`). */
  margemPp: number;
  /** % apurado 0–100. */
  pctApurado: number;
  /** Votos totais reportados no município. */
  votosReportados: number;
}

export interface MunicipioTableProps {
  rows: MunicipioRow[];
  /** Altura do viewport rolável (px). Default 480. */
  height?: number;
  /** Altura de cada linha (px). Default 40. */
  rowHeight?: number;
  /** Linhas extras renderizadas fora da viewport (suaviza scroll). Default 6. */
  overscan?: number;
}

function fmtVotos(v: number): string {
  return new Intl.NumberFormat("pt-BR").format(v);
}

function fmtPct(pct: number): string {
  const r = Math.round(pct * 10) / 10;
  return Number.isInteger(r) ? `${r}%` : `${r.toFixed(1)}%`;
}

export function MunicipioTable({
  rows,
  height = 480,
  rowHeight = 40,
  overscan = 6,
}: MunicipioTableProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [clientHeight, setClientHeight] = useState(height);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setClientHeight(el.clientHeight);
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const total = rows.length;
  const visibleCount = Math.ceil(clientHeight / rowHeight) + overscan * 2;
  const startIndexRaw = Math.floor(scrollTop / rowHeight) - overscan;
  const startIndex = Math.max(0, startIndexRaw);
  const endIndex = Math.min(total, startIndex + visibleCount);
  const slice = rows.slice(startIndex, endIndex);
  const padTop = startIndex * rowHeight;
  const padBottom = (total - endIndex) * rowHeight;

  return (
    <section aria-labelledby="municipios-heading">
      <h3
        id="municipios-heading"
        className="mb-2 text-lg"
        style={{ fontFamily: "var(--font-serif)", color: "var(--color-text)" }}
      >
        Municípios ({total.toLocaleString("pt-BR")})
      </h3>

      <div
        ref={scrollerRef}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: scroller precisa de foco via teclado para acessibilidade
        tabIndex={0}
        className="overflow-y-auto"
        style={{
          height,
          contain: "strict",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <table
          aria-rowcount={total}
          className="w-full border-collapse"
          style={{ tableLayout: "fixed" }}
        >
          <colgroup>
            <col />
            <col style={{ width: "5.5rem" }} />
            <col style={{ width: "5rem" }} />
            <col style={{ width: "6rem" }} />
          </colgroup>
          <thead
            style={{
              backgroundColor: "var(--color-bg-muted)",
              color: "var(--color-text-muted)",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <tr>
              <th
                scope="col"
                className="px-3 py-2 text-left text-xs uppercase tracking-wide font-normal"
              >
                Município
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-right text-xs uppercase tracking-wide font-normal"
              >
                Margem
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-right text-xs uppercase tracking-wide font-normal"
              >
                % apurado
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-right text-xs uppercase tracking-wide font-normal"
              >
                Votos
              </th>
            </tr>
          </thead>
          <tbody>
            {padTop > 0 && (
              <tr style={{ height: padTop }}>
                <td colSpan={4} />
              </tr>
            )}
            {slice.map((m, i) => {
              const rowIndex = startIndex + i + 2; // aria-rowindex 1-based, header é índice 1
              return (
                <tr
                  key={m.cod_ibge}
                  aria-rowindex={rowIndex}
                  style={{
                    height: rowHeight,
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <td className="truncate px-3 text-sm" style={{ color: "var(--color-text)" }}>
                    <span title={m.nome}>{m.nome}</span>
                  </td>
                  <td
                    className="px-3 text-right text-sm tabular-nums"
                    style={{ color: m.liderCor, fontWeight: 500 }}
                  >
                    {m.liderNome} +{fmtPct(m.margemPp)}
                  </td>
                  <td
                    className="px-3 text-right text-sm tabular-nums"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {fmtPct(m.pctApurado)}
                  </td>
                  <td
                    className="px-3 text-right text-sm tabular-nums"
                    style={{ color: "var(--color-text)" }}
                  >
                    {fmtVotos(m.votosReportados)}
                  </td>
                </tr>
              );
            })}
            {padBottom > 0 && (
              <tr style={{ height: padBottom }}>
                <td colSpan={4} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
