/**
 * tests/unit/tse/ea12-schema.test.ts
 *
 * EA12 — "Arquivo de configuração de municípios" (`comum/config/mun-e<n>-cm.json`).
 * É a fonte oficial do mapa município → zonas, ou seja, dos pares que viram
 * arquivos EA20 em 2026 (ADR-0035 D1).
 *
 * ATENÇÃO — procedência da fixture: nenhuma amostra real do EA12 2026 existe
 * ainda. O objeto abaixo foi montado à mão a partir do PDF oficial
 * (`tse_docs/txt/tse-ea12-arquivo-de-configuracao-de-municipios.txt`, versão
 * 2026-05-22): estrutura e nomes de campo vêm do documento; os códigos e nomes
 * de município são plausíveis, não coletados. Substituir pela fixture real
 * assim que o simulado de 15–17/09 publicar o arquivo.
 */

import { describe, expect, it } from "vitest";
import { derivarPares, parseCodigoTse, parseEA12 } from "@/lib/tse/ea12-schema";

// source: pdf — substituir pela fixture real do simulado
const EA12_FIXTURE = {
  dg: "22/05/2026",
  hg: "14:30:05",
  idg: "1234567890",
  f: "s",
  abr: [
    {
      cd: "sp",
      ds: "São Paulo",
      mu: [
        {
          cd: "71072",
          cdi: "35503",
          nm: "SÃO PAULO",
          c: "s",
          z: ["0001", "0002", "0003"],
        },
        {
          // Dois municípios compartilhando a zona 0264 — o caso que o esquema
          // antigo (uma linha por zona) não conseguia representar.
          cd: "62960",
          cdi: "35032",
          nm: "ARARAQUARA",
          c: "n",
          z: ["0264"],
        },
        {
          cd: "63258",
          cdi: "35046",
          nm: "BOA ESPERANÇA DO SUL",
          c: "n",
          z: ["0264"],
        },
      ],
    },
    {
      cd: "zz",
      ds: "Exterior",
      mu: [
        {
          cd: "30educ", // código inválido de propósito — deve ser descartado
          nm: "LOCALIDADE INVÁLIDA",
          c: "n",
          z: ["0001"],
        },
        {
          cd: "00001",
          nm: "ZURIQUE",
          c: "n",
          z: ["0001"],
        },
      ],
    },
  ],
} as const;

describe("parseCodigoTse", () => {
  it("desfaz o preenchimento com zeros à esquerda", () => {
    expect(parseCodigoTse("00001")).toBe(1);
    expect(parseCodigoTse("0264")).toBe(264);
    expect(parseCodigoTse("71072")).toBe(71072);
  });

  it("devolve null para código vazio ou não-numérico — nunca um chute", () => {
    expect(parseCodigoTse("")).toBeNull();
    expect(parseCodigoTse("   ")).toBeNull();
    expect(parseCodigoTse("30educ")).toBeNull();
    expect(parseCodigoTse("#NULO#")).toBeNull();
  });
});

describe("EA12Schema — envelope", () => {
  it("aceita o leiaute do PDF e expõe dg/hg/idg/f", () => {
    const ea12 = parseEA12(EA12_FIXTURE);
    expect(ea12.dg).toBe("22/05/2026");
    expect(ea12.idg).toBe("1234567890");
    expect(ea12.f).toBe("s");
    expect(ea12.abr).toHaveLength(2);
  });

  it("passthrough: campo desconhecido não derruba o parse", () => {
    const comExtra = {
      ...EA12_FIXTURE,
      campoNovoDoTse: "qualquer coisa",
      abr: [{ ...EA12_FIXTURE.abr[0], outroCampo: 42 }],
    };
    expect(() => parseEA12(comExtra)).not.toThrow();
  });

  it("falha quando falta um campo que o pipeline consome", () => {
    const semAbr = { dg: "22/05/2026", hg: "14:30:05", idg: "1", f: "o" };
    expect(() => parseEA12(semAbr)).toThrow();
  });
});

describe("derivarPares", () => {
  it("achata município → zonas em um par por linha", () => {
    const { pares } = derivarPares(parseEA12(EA12_FIXTURE));
    // SP: 3 zonas de São Paulo + 1 de Araraquara + 1 de Boa Esperança do Sul.
    // ZZ é excluída por default.
    expect(pares).toHaveLength(5);
    expect(pares.every((p) => p.uf === "SP")).toBe(true);
  });

  it("preserva a zona compartilhada por dois municípios", () => {
    const { pares } = derivarPares(parseEA12(EA12_FIXTURE));
    const z264 = pares.filter((p) => p.codZona === 264);
    expect(z264).toHaveLength(2);
    expect(z264.map((p) => p.codMunicipioTse).sort()).toEqual([62960, 63258]);
  });

  it("lê a capital de `mu[].c`", () => {
    const { pares } = derivarPares(parseEA12(EA12_FIXTURE));
    const capitais = new Set(pares.filter((p) => p.capital).map((p) => p.nomeMunicipio));
    expect([...capitais]).toEqual(["SÃO PAULO"]);
  });

  it("exclui ZZ por default e a inclui quando pedido", () => {
    const ea12 = parseEA12(EA12_FIXTURE);
    expect(derivarPares(ea12).pares.some((p) => p.uf === "ZZ")).toBe(false);
    const comZz = derivarPares(ea12, { excluirUfs: [] });
    expect(comZz.pares.some((p) => p.uf === "ZZ")).toBe(true);
  });

  it("conta os códigos malformados em vez de corrigi-los", () => {
    // O município de código "30educ" só é visitado quando ZZ entra.
    const { descartados } = derivarPares(parseEA12(EA12_FIXTURE), { excluirUfs: [] });
    expect(descartados).toBe(1);
  });
});
