"use client";

/**
 * components/blocks/UfMapsLazy.tsx
 *
 * Client Component wrapper que carrega os mapas via `next/dynamic({ ssr: false })`
 * (ADR-0010 — mapa fora do bundle above-the-fold).
 *
 * Por que existe: Next 16 não permite `next/dynamic({ ssr: false })` dentro de
 * Server Components. Para manter ADR-0010 (mapas only-client + chunk separado)
 * e o page `/uf/[sigla]/page.tsx` como Server Component, este wrapper isola
 * o boundary.
 *
 * Renderiza os 3 blocos de mapa do UF:
 *   - ChoroplethMapUF (mode='leader')   — RF-034
 *   - UFMapDuo (bubbles + estimate)     — RF-035 + RF-036
 *   - SwingArrowMap                     — RF-038 (Should)
 *
 * Cada um vem com seu skeleton via `loading:`. Bundle final cumpre RNF-007a/b:
 *   - above-the-fold (this client boundary) <150KB gzipped
 *   - chunk de mapa quando ativado: <250KB gzipped (target RNF-007b)
 */

import dynamic from "next/dynamic";
import { MapPlaceholder } from "@/components/atoms/maps/MapPlaceholder";
import type { BubbleMapMunicipio } from "@/components/atoms/maps/BubbleMap";
import type { ChoroplethMunicipio } from "@/components/atoms/maps/ChoroplethMapUF";
import type { SwingArrow } from "@/components/atoms/maps/SwingArrowMap";

const UFMapDuo = dynamic(
  () => import("@/components/blocks/UFMapDuo").then((m) => m.UFMapDuo),
  {
    ssr: false,
    loading: () => <MapPlaceholder label="Carregando mapas..." height={360} />,
  },
);

const SwingArrowMap = dynamic(
  () =>
    import("@/components/atoms/maps/SwingArrowMap").then((m) => m.SwingArrowMap),
  {
    ssr: false,
    loading: () => <MapPlaceholder label="Swing vs 2022" height={320} />,
  },
);

const ChoroplethMapUF = dynamic(
  () =>
    import("@/components/atoms/maps/ChoroplethMapUF").then((m) => m.ChoroplethMapUF),
  {
    ssr: false,
    loading: () => <MapPlaceholder label="Líder por município" height={320} />,
  },
);

export interface UfMapsLazyProps {
  ufSigla: string;
  bubbles: BubbleMapMunicipio[];
  choropleth: ChoroplethMunicipio[];
  swing: SwingArrow[];
  height?: number;
}

/** RF-034 — choropleth simples por município (líder). */
export function UfLeaderMapLazy({
  ufSigla,
  choropleth,
  height = 320,
}: {
  ufSigla: string;
  choropleth: ChoroplethMunicipio[];
  height?: number;
}) {
  return (
    <ChoroplethMapUF ufSigla={ufSigla} municipios={choropleth} mode="leader" height={height} />
  );
}

/** RF-035 + RF-036 — duo: bubbles à esquerda, estimativa à direita. */
export function UfMapDuoLazy({
  ufSigla,
  bubbles,
  choropleth,
  height = 320,
}: {
  ufSigla: string;
  bubbles: BubbleMapMunicipio[];
  choropleth: ChoroplethMunicipio[];
  height?: number;
}) {
  return <UFMapDuo ufSigla={ufSigla} bubbles={bubbles} choropleth={choropleth} height={height} />;
}

/** RF-038 (Should) — setas de swing por município. */
export function UfSwingArrowMapLazy({
  ufSigla,
  arrows,
  height = 320,
}: {
  ufSigla: string;
  arrows: SwingArrow[];
  height?: number;
}) {
  return <SwingArrowMap ufSigla={ufSigla} arrows={arrows} height={height} />;
}
