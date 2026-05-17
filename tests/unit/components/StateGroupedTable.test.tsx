// @vitest-environment happy-dom
/**
 * tests/unit/components/StateGroupedTable.test.tsx — RF-030.6.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StateGroupedTable } from "@/components/blocks/StateGroupedTable";
import type { EdgeUfRow } from "@/lib/edge-config/types";

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
});
