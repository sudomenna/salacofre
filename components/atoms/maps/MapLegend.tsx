/**
 * components/atoms/maps/MapLegend.tsx
 *
 * Legenda divergente do coroplético — design system Atlas Menna (ADR-0025,
 * Bloco 1). Portado de `docs/design-system/atlas-menna/components/data/MapLegend.jsx`.
 *
 * Cinco degraus de margem por lado (0–3, 3–8, 8–15, 15–30, 30+ pp), empate no
 * centro, mais a chave de "sem apuração" (`--map-uncounted`). Os degraus são
 * os mesmos que o MapLibre pinta — quem monta as duas rampas é o caller, não
 * este átomo.
 *
 * Server Component puro — zero JS novo (RNF-007a). Não importa MapLibre nem
 * PMTiles: é só CSS, e pode renderizar no SSR ao lado de um mapa que só
 * aparece depois via `next/dynamic({ ssr: false })` (ADR-0010).
 *
 * Divergências deliberadas em relação ao `.jsx` do kit:
 *   - o kit lia `--party-pt-1..5`, `--party-pl-1..5` e `--party-tie` direto.
 *     Nenhum desses tokens existe hoje em `app/globals.css` — a paleta é do
 *     ADR-0024 e chega por `lib/utils/party-color.ts` (outro agente). Um
 *     `var()` sem fallback para token inexistente renderiza a legenda inteira
 *     transparente, em silêncio. Por isso as rampas são **props obrigatórias**:
 *     o átomo não tem opinião sobre partido (constituição § 2), e não há como
 *     ele ficar invisível por token faltante.
 *   - `role="img"` + `aria-label` descrevendo a escala: uma fileira de
 *     quadradinhos coloridos não diz nada a leitor de tela (RNF-022/023).
 *   - texto em `--type-data` (11px) em vez do `fontSize: 10` cravado do kit.
 */

import type { CSSProperties } from "react";

export interface MapLegendProps {
  /** Rótulo da ponta esquerda — ex. "Lula" ou "PT". */
  leftLabel: string;
  /** Rótulo da ponta direita. */
  rightLabel: string;
  /** Rampa esquerda, do degrau mais forte (borda) ao mais fraco (centro). */
  leftColors: readonly string[];
  /** Rampa direita, do degrau mais forte (borda) ao mais fraco (centro). */
  rightColors: readonly string[];
  /** Cor do empate, no centro da escala. */
  tieColor?: string;
  /** Maior margem rotulada nas pontas, em pp. Default 30. */
  maxMargin?: number;
  /** Cor de município/UF sem apuração. */
  uncountedColor?: string;
  uncountedLabel?: string;
  className?: string;
  style?: CSSProperties;
}

/** Empate: cinza neutro — nenhum partido é dono do empate (constituição § 2). */
export const MAP_LEGEND_TIE_COLOR = "var(--party-tie, var(--color-tossup))";

export function mapLegendLabel(
  leftLabel: string,
  rightLabel: string,
  maxMargin: number,
  uncountedLabel: string,
): string {
  return (
    `Escala de margem: ${leftLabel} até ${maxMargin} pontos à esquerda, ` +
    `empate no centro, ${rightLabel} até ${maxMargin} pontos à direita. ` +
    `Cor neutra: ${uncountedLabel}.`
  );
}

export function MapLegend({
  leftLabel,
  rightLabel,
  leftColors,
  rightColors,
  tieColor = MAP_LEGEND_TIE_COLOR,
  maxMargin = 30,
  uncountedColor = "var(--map-uncounted)",
  uncountedLabel = "sem apuração",
  className,
  style,
}: MapLegendProps) {
  return (
    <div
      role="img"
      aria-label={mapLegendLabel(leftLabel, rightLabel, maxMargin, uncountedLabel)}
      data-testid="map-legend"
      className={className}
      style={{ display: "grid", gap: "var(--space-2)", ...style }}
    >
      <div className="flex items-center" style={{ gap: 2 }}>
        {leftColors.map((c) => (
          <span
            key={`left-${c}`}
            data-testid="map-legend-step"
            data-side="left"
            className="flex-1"
            style={{ height: 10, background: c }}
          />
        ))}
        <span
          data-testid="map-legend-step"
          data-side="tie"
          className="flex-1"
          style={{ height: 10, background: tieColor }}
        />
        {rightColors
          .slice()
          .reverse()
          .map((c) => (
            <span
              key={`right-${c}`}
              data-testid="map-legend-step"
              data-side="right"
              className="flex-1"
              style={{ height: 10, background: c }}
            />
          ))}
      </div>
      <div
        aria-hidden="true"
        data-testid="map-legend-scale"
        className="flex justify-between"
        style={{ gap: "var(--space-2)", font: "var(--type-data)", color: "var(--text-secondary)" }}
      >
        <span>{`${leftLabel} +${maxMargin}`}</span>
        <span>0</span>
        <span>{`${rightLabel} +${maxMargin}`}</span>
      </div>
      <div
        aria-hidden="true"
        data-testid="map-legend-uncounted"
        className="flex items-center"
        style={{ gap: "var(--space-2)", font: "var(--type-data)", color: "var(--text-muted)" }}
      >
        <span
          className="flex-none"
          style={{
            width: 12,
            height: 10,
            background: uncountedColor,
            border: "1px solid var(--border-hairline)",
          }}
        />
        {uncountedLabel}
      </div>
    </div>
  );
}
