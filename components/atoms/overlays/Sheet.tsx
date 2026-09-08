"use client";

/**
 * components/atoms/overlays/Sheet.tsx
 *
 * Overlay de detalhe do design system Atlas Menna (ADR-0025, Bloco 1).
 * Portado de `docs/design-system/atlas-menna/components/layout/Sheet.jsx`.
 *
 * Duas formas, mesma API: no mobile é bottom sheet com scrim (modal); no
 * desktop (`side`) é um cartão flutuante ancorado no topo direito do mapa, que
 * NÃO é modal — o mapa continua utilizável atrás dele.
 *
 * Client Component: precisa de `useEffect` (tecla Esc), `useRef` (foco) e
 * `useId` (amarrar `aria-labelledby`).
 *
 * Divergências deliberadas em relação ao `.jsx` do kit:
 *   - o kit tinha `role="dialog"` e nada mais. Aqui: `aria-modal` só na
 *     variante com scrim, `aria-labelledby` apontando para o `<h2>`, foco
 *     movido para o diálogo ao abrir e devolvido ao elemento anterior ao
 *     fechar, e Esc fecha (WCAG 2.1.2 — sem armadilha de teclado; RNF-022).
 *   - o scrim era uma `<div onClick>`, inalcançável por teclado. Virou
 *     `<button>` fora da ordem de tabulação (o Esc e o × cobrem o teclado).
 *   - o scrim usava `rgba(20,23,27,0.35)` cravado. Agora sai do token via
 *     `color-mix(in srgb, var(--ink-0) 35%, transparent)` (constituição § 2).
 *   - o botão de fechar tem `var(--tap-min)` (44px), não 32px.
 *   - o `<h3>` do kit virou `<h2>` configurável por `headingLevel`: o nível
 *     certo depende da página que abre o sheet.
 */

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useId, useRef } from "react";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  kicker?: string;
  children?: ReactNode;
  /** Cartão lateral (desktop, não-modal) em vez de bottom sheet (mobile, modal). */
  side?: boolean;
  headingLevel?: 2 | 3 | 4;
  className?: string;
  style?: CSSProperties;
}

const SIDE_BOX: CSSProperties = {
  position: "absolute",
  top: "var(--space-4)",
  right: "var(--space-4)",
  width: 360,
  maxHeight: "calc(100% - var(--space-8))",
  borderRadius: "var(--radius-md)",
  boxShadow: "var(--shadow-float)",
};

const BOTTOM_BOX: CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  maxHeight: "82vh",
  borderRadius: "12px 12px 0 0",
  boxShadow: "var(--shadow-sheet)",
  animation: "am-rise var(--dur-base) var(--ease-out)",
};

export function Sheet({
  open,
  onClose,
  title,
  kicker,
  children,
  side = false,
  headingLevel = 2,
  className,
  style,
}: SheetProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";

  // Esc fecha. Registrado só enquanto aberto, para não custar um listener por
  // sheet montado na árvore.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Foco entra no diálogo ao abrir e volta para quem o abriu ao fechar.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => restoreRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <>
      {side ? null : (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Fechar"
          data-testid="sheet-scrim"
          onClick={onClose}
          className="fixed inset-0"
          style={{
            background: "color-mix(in srgb, var(--ink-0) 35%, transparent)",
            border: 0,
            zIndex: 40,
          }}
        />
      )}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal={side ? undefined : true}
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="sheet"
        data-side={side ? "true" : "false"}
        className={["flex flex-col overflow-hidden", className].filter(Boolean).join(" ")}
        style={{
          ...(side ? SIDE_BOX : BOTTOM_BOX),
          background: "var(--surface-card)",
          border: "1px solid var(--border-hairline)",
          zIndex: 41,
          ...style,
        }}
      >
        {side ? null : (
          <span
            aria-hidden="true"
            data-testid="sheet-grabber"
            style={{
              width: 36,
              height: 4,
              borderRadius: "var(--radius-xs)",
              background: "var(--rule)",
              margin: "var(--space-2) auto 0",
            }}
          />
        )}
        <header
          className="flex items-start justify-between"
          style={{
            gap: "var(--space-3)",
            padding: "var(--space-3) var(--space-4) var(--space-2)",
            borderBottom: "1px solid var(--border-hairline)",
          }}
        >
          <div className="min-w-0">
            {kicker ? (
              <div
                style={{
                  font: "var(--type-kicker)",
                  letterSpacing: "var(--tracking-caps)",
                  textTransform: "uppercase",
                  color: "var(--text-secondary)",
                  marginBottom: "var(--space-1)",
                }}
              >
                {kicker}
              </div>
            ) : null}
            <Heading id={titleId} style={{ margin: 0, font: "var(--type-title)" }}>
              {title}
            </Heading>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            data-testid="sheet-close"
            className="flex flex-none items-center justify-center"
            style={{
              width: "var(--tap-min)",
              height: "var(--tap-min)",
              border: "1px solid var(--border-hairline)",
              borderRadius: "var(--radius-pill)",
              background: "transparent",
              color: "var(--text-primary)",
              font: "var(--type-body)",
            }}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="overflow-y-auto" style={{ padding: "var(--space-4)" }}>
          {children}
        </div>
      </div>
    </>
  );
}
