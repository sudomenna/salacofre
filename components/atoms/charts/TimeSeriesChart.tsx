/**
 * components/atoms/charts/TimeSeriesChart.tsx
 *
 * RF-040 (Should) — Line chart da margem do líder ao longo do tempo desde 17h.
 *
 * Server Component (SVG inline). Sem D3, sem Recharts — escala feita
 * inline com aritmética simples (constituição § 9 / RNF-007: bundle).
 *
 * Quando o payload `EdgePayloadUf` não traz `series_temporais` ainda, o
 * caller passa uma lista vazia ou stub; renderizamos placeholder gentil.
 */

import type { CSSProperties } from "react";

export interface TimeSeriesPoint {
  /** Timestamp ISO. */
  ts: string;
  /** Margem em pp (positivo = líder à frente). */
  margemPp: number;
}

export interface TimeSeriesChartProps {
  /** Pontos ordenados cronologicamente. */
  points: TimeSeriesPoint[];
  /** Nome do líder (para aria-label / título). */
  liderNome: string;
  /** Cor da linha (token CSS). */
  liderCor: string;
  width?: number;
  height?: number;
}

function emptyState(title: string): React.ReactNode {
  return (
    <div
      className="flex h-full items-center justify-center rounded-md border border-dashed"
      style={
        {
          borderColor: "var(--color-border)",
          color: "var(--color-text-muted)",
          minHeight: 160,
        } as CSSProperties
      }
    >
      <span className="text-sm">{title}</span>
    </div>
  );
}

export function TimeSeriesChart({
  points,
  liderNome,
  liderCor,
  width = 480,
  height = 200,
}: TimeSeriesChartProps) {
  if (points.length < 2) {
    return emptyState("Série temporal ainda insuficiente");
  }

  const padX = 32;
  const padY = 20;
  const innerW = width - 2 * padX;
  const innerH = height - 2 * padY;

  const xs = points.map((_, i) => i);
  const ys = points.map((p) => p.margemPp);
  const yMin = Math.min(...ys, 0);
  const yMax = Math.max(...ys, 1);
  const yRange = yMax - yMin || 1;

  const xFor = (i: number) => padX + (xs.length > 1 ? (i / (xs.length - 1)) * innerW : innerW / 2);
  const yFor = (v: number) => padY + ((yMax - v) / yRange) * innerH;

  const path = `M ${points
    .map((p, i) => `${xFor(i).toFixed(1)},${yFor(p.margemPp).toFixed(1)}`)
    .join(" L ")}`;

  const lastPoint = points[points.length - 1];
  if (!lastPoint) {
    return emptyState("Série temporal vazia");
  }
  const lastY = yFor(lastPoint.margemPp);
  const lastX = xFor(points.length - 1);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Margem de ${liderNome} ao longo do tempo: último valor ${lastPoint.margemPp.toFixed(
        1,
      )} pontos percentuais.`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Eixo zero */}
      <line
        x1={padX}
        x2={width - padX}
        y1={yFor(0)}
        y2={yFor(0)}
        stroke="var(--color-border)"
        strokeDasharray="3,3"
      />
      {/* Linha */}
      <path d={path} fill="none" stroke={liderCor} strokeWidth="2" />
      {/* Último ponto */}
      <circle cx={lastX} cy={lastY} r={3.5} fill={liderCor} />

      {/* Labels */}
      <text
        x={padX}
        y={padY - 6}
        fontSize="10"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-muted)"
      >
        +{yMax.toFixed(0)}pp
      </text>
      <text
        x={padX}
        y={height - 4}
        fontSize="10"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-muted)"
      >
        {yMin.toFixed(0)}pp
      </text>
    </svg>
  );
}
