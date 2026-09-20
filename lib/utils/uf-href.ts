/**
 * lib/utils/uf-href.ts
 *
 * O destino de uma UF na corrida corrente — `ufHref("gov", "SP")` →
 * `/uf/SP/governador`.
 *
 * ## Por que isto não mora mais em `components/layout/UfPicker.tsx`
 *
 * Mesma razão, e mesmo precedente, de `lib/utils/margem-senado.ts`:
 * `_NationalChoroplethMapImpl.tsx` é o chunk lazy do MapLibre — o que tem
 * **menos margem no orçamento** do RNF-007b (14,7 KiB medidos pelo
 * `a11y-perf-auditor` em 18/09) — e `UfPicker.tsx` é `"use client"` com
 * `<UfPicker>`/`<UfPickerGrid>` no MESMO módulo, arrastando `<Button>`,
 * `<Sheet>` e `next/link`. Um import em **runtime** dali puxaria esse peso
 * para dentro do chunk que menos o suporta.
 *
 * Até 2026-09-19 o impl do mapa só precisava do `type UfPickerCargo`, que é
 * erasado na compilação e não custa nada. Com o clique passando a navegar
 * (ADR do clique no desktop), ele passou a precisar do **valor** `ufHref` —
 * e valor precisa de módulo puro. `UfPicker.tsx` re-exporta os dois, então
 * nenhum dos ~10 call-sites existentes mudou de import.
 *
 * Este módulo não importa React, não é `"use client"`, e não deve ganhar
 * nenhuma das duas coisas.
 */

/** Cargo aceito pelo seletor de UF — as três corridas com mapa nacional. */
export type UfPickerCargo = "pres" | "gov" | "sen";

/**
 * Sufixo de rota por cargo — `Record` total sobre `UfPickerCargo`, não
 * ternário nem `??`. O default silencioso em conversor de cargo já mordeu
 * este repositório três vezes (a última mandava todo payload de Senador para
 * a chave do Presidente); um `Record` sem entrada para um cargo novo é erro
 * de COMPILAÇÃO (`ufHref`/`UF_HREF_SUFFIX` deixam de cobrir o tipo), não uma
 * rota calada levando ao destino de outra corrida.
 */
export const UF_HREF_SUFFIX: Record<UfPickerCargo, string> = {
  pres: "",
  gov: "/governador",
  sen: "/senador",
};

/** Destino da UF na corrida corrente. */
export function ufHref(cargo: UfPickerCargo, sigla: string): string {
  return `/uf/${sigla}${UF_HREF_SUFFIX[cargo]}`;
}
