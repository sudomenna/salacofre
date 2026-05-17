"use client";

/**
 * components/atoms/maps/BubbleMap.tsx
 *
 * RF-035 — Mapa "Votos reportados" com bubbles proporcionais aos votos
 * reportados por município.
 *
 * Estado atual: placeholder. Implementação MapLibre+PMTiles delegada ao
 * subagent `map-builder` (T10 de tasks.md spec 004). A interface (props)
 * fica congelada agora para que `app/uf/[sigla]/page.tsx` consuma sem
 * mudar quando o map-builder substituir o corpo.
 *
 * O componente DEVE ser carregado via `next/dynamic({ ssr: false })`
 * (ADR-0010) pelo caller, para manter o chunk de mapa fora do bundle
 * above-the-fold (RNF-007a/b).
 */

import { MapPlaceholder } from "./MapPlaceholder";

export interface BubbleMapMunicipio {
  cod_ibge: string;
  nome: string;
  /** Centro geográfico [lon, lat]. */
  centro: [number, number];
  /** Votos reportados no município. */
  votos: number;
  /** ID do candidato líder. */
  lider: number;
  /** Cor do líder (token CSS). */
  liderCor: string;
}

export interface BubbleMapProps {
  ufSigla: string;
  municipios: BubbleMapMunicipio[];
  height?: number;
}

export function BubbleMap({ ufSigla, height = 360 }: BubbleMapProps) {
  return <MapPlaceholder label="Votos reportados (bubbles)" ufSigla={ufSigla} height={height} />;
}
