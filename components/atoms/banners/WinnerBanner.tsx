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
 *   - Texto sobre cor escura usa contraste >4.5:1 (cor de fundo do banner é
 *     o token --color-pt ou --color-pl, ambos suficientemente escuros).
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
}

export function WinnerBanner({ candidato, partido, ufSigla, cor }: WinnerBannerProps) {
  const style: CSSProperties = {
    backgroundColor: cor,
    color: "#ffffff",
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
