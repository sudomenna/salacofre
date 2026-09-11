/**
 * components/shared/municipio-sheet-store.ts
 *
 * Qual município está com a folha (`<Sheet>`) aberta. Um único estado global,
 * porque quem ABRE e quem RENDERIZA a folha vivem em árvores React
 * irmãs que não compartilham pai comum montável:
 *
 *   - quem abre pelo mapa   → `<PersistentMapFrame>` → `<ChoroplethMapUF>`,
 *     montado pelo `layout.tsx` do grupo de rotas (ADR-0033 § 1);
 *   - quem abre pela tabela e quem desenha a folha → `<MunicipioExplorer>`,
 *     montado pelo `page.tsx` da rota de UF.
 *
 * O `AppShellSplit` põe os dois lado a lado (`panels` | `map`), mas é Server
 * Component: não pode segurar estado de cliente, e transformá-lo em Client
 * Component arrastaria a coluna inteira de painéis para o bundle. Contexto
 * React também não serve pelo mesmo motivo — o Provider teria que ser um
 * ancestral cliente das duas colunas.
 *
 * Mesmo padrão e mesma biblioteca do `useHoverStore`
 * (`lib/state/hover-store.ts`, spec 008): store Zustand de módulo, selector
 * fino no consumidor.
 *
 * ## Por que aqui e não em `lib/state/`
 *
 * `lib/state/hover-store.ts` é o endereço que `docs/design-system/state-global.md`
 * documenta para estado global de UI. Este arquivo nasce fora dele por
 * restrição de escopo da tarefa que o criou (interface apenas; `lib/` fechado),
 * **não** por decisão de arquitetura. Mover para `lib/state/municipio-sheet-store.ts`
 * e registrar no doc é o desfecho correto — a API abaixo não muda.
 *
 * ## Hover ≠ seleção
 *
 * O `useHoverStore` já carrega `{ type: "municipio", codIbge }`, mas ele é
 * escrito no `mousemove` do mapa. Reaproveitá-lo aqui abriria a folha ao
 * passar o mouse. São dois sinais diferentes: hover realça, clique abre.
 */

import { create } from "zustand";

interface MunicipioSheetState {
  /** `cod_ibge` do município com a folha aberta, ou `null` (folha fechada). */
  codIbge: string | null;
  /** Abre a folha de um município. `null` fecha. */
  select: (codIbge: string | null) => void;
  /** Fecha a folha. Açúcar para `select(null)`. */
  clear: () => void;
}

export const useMunicipioSheetStore = create<MunicipioSheetState>((set) => ({
  codIbge: null,
  select: (codIbge) => set({ codIbge }),
  clear: () => set({ codIbge: null }),
}));
