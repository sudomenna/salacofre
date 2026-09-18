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

  it('(c2) 2026-09-18 — cargo="sen" qualifica o rótulo de "Margem" (RF-104); "pres" não muda', () => {
    // Mutação: remover a checagem `view === "margin"` (ou `cargo`) de
    // `viewLabelForCargo` faz este teste falhar em uma das duas pontas.
    const docSen = parse(
      <NationalChoroplethMap rows={SAMPLE_ROWS} candidatoAId={13} view="margin" cargo="sen" />,
    );
    expect(docSen.querySelector('[role="region"]')?.getAttribute("aria-label")).toContain(
      "Margem para a 2ª vaga",
    );

    const docPres = parse(
      <NationalChoroplethMap rows={SAMPLE_ROWS} candidatoAId={13} view="margin" cargo="pres" />,
    );
    const labelPres = docPres.querySelector('[role="region"]')?.getAttribute("aria-label") ?? "";
    expect(labelPres).toContain("Margem");
    expect(labelPres).not.toContain("Margem para a 2ª vaga");
  });

  it('(c3) 2026-09-18 (item d) — cargo="sen" qualifica o rótulo de "Por vencedor" para "Por líder"; "pres" não muda', () => {
    // Mutação: remover a checagem `view === "winner"` (ou `cargo`) de
    // `viewLabelForCargo` faz este teste falhar em uma das duas pontas.
    const docSen = parse(
      <NationalChoroplethMap rows={SAMPLE_ROWS} candidatoAId={13} view="winner" cargo="sen" />,
    );
    expect(docSen.querySelector('[role="region"]')?.getAttribute("aria-label")).toContain(
      "Por líder",
    );
    expect(docSen.querySelector('[role="region"]')?.getAttribute("aria-label")).not.toContain(
      "Por vencedor",
    );

    const docPres = parse(
      <NationalChoroplethMap rows={SAMPLE_ROWS} candidatoAId={13} view="winner" cargo="pres" />,
    );
    expect(docPres.querySelector('[role="region"]')?.getAttribute("aria-label")).toContain(
      "Por vencedor",
    );
  });

  it("(d) aceita lista vazia de rows sem erro (defensivo)", () => {
    const doc = parse(<NationalChoroplethMap rows={[]} candidatoAId={null} view="winner" />);
    expect(doc.querySelector('[role="region"]')).not.toBeNull();
  });

  it("(e) aceita rankByLider sem erro — wrapper SSR repassa prop (S05/F3B)", () => {
    // Wrapper SSR só renderiza casca; o impl com MapLibre só monta no cliente.
    // Validamos apenas que o componente aceita a prop e renderiza sem crash.
    const rankByLider: Record<number, number> = { 13: 1, 22: 2, 25: 3 };
    const doc = parse(
      <NationalChoroplethMap
        rows={SAMPLE_ROWS}
        candidatoAId={13}
        view="winner"
        rankByLider={rankByLider}
      />,
    );
    expect(doc.querySelector('[role="region"]')).not.toBeNull();
  });

  it("(f) rankByLider undefined ainda renderiza (degrade S04 → cand-1)", () => {
    const doc = parse(<NationalChoroplethMap rows={SAMPLE_ROWS} candidatoAId={13} view="winner" />);
    expect(doc.querySelector('[role="region"]')).not.toBeNull();
  });

  // NB: o impl (handler de click → router.push('/uf/[sigla]'), hover MapLibre +
  // setFilter, tooltip, aplicação das cores N-way via setPaintProperty) é
  // validado em e2e Playwright. Mock completo de MapLibre GL aqui é
  // desproporcional para o ganho de cobertura unit. Deferred para S05/F4:
  // tests/e2e/national-map.spec.ts cobre rankByLider com 3 ranks distintos
  // → 3 cores aplicadas no canvas.
});
