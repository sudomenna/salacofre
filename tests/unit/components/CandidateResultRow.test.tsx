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
    // 🔴 Por testid, e não por farejar `style`. A busca anterior exigia
    // `grid-column:2 / -1` **e** `--surface-sunken` no MESMO elemento, o que
    // amarrava o teste a barra ser uma caixa só — exatamente a forma que o
    // conserto de 2026-09-20 teve de desfazer (posicionamento fora, recorte
    // dentro). Um seletor que quebra quando a estrutura é corrigida mede a
    // estrutura, não o número que ele diz medir.
    return doc.querySelector<HTMLElement>('[data-testid="result-bar"]');
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
    // Mutação que morre: escalar a sobra junto com a altura (-4/-4), ou zerá-la.
    //
    // ⚠️ Este caso mede a INTENÇÃO declarada, e sozinho ele não prova nada
    // sobre a tela: passou verde entre 08/09 e 20/09 com a sobra recortada e
    // invisível. Quem prova que ela chega ao vidro é o bloco logo abaixo.
    const doc = parse(<CandidateResultRow {...BASE} />);
    const marcador = doc.querySelector('[data-testid="result-bar-marker"]');
    expect(marcador?.getAttribute("style")).toContain("--accent-strong");
    expect(px(marcador, "top")).toBe(-2);
    expect(px(marcador, "bottom")).toBe(-2);
  });
});

/**
 * 🔴 2026-09-20 — a sobra do traço era recortada, e a suíte não sabia.
 *
 * Defeito medido no Chrome: o contêiner da barra tinha `overflow: hidden` desde
 * o nascimento do arquivo (`1ac871b`, 08/09) e o traço morava dentro dele. A
 * caixa de layout do traço media os 12px previstos, mas `elementFromPoint` 1px
 * acima da barra devolvia o contêiner da LINHA — `overflow: hidden` recorta
 * pintura e hit-testing. Nas 6 de 7 candidaturas em que a projeção recua, o
 * traço inteiro caía dentro do preenchimento, entre 1,16:1 e 1,70:1 contra o
 * piso de 3:1 do SC 1.4.11.
 *
 * ⚠️ **Nenhum teste aqui mede pixel pintado, e nenhum poderia**:
 * `getBoundingClientRect()` devolve zero no happy-dom, armadilha já registrada
 * neste repositório. O que estes casos travam é a ESTRUTURA que torna o
 * recorte impossível — a única coisa verificável sem navegador, e a que falha
 * no instante em que alguém devolver o traço para dentro da caixa recortada.
 */
describe("o traço da projeção não pode ser recortado", () => {
  /** Ancestrais do elemento dentro do fragmento renderizado, do pai para cima. */
  function ancestrais(el: Element | null): Element[] {
    const cadeia: Element[] = [];
    for (let p = el?.parentElement ?? null; p && p.tagName !== "BODY"; p = p.parentElement) {
      cadeia.push(p);
    }
    return cadeia;
  }

  /**
   * Recorta? Olha `style` inline E `class`: neste arquivo o recorte é inline,
   * mas `truncate`/`overflow-hidden` do Tailwind produzem o mesmo efeito e um
   * teste cego a eles aceitaria a regressão vinda pelo outro caminho.
   */
  function recorta(el: Element): boolean {
    const style = (el.getAttribute("style") ?? "").replace(/\s+/g, "");
    const classe = el.getAttribute("class") ?? "";
    return (
      /overflow(-x|-y)?:(hidden|clip|auto|scroll)/.test(style) ||
      /(^|\s)(truncate|overflow-(x-|y-)?(hidden|clip|auto|scroll))(\s|$)/.test(classe)
    );
  }

  it("🔴 nenhum ancestral do traço recorta — a sobra chega ao vidro", () => {
    // Mutação que morre: mover o traço de volta para dentro de
    // `[data-testid="result-bar-clip"]`, que é onde ele ficou de 08/09 a 20/09.
    const doc = parse(<CandidateResultRow {...BASE} />);
    const marcador = doc.querySelector('[data-testid="result-bar-marker"]');
    expect(marcador).not.toBeNull();

    const culpados = ancestrais(marcador)
      .filter(recorta)
      .map((el) => el.getAttribute("data-testid") ?? el.getAttribute("style") ?? el.tagName);

    expect(culpados).toEqual([]);
  });

  it("🔴 o traço é IRMÃO do recorte, não descendente dele", () => {
    // O caso acima já pegaria a regressão, mas só pelo efeito. Este nomeia a
    // estrutura: se um dia o recorte sair do `clip` e for parar em outro lugar,
    // a resposta certa continua sendo manter o traço fora dele.
    const doc = parse(<CandidateResultRow {...BASE} />);
    const clip = doc.querySelector('[data-testid="result-bar-clip"]');
    const marcador = doc.querySelector('[data-testid="result-bar-marker"]');

    expect(clip?.contains(marcador ?? null)).toBe(false);
    expect(marcador?.parentElement?.getAttribute("data-testid")).toBe("result-bar");
  });

  it("🔴 o recorte CONTINUA sobre os preenchimentos — é o canto arredondado", () => {
    // A tentação óbvia (e errada) é apagar o `overflow: hidden`. Ele existe
    // para que os preenchimentos `inset: 0` de largura percentual respeitem o
    // `border-radius` da barra; sem ele a ponta deles vaza o canto.
    //
    // Mutação que morre: remover o `overflow`/`border-radius` da caixa interna.
    const doc = parse(<CandidateResultRow {...BASE} />);
    const clip = doc.querySelector('[data-testid="result-bar-clip"]');
    const estilo = (clip?.getAttribute("style") ?? "").replace(/\s+/g, "");

    expect(estilo).toContain("overflow:hidden");
    expect(estilo).toContain("border-radius:var(--radius-xs)");
    for (const fill of doc.querySelectorAll("[data-view-only]")) {
      expect(clip?.contains(fill)).toBe(true);
    }
  });

  it("horizontalmente o traço continua contido — 100% não vira rolagem lateral", () => {
    // Sem recorte, `left: 100%` pintaria 2px FORA da barra, e a barra termina
    // na borda direita da linha. O teto no `left` mantém o traço dentro e, de
    // quebra, torna visível o caso que ANTES sumia aparado.
    const doc = parse(<CandidateResultRow {...BASE} pctAtual={100} pctProjetado={100} />);
    const estilo = (
      doc.querySelector('[data-testid="result-bar-marker"]')?.getAttribute("style") ?? ""
    ).replace(/\s+/g, "");

    expect(estilo).toContain("left:min(100%,calc(100%-2px))");
  });
});
