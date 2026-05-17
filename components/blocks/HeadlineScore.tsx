/**
 * components/blocks/HeadlineScore.tsx
 *
 * Scoreboard hero — dois maiores candidatos lado-a-lado, estilo NYT
 * "Live Forecast". Marca visual de gatilho 50%+1 (segundo turno).
 *
 * Cobertura
 *   - RF-022 (votos absolutos projetados)
 *   - RF-023 (% projetado + CI95)
 *   - RF-030.5 (placar grande + marca 50%+1)
 *
 * Server Component puro. Recebe o slice nacional do `EdgePayload` resolvido
 * pelo pai (`app/page.tsx`).
 *
 * Ordenação canônica
 *   `EdgeNational` já garante candidatos[0] = líder ("A"), candidatos[1] = "B"
 *   (FIX S04 — carry-over #1). Aqui só lemos `candidatos[0]` e `candidatos[1]`.
 *
 * Edge cases
 *   - 0 candidatos → mensagem "Aguardando candidatos" (estado pré-eleição).
 *   - 1 candidato  → mostra só esse, sem marca 50%+1.
 *
 * A11y
 *   - `<section aria-labelledby>` para semântica de landmark.
 *   - Cada barra é um `<CandidateBar>` (já com role=meter).
 *   - Marca 50%+1 com `<span aria-hidden>` no SVG; texto descritivo no caption.
 */

import { CandidateBar } from "@/components/atoms/bars/CandidateBar";
import type { EdgeCandidate } from "@/lib/edge-config/types";

export interface HeadlineScoreProps {
  candidatos: EdgeCandidate[];
  /** Título visível; default "Apuração Presidencial 2026". */
  titulo?: string;
  /** Subtítulo descritivo. */
  subtitulo?: string;
  className?: string;
}

export function HeadlineScore({
  candidatos,
  titulo = "Apuração Presidencial 2026",
  subtitulo = "Projeção em tempo real com base em apuração real do TSE e comparação com 2022.",
  className,
}: HeadlineScoreProps) {
  const a = candidatos[0];
  const b = candidatos[1];

  // Estado pré-eleição
  if (!a) {
    return (
      <section
        aria-labelledby="headline-score-heading"
        className={["rounded-md border p-6 text-center", className].filter(Boolean).join(" ")}
        style={{ borderColor: "var(--color-border)" }}
      >
        <h1
          id="headline-score-heading"
          className="text-2xl"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {titulo}
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Aguardando candidatos…
        </p>
      </section>
    );
  }

  // Headline dinâmico — "Lula à frente" / "Disputa apertada"
  const lead = a.pct_projetado - (b?.pct_projetado ?? 0);
  let leadLabel: string;
  if (!b) {
    leadLabel = `${a.nome} confirmado`;
  } else if (Math.abs(lead) < 1) {
    leadLabel = "Disputa apertada";
  } else if (lead > 0) {
    leadLabel = `${a.nome} à frente`;
  } else {
    leadLabel = `${b.nome} à frente`;
  }

  const containerClass = ["flex flex-col gap-4", className].filter(Boolean).join(" ");

  return (
    <section aria-labelledby="headline-score-heading" className={containerClass}>
      <header>
        <h1
          id="headline-score-heading"
          className="text-3xl md:text-4xl"
          style={{ fontFamily: "var(--font-serif)", color: "var(--color-text)" }}
        >
          {titulo}: {leadLabel}
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
          {subtitulo}{" "}
          <a
            href="/sobre-o-modelo"
            className="underline"
            style={{ color: "var(--color-text-muted)" }}
          >
            Como funciona ›
          </a>
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <CandidateBar
          nome={a.nome}
          partido={a.partido}
          cor={a.cor}
          pctProjetado={a.pct_projetado}
          pctLower={a.pct_projetado_lower}
          pctUpper={a.pct_projetado_upper}
          votos={a.votos_projetados}
        />
        {b && (
          <CandidateBar
            nome={b.nome}
            partido={b.partido}
            cor={b.cor}
            pctProjetado={b.pct_projetado}
            pctLower={b.pct_projetado_lower}
            pctUpper={b.pct_projetado_upper}
            votos={b.votos_projetados}
            alignRight
          />
        )}
      </div>

      {/* Gatilho 50%+1 — barra horizontal mostrando proporção combinada
          dos dois com tick em 50%. */}
      {b && <Gatilho50 a={a} b={b} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Gatilho 50% + 1 — barra empilhada (A à esquerda, B à direita), tick em 50%.
// RF-030.5: marca visual em 50%+1.
// ---------------------------------------------------------------------------
function Gatilho50({ a, b }: { a: EdgeCandidate; b: EdgeCandidate }) {
  const total = a.pct_projetado + b.pct_projetado || 1;
  const aPct = (a.pct_projetado / total) * 100;
  // Posição do líder vs 50% explicit
  const cleared50 = a.pct_projetado >= 50;
  return (
    <div className="mt-2 flex flex-col gap-1">
      <div
        className="relative h-2 w-full overflow-hidden rounded-sm border"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-bg-muted)",
        }}
        aria-hidden="true"
      >
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${aPct}%`,
            backgroundColor: a.cor,
          }}
        />
        <div
          className="absolute inset-y-0 right-0"
          style={{
            width: `${100 - aPct}%`,
            backgroundColor: b.cor,
          }}
        />
        {/* tick 50% */}
        <div
          className="absolute inset-y-[-4px] left-1/2 w-px"
          style={{ backgroundColor: "var(--color-text)" }}
        />
      </div>
      <p className="text-center text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }}>
        <span aria-hidden="true">▲</span> 50%+1 — gatilho de 2º turno{" "}
        {cleared50 ? "(atingido)" : "(não atingido)"}
      </p>
    </div>
  );
}
