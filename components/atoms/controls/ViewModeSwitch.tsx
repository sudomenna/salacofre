"use client";

/**
 * components/atoms/controls/ViewModeSwitch.tsx
 *
 * Controle "Parcial / Projeção" do shell (ADR-0029 § 2).
 *
 * É o ÚNICO componente client novo que este bloco acrescenta acima da dobra.
 * Ele não busca dado, não muda rota e não toca em `searchParams`: os dois
 * números já vêm no mesmo payload e as duas colunas já estão sempre no DOM
 * (ADR-0017). O que ele faz é escrever `data-view` no `<html>` — a partir
 * daí, a cascata de `app/globals.css` decide a ênfase, e nenhum outro
 * componente precisa virar client por causa disso.
 *
 * Reusa `<SegmentedControl>` em vez de reimplementar: o roving tabindex
 * (←/→), o `role="tablist"` nomeado e o `aria-selected` já estão lá e já têm
 * teste. `size="md"` (44px, `--tap-min`) e não `sm`: no mobile isto é alvo de
 * toque primário na barra do topo (constituição § 4).
 */

import { useEffect } from "react";
import { SegmentedControl } from "@/components/atoms/controls/SegmentedControl";
import { VIEW_MODE_ATTRIBUTE, type ViewMode } from "@/lib/state/view-mode";
import { setViewMode, useViewMode } from "@/lib/state/view-mode-client";

const OPTIONS = [
  { value: "parcial", label: "Parcial" },
  { value: "proj", label: "Projeção" },
] as const;

export interface ViewModeSwitchProps {
  className?: string;
}

export function ViewModeSwitch({ className }: ViewModeSwitchProps) {
  const value = useViewMode();

  // Rede de segurança de uma linha. `app/layout.tsx` renderiza
  // `<html data-view={VIEW_MODE_DEFAULT}>`, então o atributo é propriedade de
  // React naquele elemento: se o layout raiz voltar a renderizar por qualquer
  // razão, React reaplicaria o default e a página inteira (que lê o atributo
  // por cascata) voltaria à outra base, enquanto a store continuaria dizendo o
  // contrário. Reafirmar aqui mantém DOM e store alinhados sem depender do
  // ciclo de vida do layout.
  useEffect(() => {
    document.documentElement.setAttribute(VIEW_MODE_ATTRIBUTE, value);
  }, [value]);

  return (
    // O `<span>` externo carrega o `data-testid`: `<SegmentedControl>` tem
    // interface fechada (sem passthrough de props arbitrárias) e já usa o
    // testid genérico `segmented-control`, que na barra do topo casaria
    // também com o seletor de turno.
    <span data-testid="view-mode-switch" className={className}>
      <SegmentedControl
        ariaLabel="Números em destaque: parcial apurado ou projeção"
        onChange={(next) => setViewMode(next as ViewMode)}
        options={OPTIONS}
        size="md"
        value={value}
      />
    </span>
  );
}
