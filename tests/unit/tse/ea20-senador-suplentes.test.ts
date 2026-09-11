/**
 * tests/unit/tse/ea20-senador-suplentes.test.ts — RF-101 (spec 016).
 *
 * Senador é o único cargo em que `vs[]` carrega DOIS elementos: os dois
 * suplentes da chapa (`tp: "s1"` e `"s2"`). Nos cargos majoritários que já
 * cobrimos, `vs[]` tem um vice e ninguém nunca precisou dele.
 *
 * O risco que este arquivo cobre é silencioso por natureza. O modelo não lê
 * `vs[]`; nenhuma tela lê `vs[]` hoje. Um "enxugamento" do payload para
 * poupar bytes no `jsonb` — ou um schema que parasse de declarar o campo e o
 * deixasse cair no `.strip()` do Zod — passaria em toda a suíte e só
 * apareceria no dia em que a tela precisasse dizer quem assume a cadeira.
 * A constituição § 6 é literal: todo valor exibível tem que ser reproduzível
 * do snapshot, e é o snapshot que guarda essa informação.
 *
 * O que é medido: o objeto que `EA20Schema.parse` devolve — que é
 * exatamente o que `lib/tse/ingest-handler.ts` grava em `snapshots.payload`
 * (`payload: result.data`) — preserva os dois suplentes, com todos os campos,
 * e sobrevive à serialização JSON que o `jsonb` faz.
 */

import { describe, expect, it } from "vitest";

import { EA20Schema } from "@/lib/tse/ea20-schema";

/** Envelope EA20 de Senador em abrangência UF (ADR-0026 item 1: 27 por ciclo). */
function envelopeSenadorSP() {
  return {
    ele: "999999",
    t: "1",
    f: "o",
    tpabr: "uf",
    cdabr: "SP",
    dg: "04/10/2026",
    hg: "19:05:00",
    carg: [
      {
        cd: "5",
        nmn: "Senador",
        agr: [
          {
            n: "13",
            nm: "PARTIDO DOS TRABALHADORES",
            tp: "i",
            par: [
              {
                n: "13",
                sg: "PT",
                nm: "PARTIDO DOS TRABALHADORES",
                cand: [
                  {
                    n: "133",
                    sqcand: "250001234567",
                    nm: "ANA LIMA",
                    nmu: "ANA LIMA",
                    e: "n",
                    vap: "4.120.331",
                    pvap: "40,12",
                    vs: [
                      {
                        tp: "s1",
                        sqcand: "250001234568",
                        nm: "PRIMEIRO SUPLENTE",
                        nmu: "1º SUPLENTE",
                        sgp: "PT",
                      },
                      {
                        tp: "s2",
                        sqcand: "250001234569",
                        nm: "SEGUNDO SUPLENTE",
                        nmu: "2º SUPLENTE",
                        sgp: "PT",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    s: {
      ts: "70000",
      st: "42000",
      pst: "60,00",
      si: "69000",
      psi: "98,57",
      sa: "42000",
      psa: "60,00",
    },
    e: { te: "34.000.000", esi: "33.500.000", c: "27.000.000", a: "7.000.000" },
    v: {
      tv: "27.000.000",
      vvc: "10.270.000",
      vv: "10.270.000",
      vnom: "10.270.000",
      vb: "400.000",
      tvn: "900.000",
      vn: "900.000",
      vnt: "0",
    },
  };
}

function candidatoDoParse(payload: unknown) {
  const parsed = EA20Schema.parse(payload);
  const cand = parsed.carg?.[0]?.agr?.[0]?.par?.[0]?.cand?.[0];
  if (!cand) throw new Error("fixture sem candidato — o teste não mede nada");
  return cand;
}

describe("EA20 cargo 5 — RF-101: suplentes sobrevivem ao snapshot", () => {
  it("(a) o parser preserva os DOIS suplentes, na ordem", () => {
    const cand = candidatoDoParse(envelopeSenadorSP());

    expect(cand.vs).toHaveLength(2);
    expect(cand.vs?.map((v) => v.tp)).toEqual(["s1", "s2"]);
  });

  it("(b) cada suplente chega inteiro — nome, nome de urna, sequencial e sigla", () => {
    const cand = candidatoDoParse(envelopeSenadorSP());
    const [s1, s2] = cand.vs ?? [];

    expect(s1).toMatchObject({
      sqcand: "250001234568",
      nm: "PRIMEIRO SUPLENTE",
      nmu: "1º SUPLENTE",
      sgp: "PT",
    });
    expect(s2?.nm).toBe("SEGUNDO SUPLENTE");
  });

  it("(c) sobrevive ao round-trip JSON — é assim que o jsonb guarda", () => {
    // `snapshots.payload` é `jsonb` (lib/db/schema.ts) e recebe o resultado
    // do parse (`ingest-handler.ts`, `payload: result.data`). Se o Zod
    // devolvesse uma classe ou um Proxy, o que chegaria ao banco seria outra
    // coisa — este caso mede o objeto DEPOIS da serialização.
    const parsed = EA20Schema.parse(envelopeSenadorSP());
    const gravado = JSON.parse(JSON.stringify(parsed));
    const cand = gravado.carg[0].agr[0].par[0].cand[0];

    expect(cand.vs).toHaveLength(2);
    expect(cand.vs[1].nmu).toBe("2º SUPLENTE");
  });

  it("(d) campo extra num suplente não é descartado (passthrough do TSE)", () => {
    // O TSE acrescenta campos sem aviso — o schema é `.passthrough()` em todos
    // os níveis justamente por isso, e um campo novo em `vs[]` precisa chegar
    // ao snapshot junto com o resto.
    const payload = envelopeSenadorSP();
    const suplente = payload.carg[0]?.agr[0]?.par[0]?.cand[0]?.vs[0] as Record<string, unknown>;
    suplente.xx = "novo";

    const cand = candidatoDoParse(payload);
    expect((cand.vs?.[0] as Record<string, unknown>).xx).toBe("novo");
  });

  it("(e) candidatura sem `vs` continua válida — o campo é opcional", () => {
    // Contraprova: exigir suplente quebraria os cargos 1 e 3 e o próprio
    // cargo 5 antes de o TSE popular o campo.
    const payload = envelopeSenadorSP();
    const candidato = payload.carg[0]?.agr[0]?.par[0]?.cand[0] as Record<string, unknown>;
    delete candidato.vs;

    expect(() => EA20Schema.parse(payload)).not.toThrow();
  });
});
