// @vitest-environment happy-dom
/**
 * tests/unit/components/TurnoOneRecap.test.tsx
 *
 * Cobre ADR-0016 (recap do 1T como header fixo em mode 2T).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TurnoOneRecap } from "@/components/blocks/TurnoOneRecap";
import type { EdgeCandidate, EdgePayload } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function makeCand(overrides: Partial<EdgeCandidate>): EdgeCandidate {
  return {
    id: 1,
    nome: "Cand",
    partido: "X",
    cor: "var(--color-cand-1)",
    votos_atuais: 0,
    votos_projetados: 0,
    pct_atual: 0,
    pct_projetado: 0,
    pct_projetado_lower: 0,
    pct_projetado_upper: 0,
    p_vitoria: 0,
    rank: 1,
    p_passa_2t: 0,
    p_fecha_1t: 0,
    ...overrides,
  };
}

const lula = makeCand({ id: 13, nome: "Lula", partido: "PT", rank: 1, pct_projetado: 36.4 });
const bolso = makeCand({
  id: 22,
  nome: "Bolsonaro",
  partido: "PL",
  rank: 2,
  pct_projetado: 31.7,
  cor: "var(--color-cand-2)",
});
const tarcisio = makeCand({
  id: 25,
  nome: "Tarcísio",
  partido: "REP",
  rank: 3,
  pct_projetado: 22.1,
  cor: "var(--color-cand-3)",
});

function makeRecap(): EdgePayload {
  return {
    ts: "2026-10-04T22:30:00-03:00",
    cargo: 1,
    turno: 1,
    pct_apurado_total: 100,
    ufs_apuradas: 27,
    national: {
      candidatos: [lula, bolso, tarcisio],
      needle_position: 0.05,
      needle_band: "lean_a",
      candidato_a_id: 13,
      candidato_b_id: 22,
      p_segundo_turno_overall: 1.0,
      cenarios_2t: [],
    },
    por_uf: [],
    insights: [],
    composition: { pre_election: 0.0, model: 0.1, actual_results: 0.9 },
  };
}

describe("<TurnoOneRecap />", () => {
  it("(a) renderiza top-3 com pct + label de finalistas", () => {
    const doc = parse(<TurnoOneRecap recap={makeRecap()} />);
    const text = doc.body.textContent ?? "";
    expect(text).toContain("1º turno (encerrado)");
    expect(text).toContain("Lula");
    expect(text).toContain("Bolsonaro");
    expect(text).toContain("Tarcísio");
    expect(text).toContain("36,4%");
    expect(text).toContain("31,7%");
    expect(text).toContain("22,1%");
    expect(text).toContain("Lula e Bolsonaro avançaram ao 2º turno");
  });

  it("(b) retorna null quando recap é null", () => {
    const doc = parse(<TurnoOneRecap recap={null} />);
    expect(doc.body.textContent?.trim()).toBe("");
  });

  it("(c) retorna null quando candidatos está vazio", () => {
    const recap = makeRecap();
    recap.national.candidatos = [];
    const doc = parse(<TurnoOneRecap recap={recap} />);
    expect(doc.body.textContent?.trim()).toBe("");
  });

  it("(d) a11y: section tem aria-labelledby + heading semântico h2", () => {
    const doc = parse(<TurnoOneRecap recap={makeRecap()} />);
    const section = doc.querySelector("section");
    expect(section?.getAttribute("aria-labelledby")).toBe("turno-um-recap-heading");
    expect(section?.getAttribute("aria-label")).toContain("Resumo do 1º turno");
    const heading = doc.querySelector("#turno-um-recap-heading");
    expect(heading?.tagName).toBe("H2");
  });

  it("(e) a11y: lista tem aria-label e cada item tem aria-label individual", () => {
    const doc = parse(<TurnoOneRecap recap={makeRecap()} />);
    const ul = doc.querySelector("ul");
    expect(ul?.getAttribute("aria-label")).toContain("Top 3 candidatos");
    const items = Array.from(doc.querySelectorAll("li"));
    expect(items.length).toBe(3);
    expect(items[0]?.getAttribute("aria-label")).toBe("Lula (PT): 36,4%");
  });

  it("(f) sem 2 finalistas (cenário degenerado): não mostra label de avanço", () => {
    const recap = makeRecap();
    recap.national.candidatos = [lula]; // só 1 candidato
    const doc = parse(<TurnoOneRecap recap={recap} />);
    const text = doc.body.textContent ?? "";
    expect(text).toContain("Lula");
    expect(text).not.toContain("avançaram ao 2º turno");
  });
});
