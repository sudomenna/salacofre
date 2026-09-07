/**
 * lib/utils/participacao.ts
 *
 * Helpers do denominador misto do hero de 1º turno (S07/Fase 2).
 *
 * Por que existe
 *   O hero de 1T mostra seis termômetros que NÃO compartilham denominador:
 *   candidatos e "Outros" são % sobre os votos a votáveis concorrentes
 *   (o `pvap` do TSE = válidos + anulados + sub judice — dicionário oficial
 *   em `docs/reference/tse-2026-leiautes.md`), brancos/nulos são % do
 *   comparecimento e abstenção é % dos eleitores das seções instaladas.
 *   Somar os seis dá um número sem significado; por isso cada termômetro
 *   carrega o rótulo da sua base e o bloco carrega uma legenda única.
 *
 * Determinismo (constituição § 6): funções puras, sem `Date`, sem random.
 */

import type { EdgeCandidate, EdgeUfCandidate, ParticipacaoBase } from "@/lib/edge-config/types";

/**
 * Frase do denominador SEM o prefixo "%", para compor `aria-label`
 * (onde o número já vem com o símbolo: "21,4% dos eleitores das seções
 * instaladas").
 */
export function denominadorFrase(base: ParticipacaoBase): string {
  switch (base) {
    case "votaveis":
      return "dos votos a votáveis";
    case "comparecimento":
      return "do comparecimento";
    case "eleitores_instalados":
      return "dos eleitores das seções instaladas";
  }
}

/**
 * Rótulo visível do denominador — usado no rodapé de cada termômetro.
 *
 * Nunca dizer "% dos válidos" para `votaveis`: o TSE publica `pvap` sobre
 * votos a votáveis concorrentes, que inclui anulados e sub judice.
 */
export function denominadorLabel(base: ParticipacaoBase): string {
  return `% ${denominadorFrase(base)}`;
}

/**
 * Base do denominador que o leitor pode ESCOLHER para candidatos e "Outros"
 * (S07/Fase 5, decisão E2b). Subconjunto de `ParticipacaoBase`:
 * `eleitores_instalados` é base exclusiva da abstenção e nunca de candidato,
 * então não entra no toggle.
 *
 * Vive aqui (e não no bloco que a consome) porque `components/atoms/controls/
 * BaseToggle.tsx` também precisa do tipo: atom não pode importar de block
 * (`docs/architecture/folder-structure.md` — lib → atoms → blocks → app).
 */
export type ProjectionBase = "votaveis" | "comparecimento";

/** Candidato de qualquer um dos dois shapes do payload (nacional ou UF). */
export type AnyEdgeCandidate = EdgeCandidate | EdgeUfCandidate;

/**
 * Fallback do agregado "Outros candidatos" quando `participacao.outros`
 * não vem no payload: `100 − Σ(top 3 pct_projetado)`, clampado em [0, 100].
 *
 * É só um resto aritmético — **não tem intervalo de confiança**. O chamador
 * deve marcar o termômetro com a nota "IC indisponível" (mesmo padrão de
 * `components/blocks/GovernorCard.tsx`, que deriva "Outros" de
 * `100 − Σ top_candidatos`).
 *
 * `topN` existe para o caso de UF com menos de 3 candidatos no payload.
 */
export function outrosFallback(candidatos: readonly AnyEdgeCandidate[], topN = 3): number {
  const soma = candidatos
    .slice(0, topN)
    .reduce((acc, c) => acc + (Number.isFinite(c.pct_projetado) ? c.pct_projetado : 0), 0);
  return Math.max(0, Math.min(100, 100 - soma));
}

/**
 * Quantos candidatos ficam "dentro" de Outros (rank ≥ topN + 1) — usado no
 * subtítulo do termômetro quando o payload não trouxe `n_candidatos`.
 */
export function outrosCount(candidatos: readonly AnyEdgeCandidate[], topN = 3): number {
  return Math.max(0, candidatos.length - topN);
}
