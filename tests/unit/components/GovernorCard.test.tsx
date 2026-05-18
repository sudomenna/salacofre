// @vitest-environment happy-dom
/**
 * tests/unit/components/GovernorCard.test.tsx — S06/F4d (Fase 3).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GovernorCard } from "@/components/blocks/GovernorCard";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function mkCand(id: number, nome: string, partido: string, rank: number): EdgeCandidate {
  return {
    id,
    nome,
    partido,
    cor: `var(--color-cand-${rank})`,
    votos_atuais: 0,
    votos_projetados: 0,
    pct_atual: 0,
    pct_projetado: 0,
    pct_projetado_lower: 0,
    pct_projetado_upper: 0,
    p_vitoria: 0,
    rank,
    p_passa_2t: 0,
    p_fecha_1t: 0,
  };
}

function mkUf(overrides: Partial<EdgeUfRow> & Pick<EdgeUfRow, "sigla" | "bucket">): EdgeUfRow {
  const base: EdgeUfRow = {
    sigla: overrides.sigla,
    pct_apurado: 70,
    lider: 1,
    margem_atual: 10,
    margem_projetada: 10,
    margem_projetada_ci: [5, 15],
    chamada: false,
    swing_vs_2022: 0,
    top_candidatos: [
      { id: 1, pct: 41.2 },
      { id: 2, pct: 27.8 },
      { id: 3, pct: 14.1 },
      { id: 4, pct: 8.0 },
    ],
    vai_a_2t: null,
    bucket: overrides.bucket,
  };
  return { ...base, ...overrides };
}

const candidatos: EdgeCandidate[] = [
  mkCand(1, "Tarcísio", "REP", 1),
  mkCand(2, "Boulos", "PSOL", 2),
  mkCand(3, "Márcio França", "PSB", 3),
  mkCand(4, "Datena", "PSDB", 4),
];

describe("<GovernorCard />", () => {
  it("(a) bucket=chamada → chip ● ELEITO no líder", () => {
    const uf = mkUf({ sigla: "SP", bucket: "chamada" });
    const doc = parse(<GovernorCard uf={uf} candidatos={candidatos} />);
    expect(doc.body.textContent ?? "").toContain("● ELEITO");
  });

  it("(b) bucket=decidido_1t → ● ELEITO", () => {
    const uf = mkUf({ sigla: "SP", bucket: "decidido_1t" });
    const doc = parse(<GovernorCard uf={uf} candidatos={candidatos} />);
    expect(doc.body.textContent ?? "").toContain("● ELEITO");
  });

  it("(c) bucket=vai_2t → VAI A 2T", () => {
    const uf = mkUf({ sigla: "RJ", bucket: "vai_2t" });
    const doc = parse(<GovernorCard uf={uf} candidatos={candidatos} />);
    const text = doc.body.textContent ?? "";
    expect(text).toContain("VAI A 2T");
    expect(text).not.toContain("ELEITO");
  });

  it("(d) bucket=indefinido → EM APURAÇÃO", () => {
    const uf = mkUf({ sigla: "MG", bucket: "indefinido" });
    const doc = parse(<GovernorCard uf={uf} candidatos={candidatos} />);
    expect(doc.body.textContent ?? "").toContain("EM APURAÇÃO");
  });

  it("(e) renderiza top-3 + linha Outros quando há 4+ candidatos", () => {
    const uf = mkUf({ sigla: "SP", bucket: "chamada" });
    const doc = parse(<GovernorCard uf={uf} candidatos={candidatos} />);
    const text = doc.body.textContent ?? "";
    expect(text).toContain("Tarcísio");
    expect(text).toContain("Boulos");
    expect(text).toContain("Márcio França");
    expect(text).toContain("Outros");
  });

  it("(f) sem 4º candidato → não exibe 'Outros'", () => {
    const uf = mkUf({
      sigla: "SP",
      bucket: "chamada",
      top_candidatos: [
        { id: 1, pct: 50 },
        { id: 2, pct: 30 },
        { id: 3, pct: 20 },
      ],
    });
    const doc = parse(<GovernorCard uf={uf} candidatos={candidatos} />);
    expect(doc.body.textContent ?? "").not.toContain("Outros");
  });

  it("(g) aria-label descreve UF + status + líder", () => {
    const uf = mkUf({ sigla: "SP", bucket: "chamada" });
    const doc = parse(<GovernorCard uf={uf} candidatos={candidatos} />);
    const article = doc.querySelector("article");
    const label = article?.getAttribute("aria-label") ?? "";
    expect(label).toContain("São Paulo");
    expect(label).toContain("Tarcísio");
    expect(label).toContain("eleito");
  });

  it("(h) renderiza fallback mobile single-line via classes responsivas", () => {
    const uf = mkUf({ sigla: "SP", bucket: "chamada" });
    const doc = parse(<GovernorCard uf={uf} candidatos={candidatos} />);
    // O wrapper mobile usa `sm:hidden`; o desktop `hidden sm:block`.
    const html = doc.body.innerHTML;
    expect(html).toContain("sm:hidden");
    expect(html).toContain("sm:block");
  });

  it("(i) nome longo da UF aparece (não só sigla) no desktop", () => {
    const uf = mkUf({ sigla: "SP", bucket: "chamada" });
    const doc = parse(<GovernorCard uf={uf} candidatos={candidatos} />);
    expect(doc.body.textContent ?? "").toContain("São Paulo");
  });
});
