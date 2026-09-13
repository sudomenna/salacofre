// Desempate de `(cargo, uf, numero)` — `data-pipeline/candidatos-resolve.ts`.
//
// Spec 018 RF-143, ADR-0042 item 5.
//
// Os casos de borda **não são inventados**: são as quatro colisões que
// sobrevivem ao filtro de publicabilidade no arquivo que o TSE gerou em
// 12/09/2026, copiadas literalmente. Duas delas repetem o MESMO nome no mesmo
// número — não há como escolher "o certo" por nome, só por regra determinística.

import { resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import { iterCsv, readCsvHeader } from "@/data-pipeline/_tse-common.ts";
import { unirCandidaturas } from "@/data-pipeline/candidatos-parse.ts";
import {
  type CandidaturaResolvivel,
  colisoes,
  resolverCandidato,
} from "@/data-pipeline/candidatos-resolve.ts";

const c = (
  sq: string,
  cargo: number,
  uf: string,
  numero: number,
  situacao: string,
  publicavel = true,
): CandidaturaResolvivel & { sq_candidato: string } => ({
  sq_candidato: sq,
  cargo,
  uf,
  numero,
  publicavel,
  situacao_julgamento: situacao,
});

const SOB_RECURSO = "INDEFERIDO EM PRAZO RECURSAL OU COM RECURSO";
const DEFERIDO_RECURSO = "DEFERIDO EM PRAZO RECURSAL OU COM RECURSO";

/** 6|BA|2727 — MARLI LIMA duas vezes, mesmo nome, ambas sob recurso. */
const BA_2727 = [
  c("50002543999", 6, "BA", 2727, SOB_RECURSO),
  c("50002542551", 6, "BA", 2727, SOB_RECURSO),
];

/** 6|BA|2717 — BRUNO ELIAS duas vezes. */
const BA_2717 = [
  c("50002544001", 6, "BA", 2717, SOB_RECURSO),
  c("50002542554", 6, "BA", 2717, SOB_RECURSO),
];

/**
 * 3|BA|27 — ARIEL CAPISTRANO (DEFERIDO em prazo recursal) × ESTÊVÃO
 * (INDEFERIDO em prazo recursal). O sequencial de ARIEL é o **menor** dos dois,
 * então este caso separa o degrau 2 do degrau 3: quem pular a preferência por
 * DEFERIDO escolhe ESTÊVÃO.
 */
const BA_27 = [
  c("50002535253", 3, "BA", 27, DEFERIDO_RECURSO),
  c("50002536579", 3, "BA", 27, SOB_RECURSO),
];

describe("resolverCandidato — degraus do ADR-0042 item 5", () => {
  // MUTAÇÃO ALVO: devolver o primeiro da lista.
  it("6|BA|2727 devolve exatamente UM, o de maior sqcand", () => {
    const r = resolverCandidato(6, "BA", 2727, BA_2727);
    expect(r?.sq_candidato).toBe("50002543999");
  });

  it("6|BA|2717 idem", () => {
    expect(resolverCandidato(6, "BA", 2717, BA_2717)?.sq_candidato).toBe("50002544001");
  });

  // MUTAÇÃO ALVO: pular o degrau 2 (preferência por DEFERIDO). Sem ele o
  // desempate cairia no maior sqcand e devolveria ESTÊVÃO.
  it("3|BA|27 prefere DEFERIDO sobre INDEFERIDO, mesmo com sqcand MENOR", () => {
    const r = resolverCandidato(3, "BA", 27, BA_27);
    expect(r?.sq_candidato).toBe("50002535253");
    expect(r?.situacao_julgamento).toBe(DEFERIDO_RECURSO);
  });

  it('"INDEFERIDO…" não conta como começando em "DEFERIDO"', () => {
    // A armadilha é de substring: `includes("DEFERIDO")` casaria com os dois.
    expect(SOB_RECURSO.startsWith("DEFERIDO")).toBe(false);
    expect(SOB_RECURSO.includes("DEFERIDO")).toBe(true);
  });

  // MUTAÇÃO ALVO: comparar sqcand como STRING. Os sequenciais têm 11 ou 12
  // dígitos, e lexicograficamente "9…" (11) > "10…" (12) — errado.
  it("compara sqcand como número, não como texto (11 vs 12 dígitos)", () => {
    const mistos = [
      c("99999999999", 6, "SP", 1111, SOB_RECURSO), // 11 dígitos
      c("250002553928", 6, "SP", 1111, SOB_RECURSO), // 12 dígitos, MAIOR
    ];
    expect(resolverCandidato(6, "SP", 1111, mistos)?.sq_candidato).toBe("250002553928");
  });

  // Degrau 1 — ADR-0040.
  it("ignora não-publicável mesmo que seja DEFERIDO e tenha o maior sqcand", () => {
    const lista = [
      c("50002542551", 6, "BA", 2727, SOB_RECURSO, true),
      c("99999999999", 6, "BA", 2727, "DEFERIDO", false),
    ];
    expect(resolverCandidato(6, "BA", 2727, lista)?.sq_candidato).toBe("50002542551");
  });

  it("devolve null quando ninguém publicável casa — nunca um palpite", () => {
    expect(resolverCandidato(6, "BA", 9999, BA_2727)).toBeNull();
    expect(resolverCandidato(6, "SP", 2727, BA_2727)).toBeNull();
    expect(resolverCandidato(3, "BA", 2727, BA_2727)).toBeNull();
    expect(
      resolverCandidato(6, "BA", 2727, [c("50002543999", 6, "BA", 2727, "DEFERIDO", false)]),
    ).toBeNull();
  });

  it("o número sozinho NÃO resolve — a mesma chave em UF diferente é outra pessoa", () => {
    const nacional = [
      c("50002543999", 6, "BA", 2727, "DEFERIDO"),
      c("60002543999", 6, "SP", 2727, "DEFERIDO"),
    ];
    expect(resolverCandidato(6, "BA", 2727, nacional)?.sq_candidato).toBe("50002543999");
    expect(resolverCandidato(6, "SP", 2727, nacional)?.sq_candidato).toBe("60002543999");
  });

  // Constituição § 6 — determinismo. A ordem de leitura do banco não é estável.
  it("devolve o mesmo sqcand em 1.000 permutações da lista", () => {
    const alvo = "50002535253";
    let rng = 42;
    const proximo = () => {
      rng = (rng * 1103515245 + 12345) % 2147483648;
      return rng / 2147483648;
    };
    for (let i = 0; i < 1000; i++) {
      const embaralhada = [...BA_27, ...BA_2727, ...BA_2717];
      for (let j = embaralhada.length - 1; j > 0; j--) {
        const k = Math.floor(proximo() * (j + 1));
        [embaralhada[j], embaralhada[k]] = [embaralhada[k]!, embaralhada[j]!];
      }
      expect(resolverCandidato(3, "BA", 27, embaralhada)?.sq_candidato).toBe(alvo);
    }
  });
});

describe("colisoes — a contagem que o ciclo reporta (RF-143)", () => {
  it("agrupa por (cargo, uf, numero) e só devolve chave repetida", () => {
    const r = colisoes([...BA_27, ...BA_2727, c("70000000001", 1, "BR", 13, "DEFERIDO")], true);
    expect([...r.keys()].sort()).toEqual(["3|BA|27", "6|BA|2727"]);
    expect(r.get("6|BA|2727")).toHaveLength(2);
  });

  it("o filtro de publicabilidade muda a contagem — é o recorte do RF-143", () => {
    const lista = [
      c("50002543999", 6, "BA", 2727, SOB_RECURSO, true),
      c("50002542551", 6, "BA", 2727, SOB_RECURSO, false),
    ];
    expect(colisoes(lista, false).size).toBe(1);
    expect(colisoes(lista, true).size).toBe(0);
  });
});

describe("as colisões reais da fixture do TSE", () => {
  it("as quatro chaves publicáveis da Bahia estão lá, e resolvem para um só", async () => {
    const base = resolvePath(__dirname, "../../../data-pipeline/fixtures");
    const [hA, hB] = await Promise.all([
      readCsvHeader(`${base}/candidatos-sample.csv`),
      readCsvHeader(`${base}/candidatos-complementar-sample.csv`),
    ]);
    const ler = async (p: string) => {
      const out: string[][] = [];
      for await (const f of iterCsv(p)) out.push(f);
      return out;
    };
    const [a, b] = await Promise.all([
      ler(`${base}/candidatos-sample.csv`),
      ler(`${base}/candidatos-complementar-sample.csv`),
    ]);
    const linhas = unirCandidaturas(a, hA, b, hB).linhas;

    const pub = colisoes(linhas, true);
    expect([...pub.keys()].sort()).toEqual(["3|BA|27", "6|BA|2717", "6|BA|2727", "6|BA|2744"]);

    // Cada uma resolve para exatamente um sequencial, e é este.
    expect(resolverCandidato(3, "BA", 27, linhas)?.sq_candidato).toBe("50002535253");
    expect(resolverCandidato(6, "BA", 2717, linhas)?.sq_candidato).toBe("50002544001");
    expect(resolverCandidato(6, "BA", 2727, linhas)?.sq_candidato).toBe("50002543999");
    expect(resolverCandidato(6, "BA", 2744, linhas)?.sq_candidato).toBe("50002554210");

    // 2727 e 2717 têm o MESMO nome nos dois registros — a regra é a única saída.
    const marli = linhas.filter((l) => l.cargo === 6 && l.uf === "BA" && l.numero === 2727);
    expect(marli).toHaveLength(2);
    expect(new Set(marli.map((m) => m.nome_urna)).size).toBe(1);
  });
});
