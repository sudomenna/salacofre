/**
 * components/blocks/RaceStatsCards.tsx
 *
 * S06/F4d (Fase 3) — 3 cards estatísticos no topo de `/governador`:
 *
 *   ┌──────────────────┬──────────────────┬──────────────────┐
 *   │ Eleitos no 1T: N │ Em 2º turno: M   │ Em apuração: K   │
 *   └──────────────────┴──────────────────┴──────────────────┘
 *
 * Server Component puro. Agrega `EdgeUfRow.bucket` de todas 27 UFs.
 *
 * Cobertura
 *   - Spec 005 (cabeçalho `/governador`).
 *   - ADR-0017 (`bucket` é declarativo do orchestrator).
 *
 * A11y
 *   - Cada card é uma `<dl>` semântica (term + description).
 *   - `aria-live="polite"` na seção — contadores podem mudar mid-apuração.
 */

import type { EdgeUfRow } from "@/lib/edge-config/types";

export interface RaceStatsCardsProps {
  rows: EdgeUfRow[];
}

interface Counts {
  eleitos: number;
  segundoTurno: number;
  emApuracao: number;
}

function tally(rows: EdgeUfRow[]): Counts {
  const c: Counts = { eleitos: 0, segundoTurno: 0, emApuracao: 0 };
  for (const r of rows) {
    if (r.bucket === "decidido_1t" || r.bucket === "chamada") {
      c.eleitos += 1;
    } else if (r.bucket === "vai_2t") {
      c.segundoTurno += 1;
    } else {
      c.emApuracao += 1;
    }
  }
  return c;
}

interface CardProps {
  label: string;
  value: number;
  testid: string;
}

function StatCard({ label, value, testid }: CardProps) {
  return (
    <dl
      data-testid={testid}
      className="flex flex-col gap-1 rounded-md border px-4 py-3"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      <dt className="text-xs uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </dt>
      <dd
        className="text-3xl font-semibold tabular-nums leading-none"
        style={{ color: "var(--color-text)", fontFamily: "var(--font-serif)" }}
      >
        {value}
      </dd>
    </dl>
  );
}

export function RaceStatsCards({ rows }: RaceStatsCardsProps) {
  const c = tally(rows);
  return (
    <section
      aria-label="Estatísticas das corridas de governador"
      aria-live="polite"
      className="grid grid-cols-1 sm:grid-cols-3 gap-3"
    >
      <StatCard label="Eleitos no 1º turno" value={c.eleitos} testid="stat-eleitos" />
      <StatCard label="Em 2º turno" value={c.segundoTurno} testid="stat-2t" />
      <StatCard label="Em apuração" value={c.emApuracao} testid="stat-em-apuracao" />
    </section>
  );
}
