---
title: Brushing & Linking nos Mapas
description: Hover dispara hover-store global; consumidores reagem via setFilter / feature-state
status: stable
source: PRD.md § 15.4
---

# Brushing & Linking

Hover dispara mudança no `useHoverStore`. Todos os consumidores reagem:

```ts
// Dentro do ChoroplethMap
map.on('mousemove', 'municipios-fill', throttle((e) => {
  const feature = e.features?.[0];
  if (!feature) return;
  useHoverStore.getState().setHovered(
    { type: 'municipio', codIbge: feature.properties.CD_MUN },
    'map'
  );
}, 16));

map.on('mouseleave', 'municipios-fill', () => {
  useHoverStore.getState().clear();
});

// Em outros componentes (tabela, segundo mapa)
const hoveredId = useHoverStore(s =>
  s.hovered?.type === 'municipio' ? s.hovered.codIbge : null
);
useEffect(() => {
  map.setFilter('municipios-stroke-hover', ['==', 'CD_MUN', hoveredId ?? '']);
}, [hoveredId]);
```

## Cross-refs

- Hover store: [../design-system/state-global.md](../design-system/state-global.md)
- Spec de brushing: [../specs/008-interatividade-brushing/](../specs/008-interatividade-brushing/)
- Comportamento mobile: [./mobile.md](./mobile.md)
