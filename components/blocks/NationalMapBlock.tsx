"use client";

/**
 * components/blocks/NationalMapBlock.tsx
 *
 * Shell client-side do bloco do mapa nacional — encapsula o estado do
 * `<MapViewToggle />` e a leitura do controle "Parcial / Projeção" do shell,
 * sem forçar quem o hospeda a virar Client Component.
 *
 * Chamava-se `HomeClientShell` e morava em `app/HomeClientShell.tsx` até o
 * ADR-0033 § 1. Mudou de nome e de lugar porque deixou de ser um bloco da
 * home: agora é a coluna persistente do `<AppShellSplit>`, montada pelo
 * `<PersistentMapFrame />` do `layout.tsx` do grupo `(pres)` e viva também nas
 * rotas de UF.
 *
 * Por que assim
 *   - as páginas que o hospedavam são Server Components (leitura de Edge
 *     Config, RNF-002).
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

import Link from "next/link";
import type { CSSProperties } from "react";
import { useState } from "react";
import { type MapView, MapViewToggle } from "@/components/atoms/controls/MapViewToggle";
import { NationalChoroplethMap } from "@/components/blocks/NationalChoroplethMap";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";
import { useViewMode } from "@/lib/state/view-mode-client";

/** Altura do mapa hero — `52vh` do protótipo, com piso e teto (ADR-0029 § 1). */
const HERO_HEIGHT = "clamp(400px, 52vh, 520px)";

/**
 * A etiqueta que o kit sobrepõe ao mapa (`App.jsx`, o `<span>` do canto
 * superior esquerdo do `mapBlock`): kicker em caixa alta sobre a superfície
 * de cartão, com filete fino. Usada no `variant="frame"` pelo rótulo de
 * escopo e pelo link de volta.
 */
/**
 * Exportado desde ADR-0033 § 1: `PersistentMapFrame` reaproveita o MESMO
 * estilo para o chip do coroplético municipal (nível UF) — mesma moldura
 * visual, chip diferente (mapa diferente).
 */
export const CHIP_STYLE: CSSProperties = {
  font: "var(--type-kicker)",
  letterSpacing: "var(--tracking-caps)",
  textTransform: "uppercase",
  color: "var(--text-primary)",
  background: "var(--surface-card)",
  border: "1px solid var(--border-hairline)",
  borderRadius: "var(--radius-sm)",
  padding: "6px 8px",
  textDecoration: "none",
  whiteSpace: "nowrap",
};

export interface NationalMapBlockProps {
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
  /**
   * `hero` = primeiro bloco da página (ADR-0029 § 1).
   * `frame` = o bloco PREENCHE a moldura persistente do `<AppShellSplit>`
   *   (ADR-0033 § 1): mapa em `height: 100%`, título e controles sobrepostos
   *   nos cantos, legenda em caixa flutuante — a mesma composição do
   *   `mapBlock` do kit (`App.jsx`), onde o mapa é a coluna inteira e todo o
   *   cromo é overlay.
   * Default `section`.
   */
  variant?: "hero" | "section" | "frame";
  /**
   * Só em `frame`: o rótulo do escopo, na etiqueta do canto superior
   * esquerdo (`App.jsx` — `{stateUF ? stateUF.sigla : race.label + ' · Brasil'}`).
   * Default "Presidente · Brasil".
   */
  scopeLabel?: string;
  /**
   * Só em `frame`: quando presente, desenha ao lado da etiqueta um link de
   * volta ao nível Brasil — o botão "Brasil" que o kit sobrepõe ao mapa
   * (`App.jsx`, `goBack`). Aqui é `<Link>`, não `onClick`: o nível é rota.
   */
  backHref?: string;
}

export function NationalMapBlock({
  rows,
  candidatoAId,
  rankByLider,
  candidatos,
  variant = "section",
  scopeLabel = "Presidente · Brasil",
  backHref,
}: NationalMapBlockProps) {
  const [view, setView] = useState<MapView>("winner");
  const viewMode = useViewMode();
  const hero = variant === "hero";

  if (variant === "frame") {
    return (
      <section aria-label="Mapa coroplético do Brasil" className="absolute inset-0">
        <NationalChoroplethMap
          rows={rows}
          candidatoAId={candidatoAId}
          view={view}
          rankByLider={rankByLider}
          candidatos={candidatos}
          viewMode={viewMode}
          height="100%"
          legendPlacement="overlay"
          // `h-full` e NÃO `absolute inset-0`: a raiz do `<NationalChoroplethMap>`
          // já traz `relative`, e duas utilitárias de `position` na mesma classe
          // brigam pela cascata (venceu `relative`, a altura ficou 0 e o mapa
          // sumiu — medido em 08/09). A `<section>` acima é quem posiciona.
          className="h-full"
        />
        {/* Cromo sobreposto ao mapa: etiqueta de escopo à esquerda, seletor de
            view à direita — a mesma disposição do `mapBlock` do kit. Uma ÚNICA
            faixa em `flex-wrap`, e não duas caixas ancoradas em cantos
            opostos: a 375px o `<MapViewToggle>` mede 364px e, ancorado no
            canto direito, cobria a etiqueta inteira (medido em 08/09). Aqui
            ele quebra para a linha de baixo quando não cabe ao lado dela. */}
        <div
          className="pointer-events-none absolute flex flex-wrap items-start justify-between"
          style={{
            top: "var(--space-3)",
            left: "var(--space-3)",
            right: "var(--space-3)",
            gap: "var(--space-2)",
          }}
        >
          {/* A etiqueta é também o `<h2>` da região: sem ela o bloco entraria
              no outline do documento como uma seção sem título. */}
          <div className="flex min-w-0 items-center" style={{ gap: "var(--space-2)" }}>
            {backHref ? (
              <Link href={backHref} className="pointer-events-auto" style={CHIP_STYLE}>
                ← Brasil
              </Link>
            ) : null}
            <h2 style={{ ...CHIP_STYLE, margin: 0 }}>{scopeLabel}</h2>
          </div>
          <div className="pointer-events-auto min-w-0">
            <MapViewToggle value={view} onChange={setView} />
          </div>
        </div>
      </section>
    );
  }

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
