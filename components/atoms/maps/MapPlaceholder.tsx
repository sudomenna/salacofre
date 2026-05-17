"use client";

/**
 * components/atoms/maps/MapPlaceholder.tsx
 *
 * Skeleton/placeholder usado enquanto o `map-builder` agente ainda não
 * substituiu por implementação real (MapLibre + PMTiles, ADR-0003/0004).
 *
 * Renderiza um div com altura fixa, borda discreta, e copy explicando
 * o estado. Reduce-motion safe (sem animações).
 *
 * Por que `'use client'` mesmo sem state? Porque os wrappers que importam
 * este componente via `next/dynamic({ ssr: false })` (ADR-0010) exigem
 * que o módulo de destino seja client. Mantemos a interface estável para
 * que o page final NUNCA precise mudar quando o map-builder substituir.
 */

export interface MapPlaceholderProps {
  /** Rótulo curto do mapa (ex. "Votos reportados", "Swing vs 2022"). */
  label: string;
  /** Altura em px. Default 360. */
  height?: number;
  /** Sigla da UF (apenas para display informativo no skeleton). */
  ufSigla?: string;
}

export function MapPlaceholder({ label, height = 360, ufSigla }: MapPlaceholderProps) {
  return (
    <div
      role="img"
      aria-label={`Mapa: ${label}${ufSigla ? ` — ${ufSigla}` : ""} (em construção)`}
      className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed"
      style={{
        height,
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg-muted)",
        color: "var(--color-text-muted)",
      }}
    >
      <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      <span className="text-sm">Mapa em construção (map-builder)</span>
      {ufSigla && <span className="text-xs opacity-70">UF: {ufSigla}</span>}
    </div>
  );
}
