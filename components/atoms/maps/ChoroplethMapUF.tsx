"use client";

/**
 * components/atoms/maps/ChoroplethMapUF.tsx
 *
 * RF-034 + RF-036 — Mapa coroplético do estado em granularidade de
 * município, colorido por:
 *   - mode='leader'   → cor do líder por município (RF-034).
 *   - mode='estimate' → cor da estimativa do que falta (RF-036).
 *
 * NOTA: o catálogo de componentes (docs/design-system/components.md) tem
 * um `<ChoroplethMap />` genérico que cobre tanto nacional quanto UF. Para
 * evitar conflito com o `NationalChoroplethMap` (criado pelo spec-implementer
 * da spec 003) e manter ownership claro, este componente é o coroplético
 * UF-específico. O `map-builder` pode posteriormente unificar.
 *
 * Placeholder. Implementação delegada a `map-builder`.
 */

import { MapPlaceholder } from "./MapPlaceholder";

export interface ChoroplethMunicipio {
  cod_ibge: string;
  /** Cor do polígono (token CSS). */
  cor: string;
  /** % apurado no município (0–100). */
  pctApurado: number;
}

export interface ChoroplethMapUFProps {
  ufSigla: string;
  municipios: ChoroplethMunicipio[];
  mode: "leader" | "estimate";
  height?: number;
}

export function ChoroplethMapUF({ ufSigla, mode, height = 360 }: ChoroplethMapUFProps) {
  const label = mode === "estimate" ? "Estimativa do que falta" : "Líder por município";
  return <MapPlaceholder label={label} ufSigla={ufSigla} height={height} />;
}
