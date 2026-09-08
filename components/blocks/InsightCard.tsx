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
 * S07/Bloco 1 (ADR-0025) — perdeu a moldura. O card cinza com borda
 * arredondada era a única superfície "caixa" restante no fluxo da home, e a
 * gramática do design system Atlas Menna separa seções por filete, não por
 * card. O filete e o kicker agora vêm do `<Panel>` que envolve o bloco na
 * página; o `<h3>` virou o título em serifa e as frases, deck. Contrato de
 * dados e de a11y inalterados.
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
    <aside aria-labelledby={headingId} className="flex flex-col" style={{ gap: "var(--space-3)" }}>
      <h3 id={headingId} style={{ margin: 0, font: "var(--type-title)", textWrap: "pretty" }}>
        {heading}
      </h3>
      {frases.map((f) => (
        <p
          // Frases vêm do engine de templates; conteúdo é a chave estável.
          key={f}
          style={{ margin: 0, font: "var(--type-deck)", textWrap: "pretty" }}
        >
          {f}
        </p>
      ))}
    </aside>
  );
}
