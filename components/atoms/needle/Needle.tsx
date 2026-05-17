/**
 * components/atoms/needle/Needle.tsx
 *
 * Atom genérico de agulha de probabilidade. Reusable:
 *   - RF-021 (nacional, home) — variação `variant='national'`.
 *   - RF-039 (estadual, UF)   — variação `variant='uf'`.
 *
 * Server Component puro (SVG inline). Sem JS no cliente.
 *
 * Inspiração: agulha NYT estilo The Upshot — semicírculo dividido em bandas
 * (very_likely_B, likely_B, lean_B, tossup, lean_A, likely_A, very_likely_A),
 * com agulha apontando à direita = candidato A favorito, à esquerda =
 * candidato B favorito.
 *
 * `needlePosition` é o output canônico do modelo, em [-1, 1]:
 *   -1 = vitória certa de B (esquerda)
 *    0 = tossup (centro)
 *   +1 = vitória certa de A (direita)
 *
 * `pVitoria` é a probabilidade do líder (0–1). Quando `variant='uf'`, o
 * líder é o candidato A da corrida nesta UF; quando `national`, é o líder
 * nacional.
 *
 * Cores via tokens (constituição § 2). Acessibilidade:
 *   - `role="img"` com `aria-label` descrevendo a probabilidade.
 *   - Texto da probabilidade renderizado dentro do SVG para que screen
 *     readers que não leem aria-label peguem via `<title>`.
 *   - Sem animação por default — respeita reduced-motion por construção.
 */

import type { NeedleBand } from "@/lib/edge-config/types";

export interface NeedleProps {
  /** Posição em [-1, 1]. -1=B certo, 0=tossup, +1=A certo. */
  needlePosition: number;
  /** Banda nominal (para colorir o label, opcional). */
  needleBand?: NeedleBand;
  /** Probabilidade do líder em [0, 1]. */
  pVitoria: number;
  /** Nome do candidato A (favorito quando needlePosition > 0). */
  candidatoA: string;
  /** Nome do candidato B. */
  candidatoB: string;
  /** Variação visual — diferencia chamada ("nacional" vs "estadual"). */
  variant?: "national" | "uf";
  /** Largura do SVG (px). Default 400; mobile pode passar 320. */
  width?: number;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function formatPct(value: number): string {
  const r = Math.round(value * 1000) / 10;
  return `${r}%`;
}

export function Needle({
  needlePosition,
  pVitoria,
  candidatoA,
  candidatoB,
  variant = "national",
  width = 400,
}: NeedleProps) {
  const safePosition = clamp(needlePosition, -1, 1);
  const safeProb = clamp(pVitoria, 0, 1);

  // Geometria: viewBox 400x220, agulha varre semicírculo r=140 centrado em (200, 180).
  const VB_W = 400;
  const VB_H = 220;
  const cx = 200;
  const cy = 180;
  const r = 140;

  // probA = (position + 1) / 2 → mapeia [-1, 1] em [0, 1]
  const probA = (safePosition + 1) / 2;
  const angle = Math.PI * (1 - probA); // 0% = π, 100% = 0
  const needleLen = r - 12;
  const tipX = cx + needleLen * Math.cos(angle);
  const tipY = cy - needleLen * Math.sin(angle);

  // Arcos por banda — espelhados em torno de 50% (lado B = 0–0.5, lado A = 0.5–1).
  const arc = (from: number, to: number, color: string, key: string) => {
    const a0 = Math.PI * (1 - from);
    const a1 = Math.PI * (1 - to);
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy - r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy - r * Math.sin(a1);
    return (
      <path
        key={key}
        d={`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`}
        fill="none"
        stroke={color}
        strokeWidth="22"
        strokeLinecap="butt"
      />
    );
  };

  const label = variant === "uf" ? "Forecast estadual" : "Forecast nacional";
  const favorito = safePosition >= 0 ? candidatoA : candidatoB;
  const ariaLabel = `${label}: ${favorito} com ${formatPct(safeProb)} de chance.`;
  const height = Math.round((VB_H / VB_W) * width);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      role="img"
      aria-label={ariaLabel}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{ariaLabel}</title>

      {/* Arcos das 7 bandas — B à esquerda, A à direita */}
      {arc(0.0, 0.05, "var(--color-text)", "vlb")}
      {arc(0.05, 0.25, "var(--color-pl-band)", "lb1")}
      {arc(0.25, 0.4, "var(--color-pl-band)", "lb2")}
      {arc(0.4, 0.6, "var(--color-tossup)", "tossup")}
      {arc(0.6, 0.75, "var(--color-pt-band)", "la1")}
      {arc(0.75, 0.95, "var(--color-pt-band)", "la2")}
      {arc(0.95, 1.0, "var(--color-text)", "vla")}

      {/* Tick 50/50 */}
      <line
        x1={cx}
        x2={cx}
        y1={cy - r - 14}
        y2={cy - r + 14}
        stroke="var(--color-text)"
        strokeWidth="2"
      />
      <text
        x={cx}
        y={cy - r - 20}
        fontSize="11"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-muted)"
        textAnchor="middle"
        fontWeight="600"
      >
        50 / 50
      </text>

      {/* Rótulos laterais */}
      <text
        x={cx - r - 4}
        y={cy + 6}
        fontSize="11"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-muted)"
        textAnchor="end"
      >
        {candidatoB}
      </text>
      <text
        x={cx + r + 4}
        y={cy + 6}
        fontSize="11"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-muted)"
      >
        {candidatoA}
      </text>

      {/* Agulha */}
      <line
        x1={cx}
        y1={cy}
        x2={tipX}
        y2={tipY}
        stroke="var(--color-text)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={8} fill="var(--color-text)" />
      <circle cx={cx} cy={cy} r={3} fill="var(--color-bg)" />

      {/* Probabilidade */}
      <text
        x={cx}
        y={cy + 32}
        fontSize="13"
        fontFamily="var(--font-sans)"
        fill="var(--color-text)"
        textAnchor="middle"
        fontWeight="600"
      >
        {favorito}: {formatPct(safeProb)} de chance
      </text>
    </svg>
  );
}
