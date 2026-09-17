/**
 * components/blocks/HeadlineScore.tsx
 *
 * Scoreboard hero — top-2 candidatos lado-a-lado em destaque (camada 1 do
 * hero multi-camada, ADR-0017).
 *
 * Cobertura
 *   - RF-022 (votos absolutos projetados)
 *   - RF-023 (% projetado + CI95)
 *   - RF-030.5 (marca 50%+1 — só em mode="binary"; substituída em multi-1t
 *     pelo `<TwoRoundIndicator />` no caller, Fase 4)
 *   - ADR-0016 (recap do 1T como header acima do hero em mode 2T — slot
 *     opcional via prop `recap`; caller monta `<TurnoOneRecap />` e
 *     passa pra cá).
 *
 * Server Component puro. Recebe o slice nacional do `EdgePayload` resolvido
 * pelo pai (`app/page.tsx`).
 *
 * Modos (S05/F3B — refator + S06/F1 — slot recap)
 *   - `mode="multi-1t"`: corrida 1T multi-candidato — renderiza só camada 1
 *     (top-2 hero). Sem barra "50%+1" interna; caller usa `<TwoRoundIndicator />`
 *     pra mostrar P(2T) global. Headline 1T menciona o terceiro candidato:
 *     "X lidera, Z briga pela 2ª vaga" (Z vem do array completo, mesmo que
 *     filtrado por `mostrarRanks`).
 *   - `mode="binary"`: corrida 2T (ou 1T com 2 candidatos) — comportamento S04:
 *     placar + barra "50%+1" (interno) marcando gatilho. Em 2T, prop `recap`
 *     (ReactNode) renderiza acima do título — slot fixo pro `<TurnoOneRecap />`
 *     (ADR-0016). Em 1T binário (cenário hipotético com 2 cands), `recap`
 *     é normalmente null e a prop é ignorada.
 *
 * Default
 *   Quando `mode` não é passado, derivamos de `turno + candidatos.length`:
 *   `turno === 2 || candidatos.length === 2` → `binary`; senão → `multi-1t`.
 *
 * Ordenação canônica
 *   `EdgeNational` já garante candidatos[0] = líder (rank 1), candidatos[1] =
 *   rank 2, etc (FIX S04). Aqui filtramos por `mostrarRanks` (default [1, 2])
 *   pra exibir só o top-2; o array completo segue acessível pra montar
 *   headlines dinâmicas com referência a outros ranks.
 *
 * Edge cases
 *   - 0 candidatos → mensagem "Aguardando candidatos" (estado pré-eleição).
 *   - 1 candidato  → mostra só esse, sem marca 50%+1.
 *
 * A11y
 *   - `<section aria-labelledby>` para semântica de landmark.
 *   - Cada barra é um `<CandidateBar>` (já com role=meter).
 *   - Marca 50%+1 (binary) com `<span aria-hidden>` no SVG; texto descritivo no caption.
 */

import type { ReactNode } from "react";

import { CandidateBar } from "@/components/atoms/bars/CandidateBar";
import type { EdgeCandidate, Turno } from "@/lib/edge-config/types";
import { nomeExibicao } from "@/lib/utils/nome-candidato";

export type HeadlineScoreMode = "multi-1t" | "binary";

export interface HeadlineScoreProps {
  candidatos: EdgeCandidate[];
  /** Título visível; default "Apuração Presidencial 2026". */
  titulo?: string;
  /** Subtítulo descritivo. */
  subtitulo?: string;
  /**
   * Modo do hero. Quando omitido, deriva de `turno + candidatos.length`:
   * `turno === 2 || candidatos.length === 2` → `"binary"`; senão `"multi-1t"`.
   */
  mode?: HeadlineScoreMode;
  /**
   * Turno (1 ou 2). Usado só pra derivar `mode` quando ele não é passado.
   * Default 1.
   */
  turno?: Turno;
  /**
   * Lista de ranks a exibir como hero (camada 1). Default `[1, 2]` — top-2.
   * O componente FILTRA os candidatos por estes ranks, mas o array original
   * continua acessível pra montagem do headline dinâmico (mencionar rank 3
   * em 1T multi-candidato, por exemplo).
   */
  mostrarRanks?: number[];
  /**
   * Slot opcional para o recap do 1º turno (ADR-0016) — renderiza acima do
   * título do hero em mode 2T. Caller monta `<TurnoOneRecap recap={...} />`
   * e passa aqui. Em `mode="multi-1t"` a prop é ignorada (não há recap em
   * pleno 1T). Em `mode="binary"` 1T (cenário hipotético com 2 cands),
   * `recap` é normalmente null e nada renderiza.
   */
  recap?: ReactNode;
  className?: string;
}

export function HeadlineScore({
  candidatos,
  titulo = "Apuração Presidencial 2026",
  // S07/Fase 2: a projeção deixou de ser swing vs. 2022 e passou a ser
  // extrapolação do que cada zona já apurou (regra de três). 2022 continua
  // na tela como comparação descritiva (decisão E1), nunca como insumo —
  // o subtítulo não pode mais sugerir o contrário.
  subtitulo = "Projeção em tempo real por extrapolação da apuração real do TSE.",
  mode,
  turno = 1,
  mostrarRanks = [1, 2],
  recap,
  className,
}: HeadlineScoreProps) {
  // Modo default — derivado de turno + #candidatos
  const effectiveMode: HeadlineScoreMode =
    mode ?? (turno === 2 || candidatos.length === 2 ? "binary" : "multi-1t");

  // Hero (camada 1): top-2 por padrão. Filtra pelos ranks pedidos preservando
  // ordem do array original (que já é ordenado por rank ascendente).
  const heroCandidatos = candidatos.filter((c) => mostrarRanks.includes(c.rank ?? -1));
  const a = heroCandidatos[0] ?? candidatos[0];
  const b = heroCandidatos[1] ?? candidatos[1];

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

  // Nome de exibição (`lib/utils/nome-candidato.ts`) resolvido UMA vez, aqui:
  // este `<h1>` é o maior tipo da página e a `<CandidateBar>` logo abaixo
  // repete o mesmo nome. Derivar nos dois pontos é como a cor divergiu entre a
  // home e a página de estado.
  const nomeA = nomeExibicao(a.nome, a.sqcand);
  const nomeB = b ? nomeExibicao(b.nome, b.sqcand) : "";

  // Headline dinâmico. Em multi-1t menciona o terceiro candidato; em binary
  // mantém o comportamento "X à frente / Disputa apertada".
  const lead = a.pct_projetado - (b?.pct_projetado ?? 0);
  let leadLabel: string;
  if (!b) {
    leadLabel = `${nomeA} confirmado`;
  } else if (effectiveMode === "multi-1t") {
    // Rank 3 do array original (acessível mesmo quando filtrado pelo hero)
    const terceiro = candidatos.find((c) => (c.rank ?? -1) === 3);
    if (terceiro) {
      leadLabel = `${nomeA} lidera, ${nomeExibicao(terceiro.nome, terceiro.sqcand)} briga pela 2ª vaga`;
    } else {
      leadLabel = `${nomeA} à frente`;
    }
  } else if (Math.abs(lead) < 1) {
    leadLabel = "Disputa apertada";
  } else if (lead > 0) {
    leadLabel = `${nomeA} à frente`;
  } else {
    leadLabel = `${nomeB} à frente`;
  }

  const containerClass = ["flex flex-col gap-4", className].filter(Boolean).join(" ");

  // Slot do recap do 1T (ADR-0016) — só renderiza em mode binary (2T tipicamente).
  // Caller passa `<TurnoOneRecap recap={...} />` ou `null`; aqui só repassamos.
  const recapSlot = effectiveMode === "binary" ? recap : null;

  return (
    <section aria-labelledby="headline-score-heading" className={containerClass}>
      {recapSlot}
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
          nome={nomeA}
          partido={a.partido}
          cor={a.cor}
          rank={a.rank}
          pctProjetado={a.pct_projetado}
          pctLower={a.pct_projetado_lower}
          pctUpper={a.pct_projetado_upper}
          votos={a.votos_projetados}
        />
        {b && (
          <CandidateBar
            nome={nomeB}
            partido={b.partido}
            cor={b.cor}
            rank={b.rank}
            pctProjetado={b.pct_projetado}
            pctLower={b.pct_projetado_lower}
            pctUpper={b.pct_projetado_upper}
            votos={b.votos_projetados}
            alignRight
          />
        )}
      </div>

      {/* Marca 50%+1 — só em modo binary (2T ou 1T com 2 cands). Em multi-1t
          o caller deve mostrar `<TwoRoundIndicator />` pra P(2T) global. */}
      {effectiveMode === "binary" && b && <ThresholdMarker50 a={a} b={b} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Marca 50% + 1 — barra empilhada (A à esquerda, B à direita), tick em 50%.
// RF-030.5: marca visual em 50%+1. Só renderiza em mode="binary".
// (Renomeado de Gatilho50 em S05/F3B pra refletir semântica: é marca
// visual de threshold no duelo, não gatilho de transição entre turnos.)
// ---------------------------------------------------------------------------
function ThresholdMarker50({ a, b }: { a: EdgeCandidate; b: EdgeCandidate }) {
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
