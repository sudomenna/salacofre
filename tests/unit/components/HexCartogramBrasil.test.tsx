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

  // 2026-09-10 — era `role="img"`. O axe reprovou com `nested-interactive`
  // (serious, WCAG 4.1.2) nas quatro combinações de viewport × tema da
  // `/governador`: o SVG contém 27 links (um por UF, ver o caso (c) logo
  // abaixo) e `role="img"` declara ao leitor de tela que o elemento é uma
  // imagem única, sem partes interativas — os links ficam presos dentro de
  // algo que afirma não tê-los. `role="group"` descreve o que o elemento é de
  // fato, e o nome acessível continua vindo do mesmo `aria-labelledby`.
  it("(b) o svg é um grupo (não uma imagem), com título descritivo", () => {
    const doc = parse(<HexCartogramBrasil rows={mkRows()} candidatos={candidatos} />);
    const svg = doc.querySelector("svg");
    expect(svg?.getAttribute("role")).toBe("group");
    // `role="img"` não pode voltar enquanto houver link dentro do SVG.
    expect(svg?.getAttribute("role")).not.toBe("img");
    expect(svg?.getAttribute("aria-labelledby")).toContain("hex-cartogram-title");
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

  // 🔴 2026-09-20 — o preenchimento já vinha da sigla; a TINTA do texto ainda
  // vinha da colocação, e era o pior dos dois.
  //
  // O hexágono tem ~34px de largura útil e carrega DUAS linhas de texto por
  // cima (a UF e a sigla do partido). A escolha da tinta era
  // `[1, 2, 5, 6].includes(rank) ? "#ffffff" : "var(--color-text)"` — a lista
  // dos ranks cujo token era escuro **na paleta por colocação**. Depois que o
  // fundo migrou para a sigla, aquela lista deixou de descrever o pixel de
  // baixo: partido de fundo claro em rank 1 recebia texto BRANCO sobre
  // amarelo. Não é troca-de-cor (§ 2), é texto ilegível (§ 4 / WCAG 1.4.3), e
  // chegava pelo resíduo de rank que ninguém tinha tirado.
  // Todo fundo e toda tinta desenhados, em ordem de documento — não amostra.
  const retratoDeCores = (doc: Document) => ({
    fundos: Array.from(doc.querySelectorAll("polygon")).map((p) => p.getAttribute("fill") ?? ""),
    tintas: Array.from(doc.querySelectorAll("text")).map((t) => t.getAttribute("fill") ?? ""),
  });

  it("(h) fundo e tinta do hexágono são o PAR medido da sigla, nunca do rank", () => {
    const doc = parse(<HexCartogramBrasil rows={mkRows()} candidatos={candidatos} />);
    const fills = Array.from(doc.querySelectorAll("polygon")).map(
      (p) => p.getAttribute("fill") ?? "",
    );
    const tintas = Array.from(doc.querySelectorAll("text"))
      .map((t) => t.getAttribute("fill") ?? "")
      .filter(Boolean);
    // Nenhuma tinta branca cravada — a tinta sai de `--party-<slug>-ink`.
    expect(tintas.every((t) => t !== "#ffffff")).toBe(true);
    expect(fills.some((f) => f.includes("--party-pt-chip"))).toBe(true);
    expect(fills.some((f) => f.includes("--party-pl-chip"))).toBe(true);
    expect(tintas.some((t) => t.includes("--party-pt-ink"))).toBe(true);
    // `--color-cand-other` continua legítimo: é o bucket "indefinido", onde
    // não há candidatura a identificar.
    expect(fills.some((f) => f === "var(--color-cand-other)")).toBe(true);
    // E nenhuma cor de COLOCAÇÃO.
    expect(fills.every((f) => !/--color-cand-[0-9]/.test(f))).toBe(true);
  });

  // O caso que DISCRIMINA: trocar as colocações dos dois candidatos não pode
  // mover um pixel — nem o fundo, nem a tinta.
  it("(h2) trocar as colocações não muda fundo nem tinta de hexágono nenhum", () => {
    const retrato = (cands: EdgeCandidate[]) =>
      retratoDeCores(parse(<HexCartogramBrasil rows={mkRows()} candidatos={cands} />));
    const invertidos = candidatos.map((c) => ({ ...c, rank: c.rank === 1 ? 2 : 1 }));
    expect(retrato(invertidos)).toEqual(retrato(candidatos));
    // E o retrato não é vazio — senão a igualdade acima seria vácua.
    expect(retrato(candidatos).fundos).toHaveLength(27);
    expect(retrato(candidatos).tintas.length).toBeGreaterThan(27);
  });

  it("(g) rows vazias degradam para hexágonos cinzas, mantém 27", () => {
    const doc = parse(<HexCartogramBrasil rows={[]} candidatos={candidatos} />);
    const polys = doc.querySelectorAll("polygon");
    expect(polys.length).toBe(27);
  });
});
