"use client";

/**
 * components/atoms/controls/SegmentedControl.tsx
 *
 * Abas segmentadas para vistas mutuamente exclusivas (Parcial / Projeção,
 * 1º / 2º turno, cargo). Design system Atlas Menna (ADR-0025, Bloco 1),
 * portado de `docs/design-system/atlas-menna/components/actions/SegmentedControl.jsx`.
 *
 * Client Component: mantém roving tabindex (foco DOM movido por ←/→), o padrão
 * Tab da WAI-ARIA APG já usado por `components/atoms/controls/MapViewToggle.tsx`.
 * Use **abaixo da dobra** ou em rota já client — RNF-007a não tem folga acima
 * dela. Quando o estado puder morar na URL, prefira
 * `components/atoms/controls/BaseToggle.tsx` ou `Tabs.tsx`, que são RSC e
 * custam zero JS.
 *
 * Divergências deliberadas em relação ao `.jsx` do kit:
 *   - `size="md"` tem `var(--tap-min)` (44px) e não os 40px do kit: alvo de
 *     toque mínimo do projeto. `size="sm"` (32px, alinhado ao `<Button>`) é
 *     densidade de painel no desktop, não alvo primário de toque.
 *   - `ariaLabel` é obrigatório: um `role="tablist"` sem nome acessível é uma
 *     lista anônima para o leitor de tela (RNF-022).
 *   - navegação por teclado ←/→, ausente no kit.
 */

import type { CSSProperties, KeyboardEvent } from "react";
import { useRef } from "react";

export interface SegmentedOption {
  value: string;
  label: string;
}

export interface SegmentedControlProps {
  options: readonly SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  /** `md` = 44px (`--tap-min`, default). `sm` = 32px, só densidade desktop. */
  size?: "sm" | "md";
  /** Estica para 100% da largura. Default true, como no kit. */
  full?: boolean;
  /** Nome acessível do grupo — ex. "Parcial ou projeção". */
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Próximo índice na navegação por ←/→, com wrap-around. Puro e exportado para
 * o teste unitário: a matemática do roving tabindex é o que quebra em silêncio
 * (off-by-one no wrap), não o `focus()`.
 */
export function nextSegmentIndex(current: number, key: string, length: number): number | null {
  if (length <= 0) return null;
  if (key !== "ArrowRight" && key !== "ArrowLeft") return null;
  const dir = key === "ArrowRight" ? 1 : -1;
  return (current + dir + length) % length;
}

export function SegmentedControl({
  options,
  value,
  onChange,
  size = "md",
  full = true,
  ariaLabel,
  className,
  style,
}: SegmentedControlProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextSegmentIndex(index, event.key, options.length);
    if (next === null) return;
    event.preventDefault();
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    buttonRefs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      data-testid="segmented-control"
      data-value={value}
      className={["inline-flex overflow-hidden rounded-sm", className].filter(Boolean).join(" ")}
      style={{
        width: full ? "100%" : undefined,
        border: "1px solid var(--border-strong)",
        background: "var(--surface-card)",
        ...style,
      }}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            data-value={option.value}
            data-active={active ? "true" : "false"}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKey(event, index)}
            className="flex-1 whitespace-nowrap"
            style={{
              height: size === "sm" ? 32 : "var(--tap-min)",
              padding: "0 var(--space-3)",
              border: 0,
              borderLeft: index > 0 ? "1px solid var(--border-strong)" : undefined,
              background: active ? "var(--surface-inverse)" : "transparent",
              color: active ? "var(--text-inverse)" : "var(--text-primary)",
              font: "var(--type-label)",
              fontSize: size === "sm" ? "var(--text-2xs)" : "var(--text-xs)",
              letterSpacing: "var(--tracking-caps)",
              textTransform: "uppercase",
              transition: "background var(--dur-fast) var(--ease-out)",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
