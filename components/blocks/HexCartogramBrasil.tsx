/**
 * components/blocks/HexCartogramBrasil.tsx
 *
 * S06/F4d (Fase 3) — cartograma hexagonal das 27 UFs (Brasil), NYT-like.
 *
 * SVG inline (sem MapLibre, sem PMTiles) — atende RNF-007a (bundle
 * above-the-fold) e mantém o componente "free of heavy deps". Cada hex
 * é pintado pela cor do líder via `colorForRank(rank do líder)`. Quando
 * `bucket === "indefinido"` (apuração baixa), usa fill cinza neutro.
 *
 * Server Component — link via `<a href>` (sem onClick), permitindo
 * navegação SSR-friendly. Hover puro CSS (sem JS).
 *
 * Cobertura
 *   - Spec 005 (visão alternativa `/governador` cartograma).
 *   - Constituição § 2 (cores via tokens; UFs visualmente iguais).
 *   - ADR-0013 / ADR-0017.
 *
 * A11y
 *   - `<svg role="img">` com `aria-labelledby` ↔ <title>.
 *   - Cada hex agrupado em `<a>` com `aria-label` semântico.
 */

import Link from "next/link";
import { gridBounds, hexCenter, hexPoints, UF_HEX_POSITIONS } from "@/lib/data/uf-hex-layout";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";
import { colorForRank } from "@/lib/utils/cand-color";

export interface HexCartogramBrasilProps {
  rows: EdgeUfRow[];
  candidatos: EdgeCandidate[];
  /** Raio do hex em unidades SVG. Default 26. */
  hexRadius?: number;
}

function fillFor(uf: EdgeUfRow, candIndex: Map<number, EdgeCandidate>): string {
  if (uf.bucket === "indefinido") {
    return "var(--color-cand-other)";
  }
  const lider = candIndex.get(uf.lider);
  return lider?.cor ?? colorForRank(lider?.rank ?? 1);
}

export function HexCartogramBrasil({ rows, candidatos, hexRadius = 26 }: HexCartogramBrasilProps) {
  const candIndex = new Map(candidatos.map((c) => [c.id, c] as const));
  const rowsBySigla = new Map(rows.map((r) => [r.sigla, r] as const));
  const { width, height } = gridBounds(hexRadius);

  return (
    <figure className="w-full" aria-labelledby="hex-cartogram-title">
      <svg
        role="img"
        aria-labelledby="hex-cartogram-title hex-cartogram-desc"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-auto"
      >
        <title id="hex-cartogram-title">
          Mapa do Brasil em hexágonos — 27 UFs, cores por líder da corrida
        </title>
        <desc id="hex-cartogram-desc">
          Cada hexágono representa uma unidade da federação com tamanho igual. A cor indica o
          candidato líder; cinza indica corrida ainda indefinida.
        </desc>
        {Object.entries(UF_HEX_POSITIONS).map(([sigla, pos]) => {
          const uf = rowsBySigla.get(sigla);
          const { x, y } = hexCenter(pos, hexRadius);
          const pts = hexPoints(x, y, hexRadius);
          const fill = uf ? fillFor(uf, candIndex) : "var(--color-bg-muted)";
          const lider = uf ? candIndex.get(uf.lider) : undefined;
          const partidoLabel = lider?.partido ?? "";
          const ariaText = uf
            ? `${sigla}${lider ? `, líder ${lider.nome} (${lider.partido})` : ""}`
            : `${sigla}, sem dados`;
          const href = `/uf/${sigla.toLowerCase()}/governador`;
          // Cor do texto: branco se rank 1..2 (fundo escuro), preto se rank >=3.
          const rank = lider?.rank ?? 99;
          const textFill =
            uf?.bucket === "indefinido" || rank >= 3 ? "var(--color-text)" : "#ffffff";

          return (
            <g key={sigla}>
              <Link href={href} aria-label={ariaText}>
                <polygon
                  points={pts}
                  fill={fill}
                  stroke="var(--color-bg)"
                  strokeWidth={1.5}
                  style={{ cursor: "pointer" }}
                />
                <text
                  x={x}
                  y={y - 2}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill={textFill}
                  style={{ fontFamily: "var(--font-serif)", pointerEvents: "none" }}
                >
                  {sigla}
                </text>
                {partidoLabel && (
                  <text
                    x={x}
                    y={y + 10}
                    textAnchor="middle"
                    fontSize={8}
                    fill={textFill}
                    style={{ fontFamily: "var(--font-sans)", pointerEvents: "none" }}
                  >
                    {partidoLabel}
                  </text>
                )}
              </Link>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
