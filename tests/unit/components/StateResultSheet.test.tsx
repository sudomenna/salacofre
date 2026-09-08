// @vitest-environment happy-dom
/**
 * tests/unit/components/StateResultSheet.test.tsx
 *
 * `<StateResultSheet />` — folha de resumo de UF aberta a partir do mapa
 * nacional (decisão do usuário, 2026-09-08). Cobertura: RF-030.3.
 *
 * O que estes testes travam:
 *   - fechado ou sem `row` não renderiza conteúdo (Sheet devolve null);
 *   - conteúdo vem só de `EdgeUfRow`/`EdgeCandidate` — sigla, nome do
 *     estado, % apurado, margem projetada, líder e top_candidatos;
 *   - NENHUM "%  parcial" por candidato aparece (o payload não tem esse
 *     dado por candidato — só `pct_projetado` via `top_candidatos[].pct`);
 *   - o CTA "Ver detalhes do estado" é uma `<a href="/uf/<SIGLA>">` real,
 *     não um `<button onClick>`;
 *   - nenhum hex literal no markup (constituição § 2).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StateResultSheet } from "@/components/blocks/StateResultSheet";
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

const candidatos: EdgeCandidate[] = [
  mkCand(1, "Tarcísio", "REP", 1),
  mkCand(2, "Boulos", "PSOL", 2),
  mkCand(3, "Márcio França", "PSB", 3),
];

const row: EdgeUfRow = {
  sigla: "SP",
  pct_apurado: 42.5,
  lider: 1,
  margem_atual: 12.1,
  margem_projetada: 13.4,
  margem_projetada_ci: [10.0, 16.8],
  chamada: false,
  swing_vs_2022: 1.2,
  top_candidatos: [
    { id: 1, pct: 44.6 },
    { id: 2, pct: 31.2 },
    { id: 3, pct: 12.0 },
  ],
  vai_a_2t: null,
  bucket: "indefinido",
};

describe("<StateResultSheet /> — RF-030.3 (folha de UF)", () => {
  it("(a) fechado não renderiza conteúdo", () => {
    const doc = parse(
      <StateResultSheet open={false} onClose={() => {}} row={row} candidatos={candidatos} />,
    );
    expect(doc.body.innerHTML).toBe("");
  });

  it("(b) aberto sem row não quebra e não mostra conteúdo de UF", () => {
    const doc = parse(
      <StateResultSheet open onClose={() => {}} row={null} candidatos={candidatos} />,
    );
    expect(doc.querySelector("[data-testid='sheet']")).not.toBeNull();
    expect(doc.querySelector("[data-testid='state-sheet-candidatos']")).toBeNull();
  });

  it("(c) título é o nome longo do estado; kicker traz a sigla", () => {
    const doc = parse(
      <StateResultSheet open onClose={() => {}} row={row} candidatos={candidatos} />,
    );
    expect(doc.body.textContent).toContain("São Paulo");
    expect(doc.body.textContent).toContain("Estado · SP");
  });

  it("(d) mostra % apurado e margem projetada (Figures) — nada além do payload", () => {
    const doc = parse(
      <StateResultSheet open onClose={() => {}} row={row} candidatos={candidatos} />,
    );
    const text = doc.body.textContent ?? "";
    expect(text).toContain("Apurado");
    expect(text).toContain("42,5%");
    expect(text).toContain("Margem projetada");
    expect(text).toContain("+13,4 pp");
    // "Eleitores" não existe em EdgeUfRow — não deve aparecer inventado.
    expect(text).not.toContain("Eleitores");
  });

  it("(e) resolve o líder (row.lider) por nome + partido", () => {
    const doc = parse(
      <StateResultSheet open onClose={() => {}} row={row} candidatos={candidatos} />,
    );
    const lider = doc.querySelector("[data-testid='state-sheet-lider']");
    expect(lider?.textContent).toContain("Tarcísio");
    expect(lider?.textContent).toContain("REP");
  });

  it("(f) lista os top_candidatos com nome, partido e % projetado — sem parcial por candidato", () => {
    const doc = parse(
      <StateResultSheet open onClose={() => {}} row={row} candidatos={candidatos} />,
    );
    const list = doc.querySelector("[data-testid='state-sheet-candidatos']");
    expect(list?.textContent).toContain("Tarcísio");
    expect(list?.textContent).toContain("Boulos");
    expect(list?.textContent).toContain("Márcio França");
    expect(list?.textContent).toContain("44,6%");
    expect(list?.textContent).toContain("31,2%");
    expect(list?.textContent).toContain("12,0%");
    // Nenhum rótulo "parcial" nesta lista — o payload não tem esse dado por candidato.
    expect(list?.textContent?.toLowerCase()).not.toContain("parcial");
  });

  it("(g) candidato sem metadados (id ausente em `candidatos`) degrada para #id, não quebra", () => {
    const orphanRow: EdgeUfRow = {
      ...row,
      top_candidatos: [{ id: 999, pct: 50 }],
    };
    const doc = parse(
      <StateResultSheet open onClose={() => {}} row={orphanRow} candidatos={candidatos} />,
    );
    expect(doc.querySelector("[data-testid='state-sheet-candidatos']")?.textContent).toContain(
      "#999",
    );
  });

  it("(h) o CTA é uma <a href> real para /uf/[sigla], não um botão com onClick", () => {
    const doc = parse(
      <StateResultSheet open onClose={() => {}} row={row} candidatos={candidatos} />,
    );
    const cta = doc.querySelector("[data-testid='state-sheet-cta']");
    expect(cta?.tagName).toBe("A");
    expect(cta?.getAttribute("href")).toBe("/uf/SP");
    expect(cta?.textContent).toContain("Ver detalhes do estado");
  });

  it("(i) side=true passa para o Sheet subjacente (cartão lateral, não modal)", () => {
    const doc = parse(
      <StateResultSheet open onClose={() => {}} row={row} candidatos={candidatos} side />,
    );
    const dialog = doc.querySelector("[data-testid='sheet']");
    expect(dialog?.getAttribute("data-side")).toBe("true");
    expect(dialog?.getAttribute("aria-modal")).toBeNull();
  });

  it("(j) nenhum hex literal no markup (constituição § 2)", () => {
    const html = renderToStaticMarkup(
      <StateResultSheet open onClose={() => {}} row={row} candidatos={candidatos} />,
    );
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
