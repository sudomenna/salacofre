/**
 * tests/unit/lib/municipio-votos.test.ts
 *
 * `votosPorCandidatoMunicipio` (`lib/utils/municipio-votos.ts`) é a ÚNICA
 * conta do percentual por candidato num município — extraída em 2026-09-18
 * (correção de rota do orquestrador) de `MunicipioExplorer.folhaRows` para
 * que o balão do hover (`ChoroplethMapUF`) e a folha do clique
 * (`MunicipioExplorer`) nunca divirjam no mesmo número para o mesmo
 * município.
 *
 * O que este arquivo trava:
 *   (a) o denominador é `Σ votos_reportados` (a base "votáveis" do produto,
 *       ver a docstring da função) — não `eleitores` nem qualquer derivado
 *       de comparecimento;
 *   (b) `votos_reportados` vazio devolve `[]`, nunca uma linha fabricada;
 *   (c) ordena por votos desc, tie-break por `id` asc;
 *   (d) identidade resolvida contra a lista de candidatos PASSADA (a da UF),
 *       nunca inventada — candidato sem match cai no fallback `Candidato {id}`
 *       com `partido`/`cor` também degradados, sem quebrar.
 */

import { describe, expect, it } from "vitest";

import type { EdgeUfCandidate, EdgeUfMunicipio } from "@/lib/edge-config/types";
import { votosPorCandidatoMunicipio } from "@/lib/utils/municipio-votos";

function cand(over: Partial<EdgeUfCandidate>): EdgeUfCandidate {
  return {
    id: 0,
    nome: "",
    partido: "",
    cor: "var(--color-cand-other)",
    votos_atuais: 0,
    votos_projetados: 0,
    pct_atual: 0,
    pct_projetado: 0,
    ci95: { lower: 0, upper: 0 },
    ...over,
  };
}

function municipio(over: Partial<EdgeUfMunicipio>): EdgeUfMunicipio {
  return {
    cod_ibge: "3550308",
    nome: "São Paulo",
    pct_apurado: 40,
    lider: { candidato_id: 13, partido: "PT", votos: 100, margem_pp: 10 },
    votos_reportados: {},
    ...over,
  };
}

const CANDIDATOS: EdgeUfCandidate[] = [
  cand({ id: 13, nome: "FERNANDA DA SILVA", partido: "PT", cor: "var(--party-pt)" }),
  cand({ id: 22, nome: "JOÃO DE SOUZA", partido: "PL", cor: "var(--party-pl)" }),
];

describe("votosPorCandidatoMunicipio", () => {
  it("(a) percentual é Σ votos_reportados, a mesma base 'votáveis' do resto do produto [mutação: trocar o denominador por `municipio.eleitores` faria 60% virar outro número]", () => {
    const rows = votosPorCandidatoMunicipio(
      municipio({ votos_reportados: { 13: 1200, 22: 800 } }),
      CANDIDATOS,
    );
    // 1200 de 2000 = 60%; 800 de 2000 = 40%.
    expect(rows.find((r) => r.id === 13)?.pct).toBeCloseTo(60, 5);
    expect(rows.find((r) => r.id === 22)?.pct).toBeCloseTo(40, 5);
  });

  it("(b) votos_reportados vazio devolve [] — nunca uma linha fabricada [mutação: devolver um array com 1 item hardcoded quando `entradas` está vazio faria este teste apanhar]", () => {
    expect(votosPorCandidatoMunicipio(municipio({ votos_reportados: {} }), CANDIDATOS)).toEqual([]);
  });

  it("(c) ordena por votos desc, tie-break por id asc [mutação: inverter o sinal do comparador de votos (`a.votos - b.votos`) faria a ordem sair invertida]", () => {
    const rows = votosPorCandidatoMunicipio(
      municipio({ votos_reportados: { 22: 500, 13: 500, 99: 900 } }),
      [...CANDIDATOS, cand({ id: 99, nome: "OUTRO", partido: "MDB" })],
    );
    expect(rows.map((r) => r.id)).toEqual([99, 13, 22]);
  });

  it("(d) candidato sem match na lista degrada para 'Candidato {id}', partido undefined, cor de fallback — nunca quebra [mutação: remover o `?? \"var(--color-cand-other)\"` faria a cor sair `undefined` em vez do token de fallback]", () => {
    const rows = votosPorCandidatoMunicipio(
      municipio({ votos_reportados: { 999: 100 } }),
      CANDIDATOS,
    );
    expect(rows).toEqual([
      {
        id: 999,
        nome: "Candidato 999",
        partido: undefined,
        cor: "var(--color-cand-other)",
        votos: 100,
        pct: 100,
      },
    ]);
  });

  it("(e) identidade vem da lista DE CANDIDATOS PASSADA, não de um índice fixo — o mesmo id resolve para pessoas diferentes conforme a lista [mutação: trocar `porId.get(id)` por uma busca hardcoded em CANDIDATOS_A faria este teste ver o nome errado quando chamado com CANDIDATOS_B]", () => {
    const outraUf: EdgeUfCandidate[] = [cand({ id: 13, nome: "OUTRA PESSOA", partido: "PSOL" })];
    const rowsSp = votosPorCandidatoMunicipio(
      municipio({ votos_reportados: { 13: 100 } }),
      CANDIDATOS,
    );
    const rowsOutraUf = votosPorCandidatoMunicipio(
      municipio({ votos_reportados: { 13: 100 } }),
      outraUf,
    );
    expect(rowsSp[0]?.nome).toBe("FERNANDA DA SILVA");
    expect(rowsOutraUf[0]?.nome).toBe("OUTRA PESSOA");
  });
});
