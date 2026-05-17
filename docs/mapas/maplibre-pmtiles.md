---
title: Setup MapLibre + PMTiles
description: Configuração do componente ChoroplethMap consumindo PMTiles via Protocol
status: stable
source: PRD.md § 15.2
---

# Setup MapLibre + PMTiles

```ts
// components/atoms/maps/ChoroplethMap.tsx
'use client';
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { useEffect, useRef } from 'react';

const PMTILES_URL = process.env.NEXT_PUBLIC_PMTILES_BASE; // Vercel Blob URL

export function ChoroplethMap({
  level,            // 'br' | 'uf' | 'municipio'
  bbox,             // viewport inicial
  colorScale,       // (id) => string
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);

    const map = new maplibregl.Map({
      container: ref.current!,
      style: {
        version: 8,
        sources: {
          municipios: {
            type: 'vector',
            url: `pmtiles://${PMTILES_URL}/municipios.pmtiles`
          }
        },
        layers: [
          {
            id: 'municipios-fill',
            type: 'fill',
            source: 'municipios',
            'source-layer': 'municipios',
            paint: {
              'fill-color': ['feature-state', 'color'],
              'fill-opacity': 0.85
            }
          },
          {
            id: 'municipios-stroke',
            type: 'line',
            source: 'municipios',
            'source-layer': 'municipios',
            paint: {
              'line-color': '#ffffff',
              'line-width': 0.5
            }
          },
          {
            id: 'municipios-stroke-hover',
            type: 'line',
            source: 'municipios',
            'source-layer': 'municipios',
            paint: {
              'line-color': '#000000',
              'line-width': 2
            },
            filter: ['==', 'CD_MUN', '']  // controlado por hover
          }
        ]
      },
      bounds: bbox,
      attributionControl: false
    });

    return () => map.remove();
  }, []);

  // ... coordenar hover via Zustand
}
```

## Cross-refs

- Pipeline geo: [./pipeline-geo.md](./pipeline-geo.md)
- Brushing: [./brushing-linking.md](./brushing-linking.md)
- Coloração dinâmica: [./coloracao.md](./coloracao.md)
