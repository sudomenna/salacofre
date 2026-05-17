/**
 * components/blocks/InsightCard.tsx
 *
 * RF-044 — Análise textual gerada por templates estáticos (constituição § 2,
 * ADR-0005: NUNCA LLM).
 *
 * Stub minimal — compartilhado entre spec 003 (home) e spec 004 (UF). O
 * spec-implementer da 003 pode evoluir layout/estilo conforme necessidade.
 * Interface estável: recebe `frases: string[]` já geradas (1–3 sentenças).
 *
 * Server Component puro.
 *
 * A11y: `<aside>` semântico + `aria-labelledby` apontando ao heading. Cada
 * frase é um `<p>` separado para que screen readers façam pausa entre elas.
 */

export interface InsightCardProps {
  /** Frases geradas pelo engine de templates (1–3). */
  frases: string[];
  /** Variação visual (opcional). */
  variant?: "national" | "uf";
  /** Heading customizado. Default: "Análise". */
  heading?: string;
}

export function InsightCard({ frases, heading = "Análise" }: InsightCardProps) {
  if (frases.length === 0) {
    return null;
  }
  const headingId = "insight-card-heading";

  return (
    <aside
      aria-labelledby={headingId}
      className="flex flex-col gap-2 rounded-md border px-5 py-4"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg-muted)",
      }}
    >
      <h3
        id={headingId}
        className="text-sm font-medium uppercase tracking-wider"
        style={{ color: "var(--color-text-muted)" }}
      >
        {heading}
      </h3>
      {frases.map((f) => (
        <p
          // Frases vêm do engine de templates; conteúdo é a chave estável.
          key={f}
          className="text-base leading-relaxed"
          style={{ color: "var(--color-text)" }}
        >
          {f}
        </p>
      ))}
    </aside>
  );
}
