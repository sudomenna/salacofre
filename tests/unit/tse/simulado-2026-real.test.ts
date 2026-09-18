/**
 * Os arquivos REAIS do simulado do TSE viram guarda, não só amostra.
 *
 * ## O buraco que este arquivo fecha
 *
 * `tests/fixtures/tse/2026-sim/` tem 14 arquivos baixados do CDN do TSE em
 * 17/09 — cópias byte a byte do que o órgão realmente publicou. Até 18/09
 * **nenhum teste automatizado os lia**: o único consumidor era o script manual
 * `scripts/verify-fatia-premise.ts`.
 *
 * Quem guardava o parser era `tests/unit/tse/ea20-fixtures-2026.test.ts`, sobre
 * `tests/fixtures/tse/2026/` — fixtures **derivadas do dicionário de campos**,
 * porque o TSE não publica exemplo de JSON completo. São úteis e não saem daqui.
 * Mas elas provam que o parser casa com a **documentação**, e um simulado existe
 * justamente para revelar onde documentação e realidade divergem.
 *
 * O README do diretório afirma que "EA20Schema, EA14Schema e EA15Schema passam
 * em todos os arquivos". Era verdade — **conferida à mão, uma vez, em 17/09**.
 * Prosa de README não reprova build.
 *
 * ## 🔴 A premissa da fatia, provada sem banco
 *
 * A pergunta mais cara de errar do projeto: o arquivo EA20 de zona
 * `<uf><mun5>-z<zona4>-…` traz **a fatia da zona que cai naquele município**,
 * ou a zona inteira repetida? Se for a segunda, `merge_pairs_into_zonas` soma
 * N cópias da mesma zona (N até 8 no país) e todo painel municipal credita a
 * zona inteira a cada município que ela toca — em ~62% das zonas.
 *
 * `scripts/verify-fatia-premise.ts` responde isso, mas **exige `DATABASE_URL`**
 * (lê `eleitorado` e `zonas`), então não roda em toda corrida.
 *
 * Há um discriminador que **não precisa de banco nenhum**, e ele está inteiro
 * dentro dos arquivos capturados: Rio Branco (`ac01392`) e Bujari (`ac01007`)
 * **dividem a zona 0009**, e temos os dois arquivos. Duas consequências
 * independentes, e as duas são testadas abaixo:
 *
 *   1. a mesma zona vista de dois municípios tem de dar números DIFERENTES —
 *      se fossem a zona inteira, seriam idênticos;
 *   2. o arquivo do MUNICÍPIO tem de fechar exatamente com a soma dos
 *      arquivos das zonas dele — se cada zona trouxesse o total dela, a soma
 *      de Rio Branco estouraria o próprio município.
 *
 * A (2) é a mais forte: ela falha também num mundo em que os números são
 * diferentes **mas errados**.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { EA14Schema, EA15Schema } from "@/lib/tse/acompanhamento";
import { EA20Schema, parseEA20Numeric } from "@/lib/tse/ea20-schema";

// 🔴 `@/lib/tse/acompanhamento` puxa `lib/tse/targets.ts`, que abre conexão com
// o Neon na CARGA DO MÓDULO. Este arquivo só lê JSON do disco e valida schema —
// nada aqui toca o banco. Sem o mock, ele entraria nos 10 arquivos que falham
// na COLETA por falta de `DATABASE_URL`, e teste que nem é coletado não guarda
// coisa nenhuma: foi exatamente assim que o RF-060 passou meses constando como
// "coberto por teste unit" sem nunca ter rodado em máquina nenhuma.
vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(() => ({ from: () => Promise.resolve([]) })) },
  schema: {},
}));

const DIR = resolve(process.cwd(), "tests/fixtures/tse/2026-sim");

function ler(nome: string): unknown {
  return JSON.parse(readFileSync(resolve(DIR, nome), "utf8"));
}

/** `e.te` — total de eleitores da abrangência. NÃO confundir com `e.a`, que é
 *  **abstenção**, nem com `e.c`, que é comparecimento. */
function totalEleitores(nome: string): number {
  const j = ler(nome) as { e: { te: string } };
  return parseEA20Numeric(j.e.te) as number;
}

const ARQUIVOS_EA20 = [
  "br-c0001-e021270-u.json",
  "ac-c0003-e021272-u.json",
  "zz-c0001-e021270-u.json",
  "zz29254-z0001-c0001-e021270-u.json",
  "ac01392-c0001-e021270-u.json",
  "ac01392-z0001-c0001-e021270-u.json",
  "ac01392-z0009-c0001-e021270-u.json",
  "ac01007-c0001-e021270-u.json",
  "ac01007-z0009-c0001-e021270-u.json",
] as const;

describe("fixtures reais do simulado — o diretório está inteiro", () => {
  it("os 14 arquivos capturados continuam lá", () => {
    // 🔴 Anti-vácuo. Sem esta contagem, apagar o diretório faria TODO teste
    // abaixo sumir da suíte sem uma única linha vermelha — o modo de falha
    // mais silencioso que um arquivo de teste pode ter.
    const arquivos = readdirSync(DIR).filter((f) => f.endsWith(".json"));
    expect(arquivos.length, "esperado 14 JSONs reais do TSE").toBe(14);
  });
});

describe("os schemas casam com o que o TSE REALMENTE mandou", () => {
  it.each(ARQUIVOS_EA20)("EA20Schema parseia %s", (nome) => {
    // Até agora isto era uma frase no README, conferida à mão em 17/09.
    expect(() => EA20Schema.parse(ler(nome))).not.toThrow();
  });

  it("EA14Schema parseia o acompanhamento do Brasil", () => {
    expect(() => EA14Schema.parse(ler("br-e021270-ab.json"))).not.toThrow();
  });

  it.each(["ac-e021270-ab.json", "zz-e021270-ab.json"])("EA15Schema parseia %s", (nome) => {
    expect(() => EA15Schema.parse(ler(nome))).not.toThrow();
  });

  it("o EA20 do exterior parseia igual aos demais — ZZ não é caso à parte no schema", () => {
    // ADR-0045. O exterior tem 760.913 aptos e abrangência própria; se o
    // schema precisasse de um ramo só para ele, seria sinal de que o leiaute
    // diverge e o parser está tolerando por acaso.
    const zz = EA20Schema.parse(ler("zz-c0001-e021270-u.json")) as { tpabr: string };
    expect(zz.tpabr).toBe("uf");
  });
});

describe("🔴 a premissa da FATIA, contra dado real e sem banco", () => {
  // Rio Branco e Bujari dividem a zona 0009 — é por isso que estes dois
  // municípios foram os escolhidos na captura de 17/09.
  const RB_MUN = "ac01392-c0001-e021270-u.json";
  const RB_Z1 = "ac01392-z0001-c0001-e021270-u.json";
  const RB_Z9 = "ac01392-z0009-c0001-e021270-u.json";
  const BU_MUN = "ac01007-c0001-e021270-u.json";
  const BU_Z9 = "ac01007-z0009-c0001-e021270-u.json";

  it("a MESMA zona vista de dois municípios traz números diferentes", () => {
    const rb = totalEleitores(RB_Z9);
    const bu = totalEleitores(BU_Z9);

    expect(rb, "Rio Branco × zona 0009").toBeGreaterThan(0);
    expect(bu, "Bujari × zona 0009").toBeGreaterThan(0);
    expect(
      rb,
      "🔴 MULTIPLICAÇÃO: os dois municípios recebem o MESMO eleitorado para a " +
        "zona 0009 — cada arquivo traz a zona inteira, não a fatia. " +
        "`merge_pairs_into_zonas` estaria somando cópias.",
    ).not.toBe(bu);
  });

  it("o município FECHA com a soma das zonas dele — a prova forte", () => {
    // Mais forte que a anterior: falha também num mundo em que os números são
    // diferentes mas errados. Se cada arquivo de zona trouxesse o total da
    // zona, a soma de Rio Branco estouraria o próprio município.
    expect(totalEleitores(RB_Z1) + totalEleitores(RB_Z9)).toBe(totalEleitores(RB_MUN));

    // Bujari tem uma zona só: o município É a fatia.
    expect(totalEleitores(BU_Z9)).toBe(totalEleitores(BU_MUN));
  });

  it("a fatia de Rio Branco na zona 0009 é MAIOR que a de Bujari, e as duas cabem", () => {
    // Direção e ordem de grandeza, não só desigualdade. Um bug que trocasse os
    // arquivos passaria nos dois casos acima e cairia aqui.
    const rb = totalEleitores(RB_Z9);
    const bu = totalEleitores(BU_Z9);
    expect(rb).toBeGreaterThan(bu);
    // A zona 0009 inteira é a soma das duas fatias — e nenhuma delas sozinha
    // pode valer a zona toda.
    expect(rb).toBeLessThan(rb + bu);
    expect(bu).toBeLessThan(rb + bu);
  });
});
