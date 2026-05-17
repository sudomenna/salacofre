// @vitest-environment happy-dom
/**
 * Unit tests do <MunicipioTable /> (RF-037).
 *
 * Foco em virtualização: com 645 linhas e viewport 480px, devemos renderizar
 * só ~20 linhas, NÃO as 645.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { type MunicipioRow, MunicipioTable } from "@/components/blocks/MunicipioTable";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function makeRows(n: number): MunicipioRow[] {
  return Array.from({ length: n }, (_, i) => ({
    cod_ibge: `35${String(i).padStart(5, "0")}`,
    nome: `Município ${i + 1}`,
    lider: i % 2 === 0 ? 13 : 22,
    liderCor: i % 2 === 0 ? "var(--color-pt)" : "var(--color-pl)",
    liderNome: i % 2 === 0 ? "Lula" : "Bols",
    margemPp: 5 + (i % 10),
    pctApurado: 100,
    votosReportados: 10_000 + i * 137,
  }));
}

describe("<MunicipioTable />", () => {
  it("(a) renderiza header com total de municípios", () => {
    const doc = parse(<MunicipioTable rows={makeRows(645)} />);
    const heading = doc.querySelector("h3");
    expect(heading?.textContent).toContain("645");
  });

  it("(b) no SSR inicial, virtualização limita render ao overscan inicial — não renderiza 645 rows", () => {
    const doc = parse(<MunicipioTable rows={makeRows(645)} />);
    // tbody data rows: excluímos thead row (1 só)
    const dataRows = doc.querySelectorAll("tbody tr[aria-rowindex]");
    expect(dataRows.length).toBeLessThan(50);
    expect(dataRows.length).toBeGreaterThan(0);
  });

  it("(c) aria-rowcount no <table> reflete total absoluto", () => {
    const doc = parse(<MunicipioTable rows={makeRows(645)} />);
    const table = doc.querySelector("table");
    expect(table?.getAttribute("aria-rowcount")).toBe("645");
  });

  it("(d) cada row de dado renderizada tem aria-rowindex", () => {
    const doc = parse(<MunicipioTable rows={makeRows(10)} rowHeight={40} height={400} />);
    const rows = Array.from(doc.querySelectorAll("tbody tr[aria-rowindex]"));
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) => {
      expect(r.getAttribute("aria-rowindex")).toBeTruthy();
    });
  });

  it("(e) formata votos em pt-BR e percentual com casa decimal opcional", () => {
    const doc = parse(<MunicipioTable rows={makeRows(5)} />);
    const text = doc.body.textContent ?? "";
    expect(text).toContain("10.000"); // primeira linha: 10000
    expect(text).toContain("100%");
  });

  it("(f) lista vazia ainda renderiza header e 0", () => {
    const doc = parse(<MunicipioTable rows={[]} />);
    const heading = doc.querySelector("h3");
    expect(heading?.textContent).toContain("0");
  });

  it("(g) S04/F2: exibe margem e votos reais (antes era placeholder de 5pp/0 votos)", () => {
    // Linhas com campos derivados do payload UF enriquecido: o page faz
    // `m.lider.margem_pp` + `sum(votos_reportados)`. Esta tabela espera
    // os mesmos campos já transformados pelo caller.
    const rows: MunicipioRow[] = [
      {
        cod_ibge: "3550308",
        nome: "São Paulo",
        lider: 13,
        liderCor: "var(--color-pt)",
        liderNome: "Lula",
        margemPp: 8.2,
        pctApurado: 100,
        votosReportados: 4_213_847,
      },
    ];
    const doc = parse(<MunicipioTable rows={rows} />);
    const text = doc.body.textContent ?? "";
    // Margem real, não placeholder de 5pp.
    expect(text).toContain("8.2%");
    // Votos formatados pt-BR.
    expect(text).toContain("4.213.847");
    // Nome do líder na coluna de margem.
    expect(text).toContain("Lula");
  });
});
