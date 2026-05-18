/**
 * app/governador/page.tsx
 *
 * Grid Nacional Governadores (T-02) — spec 006.
 *
 * Server Component RSC. Lê `EdgePayload` (cargo="gov", turno ativo) via
 * `readProjection({ cargo: "gov", turno })` (ADR-0001 + ADR-0012). Em dev
 * sem `EDGE_CONFIG`, o reader retorna `null` e caímos para um payload
 * "vazio gracioso" (UX nunca quebra — constituição § 3).
 *
 * Layout (S06/F4d — Fase 4):
 *   - `<BreakingNewsTicker>` no topo (chamadas recentes).
 *   - Tabs cargo: Presidente | Governador (active) | Senado | Congresso |
 *     Assembleias (3 últimas grayed-out + tooltip "Disponível em breve").
 *   - `<RaceStatsCards>` — eleitos / vai a 2T / em apuração (27 UFs).
 *   - `<HexCartogramBrasil>` — visão alternativa NYT-like.
 *   - Grid 27 `<GovernorCard>` (3-4 cols desktop, 1 mobile).
 *   - Footer constitucional.
 *
 * Filtros (server-side via search params, sem state client):
 *   `?status=todas|em_disputa|decididos_1t|vai_2t|chamadas`
 *   Default `todas`. Cada filtro renderiza links GET — mantém RSC puro.
 *
 * Cobertura
 *   - RF-021/022 (visão geral por UF), RF-025 (substituído por grid),
 *     RF-029 (tabs Pres/Gov), RF-006.1 (header com contagem via
 *     RaceStatsCards), RF-006.2 (filtros por status).
 *   - ADR-0001/0010/0012/0013/0017.
 *   - Constituição § 2 (cores via tokens, paleta multi-partido),
 *     § 3 (degrade gracioso), § 8 (transparência — disclaimer K-1
 *     herdado da página UF Gov).
 *
 * ISR: cadência de 60s (ADR-0011) — `revalidate = 60`.
 */

import type { Metadata } from "next";

import { Tabs } from "@/components/atoms/controls/Tabs";
import { BreakingNewsTicker } from "@/components/blocks/BreakingNewsTicker";
import { GovernorCard } from "@/components/blocks/GovernorCard";
import { HexCartogramBrasil } from "@/components/blocks/HexCartogramBrasil";
import { RaceStatsCards } from "@/components/blocks/RaceStatsCards";
import { Footer } from "@/components/layout/Footer";
import { LiveBadge } from "@/components/layout/LiveBadge";
import { readProjection } from "@/lib/edge-config/reader";
import type { EdgePayload, EdgeUfRow } from "@/lib/edge-config/types";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Governadores 2026 · SalaCofre",
  description:
    "Projeção das 27 corridas estaduais para governador em 2026 — apuração em tempo real, status por UF, cartograma NYT-style. Não oficial. Fonte: TSE.",
  alternates: { canonical: "/governador" },
  openGraph: {
    title: "Governadores 2026 · SalaCofre",
    description:
      "Projeção das 27 corridas estaduais para governador em 2026 — apuração em tempo real.",
    type: "website",
    locale: "pt_BR",
    siteName: "SalaCofre",
  },
  twitter: {
    card: "summary_large_image",
    title: "Governadores 2026 · SalaCofre",
    description: "Apuração em tempo real das 27 corridas estaduais.",
  },
};

type StatusFilter = "todas" | "em_disputa" | "decididos_1t" | "vai_2t" | "chamadas";

const FILTER_LABELS: Record<StatusFilter, string> = {
  todas: "Todas",
  em_disputa: "Em disputa",
  decididos_1t: "Decididos no 1º turno",
  vai_2t: "Vão a 2º turno",
  chamadas: "Chamadas",
};

const FILTER_ORDER: StatusFilter[] = ["todas", "em_disputa", "decididos_1t", "vai_2t", "chamadas"];

/**
 * Predicado de filtro — case sobre `bucket` declarado pelo orchestrator
 * (ADR-0017). `todas` passa tudo; `em_disputa` é o complemento de
 * "fechado" (chamada/decidido_1t).
 */
function passesFilter(uf: EdgeUfRow, filter: StatusFilter): boolean {
  switch (filter) {
    case "todas":
      return true;
    case "em_disputa":
      return uf.bucket === "indefinido" || uf.bucket === "vai_2t";
    case "decididos_1t":
      return uf.bucket === "decidido_1t" || uf.bucket === "chamada";
    case "vai_2t":
      return uf.bucket === "vai_2t";
    case "chamadas":
      return uf.bucket === "chamada";
  }
}

interface PageProps {
  searchParams?: Promise<{ status?: string }>;
}

/**
 * Payload "vazio gracioso" — usado quando o reader retorna null E não
 * temos fixture de governador no repo (constituição § 3). Garante que a
 * página renderiza com a estrutura completa mesmo pré-eleição.
 */
function emptyPayload(): EdgePayload {
  return {
    ts: new Date().toISOString(),
    cargo: 3,
    turno: 1,
    pct_apurado_total: 0,
    ufs_apuradas: 0,
    national: {
      candidatos: [],
      needle_position: 0,
      needle_band: "tossup",
      candidato_a_id: null,
      candidato_b_id: null,
      p_segundo_turno_overall: null,
      cenarios_2t: [],
      chamadas_recentes: [],
    },
    por_uf: [],
    insights: [],
    composition: { pre_election: 1, model: 0, actual_results: 0 },
  };
}

export default async function GovernadorGridPage({ searchParams }: PageProps) {
  // Filtro lido de search params (RSC puro — sem state client).
  const params = (await searchParams) ?? {};
  const rawStatus = (params.status ?? "todas") as StatusFilter;
  const status: StatusFilter = (FILTER_ORDER as readonly string[]).includes(rawStatus)
    ? rawStatus
    : "todas";

  // Leitura. Em dev sem EDGE_CONFIG cai pro payload vazio (graceful).
  const payload =
    (await readProjection({ cargo: "gov", turno: 1 })) ??
    (await readProjection({ cargo: "gov", turno: 2 })) ??
    emptyPayload();

  const { national, por_uf, pct_apurado_total, chamadas_recentes } = {
    national: payload.national,
    por_uf: payload.por_uf,
    pct_apurado_total: payload.pct_apurado_total,
    chamadas_recentes: payload.national.chamadas_recentes ?? [],
  };

  const ufsFiltradas = por_uf.filter((uf) => passesFilter(uf, status));

  // Heurística pra `aria-disabled` das outras tabs (Senado/Congresso/Assembleias).
  // Em S06/F4d eles ainda não existem como rota; tooltips esclarecem.
  const tabsOptions = [
    { id: "pres", label: "Presidente", href: "/" },
    { id: "gov", label: "Governador", href: "/governador" },
    { id: "sen", label: "Senado", disabled: true },
    { id: "cong", label: "Congresso", disabled: true },
    { id: "ass", label: "Assembleias", disabled: true },
  ] as const;

  return (
    <main className="mx-auto flex max-w-container flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
      {/* Breaking news no topo — só renderiza se há chamadas */}
      {chamadas_recentes.length > 0 && <BreakingNewsTicker chamadas={chamadas_recentes} />}

      {/* Header */}
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <h1
            className="text-3xl md:text-4xl"
            style={{ fontFamily: "var(--font-serif)", color: "var(--color-text)" }}
          >
            Governadores 2026
          </h1>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            27 corridas estaduais — apuração em tempo real. Não oficial. Fonte: TSE.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LiveBadge active={pct_apurado_total > 0} />
        </div>
      </header>

      {/* Tabs cargo */}
      <Tabs ariaLabel="Cargo" value="gov" options={tabsOptions} />

      {/* Stats cards */}
      <RaceStatsCards rows={por_uf} />

      {/* Cartograma hex */}
      {por_uf.length > 0 ? (
        <section aria-labelledby="hex-cartogram-heading" className="flex flex-col gap-2">
          <h2
            id="hex-cartogram-heading"
            className="text-lg"
            style={{ fontFamily: "var(--font-serif)", color: "var(--color-text)" }}
          >
            Mapa hexagonal — visão por líder
          </h2>
          <HexCartogramBrasil rows={por_uf} candidatos={national.candidatos} />
        </section>
      ) : (
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Aguardando primeiros boletins do TSE para preencher o cartograma.
        </p>
      )}

      {/* Filtros — server-side, links GET */}
      <nav aria-label="Filtros por status">
        <ul className="flex flex-wrap items-center gap-2 text-sm">
          {FILTER_ORDER.map((f) => {
            const active = status === f;
            const href = f === "todas" ? "/governador" : `/governador?status=${f}`;
            return (
              <li key={f}>
                <a
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className="rounded-md border px-3 py-1.5 transition-colors"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: active ? "var(--color-text)" : "transparent",
                    color: active ? "var(--color-bg)" : "var(--color-text-muted)",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {FILTER_LABELS[f]}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Grid 27 cards — 3 cols sm, 4 cols xl */}
      {ufsFiltradas.length > 0 ? (
        <section aria-label="Corridas estaduais de governador" className="flex flex-col gap-3">
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {ufsFiltradas.length} {ufsFiltradas.length === 1 ? "corrida" : "corridas"} —{" "}
            {FILTER_LABELS[status].toLowerCase()}.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {ufsFiltradas.map((uf) => (
              <GovernorCard key={uf.sigla} uf={uf} candidatos={national.candidatos} />
            ))}
          </div>
        </section>
      ) : (
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Nenhuma UF se encaixa no filtro <strong>{FILTER_LABELS[status]}</strong> no momento.{" "}
          <a href="/governador" className="underline">
            Ver todas
          </a>
          .
        </p>
      )}

      <Footer />
    </main>
  );
}
