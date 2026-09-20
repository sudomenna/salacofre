---
title: Estado Global Cliente — Hover Store
description: Zustand store que coordena hover entre mapas, tabelas e gráficos (brushing & linking)
status: stable
source: PRD.md § 14.5
---

# Estado Global Cliente

```ts
// lib/state/hover-store.ts
import { create } from 'zustand';

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

// ⚠️ PADRÃO SUPERSEDED em 2026-09-20 (commit 55c6c04). Não copie este bloco.
// Use storeUnicaPorPagina() em vez disso:
export function useHoverStore() {
  if (typeof window === 'undefined') return createServerFallback();
  const sym = Symbol.for('hoverStore');
  if (!globalThis[sym]) {
    globalThis[sym] = create<HoverState>((set) => ({
      hovered: null,
      source: null,
      setHovered: (entity, source) => set({ hovered: entity, source }),
      clear: () => set({ hovered: null, source: null }),
    }));
  }
  return globalThis[sym];
}
// Nota: no servidor, globalThis é compartilhado entre visitantes. O Symbol garante
// isolamento por chave, não por visitante. Em produção (Vercel) a instância é descartada
// a cada request, mas em dev com HMR a assimetria é real e visível.
```

## Selectors finos

Para evitar re-render em cascata, cada consumidor seleciona apenas o que precisa:

```ts
const isHovered = useHoverStore(s =>
  s.hovered?.type === 'municipio' && s.hovered.codIbge === myId
);
```

## Cross-refs

- Spec de brushing & linking: [../specs/008-interatividade-brushing/](../specs/008-interatividade-brushing/)
- Brushing em mapas: [../mapas/brushing-linking.md](../mapas/brushing-linking.md)
