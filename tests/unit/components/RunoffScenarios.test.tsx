// @vitest-environment happy-dom
/**
 * tests/unit/components/RunoffScenarios.test.tsx
 *
 * Cobre RF-030.9 (cenários 2T) + gate de relevância (P >= 0.4) +
 * ordenação por prob desc + a11y.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RunoffScenarios } from "@/components/blocks/RunoffScenarios";
import type { EdgeCandidate, EdgeNational } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function makeCand(overrides: Partial<EdgeCandidate>): EdgeCandidate {
  return {
    id: 1,
    nome: "Cand 1",
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

const lula = makeCand({ id: 13, nome: "Lula", partido: "PT", rank: 1 });
const bolso = makeCand({
  id: 22,
  nome: "Bolsonaro",
  partido: "PL",
  rank: 2,
  cor: "var(--color-cand-2)",
});
const tarcisio = makeCand({
  id: 25,
  nome: "Tarcísio",
  partido: "REP",
  rank: 3,
  cor: "var(--color-cand-3)",
});
const ciro = makeCand({
  id: 12,
  nome: "Ciro",
  partido: "PDT",
  rank: 4,
  cor: "var(--color-cand-4)",
});

const candidatos = [lula, bolso, tarcisio, ciro];

function makeNational(overrides: Partial<EdgeNational>): EdgeNational {
  return {
    candidatos,
    needle_position: 0,
    needle_band: "tossup",
    candidato_a_id: 13,
    candidato_b_id: 22,
    p_segundo_turno_overall: 0.7,
    cenarios_2t: [
      { par: [13, 22], prob: 0.62 },
      { par: [13, 25], prob: 0.21 },
      { par: [22, 25], prob: 0.08 },
    ],
    ...overrides,
  };
}

describe("<RunoffScenarios />", () => {
  it("(a) renderiza top-3 cenários quando p_segundo_turno >= 0.4", () => {
    const doc = parse(<RunoffScenarios national={makeNational({})} candidatos={candidatos} />);
    const text = doc.body.textContent ?? "";
    expect(text).toContain("Cenários para o segundo turno");
    expect(text).toContain("Lula");
    expect(text).toContain("Bolsonaro");
    expect(text).toContain("Tarcísio");
    expect(text).toContain("62%");
    expect(text).toContain("21%");
    expect(text).toContain("8%");
  });

  it("(b) retorna null quando p_segundo_turno < 0.4 (gate de relevância)", () => {
    const doc = parse(
      <RunoffScenarios
        national={makeNational({ p_segundo_turno_overall: 0.3 })}
        candidatos={candidatos}
      />,
    );
    // null render → body vazio (ou só elementos auxiliares do react-dom/server)
    expect(doc.body.textContent?.trim()).toBe("");
  });

  it("(c) retorna null quando p_segundo_turno é null (cenário 2T já)", () => {
    const doc = parse(
      <RunoffScenarios
        national={makeNational({ p_segundo_turno_overall: null, cenarios_2t: [] })}
        candidatos={candidatos}
      />,
    );
    expect(doc.body.textContent?.trim()).toBe("");
  });

  it("(d) retorna null quando cenarios_2t está vazio", () => {
    const doc = parse(
      <RunoffScenarios national={makeNational({ cenarios_2t: [] })} candidatos={candidatos} />,
    );
    expect(doc.body.textContent?.trim()).toBe("");
  });

  it("(e) renderiza na ordem do array (que já vem por prob desc)", () => {
    const doc = parse(<RunoffScenarios national={makeNational({})} candidatos={candidatos} />);
    const items = Array.from(doc.querySelectorAll("li"));
    expect(items.length).toBe(3);
    const firstText = items[0]?.textContent ?? "";
    const lastText = items[2]?.textContent ?? "";
    // Primeiro é Lula vs Bolsonaro (prob 0.62), último é Bolsonaro vs Tarcísio (0.08).
    expect(firstText).toContain("Lula");
    expect(firstText).toContain("Bolsonaro");
    expect(firstText).toContain("62%");
    expect(lastText).toContain("Bolsonaro");
    expect(lastText).toContain("Tarcísio");
    expect(lastText).toContain("8%");
  });

  it("(f) pares com candidato_id inválido são silenciosamente descartados", () => {
    const doc = parse(
      <RunoffScenarios
        national={makeNational({
          cenarios_2t: [
            { par: [13, 22], prob: 0.5 },
            { par: [9999, 22], prob: 0.3 }, // 9999 não existe
          ],
        })}
        candidatos={candidatos}
      />,
    );
    const items = Array.from(doc.querySelectorAll("li"));
    expect(items.length).toBe(1);
    expect(items[0]?.textContent).toContain("Lula");
  });

  it("(g) topN customizado limita o número de cenários", () => {
    const doc = parse(
      <RunoffScenarios national={makeNational({})} candidatos={candidatos} topN={1} />,
    );
    const items = Array.from(doc.querySelectorAll("li"));
    expect(items.length).toBe(1);
  });

  it("(h) a11y: section tem aria-labelledby + ul tem aria-label", () => {
    const doc = parse(<RunoffScenarios national={makeNational({})} candidatos={candidatos} />);
    const section = doc.querySelector("section");
    expect(section?.getAttribute("aria-labelledby")).toBe("runoff-scenarios-heading");
    const ul = doc.querySelector("ul");
    expect(ul?.getAttribute("aria-label")).toContain("Top cenários");
    // Cada li tem aria-label completo
    const firstLi = doc.querySelector("li");
    expect(firstLi?.getAttribute("aria-label")).toContain("Cenário 1");
    expect(firstLi?.getAttribute("aria-label")).toContain("Lula");
    expect(firstLi?.getAttribute("aria-label")).toContain("Bolsonaro");
  });

  // 🔴 2026-09-20 — cores pela SIGLA, e DUAS por candidatura.
  //
  // Era `colorForRank(s.a.rank)` para tudo. Num bloco cuja razão de existir é
  // "quem enfrenta quem", a cor por posição é especialmente traiçoeira: o par
  // (3º, 4º) e o par (1º, 2º) do mesmo cenário trocavam de tinta a cada
  // ultrapassagem, e um deles era sempre vermelho por ser o de cima.
  const pontos = (doc: Document) =>
    Array.from(doc.querySelectorAll("li span[aria-hidden]")).map(
      (e) => e.getAttribute("style") ?? "",
    );
  const barras = (doc: Document) =>
    Array.from(doc.querySelectorAll('[role="meter"] > div')).map(
      (e) => e.getAttribute("style") ?? "",
    );

  it("(j) ponto e barra saem da SIGLA — marcador na variante legível, barra na base", () => {
    const doc = parse(<RunoffScenarios national={makeNational({})} candidatos={candidatos} />);
    // Bolinha de 8×8 = MARCADOR sem extensão ⇒ `-text`.
    expect(pontos(doc)[0]).toContain("var(--party-pt-text)");
    expect(pontos(doc)[1]).toContain("var(--party-pl-text)");
    // Barra = preenchimento COM extensão ⇒ cor-base.
    expect(barras(doc)[0]).toContain("var(--party-pt)");
    expect(barras(doc)[0]).toContain("var(--party-pl)");
    expect([...pontos(doc), ...barras(doc)].every((c) => !c.includes("--color-cand-"))).toBe(true);
  });

  // O caso que DISCRIMINA: as MESMAS quatro candidaturas com os ranks
  // embaralhados (a noite inteira é isso) devolvem as mesmas tintas.
  it("(j2) embaralhar as colocações não muda tinta nenhuma", () => {
    const original = parse(<RunoffScenarios national={makeNational({})} candidatos={candidatos} />);
    const embaralhados = candidatos.map((c, i) => ({ ...c, rank: candidatos.length - i }));
    const virado = parse(
      <RunoffScenarios
        national={makeNational({ candidatos: embaralhados })}
        candidatos={embaralhados}
      />,
    );
    expect(pontos(virado)).toEqual(pontos(original));
    expect(barras(virado)).toEqual(barras(original));
  });

  it("(i) a11y: barra de probabilidade é meter com aria-valuenow", () => {
    const doc = parse(<RunoffScenarios national={makeNational({})} candidatos={candidatos} />);
    const meter = doc.querySelector('[role="meter"]');
    expect(meter).not.toBeNull();
    expect(meter?.getAttribute("aria-valuemin")).toBe("0");
    expect(meter?.getAttribute("aria-valuemax")).toBe("100");
    expect(meter?.getAttribute("aria-valuenow")).toBe("62");
  });
});
