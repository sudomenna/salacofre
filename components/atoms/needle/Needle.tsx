/**
 * components/atoms/needle/Needle.tsx
 *
 * Atom genérico de agulha de probabilidade. Reusable:
 *   - RF-021 (nacional, home) — variantes `variant='national-1t'` (multi-candidato
 *     1T, mede P(decisão no 1T)) e `variant='national-2t'` (duelo binário).
 *   - RF-039 (estadual, UF)   — variante `variant='uf'` (forecast estadual).
 *
 * Server Component puro (SVG inline). Sem JS no cliente.
 *
 * Variantes semânticas (S05/F3B — refator)
 *   - `national-1t`: agulha mede **P(decisão no 1T)**. Polo esquerdo = "2º turno";
 *     polo direito = "Decide 1T (<lider>)". Arcos do fundo usam tokens neutros
 *     (`--color-band-tossup`, `--color-band-lean`, `--color-band-likely`,
 *     `--color-band-very_likely`) — não usa cores partidárias/por-rank.
 *   - `national-2t`: duelo binário A×B (P(A>B)). Arcos usam tokens dos top-2
 *     ranks (`colorForRank(1)` à direita, `colorForRank(2)` à esquerda).
 *   - `uf`: idem `national-2t` mas com label "Forecast estadual".
 *
 * `needlePosition` é o output canônico do modelo, em [-1, 1]:
 *   -1 = certeza de 2T / vitória certa de B (esquerda)
 *    0 = tossup (centro)
 *   +1 = decide 1T / vitória certa de A (direita)
 *
 * `pVitoria` é a probabilidade do líder (0–1). Em `national-1t` representa
 * P(decisão no 1T) = 1 − P(2T).
 *
 * Cores via tokens (constituição § 2). Acessibilidade:
 *   - `role="img"` com `aria-label` descrevendo a probabilidade.
 *   - Texto da probabilidade renderizado dentro do SVG para que screen
 *     readers que não leem aria-label peguem via `<title>`.
 *   - Sem animação por default — respeita reduced-motion por construção.
 */

import type { NeedleBand } from "@/lib/edge-config/types";
import { colorForRank } from "@/lib/utils/cand-color";

/**
 * Variantes semânticas:
 *   - `"national-1t"`: medidor P(decisão no 1T) — arcos neutros, polos
 *     "2º turno" / "Decide 1T (<lider>)".
 *   - `"national-2t"`: duelo binário top-2 — arcos por rank.
 *   - `"uf"`: idêntico a `national-2t` mas com label "Forecast estadual".
 *   - `"national"` (legacy alias S04, removido em S05/F4): mantido aqui só
 *     pra retrocompat — comporta-se como `national-2t`.
 */
export type NeedleVariant = "national-1t" | "national-2t" | "uf" | "national";

export interface NeedleProps {
  /** Posição em [-1, 1]. -1=B certo / 2T certo, 0=tossup, +1=A certo / 1T certo. */
  needlePosition: number;
  /** Banda nominal (para colorir o label, opcional). */
  needleBand?: NeedleBand;
  /** Probabilidade do líder em [0, 1] (em national-1t = P(decisão no 1T)). */
  pVitoria: number;
  /** Nome do candidato A (favorito quando needlePosition > 0). Em national-1t = líder. */
  candidatoA: string;
  /** Nome do candidato B. Em national-1t, este label é trocado por "2º turno". */
  candidatoB: string;
  /** Variante visual + semântica. Default `"national-2t"` (S05+). */
  variant?: NeedleVariant;
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
  variant = "national-2t",
  width = 400,
}: NeedleProps) {
  const safePosition = clamp(needlePosition, -1, 1);
  const safeProb = clamp(pVitoria, 0, 1);

  // Variantes:
  //   national-1t → arcos neutros (P(decisão no 1T)), labels "2º turno" / "Decide 1T (lider)"
  //   national-2t / uf / national (legacy) → arcos por rank top-2, labels = nomes
  const isMulti1T = variant === "national-1t";
  // Cor por rank (top-2). `colorForRank(1)` é o líder (lado direito), `colorForRank(2)` é o segundo (lado esquerdo).
  const rightColor = isMulti1T ? "var(--color-band-very_likely)" : colorForRank(1);
  const leftColor = isMulti1T ? "var(--color-band-very_likely)" : colorForRank(2);
  // Bandas intermediárias — em multi-1t, gradiente neutro; em duelo, "band" do rank.
  const rightBandColor = isMulti1T ? "var(--color-band-likely)" : "var(--color-cand-band-1)";
  const leftBandColor = isMulti1T ? "var(--color-band-likely)" : "var(--color-cand-band-2)";
  const tossupColor = isMulti1T ? "var(--color-band-tossup)" : "var(--color-tossup)";

  // Labels laterais
  const leftLabel = isMulti1T ? "2º turno" : candidatoB;
  const rightLabel = isMulti1T ? `Decide 1T (${candidatoA})` : candidatoA;

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
  // Em multi-1t, "favorito" semântico passa a ser o líder (sempre A); a agulha
  // mede P(1T fechado pelo líder) vs P(2T). Em duelo, mantém A/B por posição.
  const favorito = isMulti1T ? candidatoA : safePosition >= 0 ? candidatoA : candidatoB;
  const ariaLabel = isMulti1T
    ? `${label}: ${formatPct(safeProb)} de chance de decisão no 1º turno (${candidatoA}).`
    : `${label}: ${favorito} com ${formatPct(safeProb)} de chance.`;
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

      {/* Arcos das 7 bandas — esquerda (B/2T) → direita (A/1T fechado).
          national-1t: bandas neutras (band-tossup/lean/likely/very_likely).
          national-2t/uf: bandas por rank — cor sólida nas pontas, band clara nos meios. */}
      {arc(0.0, 0.05, leftColor, "vlb")}
      {arc(0.05, 0.25, leftBandColor, "lb1")}
      {arc(0.25, 0.4, leftBandColor, "lb2")}
      {arc(0.4, 0.6, tossupColor, "tossup")}
      {arc(0.6, 0.75, rightBandColor, "la1")}
      {arc(0.75, 0.95, rightBandColor, "la2")}
      {arc(0.95, 1.0, rightColor, "vla")}

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

      {/* Rótulos laterais — em multi-1t, "2º turno" (esq) / "Decide 1T (líder)" (dir) */}
      <text
        x={cx - r - 4}
        y={cy + 6}
        fontSize="11"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-muted)"
        textAnchor="end"
      >
        {leftLabel}
      </text>
      <text
        x={cx + r + 4}
        y={cy + 6}
        fontSize="11"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-muted)"
      >
        {rightLabel}
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

      {/* Probabilidade — em multi-1t descreve "decide 1T"; em duelo, vitória do favorito. */}
      <text
        x={cx}
        y={cy + 32}
        fontSize="13"
        fontFamily="var(--font-sans)"
        fill="var(--color-text)"
        textAnchor="middle"
        fontWeight="600"
      >
        {isMulti1T
          ? `${formatPct(safeProb)} de chance de decisão no 1T`
          : `${favorito}: ${formatPct(safeProb)} de chance`}
      </text>
    </svg>
  );
}
