/**
 * components/atoms/overlays/HoverCard.tsx
 *
 * Tooltip que segue o ponteiro sobre o mapa (UF / município). Design system
 * Atlas Menna (ADR-0025, Bloco 1), portado de
 * `docs/design-system/atlas-menna/components/layout/HoverCard.jsx`.
 *
 * Mostra o par editorial central do design: **Parcial em tinta × Projeção em
 * ocre**, lado a lado, para a região sob o cursor.
 *
 * Server Component (sem `"use client"`): não tem estado nem evento — posição,
 * título e linhas vêm todos por prop, e `pointer-events: none` garante que ele
 * nunca intercepta o ponteiro. O pai (o mapa) é que é client; importar daqui
 * não obriga este arquivo a declarar a diretiva, e assim ele continua
 * renderizável no SSR.
 *
 * A11y: `aria-hidden`. O cartão espelha, em pixels, o que o hover do mouse já
 * revelou; para quem navega por teclado ou leitor de tela a informação tem que
 * vir da tabela/lista que acompanha o mapa (RNF-023), não de um tooltip que
 * segue um ponteiro que essa pessoa não tem.
 *
 * Divergências deliberadas em relação ao `.jsx` do kit:
 *   - percentuais por `formatPercent()` (pt-BR, determinístico) em vez de
 *     `toFixed(1).replace(".", ",")` inline.
 *   - o cabeçalho "Proj." usa `--accent-text` (5.12:1) e não `--accent-strong`
 *     (4.21:1): é texto de 10px (constituição § 4).
 *   - a célula vazia do canto do grid virou `aria-hidden` explícito.
 */

import type { CSSProperties } from "react";
import { Fragment } from "react";

import { formatPercent } from "@/lib/utils/format";

export interface HoverCardRow {
  name: string;
  /** Cor do candidato/partido, `var(--token)`. */
  color: string;
  /** Parcial em 0–100. Ausente ou não-finita ⇒ a coluna "Parcial" some do
   * cartão inteiro (ver `HoverCard`), em vez de exibir uma coluna de travessões. */
  pct?: number;
  /** Projeção em 0–100. `undefined` vira travessão. */
  proj?: number;
}

export interface HoverCardProps {
  /** Deslocamento do ponteiro dentro do contêiner do mapa, em px. */
  x: number;
  y: number;
  /** Vira o cartão para a esquerda quando ele encostaria na borda direita. */
  flip?: boolean;
  title: string;
  kicker?: string;
  /** % apurado da região, 0–100. */
  apurado?: number;
  rows: readonly HoverCardRow[];
  className?: string;
  style?: CSSProperties;
}

const HEAD_STYLE: CSSProperties = {
  font: "var(--type-kicker)",
  letterSpacing: "var(--tracking-caps)",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  textAlign: "right",
};

function fmt(value: number | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : formatPercent(value);
}

/**
 * A coluna "Parcial" só existe quando ALGUMA linha tem parcial de verdade.
 *
 * O payload do Edge Config carrega parcial **agregada por região**
 * (`pct_apurado`, que vai no cabeçalho do cartão), não por candidato:
 * `EdgeUfRow.top_candidatos` só tem `pct_projetado`. No mapa nacional, portanto,
 * as três linhas viriam com travessão sob um cabeçalho "Parcial" — uma coluna
 * que promete um dado que o produto não tem. Some a coluna; o par editorial
 * "Parcial × Projeção" reaparece inteiro assim que a região tiver parcial por
 * candidato (drill-down de município, onde o dado existe).
 */
function hasParcial(rows: readonly HoverCardRow[]): boolean {
  return rows.some((r) => r.pct != null && Number.isFinite(r.pct));
}

export function HoverCard({
  x,
  y,
  flip = false,
  title,
  kicker,
  apurado,
  rows,
  className,
  style,
}: HoverCardProps) {
  const parcial = hasParcial(rows);
  return (
    <div
      aria-hidden="true"
      data-testid="hover-card"
      data-flip={flip ? "true" : "false"}
      className={["pointer-events-none absolute rounded-sm", className].filter(Boolean).join(" ")}
      style={{
        left: x,
        top: y,
        transform: flip ? "translate(calc(-100% - 12px), 12px)" : "translate(12px, 12px)",
        zIndex: 20,
        minWidth: 220,
        maxWidth: 280,
        padding: "var(--space-3)",
        background: "var(--surface-card)",
        border: "1px solid var(--border-strong)",
        boxShadow: "var(--shadow-float)",
        animation: "am-fade var(--dur-fast) var(--ease-out)",
        ...style,
      }}
    >
      {kicker ? (
        <div
          style={{
            font: "var(--type-kicker)",
            letterSpacing: "var(--tracking-caps)",
            textTransform: "uppercase",
            color: "var(--text-secondary)",
          }}
        >
          {kicker}
        </div>
      ) : null}
      <div
        className="flex items-baseline justify-between"
        style={{ gap: "var(--space-3)", marginTop: 2, marginBottom: "var(--space-2)" }}
      >
        <div data-testid="hover-card-title" style={{ font: "var(--type-title)" }}>
          {title}
        </div>
        {apurado != null ? (
          <div
            data-testid="hover-card-apurado"
            className="whitespace-nowrap"
            style={{ font: "var(--type-data)", color: "var(--text-muted)" }}
          >
            {`${Math.round(Math.max(0, Math.min(100, apurado)))}% apurado`}
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: parcial ? "1fr auto auto" : "1fr auto",
          gap: "var(--space-1) var(--space-3)",
          font: "var(--type-body-sm)",
        }}
      >
        <span aria-hidden="true" />
        {parcial ? <span style={HEAD_STYLE}>Parcial</span> : null}
        <span style={{ ...HEAD_STYLE, color: "var(--accent-text)" }}>Proj.</span>
        {rows.map((row) => (
          <Fragment key={row.name}>
            <span className="flex min-w-0 items-center" style={{ gap: "var(--space-2)" }}>
              <span
                className="flex-none"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "var(--radius-xs)",
                  background: row.color,
                }}
              />
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">{row.name}</span>
            </span>
            {parcial ? (
              <span
                data-testid="hover-card-parcial"
                style={{ font: "var(--type-figure-sm)", textAlign: "right" }}
              >
                {fmt(row.pct)}
              </span>
            ) : null}
            <span
              data-testid="hover-card-proj"
              style={{
                font: "var(--type-figure-sm)",
                textAlign: "right",
                color: "var(--accent-text)",
              }}
            >
              {fmt(row.proj)}
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
