// @vitest-environment happy-dom
/**
 * tests/unit/components/StrongholdsPanel.test.tsx
 *
 * `<StrongholdsPanel />` — S07/Bloco 1 (ADR-0025). Cobre RF-024 e RF-030.6 na
 * leitura "por candidato" da matriz UF × candidato.
 *
 * O que os testes protegem, em ordem de importância:
 *   1. Nenhum número inventado: um candidato fora do `top_candidatos` de uma
 *      UF simplesmente não aparece ali (b, c). Esse é o limite do payload, e
 *      o bloco tem de respeitá-lo em silêncio, não preencher com zero.
 *   2. O sinal da diferença: `+` para quem lidera a UF, `−` para quem não
 *      lidera (d). Trocar isso inverteria a leitura da tabela inteira.
 *   3. Determinismo do desempate (e) — constituição § 6.
 *   4. Cor por partido com fallback de rank (f) — ADR-0024 sobre ADR-0013.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StrongholdsPanel, strongholdsFor } from "@/components/blocks/StrongholdsPanel";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";

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

function makeRow(sigla: string, top: Array<{ id: number; pct: number }>): EdgeUfRow {
  return {
    sigla,
    pct_apurado: 60,
    lider: top[0]?.id ?? 0,
    margem_atual: 0,
    margem_projetada: (top[0]?.pct ?? 0) - (top[1]?.pct ?? 0),
    margem_projetada_ci: [0, 0],
    chamada: false,
    swing_vs_2022: null,
    top_candidatos: top,
    vai_a_2t: null,
    bucket: "indefinido",
  };
}

const pt = makeCand({ id: 13, nome: "Candidato PT", partido: "PT", rank: 1 });
const pl = makeCand({ id: 22, nome: "Candidato PL", partido: "PL", rank: 2 });
const semPartido = makeCand({ id: 99, nome: "Sem sigla", partido: "", rank: 3 });

const candidatos = [pt, pl, semPartido];
const byId = new Map(candidatos.map((c) => [c.id, c]));

const rows: EdgeUfRow[] = [
  // PT lidera com folga
  makeRow("BA", [
    { id: 13, pct: 62 },
    { id: 22, pct: 28 },
  ]),
  // PT lidera apertado
  makeRow("MG", [
    { id: 13, pct: 46 },
    { id: 22, pct: 44 },
  ]),
  // PL lidera; PT em 2º
  makeRow("SC", [
    { id: 22, pct: 58 },
    { id: 13, pct: 32 },
  ]),
  // Nenhum dos dois no top — PT não pode aparecer nesta linha
  makeRow("RR", [
    { id: 99, pct: 40 },
    { id: 22, pct: 35 },
  ]),
];

describe("strongholdsFor()", () => {
  it("(a) ordena as UFs pelo percentual projetado do candidato, desc", () => {
    const lista = strongholdsFor(13, rows, byId);
    expect(lista.map((l) => l.sigla)).toEqual(["BA", "MG", "SC"]);
  });

  it("(b) UF em que o candidato não está no top_candidatos fica de fora", () => {
    // RR tem só #99 e #22 — o PT não aparece, e o bloco não inventa um pct.
    expect(strongholdsFor(13, rows, byId).map((l) => l.sigla)).not.toContain("RR");
  });

  it("(c) top_candidatos vazio (payload pré-S05) → lista vazia, sem throw", () => {
    expect(strongholdsFor(13, [makeRow("AC", [])], byId)).toEqual([]);
  });

  it("(d) diferença é positiva para quem lidera e negativa para quem não lidera", () => {
    const lista = strongholdsFor(13, rows, byId);
    const ba = lista.find((l) => l.sigla === "BA");
    const sc = lista.find((l) => l.sigla === "SC");

    expect(ba?.posicao).toBe(1);
    expect(ba?.diff).toBeCloseTo(34, 5); // 62 − 28, contra o 2º
    expect(ba?.contraNome).toBe("Candidato PL");

    expect(sc?.posicao).toBe(2);
    expect(sc?.diff).toBeCloseTo(-26, 5); // 32 − 58, contra o 1º
    expect(sc?.contraNome).toBe("Candidato PL");
  });

  it("(e) empate de percentual desempata por sigla — determinismo (constituição § 6)", () => {
    const empate = [
      makeRow("SP", [
        { id: 13, pct: 50 },
        { id: 22, pct: 40 },
      ]),
      makeRow("AL", [
        { id: 13, pct: 50 },
        { id: 22, pct: 30 },
      ]),
    ];
    expect(strongholdsFor(13, empate, byId).map((l) => l.sigla)).toEqual(["AL", "SP"]);
    // E de novo, na ordem inversa de entrada: a saída não muda.
    expect(strongholdsFor(13, [...empate].reverse(), byId).map((l) => l.sigla)).toEqual([
      "AL",
      "SP",
    ]);
  });
});

describe("<StrongholdsPanel />", () => {
  it("(f) cor vem do partido (ADR-0024); sem sigla mapeada cai no rank (ADR-0013)", () => {
    const doc = parse(<StrongholdsPanel candidatos={candidatos} rows={rows} />);
    const tags = Array.from(doc.querySelectorAll<HTMLElement>('[data-testid="party-tag"]'));
    const styleOf = (sigla: string) =>
      tags.find((t) => t.getAttribute("data-sigla") === sigla)?.getAttribute("style") ?? "";

    expect(styleOf("PT")).toContain("var(--party-pt)");
    expect(styleOf("PL")).toContain("var(--party-pl)");
    // `partido: ""` não tem token — usa o rank 3 do fallback, não `--party-outros`.
    expect(styleOf("")).toContain("var(--color-cand-3)");
  });

  it("(g) uma <table> por candidato, com <caption> e cabeçalhos de coluna (RNF-023)", () => {
    const doc = parse(<StrongholdsPanel candidatos={candidatos} rows={rows} />);
    const tabelas = doc.querySelectorAll('[data-testid="stronghold-column"]');
    expect(tabelas).toHaveLength(3);

    const primeira = tabelas[0];
    expect(primeira?.querySelector("caption")?.textContent).toContain("Candidato PT");
    expect(
      Array.from(primeira?.querySelectorAll("thead th") ?? []).map((th) => th.textContent),
    ).toEqual(["UF", "Posição", "Diferença", "Projetado"]);
  });

  it("(h) candidato sem nenhuma UF publicada mostra a ausência, não uma tabela vazia (ADR-0017)", () => {
    const doc = parse(<StrongholdsPanel candidatos={candidatos} rows={[makeRow("AC", [])]} />);
    expect(doc.body.textContent).toContain("Nenhuma UF publicou percentual para este candidato");
  });

  it("(i) a nota declara o limite de três candidatos por UF e o caráter não oficial", () => {
    const doc = parse(<StrongholdsPanel candidatos={candidatos} rows={rows} />);
    const nota = doc.querySelector('[data-testid="strongholds-nota"]')?.textContent ?? "";
    expect(nota).toContain("no máximo três candidatos por UF");
    expect(nota).toContain("não oficial");
  });

  it("(j) toda barra colorida por partido leva contorno (WCAG 1.4.11 / constituição § 4)", () => {
    const doc = parse(<StrongholdsPanel candidatos={candidatos} rows={rows} />);
    const trilhos = Array.from(doc.querySelectorAll<HTMLElement>("tbody td span[aria-hidden]"));
    expect(trilhos.length).toBeGreaterThan(0);
    for (const t of trilhos) {
      expect(t.getAttribute("style")).toContain("var(--text-secondary)");
    }
  });
});
