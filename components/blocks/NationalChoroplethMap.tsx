"use client";

/**
 * components/blocks/NationalChoroplethMap.tsx
 *
 * Wrapper client-side do mapa coroplético do Brasil. **STUB**.
 *
 * Cobertura: RF-030.1, RF-030.3, RF-030.4.
 *
 * Por que stub agora
 *   - O setup completo MapLibre + PMTiles + estilo + interatividade
 *     (hover/click → /uf/[sigla]) é trabalho substancial e deve ser
 *     despachado para o subagent `map-builder` em follow-up.
 *   - Esta versão renderiza o `<MapSkeleton />` permanentemente, mas já
 *     consome a prop `view: MapView` para que o pai possa trocar o modo
 *     sem refator.
 *   - Quando o map-builder entrega o componente real, este arquivo é
 *     substituído por dynamic import com `ssr: false` (ADR-0010).
 *
 * Decisão de design:
 *   - Mantemos como Client Component aqui (boundary), mas Por enquanto
 *     o conteúdo é SSR-friendly (skeleton SVG). Isso garante que o pai
 *     em RSC possa importar diretamente sem `next/dynamic`.
 *   - Quando o mapa real chegar, o import passa por `next/dynamic`
 *     com `ssr: false`.
 *
 * A11y
 *   - Skeleton anuncia "Mapa do Brasil carregando".
 *   - Toggle de view é responsabilidade do `<MapViewToggle />` (irmão).
 *   - Tabela `<StateGroupedTable />` cumpre o fallback acessível ao mapa
 *     (RNF-022 — fallback de tabela para gráficos).
 */

import type { MapView } from "@/components/atoms/controls/MapViewToggle";
import { MapSkeleton } from "@/components/atoms/maps/MapSkeleton";
import type { EdgeUfRow } from "@/lib/edge-config/types";

export interface NationalChoroplethMapProps {
  rows: EdgeUfRow[];
  candidatoAId: number | null;
  view: MapView;
  /** Altura do mapa em px. */
  height?: number;
  className?: string;
}

const VIEW_LABEL: Record<MapView, string> = {
  winner: "Por vencedor",
  margin: "Margem",
  swing: "Swing vs 2022",
  turnout: "% apurado",
};

export function NationalChoroplethMap({
  rows,
  view,
  height = 420,
  className,
}: NationalChoroplethMapProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: role=region em div é correto; <section> exigiria aria-labelledby (aqui usamos aria-label inline).
    <div
      role="region"
      aria-label={`Mapa coroplético do Brasil — modo ${VIEW_LABEL[view]}`}
      className={["relative w-full", className].filter(Boolean).join(" ")}
    >
      <MapSkeleton height={height} />
      <p className="mt-2 text-center text-xs" style={{ color: "var(--color-text-muted)" }}>
        Mapa interativo em construção · {rows.length} UFs · modo {VIEW_LABEL[view]} · navegue pela
        tabela abaixo
      </p>
    </div>
  );
}
