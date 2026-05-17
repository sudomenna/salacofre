---
title: Mapas no Mobile — Tap to Select
description: Substitui hover por click; bottom sheet abre via consumer
status: stable
source: PRD.md § 15.5
---

# Mobile — Tap to Select

```ts
if (isMobile) {
  map.on('click', 'municipios-fill', (e) => {
    const feature = e.features?.[0];
    if (!feature) return;
    useHoverStore.getState().setHovered(
      { type: 'municipio', codIbge: feature.properties.CD_MUN },
      'map'
    );
    // Bottom sheet abre automaticamente via consumer
  });
}
```

## Cross-refs

- RF-049, RF-050 (mobile tap, bottom sheet): [../specs/008-interatividade-brushing/spec.md](../specs/008-interatividade-brushing/spec.md)
- Componente `<BottomSheet />`: [../design-system/components.md](../design-system/components.md)
