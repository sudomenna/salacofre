---
id: 008-interatividade-brushing
type: design
title: Brushing & Linking — Design Técnico
status: draft
---

# Design — Brushing & Linking

## Arquitetura

Hover store global em Zustand. Cada componente "consumidor" usa selector fino para evitar re-render em cascata. Mapas reagem via `setFilter`/`setFeatureState`; tabelas/gráficos via classe CSS condicional.

## Store

```ts
// lib/state/hover-store.ts
type HoveredEntity =
  | { type: 'uf'; sigla: string }
  | { type: 'municipio'; codIbge: string }
  | null;

interface HoverState {
  hovered: HoveredEntity;
  source: 'map' | 'table' | 'chart' | null;
  setHovered: (entity: HoveredEntity, source: HoverState['source']) => void;
  clear: () => void;
}
```

Ver detalhes completos em [state-global.md](../../design-system/state-global.md).

## Coordenação de mapas

```ts
// Producer (mapa A)
map.on('mousemove', 'municipios-fill', throttle((e) => {
  const f = e.features?.[0];
  useHoverStore.getState().setHovered(
    { type: 'municipio', codIbge: f.properties.CD_MUN },
    'map'
  );
}, 16));

// Consumer (mapa B ou tabela)
const hoveredId = useHoverStore(s =>
  s.hovered?.type === 'municipio' ? s.hovered.codIbge : null
);
useEffect(() => {
  map.setFilter('municipios-stroke-hover', ['==', 'CD_MUN', hoveredId ?? '']);
}, [hoveredId]);
```

## Mobile

`useIsMobile()` hook (touch device + viewport <768px). Hover handlers viram click handlers; tooltip flutuante substituído por `<BottomSheet />`.

## Acessibilidade

- Setas de teclado movem foco entre entidades focáveis (mapa → primeira UF → tab para próxima).
- `aria-live="polite"` no tooltip para announce de breakdown.

## Riscos técnicos

- **Re-render em cascata** — selectors finos resolvem.
- **Latência de hover em hardware lento** — throttle 16ms (60fps).

## Cross-refs

- Spec: [./spec.md](./spec.md)
- State global: [../../design-system/state-global.md](../../design-system/state-global.md)
