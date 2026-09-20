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
    // 🔴 Deliberadamente a paleta por COLOCAÇÃO, e deliberadamente um valor
    // que NENHUMA saída legítima pode ter: é assim que (f) prova que a função
    // ignora este campo em vez de copiá-lo. Ver o teste.
    cor: "var(--color-cand-4)",
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
  // ⚠️ O campo `cor` da ENTRADA é de propósito a paleta por COLOCAÇÃO
  // (`--color-cand-N`): é o que o produtor gravava, e é o que a função tem de
  // IGNORAR. Ver (f).
  cand({ id: 13, nome: "FERNANDA DA SILVA", partido: "PT", cor: "var(--color-cand-1)" }),
  cand({ id: 22, nome: "JOÃO DE SOUZA", partido: "PL", cor: "var(--color-cand-2)" }),
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

  it("(d) candidato sem match na lista degrada para 'Candidato {id}', partido undefined, cor de fallback — nunca quebra [mutação: trocar `colorForParty(c?.partido)` por `c?.cor` devolveria a paleta por COLOCAÇÃO do payload, que o ADR-0024 aposentou]", () => {
    const rows = votosPorCandidatoMunicipio(
      municipio({ votos_reportados: { 999: 100 } }),
      CANDIDATOS,
    );
    expect(rows).toEqual([
      {
        id: 999,
        nome: "Candidato 999",
        partido: undefined,
        cor: "var(--party-outros)",
        votos: 100,
        pct: 100,
      },
    ]);
  });

  // 🔴 2026-09-20 — o caso que fecha a fuga por `lib/`.
  //
  // Até hoje esta função fazia `cor: c?.cor ?? "var(--color-cand-other)"`,
  // copiando literalmente o campo `cor` do payload — a paleta por COLOCAÇÃO
  // que o ADR-0024 aposentou em 07/09 e que
  // `tests/unit/components/cor-nunca-do-payload.test.ts` bane de `components/`
  // e `app/` desde 19/09. A varredura não olhava `lib/`, então este era o
  // caminho pelo qual o campo banido voltava à tela: dois componentes
  // (`<MunicipioExplorer>` e o balão de `<ChoroplethMapUF>`) consomem daqui.
  //
  // O fixture acima entrega `--color-cand-1` / `--color-cand-2` de propósito.
  // Se alguém reverter para `c?.cor`, a saída passa a conter esses tokens e
  // este teste morre.
  it("(f) a cor sai da SIGLA e IGNORA o campo `cor` do payload", () => {
    const rows = votosPorCandidatoMunicipio(
      municipio({ votos_reportados: { 13: 60, 22: 40 } }),
      CANDIDATOS,
    );
    expect(rows.map((r) => r.cor)).toEqual(["var(--party-pt)", "var(--party-pl)"]);
    expect(rows.every((r) => !r.cor.includes("--color-cand-"))).toBe(true);
  });

  // Federação: o caso medido em 20/09 que a paleta resolve em `outros` — e que
  // antes caía no campo do payload, isto é, na colocação.
  //
  // 🔴 "XYZ" (não PTB) é a sigla-exemplo de "fora da paleta": o PTB GANHOU
  // token próprio (`--party-ptb`) em 2026-09-20 (ver
  // `docs/design-system/tokens.md` — o PTB aparecia nas fixtures e caía neste
  // MESMO cinza, que é justamente o defeito que motivou dar cor a ele; usar
  // PTB aqui como exemplo passou a testar o caso errado). "XYZ" é o
  // placeholder já usado em `tests/unit/utils/party-color.test.ts` para sigla
  // desconhecida.
  it("(f2) federação e sigla fora da paleta caem em `outros`, não na colocação", () => {
    const federados: EdgeUfCandidate[] = [
      cand({ id: 40, nome: "ALGUEM", partido: "PSDB/CIDADANIA", cor: "var(--color-cand-3)" }),
      cand({ id: 50, nome: "OUTREM", partido: "XYZ", cor: "var(--color-cand-4)" }),
    ];
    const rows = votosPorCandidatoMunicipio(
      municipio({ votos_reportados: { 40: 10, 50: 5 } }),
      federados,
    );
    expect(rows.map((r) => r.cor)).toEqual(["var(--party-outros)", "var(--party-outros)"]);
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
