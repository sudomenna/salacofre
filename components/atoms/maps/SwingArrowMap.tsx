"use client";

/**
 * components/atoms/maps/SwingArrowMap.tsx
 *
 * RF-038 (Should) — Mapa com setas/indicadores de direção e magnitude do
 * swing por município.
 *
 * Placeholder. Implementação delegada ao subagent `map-builder`. Interface
 * estável para o page consumir.
 *
 * Carregado via `next/dynamic({ ssr: false })` (ADR-0010).
 */

import { MapPlaceholder } from "./MapPlaceholder";

export interface SwingArrow {
  cod_ibge: string;
  /** Centro geográfico [lon, lat]. */
  centro: [number, number];
  /** Magnitude do swing em pp (sempre positiva — direção decide cor/sentido). */
  magnitudePp: number;
  /** Direção: positivo = a favor do líder atual; negativo = oposto. */
  direction: 1 | -1;
}

export interface SwingArrowMapProps {
  ufSigla: string;
  arrows: SwingArrow[];
  height?: number;
}

export function SwingArrowMap({ ufSigla, height = 360 }: SwingArrowMapProps) {
  return <MapPlaceholder label="Swing vs 2022 (setas)" ufSigla={ufSigla} height={height} />;
}
