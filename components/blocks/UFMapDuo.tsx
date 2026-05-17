"use client";

/**
 * components/blocks/UFMapDuo.tsx
 *
 * RF-035 + RF-036 — Composição "Mapeando os resultados e o que ainda falta":
 * dois mapas lado-a-lado.
 *   - Esquerda: BubbleMap (votos reportados, RF-035).
 *   - Direita:  ChoroplethMapUF mode='estimate' (RF-036).
 *
 * Layout: grid 2-col no desktop, stack vertical no mobile (Tailwind default).
 *
 * Carregado via `next/dynamic({ ssr: false })` pelo page (ADR-0010) — o
 * sub-mapa também é client, então tudo cabe num único chunk lazy.
 */

import { BubbleMap, type BubbleMapMunicipio } from "@/components/atoms/maps/BubbleMap";
import { ChoroplethMapUF, type ChoroplethMunicipio } from "@/components/atoms/maps/ChoroplethMapUF";

export interface UFMapDuoProps {
  ufSigla: string;
  bubbles: BubbleMapMunicipio[];
  choropleth: ChoroplethMunicipio[];
  height?: number;
}

export function UFMapDuo({ ufSigla, bubbles, choropleth, height }: UFMapDuoProps) {
  return (
    <section aria-labelledby="ufmap-duo-heading" className="flex flex-col gap-3">
      <h3
        id="ufmap-duo-heading"
        className="text-lg"
        style={{ fontFamily: "var(--font-serif)", color: "var(--color-text)" }}
      >
        Mapeando os resultados e o que ainda falta
      </h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <figure className="flex flex-col gap-2">
          <figcaption
            className="text-xs uppercase tracking-wide"
            style={{ color: "var(--color-text-muted)" }}
          >
            Votos reportados
          </figcaption>
          <BubbleMap ufSigla={ufSigla} municipios={bubbles} height={height} />
        </figure>
        <figure className="flex flex-col gap-2">
          <figcaption
            className="text-xs uppercase tracking-wide"
            style={{ color: "var(--color-text-muted)" }}
          >
            Estimativa do que falta
          </figcaption>
          <ChoroplethMapUF
            ufSigla={ufSigla}
            municipios={choropleth}
            mode="estimate"
            height={height}
          />
        </figure>
      </div>
    </section>
  );
}
