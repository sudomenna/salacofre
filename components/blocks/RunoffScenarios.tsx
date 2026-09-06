/**
 * components/blocks/RunoffScenarios.tsx
 *
 * Bloco "Cenários para o segundo turno" — top-3 duelos mais prováveis no 2T,
 * lidos diretamente de `EdgeNational.cenarios_2t` (S05/F4c — ADR-0014).
 *
 * Cobertura
 *   - RF-030.9 (cenários 2T — exibe top-3 pares prováveis com probabilidade).
 *   - ADR-0014 (`cenarios_2t` é métrica de primeira classe do payload —
 *     UI não recalcula, só renderiza).
 *
 * Server Component puro. Sem state, sem efeitos.
 *
 * Gate de renderização
 *   - `p_segundo_turno_overall == null` → null (cenário 2T já, ou pré-S05).
 *   - `p_segundo_turno_overall < 0.4` → null (cenário trivial de fechamento
 *     no 1T; "cenários para 2º turno" vira fofoca abaixo desse limiar).
 *   - `cenarios_2t.length === 0` → null (degradação silenciosa, não
 *     placeholder — caller já lida com ausência de bloco).
 *
 * Ordenação
 *   `cenarios_2t` chega ordenado por `prob` desc do orchestrator (S05/F4c).
 *   Aqui pegamos os 3 primeiros e renderizamos na mesma ordem.
 *
 * Cores
 *   Cada par mostra os dois candidatos com `colorForRank()` baseado no
 *   `rank` do `EdgeCandidate`. Lookup é por `id` no array `candidatos`
 *   passado pelo caller. Pares com candidato ausente são silenciosamente
 *   descartados (orchestrator não deveria emitir pares com id inválido,
 *   mas defendemos contra regressão).
 *
 * A11y
 *   - `<section aria-labelledby>` com heading h2 semântico.
 *   - `<ul>` + `<li>` para os 3 cenários (role implícito).
 *   - Cada cenário tem `aria-label` completo: "Par 1: <A> vs <B>, X% de probabilidade".
 *   - Barra de probabilidade com `role="meter"` em [0, 100].
 */

import type { EdgeCandidate, EdgeNational } from "@/lib/edge-config/types";
import { colorForRank } from "@/lib/utils/cand-color";
import { formatPercent } from "@/lib/utils/format";

/**
 * Limiar mínimo de `p_segundo_turno_overall` para exibir os cenários.
 * Abaixo disso (P < 0.4), a probabilidade de 2T é baixa o suficiente
 * para tornar a discussão de cenários 2T mais ruído que sinal.
 *
 * Decisão de orquestração (S06/F1): 0.4 alinha com o gate inverso do
 * `<TwoRoundIndicator />` (que esconde quando |P − 0.5| ≤ 0.1 — então
 * P ≤ 0.4 ou P ≥ 0.6 fica "fora do meio"; aqui exigimos P ≥ 0.4 pra
 * mostrar cenários, ou seja, a partir de "improvável mas plausível").
 */
export const RUNOFF_SCENARIOS_MIN_P = 0.4;

export interface RunoffScenariosProps {
  national: EdgeNational;
  candidatos: EdgeCandidate[];
  /** Quantos cenários exibir. Default 3 (top-3). */
  topN?: number;
  className?: string;
}

export function RunoffScenarios({
  national,
  candidatos,
  topN = 3,
  className,
}: RunoffScenariosProps) {
  // Gate 1: sem probabilidade de 2T (2T já em curso, ou payload pré-S05).
  if (national.p_segundo_turno_overall == null) return null;
  // Gate 2: probabilidade de 2T abaixo do limiar de relevância.
  if (national.p_segundo_turno_overall < RUNOFF_SCENARIOS_MIN_P) return null;
  // Gate 3: array vazio (orchestrator não emitiu cenários neste ciclo).
  if (!national.cenarios_2t || national.cenarios_2t.length === 0) return null;

  // Lookup por id — montamos um Map para O(1).
  const byId = new Map<number, EdgeCandidate>();
  for (const c of candidatos) byId.set(c.id, c);

  // Filtra pares com candidatos válidos e pega top-N.
  const cenarios = national.cenarios_2t
    .map((s) => {
      const [idA, idB] = s.par;
      const a = byId.get(idA);
      const b = byId.get(idB);
      if (!a || !b) return null;
      return { a, b, prob: s.prob };
    })
    .filter((s): s is { a: EdgeCandidate; b: EdgeCandidate; prob: number } => s !== null)
    .slice(0, topN);

  // Após filtro de validade pode não sobrar nada — degradação silenciosa.
  if (cenarios.length === 0) return null;

  const containerClass = ["flex flex-col gap-3", className].filter(Boolean).join(" ");

  return (
    <section aria-labelledby="runoff-scenarios-heading" className={containerClass}>
      <header className="flex flex-col gap-1">
        <h2
          id="runoff-scenarios-heading"
          className="text-lg font-semibold"
          style={{ fontFamily: "var(--font-serif)", color: "var(--color-text)" }}
        >
          Cenários para o segundo turno
        </h2>
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          Duelos mais prováveis caso a eleição não decida no 1º turno.
        </p>
      </header>

      <ul aria-label="Top cenários para o segundo turno" className="flex flex-col gap-2">
        {cenarios.map((s, idx) => {
          const probPct = Math.round(s.prob * 100);
          const probLabel = formatPercent(s.prob * 100, 0);
          const corA = colorForRank(s.a.rank);
          const corB = colorForRank(s.b.rank);
          const ariaLabel = `Cenário ${idx + 1}: ${s.a.nome} versus ${s.b.nome}, ${probLabel} de probabilidade.`;

          return (
            <li key={`${s.a.id}-${s.b.id}`} aria-label={ariaLabel} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: corA }}
                  />
                  <span className="truncate text-sm font-medium">
                    {s.a.nome}{" "}
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      ({s.a.partido})
                    </span>
                  </span>
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                    vs
                  </span>
                  <span
                    aria-hidden="true"
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: corB }}
                  />
                  <span className="truncate text-sm font-medium">
                    {s.b.nome}{" "}
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      ({s.b.partido})
                    </span>
                  </span>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{probLabel}</span>
              </div>
              {/* Barra horizontal — probabilidade do par.
                  biome-ignore lint/a11y/useSemanticElements: meter nativo não estiliza. */}
              <div
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={probPct}
                aria-label={`${probLabel} de probabilidade`}
                className="relative h-1.5 w-full overflow-hidden rounded-sm"
                style={{ backgroundColor: "var(--color-bg-muted)" }}
              >
                {/* Split A | B proporcional — A à esquerda (cor do líder do par). */}
                <div
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${probPct}%`,
                    background: `linear-gradient(to right, ${corA} 0%, ${corA} 50%, ${corB} 50%, ${corB} 100%)`,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
