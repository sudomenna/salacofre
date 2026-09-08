// @vitest-environment happy-dom
/**
 * tests/unit/components/BulletinPanel.test.tsx
 *
 * `<BulletinPanel />` — S07/Bloco 1 (ADR-0025). Cobre RF-026 (estado da
 * apuração + timestamp) e RF-044 (texto por template) na home nacional.
 *
 * O contrato real deste bloco é o **texto**, não o markup: por isso a maior
 * parte dos casos exercita `buildBulletin()` direto. Os testes de markup
 * cobrem só o que o leitor de tela precisa (lista ordenada, `<time>`).
 *
 * Dois testes existem por causa da constituição, não por causa de bug:
 *   - (g) determinismo (§ 6 / ADR-0005): a mesma entrada tem de produzir a
 *     mesma saída, senão o texto não é template.
 *   - (h) neutralidade (§ 2): nenhum adjetivo de mérito nas frases. A lista
 *     de termos proibidos é o que um editor escreveria sem pensar.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BulletinPanel, buildBulletin } from "@/components/blocks/BulletinPanel";
import type { EdgeCandidate, EdgeNational, EdgeUfRow } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function makeCand(overrides: Partial<EdgeCandidate>): EdgeCandidate {
  return {
    id: 1,
    nome: "Cand 1",
    partido: "PT",
    cor: "var(--color-cand-1)",
    votos_atuais: 0,
    votos_projetados: 0,
    pct_atual: 0,
    pct_projetado: 0,
    pct_projetado_lower: 0,
    pct_projetado_upper: 0,
    p_vitoria: 0,
    rank: 1,
    p_passa_2t: 0,
    p_fecha_1t: 0,
    ...overrides,
  };
}

function makeRow(overrides: Partial<EdgeUfRow>): EdgeUfRow {
  return {
    sigla: "SP",
    pct_apurado: 50,
    lider: 1,
    margem_atual: 5,
    margem_projetada: 5,
    margem_projetada_ci: [3, 7],
    chamada: false,
    swing_vs_2022: null,
    top_candidatos: [],
    vai_a_2t: null,
    bucket: "indefinido",
    ...overrides,
  };
}

const lider = makeCand({
  id: 13,
  nome: "Candidato PT",
  partido: "PT",
  rank: 1,
  pct_projetado: 43.2,
  pct_projetado_lower: 41.8,
  pct_projetado_upper: 44.6,
});
const segundo = makeCand({
  id: 22,
  nome: "Candidato PL",
  partido: "PL",
  rank: 2,
  pct_projetado: 38,
});

function makeNational(overrides: Partial<EdgeNational> = {}): EdgeNational {
  return {
    candidatos: [lider, segundo],
    needle_position: 0.2,
    needle_band: "lean_a",
    candidato_a_id: 13,
    candidato_b_id: 22,
    p_segundo_turno_overall: 0.65,
    cenarios_2t: [],
    ...overrides,
  };
}

const TS = "2026-10-04T20:47:11-03:00";

const base = {
  national: makeNational(),
  rows: [makeRow({ sigla: "SP", chamada: true }), makeRow({ sigla: "MG" })],
  pctApuradoTotal: 23.4,
  ufsApuradas: 14,
  ts: TS,
  turno: 1 as const,
};

describe("buildBulletin()", () => {
  it("(a) linha de apuração traz % apurado e UFs com boletim", () => {
    const [apuracao] = buildBulletin(base);
    expect(apuracao?.id).toBe("apuracao");
    expect(apuracao?.text).toBe(
      "23,4% das seções apuradas, com boletim em 14 de 27 unidades federativas.",
    );
  });

  it("(b) linha de projeção traz nome, partido, % projetado e o IC95", () => {
    const item = buildBulletin(base).find((i) => i.id === "lideranca");
    expect(item?.text).toBe(
      "Candidato PT (PT) aparece com 43,2% dos votos a votáveis na projeção, no intervalo de 95% [41,8; 44,6].",
    );
  });

  it("(c) linha de diferença usa a distância entre 1º e 2º em pp", () => {
    const item = buildBulletin(base).find((i) => i.id === "diferenca");
    // 43,2 − 38,0 = 5,2 pp
    expect(item?.text).toBe(
      "A diferença projetada entre Candidato PT e Candidato PL (PL) é de +5,2 pp.",
    );
  });

  it("(d) P(2T) ausente vira 'ainda não foi publicada', nunca 0%", () => {
    const items = buildBulletin({
      ...base,
      national: makeNational({ p_segundo_turno_overall: null }),
    });
    const item = items.find((i) => i.id === "segundo-turno");
    expect(item?.text).toContain("ainda não foi publicada");
    expect(item?.text).not.toContain("0%");
  });

  it("(e) em 2º turno a linha de P(2T) some (métrica vazia de semântica)", () => {
    const items = buildBulletin({ ...base, turno: 2 });
    expect(items.find((i) => i.id === "segundo-turno")).toBeUndefined();
  });

  it("(f) chamadas do orchestrator entram literalmente, do mais antigo ao mais novo", () => {
    const items = buildBulletin({
      ...base,
      national: makeNational({
        chamadas_recentes: [
          { ts: "2026-10-04T20:40:00-03:00", texto: "RS chamada para Candidato PL." },
          { ts: "2026-10-04T20:20:00-03:00", texto: "BA chamada para Candidato PT." },
        ],
      }),
    });
    const chamadas = items.filter((i) => i.id.startsWith("chamada-"));
    expect(chamadas.map((c) => c.text)).toEqual([
      "BA chamada para Candidato PT.",
      "RS chamada para Candidato PL.",
    ]);
  });

  it("(g) determinístico — mesma entrada, mesma saída (constituição § 6)", () => {
    expect(buildBulletin(base)).toEqual(buildBulletin(base));
  });

  it("(h) nenhuma frase carrega juízo de valor (constituição § 2)", () => {
    const proibidos = [
      "esmagadora",
      "consolida",
      "dispara",
      "atropela",
      "expressiva",
      "vantagem confortável",
      "surpreendente",
      "decepciona",
      "histórica",
    ];
    const texto = buildBulletin(base)
      .map((i) => i.text)
      .join(" ")
      .toLowerCase();
    for (const termo of proibidos) {
      expect(texto).not.toContain(termo);
    }
  });

  it("(i) zero UFs chamadas → frase no singular correto, não '0 unidades'", () => {
    const nenhuma = buildBulletin({ ...base, rows: [makeRow({ chamada: false })] });
    expect(nenhuma.find((i) => i.id === "chamadas")?.text).toContain("Nenhuma unidade federativa");

    const uma = buildBulletin({ ...base, rows: [makeRow({ chamada: true })] });
    expect(uma.find((i) => i.id === "chamadas")?.text).toBe(
      "1 unidade federativa já foi chamada para o líder local.",
    );
  });
});

describe("<BulletinPanel />", () => {
  it("(j) renderiza uma <ol> com um <li> por item e <time dateTime>", () => {
    const doc = parse(<BulletinPanel {...base} />);
    const itens = doc.querySelectorAll('[data-testid="bulletin-list"] > li');
    expect(itens).toHaveLength(buildBulletin(base).length);
    expect(doc.querySelector("time")?.getAttribute("datetime")).toBe(TS);
    expect(doc.querySelector("time")?.textContent).toBe("20:47:11");
  });

  it("(k) o Panel nomeia a seção pelo próprio título (aria-labelledby)", () => {
    const doc = parse(<BulletinPanel {...base} />);
    const section = doc.querySelector('[data-testid="panel"]');
    expect(section?.getAttribute("aria-labelledby")).toBe("bulletin-panel-heading");
    expect(doc.querySelector("#bulletin-panel-heading")?.textContent).toBe(
      "O que está acontecendo agora",
    );
  });

  it("(l) declara origem do texto e o caráter não oficial (constituição § 1, ADR-0005)", () => {
    const doc = parse(<BulletinPanel {...base} />);
    const nota = doc.querySelector('[data-testid="bulletin-nota"]')?.textContent ?? "";
    expect(nota).toContain("sem texto gerado por IA");
    expect(nota).toContain("não oficial");
  });
});
