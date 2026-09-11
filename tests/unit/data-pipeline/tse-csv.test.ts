// Regressão de `iterCsv` / `parseTseCsvLine` (data-pipeline/_tse-common.ts).
//
// O TSE emite newline DENTRO de campo entre aspas. Até 11/09/2026 o `iterCsv`
// lia linha a linha e entregava cada linha física ao parser, partindo esses
// registros em fragmentos: o primeiro perdia as colunas finais (`QT_ELEITOR_SECAO`
// virava 0 via `toIntOrZero`) e os seguintes vinham com todos os offsets
// deslocados. No `eleitorado_local_votacao_2024` isso sumia com 1.429 eleitores
// (155.911.251 importado vs. 155.912.680 real).

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  iterCsv,
  parseTseCsvLine,
  readCsvHeader,
  toIntOrZero,
} from "@/data-pipeline/_tse-common.ts";

const FIXTURE = resolve(__dirname, "../../fixtures/data-pipeline/multiline-quoted.csv");

// ISO-8859-1, CRLF, separador `;` — mesma forma dos CSVs do TSE. O registro do
// meio tem `DS_ENDERECO` quebrado em 3 linhas físicas, copiado do caso real
// (`RUA LOURIVAL GURGEL\nN°141\nBAIRRO: SÃO BENTO`, 6 ocorrências no CSV de 2024).
describe("iterCsv — newline embutido em campo entre aspas", () => {
  it("junta as linhas físicas num só registro, sem fragmentos", async () => {
    const rows: string[][] = [];
    for await (const f of iterCsv(FIXTURE)) rows.push(f);

    // 3 registros lógicos a partir de 6 linhas físicas (1 header + 5).
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r).toHaveLength(5);
  });

  it("preserva o conteúdo do campo multi-linha, com a quebra normalizada em \\n", async () => {
    const rows: string[][] = [];
    for await (const f of iterCsv(FIXTURE)) rows.push(f);

    expect(rows[1]![3]).toBe("RUA LOURIVAL GURGEL\nN°141\nBAIRRO: SÃO BENTO");
    // latin1 decodificado corretamente (`°`, `Ã`).
    expect(rows[1]![3]).toContain("N°141");
  });

  it("não desloca os offsets do registro seguinte", async () => {
    const rows: string[][] = [];
    for await (const f of iterCsv(FIXTURE)) rows.push(f);

    expect(rows[2]).toEqual([
      "11/09/2026",
      "SP",
      "ESCOLA ESTADUAL C",
      "AVENIDA CENTRAL, 20",
      "300",
    ]);
  });

  it("mantém QT_ELEITOR_SECAO de todos os registros (o bug zerava o fragmentado)", async () => {
    const header = await readCsvHeader(FIXTURE);
    const iElt = header.get("QT_ELEITOR_SECAO");
    expect(iElt).toBe(4);

    let soma = 0;
    for await (const f of iterCsv(FIXTURE)) soma += toIntOrZero(f[iElt!]);

    // Antes do fix: 100 + 0 + 300 = 400, mais um 4º "registro" lixo.
    expect(soma).toBe(650);
  });

  it("aborta em vez de engolir o arquivo quando há aspa solta na origem", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tse-csv-"));
    const path = join(dir, "aspa-solta.csv");
    // Aspa aberta e nunca fechada, seguida de muitas linhas: sem circuit
    // breaker isso viraria um único registro gigante, silenciosamente.
    const lines = ["A;B", '1;"aberta aqui', ...Array.from({ length: 200 }, (_, i) => `${i};x`)];
    writeFileSync(path, `${lines.join("\r\n")}\r\n`, "latin1");

    try {
      await expect(async () => {
        for await (const _ of iterCsv(path)) {
          // consome
        }
      }).rejects.toThrow(/aspas abertas/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("parseTseCsvLine", () => {
  it("aceita newline dentro de campo entre aspas", () => {
    expect(parseTseCsvLine('"a";"linha1\nlinha2";"c"')).toEqual(["a", "linha1\nlinha2", "c"]);
  });

  it('trata `""` como aspa literal (RFC 4180)', () => {
    expect(parseTseCsvLine('"ESCOLA ""SÃO JOSÉ""";"10"')).toEqual(['ESCOLA "SÃO JOSÉ"', "10"]);
  });

  it("mantém o comportamento de campos sem aspas e vazios", () => {
    expect(parseTseCsvLine("1;;RN;")).toEqual(["1", "", "RN", ""]);
  });

  it("não trata `;` dentro de aspas como separador", () => {
    expect(parseTseCsvLine('"a;b";c')).toEqual(["a;b", "c"]);
  });
});
