"use client";

/**
 * components/atoms/controls/SearchInput.tsx
 *
 * Campo de busca (candidato, UF, município) do design system Atlas Menna
 * (ADR-0025, Bloco 1). Portado de
 * `docs/design-system/atlas-menna/components/actions/SearchInput.jsx`.
 *
 * Client Component: o valor é controlado pelo pai via `onChange`.
 *
 * Divergências deliberadas em relação ao `.jsx` do kit:
 *   - `label` é **obrigatório**. No kit o `<label>` embrulhava o `<input>` sem
 *     texto nenhum: o campo ficava sem nome acessível, e `placeholder` não é
 *     nome acessível (RNF-022 / WCAG 4.1.2). Aqui o rótulo existe sempre —
 *     visível, ou visualmente escondido com `.sr-only` (default).
 *   - `autoFocus` foi removido: roubar o foco no load desorienta quem navega
 *     por teclado ou leitor de tela (a regra `a11y/noAutofocus` do Biome, que
 *     está ligada neste repo, reprovaria).
 *   - o botão de limpar tem `var(--tap-min)` (44px) de lado, com margem
 *     negativa para absorver o padding direito do campo sem esticá-lo.
 *   - `type="search"` e `autoComplete="off"`, para o campo se comportar como
 *     busca (tecla Esc limpa em alguns navegadores) sem sugerir histórico.
 */

import type { CSSProperties } from "react";

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Nome acessível do campo — ex. "Buscar candidato, UF ou município". */
  label: string;
  /** Mostra o rótulo acima do campo em vez de escondê-lo (`.sr-only`). */
  showLabel?: boolean;
  placeholder?: string;
  /** Chamado depois de `onChange("")` quando o usuário aperta o botão limpar. */
  onClear?: () => void;
  id?: string;
  className?: string;
  style?: CSSProperties;
}

export function SearchInput({
  value,
  onChange,
  label,
  showLabel = false,
  placeholder = "Buscar",
  onClear,
  id,
  className,
  style,
}: SearchInputProps) {
  return (
    <label
      htmlFor={id}
      data-testid="search-input"
      className={["flex items-center rounded-sm", className].filter(Boolean).join(" ")}
      style={{
        gap: "var(--space-2)",
        height: "var(--tap-min)",
        padding: "0 var(--space-3)",
        border: "1px solid var(--border-strong)",
        background: "var(--surface-card)",
        ...style,
      }}
    >
      <span
        className={showLabel ? undefined : "sr-only"}
        data-testid="search-input-label"
        style={
          showLabel
            ? {
                font: "var(--type-kicker)",
                letterSpacing: "var(--tracking-caps)",
                textTransform: "uppercase",
                color: "var(--text-secondary)",
              }
            : undefined
        }
      >
        {label}
      </span>
      <svg
        aria-hidden="true"
        focusable="false"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="flex-none"
        style={{ color: "var(--text-secondary)" }}
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        id={id}
        type="search"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        data-testid="search-input-field"
        className="min-w-0 flex-1"
        style={{
          border: 0,
          outline: 0,
          background: "transparent",
          color: "var(--text-primary)",
          font: "var(--type-body)",
        }}
      />
      {value ? (
        <button
          type="button"
          aria-label="Limpar busca"
          data-testid="search-input-clear"
          onClick={() => {
            onChange("");
            onClear?.();
          }}
          className="flex flex-none items-center justify-center"
          style={{
            width: "var(--tap-min)",
            height: "var(--tap-min)",
            marginRight: "calc(-1 * var(--space-3))",
            border: 0,
            background: "transparent",
            color: "var(--text-secondary)",
            font: "var(--type-body)",
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </label>
  );
}
