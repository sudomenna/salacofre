/**
 * components/atoms/tables/CandidateRow.tsx
 *
 * RF-033 — Linha de candidato com `{avatar, partido, votos, %, barra}`.
 *
 * Server Component puro. Renderiza UMA linha; o caller compõe a tabela.
 *
 * `avatar` opcional: quando não há foto, exibimos um circle stub com as
 * iniciais (sem deps de imagem). É o padrão NYT-like e evita uma rede de
 * 404s na v1 quando ainda não temos asset pipeline para fotos.
 *
 * Cores via tokens (constituição § 2); a barra de progresso usa a cor do
 * candidato passada como prop (`cor`).
 *
 * A11y:
 *   - O número de votos é `tabular-nums` (global em globals.css), facilitando
 *     varredura visual em monoespaço.
 *   - A barra de progresso é `role="progressbar"` com aria-valuenow/min/max.
 */

import type { CSSProperties } from "react";

export interface CandidateRowProps {
  /** Nome do candidato (line 1). */
  nome: string;
  /** Partido (line 2 / chip). */
  partido: string;
  /** Cor token (var(--color-pt) etc.). */
  cor: string;
  /** Votos absolutos. Quando indisponível (payload UF), passe `null`. */
  votos: number | null;
  /** Percentual em 0–100. */
  pct: number;
  /** Iniciais ou abreviação 1–2 chars. Calculado por default a partir de `nome`. */
  iniciais?: string;
}

function defaultIniciais(nome: string): string {
  const parts = nome.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

function formatVotos(votos: number | null): string {
  if (votos === null) return "—";
  return new Intl.NumberFormat("pt-BR").format(votos);
}

function formatPct(pct: number): string {
  const r = Math.round(pct * 10) / 10;
  return Number.isInteger(r) ? `${r}%` : `${r.toFixed(1)}%`;
}

export function CandidateRow({ nome, partido, cor, votos, pct, iniciais }: CandidateRowProps) {
  const initials = iniciais ?? defaultIniciais(nome);
  const safePct = Math.max(0, Math.min(100, pct));

  const avatarStyle: CSSProperties = {
    backgroundColor: cor,
    color: "#ffffff",
  };

  const barFillStyle: CSSProperties = {
    width: `${safePct}%`,
    backgroundColor: cor,
  };

  return (
    <div
      className="grid grid-cols-[2.25rem_1fr_6rem_3.5rem] items-center gap-3 py-2"
      style={{ borderBottom: "1px solid var(--color-border)" }}
    >
      {/* Avatar */}
      <div
        aria-hidden="true"
        className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold"
        style={avatarStyle}
      >
        {initials}
      </div>

      {/* Nome + partido + barra */}
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <strong className="text-base" style={{ color: "var(--color-text)" }}>
            {nome}
          </strong>
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {partido}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(safePct)}
          aria-label={`${nome}: ${formatPct(safePct)}`}
          className="relative h-2 w-full overflow-hidden rounded-sm"
          style={{ backgroundColor: "var(--color-bg-muted)" }}
        >
          <div className="h-full" style={barFillStyle} />
        </div>
      </div>

      {/* Votos */}
      <span
        className="text-right text-sm tabular-nums"
        style={{ color: "var(--color-text-muted)" }}
      >
        {formatVotos(votos)}
      </span>

      {/* % */}
      <span
        className="text-right text-base font-medium tabular-nums"
        style={{ color: "var(--color-text)" }}
      >
        {formatPct(safePct)}
      </span>
    </div>
  );
}
