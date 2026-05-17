/**
 * components/atoms/maps/MapSkeleton.tsx
 *
 * Placeholder visual (SVG estático) para enquanto o chunk do mapa
 * (MapLibre + PMTiles) carrega via `next/dynamic({ ssr: false })`.
 *
 * Por que existe (ADR-0010):
 *   - O LCP da home (RNF-002 < 2.5s) não pode esperar MapLibre (~200KB gzip).
 *   - Renderizamos uma silhueta cinza simples para que o usuário tenha
 *     feedback imediato de "vai vir um mapa aqui".
 *
 * Server Component puro — zero JS. Sem reduced-motion concern (sem animação).
 *
 * A11y
 *   - role="img" + aria-label "Mapa do Brasil carregando".
 *   - Tem `aria-busy="true"` enquanto está visível.
 */

export interface MapSkeletonProps {
  className?: string;
  /** Altura em px. Default 400 (proporção brasileira ~1.1:1). */
  height?: number;
}

export function MapSkeleton({ className, height = 400 }: MapSkeletonProps) {
  return (
    <div
      role="img"
      aria-label="Mapa do Brasil carregando"
      aria-busy="true"
      className={["w-full rounded-md border", className].filter(Boolean).join(" ")}
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg-muted)",
        height,
      }}
      data-testid="map-skeleton"
    >
      <svg
        viewBox="0 0 360 320"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <title>Silhueta do Brasil (placeholder)</title>
        {/* Silhueta hiper-simplificada — bom o suficiente como placeholder.
            Não pretende ser geograficamente preciso. */}
        <path
          d="M 130 40 L 220 50 L 270 120 L 290 180 L 250 240 L 200 270
             L 160 280 L 120 260 L 80 200 L 70 140 L 100 70 Z"
          fill="var(--color-border)"
          opacity="0.6"
        />
      </svg>
    </div>
  );
}
