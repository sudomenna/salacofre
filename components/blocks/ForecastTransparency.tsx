/**
 * components/blocks/ForecastTransparency.tsx
 *
 * Bloco "O que está movendo o forecast" — exigência constitucional § 8
 * ("Bloco 'O que está movendo o forecast' presente em toda página com
 * projeção") e RF-043 das specs 003 (home) e 004 (página de UF).
 *
 * Renderiza, de forma puramente presentacional, a composição do forecast em
 * dois eixos:
 *   - Modelo:    contribuição do swing histórico / bootstrap (= 100 - pctApurado)
 *   - Apuração:  contribuição dos dados reais do TSE no momento (= pctApurado)
 *
 * Antes de qualquer apuração: barra Modelo cheia (100%) e Apuração zerada.
 * Conforme as urnas chegam: Modelo encolhe enquanto Apuração cresce, até
 * inverter por completo no fim da apuração.
 *
 * Server Component — sem state, sem hooks, sem 'use client'. Renderização
 * determinística do prop `pctApurado` (transparência metodológica § 8).
 *
 * Cores:
 *   - Apuração → `--color-success` (verde discreto, "dado real")
 *   - Modelo   → `--color-text-muted` (cinza médio, "estimativa")
 *   NUNCA cores partidárias (constituição § 2).
 *
 * A11y (RNF-022, RNF-024, RNF-025, RNF-026):
 *   - Cada barra tem role="meter" + aria-valuemin/max/now e aria-label
 *     descrevendo o que ela representa.
 *   - Cabeçalho é <h3> → screen readers anunciam como heading.
 *   - Nenhuma animação default → respeita reduced-motion por construção.
 */

import type { CSSProperties } from "react";

export interface ForecastTransparencyProps {
  /** Percentual apurado da corrida (0–100). Vem de `EdgePayload.pct_apurado_total`. */
  pctApurado: number;
  /**
   * Variante de rótulo:
   *   - 'national' (default) → "O que está movendo o forecast"
   *   - 'uf'                 → "O que está movendo o forecast estadual"
   */
  variant?: "national" | "uf";
  /** Classes adicionais para o container externo. */
  className?: string;
}

/**
 * Normaliza o número para o intervalo [0, 100]. O EdgePayload já entrega em
 * [0, 100] por contrato (lib/edge-config/types.ts § "pct_apurado_total"),
 * mas defendemos a borda — `NaN`, negativos e overflow viram 0 ou 100.
 */
function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

/**
 * Arredonda para 1 casa decimal quando o valor não é inteiro — evita
 * "33.333333%" no rótulo numérico. Mantém inteiro quando exato (ex. 50%).
 */
function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

interface BarRowProps {
  label: string;
  pct: number;
  color: string;
  ariaLabel: string;
}

function BarRow({ label, pct, color, ariaLabel }: BarRowProps) {
  const trackStyle: CSSProperties = {
    backgroundColor: "var(--color-bg-muted)",
    borderColor: "var(--color-border)",
  };
  const fillStyle: CSSProperties = {
    width: `${pct}%`,
    backgroundColor: color,
  };
  return (
    <div className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-3">
      <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </span>
      {/*
       * Meter custom: o `<meter>` nativo do HTML não é estilizável o
       * suficiente para a barra NYT-style (cores via tokens, largura
       * controlada). Mantemos `role="meter"` num <div> e expomos
       * aria-valuemin/max/now + aria-label — o leitor de tela anuncia
       * idêntico ao elemento nativo (RNF-022, RNF-024).
       */}
      {/* biome-ignore lint/a11y/useSemanticElements: meter nativo não é estilizável o bastante. */}
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={ariaLabel}
        className="relative h-3 w-full overflow-hidden rounded-sm border"
        style={trackStyle}
      >
        <div className="h-full" style={fillStyle} />
      </div>
      <span
        className="text-right text-sm font-medium tabular-nums"
        style={{ color: "var(--color-text)" }}
      >
        {formatPercent(pct)}
      </span>
    </div>
  );
}

export function ForecastTransparency({
  pctApurado,
  variant = "national",
  className,
}: ForecastTransparencyProps) {
  const pctReal = clampPercent(pctApurado);
  const pctModel = 100 - pctReal;

  const heading =
    variant === "uf" ? "O que está movendo o forecast estadual" : "O que está movendo o forecast";

  const containerClass = ["w-full max-w-[480px]", className].filter(Boolean).join(" ");

  return (
    <section aria-labelledby="forecast-transparency-heading" className={containerClass}>
      <h3
        id="forecast-transparency-heading"
        className="mb-3 text-lg"
        style={{ fontFamily: "var(--font-serif)", color: "var(--color-text)" }}
      >
        {heading}
      </h3>
      <div className="flex flex-col gap-2">
        <BarRow
          label="Modelo"
          pct={pctModel}
          color="var(--color-text-muted)"
          ariaLabel={`Modelo contribui ${formatPercent(pctModel)}`}
        />
        <BarRow
          label="Apuração"
          pct={pctReal}
          color="var(--color-success)"
          ariaLabel={`Apuração contribui ${formatPercent(pctReal)}`}
        />
      </div>
    </section>
  );
}
