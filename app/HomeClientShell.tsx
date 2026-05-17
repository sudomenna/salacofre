"use client";

/**
 * app/HomeClientShell.tsx
 *
 * Shell client-side da home — encapsula o estado do `<MapViewToggle />` e
 * passa para o `<NationalChoroplethMap />` (via children clone) sem forçar
 * a página inteira a virar Client Component.
 *
 * Por que assim
 *   - `app/page.tsx` é Server Component (leitura de Edge Config, RNF-002).
 *   - O toggle precisa de `useState`. Encapsulamos só o que precisa de
 *     interatividade aqui, mantendo o restante em RSC.
 *
 * Spec 003 — Fase E. Cobre RF-030.2 (toggle muda coloração do mapa).
 *
 * Nota: enquanto o `<NationalChoroplethMap />` real (MapLibre + PMTiles)
 * estiver em construção (despachar `map-builder`), o toggle apenas atualiza
 * o label. A integração final acontece no follow-up — esta camada de
 * estado já está preparada.
 */

import { type ReactNode, useState } from "react";

import { type MapView, MapViewToggle } from "@/components/atoms/controls/MapViewToggle";
import { NationalChoroplethMap } from "@/components/blocks/NationalChoroplethMap";
import type { EdgeUfRow } from "@/lib/edge-config/types";

export interface HomeClientShellProps {
  rows: EdgeUfRow[];
  candidatoAId: number | null;
  /** Children não usado hoje — reservado para custom slots. */
  children?: ReactNode;
}

export function HomeClientShell({ rows, candidatoAId }: HomeClientShellProps) {
  const [view, setView] = useState<MapView>("winner");

  return (
    <section aria-label="Mapa coroplético do Brasil" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl" style={{ fontFamily: "var(--font-serif)" }}>
          Brasil — visão geral
        </h2>
        <MapViewToggle value={view} onChange={setView} />
      </div>
      <NationalChoroplethMap rows={rows} candidatoAId={candidatoAId} view={view} />
    </section>
  );
}
