// @vitest-environment happy-dom
/**
 * tests/unit/components/CandidateResultRow.test.tsx
 *
 * Linha de candidato com parcial e projeção lado a lado (ADR-0029 § 7).
 *
 * O invariante central: **os dois números ficam no DOM, sempre**. O controle
 * "Parcial / Projeção" do shell muda ênfase, não presença — é o que concilia
 * o formato do kit com a regra do ADR-0017 (nada de collapsible). Um teste
 * que só checasse "aparece o número certo" passaria numa implementação que
 * escondesse o outro, que é justamente a regressão a evitar.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CandidateResultRow,
  candidateResultRowProps,
} from "@/components/atoms/tables/CandidateResultRow";
import type { EdgeCandidate } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

const BASE = {
  rank: 3,
  nome: "Candidato MDB",
  partido: "MDB",
  cor: "var(--color-cand-3)",
  pctAtual: 8.4,
  pctProjetado: 9.1,
  votos: 1_234_567,
};

describe("<CandidateResultRow />", () => {
  it("(a) mostra as duas bases, rotuladas, na mesma linha", () => {
    const doc = parse(<CandidateResultRow {...BASE} />);
    const texto = doc.body.textContent ?? "";

    expect(texto).toContain("8,4%");
    expect(texto).toContain("9,1%");
    expect(texto).toContain("parcial");
    expect(texto).toContain("proj.");
    expect(texto).toContain("Candidato MDB");
    expect(texto).toContain("MDB");
  });

  it("(b) as duas colunas carregam `data-view-cell` — ênfase por CSS, nunca remoção", () => {
    const doc = parse(<CandidateResultRow {...BASE} />);
    const celulas = [...doc.querySelectorAll("[data-view-cell]")];

    expect(celulas.map((c) => c.getAttribute("data-view-cell"))).toEqual(["parcial", "proj"]);
    // Nenhuma das duas nasce escondida: o estado inicial da página tem os dois
    // números visíveis, e é a cascata do shell que decide o realce.
    for (const cell of celulas) {
      expect(cell.getAttribute("hidden")).toBeNull();
      expect(cell.getAttribute("style") ?? "").not.toMatch(/display\s*:\s*none/);
    }
  });

  it("(c) a barra tem um preenchimento por base + o traço da projeção", () => {
    const doc = parse(<CandidateResultRow {...BASE} />);
    const fills = [...doc.querySelectorAll("[data-view-only]")];

    expect(fills.map((f) => f.getAttribute("data-view-only"))).toEqual(["parcial", "proj"]);
    expect(fills[0]?.getAttribute("style")).toContain("width:8.4%");
    expect(fills[1]?.getAttribute("style")).toContain("width:9.1%");
    // O traço da projeção fica visível nas duas bases — é a distância entre
    // "onde está" e "onde o modelo diz que termina" (constituição § 8).
    expect(renderToStaticMarkup(<CandidateResultRow {...BASE} />)).toContain(
      "var(--accent-strong)",
    );
  });

  it("(d) delta ▲/▼ só a partir de 0,1pp — abaixo disso os dois números são iguais na tela", () => {
    expect(parse(<CandidateResultRow {...BASE} />).body.textContent).toContain("proj. ▲");

    const caindo = parse(<CandidateResultRow {...BASE} pctAtual={9.1} pctProjetado={8.4} />);
    expect(caindo.body.textContent).toContain("proj. ▼");

    const parado = parse(<CandidateResultRow {...BASE} pctAtual={9.1} pctProjetado={9.14} />);
    expect(parado.body.textContent).not.toContain("▲");
    expect(parado.body.textContent).not.toContain("▼");
  });

  it("(e) a cor do candidato pinta a barra, nunca o texto (contraste — RNF-022)", () => {
    const html = renderToStaticMarkup(<CandidateResultRow {...BASE} />);
    expect(html).toContain("background:var(--color-cand-3)");
    expect(html).not.toMatch(/color\s*:\s*var\(--color-cand-/);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("(f) `compact` esconde os votos e reduz a densidade — sem tirar percentual algum", () => {
    const doc = parse(<CandidateResultRow {...BASE} compact />);
    const texto = doc.body.textContent ?? "";

    expect(texto).not.toContain("votos");
    expect(texto).toContain("8,4%");
    expect(texto).toContain("9,1%");
  });

  it("(g) valores fora de 0–100 ou não-finitos não vazam para a largura da barra", () => {
    const doc = parse(
      <CandidateResultRow {...BASE} pctAtual={Number.NaN} pctProjetado={140} votos={null} />,
    );
    const fills = [...doc.querySelectorAll("[data-view-only]")];
    expect(fills[0]?.getAttribute("style")).toContain("width:0%");
    expect(fills[1]?.getAttribute("style")).toContain("width:100%");
  });

  it("(h) `candidateResultRowProps` mapeia o payload e cai para o rank de fallback", () => {
    const cand = {
      id: 9,
      nome: "Candidato PDT",
      partido: "PDT",
      cor: "var(--color-cand-4)",
      votos_atuais: 500,
      pct_atual: 2.2,
      pct_projetado: 2.5,
    } as unknown as EdgeCandidate;

    expect(candidateResultRowProps(cand, 7)).toMatchObject({
      rank: 7,
      nome: "Candidato PDT",
      partido: "PDT",
      pctAtual: 2.2,
      pctProjetado: 2.5,
      votos: 500,
      compact: false,
    });

    expect(candidateResultRowProps({ ...cand, rank: 4 }, 7, true)).toMatchObject({
      rank: 4,
      compact: true,
    });
  });

  // ---------------------------------------------------------------------------
  // 2026-09-09 — `variant="kit"` entrou para a lista do `<ResultPanel>`.
  // O que estes dois testes protegem é o DEFAULT: quatro telas fora do escopo
  // daquela mudança (Camadas 2 e 3 do ADR-0017 e as duas rotas de UF) usam
  // esta linha, e um default trocado por descuido as mudaria em silêncio.
  // ---------------------------------------------------------------------------

  it("(i) o default `variant='densa'` não mudou: texto puro, votos abreviados, 13px", () => {
    const doc = parse(<CandidateResultRow {...BASE} />);

    expect(doc.querySelector('[data-testid="party-tag"]')).toBeNull();
    expect(doc.body.textContent).toContain("1,2 mi votos");
    const numero = doc.querySelector("[data-view-cell='parcial']")?.firstElementChild;
    expect(numero?.getAttribute("style")).not.toContain("font-size");
    expect(numero?.getAttribute("style")).toContain("var(--type-figure-sm)");
  });

  it("(j) `variant='kit'` traz PartyTag, votos por extenso e 18px — mas só fora de `compact`", () => {
    const doc = parse(<CandidateResultRow {...BASE} variant="kit" />);

    expect(doc.querySelector('[data-testid="party-tag"][data-sigla="MDB"]')).not.toBeNull();
    expect(doc.body.textContent).toContain("1.234.567 votos");
    expect(
      doc.querySelector("[data-view-cell='parcial']")?.firstElementChild?.getAttribute("style"),
    ).toContain("font-size:18px");

    // Compacta volta ao algarismo pequeno, como no kit (`CandidateRow.jsx:20`).
    const compacta = parse(<CandidateResultRow {...BASE} compact variant="kit" />);
    expect(
      compacta
        .querySelector("[data-view-cell='parcial']")
        ?.firstElementChild?.getAttribute("style"),
    ).not.toContain("font-size:18px");
  });
});

describe("altura da barra — dobrada em 2026-09-19", () => {
  /**
   * O dono pediu "exatamente o dobro do que são hoje", e "hoje" eram 4px.
   *
   * 🔴 Este bloco existe porque a suíte era CEGA ao número: aplicando a
   * mutação (voltar `BARRA_ALTURA_PX` para 4), os 15 casos existentes
   * continuavam verdes. Altura de barra é exatamente o tipo de valor que
   * ninguém percebe regredir — some 4px por linha e a tela só fica "um pouco
   * diferente".
   */
  function barra(doc: Document): HTMLElement | null {
    // A barra é o único bloco com `grid-column:2 / -1` e fundo afundado.
    return (
      [...doc.querySelectorAll("div")].find((d) => {
        const s = d.getAttribute("style") ?? "";
        return s.includes("grid-column:2 / -1") && s.includes("--surface-sunken");
      }) ?? null
    );
  }

  /** Lê `prop: <n>px` do atributo `style`, sem regex — escape em heredoc mente. */
  function px(el: Element | null, prop: string): number | null {
    for (const decl of (el?.getAttribute("style") ?? "").split(";")) {
      const [chave, valor] = decl.split(":");
      if (chave?.trim() !== prop) continue;
      const n = Number.parseFloat((valor ?? "").trim());
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  it("🔴 a barra tem 8px — o dobro dos 4px que tinha", () => {
    // Mutação que morre: qualquer valor que não seja 8. O número é literal de
    // propósito: importar `BARRA_ALTURA_PX` e comparar com ele mesmo seria a
    // tautologia que este repositório já registrou como "teste que não
    // discrimina" — passaria com 4, com 8 e com 40.
    expect(px(barra(parse(<CandidateResultRow {...BASE} />)), "height")).toBe(8);
  });

  it("o traço da projeção NÃO dobrou junto — segue sobrando 2px de cada lado", () => {
    // Decisão registrada no componente: o traço precisa ser visível acima e
    // abaixo do preenchimento, e 2px cumprem isso numa barra de 4 ou de 8.
    // Dobrá-lo faria dele um segundo elemento competindo com a barra.
    //
    // Mutação que morre: escalar a sobra junto com a altura (-4/-4).
    const doc = parse(<CandidateResultRow {...BASE} />);
    const marcador = [...doc.querySelectorAll("div")].find((d) =>
      (d.getAttribute("style") ?? "").includes("--accent-strong"),
    );
    expect(px(marcador ?? null, "top")).toBe(-2);
    expect(px(marcador ?? null, "bottom")).toBe(-2);
  });
});
