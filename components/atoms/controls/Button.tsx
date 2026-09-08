/**
 * components/atoms/controls/Button.tsx
 *
 * Botão editorial do design system Atlas Menna (ADR-0025, Bloco 1). Portado de
 * `docs/design-system/atlas-menna/components/actions/Button.jsx`.
 *
 * Variantes: `primary` (preenchido em tinta, uma por tela), `secondary`
 * (filete), `ghost` (só texto, dentro de painéis densos) e `accent` (ocre,
 * reservado a CTAs de *projeção* — o par editorial "Parcial em tinta ×
 * Projeção em ocre").
 *
 * Server Component: **não** carrega `"use client"`.
 *   O `.jsx` do kit mantinha `hover` em `React.useState`, o que obrigaria o
 *   arquivo a virar Client Component e a somar JS acima da dobra — RNF-007a
 *   está a ~1,3 KiB do teto de 150 KiB. Aqui o hover é CSS (`hover:` do
 *   Tailwind), e o arquivo não usa nenhum hook. Quando `onClick` for usado, o
 *   componente PAI é que precisa ser Client Component; o `<Button>` renderiza
 *   nos dois mundos.
 *
 * Divergências deliberadas em relação ao `.jsx` do kit:
 *   - `variant="accent"` usava `color: "#1B1206"`, um hex literal fora de
 *     token (violaria a constituição § 2). Trocado por `--accent-ink`
 *     (#3F2A08), medido em **4.63:1** sobre `--accent` (#C98A2B) — passa os
 *     4.5:1 da constituição § 4.
 *   - `size="md"` tem `var(--tap-min)` (44px) de altura, o alvo de toque
 *     mínimo do projeto, e é o default. `size="sm"` (32px) fica ABAIXO de
 *     `--tap-min`: use só em densidade de painel no desktop (a ação da
 *     direita de um `<Panel>`, por exemplo), nunca como alvo primário de
 *     toque no mobile.
 */

import type { CSSProperties, MouseEventHandler, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "accent";
export type ButtonSize = "sm" | "md";

export interface ButtonProps {
  variant?: ButtonVariant;
  /** `md` = 44px (`--tap-min`, default). `sm` = 32px, só densidade desktop. */
  size?: ButtonSize;
  /** Ícone à esquerda do rótulo. Puramente decorativo — fica `aria-hidden`. */
  icon?: ReactNode;
  children?: ReactNode;
  disabled?: boolean;
  /** Estica para 100% da largura do contêiner. */
  full?: boolean;
  type?: "button" | "submit" | "reset";
  onClick?: MouseEventHandler<HTMLButtonElement>;
  /** Obrigatório quando o botão é só ícone (sem `children` textual). */
  "aria-label"?: string;
  className?: string;
  style?: CSSProperties;
}

const VARIANT_STYLE: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: "var(--surface-inverse)",
    color: "var(--text-inverse)",
    borderColor: "var(--surface-inverse)",
  },
  secondary: {
    background: "transparent",
    color: "var(--text-primary)",
    borderColor: "var(--border-strong)",
  },
  ghost: {
    background: "transparent",
    color: "var(--text-secondary)",
    borderColor: "transparent",
  },
  accent: {
    background: "var(--accent)",
    color: "var(--accent-ink)",
    borderColor: "var(--accent)",
  },
};

/** Hover em CSS puro — sem estado, sem JS. */
const VARIANT_HOVER: Record<ButtonVariant, string> = {
  primary: "hover:brightness-125",
  secondary: "hover:bg-[var(--surface-sunken)]",
  ghost: "hover:bg-[var(--surface-sunken)]",
  accent: "hover:brightness-110",
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  children,
  disabled = false,
  full = false,
  type = "button",
  onClick,
  "aria-label": ariaLabel,
  className,
  style,
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      data-testid="button"
      data-variant={variant}
      data-size={size}
      className={[
        "inline-flex select-none items-center justify-center whitespace-nowrap rounded-sm",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:brightness-100",
        VARIANT_HOVER[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        gap: "var(--space-2)",
        height: size === "sm" ? 32 : "var(--tap-min)",
        padding: size === "sm" ? "0 var(--space-3)" : "0 var(--space-4)",
        border: "1px solid transparent",
        font: "var(--type-label)",
        fontSize: size === "sm" ? "var(--text-xs)" : "var(--text-sm)",
        letterSpacing: "0.02em",
        width: full ? "100%" : undefined,
        transition: "background var(--dur-fast) var(--ease-out), filter var(--dur-fast)",
        ...VARIANT_STYLE[variant],
        ...style,
      }}
    >
      {icon ? (
        <span aria-hidden="true" className="flex-none leading-none">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}
