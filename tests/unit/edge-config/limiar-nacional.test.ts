/**
 * O limiar de aviso do payload nacional acompanha o ELENCO (2026-09-19).
 *
 * ## Por que este arquivo existe
 *
 * O limiar era fixo em 75 KiB, calibrado para "11 candidatos + `cenarios_2t`" —
 * está escrito assim no próprio `writer.ts`. Aplicado ao Senado, que junta 27
 * corridas de 2 vagas num payload só (**285 candidaturas**), ele acendia a luz
 * por o cargo existir: 98,8 KiB medidos, e **94,3 KiB já antes** da rodada de
 * 19/09. Um alarme que toca sempre é um alarme que ninguém escuta — e o item
 * estava marcado como "nunca medido" no planejamento da sprint, o que quer
 * dizer que ninguém nunca tinha olhado.
 *
 * O que o aviso existe para pegar **não mudou**: blow-up estrutural
 * (`cenarios_2t` virando top-50, candidatos duplicados sem dedup, `por_uf`
 * ganhando municípios). Nada disso escala com quanta gente concorre — tudo
 * escala com o BYTE POR CANDIDATURA. É isso que o limiar novo mede.
 *
 * ⚠️ Nada aqui afrouxa a parede de verdade: o teto de 1 MB do store, com aviso
 * em 780 KB e erro em 940 KB, segue intocado, e o guarda de "uma chave só
 * ocupando 45% do store" (450 KiB) também.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { limiarNacionalBytes } from "@/lib/edge-config/writer";

const RAIZ = process.cwd();
const KIB = 1024;

/** Os payloads nacionais REAIS, não fixtures inventadas para o teste. */
function payloadReal(arquivo: string): { bytes: number; candidaturas: number } {
  const bruto = readFileSync(resolve(RAIZ, `tests/fixtures/simulacao/${arquivo}`), "utf8");
  const d = JSON.parse(bruto) as { national?: { candidatos?: unknown[] } };
  return {
    bytes: Buffer.byteLength(JSON.stringify(d)),
    candidaturas: d.national?.candidatos?.length ?? 0,
  };
}

describe("limiarNacionalBytes — o alarme acompanha o elenco", () => {
  it("o PISO é o mesmo 75 KiB de antes, no elenco para o qual foi calibrado", () => {
    // Mutação que morre: mexer no piso "para arrumar o Senado". O Presidente
    // é o ponto de calibração original e não pode afrouxar nem apertar por
    // causa de outro cargo — foi exatamente essa confusão que criou o defeito.
    expect(limiarNacionalBytes(12)).toBe(75 * KIB);
    expect(limiarNacionalBytes(11)).toBe(75 * KIB);
    // Elenco menor que o base NÃO encolhe o limiar: piso é piso.
    expect(limiarNacionalBytes(0)).toBe(75 * KIB);
  });

  it("🔴 cresce com o elenco, e é isso que conserta o Senado", () => {
    // Mutação que morre: voltar a um número fixo (o limiar pararia de crescer
    // e os três `toBeGreaterThan` abaixo quebrariam de uma vez).
    expect(limiarNacionalBytes(180)).toBeGreaterThan(limiarNacionalBytes(12));
    expect(limiarNacionalBytes(285)).toBeGreaterThan(limiarNacionalBytes(180));
    // A folga por candidatura é ~1,8× os 281 B medidos: uma candidatura ficar
    // DUAS vezes mais cara continua sendo blow-up e continua acendendo a luz.
    const porCandidatura = limiarNacionalBytes(113) - limiarNacionalBytes(112);
    expect(porCandidatura).toBe(512);
    expect(porCandidatura).toBeGreaterThan(281 * 1.5);
    expect(porCandidatura).toBeLessThan(281 * 2.5);
  });

  it("🔴 nenhum payload REAL dispara o aviso hoje — Senado incluído", () => {
    // É o caso que o dono pediu. Mutação que morre: qualquer aperto do limiar
    // que reintroduza o alarme falso. Usa os payloads de verdade, não fixtures
    // feitas para passar.
    const reprovas: string[] = [];
    for (const arquivo of ["presidente.json", "governador.json", "senador.json"]) {
      const { bytes, candidaturas } = payloadReal(arquivo);
      const limiar = limiarNacionalBytes(candidaturas);
      if (bytes > limiar) {
        reprovas.push(
          `${arquivo}: ${(bytes / KIB).toFixed(1)} KiB > ${(limiar / KIB).toFixed(1)} KiB ` +
            `(${candidaturas} candidaturas)`,
        );
      }
    }
    expect(reprovas, "payload real acima do limiar").toEqual([]);
  });

  it("🔴 mas o aviso AINDA dispara quando o byte por candidatura dobra", () => {
    // Sem este caso, `limiarNacionalBytes = () => Infinity` passaria em tudo
    // acima e o alarme viraria enfeite. O limiar tem de continuar pegando o
    // que foi escrito para pegar.
    const { bytes, candidaturas } = payloadReal("senador.json");
    const inchado = bytes * 2.5;
    expect(inchado).toBeGreaterThan(limiarNacionalBytes(candidaturas));
  });

  it("a folga real fica entre 2× e 3× em todos os cargos — nem apertada, nem enfeite", () => {
    // Uma folga muito maior que isso seria alarme decorativo; muito menor,
    // alarme falso. O intervalo é a prova de que a régua é a mesma para os
    // três cargos, que era o defeito de origem.
    for (const arquivo of ["presidente.json", "governador.json", "senador.json"]) {
      const { bytes, candidaturas } = payloadReal(arquivo);
      const folga = limiarNacionalBytes(candidaturas) / bytes;
      expect(folga, `folga de ${arquivo}`).toBeGreaterThan(2);
      expect(folga, `folga de ${arquivo}`).toBeLessThan(3);
    }
  });
});
