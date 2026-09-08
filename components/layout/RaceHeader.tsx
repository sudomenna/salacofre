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
 *
 * S07/Bloco 1 — a faixa de abas de cargo (Presidente | Governador | …) SAIU
 * daqui. Ela agora é `<CargoTabs>` dentro do `<TopBar>` em `app/layout.tsx`,
 * ou seja, uma só vez por documento em vez de uma por página (ADR-0025 § 2).
 * Mantê-la também aqui produziria duas navegações de cargo na mesma tela e
 * dois landmarks concorrendo pelo mesmo papel. O que fica é o que pertence à
 * página: o kicker da trilha, o título da corrida e os badges de estado
 * (`LiveBadge`, `TurnoBadge`, `extras`) — nada disso o shell sabe, porque o
 * shell não lê dado por requisição.
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
