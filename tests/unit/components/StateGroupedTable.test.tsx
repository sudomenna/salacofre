// @vitest-environment happy-dom
/**
 * tests/unit/components/StateGroupedTable.test.tsx — RF-030.6.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StateGroupedTable } from "@/components/blocks/StateGroupedTable";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";

/**
 * Helper pra montar EdgeCandidate sintético nos tests sem repetir o shape
 * completo. Em mode="multi-1t" só `id`, `nome` e `rank` importam pro componente.
 */
const mkCand = (id: number, nome: string, rank: number): EdgeCandidate => ({
  id,
  nome,
  partido: "X",
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
});

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

const mkRow = (sigla: string, lider: number, margem: number, pctApurado = 30): EdgeUfRow => ({
  sigla,
  pct_apurado: pctApurado,
  lider,
  margem_atual: margem,
  margem_projetada: margem,
  margem_projetada_ci: [margem - 2, margem + 2],
  chamada: false,
  swing_vs_2022: 1,
  top_candidatos: [
    { id: lider, pct: 50 + margem / 2 },
    { id: lider === 13 ? 22 : 13, pct: 50 - margem / 2 },
  ],
  vai_a_2t: null,
  bucket: "indefinido",
});

describe("<StateGroupedTable />", () => {
  it("(a) header tem 5 colunas com labels customizadas", () => {
    const doc = parse(
      <StateGroupedTable
        rows={[]}
        candidatoAId={13}
        candidatoAName="Lula"
        candidatoBName="Bolsonaro"
      />,
    );
    const headers = Array.from(doc.querySelectorAll("th")).map((t) => t.textContent ?? "");
    expect(headers.length).toBe(5);
    expect(headers[0]).toContain("Lula confortável");
    expect(headers[1]).toContain("Lula apertado");
    expect(headers[2]).toContain("Em disputa");
    expect(headers[3]).toContain("Bolsonaro apertado");
    expect(headers[4]).toContain("Bolsonaro confortável");
  });

  it("(b) agrupa pelos thresholds default (comfortable=10, tossup=3)", () => {
    const rows: EdgeUfRow[] = [
      mkRow("AA", 13, 15), // A confortável (margem 15 ≥ 10)
      mkRow("BB", 13, 5), // A apertado (3 ≤ 5 < 10)
      mkRow("CC", 13, 1), // tossup (|1| < 3)
      mkRow("DD", 22, 4), // B apertado
      mkRow("EE", 22, 12), // B confortável
    ];
    const doc = parse(
      <StateGroupedTable
        rows={rows}
        candidatoAId={13}
        candidatoAName="Lula"
        candidatoBName="Bolsonaro"
      />,
    );
    // Cada coluna deve ter exatamente 1 UF
    const allLinks = Array.from(doc.querySelectorAll("td a")).map(
      (a) => a.textContent?.match(/^([A-Z]{2})/)?.[1],
    );
    expect(allLinks).toContain("AA");
    expect(allLinks).toContain("BB");
    expect(allLinks).toContain("CC");
    expect(allLinks).toContain("DD");
    expect(allLinks).toContain("EE");

    // Verifica posição na linha (5 colunas x N linhas)
    const firstRowCells = Array.from(doc.querySelectorAll("tbody tr:first-child td a")).map(
      (a) => a.textContent?.match(/^([A-Z]{2})/)?.[1],
    );
    // ordem por header: a_safe, a_close, tossup, b_close, b_safe
    expect(firstRowCells).toEqual(["AA", "BB", "CC", "DD", "EE"]);
  });

  it("(c) UFs aparecem como links para /uf/[sigla]", () => {
    const doc = parse(<StateGroupedTable rows={[mkRow("SP", 13, 5)]} candidatoAId={13} />);
    const link = doc.querySelector("td a");
    expect(link?.getAttribute("href")).toBe("/uf/SP");
  });

  it("(d) margem zero → tossup", () => {
    const doc = parse(<StateGroupedTable rows={[mkRow("XX", 13, 0)]} candidatoAId={13} />);
    // XX deve estar na 3a coluna (tossup)
    const firstRow = Array.from(doc.querySelectorAll("tbody tr:first-child td"));
    expect(firstRow[2]?.textContent ?? "").toContain("XX");
  });

  // --- S05/F3B: mode="multi-1t" -------------------------------------------

  it("(e) mode='binary' preservado: layout S04 com 5 colunas e labels antigas", () => {
    const rows = [mkRow("SP", 13, 15), mkRow("RJ", 22, 12)];
    const doc = parse(
      <StateGroupedTable
        rows={rows}
        candidatoAId={13}
        candidatoAName="Lula"
        candidatoBName="Bolsonaro"
        mode="binary"
      />,
    );
    const headers = Array.from(doc.querySelectorAll("th")).map((t) => t.textContent ?? "");
    expect(headers.length).toBe(5);
    expect(headers[0]).toContain("Lula confortável");
  });

  it("(f) mode='multi-1t' com 3 colunas (PT, PL, MDB) + 'Em disputa'", () => {
    const candidatos = [
      mkCand(13, "PT-Cand", 1),
      mkCand(22, "PL-Cand", 2),
      mkCand(25, "MDB-Cand", 3),
    ];
    const rows: EdgeUfRow[] = [
      mkRow("SP", 13, 15), // PT lidera (margem 15)
      mkRow("RS", 13, 10), // PT lidera
      mkRow("RJ", 22, 12), // PL lidera
      mkRow("AM", 25, 8), // MDB lidera
      mkRow("ZZ", 13, 1), // Em disputa (|1| < 2)
    ];
    const doc = parse(
      <StateGroupedTable rows={rows} candidatoAId={13} candidatos={candidatos} mode="multi-1t" />,
    );
    const headers = Array.from(doc.querySelectorAll("th")).map((t) => t.textContent ?? "");
    // 3 candidatos + 1 "Em disputa"
    expect(headers.length).toBe(4);
    expect(headers[0]).toContain("PT-Cand");
    expect(headers[1]).toContain("PL-Cand");
    expect(headers[2]).toContain("MDB-Cand");
    expect(headers[3]).toContain("Em disputa");
  });

  it("(g) mode='multi-1t': ordenação por |margem| desc dentro de cada coluna", () => {
    const candidatos = [mkCand(13, "Pri", 1)];
    const rows: EdgeUfRow[] = [
      mkRow("AAA", 13, 5), // |5|
      mkRow("BBB", 13, 18), // |18|
      mkRow("CCC", 13, 11), // |11|
    ];
    const doc = parse(
      <StateGroupedTable rows={rows} candidatoAId={13} candidatos={candidatos} mode="multi-1t" />,
    );
    // 1ª coluna (Pri) deve ordenar BBB → CCC → AAA
    const firstColCells = Array.from(doc.querySelectorAll("tbody tr td:first-child a")).map(
      (a) => a.textContent?.match(/^([A-Z]{2,3})/)?.[1],
    );
    expect(firstColCells).toEqual(["BBB", "CCC", "AAA"]);
  });

  it("(h) mode='multi-1t': 'Em disputa' agrupa UFs tossup independente do líder", () => {
    const candidatos = [mkCand(13, "P1", 1), mkCand(22, "P2", 2)];
    const rows: EdgeUfRow[] = [
      mkRow("XX", 13, 0.5), // tossup (margem < 2)
      mkRow("YY", 22, -1.5), // tossup (|margem| < 2)
      mkRow("ZZ", 13, 10), // P1 column
    ];
    const doc = parse(
      <StateGroupedTable rows={rows} candidatoAId={13} candidatos={candidatos} mode="multi-1t" />,
    );
    // Última coluna = "Em disputa" — deve conter XX e YY
    const lastColCells = Array.from(doc.querySelectorAll("tbody tr td:last-child a")).map(
      (a) => a.textContent?.match(/^([A-Z]{2})/)?.[1],
    );
    expect(lastColCells).toContain("XX");
    expect(lastColCells).toContain("YY");
    expect(lastColCells).not.toContain("ZZ");
  });
});
