/**
 * lib/state/hover-store.ts
 *
 * Zustand store global de hover para brushing & linking entre mapas,
 * tabelas e gráficos (spec 008). Documentado em docs/design-system/state-global.md.
 *
 * Regra de selector: sempre use selector fino (ex: s => s.hovered?.codIbge)
 * em vez de s => s.hovered inteiro — evita re-render quando outra entidade muda.
 *
 * 🔴 **Instância única por página, não por cópia de módulo** (2026-09-20). Esta
 * store é escrita e lida em lados OPOSTOS de um `next/dynamic({ ssr: false })`
 * (ADR-0010): quem escreve é `<UfHoverLink>`, dentro da `<StateGroupedTable>`
 * do `page.tsx`; quem lê é `_NationalChoroplethMapImpl`, que só existe atrás do
 * import dinâmico. O empacotador põe o corpo deste módulo nos dois pacotes — no
 * build de 2026-09-20, em 5 chunks distintos. Por isso ela passa por
 * `storeUnicaPorPagina`: o motivo completo, o que hoje impede a duplicação de
 * virar defeito, e o que fazer (e não fazer) estão em
 * `lib/state/store-por-pagina.ts`. Leia lá antes de mexer aqui.
 */

import { create } from "zustand";

import { storeUnicaPorPagina } from "./store-por-pagina";

type HoveredEntity = { type: "uf"; sigla: string } | { type: "municipio"; codIbge: string } | null;

interface HoverState {
  hovered: HoveredEntity;
  source: "map" | "table" | "chart" | null;
  setHovered: (entity: HoveredEntity, source: HoverState["source"]) => void;
  clear: () => void;
}

export const useHoverStore = storeUnicaPorPagina("lib/state/hover-store.ts", () =>
  create<HoverState>((set) => ({
    hovered: null,
    source: null,
    setHovered: (entity, source) => set({ hovered: entity, source }),
    clear: () => set({ hovered: null, source: null }),
  })),
);
