/**
 * tests/unit/config/cargos.test.ts
 *
 * Trava a tabela canônica de cargos (`lib/config/cargos.ts`), criada em
 * 2026-09-11 para reunir o que estava espalhado por quatro lugares
 * independentes — todos travados em `1 | 3` e sem nada que forçasse sincronia
 * entre eles (ver o cabeçalho do módulo).
 *
 * Os números aqui não são decorativos: `vagasPorUf: 2` para Senador e os tetos
 * de `rpsMax` são decisões que, se regredirem em silêncio, produzem tela errada
 * (uma vaga a menos no Senado), ciclo acima do `maxDuration`, ou pico de
 * requisições acima do teto do TSE — que bloqueia o IP por 10 minutos.
 */

import { describe, expect, it } from "vitest";
import {
  CARGOS,
  CARGOS_TSE,
  cargoFromToken,
  cargoInfo,
  cargoToken,
  eleicaoDoCargo,
  isCargoTse,
  parseCargoSegment,
  piorCasoAgregadoRps,
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

  it("os quatro cargos ingerem em zona — Deputado migrou por último, em 2026-09-13", () => {
    // Senador saiu de "uf" para "zona" em 2026-09-11 (emenda ao ADR-0026 item 1,
    // decisão do usuário); Deputado Federal seguiu o mesmo caminho em
    // 2026-09-13, mesmo diagnóstico: com um boletim por estado o bootstrap tem
    // uma única unidade de reamostragem e `p_eleito`/o IC95 degeneram.
    expect(cargoInfo(1).granularidade).toBe("zona");
    expect(cargoInfo(3).granularidade).toBe("zona");
    expect(cargoInfo(5).granularidade).toBe("zona");
    expect(cargoInfo(6).granularidade).toBe("zona");
    expect(CARGOS.every((c) => c.granularidade === "zona")).toBe(true);
  });

  it("o orçamento de rps fecha em 80 — TRÊS cargos a 25, Deputado sozinho a 5", () => {
    // A conta que mudou com Senador em zona: três pesados a 35 dariam 110 rps
    // agregados, acima do teto de 100 do TSE. A 25, o agregado volta a 80.
    // Deputado Federal foi para "zona" em 2026-09-13 mas NÃO ganhou rps —
    // continua em 5 (fatiado em 6 invocações em vez de subir a taxa por
    // invocação), então o agregado se mantém 80, não 90.
    const pesados = CARGOS.filter((c) => c.cd !== 6);
    expect(pesados).toHaveLength(3);
    for (const c of pesados) expect(c.rpsMax, `cargo ${c.cd}`).toBe(25);
    expect(cargoInfo(6).rpsMax).toBe(5);
    expect(piorCasoAgregadoRps()).toBe(80);
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

// ---------------------------------------------------------------------------
// Eleição por cargo (TSE 2026: pleito 17801 com DOIS códigos de eleição)
// ---------------------------------------------------------------------------

describe("eleicao / eleicaoDoCargo", () => {
  // O TSE 2026 publica Presidente sob a Eleição Ordinária Federal (21270) e
  // Governador/Senador/Deputado sob a Estadual (21272). Este literal é o que
  // impede a tabela de virar "tudo federal" ou "tudo estadual" em silêncio —
  // um erro aqui manda o cargo inteiro para o arquivo errado do CDN.
  it("trava o mapeamento cargo → eleição", () => {
    expect(CARGOS.map((c) => [c.cd, c.eleicao])).toEqual([
      [1, "federal"],
      [3, "estadual"],
      [5, "estadual"],
      [6, "estadual"],
    ]);
  });

  it("Presidente é o ÚNICO cargo federal", () => {
    expect(CARGOS.filter((c) => c.eleicao === "federal").map((c) => c.cd)).toEqual([1]);
  });

  it("eleicaoDoCargo devolve o valor da tabela para todos os cargos cobertos", () => {
    for (const c of CARGOS) {
      expect(eleicaoDoCargo(c.cd), `cargo ${c.cd}`).toBe(c.eleicao);
    }
  });
});
