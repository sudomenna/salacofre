// @vitest-environment happy-dom
/**
 * tests/unit/components/RemainingPanel.test.tsx
 *
 * `<RemainingPanel />` — S07/Bloco 1 (ADR-0025). Cobre RF-026 (quanto falta
 * apurar) e RF-024 (onde isso ainda pode mudar o resultado).
 *
 * A regra que mais importa aqui é `resultadoEmAberto()`: ela decide o que a
 * página chama de "em aberto", e é a única afirmação editorial do bloco. Ela
 * não inventa limiar — lê dois sinais que já existem no payload (`bucket` e o
 * IC95 da margem). Os testes (d)–(g) fixam exatamente isso, inclusive o caso
 * de borda em que o IC **encosta** no zero.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  faltaApurar,
  listarSiglas,
  RemainingPanel,
  resultadoEmAberto,
} from "@/components/blocks/RemainingPanel";
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

function makeRow(overrides: Partial<EdgeUfRow>): EdgeUfRow {
  return {
    sigla: "SP",
    pct_apurado: 40,
    lider: 13,
    margem_atual: 5,
    margem_projetada: 5,
    margem_projetada_ci: [3, 7],
    chamada: false,
    swing_vs_2022: null,
    top_candidatos: [],
    vai_a_2t: null,
    bucket: "chamada",
    ...overrides,
  };
}

const pt = makeCand({ id: 13, nome: "Candidato PT", partido: "PT", rank: 1 });
const pl = makeCand({ id: 22, nome: "Candidato PL", partido: "PL", rank: 2 });
const candidatos = [pt, pl];

describe("faltaApurar()", () => {
  it("(a) complemento de pct_apurado, clampeado em [0, 100]", () => {
    expect(faltaApurar(makeRow({ pct_apurado: 40 }))).toBe(60);
    expect(faltaApurar(makeRow({ pct_apurado: 100 }))).toBe(0);
    expect(faltaApurar(makeRow({ pct_apurado: 120 }))).toBe(0);
    expect(faltaApurar(makeRow({ pct_apurado: Number.NaN }))).toBe(100);
  });
});

describe("resultadoEmAberto()", () => {
  it("(b) bucket 'indefinido' é sempre em aberto", () => {
    expect(
      resultadoEmAberto(makeRow({ bucket: "indefinido", margem_projetada_ci: [10, 20] })),
    ).toBe(true);
  });

  it("(c) IC95 da margem que cruza o zero é em aberto, mesmo com UF chamada", () => {
    expect(resultadoEmAberto(makeRow({ bucket: "chamada", margem_projetada_ci: [-2, 4] }))).toBe(
      true,
    );
  });

  it("(d) IC95 inteiramente positivo (ou negativo) não é em aberto", () => {
    expect(resultadoEmAberto(makeRow({ bucket: "chamada", margem_projetada_ci: [1, 9] }))).toBe(
      false,
    );
    expect(
      resultadoEmAberto(makeRow({ bucket: "decidido_1t", margem_projetada_ci: [-9, -1] })),
    ).toBe(false);
  });

  it("(e) IC que encosta no zero conta como em aberto (borda inclusiva)", () => {
    expect(resultadoEmAberto(makeRow({ bucket: "chamada", margem_projetada_ci: [0, 8] }))).toBe(
      true,
    );
  });

  it("(f) CI ausente ou não-finito degrada para 'não em aberto', sem throw", () => {
    const semCi = { ...makeRow({ bucket: "chamada" }), margem_projetada_ci: undefined };
    expect(resultadoEmAberto(semCi as unknown as EdgeUfRow)).toBe(false);
    expect(
      resultadoEmAberto(
        makeRow({ bucket: "chamada", margem_projetada_ci: [Number.NaN, Number.NaN] }),
      ),
    ).toBe(false);
  });
});

describe("listarSiglas()", () => {
  it("(g) junta em pt-BR: '', 'SP', 'SP e MG', 'SP, MG e RS'", () => {
    expect(listarSiglas([])).toBe("");
    expect(listarSiglas(["SP"])).toBe("SP");
    expect(listarSiglas(["SP", "MG"])).toBe("SP e MG");
    expect(listarSiglas(["SP", "MG", "RS"])).toBe("SP, MG e RS");
  });
});

describe("<RemainingPanel />", () => {
  const rows = [
    makeRow({ sigla: "AM", pct_apurado: 10, bucket: "indefinido", margem_projetada_ci: [-3, 5] }),
    makeRow({ sigla: "SP", pct_apurado: 45, lider: 22, margem_projetada_ci: [4, 9] }),
    makeRow({ sigla: "MG", pct_apurado: 80, bucket: "indefinido", margem_projetada_ci: [-1, 2] }),
    makeRow({ sigla: "BA", pct_apurado: 100, margem_projetada_ci: [12, 18] }),
  ];

  it("(h) ordena por percentual ainda não apurado, desc, e exclui UF concluída", () => {
    const doc = parse(
      <RemainingPanel rows={rows} candidatos={candidatos} pctApuradoTotal={40} ufsApuradas={20} />,
    );
    const siglas = Array.from(doc.querySelectorAll("tbody tr")).map((tr) =>
      tr.getAttribute("data-uf"),
    );
    // AM 90 > SP 55 > MG 20; BA já apurou 100% e não entra.
    expect(siglas).toEqual(["AM", "SP", "MG"]);
  });

  it("(i) marca 'Em aberto' em texto, não só por cor (WCAG 1.4.1)", () => {
    const doc = parse(
      <RemainingPanel rows={rows} candidatos={candidatos} pctApuradoTotal={40} ufsApuradas={20} />,
    );
    const am = doc.querySelector('tr[data-uf="AM"]');
    const sp = doc.querySelector('tr[data-uf="SP"]');
    expect(am?.getAttribute("data-aberto")).toBe("true");
    expect(am?.textContent).toContain("Em aberto");
    expect(sp?.getAttribute("data-aberto")).toBe("false");
    expect(sp?.textContent).toContain("Líder definido na projeção");
  });

  it("(j) a frase de fechamento lista as UFs em aberto com apuração pendente", () => {
    const doc = parse(
      <RemainingPanel rows={rows} candidatos={candidatos} pctApuradoTotal={40} ufsApuradas={20} />,
    );
    expect(doc.querySelector('[data-testid="remaining-aberto"]')?.textContent).toBe(
      "Com apuração pendente e resultado local ainda em aberto: AM e MG.",
    );
  });

  it("(k) sem nenhuma UF em aberto, a frase diz isso — não some", () => {
    const fechadas = [makeRow({ sigla: "SP", pct_apurado: 50, margem_projetada_ci: [5, 9] })];
    const doc = parse(
      <RemainingPanel
        rows={fechadas}
        candidatos={candidatos}
        pctApuradoTotal={50}
        ufsApuradas={27}
      />,
    );
    expect(doc.querySelector('[data-testid="remaining-aberto"]')?.textContent).toContain(
      "Nenhuma unidade federativa combina",
    );
  });

  it("(l) os três Figures trazem o que falta no país, UFs sem boletim e UFs em aberto", () => {
    const doc = parse(
      <RemainingPanel
        rows={rows}
        candidatos={candidatos}
        pctApuradoTotal={23.4}
        ufsApuradas={14}
      />,
    );
    const texto = doc.body.textContent ?? "";
    expect(texto).toContain("76,6%"); // 100 − 23,4
    expect(texto).toContain("13/27"); // 27 − 14
  });

  it("(m) todas as UFs apuradas → tabela declara a conclusão em vez de sumir", () => {
    const doc = parse(
      <RemainingPanel
        rows={[makeRow({ sigla: "SP", pct_apurado: 100 })]}
        candidatos={candidatos}
        pctApuradoTotal={100}
        ufsApuradas={27}
      />,
    );
    expect(doc.body.textContent).toContain(
      "Todas as unidades federativas estão com a apuração concluída.",
    );
  });

  it("(n) a nota declara o limite do payload e o caráter não oficial", () => {
    const doc = parse(
      <RemainingPanel rows={rows} candidatos={candidatos} pctApuradoTotal={40} ufsApuradas={20} />,
    );
    const nota = doc.querySelector('[data-testid="remaining-nota"]')?.textContent ?? "";
    expect(nota).toContain("não publica eleitorado nem total de votos por UF");
    expect(nota).toContain("não oficial");
  });

  it("(o) barra de pendência colorida por partido leva contorno (WCAG 1.4.11)", () => {
    const doc = parse(
      <RemainingPanel rows={rows} candidatos={candidatos} pctApuradoTotal={40} ufsApuradas={20} />,
    );
    const trilhos = Array.from(doc.querySelectorAll<HTMLElement>("tbody td span[aria-hidden]"));
    expect(trilhos.length).toBeGreaterThan(0);
    for (const t of trilhos) {
      expect(t.getAttribute("style")).toContain("var(--text-secondary)");
    }
  });
});
