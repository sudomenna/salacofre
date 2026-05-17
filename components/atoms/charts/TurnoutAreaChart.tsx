/**
 * components/atoms/charts/TurnoutAreaChart.tsx
 *
 * RF-042 (Should) — Area chart de turnout cumulativo da UF ao longo do tempo.
 *
 * Server Component (SVG inline). Y-axis em % apurado [0, 100]. Função
 * monotônica não-decrescente.
 */

import type { CSSProperties } from "react";

export interface TurnoutPoint {
  ts: string;
  pctApurado: number; // 0–100
}

export interface TurnoutAreaChartProps {
  points: TurnoutPoint[];
  width?: number;
  height?: number;
}

export function TurnoutAreaChart({ points, width = 480, height = 200 }: TurnoutAreaChartProps) {
  if (points.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed"
        style={
          {
            borderColor: "var(--color-border)",
            color: "var(--color-text-muted)",
            minHeight: 160,
          } as CSSProperties
        }
      >
        <span className="text-sm">Turnout ainda insuficiente para série</span>
      </div>
    );
  }

  const padX = 32;
  const padY = 20;
  const innerW = width - 2 * padX;
  const innerH = height - 2 * padY;

  const xFor = (i: number) => padX + (i / (points.length - 1)) * innerW;
  const yFor = (v: number) => padY + ((100 - Math.max(0, Math.min(100, v))) / 100) * innerH;

  const linePath = `M ${points
    .map((p, i) => `${xFor(i).toFixed(1)},${yFor(p.pctApurado).toFixed(1)}`)
    .join(" L ")}`;

  const areaPath = `${linePath} L ${xFor(points.length - 1).toFixed(1)},${yFor(0).toFixed(
    1,
  )} L ${xFor(0).toFixed(1)},${yFor(0).toFixed(1)} Z`;

  const lastPoint = points[points.length - 1];
  if (!lastPoint) return null;

  return (
    <div>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Turnout cumulativo: ${lastPoint.pctApurado.toFixed(1)}% apurado.`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d={areaPath} fill="var(--color-success)" opacity={0.18} />
        <path d={linePath} fill="none" stroke="var(--color-success)" strokeWidth="2" />

        {/* Ticks Y */}
        <text
          x={padX - 4}
          y={yFor(0) + 3}
          fontSize="9"
          fontFamily="var(--font-sans)"
          fill="var(--color-text-muted)"
          textAnchor="end"
        >
          0%
        </text>
        <text
          x={padX - 4}
          y={yFor(50) + 3}
          fontSize="9"
          fontFamily="var(--font-sans)"
          fill="var(--color-text-muted)"
          textAnchor="end"
        >
          50%
        </text>
        <text
          x={padX - 4}
          y={yFor(100) + 3}
          fontSize="9"
          fontFamily="var(--font-sans)"
          fill="var(--color-text-muted)"
          textAnchor="end"
        >
          100%
        </text>
      </svg>
      {/* Fallback acessível (a11y RNF-023): tabela com a série completa. */}
      <table className="sr-only">
        <caption>Série temporal de turnout cumulativo (% apurado)</caption>
        <thead>
          <tr>
            <th scope="col">Tempo</th>
            <th scope="col">% Apurado</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.ts}>
              <td>{p.ts}</td>
              <td>{p.pctApurado.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
