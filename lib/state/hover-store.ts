/**
 * lib/state/hover-store.ts
 *
 * Zustand store global de hover para brushing & linking entre mapas,
 * tabelas e gráficos (spec 008). Documentado em docs/design-system/state-global.md.
 *
 * Regra de selector: sempre use selector fino (ex: s => s.hovered?.codIbge)
 * em vez de s => s.hovered inteiro — evita re-render quando outra entidade muda.
 */

import { create } from "zustand";

type HoveredEntity = { type: "uf"; sigla: string } | { type: "municipio"; codIbge: string } | null;

interface HoverState {
  hovered: HoveredEntity;
  source: "map" | "table" | "chart" | null;
  setHovered: (entity: HoveredEntity, source: HoverState["source"]) => void;
  clear: () => void;
}

export const useHoverStore = create<HoverState>((set) => ({
  hovered: null,
  source: null,
  setHovered: (entity, source) => set({ hovered: entity, source }),
  clear: () => set({ hovered: null, source: null }),
}));
