"use client";

/**
 * components/blocks/MunicipioWaffleGrid.tsx
 *
 * S06/F4d (Fase 3) — waffle chart de N municípios da UF.
 * Cada quadrado = 1 município, colorido pelo líder.
 *
 * Por que SVG inline (não canvas, não 1 div por município)?
 *   - 645 quadrados (SP) em SVG: ~30–40 KB de markup. Aceitável.
 *   - Canvas perderia acessibilidade (sem nodes). SVG mantém ARIA fallback.
 *   - Cada `<rect>` é leve; tooltip via `<title>` HTML-native (sem JS).
 *
 * Tooltip: `<title>` nativo do SVG aparece no hover do mouse — não
 * funciona em touch. Para v1 é aceitável; v2 (spec 008 brushing) pode
 * trazer tooltip custom.
 *
 * Mobile: container scroll horizontal — caller pode envelopar em
 * `overflow-x-auto`. Componente apenas calcula grid quadrado N×M.
 *
 * Cobertura
 *   - Spec 005 / Print 3 NYT-style ("Municípios da UF").
 *   - ADR-0013 (cores por rank do líder).
 *   - Constituição § 2 (cores via tokens).
 *
 * A11y
 *   - `<svg role="img">` com `<title>` + `<desc>` semânticos.
 *   - Tabela equivalente `sr-only` com nome do município + líder.
 */

import { useMemo } from "react";

import type { EdgeCandidate, EdgeUfMunicipio } from "@/lib/edge-config/types";
import { colorForRank } from "@/lib/utils/cand-color";

export interface MunicipioWaffleGridProps {
  municipios: EdgeUfMunicipio[];
  candidatos: EdgeCandidate[];
  /** Tamanho de cada quadrado (px). Default 12. */
  cell?: number;
  /** Gap entre quadrados (px). Default 2. */
  gap?: number;
  /**
   * Número de colunas. Se omitido, calcula `ceil(sqrt(N))` para grid
   * aproximadamente quadrado.
   */
  cols?: number;
  /**
   * S07/Bloco 2 — tocar num quadrado devolve o `cod_ibge` ao caller
   * (`<MunicipioExplorer>`, que abre a folha do município).
   *
   * O handler fica no `<svg role="img">`, não em cada `<rect>`: um `<svg>`
   * com `role="img"` remove todo o seu interior da árvore de acessibilidade,
   * então 645 handlers individuais não comprariam nenhuma semântica — e
   * comprariam 645 nós a mais no DOM. O alvo real do toque é lido de
   * `data-cod`, atributo que os `<rect>` já emitiam antes desta prop existir.
   *
   * O caminho de teclado e de leitor de tela para o mesmo dado **não** é este
   * gráfico: é a `<MunicipioTable>` que o `<MunicipioExplorer>` renderiza
   * logo abaixo, onde cada município é um `<button>`. Este clique é um atalho
   * de ponteiro sobre uma imagem, não a única porta.
   */
  onSelect?: (codIbge: string) => void;
}

function fmtPct(pct: number): string {
  const r = Math.round(pct * 10) / 10;
  return Number.isInteger(r) ? `${r}%` : `${r.toFixed(1)}%`;
}

export function MunicipioWaffleGrid({
  municipios,
  candidatos,
  cell = 12,
  gap = 2,
  cols: colsProp,
  onSelect,
}: MunicipioWaffleGridProps) {
  const candIndex = useMemo(() => new Map(candidatos.map((c) => [c.id, c] as const)), [candidatos]);

  const N = municipios.length;
  const cols = colsProp ?? Math.max(1, Math.ceil(Math.sqrt(N)));
  const rows = Math.ceil(N / cols);
  const step = cell + gap;
  const width = cols * step - gap;
  const height = rows * step - gap;

  // Agrega contagem por líder (legend)
  const legend = useMemo(() => {
    const counts = new Map<number, number>();
    for (const m of municipios) {
      counts.set(m.lider.candidato_id, (counts.get(m.lider.candidato_id) ?? 0) + 1);
    }
    const out: Array<{ id: number; nome: string; cor: string; count: number }> = [];
    for (const [id, count] of counts) {
      const c = candIndex.get(id);
      out.push({
        id,
        nome: c?.nome ?? `Cand ${id}`,
        cor: c?.cor ?? colorForRank(c?.rank ?? 1),
        count,
      });
    }
    out.sort((a, b) => b.count - a.count);
    return out;
  }, [municipios, candIndex]);

  return (
    <figure aria-labelledby="waffle-title" className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: `role="img"` tira todo
            o interior do SVG da árvore de acessibilidade — este clique é um
            atalho de ponteiro sobre uma imagem, e o caminho de teclado para os
            mesmos municípios é a <MunicipioTable> logo abaixo, onde cada nome
            é um <button>. Ver a doc de `onSelect` acima. */}
        <svg
          role="img"
          aria-labelledby="waffle-title waffle-desc"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          data-testid="waffle-svg"
          style={onSelect ? { cursor: "pointer" } : undefined}
          onClick={
            onSelect
              ? (event) => {
                  const cod = (event.target as Element | null)?.getAttribute?.("data-cod");
                  if (cod) onSelect(cod);
                }
              : undefined
          }
        >
          <title id="waffle-title">{`Mosaico de ${N.toLocaleString("pt-BR")} municípios pelo líder`}</title>
          <desc id="waffle-desc">
            Cada quadrado representa um município. A cor indica o candidato líder daquele município.
            Passe o mouse sobre o quadrado para ver nome e percentual.
          </desc>
          {municipios.map((m, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = col * step;
            const y = row * step;
            const lider = candIndex.get(m.lider.candidato_id);
            const cor = lider?.cor ?? colorForRank(lider?.rank ?? 1);
            return (
              <rect
                key={m.cod_ibge}
                x={x}
                y={y}
                width={cell}
                height={cell}
                fill={cor}
                rx={1}
                data-cod={m.cod_ibge}
              >
                <title>{`${m.nome} — ${lider?.nome ?? `Cand ${m.lider.candidato_id}`} (${
                  lider?.partido ?? "?"
                }) líder · ${fmtPct(m.pct_apurado)} apur`}</title>
              </rect>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <ul className="flex flex-wrap gap-3 text-xs" data-testid="waffle-legend">
        {legend.map((l) => (
          <li
            key={l.id}
            className="flex items-center gap-1.5"
            style={{ color: "var(--color-text)" }}
          >
            <span
              aria-hidden
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: l.cor }}
            />
            <span>
              {l.nome} · {l.count} mun.
            </span>
          </li>
        ))}
      </ul>

      {/* aria fallback: lista textual completa para SR (sr-only) */}
      <table className="sr-only">
        <caption>Municípios e seus líderes</caption>
        <thead>
          <tr>
            <th scope="col">Município</th>
            <th scope="col">Líder</th>
            <th scope="col">% apurado</th>
          </tr>
        </thead>
        <tbody>
          {municipios.map((m) => {
            const lider = candIndex.get(m.lider.candidato_id);
            return (
              <tr key={m.cod_ibge}>
                <td>{m.nome}</td>
                <td>
                  {lider?.nome ?? `Cand ${m.lider.candidato_id}`} ({lider?.partido ?? "?"})
                </td>
                <td>{fmtPct(m.pct_apurado)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </figure>
  );
}
