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
 *
 * ## S07/Bloco 2 — densidade (ADR-0029)
 *
 * Até 2026-09-08 este controle era uma caixa cinza (`--color-bg-muted` com
 * borda e `p-1`) de chips `text-sm` (13px) com `px-3 py-1.5`: em 430px as
 * quatro opções quebravam em duas linhas e o cabeçalho do bloco de mapa
 * media **98px** — mais que o dobro do mapa que ele rotula precisa gastar.
 *
 * Agora é a mesma moldura de segmentado do kit (`SegmentedControl`): uma
 * caixa só, filete `--border-strong`, divisórias entre as opções, rótulos em
 * `--type-kicker` (10px, caixa alta) com `--tracking-caps`. Os quatro rótulos
 * cabem numa linha a 430px, e a altura cai para `--tap-min`.
 *
 * O que NÃO mudou, de propósito: os quatro rótulos continuam por extenso
 * ("Swing vs 2022", não "Swing"). Encurtar economizaria pixels e custaria a
 * única pista de que a comparação é contra 2022 — e o `<h2>`/kicker ao lado
 * não diz isso. `overflow-x: auto` cobre a hipótese de uma fonte de sistema
 * mais larga que a medida: a fila rola em vez de quebrar, e a altura do
 * cabeçalho continua fixa.
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
      data-testid="map-view-toggle"
      className={["flex overflow-x-auto", className].filter(Boolean).join(" ")}
      style={{
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-sm)",
        background: "var(--surface-card)",
        maxWidth: "100%",
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
            className="flex-none whitespace-nowrap"
            style={{
              minHeight: "var(--tap-min)",
              padding: `0 var(--space-2)`,
              border: 0,
              borderLeft: idx > 0 ? "1px solid var(--border-strong)" : undefined,
              background: active ? "var(--surface-inverse)" : "transparent",
              color: active ? "var(--text-inverse)" : "var(--text-primary)",
              font: "var(--type-kicker)",
              letterSpacing: "var(--tracking-caps)",
              textTransform: "uppercase",
              transition: "background var(--dur-fast) var(--ease-out)",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
