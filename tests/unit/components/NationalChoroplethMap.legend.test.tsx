// @vitest-environment happy-dom
/**
 * tests/unit/components/NationalChoroplethMap.legend.test.tsx
 *
 * `<NationalChoroplethMap />` — legenda N-way (2026-09-14, pedido do dono:
 * "não faz sentido ficar lula vs flavio na legenda, separe em 3 legendas
 * diferentes para os 3 primeiros colocados").
 *
 * O que estes testes travam:
 *   - três rampas separadas (rank 1, 2, 3), cada uma na cor do SEU candidato
 *     — não mais um duelo rank1×rank2 com o 3º colocado ausente;
 *   - degradação por quantidade: 2 candidatos identificados → 2 rampas, NUNCA
 *     um 3º inventado;
 *   - UMA chave "sem apuração" compartilhada, não uma por rampa;
 *   - `swing`/`turnout` continuam sem legenda (comportamento herdado, não
 *     deve regredir);
 *   - fase pré-eleição continua mostrando `<GeografiaLegend>` (RF-157), nunca
 *     a legenda de candidato — a legenda de partido numa corrida que não
 *     começou é uma afirmação falsa, não só inútil.
 *
 * Estratégia: `renderToStaticMarkup` do wrapper público — o mesmo padrão de
 * `NationalChoroplethMap.test.tsx`. A legenda é montada no WRAPPER (não no
 * impl MapLibre, que só existe no cliente via `next/dynamic`), então aparece
 * inteira no SSR.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NationalChoroplethMap } from "@/components/blocks/NationalChoroplethMap";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

const SAMPLE_ROWS: EdgeUfRow[] = [
  {
    sigla: "SP",
    pct_apurado: 23.4,
    lider: 13,
    margem_atual: 4.0,
    margem_projetada: 4.2,
    margem_projetada_ci: [3.1, 5.3],
    chamada: false,
    swing_vs_2022: 1.1,
    top_candidatos: [
      { id: 13, pct: 52.1 },
      { id: 22, pct: 47.9 },
    ],
    vai_a_2t: null,
    bucket: "indefinido",
  },
];

/** Constrói um `EdgeCandidate` mínimo — mesmo padrão de
 * `NationalChoroplethMap.preEleicao.test.tsx`. */
function candidato(id: number, nome: string, partido: string, rank: number): EdgeCandidate {
  return {
    id,
    nome,
    partido,
    cor: "var(--color-cand-1)",
    votos_atuais: 1,
    votos_projetados: 1,
    pct_atual: 50,
    pct_projetado: 50,
    pct_projetado_lower: 49,
    pct_projetado_upper: 51,
    p_vitoria: 0.5,
    rank,
    p_passa_2t: 0.5,
    p_fecha_1t: 0.5,
  } as EdgeCandidate;
}

const TRES_CANDIDATOS: EdgeCandidate[] = [
  candidato(13, "LUIZ INACIO LULA DA SILVA", "PT", 1),
  candidato(22, "FLAVIO BOLSONARO", "PL", 2),
  candidato(25, "RONALDO CAIADO", "PSD", 3),
];

describe("<NationalChoroplethMap /> — legenda N-way (rank 1..3)", () => {
  it("(a) três candidatos identificados por rank → três rampas, uma por candidato", () => {
    const doc = parse(
      <NationalChoroplethMap
        rows={SAMPLE_ROWS}
        candidatoAId={13}
        view="winner"
        candidatos={TRES_CANDIDATOS}
      />,
    );
    const linhas = Array.from(doc.querySelectorAll('[data-testid="map-legend-candidate"]'));
    expect(linhas).toHaveLength(3);
    // Em ordem de rank — o dono comparou explicitamente "lula vs flavio":
    // rank 1 primeiro, depois 2, depois 3, nunca embaralhado.
    expect(linhas.map((l) => l.getAttribute("data-rank"))).toEqual(["1", "2", "3"]);
  });

  it("(b) cada rampa mostra o nome de EXIBIÇÃO do seu próprio candidato (não um duelo)", () => {
    const doc = parse(
      <NationalChoroplethMap
        rows={SAMPLE_ROWS}
        candidatoAId={13}
        view="winner"
        candidatos={TRES_CANDIDATOS}
      />,
    );
    const linhas = Array.from(doc.querySelectorAll('[data-testid="map-legend-candidate"]'));
    // "FLAVIO" — NOMES_EDITORIAIS por sqcand não bate aqui (sem sqcand na
    // fixture), então o texto visível é o nome cru; o que este teste trava é
    // que CADA linha nomeia UM candidato, não dois.
    expect(linhas[0]?.textContent).toContain("LULA");
    expect(linhas[1]?.textContent).toContain("FLAVIO");
    expect(linhas[2]?.textContent).toContain("CAIADO");
    // Nenhuma linha cita o nome de outro candidato — travando que não é mais
    // um "LULA ... FLAVIO" no mesmo elemento.
    expect(linhas[0]?.textContent).not.toContain("FLAVIO");
    expect(linhas[1]?.textContent).not.toContain("CAIADO");
  });

  it("(c) UMA chave 'sem apuração' compartilhada — não uma por candidato", () => {
    const doc = parse(
      <NationalChoroplethMap
        rows={SAMPLE_ROWS}
        candidatoAId={13}
        view="winner"
        candidatos={TRES_CANDIDATOS}
      />,
    );
    const chaves = doc.querySelectorAll('[data-testid="map-legend-uncounted"]');
    expect(chaves).toHaveLength(1);
  });

  it("(d) role=img único no grupo, com aria-label descrevendo os três candidatos numa frase só", () => {
    const doc = parse(
      <NationalChoroplethMap
        rows={SAMPLE_ROWS}
        candidatoAId={13}
        view="winner"
        candidatos={TRES_CANDIDATOS}
      />,
    );
    const grupo = doc.querySelector('[data-testid="map-legend-group"]');
    expect(grupo?.getAttribute("role")).toBe("img");
    const label = grupo?.getAttribute("aria-label") ?? "";
    expect(label).toContain("LULA");
    expect(label).toContain("FLAVIO");
    expect(label).toContain("CAIADO");
    // Não é role="img" repetido três vezes — um leitor de tela não deve
    // anunciar "imagem" três vezes para uma caixa só.
    expect(doc.querySelectorAll('[data-testid="map-legend-group"] [role="img"]')).toHaveLength(0);
  });

  it("(e) só rank 1 e 2 identificados → duas rampas, NUNCA um 3º inventado", () => {
    const doc = parse(
      <NationalChoroplethMap
        rows={SAMPLE_ROWS}
        candidatoAId={13}
        view="winner"
        candidatos={TRES_CANDIDATOS.slice(0, 2)}
      />,
    );
    const linhas = doc.querySelectorAll('[data-testid="map-legend-candidate"]');
    expect(linhas).toHaveLength(2);
  });

  it("(f) só rank 1 identificado → uma rampa só", () => {
    const umCandidato = [candidato(13, "LUIZ INACIO LULA DA SILVA", "PT", 1)];
    const doc = parse(
      <NationalChoroplethMap
        rows={SAMPLE_ROWS}
        candidatoAId={13}
        view="winner"
        candidatos={umCandidato}
      />,
    );
    const linhas = doc.querySelectorAll('[data-testid="map-legend-candidate"]');
    expect(linhas).toHaveLength(1);
  });

  it("(g) sem candidatos → nenhuma legenda (nem grupo vazio)", () => {
    const doc = parse(<NationalChoroplethMap rows={SAMPLE_ROWS} candidatoAId={13} view="winner" />);
    expect(doc.querySelector('[data-testid="map-legend-group"]')).toBeNull();
  });

  it("(h) view swing — nenhuma legenda de candidato (comportamento herdado)", () => {
    const doc = parse(
      <NationalChoroplethMap
        rows={SAMPLE_ROWS}
        candidatoAId={13}
        view="swing"
        candidatos={TRES_CANDIDATOS}
      />,
    );
    expect(doc.querySelector('[data-testid="map-legend-group"]')).toBeNull();
  });

  it("(i) view turnout — nenhuma legenda de candidato (comportamento herdado)", () => {
    const doc = parse(
      <NationalChoroplethMap
        rows={SAMPLE_ROWS}
        candidatoAId={13}
        view="turnout"
        candidatos={TRES_CANDIDATOS}
      />,
    );
    expect(doc.querySelector('[data-testid="map-legend-group"]')).toBeNull();
  });

  it("(j) RF-157 — fase pré-eleição mostra a legenda de geografia, NUNCA a de candidato", () => {
    const doc = parse(
      <NationalChoroplethMap
        rows={SAMPLE_ROWS}
        candidatoAId={13}
        view="winner"
        candidatos={TRES_CANDIDATOS}
        preEleicao
      />,
    );
    expect(doc.querySelector('[data-testid="map-legend-group"]')).toBeNull();
    expect(doc.querySelector('[data-testid="map-legend-geografia"]')).not.toBeNull();
  });
});
