/**
 * components/atoms/maps/_shared.ts
 *
 * Utilitários compartilhados entre componentes de mapa (BubbleMap,
 * ChoroplethMap, SwingArrowMap, NationalChoroplethMap, etc.).
 *
 * Mantido leve a propósito — qualquer dep MapLibre/PMTiles deve ser
 * importada SÓ dentro do componente client que ativa, NUNCA daqui. Este
 * módulo deve ser server-safe.
 */

/**
 * Bounding box aproximada de cada UF — usado para enquadrar mapas estaduais
 * (BubbleMap, ChoroplethMap nível UF). Fonte: limites territoriais IBGE
 * aproximados (lon_min, lat_min, lon_max, lat_max).
 *
 * Estes números são "good enough" para o viewport inicial; o map-builder
 * pode refiná-los quando trocar para PMTiles reais.
 */
export const UF_BBOX: Record<string, [number, number, number, number]> = {
  AC: [-73.99, -11.15, -66.62, -7.11],
  AL: [-38.24, -10.5, -35.15, -8.81],
  AM: [-73.81, -9.82, -56.1, 2.25],
  AP: [-54.88, -1.23, -49.88, 4.43],
  BA: [-46.62, -18.35, -37.34, -8.53],
  CE: [-41.42, -7.86, -37.25, -2.78],
  DF: [-48.28, -16.05, -47.31, -15.5],
  ES: [-41.88, -21.31, -39.66, -17.89],
  GO: [-53.25, -19.5, -45.91, -12.4],
  MA: [-48.75, -10.27, -41.79, -1.04],
  MG: [-51.05, -22.93, -39.86, -14.23],
  MS: [-58.17, -24.07, -50.92, -17.16],
  MT: [-61.63, -18.04, -50.22, -7.35],
  PA: [-58.9, -9.84, -46.06, 2.59],
  PB: [-38.77, -8.3, -34.79, -6.03],
  PE: [-41.36, -9.48, -34.81, -7.32],
  PI: [-45.99, -10.93, -40.37, -2.74],
  PR: [-54.62, -26.72, -48.02, -22.52],
  RJ: [-44.89, -23.37, -40.96, -20.76],
  RN: [-38.59, -6.97, -34.96, -4.83],
  RO: [-66.81, -13.69, -59.78, -7.97],
  RR: [-64.82, -1.58, -58.89, 5.27],
  RS: [-57.65, -33.75, -49.69, -27.08],
  SC: [-53.84, -29.36, -48.36, -25.96],
  SE: [-38.25, -11.57, -36.39, -9.51],
  SP: [-53.11, -25.31, -44.16, -19.78],
  TO: [-50.74, -13.47, -45.69, -5.17],
};

/** Centro geográfico aproximado da UF (lon, lat). */
export function ufCenter(sigla: string): [number, number] {
  const box = UF_BBOX[sigla];
  if (!box) return [-50, -15]; // fallback: centro do Brasil
  return [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
}

/**
 * Token semântico de cor por candidato — wrapper que mapeia o `id` do
 * candidato à variável CSS correspondente. NUNCA cor partidária oficial
 * (constituição § 2).
 *
 * Convenção: o caller decide o mapping `id → token`. Este helper só
 * formaliza o tipo do retorno.
 */
export type CandidateColorMap = Record<number, string>;
