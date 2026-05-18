// @vitest-environment happy-dom
/**
 * tests/unit/components/HexCartogramBrasil.test.tsx — S06/F4d (Fase 3).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HexCartogramBrasil } from "@/components/blocks/HexCartogramBrasil";
import { UF_HEX_POSITIONS } from "@/lib/data/uf-hex-layout";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

const candidatos: EdgeCandidate[] = [
  {
    id: 1,
    nome: "Lula",
    partido: "PT",
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
  },
  {
    id: 2,
    nome: "Bolsonaro",
    partido: "PL",
    cor: "var(--color-cand-2)",
    votos_atuais: 0,
    votos_projetados: 0,
    pct_atual: 0,
    pct_projetado: 0,
    pct_projetado_lower: 0,
    pct_projetado_upper: 0,
    p_vitoria: 0,
    rank: 2,
    p_passa_2t: 0,
    p_fecha_1t: 0,
  },
];

function mkRows(): EdgeUfRow[] {
  return Object.keys(UF_HEX_POSITIONS).map((sigla, i) => ({
    sigla,
    pct_apurado: 100,
    lider: i % 2 === 0 ? 1 : 2,
    margem_atual: 5,
    margem_projetada: 5,
    margem_projetada_ci: [3, 7],
    chamada: i % 3 === 0,
    swing_vs_2022: 0,
    top_candidatos: [],
    vai_a_2t: null,
    bucket: i % 4 === 0 ? "indefinido" : i % 4 === 1 ? "vai_2t" : "chamada",
  }));
}

describe("<HexCartogramBrasil />", () => {
  it("(a) renderiza exatamente 27 hexágonos (polygon)", () => {
    const doc = parse(<HexCartogramBrasil rows={mkRows()} candidatos={candidatos} />);
    const polys = doc.querySelectorAll("polygon");
    expect(polys.length).toBe(27);
  });

  it("(b) renderiza svg com role=img e título descritivo", () => {
    const doc = parse(<HexCartogramBrasil rows={mkRows()} candidatos={candidatos} />);
    const svg = doc.querySelector("svg");
    expect(svg?.getAttribute("role")).toBe("img");
    const title = doc.querySelector("svg title");
    expect(title?.textContent ?? "").toContain("hexágonos");
  });

  it("(c) cada hex está dentro de um <a> com aria-label da UF", () => {
    const doc = parse(<HexCartogramBrasil rows={mkRows()} candidatos={candidatos} />);
    const links = doc.querySelectorAll("svg a");
    expect(links.length).toBe(27);
    const labels = Array.from(links).map((l) => l.getAttribute("aria-label") ?? "");
    expect(labels.some((l) => l.startsWith("SP"))).toBe(true);
    expect(labels.some((l) => l.startsWith("RJ"))).toBe(true);
  });

  it("(d) href dos links aponta pra /uf/[sigla]/governador (lowercase)", () => {
    const doc = parse(<HexCartogramBrasil rows={mkRows()} candidatos={candidatos} />);
    const link = doc.querySelector('svg a[aria-label^="SP"]');
    expect(link?.getAttribute("href")).toBe("/uf/sp/governador");
  });

  it("(e) bucket indefinido pinta com --color-cand-other (cinza)", () => {
    // 1ª UF (RR) tem i=0 → bucket "indefinido"
    const doc = parse(<HexCartogramBrasil rows={mkRows()} candidatos={candidatos} />);
    const linkRR = doc.querySelector('svg a[aria-label^="RR"]');
    const poly = linkRR?.querySelector("polygon");
    expect(poly?.getAttribute("fill") ?? "").toContain("--color-cand-other");
  });

  it("(f) label inline mostra sigla + partido do líder", () => {
    const doc = parse(<HexCartogramBrasil rows={mkRows()} candidatos={candidatos} />);
    const text = doc.body.textContent ?? "";
    expect(text).toContain("SP");
    // Algum partido aparece (PT ou PL)
    expect(text.includes("PT") || text.includes("PL")).toBe(true);
  });

  it("(g) rows vazias degradam para hexágonos cinzas, mantém 27", () => {
    const doc = parse(<HexCartogramBrasil rows={[]} candidatos={candidatos} />);
    const polys = doc.querySelectorAll("polygon");
    expect(polys.length).toBe(27);
  });
});
