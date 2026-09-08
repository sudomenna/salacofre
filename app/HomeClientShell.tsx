"use client";

/**
 * app/HomeClientShell.tsx
 *
 * Shell client-side da home — encapsula o estado do `<MapViewToggle />` e
 * passa para o `<NationalChoroplethMap />` sem forçar a página inteira a
 * virar Client Component.
 *
 * Por que assim
 *   - `app/page.tsx` é Server Component (leitura de Edge Config, RNF-002).
 *   - O toggle precisa de `useState`. Encapsulamos só o que precisa de
 *     interatividade aqui, mantendo o restante em RSC.
 *
 * Spec 003 — Fase E. Cobre RF-030.2 (toggle muda coloração do mapa).
 *
 * S05/F4 (ADR-0013 / paleta N-way): aceita `rankByLider` (mapping
 * `candidato_id → rank nacional`) construído em `app/page.tsx` a partir
 * de `national.candidatos[]` e propaga para o mapa, que usa
 * `colorForRank()`/`resolveCandHex()` pra colorir UFs por líder local.
 */

import { useState } from "react";

import { type MapView, MapViewToggle } from "@/components/atoms/controls/MapViewToggle";
import { NationalChoroplethMap } from "@/components/blocks/NationalChoroplethMap";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";

export interface HomeClientShellProps {
  rows: EdgeUfRow[];
  candidatoAId: number | null;
  /**
   * Mapping `candidato_id → rank nacional` (S05/F4). Propagado direto pro
   * `<NationalChoroplethMap />`. Quando omitido, o mapa cai no modo
   * back-compat S04 (líder = vermelho usando `candidatoAId`).
   */
  rankByLider?: Record<number, number>;
  /**
   * `EdgeNational.candidatos` (S07/Bloco 1 — ADR-0024). Repassado sem
   * transformação: é o que habilita cor por partido, `<HoverCard>` com nome
   * e a `<MapLegend>` no `<NationalChoroplethMap />`. Ausente, o mapa degrada
   * para o comportamento por rank.
   */
  candidatos?: EdgeCandidate[];
}

export function HomeClientShell({
  rows,
  candidatoAId,
  rankByLider,
  candidatos,
}: HomeClientShellProps) {
  const [view, setView] = useState<MapView>("winner");

  return (
    <section
      aria-label="Mapa coroplético do Brasil"
      className="flex flex-col"
      style={{ gap: "var(--space-3)" }}
    >
      <div
        className="flex flex-wrap items-center justify-between"
        style={{ gap: "var(--space-2)" }}
      >
        <h2 style={{ margin: 0, font: "var(--type-title)" }}>Brasil — visão geral</h2>
        <MapViewToggle value={view} onChange={setView} />
      </div>
      <NationalChoroplethMap
        rows={rows}
        candidatoAId={candidatoAId}
        view={view}
        rankByLider={rankByLider}
        candidatos={candidatos}
      />
    </section>
  );
}
