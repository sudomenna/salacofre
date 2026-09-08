"use client";

/**
 * app/HomeClientShell.tsx
 *
 * Shell client-side do bloco de mapa da home — encapsula o estado do
 * `<MapViewToggle />` e a leitura do controle "Parcial / Projeção" do shell,
 * sem forçar a página inteira a virar Client Component.
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
 *
 * ## S07/Bloco 2 (ADR-0029) — mapa primeiro
 *
 * `variant="hero"` é a forma que o bloco assume como PRIMEIRO conteúdo da
 * página: altura de viewport (`clamp(400px, 52vh, 520px)` no mobile, teto
 * fixo no desktop — ADR-0029 § 1) e cabeçalho reduzido a uma linha de
 * kicker + toggle, para o mapa começar o mais alto possível na dobra.
 * `variant="section"` mantém o formato antigo, com `<h2>` em serifa.
 *
 * Este é também o único lugar da página que precisa do "Parcial / Projeção"
 * em **JavaScript**: repintar o choropleth é imperativo (MapLibre
 * `setPaintProperty`), não dá para resolver por cascata como o resto da
 * página faz. Por isso `useViewMode()` aparece aqui e em nenhum outro
 * componente de dado.
 */

import { useState } from "react";
import { type MapView, MapViewToggle } from "@/components/atoms/controls/MapViewToggle";
import { NationalChoroplethMap } from "@/components/blocks/NationalChoroplethMap";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";
import { useViewMode } from "@/lib/state/view-mode-client";

/** Altura do mapa hero — `52vh` do protótipo, com piso e teto (ADR-0029 § 1). */
const HERO_HEIGHT = "clamp(400px, 52vh, 520px)";

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
  /** `hero` = primeiro bloco da página (ADR-0029 § 1). Default `section`. */
  variant?: "hero" | "section";
}

export function HomeClientShell({
  rows,
  candidatoAId,
  rankByLider,
  candidatos,
  variant = "section",
}: HomeClientShellProps) {
  const [view, setView] = useState<MapView>("winner");
  const viewMode = useViewMode();
  const hero = variant === "hero";

  return (
    <section
      aria-label="Mapa coroplético do Brasil"
      className="flex flex-col"
      style={{ gap: "var(--space-2)" }}
    >
      <div
        className="flex flex-wrap items-center justify-between"
        style={{ gap: "var(--space-2)" }}
      >
        {/* No hero o título encolhe para um kicker: o mapa é o conteúdo, e
            um `<h2>` em serifa de 22px antes dele custaria uma linha da
            primeira dobra em 430px. Continua `<h2>` de verdade — só a escala
            muda, mesma decisão do `<h1>` no ADR-0029 § 5. */}
        <h2
          style={
            hero
              ? {
                  margin: 0,
                  font: "var(--type-kicker)",
                  letterSpacing: "var(--tracking-caps)",
                  textTransform: "uppercase",
                  color: "var(--text-secondary)",
                }
              : { margin: 0, font: "var(--type-title)" }
          }
        >
          {hero ? "Brasil · quem lidera cada estado" : "Brasil — visão geral"}
        </h2>
        <MapViewToggle value={view} onChange={setView} />
      </div>
      <NationalChoroplethMap
        rows={rows}
        candidatoAId={candidatoAId}
        view={view}
        rankByLider={rankByLider}
        candidatos={candidatos}
        viewMode={viewMode}
        height={hero ? HERO_HEIGHT : 420}
      />
    </section>
  );
}
