// @vitest-environment happy-dom
/**
 * tests/unit/components/NationalChoroplethMap.test.tsx
 *
 * Unit tests do <NationalChoroplethMap /> — RF-030.1 (mapa hero) e
 * RF-030.3 (hover/click + tooltip + navegação).
 *
 * Estratégia:
 *   - Render do wrapper público (SSR-safe). Em SSR ele renderiza apenas a
 *     casca semântica (<div role="region" aria-label=…>) + um MapSkeleton
 *     enquanto o impl carrega via next/dynamic({ ssr: false }).
 *   - Cobertura completa do comportamento (hover MapLibre, click → router.push)
 *     fica para e2e Playwright (deferred S05) — documentado em traceability.md.
 *     Aqui validamos contrato semântico mínimo: role, aria-label e props.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NationalChoroplethMap } from "@/components/blocks/NationalChoroplethMap";
import type { EdgeUfRow } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

const SAMPLE_ROWS: EdgeUfRow[] = [
  {
    sigla: "SP",
    pct_apurado: 23.4,
    lider: 13,
    margem_atual: 4.0,
    margem_projetada: 4.2,
    margem_projetada_ci: [3.1, 5.3],
    chamada: false,
    swing_vs_2022: 1.1,
    top_candidatos: [
      { id: 13, pct: 52.1 },
      { id: 22, pct: 47.9 },
    ],
    vai_a_2t: null,
    bucket: "indefinido",
  },
  {
    sigla: "RJ",
    pct_apurado: 18.7,
    lider: 22,
    margem_atual: -2.4,
    margem_projetada: -2.5,
    margem_projetada_ci: [-3.6, -1.4],
    chamada: false,
    swing_vs_2022: -0.8,
    top_candidatos: [
      { id: 22, pct: 51.25 },
      { id: 13, pct: 48.75 },
    ],
    vai_a_2t: null,
    bucket: "indefinido",
  },
];

describe("<NationalChoroplethMap /> — RF-030.1, RF-030.3", () => {
  it("(a) renderiza sem crash com payload mínimo (SSR-safe)", () => {
    const doc = parse(<NationalChoroplethMap rows={SAMPLE_ROWS} candidatoAId={13} view="winner" />);
    expect(doc).not.toBeNull();
    expect(doc.body.children.length).toBeGreaterThan(0);
  });

  it("(b) wrapper tem role='region' + aria-label descritivo do modo atual", () => {
    const doc = parse(<NationalChoroplethMap rows={SAMPLE_ROWS} candidatoAId={13} view="margin" />);
    const region = doc.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    const label = region?.getAttribute("aria-label") ?? "";
    expect(label).toContain("Mapa coroplético do Brasil");
    // RF-030.2 — label reflete a view ativa.
    expect(label).toContain("Margem");
  });

  it("(c) label muda quando view muda (RF-030.2)", () => {
    const docWinner = parse(
      <NationalChoroplethMap rows={SAMPLE_ROWS} candidatoAId={13} view="winner" />,
    );
    const docTurnout = parse(
      <NationalChoroplethMap rows={SAMPLE_ROWS} candidatoAId={13} view="turnout" />,
    );
    expect(docWinner.querySelector('[role="region"]')?.getAttribute("aria-label")).toContain(
      "Por vencedor",
    );
    expect(docTurnout.querySelector('[role="region"]')?.getAttribute("aria-label")).toContain(
      "% apurado",
    );
  });

  it("(d) aceita lista vazia de rows sem erro (defensivo)", () => {
    const doc = parse(<NationalChoroplethMap rows={[]} candidatoAId={null} view="winner" />);
    expect(doc.querySelector('[role="region"]')).not.toBeNull();
  });

  // NB: o impl (handler de click → router.push('/uf/[sigla]'), hover MapLibre +
  // setFilter, tooltip) é validado em e2e Playwright. Mock completo de
  // MapLibre GL aqui é desproporcional para o ganho de cobertura unit.
  // Deferred para S05: tests/e2e/national-map.spec.ts.
});
