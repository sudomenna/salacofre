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

/**
 * Os PREENCHIMENTOS da barra, e só eles.
 *
 * 🔴 Escopado ao recorte de propósito. Desde 2026-09-20 os traços também usam
 * `data-view-only` (é o mecanismo de exclusividade do shell, e reusá-lo é o que
 * mantém esta linha sem JS), então um `doc.querySelectorAll("[data-view-only]")`
 * solto passou a devolver QUATRO elementos. Um teste que continuasse lendo
 * `[0]` e `[1]` dali mediria os preenchimentos por acidente de ordem no DOM.
 */
function preenchimentos(doc: Document): Element[] {
  return [...doc.querySelectorAll('[data-testid="result-bar-clip"] > [data-view-only]')];
}

/** Os dois traços, na ordem em que o componente os emite. */
function marcadores(doc: Document): Element[] {
  return [...doc.querySelectorAll('[data-testid="result-bar-marker"]')];
}

/** O traço que a base `base` mostra — o que o CSS revela naquela visão. */
function marcadorDaBase(doc: Document, base: "parcial" | "proj"): Element | null {
  return doc.querySelector(`[data-testid="result-bar-marker"][data-view-only="${base}"]`);
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

/** `style` sem espaço em branco — comparação estável contra o que o React emite. */
function estilo(el: Element | null): string {
  return (el?.getAttribute("style") ?? "").replace(/\s+/g, "");
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

  it("(c) a barra tem um preenchimento por base — e cada um desenha a sua", () => {
    const doc = parse(<CandidateResultRow {...BASE} />);
    const fills = preenchimentos(doc);

    expect(fills.map((f) => f.getAttribute("data-view-only"))).toEqual(["parcial", "proj"]);
    expect(fills[0]?.getAttribute("style")).toContain("width:8.4%");
    expect(fills[1]?.getAttribute("style")).toContain("width:9.1%");
    // A distância entre "onde está" e "onde o modelo diz que termina"
    // (constituição § 8) continua na tela — pelo traço, nas duas bases. Qual
    // valor cada traço marca é o bloco "o traço marca sempre a OUTRA base".
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
    const fills = preenchimentos(doc);
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

  it("🔴 a barra tem 8px — o dobro dos 4px que tinha", () => {
    // Mutação que morre: qualquer valor que não seja 8. O número é literal de
    // propósito: importar `BARRA_ALTURA_PX` e comparar com ele mesmo seria a
    // tautologia que este repositório já registrou como "teste que não
    // discrimina" — passaria com 4, com 8 e com 40.
    expect(px(barra(parse(<CandidateResultRow {...BASE} />)), "height")).toBe(8);
  });

  it("o traço NÃO dobrou junto — OS DOIS seguem sobrando 2px de cada lado", () => {
    // Decisão registrada no componente: o traço precisa ser visível acima e
    // abaixo do preenchimento, e 2px cumprem isso numa barra de 4 ou de 8.
    // Dobrá-lo faria dele um segundo elemento competindo com a barra.
    //
    // Mutação que morre: escalar a sobra junto com a altura (-4/-4), ou zerá-la.
    //
    // ⚠️ Este caso mede a INTENÇÃO declarada, e sozinho ele não prova nada
    // sobre a tela: passou verde entre 08/09 e 20/09 com a sobra recortada e
    // invisível. Quem prova que ela chega ao vidro é o bloco logo abaixo.
    //
    // 🔴 Percorre os DOIS traços (20/09): com a inversão, em CADA linha há uma
    // base em que o traço cai dentro do preenchimento — a sobra é a única
    // parte legível ali, e um caso que olhasse só o primeiro deixaria o outro
    // regredir sozinho.
    const doc = parse(<CandidateResultRow {...BASE} />);
    expect(marcadores(doc)).toHaveLength(2);
    for (const marcador of marcadores(doc)) {
      expect(marcador.getAttribute("style")).toContain("--accent-strong");
      expect(px(marcador, "top")).toBe(-2);
      expect(px(marcador, "bottom")).toBe(-2);
    }
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

  it("🔴 nenhum ancestral de NENHUM dos dois traços recorta — a sobra chega ao vidro", () => {
    // Mutação que morre: mover QUALQUER um dos dois traços para dentro de
    // `[data-testid="result-bar-clip"]`, que é onde o traço único ficou de
    // 08/09 a 20/09.
    const doc = parse(<CandidateResultRow {...BASE} />);
    expect(marcadores(doc)).toHaveLength(2);

    for (const marcador of marcadores(doc)) {
      const culpados = ancestrais(marcador)
        .filter(recorta)
        .map((el) => el.getAttribute("data-testid") ?? el.getAttribute("style") ?? el.tagName);

      expect({ base: marcador.getAttribute("data-view-only"), culpados }).toEqual({
        base: marcador.getAttribute("data-view-only"),
        culpados: [],
      });
    }
  });

  it("🔴 os DOIS traços são IRMÃOS do recorte, não descendentes dele", () => {
    // O caso acima já pegaria a regressão, mas só pelo efeito. Este nomeia a
    // estrutura: se um dia o recorte sair do `clip` e for parar em outro lugar,
    // a resposta certa continua sendo manter os traços fora dele.
    const doc = parse(<CandidateResultRow {...BASE} />);
    const clip = doc.querySelector('[data-testid="result-bar-clip"]');

    expect(marcadores(doc)).toHaveLength(2);
    for (const marcador of marcadores(doc)) {
      expect(clip?.contains(marcador)).toBe(false);
      expect(marcador.parentElement?.getAttribute("data-testid")).toBe("result-bar");
    }
  });

  it("🔴 o recorte CONTINUA sobre os preenchimentos — é o canto arredondado", () => {
    // A tentação óbvia (e errada) é apagar o `overflow: hidden`. Ele existe
    // para que os preenchimentos `inset: 0` de largura percentual respeitem o
    // `border-radius` da barra; sem ele a ponta deles vaza o canto.
    //
    // Mutação que morre: remover o `overflow`/`border-radius` da caixa interna.
    const doc = parse(<CandidateResultRow {...BASE} />);
    const clip = doc.querySelector('[data-testid="result-bar-clip"]');
    const css = estilo(clip);

    expect(css).toContain("overflow:hidden");
    expect(css).toContain("border-radius:var(--radius-xs)");

    const fills = preenchimentos(doc);
    expect(fills).toHaveLength(2);
    for (const fill of fills) {
      expect(clip?.contains(fill)).toBe(true);
    }
  });

  it("horizontalmente OS DOIS traços continuam contidos — 100% não vira rolagem lateral", () => {
    // Sem recorte, `left: 100%` pintaria 2px FORA da barra, e a barra termina
    // na borda direita da linha. O teto no `left` mantém o traço dentro e, de
    // quebra, torna visível o caso que ANTES sumia aparado.
    //
    // 🔴 Vale para OS DOIS desde 20/09: `atual` chega a 100% no fim da noite
    // tanto quanto `projetado`, e um traço sem teto empurra a página igual.
    // Mutação que morre: tirar o `min(...)` de um dos dois.
    const doc = parse(<CandidateResultRow {...BASE} pctAtual={100} pctProjetado={100} />);

    expect(marcadores(doc)).toHaveLength(2);
    for (const marcador of marcadores(doc)) {
      expect(estilo(marcador)).toContain("left:min(100%,calc(100%-2px))");
    }
  });
});

/**
 * 🔴 2026-09-20 — o traço marca sempre a OUTRA base.
 *
 * ## O defeito que este bloco existe para impedir
 *
 * Havia UM traço, fixo em `pctProjetado`. Na base `parcial` isso é coerente: a
 * barra desenha `atual` e o traço mostra para onde o modelo diz que a corrida
 * termina. Na base `proj`, porém, a barra TAMBÉM desenha `projetado` — o
 * preenchimento e o traço caem no mesmo ponto, em toda candidatura, sempre.
 * Medido no Chrome em 20/09, rota `/`, base `proj`, linha do LULA:
 * preenchimento com 113,125px e traço com `left` em 113,1px.
 *
 * E `proj` é o DEFAULT (`lib/state/view-mode.ts`, `VIEW_MODE_DEFAULT`): quem
 * abre o site vê exatamente o estado em que o traço não informa nada.
 *
 * ## Por que a suíte antiga não pegou
 *
 * Porque nenhum caso perguntava *qual* valor o traço marca em *qual* base. O
 * caso (c) checava que a cor `--accent-strong` estava no HTML; o bloco da
 * altura checava `top`/`bottom`. Ambos passariam com o traço em qualquer
 * posição — inclusive empilhado sobre a ponta do preenchimento. É a família
 * "teste que não discrimina" já registrada neste repositório: mede a presença
 * do elemento, não a informação que ele carrega.
 *
 * A regra agora é dizível em voz alta, e é o que estes casos travam: **a barra
 * é a base que você escolheu; o traço é a outra.**
 */
describe("o traço marca sempre a OUTRA base", () => {
  it("🔴 na base `parcial` o traço visível aponta para a PROJEÇÃO", () => {
    // Mutação que morre: trocar a entrada `parcial` de `MARCADOR_BASE_OPOSTA`.
    const doc = parse(<CandidateResultRow {...BASE} />);
    const marcador = marcadorDaBase(doc, "parcial");

    expect(marcador).not.toBeNull();
    expect(marcador?.getAttribute("data-marca")).toBe("proj");
    expect(estilo(marcador)).toContain("left:min(9.1%,calc(100%-2px))");
  });

  it("🔴 na base `proj` o traço visível aponta para a PARCIAL — era aí que ele era mudo", () => {
    // Mutação que morre: devolver este traço para `projetado`, que é o defeito
    // que a tela mostrava até 20/09. O `left` deixaria de ser 8,4% e passaria a
    // ser 9,1% — o mesmo ponto onde o preenchimento `proj` termina.
    const doc = parse(<CandidateResultRow {...BASE} />);
    const marcador = marcadorDaBase(doc, "proj");

    expect(marcador).not.toBeNull();
    expect(marcador?.getAttribute("data-marca")).toBe("parcial");
    expect(estilo(marcador)).toContain("left:min(8.4%,calc(100%-2px))");
  });

  it("🔴 traço e preenchimento NUNCA caem no mesmo ponto, em nenhuma das bases", () => {
    // Este é o caso que nomeia o defeito em vez do conserto: seja qual for a
    // base ativa, o número que a barra desenha e o número que o traço marca têm
    // de ser DIFERENTES sempre que as duas bases diferirem.
    //
    // Mutação que morre: qualquer versão de `MARCADOR_BASE_OPOSTA` que mapeie
    // uma base para ela mesma — inclusive a identidade completa.
    const doc = parse(<CandidateResultRow {...BASE} />);

    for (const base of ["parcial", "proj"] as const) {
      const fill = doc.querySelector(
        `[data-testid="result-bar-clip"] > [data-view-only="${base}"]`,
      );
      const larguraDoFill = estilo(fill).match(/width:([\d.]+)%/)?.[1];
      const posicaoDoTraco = estilo(marcadorDaBase(doc, base)).match(/left:min\(([\d.]+)%/)?.[1];

      expect(larguraDoFill).toBeDefined();
      expect(posicaoDoTraco).toBeDefined();
      expect({ base, mesmoPonto: larguraDoFill === posicaoDoTraco }).toEqual({
        base,
        mesmoPonto: false,
      });
    }
  });

  it("os dois traços existem no DOM com os `data-view-only` certos", () => {
    // Mutação que morre: trocar os dois `data-view-only` entre si. A cascata do
    // shell (`app/globals.css`, `[data-view-only] { display: none }` +
    // `:root[data-view=X] [data-view-only=X] { display: revert }`) é o ÚNICO
    // mecanismo que decide qual traço aparece; com os atributos trocados, cada
    // base mostraria o traço da outra e as duas visões voltariam a ser mudas —
    // desta vez as duas, não só uma.
    const doc = parse(<CandidateResultRow {...BASE} />);

    expect(marcadores(doc).map((m) => m.getAttribute("data-view-only"))).toEqual([
      "parcial",
      "proj",
    ]);
    // Nenhum dos dois nasce com `display:none` no `style`: quem esconde é a
    // cascata, e é ela que também os traz de volta. Um `display` inline aqui
    // venceria a cascata e congelaria a linha numa base só.
    for (const marcador of marcadores(doc)) {
      expect(estilo(marcador)).not.toContain("display:none");
    }
  });
});

/**
 * 🔴 2026-09-20 — o traço some quando a base que ele marca vale ZERO.
 *
 * O caso nasceu com a inversão. No começo da noite `atual` é 0 para todo mundo,
 * e na base `proj` — o default — o traço invertido iria para o extremo esquerdo
 * da barra. Um traço colado na borda esquerda **afirma "0% apurado"**, e este
 * projeto tem regra escrita do dono sobre TRÊS estados distintos (não começou /
 * não sabemos / apurando) e sobre nunca fabricar zeros de resgate.
 *
 * O componente não sabe em qual dos três está: `pctAtual` é um `number`
 * obrigatório, sem `null`. Então a afirmação geométrica sai, e só ela — o
 * `0,0%` continua na coluna de texto, nas duas bases, porque ali ele é um
 * número exibido e não uma posição na barra.
 *
 * A condição é simétrica e exata: **o traço de uma base só é renderizado se o
 * percentual da base OPOSTA for `> 0`**, depois do clamp.
 */
describe("traço em base zerada", () => {
  it("🔴 início da noite: `atual = 0` e o traço da base `proj` não é desenhado", () => {
    // Mutação que morre: trocar o `> 0` por `>= 0` (ou remover a guarda).
    const doc = parse(<CandidateResultRow {...BASE} pctAtual={0} pctProjetado={35.8} votos={0} />);

    expect(marcadorDaBase(doc, "proj")).toBeNull();
    // O da base `parcial` CONTINUA: `projetado` vale 35,8 e é informação real.
    expect(marcadorDaBase(doc, "parcial")).not.toBeNull();
    // E o número zero não some da tela — o que some é a posição na barra.
    expect(doc.body.textContent).toContain("0,0%");
  });

  it("`projetado = 0` esconde o traço da base `parcial`, pela mesma regra", () => {
    // A simetria não é enfeite: sem ela a regra vira "o traço some às vezes",
    // que é impossível de verificar na tela.
    const doc = parse(<CandidateResultRow {...BASE} pctAtual={12.3} pctProjetado={0} />);

    expect(marcadorDaBase(doc, "parcial")).toBeNull();
    expect(marcadorDaBase(doc, "proj")).not.toBeNull();
  });

  it("`NaN` — 'não sabemos' — também não vira traço na borda esquerda", () => {
    // `clampPct` manda `NaN` para 0, e desenhar o traço ali seria o componente
    // afirmando um valor medido a partir de um valor ausente.
    const doc = parse(<CandidateResultRow {...BASE} pctAtual={Number.NaN} />);
    expect(marcadorDaBase(doc, "proj")).toBeNull();
  });

  it("ambas zeradas: nenhum traço, e a barra continua inteira", () => {
    const doc = parse(<CandidateResultRow {...BASE} pctAtual={0} pctProjetado={0} />);

    expect(marcadores(doc)).toHaveLength(0);
    // A barra e o recorte não dependem do traço para existir — a linha continua
    // desenhando o trilho vazio, que é o estado "ainda não".
    expect(doc.querySelector('[data-testid="result-bar"]')).not.toBeNull();
    expect(preenchimentos(doc)).toHaveLength(2);
  });

  it("um percentual pequeno mas real CONTINUA ganhando traço — a guarda é só o zero", () => {
    // Guarda contra a correção exagerada: um limiar (`> 0.5`, digamos) apagaria
    // o traço de candidaturas pequenas de verdade, que é informação legítima.
    const doc = parse(<CandidateResultRow {...BASE} pctAtual={0.04} pctProjetado={0.2} />);

    expect(marcadorDaBase(doc, "proj")).not.toBeNull();
    expect(estilo(marcadorDaBase(doc, "proj"))).toContain("left:min(0.04%,");
  });
});
