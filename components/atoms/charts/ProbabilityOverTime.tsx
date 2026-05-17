/**
 * components/atoms/charts/ProbabilityOverTime.tsx
 *
 * RF-041 (Should) — Line chart de `p_vitoria` do líder ao longo do tempo.
 *
 * Server Component (SVG inline). Y-axis fixo em [0, 1] (probabilidade).
 * Linha de 50% destacada (limiar de empate).
 */

import type { CSSProperties } from "react";

export interface ProbabilityPoint {
  ts: string;
  pVitoria: number; // [0, 1]
}

export interface ProbabilityOverTimeProps {
  points: ProbabilityPoint[];
  liderNome: string;
  liderCor: string;
  width?: number;
  height?: number;
}

export function ProbabilityOverTime({
  points,
  liderNome,
  liderCor,
  width = 480,
  height = 200,
}: ProbabilityOverTimeProps) {
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
        <span className="text-sm">Probabilidade ainda insuficiente para série</span>
      </div>
    );
  }

  const padX = 32;
  const padY = 20;
  const innerW = width - 2 * padX;
  const innerH = height - 2 * padY;

  const xFor = (i: number) => padX + (i / (points.length - 1)) * innerW;
  const yFor = (v: number) => padY + (1 - Math.max(0, Math.min(1, v))) * innerH;

  const path = `M ${points
    .map((p, i) => `${xFor(i).toFixed(1)},${yFor(p.pVitoria).toFixed(1)}`)
    .join(" L ")}`;

  const lastPoint = points[points.length - 1];
  if (!lastPoint) return null;
  const lastY = yFor(lastPoint.pVitoria);
  const lastX = xFor(points.length - 1);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Probabilidade de vitória de ${liderNome} ao longo do tempo: última leitura ${Math.round(
        lastPoint.pVitoria * 100,
      )}%.`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Linha 50% */}
      <line
        x1={padX}
        x2={width - padX}
        y1={yFor(0.5)}
        y2={yFor(0.5)}
        stroke="var(--color-border)"
        strokeDasharray="3,3"
      />
      <text
        x={padX - 4}
        y={yFor(0.5) + 3}
        fontSize="9"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-faint)"
        textAnchor="end"
      >
        50%
      </text>
      <text
        x={padX - 4}
        y={yFor(1) + 3}
        fontSize="9"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-faint)"
        textAnchor="end"
      >
        100%
      </text>
      <text
        x={padX - 4}
        y={yFor(0) + 3}
        fontSize="9"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-faint)"
        textAnchor="end"
      >
        0%
      </text>

      <path d={path} fill="none" stroke={liderCor} strokeWidth="2" />
      <circle cx={lastX} cy={lastY} r={3.5} fill={liderCor} />
    </svg>
  );
}
