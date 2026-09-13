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
    // Spec 018 / ADR-0042 — a partir daqui `nome`/`partido` vêm da PRÓPRIA
    // linha da UF, não do índice sobre `national.candidatos`. A fixture
    // reflete um payload pós-018; o caso pré-018 (campos ausentes) tem teste
    // dedicado no bloco "(j)".
    top_candidatos: [
      { id: 1, pct: 41.2, nome: "Tarcísio", partido: "REP", sqcand: "250002553928" },
      { id: 2, pct: 27.8, nome: "Boulos", partido: "PSOL", sqcand: "250002553929" },
      { id: 3, pct: 14.1, nome: "Márcio França", partido: "PSB", sqcand: "50002553930" },
      { id: 4, pct: 8.0, nome: "Datena", partido: "PSDB", sqcand: "50002553931" },
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

  // -------------------------------------------------------------------
  // Spec 018 / ADR-0042 — identidade pelo par (UF, número)
  // -------------------------------------------------------------------

  it("(j) payload PRÉ-018 (sem `nome` em top_candidatos) → placeholder, nunca o nome do índice nacional", () => {
    // Mutação alvo: remover o fallback, ou fazê-lo voltar a `candIndex`. A
    // segunda é a pior: o índice é `national.candidatos`, que em cargo 3 é a
    // união de 27 corridas — devolveria "Tarcísio" em qualquer estado.
    const uf = mkUf({
      sigla: "BA",
      bucket: "chamada",
      top_candidatos: [
        { id: 1, pct: 50 },
        { id: 2, pct: 30 },
      ],
    });
    const text = parse(<GovernorCard uf={uf} candidatos={candidatos} />).body.textContent ?? "";

    expect(text).toContain("Cand 1");
    expect(text).not.toContain("Tarcísio");
    expect(text).not.toContain("Boulos");
  });

  it("(k) duas UFs com o MESMO número 13 exibem nomes diferentes", () => {
    // O coração do ADR-0042: em cargo majoritário o número na urna é o número
    // do partido, então todo governador do PT do país é o 13. `candidatos` é
    // deliberadamente o bloco nacional colidente — se o componente ainda o
    // consultasse para nome, os dois cards diriam a mesma coisa.
    const nacionalColidente: EdgeCandidate[] = [mkCand(13, "Candidato 13", "PT", 1)];
    const sp = mkUf({
      sigla: "SP",
      bucket: "chamada",
      top_candidatos: [{ id: 13, pct: 55, nome: "Fernando de SP", partido: "PT" }],
    });
    const ba = mkUf({
      sigla: "BA",
      bucket: "chamada",
      top_candidatos: [{ id: 13, pct: 52, nome: "Jaqueline da BA", partido: "PT" }],
    });

    const textoSp =
      parse(<GovernorCard uf={sp} candidatos={nacionalColidente} />).body.textContent ?? "";
    const textoBa =
      parse(<GovernorCard uf={ba} candidatos={nacionalColidente} />).body.textContent ?? "";

    expect(textoSp).toContain("Fernando de SP");
    expect(textoSp).not.toContain("Jaqueline da BA");
    expect(textoBa).toContain("Jaqueline da BA");
    expect(textoBa).not.toContain("Fernando de SP");
  });

  it("(l) `partido` vem da linha da UF; ausente → travessão, não o do índice nacional", () => {
    const uf = mkUf({
      sigla: "SP",
      bucket: "chamada",
      top_candidatos: [{ id: 1, pct: 50, nome: "Alguém" }],
    });
    const text = parse(<GovernorCard uf={uf} candidatos={candidatos} />).body.textContent ?? "";

    expect(text).toContain("Alguém");
    expect(text).not.toContain("REP");
  });
});
