/**
 * app/page.tsx
 *
 * Home Nacional Presidencial (T-01). Spec 003.
 *
 * Server Component — lê Edge Config (`projection:current`) server-side via
 * `readNationalProjection()` (ADR-0001) e passa o payload como `fallbackData`
 * para o SWR client que mantém polling vivo (RF-027).
 *
 * Em dev sem `EDGE_CONFIG`, o reader retorna null e o /api/projection cai num
 * fixture local — aqui também caímos no fixture para manter SSR funcional.
 *
 * Estrutura
 *   Header
 *   ├── Cargo Tabs (Presidente | Governador)         RF-029
 *   ├── LiveBadge (AO VIVO)                          RF-028
 *   └── ApuracaoMeta (apurado, ufs, ts)              RF-026
 *   HeadlineScore                                    RF-022, RF-023, RF-030.5
 *   MapViewToggle + NationalChoroplethMap            RF-030.1-4
 *   NationalNeedle (P(vitória) + agulha)             RF-021
 *   DecisiveUFsGrid                                  RF-024
 *   StateGroupedTable                                RF-030.6
 *   InsightCard                                      RF-044 (consumido)
 *   ForecastTransparency                             RF-043 (consumido)
 *   Footer                                           constituição § 1
 *
 * Cobertura: RF-021..030.6, RF-043, RF-044, RNF-002, RNF-007, RNF-022..028.
 *
 * Fora do escopo desta spec (mantidos para S05):
 *   - `<UFForecastTable />` (RF-025) — tabela 27 linhas com dot-plot inline.
 *   - Brushing entre componentes (spec 008).
 *   - Gráficos de série temporal (RF-040..042).
 */

import type { Metadata } from "next";

import { Tabs } from "@/components/atoms/controls/Tabs";
import { ApuracaoMeta } from "@/components/blocks/ApuracaoMeta";
import { DecisiveUFsGrid } from "@/components/blocks/DecisiveUFsGrid";
import { ForecastTransparency } from "@/components/blocks/ForecastTransparency";
import { HeadlineScore } from "@/components/blocks/HeadlineScore";
import { InsightCard } from "@/components/blocks/InsightCard";
import { NationalChoroplethMap } from "@/components/blocks/NationalChoroplethMap";
import { NationalNeedle } from "@/components/blocks/NationalNeedle";
import { StateGroupedTable } from "@/components/blocks/StateGroupedTable";
import { Footer } from "@/components/layout/Footer";
import { LiveBadge } from "@/components/layout/LiveBadge";
import { readNationalProjection } from "@/lib/edge-config/reader";
import type { EdgePayload } from "@/lib/edge-config/types";
import nationalFixture from "@/tests/fixtures/edge-config/projection-current.json" with {
  type: "json",
};
import { HomeClientShell } from "./HomeClientShell";

/**
 * RNF-028 — Meta/OG tags. Imagens dinâmicas OG (RF-051) ficam para spec 009;
 * aqui injetamos apenas os campos textuais para sharing previews em redes
 * sociais. `siteName` e `locale` aplicam o padrão pt_BR.
 */
export const metadata: Metadata = {
  title: "SalaCofre — Apuração presidencial 2026",
  description:
    "Apuração presidencial 2026 em tempo real e projeção estatística do resultado final. Não oficial. Fonte: TSE.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "SalaCofre — Apuração presidencial 2026",
    description:
      "Apuração presidencial 2026 em tempo real e projeção estatística do resultado final.",
    type: "website",
    locale: "pt_BR",
    siteName: "SalaCofre",
  },
  twitter: {
    card: "summary_large_image",
    title: "SalaCofre — Apuração presidencial 2026",
    description:
      "Apuração presidencial 2026 em tempo real e projeção estatística do resultado final.",
  },
};

/** Polling SWR é gerenciado pelo `HomeClientShell`; o RSC fornece o estado inicial. */
async function getInitialPayload(): Promise<EdgePayload> {
  const fromEdge = await readNationalProjection();
  if (fromEdge) return fromEdge;
  return nationalFixture as unknown as EdgePayload;
}

export default async function HomePage() {
  const payload = await getInitialPayload();
  const { national, por_uf, pct_apurado_total, ufs_apuradas, ts, insights, composition } = payload;
  const candidatoA = national.candidatos.find((c) => c.id === national.candidato_a_id);
  const candidatoB = national.candidatos.find((c) => c.id === national.candidato_b_id);

  return (
    <main className="mx-auto flex max-w-container flex-col gap-8 px-4 py-6 md:px-6 md:py-10">
      {/* Header */}
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs
          ariaLabel="Cargo"
          value="pres"
          options={[
            { id: "pres", label: "Presidente", href: "/" },
            { id: "gov", label: "Governador", href: "/governador" },
          ]}
        />
        <div className="flex items-center gap-3">
          <LiveBadge active={pct_apurado_total > 0} />
        </div>
      </header>

      <ApuracaoMeta pctApurado={pct_apurado_total} ufsApuradas={ufs_apuradas} ts={ts} />

      <HeadlineScore candidatos={national.candidatos} />

      {/* Mapa hero — wraps view toggle client-side */}
      <HomeClientShell rows={por_uf} candidatoAId={national.candidato_a_id}>
        <NationalChoroplethMap rows={por_uf} candidatoAId={national.candidato_a_id} view="winner" />
      </HomeClientShell>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_auto]">
        <NationalNeedle national={national} />
        <ForecastTransparency pctApurado={pct_apurado_total} />
      </div>

      <DecisiveUFsGrid rows={por_uf} candidatoAId={national.candidato_a_id} />

      <StateGroupedTable
        rows={por_uf}
        candidatoAId={national.candidato_a_id}
        candidatoAName={candidatoA?.nome ?? "Líder A"}
        candidatoBName={candidatoB?.nome ?? "Líder B"}
        corA={candidatoA?.cor ?? "var(--color-pt)"}
        corB={candidatoB?.cor ?? "var(--color-pl)"}
      />

      {insights.length > 0 && <InsightCard frases={insights} heading="Análise" />}

      {/* `composition` reservado para futuras melhorias do ForecastTransparency */}
      {process.env.NODE_ENV === "development" && (
        <details className="text-xs" style={{ color: "var(--color-text-faint)" }}>
          <summary>debug: composition</summary>
          <pre>{JSON.stringify(composition, null, 2)}</pre>
        </details>
      )}

      <Footer />
    </main>
  );
}
