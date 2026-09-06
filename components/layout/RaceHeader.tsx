/**
 * components/layout/RaceHeader.tsx
 *
 * Cabeçalho compartilhado pelas quatro páginas de corrida (ADR-0019):
 * `/`, `/uf/[sigla]`, `/governador`, `/uf/[sigla]/governador`.
 *
 * Estrutura (de cima para baixo):
 *   [breadcrumb opcional]
 *   TrilhaKicker            ← regra superior + "PRESIDÊNCIA · Brasil › SP"
 *   h1 (+ subtítulo)  |  LiveBadge · TurnoBadge · extras
 *   Tabs de cargo (opcional)
 *
 * Por que existe: antes de S07/Fase 2 as quatro páginas montavam headers
 * quase idênticos, e a única diferença perceptível entre trilhas era o
 * `href` do breadcrumb. Concentrar o chrome aqui garante que o accent de
 * trilha, o kicker e a ordem dos badges não divirjam entre rotas.
 *
 * Trilha duplicada no kicker + breadcrumb (achado a11y-perf-auditor
 * 2026-09-05, ver `app/uf/[sigla]/page.tsx`): quando `crumbs` repete
 * literalmente o que o `breadcrumb` da página já mostra (caso de
 * `/uf/[sigla]` presidencial: kicker "PRESIDÊNCIA · Brasil › SP" sobre
 * `<UFBreadcrumb>` "Brasil › SP"), a página deve passar `crumbs` mais curto
 * (ex.: `[]`) para o kicker não repetir o que o breadcrumb (nav com links
 * reais, RF-031) já anuncia. Este componente não decide isso sozinho — a
 * trilha de governador (`/uf/[sigla]/governador`) intencionalmente passa
 * `crumbs={[sigla]}` mesmo com breadcrumb presente, porque o texto não
 * coincide 1:1 ("GOVERNADOR · SP" vs. "Governadores › SP" no breadcrumb) e
 * um teste de integração fixa esse comportamento.
 *
 * O `<h1>` é **opcional** de propósito: na home em modo `binary` (2º turno)
 * o `<h1>` continua sendo o do `<HeadlineScore />` (ADR-0017 intocado para
 * 2T) — passar `titulo` ali criaria dois `<h1>` na mesma página. Em
 * `multi-1t`, onde o `HeadlineScore` sai do hero (ADR-0018), o `<h1>` passa
 * a ser emitido aqui.
 *
 * Server Component puro — sem `"use client"`, sem hooks, sem `framer-motion`
 * (RNF-007a: é o primeiro bloco above-the-fold das quatro páginas).
 */

import type { ReactNode } from "react";
import { TurnoBadge } from "@/components/atoms/badges/TurnoBadge";
import type { TabsOption } from "@/components/atoms/controls/Tabs";
import { Tabs } from "@/components/atoms/controls/Tabs";
import { type Trilha, TrilhaKicker } from "@/components/atoms/nav/TrilhaKicker";
import { LiveBadge } from "@/components/layout/LiveBadge";

export interface RaceHeaderProps {
  /** Trilha da página — dita rótulo e accent do kicker. */
  trilha: Trilha;
  /** Profundidade da trilha exibida no kicker (ex.: `["Brasil", "SP"]`). */
  crumbs: string[];
  /** Título da página. Omitido → nenhum `<h1>` é emitido (ver doc acima). */
  titulo?: string;
  /** Linha de apoio abaixo do título. */
  subtitulo?: ReactNode;
  /** `id` do `<h1>` — útil para `aria-labelledby` de seções irmãs. */
  headingId?: string;
  /** Tabs de cargo (Presidente | Governador | …). Omitido → sem tabs. */
  tabs?: {
    ariaLabel?: string;
    value: string;
    options: ReadonlyArray<TabsOption>;
  };
  /** `undefined` → sem LiveBadge; boolean → badge com esse estado. */
  liveActive?: boolean;
  /** `undefined` → sem TurnoBadge. */
  turno?: 1 | 2;
  /** Breadcrumb renderizado acima do kicker (páginas de drill-down). */
  breadcrumb?: ReactNode;
  /** Badges extras à direita (ex.: `<RaceTypeIndicator />`). */
  extras?: ReactNode;
  className?: string;
}

export function RaceHeader({
  trilha,
  crumbs,
  titulo,
  subtitulo,
  headingId,
  tabs,
  liveActive,
  turno,
  breadcrumb,
  extras,
  className,
}: RaceHeaderProps) {
  const hasBadges = liveActive !== undefined || turno !== undefined || extras != null;

  return (
    <header
      data-trilha-header={trilha}
      className={["flex flex-col gap-3", className].filter(Boolean).join(" ")}
    >
      {breadcrumb}

      <TrilhaKicker trilha={trilha} crumbs={crumbs} />

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        {/* `items-start` para as Tabs continuarem hugging o próprio conteúdo:
            num flex column elas esticariam para a largura da coluna. */}
        <div className="flex flex-col items-start gap-2">
          {titulo && (
            <h1
              id={headingId}
              className="text-3xl leading-tight md:text-4xl"
              style={{ fontFamily: "var(--font-serif)", color: "var(--color-text)" }}
            >
              {titulo}
            </h1>
          )}
          {subtitulo && (
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {subtitulo}
            </p>
          )}
          {tabs && (
            // Cinco tabs (Presidente…Assembleias) somam ~520px: em 375px a
            // faixa rola dentro do próprio contêiner em vez de empurrar a
            // página inteira para o scroll horizontal.
            <div className="max-w-full overflow-x-auto">
              <Tabs
                ariaLabel={tabs.ariaLabel ?? "Cargo"}
                value={tabs.value}
                options={tabs.options}
              />
            </div>
          )}
        </div>

        {hasBadges && (
          <div className="flex flex-wrap items-center gap-3">
            {liveActive !== undefined && <LiveBadge active={liveActive} />}
            {turno !== undefined && <TurnoBadge turno={turno} />}
            {extras}
          </div>
        )}
      </div>
    </header>
  );
}
