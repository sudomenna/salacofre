/**
 * tests/unit/config/cargos.test.ts
 *
 * Trava a tabela canônica de cargos (`lib/config/cargos.ts`), criada em
 * 2026-09-11 para reunir o que estava espalhado por quatro lugares
 * independentes — todos travados em `1 | 3` e sem nada que forçasse sincronia
 * entre eles (ver o cabeçalho do módulo).
 *
 * Os números aqui não são decorativos: `vagasPorUf: 2` para Senador e
 * `granularidade: "uf"` para 5/6 são decisões do ADR-0026 que, se regredirem em
 * silêncio, produzem tela errada (uma vaga a menos no Senado) ou ciclo de
 * ingestão acima do `maxDuration`.
 */

import { describe, expect, it } from "vitest";
import {
  CARGOS,
  CARGOS_TSE,
  cargoFromToken,
  cargoInfo,
  cargoToken,
  isCargoTse,
  parseCargoSegment,
} from "@/lib/config/cargos";

describe("tabela de cargos", () => {
  it("cobre exatamente Presidente, Governador, Senador e Deputado Federal", () => {
    expect(CARGOS_TSE).toEqual([1, 3, 5, 6]);
  });

  it("não cobre vices nem assembleias estaduais", () => {
    // 2 = Vice-Presidente e 4 = Vice-Governador não têm votação própria;
    // 7/8 = Deputado Estadual/Distrital estão fora do escopo do produto.
    for (const foraDoEscopo of [0, 2, 4, 7, 8, 9, 11, 13]) {
      expect(isCargoTse(foraDoEscopo), `cargo ${foraDoEscopo}`).toBe(false);
    }
  });

  it("Senador tem DUAS vagas por UF, não uma", () => {
    // O Senado renova 2/3 em 2026 → 2 por UF, 54 no total. O kit de UI rotula
    // "1 vaga" (ADR-0029) e a spec 016 não deve herdar esse rótulo.
    expect(cargoInfo(5).vagasPorUf).toBe(2);
    expect(CARGOS.filter((c) => c.vagasPorUf === 2)).toHaveLength(1);
  });

  it("Deputado Federal não tem nº fixo de vagas por UF", () => {
    // Proporcional: 8 a 70 por UF. O denominador do quociente eleitoral vem do
    // dado, nunca hardcoded — errá-lo corrompe a projeção inteira da UF.
    expect(cargoInfo(6).vagasPorUf).toBeNull();
    expect(cargoInfo(6).proporcional).toBe(true);
  });

  it("só Presidente tem arquivo agregado nacional no TSE", () => {
    expect(CARGOS.filter((c) => c.temArquivoBr).map((c) => c.cd)).toEqual([1]);
  });

  it("só Presidente e Governador admitem 2º turno", () => {
    expect(CARGOS.filter((c) => c.temSegundoTurno).map((c) => c.cd)).toEqual([1, 3]);
  });

  it("Senador e Deputado ingerem em UF; Presidente e Governador em zona (ADR-0026)", () => {
    expect(cargoInfo(1).granularidade).toBe("zona");
    expect(cargoInfo(3).granularidade).toBe("zona");
    expect(cargoInfo(5).granularidade).toBe("uf");
    expect(cargoInfo(6).granularidade).toBe("uf");
  });

  it("token e código são conversíveis nos dois sentidos, sem colisão", () => {
    const tokens = CARGOS.map((c) => c.token);
    expect(new Set(tokens).size).toBe(tokens.length);
    for (const c of CARGOS) {
      expect(cargoToken(c.cd)).toBe(c.token);
      expect(cargoFromToken(c.token)).toBe(c.cd);
    }
  });

  it("slugs são únicos e não colidem com códigos", () => {
    const slugs = CARGOS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(Number.isNaN(Number(slug))).toBe(true);
  });
});

describe("parseCargoSegment", () => {
  it("aceita código e slug, case-insensitive, com espaço", () => {
    expect(parseCargoSegment("1")).toBe(1);
    expect(parseCargoSegment("presidente")).toBe(1);
    expect(parseCargoSegment("  Governador ")).toBe(3);
    expect(parseCargoSegment("SENADOR")).toBe(5);
    expect(parseCargoSegment("deputado-federal")).toBe(6);
    expect(parseCargoSegment("6")).toBe(6);
  });

  it("devolve null para tudo que não é cargo coberto", () => {
    for (const lixo of [
      "",
      "   ",
      "2",
      "7",
      "99",
      "-1",
      "1.5",
      "vereador",
      "deputado-estadual",
      "../etc/passwd",
    ]) {
      expect(parseCargoSegment(lixo), `segmento ${JSON.stringify(lixo)}`).toBeNull();
    }
  });

  it("não aceita o TOKEN de chave como segmento de rota", () => {
    // `"pres"`/`"gov"` nomeiam chaves do Global Config (ADR-0012), não rotas.
    // Aceitá-los aqui criaria dois caminhos para a mesma coisa.
    for (const token of CARGOS.map((c) => c.token)) {
      expect(parseCargoSegment(token), `token ${token}`).toBeNull();
    }
  });
});
