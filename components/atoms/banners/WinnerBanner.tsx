/**
 * components/atoms/banners/WinnerBanner.tsx
 *
 * RF-032 — Banner colorido quando `p_vitoria_lider ≥ 0.95`.
 *
 * Server Component puro. Recebe nome + partido + cor (token semântico, NUNCA
 * cor partidária oficial — constituição § 2). Não decide se mostra: o caller
 * (page de UF) faz o teste `>= 0.95` antes de renderizar.
 *
 * A11y:
 *   - `role="status"` + `aria-live="polite"` — leitor de tela anuncia quando
 *     o banner aparecer mid-apuração.
 *   - Texto adaptativo via prop `rank`: branco sobre cores escuras (rank 1
 *     vermelho, rank 2 azul) — contraste >4.5:1 garantido. Texto escuro
 *     (`--color-text`) sobre cores médias/claras (rank 3 âmbar #c97c1f,
 *     rank 4 verde-oliva, rank 5 lilás, rank 6 taupe) — corrige MEDIUM P4
 *     do constitution-guard S05 (contraste #ffffff sobre cand-3 era ~2.8:1).
 */

import type { CSSProperties } from "react";

export interface WinnerBannerProps {
  /** Nome do candidato vencedor. */
  candidato: string;
  /** Partido (texto curto, ex. "PT", "PL"). */
  partido: string;
  /** Sigla da UF em maiúscula (ex. "SP"). Usado no copy do banner. */
  ufSigla: string;
  /**
   * Cor de fundo do banner — variável CSS (`var(--color-pt)` etc.) OU hex.
   * Constituição § 2: nunca cor partidária oficial; sempre token semântico
   * do design system.
   */
  cor: string;
  /**
   * Rank do candidato (1..6 ou >6 = other). Define cor de texto:
   * rank ∈ {1, 2} → texto branco (cores escuras); rank ≥ 3 → texto escuro
   * (`--color-text`). Default: assume rank 1 (vermelho) → branco. Resolve
   * MEDIUM P4 constitution-guard S05.
   */
  rank?: number;
}

/** Ranks 1 e 2 têm fundos escuros (vermelho/azul); demais são médios/claros. */
function shouldUseDarkText(rank: number | undefined): boolean {
  return rank != null && rank >= 3;
}

export function WinnerBanner({ candidato, partido, ufSigla, cor, rank }: WinnerBannerProps) {
  const useDarkText = shouldUseDarkText(rank);
  const style: CSSProperties = {
    backgroundColor: cor,
    color: useDarkText ? "var(--color-text)" : "#ffffff",
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Vencedor projetado: ${candidato} (${partido}) em ${ufSigla}`}
      className="flex flex-col gap-1 rounded-md px-5 py-4"
      style={style}
    >
      <span className="text-xs font-medium uppercase tracking-wider opacity-90">
        Vencedor projetado
      </span>
      <strong className="text-2xl font-semibold leading-tight">
        {candidato} vence em {ufSigla}
      </strong>
      <span className="text-sm opacity-90">{partido}</span>
    </div>
  );
}
