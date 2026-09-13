/**
 * tests/unit/edge-config/identidade-colisao.test.ts — spec 018 / ADR-0042.
 *
 * A colisão vista do lado do CONTRATO, não do renderizador: dois `EdgeUfRow`
 * de cargo 3 (Governador), SP e BA, ambos com o candidato de número **13**.
 *
 * Em cargo majoritário o número na urna É o número do partido — 13 é PT em
 * qualquer estado —, então todo candidato a governador do PT do país concorre
 * sob o 13. Um índice construído sobre `national.candidatos` por `id` sozinho
 * (que é como as duas telas resolviam nome até a spec 018) devolve **a mesma
 * pessoa** para os dois estados.
 *
 * O teste mostra as duas resoluções lado a lado: a velha colapsa, a nova não.
 * `tests/unit/components/GovernorCard.test.tsx` e
 * `tests/unit/pages/senador.test.tsx` cobrem o mesmo do lado da tela.
 */

import { describe, expect, it } from "vitest";

import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";

function mkUf(sigla: string, top: EdgeUfRow["top_candidatos"]): EdgeUfRow {
  return {
    sigla,
    pct_apurado: 80,
    lider: 13,
    margem_atual: 10,
    margem_projetada: 10,
    margem_projetada_ci: [5, 15],
    chamada: false,
    swing_vs_2022: null,
    top_candidatos: top,
    vai_a_2t: false,
    bucket: "decidido_1t",
  };
}

/**
 * O bloco nacional de cargo 3, tal como o orchestrator o emite: a **união de
 * 27 corridas** sob o mesmo espaço de `id`, com o placeholder no nome
 * (RF-145). Um `id` aqui não é uma pessoa — é "o número 13 nalguma UF".
 */
const nacionalCargo3: EdgeCandidate[] = [
  {
    id: 13,
    nome: "Candidato 13",
    partido: "PT",
    cor: "var(--color-cand-1)",
    votos_atuais: 0,
    votos_projetados: 0,
    pct_atual: 0,
    pct_projetado: 50,
    pct_projetado_lower: 48,
    pct_projetado_upper: 52,
    p_vitoria: 0.5,
    rank: 1,
    p_passa_2t: 0,
    p_fecha_1t: 0,
  },
];

const sp = mkUf("SP", [
  { id: 13, pct: 55, nome: "Fernando de SP", partido: "PT", sqcand: "250002553928" },
]);
const ba = mkUf("BA", [
  { id: 13, pct: 45, nome: "Jaqueline da BA", partido: "PT", sqcand: "50002553927" },
]);

/** Como a tela resolve DEPOIS da spec 018: da própria linha da UF. */
function resolveNovo(uf: EdgeUfRow): string[] {
  return (uf.top_candidatos ?? []).map((t) => t.nome ?? `Cand ${t.id}`);
}

/** Como resolvia ANTES: índice sobre `national.candidatos` por `id`. */
function resolveAntigo(uf: EdgeUfRow, nacional: EdgeCandidate[]): string[] {
  const porId = new Map(nacional.map((c) => [c.id, c] as const));
  return (uf.top_candidatos ?? []).map((t) => porId.get(t.id)?.nome ?? `Cand ${t.id}`);
}

describe("identidade de candidatura sob colisão de número (ADR-0042)", () => {
  it("SP e BA, ambos com o número 13, exibem nomes DIFERENTES", () => {
    const nomesSp = resolveNovo(sp);
    const nomesBa = resolveNovo(ba);

    expect(nomesSp).toEqual(["Fernando de SP"]);
    expect(nomesBa).toEqual(["Jaqueline da BA"]);
    expect(nomesSp[0]).not.toBe(nomesBa[0]);
  });

  it("o índice nacional por `id` — a resolução antiga — colapsa os dois no mesmo nome", () => {
    // Documenta o defeito que a migração corrige. Se esta asserção um dia
    // falhar porque `national.candidatos` passou a distinguir por UF, a
    // premissa do ADR-0042 mudou e a decisão precisa ser reaberta.
    expect(resolveAntigo(sp, nacionalCargo3)).toEqual(resolveAntigo(ba, nacionalCargo3));
  });

  it("`sqcand` também acompanha o par, não o número — é o que endereça a foto", () => {
    expect(sp.top_candidatos[0]?.sqcand).toBe("250002553928");
    expect(ba.top_candidatos[0]?.sqcand).toBe("50002553927");
    expect(sp.top_candidatos[0]?.sqcand).not.toBe(ba.top_candidatos[0]?.sqcand);
  });

  it("`sqcand` é string e sobrevive às DUAS larguras (11 e 12 dígitos)", () => {
    const onze = ba.top_candidatos[0]?.sqcand;
    const doze = sp.top_candidatos[0]?.sqcand;

    expect(typeof onze).toBe("string");
    expect(onze).toHaveLength(11);
    expect(typeof doze).toBe("string");
    expect(doze).toHaveLength(12);

    // A razão de ser string e de qualquer ordenação usar BigInt: em texto a
    // largura menor vence, e o desempate do ADR-0042 escolheria errado.
    expect(String(onze) > String(doze)).toBe(true);
    expect(BigInt(onze as string) < BigInt(doze as string)).toBe(true);
  });

  it("payload PRÉ-018 (sem os campos novos) degrada para o placeholder, nunca para erro", () => {
    const antigo = mkUf("SP", [{ id: 13, pct: 55 }]);

    expect(resolveNovo(antigo)).toEqual(["Cand 13"]);
  });
});
