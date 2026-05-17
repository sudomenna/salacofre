---
title: Performance dos Mapas
description: Lazy tile loading via PMTiles range-requests; setFeatureState em massa; mapa como ilha
status: stable
source: PRD.md § 15.6
---

# Performance dos Mapas

- **Tile loading**: lazy via range-requests do PMTiles — só baixa tiles do viewport.
- **Atualização de cores**: 5.570 `setFeatureState` calls em <50ms (testado).
- **Re-render React**: zero — o mapa é uma "ilha" controlada por refs.

## Cross-refs

- NFR RNF-008 (mapa inicial <1.5s): [../nfr/performance.md](../nfr/performance.md)
- ADR-0003 PMTiles: [../architecture/adrs/0003-pmtiles-nao-geojson.md](../architecture/adrs/0003-pmtiles-nao-geojson.md)
