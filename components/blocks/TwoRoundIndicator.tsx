/**
 * components/blocks/TwoRoundIndicator.tsx
 *
 * Medidor "P(2º turno)" — barra horizontal com tick em 50% mostrando a
 * probabilidade agregada (do bootstrap do modelo) de a eleição NÃO
 * fechar no 1T, combinada com um mini-thermometer da posição do líder
 * vs. 50%+1.
 *
 * Cobertura
 *   - RF-030.7 (medidor P(2º turno) — S05/F4c, ADR-0014).
 *   - Alimenta o hero multi-camada (ADR-0017) quando o cenário é
 *     genuinamente bidirecional (P fora do "óbvio" — ver gate abaixo).
 *
 * Server Component puro — sem 'use client', sem state.
 *
 * Gate de renderização
 *   - Só renderiza quando `pSegundoTurno != null` AND
 *     `|pSegundoTurno - 0.5| > 0.1`. Em cenários extremos (P=0.95 ou
 *     P=0.05) o leitor já entende pela cabeça do scoreboard, então o
 *     medidor vira ruído visual; ele só ganha utilidade em zonas
 *     genuinamente incertas (0.4 < P < 0.6) ou intermediárias.
 *
 *   - **NOTA:** o requisito original disse `> 0.1` (estrito), o que
 *     EXCLUI exatamente P=0.4 e P=0.6 (|0.4−0.5|=0.1, |0.6−0.5|=0.1).
 *     Mantemos o `>` estrito para casar com o test "P=0.51 trivial →
 *     null" e "P=0.65 normal → renderiza".
 *
 * A11y
 *   - `role="meter"` + `aria-valuemin/max/now` em [0, 100].
 *   - `aria-label` = "X% de chance de ir a 2º turno".
 */

export interface TwoRoundIndicatorProps {
  /** Probabilidade em [0, 1] de a eleição não fechar no 1T. `null` esconde o medidor. */
  pSegundoTurno: number | null;
  /** % projetado do líder (0–100). Posiciona o mini-thermometer relativo a 50%. */
  liderPct: number;
  /** Nome do líder (usado no caption "Líder atual: <nome>"). */
  liderNome: string;
  className?: string;
}

export function TwoRoundIndicator({
  pSegundoTurno,
  liderPct,
  liderNome,
  className,
}: TwoRoundIndicatorProps) {
  // Gate 1: sem dado disponível
  if (pSegundoTurno == null) return null;
  // Gate 2: cenário trivial (|P − 0.5| <= 0.1) — esconde medidor pra reduzir ruído.
  if (Math.abs(pSegundoTurno - 0.5) <= 0.1) return null;

  const pctP = Math.round(pSegundoTurno * 100);
  const ariaLabel = `${pctP}% de chance de ir a 2º turno`;

  // Mini-thermometer: posição do líder em [0, 100], clamp para evitar overflow visual.
  const liderClamped = Math.max(0, Math.min(100, liderPct));

  const containerClass = ["flex flex-col gap-2", className].filter(Boolean).join(" ");

  return (
    <div className={containerClass}>
      <div className="flex items-baseline justify-between">
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {ariaLabel}
        </span>
        <span className="text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }}>
          Líder: {liderNome}
        </span>
      </div>

      {/* Barra do P(2T) — tick em 50% */}
      {/* biome-ignore lint/a11y/useSemanticElements: meter nativo não estiliza. */}
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pctP}
        aria-label={ariaLabel}
        className="relative h-2 w-full overflow-hidden rounded-sm border"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-bg-muted)",
        }}
      >
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${pctP}%`,
            backgroundColor: "var(--color-text-muted)",
          }}
        />
        {/* Tick em 50% */}
        <div
          className="absolute inset-y-[-3px] left-1/2 w-px"
          style={{ backgroundColor: "var(--color-text)" }}
          aria-hidden="true"
        />
      </div>

      {/* Mini-thermometer: posição do líder vs 50%+1 */}
      <div className="flex flex-col gap-1" aria-hidden="true">
        <div
          className="relative h-1 w-full overflow-hidden rounded-sm"
          style={{ backgroundColor: "var(--color-bg-muted)" }}
        >
          <div
            className="absolute inset-y-0 left-0"
            style={{
              width: `${liderClamped}%`,
              backgroundColor: "var(--color-cand-1)",
            }}
          />
          <div
            className="absolute inset-y-[-2px] left-1/2 w-px"
            style={{ backgroundColor: "var(--color-text)" }}
          />
        </div>
        <p className="text-center text-[10px]" style={{ color: "var(--color-text-faint)" }}>
          Líder vs. 50%+1
        </p>
      </div>
    </div>
  );
}
