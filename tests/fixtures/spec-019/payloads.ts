/**
 * tests/fixtures/spec-019/payloads.ts
 *
 * Payloads da spec 019 (fase pré-eleição), montados **a partir do texto dos
 * RFs**, não a partir do que a implementação faz.
 *
 * Três formas, e as três existem porque a spec nomeia as três:
 *
 *   - {@link payloadPreEleicao} — `fase: "pre_eleicao"`. É o que o semeador
 *     grava (RF-164): `por_uf: []`, `insights: []`, todo campo de medição em
 *     zero, e identidade real em `national.candidatos`.
 *   - {@link payloadNormalZerado} — **sem** `fase`, `pct_apurado_total: 0`,
 *     `por_uf: []`. É o que `emptyPayload()` produz hoje, e o RF-153 exige que
 *     ele caia em **modo normal**. É o par que discrimina no M2.
 *   - {@link payloadNormalPrimeiroBoletim} — **sem** `fase`,
 *     `pct_apurado_total: 0.01`. As 20h01 de 04/10 (RF-153, M1).
 *
 * ⚠️ Nenhuma destas funções olha a fase para decidir o que monta. Elas montam
 * **dados**; quem decide é `lib/config/fase.ts`, e é isso que está sob teste.
 */

import type { EdgeCandidate, EdgeNational, EdgePayload, EdgeUfRow } from "@/lib/edge-config/types";

/** Doze candidaturas presidenciais, na ordem em que o payload real chega. */
export const NOMES_PRESIDENCIAIS: ReadonlyArray<[number, string, string]> = [
  [13, "CANDIDATA TREZE", "PT"],
  [22, "CANDIDATO VINTE E DOIS", "PL"],
  [12, "CANDIDATA DOZE", "PDT"],
  [15, "CANDIDATO QUINZE", "MDB"],
  [30, "CANDIDATA TRINTA", "NOVO"],
  [45, "CANDIDATO QUARENTA E CINCO", "PSDB"],
  [50, "CANDIDATA CINQUENTA", "PSOL"],
  [11, "CANDIDATO ONZE", "PP"],
  [77, "CANDIDATA SETENTA E SETE", "SOLIDARIEDADE"],
  [16, "CANDIDATO DEZESSEIS", "PSTU"],
  [21, "CANDIDATA VINTE E UM", "PCB"],
  [80, "CANDIDATO OITENTA", "UP"],
];

export function candidatoZerado(id: number, nome: string, partido: string): EdgeCandidate {
  return {
    id,
    nome,
    partido,
    cor: "var(--color-cand-other)",
    votos_atuais: 0,
    votos_projetados: 0,
    pct_atual: 0,
    pct_projetado: 0,
    pct_projetado_lower: 0,
    pct_projetado_upper: 0,
    p_vitoria: 0,
    rank: 0,
    p_passa_2t: 0,
    p_fecha_1t: 0,
    sqcand: `9000000${id}`,
  };
}

/**
 * As mesmas doze candidaturas, com distribuição de projeção REAL — sete acima
 * do limiar de 0,5% do `<RaceTypeIndicator>` e cinco abaixo.
 *
 * Existe para o par em modo normal que o RF-156 exige: o teste roda os dois
 * modos **sobre o mesmo array** e exige números diferentes.
 */
export function candidatosComProjecao(): EdgeCandidate[] {
  const pcts = [41.2, 33.7, 8.4, 5.1, 4.3, 2.6, 1.9, 0.4, 0.3, 0.2, 0.1, 0.05];
  return NOMES_PRESIDENCIAIS.map(([id, nome, partido], i) => ({
    ...candidatoZerado(id, nome, partido),
    pct_atual: pcts[i] ?? 0,
    pct_projetado: pcts[i] ?? 0,
    pct_projetado_lower: Math.max(0, (pcts[i] ?? 0) - 1),
    pct_projetado_upper: (pcts[i] ?? 0) + 1,
    rank: i + 1,
    p_vitoria: i === 0 ? 0.71 : 0.01,
    p_fecha_1t: i === 0 ? 0.34 : 0.0,
    p_passa_2t: i < 2 ? 0.9 : 0.01,
    votos_atuais: Math.round((pcts[i] ?? 0) * 100_000),
    votos_projetados: Math.round((pcts[i] ?? 0) * 1_000_000),
    cor: `var(--color-cand-${Math.min(i + 1, 6)})`,
  }));
}

export function candidatosZerados(): EdgeCandidate[] {
  return NOMES_PRESIDENCIAIS.map(([id, nome, partido]) => candidatoZerado(id, nome, partido));
}

export const SIGLAS_27 = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
] as const;

/**
 * Uma linha de UF **com apuração de verdade** — usada no par de modo normal e,
 * no teste do mapa, para que a cor de identidade seja distinguível da cor
 * neutra em todas as seis combinações de vista.
 */
export function ufRowApurada(sigla: string, i: number): EdgeUfRow {
  const lider = i % 2 === 0 ? 13 : 22;
  return {
    sigla,
    pct_apurado: 40 + (i % 30),
    lider,
    margem_atual: 6.5,
    margem_projetada: 7.2,
    margem_projetada_ci: [5.1, 9.3],
    chamada: false,
    swing_vs_2022: i % 2 === 0 ? 4.5 : -4.5,
    top_candidatos: [
      { id: lider, pct: 53.6 },
      { id: lider === 13 ? 22 : 13, pct: 46.4 },
    ],
    vai_a_2t: null,
    bucket: "indefinido",
  };
}

export function porUfApurado(): EdgeUfRow[] {
  return SIGLAS_27.map((s, i) => ufRowApurada(s, i));
}

function nationalDe(candidatos: EdgeCandidate[], zerado: boolean): EdgeNational {
  return {
    candidatos,
    needle_position: zerado ? 0 : 62,
    needle_band: zerado ? "tossup" : "lean_a",
    candidato_a_id: zerado ? null : 13,
    candidato_b_id: zerado ? null : 22,
    p_segundo_turno_overall: zerado ? null : 0.41,
    cenarios_2t: [],
    chamadas_recentes: [],
  };
}

export interface PayloadOpcoes {
  cargo?: EdgePayload["cargo"];
  candidatos?: EdgeCandidate[];
}

/**
 * O payload SEMEADO (RF-164). `fase` presente, `por_uf` vazio.
 *
 * `pct_apurado_total: 0` aqui **não** é o gatilho de nada — quem decide é o
 * campo `fase`, e {@link payloadPreEleicaoComPercentual} prova isso pelo outro
 * lado.
 */
export function payloadPreEleicao(opcoes: PayloadOpcoes = {}): EdgePayload {
  const candidatos = opcoes.candidatos ?? candidatosZerados();
  return {
    ts: "2026-09-20T12:00:00.000Z",
    cargo: opcoes.cargo ?? 1,
    turno: 1,
    pct_apurado_total: 0,
    ufs_apuradas: 0,
    national: nationalDe(candidatos, true),
    por_uf: [],
    insights: [],
    composition: { pre_election: 1, model: 0, actual_results: 0 },
    fase: "pre_eleicao",
  };
}

/**
 * RF-153, 3º critério: `fase` presente **com** percentual alto ⇒ modo pré.
 *
 * "A incoerência é responsabilidade do emissor; o leitor não tenta adivinhar
 * qual dos dois campos está certo, porque um leitor que adivinha é um leitor
 * que às vezes adivinha errado."
 */
export function payloadPreEleicaoComPercentual(opcoes: PayloadOpcoes = {}): EdgePayload {
  const base = payloadPreEleicao(opcoes);
  return {
    ...base,
    pct_apurado_total: 37.4,
    ufs_apuradas: 19,
    por_uf: porUfApurado(),
    national: nationalDe(opcoes.candidatos ?? candidatosComProjecao(), false),
  };
}

/**
 * 🔴 **M2** — o payload que `emptyPayload()` produz hoje: sem `fase`,
 * `pct_apurado_total: 0`, `por_uf: []`, `composition.pre_election: 1`.
 *
 * O RF-153 exige **modo normal**. É este caso, e não o de `0.01`, que mata a
 * mutação `isPreEleicao(p) → p.pct_apurado_total === 0`.
 */
export function payloadNormalZerado(opcoes: PayloadOpcoes = {}): EdgePayload {
  const candidatos = opcoes.candidatos ?? candidatosZerados();
  return {
    ts: "2026-10-04T22:59:00.000Z",
    cargo: opcoes.cargo ?? 1,
    turno: 1,
    pct_apurado_total: 0,
    ufs_apuradas: 0,
    national: nationalDe(candidatos, true),
    por_uf: [],
    insights: [],
    composition: { pre_election: 1, model: 0, actual_results: 0 },
  };
}

/**
 * 🔴 **M1** — 20h01 de 04/10: `pct_apurado_total: 0.01`, sem `fase`.
 *
 * ⚠️ Sozinho este payload **não discrimina** a mutação que o RF-153 nomeia
 * (`0.01 === 0` é `false`, então mutante e original concordam). Quem carrega o
 * peso é {@link payloadNormalZerado}. Os dois existem porque a spec pede os
 * dois; ver o comentário no teste.
 */
export function payloadNormalPrimeiroBoletim(opcoes: PayloadOpcoes = {}): EdgePayload {
  const candidatos = opcoes.candidatos ?? candidatosComProjecao();
  return {
    ts: "2026-10-04T23:01:00.000Z",
    cargo: opcoes.cargo ?? 1,
    turno: 1,
    pct_apurado_total: 0.01,
    ufs_apuradas: 1,
    national: nationalDe(candidatos, false),
    por_uf: porUfApurado(),
    insights: ["Primeiro boletim recebido."],
    composition: { pre_election: 0, model: 1, actual_results: 0 },
  };
}

/** Payload de noite de apuração em andamento — o par "modo normal" dos testes. */
export function payloadNormalApurando(opcoes: PayloadOpcoes = {}): EdgePayload {
  const base = payloadNormalPrimeiroBoletim(opcoes);
  return {
    ...base,
    pct_apurado_total: 37.4,
    ufs_apuradas: 19,
    insights: ["19 de 27 estados já publicaram boletim."],
  };
}
