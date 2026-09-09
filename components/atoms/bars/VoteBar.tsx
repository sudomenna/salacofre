/**
 * components/atoms/bars/VoteBar.tsx
 *
 * Barra empilhada de participação no total (estilo NYT/AP) com marcador de
 * 50%. Design system Atlas Menna (ADR-0025, Bloco 1), portado de
 * `docs/design-system/atlas-menna/components/data/VoteBar.jsx`.
 *
 * Server Component puro — zero JS novo (RNF-007a).
 *
 * Divergências deliberadas em relação ao `.jsx` do kit:
 *   - o kit importava `partyColor(sigla)` de `PartyTag.jsx`. Aqui a cor é
 *     SEMPRE explícita no segmento (`color`), porque o mapeamento sigla → cor
 *     é do ADR-0024 e mora em `lib/utils/party-color.ts` — este átomo não
 *     conhece partido nenhum. Sem `color`, o segmento cai em
 *     `var(--party-outros, var(--color-cand-other))`: quando os tokens
 *     `--party-*` entrarem, o fallback deixa de ser usado sozinho.
 *   - percentuais são clampeados em [0, 100] e formatados por
 *     `formatPercent()` (pt-BR). Determinismo, constituição § 6.
 *   - a barra ganhou `role="img"` + `aria-label` com a série completa: uma
 *     divisão colorida sem texto alternativo é invisível para leitor de tela
 *     (RNF-022/023). Os `title` de cada segmento continuam, para o mouse.
 */

import type { CSSProperties } from "react";

import { formatPercent } from "@/lib/utils/format";

/** Fallback enquanto os tokens `--party-*` (ADR-0024) não entram em globals.css. */
export const VOTE_BAR_FALLBACK_COLOR = "var(--party-outros, var(--color-cand-other))";

export interface VoteBarSegment {
  /**
   * Identidade estável do segmento — id do candidato, ou um literal como
   * `"outros"`. Só serve de chave React; não é exibida. Opcional porque
   * chamadores antigos passam só `label`, mas passe sempre que houver id:
   * o rótulo é o primeiro nome e pode repetir entre candidatos.
   */
  id?: string | number;
  /** Nome exibido no tooltip e no texto alternativo. */
  label: string;
  /** Participação em 0–100. */
  pct: number;
  /** Cor do segmento, sempre como `var(--token)`. */
  color?: string;
}

export interface VoteBarProps {
  /** Segmentos na ordem em que devem aparecer, da esquerda para a direita. */
  segments: readonly VoteBarSegment[];
  height?: number;
  /** Posição do marcador em 0–100. `null` remove a linha. Default 50. */
  marker?: number | null;
  /** Linha de rótulos abaixo da barra (primeiro segmento, marcador, segundo). */
  showLabels?: boolean;
  /** Sobrescreve o texto alternativo gerado a partir dos segmentos. */
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}

function clampPct(pct: number): number {
  if (Number.isNaN(pct)) return 0;
  return Math.max(0, Math.min(100, pct));
}

/** "Lula 41,2%, Flávio 36,8%, Outros 22,0%" — série completa para leitor de tela. */
export function voteBarLabel(segments: readonly VoteBarSegment[]): string {
  return segments.map((s) => `${s.label} ${formatPercent(s.pct)}`).join(", ");
}

export function VoteBar({
  segments,
  height = 14,
  marker = 50,
  showLabels = true,
  ariaLabel,
  className,
  style,
}: VoteBarProps) {
  const first = segments[0];
  const second = segments[1];

  return (
    <div data-testid="vote-bar" className={className} style={style}>
      <div
        role="img"
        aria-label={ariaLabel ?? voteBarLabel(segments)}
        data-testid="vote-bar-track"
        className="relative flex overflow-hidden rounded-xs"
        style={{ height, background: "var(--surface-sunken)" }}
      >
        {segments.map((s, i) => (
          <div
            // A identidade do segmento é o `id`, com o rótulo só como reserva.
            //
            // O rótulo NÃO serve como chave: ele é o primeiro nome do candidato
            // (`nome.split(" ")[0]`), e dois candidatos podem compartilhá-lo —
            // "José Silva" e "José Almeida" na mesma corrida colidiriam.
            // Medido em 09/09 com a fixture ("Candidato PT" e "Candidato PL"):
            // o React acusou duas chaves `Candidato` e avisou que pode duplicar
            // ou omitir filhos. O protótipo tem o mesmo defeito
            // (`App.jsx:35`) — não copiar.
            key={s.id ?? `${i}:${s.label}`}
            data-testid="vote-bar-segment"
            data-label={s.label}
            title={`${s.label} ${formatPercent(s.pct)}`}
            style={{
              width: `${clampPct(s.pct)}%`,
              background: s.color ?? VOTE_BAR_FALLBACK_COLOR,
              transition: "width var(--dur-slow) var(--ease-out)",
              borderRight: i < segments.length - 1 ? "1px solid var(--surface-card)" : undefined,
            }}
          />
        ))}
        {marker != null ? (
          <div
            data-testid="vote-bar-marker"
            aria-hidden="true"
            className="absolute"
            style={{
              top: -2,
              bottom: -2,
              left: `${clampPct(marker)}%`,
              width: 2,
              background: "var(--border-strong)",
            }}
          />
        ) : null}
      </div>
      {showLabels ? (
        <div
          aria-hidden="true"
          data-testid="vote-bar-labels"
          className="flex justify-between"
          style={{
            marginTop: "var(--space-2)",
            font: "var(--type-data)",
            color: "var(--text-secondary)",
          }}
        >
          <span>{first ? `${first.label} ${formatPercent(first.pct)}` : ""}</span>
          <span>{marker != null ? `${Math.round(clampPct(marker))}%` : ""}</span>
          <span>{second ? `${second.label} ${formatPercent(second.pct)}` : ""}</span>
        </div>
      ) : null}
    </div>
  );
}
