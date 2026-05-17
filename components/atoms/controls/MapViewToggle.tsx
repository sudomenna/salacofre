"use client";

/**
 * components/atoms/controls/MapViewToggle.tsx
 *
 * Botões de alternância da coloração do mapa coroplético da home.
 *
 * Cobertura: RF-030.2.
 *
 * Modos:
 *   - 'winner'       — Por vencedor
 *   - 'margin'       — Margem
 *   - 'swing'        — Swing vs 2022
 *   - 'turnout'      — % apurado
 *
 * Client Component (precisa de onClick / state). Estado controlado pelo pai
 * (`app/page.tsx` ou wrapper de mapa) — esse atom é só apresentacional.
 *
 * A11y
 *   - role="tablist" + role="tab" com aria-selected.
 *   - Navegação por teclado (←/→) via tabIndex padrão dos botões.
 */

import { type KeyboardEvent, useRef } from "react";

export type MapView = "winner" | "margin" | "swing" | "turnout";

export interface MapViewToggleProps {
  value: MapView;
  onChange: (next: MapView) => void;
  className?: string;
}

const OPTIONS: ReadonlyArray<{ id: MapView; label: string }> = [
  { id: "winner", label: "Por vencedor" },
  { id: "margin", label: "Margem" },
  { id: "swing", label: "Swing vs 2022" },
  { id: "turnout", label: "% apurado" },
];

export function MapViewToggle({ value, onChange, className }: MapViewToggleProps) {
  // Roving tabindex: mantemos refs dos botões para mover foco DOM ao usar
  // ArrowLeft/ArrowRight (WAI-ARIA APG Tab pattern — RNF-024).
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKey(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const nextIdx = (idx + dir + OPTIONS.length) % OPTIONS.length;
    const nextOpt = OPTIONS[nextIdx];
    if (nextOpt) {
      onChange(nextOpt.id);
      // WAI-ARIA APG: foco DOM acompanha a seleção em roving tabindex.
      buttonRefs.current[nextIdx]?.focus();
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Modo de visualização do mapa"
      className={["inline-flex flex-wrap gap-1 rounded-md border p-1", className]
        .filter(Boolean)
        .join(" ")}
      style={{
        backgroundColor: "var(--color-bg-muted)",
        borderColor: "var(--color-border)",
      }}
    >
      {OPTIONS.map((opt, idx) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            ref={(el) => {
              buttonRefs.current[idx] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.id)}
            onKeyDown={(e) => handleKey(e, idx)}
            className="rounded px-3 py-1.5 text-sm transition-colors"
            style={{
              backgroundColor: active ? "var(--color-bg)" : "transparent",
              color: active ? "var(--color-text)" : "var(--color-text-muted)",
              fontWeight: active ? 600 : 400,
              border: active ? "1px solid var(--color-border)" : "1px solid transparent",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
