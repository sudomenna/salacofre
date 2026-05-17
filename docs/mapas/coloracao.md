---
title: Coloração Dinâmica dos Mapas
description: Aplicação de cor via feature-state (sem re-fetch de tiles) e escala D3
status: stable
source: PRD.md § 15.3
---

# Coloração Dinâmica

Cor aplicada via `feature-state` — não requer re-fetch dos tiles:

```ts
function updateColors(map: maplibregl.Map, projection: EdgePayload) {
  for (const muni of projection.por_municipio) {
    map.setFeatureState(
      { source: 'municipios', sourceLayer: 'municipios', id: muni.cod_ibge },
      { color: colorScale(muni.margem_projetada) }
    );
  }
}
```

## Escala de cores (D3)

```ts
import { scaleLinear } from 'd3-scale';

const colorScale = scaleLinear<string>()
  .domain([-30, -10, 0, 10, 30])
  .range(['#0a3580', '#5a82c4', '#d9d9d9', '#cc6660', '#7c1a16'])
  .clamp(true);
```

## Performance

- 5.570 `setFeatureState` calls em <50ms (testado).
- Zero re-render React — mapa é uma ilha controlada por refs.

## Cross-refs

- Tokens de cor: [../design-system/tokens.md](../design-system/tokens.md)
- Constituição § 2 (neutralidade de cor): [../constitution.md](../constitution.md#2-neutralidade-política)
