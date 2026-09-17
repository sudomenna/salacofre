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
 *
 * ## 2026-09-14 (map-builder) — `<CandidateLegendGroup>`, o átomo N-way
 *
 * `<MapLegend>` (acima) descreve um mapa de **dois** candidatos — pertinente
 * quando a corrida É binária (2º turno). Desde o ADR-0024 (S07/Bloco 1) o
 * choropleth nacional do 1º turno pinta cada UF pela identidade do **líder
 * local** com intensidade por margem, qualquer que seja o rank dele — uma UF
 * liderada pelo 3º colocado nacional já recebe a cor do 3º colocado. A
 * legenda divergente não tinha como descrever essa cor: só nomeava rank 1 e
 * rank 2, e o 3º colocado saía do mapa sem nenhuma legenda o explicando.
 *
 * `<CandidateLegendGroup>` substitui esse uso: uma rampa **por candidato**
 * (não uma rampa dividida em dois lados), 1 a 3 delas (rank 1..3, quantos
 * existirem — nunca inventa um 3º que não veio no payload), com uma ÚNICA
 * chave de "sem apuração" compartilhada entre elas (production a pediu
 * explicitamente: "não faz sentido ter 3 chaves iguais"). Mesmo contrato de
 * `<MapLegend>`: quem monta cada rampa (os 5 degraus de intensidade) é o
 * caller (`NationalChoroplethMap.tsx`, via `intensityForParty`), este átomo
 * não tem opinião sobre partido.
 *
 * `<MapLegend>` **continua no arquivo, sem uso em produção hoje** (só o teste
 * próprio dela, `tests/unit/components/MapLegend.test.tsx`, a exercita) — não
 * é código morto por engano, é uma decisão: o formato "duelo top-2" é exatamente
 * o que um mapa de 2º turno precisa (dois candidatos, sem 3º a nomear), e
 * nenhuma tela de 2T tem legenda de mapa hoje. Ver relatório do map-builder de
 * 2026-09-14 para quem quiser reverter essa decisão.
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

// ---------------------------------------------------------------------------
// CandidateLegendGroup — legenda N-way (1 rampa por candidato, RF-030.1)
// ---------------------------------------------------------------------------

/** Uma rampa de intensidade pronta — o caller já resolveu partido → cor. */
export interface CandidateLegendEntry {
  /** Nome de exibição do candidato (`nomeExibicao`, não o nome de urna cru). */
  label: string;
  /** 5 degraus, do mais forte (borda, margem alta) ao mais fraco (margem baixa). */
  colors: readonly string[];
}

export function candidateLegendGroupLabel(
  entries: readonly CandidateLegendEntry[],
  maxMargin: number,
  uncountedLabel: string,
): string {
  // Uma frase por candidato, não uma frase repetida 3×: um leitor de tela que
  // ouvisse "escala de margem: Lula até 30 pontos" três vezes seguidas (uma
  // por legenda) não aprenderia nada na 2ª e 3ª repetição — é exatamente o
  // problema que a legenda ÚNICA agrupada evita.
  const porCandidato = entries.map((e) => `${e.label}, até ${maxMargin} pontos`).join("; ");
  return (
    `Escala de margem por candidato, do mais claro (disputa apertada) ao mais ` +
    `forte (${maxMargin} pontos ou mais): ${porCandidato}. Cor neutra: ${uncountedLabel}.`
  );
}

export interface CandidateLegendGroupProps {
  /**
   * 1 a 3 rampas, em ordem de rank (1º, 2º, 3º colocado nacional). Quantos
   * existirem — o caller nunca preenche um 3º que o payload não trouxe
   * (ver `NationalChoroplethMap.tsx`).
   */
  entries: readonly CandidateLegendEntry[];
  /** Maior margem rotulada, em pp. Default 30 (mesmo default de `<MapLegend>`). */
  maxMargin?: number;
  /** Cor de UF/município sem apuração — chave ÚNICA, compartilhada pelas N rampas. */
  uncountedColor?: string;
  uncountedLabel?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Uma rampa por candidato (rank 1..3), mais UMA chave de "sem apuração"
 * compartilhada — não uma legenda por candidato repetindo a chave.
 *
 * `entries` vazio → `null` (mesma filosofia de `buildPartyLegend` antes desta
 * mudança: nenhuma legenda é melhor que uma legenda que inventa candidato).
 *
 * `role="img"` no grupo inteiro, um único `aria-label` describing o conjunto
 * — não três `role="img"` aninhados, que fariam um leitor de tela anunciar
 * "imagem" três vezes para o que visualmente é uma caixa só.
 */
export function CandidateLegendGroup({
  entries,
  maxMargin = 30,
  uncountedColor = "var(--map-uncounted)",
  uncountedLabel = "sem apuração",
  className,
  style,
}: CandidateLegendGroupProps) {
  if (entries.length === 0) return null;
  return (
    <div
      role="img"
      aria-label={candidateLegendGroupLabel(entries, maxMargin, uncountedLabel)}
      data-testid="map-legend-group"
      className={className}
      style={{ display: "grid", gap: "var(--space-1)", ...style }}
    >
      {entries.map((entry, idx) => (
        <div
          key={entry.label}
          aria-hidden="true"
          data-testid="map-legend-candidate"
          data-rank={idx + 1}
          className="flex items-center"
          style={{ gap: "var(--space-2)" }}
        >
          <span
            className="flex-none truncate"
            style={{ width: 52, font: "var(--type-data)", color: "var(--text-secondary)" }}
          >
            {entry.label}
          </span>
          <div className="flex flex-1 items-center" style={{ gap: 1 }}>
            {entry.colors.map((c) => (
              // Mesmo padrão de `map-legend-step` no `<MapLegend>` acima: a
              // cor é a chave, não o índice (rampa nunca reordena, mas a
              // regra do lint vale para qualquer array mapeado).
              <span
                key={`${entry.label}-${c}`}
                data-testid="map-legend-group-step"
                className="flex-1"
                style={{ height: 8, background: c }}
              />
            ))}
          </div>
        </div>
      ))}
      <div
        aria-hidden="true"
        data-testid="map-legend-group-scale"
        className="flex justify-between"
        style={{
          marginLeft: 52 + 8,
          font: "var(--type-data)",
          color: "var(--text-secondary)",
        }}
      >
        <span>0</span>
        <span>{`+${maxMargin}`}</span>
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
            height: 8,
            background: uncountedColor,
            border: "1px solid var(--border-hairline)",
          }}
        />
        {uncountedLabel}
      </div>
    </div>
  );
}
