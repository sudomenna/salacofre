// @vitest-environment happy-dom
/**
 * tests/unit/components/MunicipioTable.topByEleitorado.test.tsx
 *
 * S06/F4d (Fase 3) — cobre o novo `mode="top-by-eleitorado"` do
 * `<MunicipioTable />`. Default mode coberto em MunicipioTable.test.tsx
 * (intocado — preserva regressão).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { type MunicipioRow, MunicipioTable } from "@/components/blocks/MunicipioTable";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function mkRows(n: number): MunicipioRow[] {
  // Eleitorado decrescente garantido: i=0 tem maior, último tem menor.
  return Array.from({ length: n }, (_, i) => ({
    cod_ibge: `35${String(i).padStart(5, "0")}`,
    nome: `Município ${i + 1}`,
    lider: 13,
    liderCor: "var(--color-cand-1)",
    liderNome: "Lula",
    margemPp: 5,
    pctApurado: 100,
    votosReportados: 1000,
    eleitorado: 1_000_000 - i * 1000,
    deltaVs2022: i % 3 === 0 ? 2.5 : i % 3 === 1 ? -1.4 : null,
  }));
}

describe('<MunicipioTable mode="top-by-eleitorado" />', () => {
  it("(a) renderiza apenas topN municípios (default 15)", () => {
    const doc = parse(<MunicipioTable rows={mkRows(50)} mode="top-by-eleitorado" />);
    const dataRows = doc.querySelectorAll('[data-testid="municipios-top-table"] tbody tr');
    expect(dataRows.length).toBe(15);
  });

  it("(b) topN custom é respeitado", () => {
    const doc = parse(<MunicipioTable rows={mkRows(50)} mode="top-by-eleitorado" topN={5} />);
    const dataRows = doc.querySelectorAll('[data-testid="municipios-top-table"] tbody tr');
    expect(dataRows.length).toBe(5);
  });

  it("(c) ordenação correta: maior eleitorado primeiro", () => {
    const rows = mkRows(20);
    const doc = parse(<MunicipioTable rows={rows} mode="top-by-eleitorado" topN={3} />);
    const firstRow = doc.querySelector('[data-testid="municipios-top-table"] tbody tr:first-child');
    // Município 1 tem eleitorado 1_000_000 (o maior)
    expect(firstRow?.textContent ?? "").toContain("Município 1");
  });

  it("(d) header novo: Eleitorado, Margem, Δ vs 2022", () => {
    const doc = parse(<MunicipioTable rows={mkRows(3)} mode="top-by-eleitorado" />);
    const headers = Array.from(
      doc.querySelectorAll('[data-testid="municipios-top-table"] thead th'),
    ).map((th) => th.textContent ?? "");
    expect(headers).toContain("Município");
    expect(headers).toContain("Eleitorado");
    expect(headers).toContain("Margem");
    expect(headers.some((h) => h.includes("2022"))).toBe(true);
  });

  it("(e) delta=null renderiza como '—'", () => {
    const row: MunicipioRow = {
      cod_ibge: "3550308",
      nome: "São Paulo",
      lider: 13,
      liderCor: "var(--color-cand-1)",
      liderNome: "Lula",
      margemPp: 5,
      pctApurado: 100,
      votosReportados: 1000,
      eleitorado: 9_000_000,
      deltaVs2022: null,
    };
    const doc = parse(<MunicipioTable rows={[row]} mode="top-by-eleitorado" />);
    expect(doc.body.textContent ?? "").toContain("—");
  });

  it("(f) delta positivo tem '+', negativo tem '-'", () => {
    const rows: MunicipioRow[] = [
      {
        cod_ibge: "1",
        nome: "A",
        lider: 13,
        liderCor: "x",
        liderNome: "L",
        margemPp: 5,
        pctApurado: 100,
        votosReportados: 1,
        eleitorado: 2,
        deltaVs2022: 3.2,
      },
      {
        cod_ibge: "2",
        nome: "B",
        lider: 13,
        liderCor: "x",
        liderNome: "L",
        margemPp: 5,
        pctApurado: 100,
        votosReportados: 1,
        eleitorado: 1,
        deltaVs2022: -2.7,
      },
    ];
    const doc = parse(<MunicipioTable rows={rows} mode="top-by-eleitorado" />);
    const text = doc.body.textContent ?? "";
    expect(text).toContain("+3.2pp");
    expect(text).toContain("-2.7pp");
  });

  it("(g) mode default continua funcionando (regressão)", () => {
    const rows: MunicipioRow[] = [
      {
        cod_ibge: "3550308",
        nome: "São Paulo",
        lider: 13,
        liderCor: "var(--color-cand-1)",
        liderNome: "Lula",
        margemPp: 8.2,
        pctApurado: 100,
        votosReportados: 4_213_847,
      },
    ];
    const doc = parse(<MunicipioTable rows={rows} />);
    // Mode default usa header h3 "Municípios (1)" — não "Maiores municípios"
    const h3 = doc.querySelector("h3");
    expect(h3?.textContent ?? "").toContain("Municípios");
    expect(h3?.textContent ?? "").not.toContain("Maiores");
  });

  it("(h) ignora municípios sem campo `eleitorado`", () => {
    const rows: MunicipioRow[] = [
      {
        cod_ibge: "1",
        nome: "Com eleitorado",
        lider: 13,
        liderCor: "x",
        liderNome: "L",
        margemPp: 5,
        pctApurado: 100,
        votosReportados: 1,
        eleitorado: 1000,
      },
      {
        cod_ibge: "2",
        nome: "Sem eleitorado",
        lider: 13,
        liderCor: "x",
        liderNome: "L",
        margemPp: 5,
        pctApurado: 100,
        votosReportados: 1,
        // eleitorado omitido
      },
    ];
    const doc = parse(<MunicipioTable rows={rows} mode="top-by-eleitorado" />);
    const dataRows = doc.querySelectorAll('[data-testid="municipios-top-table"] tbody tr');
    expect(dataRows.length).toBe(1);
    expect(doc.body.textContent ?? "").toContain("Com eleitorado");
    expect(doc.body.textContent ?? "").not.toContain("Sem eleitorado");
  });
});
