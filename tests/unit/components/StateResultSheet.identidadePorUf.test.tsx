// @vitest-environment happy-dom
/**
 * tests/unit/components/StateResultSheet.identidadePorUf.test.tsx
 *
 * 2026-09-18 (2ª rodada, achado do `constitution-guard`) — `StateResultSheet`
 * é o SEGUNDO consumidor do mesmo defeito que `buildHoverRows`
 * (`_NationalChoroplethMapImpl.tsx`) já tinha corrigido: tanto a linha
 * "Líder" quanto cada linha do ranking liam nome/partido de `candidatosById`
 * (`national.candidatos`) como fonte PRIMÁRIA, em vez de
 * `EdgeUfRow.top_candidatos` (que sabe de que UF é — RF-144).
 *
 * Em cargo 3 (Governador) e 5 (Senador), `api/model/project.py` grava um
 * PLACEHOLDER (`"Candidato {id}"`) em `national.candidatos[].nome` (RF-145) —
 * então a ficha diria "Líder: Candidato 13" mesmo com o nome real disponível
 * em `top_candidatos[].nome`.
 *
 * 🔴 **Por que não basta reaproveitar a fixture de simulação.**
 * `tests/fixtures/simulacao/governador.json` preenche `national.candidatos[].nome`
 * com um nome de verdade em TODO cargo (180/180 medido) — não é assim que o
 * modelo real se comporta (RF-145). Verificação visual contra `pnpm dev:sim`
 * não prova nada aqui: a tela parece perfeita porque a fixture mascara
 * exatamente o defeito que este teste existe para pegar. Por isso o payload
 * abaixo é construído à mão, com o placeholder EXATO que
 * `api/model/project.py` escreve em produção — mesma estratégia de
 * `NationalChoroplethMap.hoverIdentidadePorUf.test.tsx`.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StateResultSheet } from "@/components/blocks/StateResultSheet";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

/** O EXATO placeholder que `api/model/project.py` escreve fora do cargo 1
 * (`"nome": ident_nat.get("nome") or f"Candidato {r['candidato_id']}"`). */
const PLACEHOLDER_LIDER = "Candidato 13";
const PLACEHOLDER_SEGUNDO = "Candidato 22";
const NOME_REAL_LIDER = "FERNANDA DA SILVA";
const NOME_REAL_SEGUNDO = "MARCOS DE OLIVEIRA";

const CANDIDATOS_NACIONAIS: EdgeCandidate[] = [
  {
    id: 13,
    // 🔴 O ponto central do teste: o bloco nacional NÃO tem o nome real.
    nome: PLACEHOLDER_LIDER,
    partido: "PT",
    cor: "var(--color-cand-1)",
    votos_atuais: 1,
    votos_projetados: 1,
    pct_atual: 55,
    pct_projetado: 55,
    pct_projetado_lower: 53,
    pct_projetado_upper: 57,
    p_vitoria: 0.8,
    rank: 1,
    p_passa_2t: 0.9,
    p_fecha_1t: 0,
  },
  {
    id: 22,
    nome: PLACEHOLDER_SEGUNDO,
    partido: "PL",
    cor: "var(--color-cand-2)",
    votos_atuais: 1,
    votos_projetados: 1,
    pct_atual: 45,
    pct_projetado: 45,
    pct_projetado_lower: 43,
    pct_projetado_upper: 47,
    p_vitoria: 0.2,
    rank: 2,
    p_passa_2t: 0.1,
    p_fecha_1t: 0,
  },
];

const ROW_SP: EdgeUfRow = {
  sigla: "SP",
  pct_apurado: 40,
  lider: 13,
  margem_atual: 10,
  margem_projetada: 10,
  margem_projetada_ci: [8, 12],
  chamada: false,
  swing_vs_2022: null,
  top_candidatos: [
    // `top_candidatos` sabe de que UF é — nomes reais aqui (RF-144).
    { id: 13, pct: 55, nome: NOME_REAL_LIDER, partido: "PT", sqcand: "250002553928" },
    { id: 22, pct: 45, nome: NOME_REAL_SEGUNDO, partido: "PL", sqcand: "250002553929" },
  ],
  vai_a_2t: null,
  bucket: "indefinido",
};

describe("<StateResultSheet /> — identidade vem da própria UF (RF-144/RF-145, 2ª rodada)", () => {
  it("Líder mostra o nome REAL de `top_candidatos`, não o placeholder de `national.candidatos`", () => {
    const doc = parse(
      <StateResultSheet
        open
        onClose={() => {}}
        row={ROW_SP}
        candidatos={CANDIDATOS_NACIONAIS}
        cargo="gov"
      />,
    );
    const lider = doc.querySelector("[data-testid='state-sheet-lider']");
    expect(lider?.textContent).toContain(NOME_REAL_LIDER);
    expect(lider?.textContent).not.toContain(PLACEHOLDER_LIDER);
    expect(lider?.textContent).toContain("PT");
  });

  it("o ranking mostra os nomes REAIS de `top_candidatos`, não os placeholders de `national.candidatos`", () => {
    const doc = parse(
      <StateResultSheet
        open
        onClose={() => {}}
        row={ROW_SP}
        candidatos={CANDIDATOS_NACIONAIS}
        cargo="gov"
      />,
    );
    const lista = doc.querySelector("[data-testid='state-sheet-candidatos']");
    expect(lista?.textContent).toContain(NOME_REAL_LIDER);
    expect(lista?.textContent).toContain(NOME_REAL_SEGUNDO);
    expect(lista?.textContent).not.toContain(PLACEHOLDER_LIDER);
    expect(lista?.textContent).not.toContain(PLACEHOLDER_SEGUNDO);
  });

  it('cargo="sen" (2026-09-18, 3ª rodada) — RF-105: SEM linha "Líder" isolada, e o ranking mostra o nome REAL de ambos os ocupantes de vaga', () => {
    // RF-105: em Senado (2 vagas) não há hierarquia entre 1º e 2º, então a
    // linha "Líder:" (tratamento especial só para o 1º colocado) deixa de
    // existir — a identidade dos dois primeiros aparece só no ranking, com o
    // MESMO tratamento (ver o teste de `result-vaga-marker` mais abaixo).
    // Mutação: remover o guard `!multiVaga` de `state-sheet-lider` faz este
    // teste falhar.
    const doc = parse(
      <StateResultSheet
        open
        onClose={() => {}}
        row={ROW_SP}
        candidatos={CANDIDATOS_NACIONAIS}
        cargo="sen"
      />,
    );
    expect(doc.querySelector("[data-testid='state-sheet-lider']")).toBeNull();
    const lista = doc.querySelector("[data-testid='state-sheet-candidatos']");
    expect(lista?.textContent).toContain(NOME_REAL_LIDER);
    expect(lista?.textContent).toContain(NOME_REAL_SEGUNDO);
    expect(lista?.textContent).not.toContain(PLACEHOLDER_LIDER);
  });

  it('cargo="sen" (2026-09-18) — o CTA leva a /uf/[sigla]/senador, não à rota de presidente ou governador', () => {
    // Mutação: trocar `ufHref(cargo, row.sigla)` de volta por um template
    // fixo (ou por `cargo === "gov" ? ... : "/uf/..."` sem o ramo "sen") faz
    // este teste falhar — o leitor que abriu a ficha pelo mapa de SENADOR
    // iria parar na página de outra corrida.
    const doc = parse(
      <StateResultSheet open onClose={() => {}} row={ROW_SP} candidatos={[]} cargo="sen" />,
    );
    const cta = doc.querySelector("[data-testid='state-sheet-cta']");
    expect(cta?.getAttribute("href")).toBe("/uf/SP/senador");
  });

  it("sem `nome` em `top_candidatos` (payload pré-ADR-0042), cai no fallback de `national.candidatos`", () => {
    // Garante que o fallback continua existindo — só não pode ser a PRIMEIRA
    // fonte. `tests/fixtures/edge-config/gov-current.json` está exatamente
    // nesta forma hoje (medido: 81/81 `top_candidatos` sem `nome`/`partido`).
    const rowSemNome: EdgeUfRow = {
      ...ROW_SP,
      top_candidatos: [
        { id: 13, pct: 55 },
        { id: 22, pct: 45 },
      ],
    };
    const doc = parse(
      <StateResultSheet
        open
        onClose={() => {}}
        row={rowSemNome}
        candidatos={CANDIDATOS_NACIONAIS}
        cargo="gov"
      />,
    );
    const lider = doc.querySelector("[data-testid='state-sheet-lider']");
    // Degradação honesta, não regressão: o único nome disponível é o
    // placeholder do fallback.
    expect(lider?.textContent).toContain(PLACEHOLDER_LIDER);
  });
});

/**
 * 2026-09-18 (3ª rodada) — RF-104: o NÚMERO exibido na `<Figure>` de margem,
 * não só o rótulo.
 *
 * `api/model/project.py:5078-5079` grava `margem_projetada = top − 2º top` em
 * TODO cargo. Em Senador são **2 vagas por UF**, e
 * `docs/specs/016-senador/spec.md:125-133` diz que "a margem que interessa é
 * a do **2º para o 3º**, não a do 1º para o 2º" — é ali que se decide a
 * última vaga. Até a rodada anterior a ficha só tinha RENOMEADO o número
 * errado ("Margem 1º→2º" sobre `row.margem_projetada`) — esta rodada troca o
 * NÚMERO para `margemSegundaVaga` (`components/layout/UfPicker.tsx`).
 */
describe("<StateResultSheet /> — margem exibida por cargo (RF-104, spec 016 § 2 vagas)", () => {
  function labelDaMargem(cargo: "pres" | "gov" | "sen", row: EdgeUfRow = ROW_SP): string {
    const doc = parse(
      <StateResultSheet
        open
        onClose={() => {}}
        row={row}
        candidatos={CANDIDATOS_NACIONAIS}
        cargo={cargo}
      />,
    );
    const grupo = doc.querySelector("[aria-label^='Resumo da apuração']");
    return grupo?.textContent ?? "";
  }

  it('cargo="sen" — o rótulo é "Margem para a 2ª vaga", não "Margem projetada" sem qualificação', () => {
    expect(labelDaMargem("sen")).toContain("Margem para a 2ª vaga");
  });

  it('cargo="pres" e "gov" — rótulo herdado, sem qualificação (lá o número É a margem da disputa)', () => {
    expect(labelDaMargem("pres")).toContain("Margem projetada");
    expect(labelDaMargem("pres")).not.toContain("Margem para a 2ª vaga");
    expect(labelDaMargem("gov")).toContain("Margem projetada");
    expect(labelDaMargem("gov")).not.toContain("Margem para a 2ª vaga");
  });

  // Números literais do RF-104: "Given 1º com 40%, 2º com 30% e 3º com 29%,
  // when a tela renderiza, then a margem exibida é 1 pp, não 10 pp."
  const ROW_ACEITACAO: EdgeUfRow = {
    ...ROW_SP,
    margem_atual: 10,
    margem_projetada: 10, // 1º(40) − 2º(30) = 10 — o número ERRADO para Senado.
    top_candidatos: [
      { id: 13, pct: 40, nome: NOME_REAL_LIDER, partido: "PT", sqcand: "250002553928" },
      { id: 22, pct: 30, nome: NOME_REAL_SEGUNDO, partido: "PL", sqcand: "250002553929" },
      { id: 99, pct: 29, nome: "TERCEIRO COLOCADO", partido: "PSOL", sqcand: "250002553930" },
    ],
  };

  it('RF-104 (aceitação literal) — cargo="sen" com 40/30/29 mostra "+1,0 pp", não "+10,0 pp"', () => {
    // Mutação: trocar `margemParaExibir(cargo, row)` de volta por
    // `row.margem_projetada` faz este teste falhar mostrando "+10,0 pp".
    expect(labelDaMargem("sen", ROW_ACEITACAO)).toContain("+1,0 pp");
    expect(labelDaMargem("sen", ROW_ACEITACAO)).not.toContain("+10,0 pp");
  });

  it('RF-104 (controle) — o MESMO payload em cargo="pres" continua mostrando "+10,0 pp" (1º−2º, sem mudança)', () => {
    expect(labelDaMargem("pres", ROW_ACEITACAO)).toContain("+10,0 pp");
  });

  it('RF-104 (degradação honesta) — menos de 3 candidatos no top-3, cargo="sen" mostra "—", nunca "+0,0 pp"', () => {
    // Decisão do dono, 14/09: "não sabemos" e "medimos zero" são estados
    // diferentes. Mutação: `margemSegundaVaga` devolvendo `0` em vez de `NaN`
    // faz este teste falhar mostrando "+0,0 pp".
    const rowSoDois: EdgeUfRow = { ...ROW_SP, top_candidatos: ROW_SP.top_candidatos.slice(0, 2) };
    const texto = labelDaMargem("sen", rowSoDois);
    expect(texto).toContain("—");
    expect(texto).not.toContain("0,0 pp");
  });
});
