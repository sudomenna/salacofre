// @vitest-environment happy-dom
/**
 * tests/unit/components/StateResultSheet.rotuloProjecao.test.tsx
 *
 * 2026-09-20 — o rótulo de base da ficha de UF (`state-sheet-base-label`).
 *
 * ## ⚠️ Este cabeçalho foi REESCRITO no mesmo dia, e a razão importa
 *
 * A versão da manhã dizia que `EdgeUfRow.top_candidatos[]` "traz um `pct` só"
 * e que "o payload não tem parcial por candidatura nesse nível". **Era falso
 * desde 2026-09-19**: o array carrega `pct_atual` e `votos_atuais`
 * (`lib/edge-config/types.ts`), e `api/model/project.py` os emite. Sobre essa
 * premissa errada nasceram o rótulo "Percentuais de projeção" e uma afirmação
 * errada ao dono. A ficha passou a mostrar os DOIS números na tarde do mesmo
 * dia (ver `StateResultSheet.parcialEProjecao.test.tsx`), e este arquivo
 * acompanhou — sem afrouxar nada: os casos ficaram mais exigentes, não menos.
 *
 * ## O defeito que este arquivo tranca AGORA
 *
 * No commit `290b8de` a lista principal das telas passou a **acompanhar a base
 * ativa** do segmentado "Parcial / Projeção" — número e ordem. Com os dois
 * números na ficha, o NÚMERO deixou de divergir. Sobrou a **ordem**:
 * `top_candidatos[]` chega ordenado por `pct_projetado` desc e a ficha não o
 * reordena (reordenar é decisão do dono, não pedida). Em Senador isso alcança
 * também o `<VagaBadge>`, que marca as duas primeiras DESSA ordem.
 *
 * Logo o rótulo mudou de AFIRMAÇÃO: ele qualificava os percentuais — o que com
 * os dois na tela virou mentira, e mentira sobre o número — e agora qualifica
 * a ordem, que é o que de fato continua sendo só projeção. O que estes testes
 * protegem **não é um caminho de dado, é uma afirmação na tela**, e ela precisa
 * ser verdadeira nas duas bases.
 *
 * ## Por que os casos são estes
 *
 * "O rótulo existe" sozinho não discrimina o defeito real, e "o rótulo contém
 * a palavra projeção" discrimina menos ainda — o rótulo ANTIGO, hoje falso,
 * passa nos dois. Por isso o bloco 3 afirma o ESCOPO da frase (ela fala de
 * ordem) e a ausência de uma reivindicação sobre os números.
 *
 * E o bloco "incondicional" afirma a AUSÊNCIA dos dois contratos de
 * `app/globals.css` (`data-view-only`, `data-view-cell`) que escondem ou
 * recuam algo conforme `data-view`. São os únicos dois mecanismos do projeto
 * com esse efeito; qualquer um deles no caminho do rótulo o tornaria
 * condicional, e a ordem é por projeção nas DUAS bases.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StateResultSheet } from "@/components/blocks/StateResultSheet";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";

type Cargo = "pres" | "gov" | "sen";
const CARGOS: Cargo[] = ["pres", "gov", "sen"];

const CANDIDATOS: EdgeCandidate[] = [13, 22, 99].map(
  (id, i) =>
    ({
      id,
      nome: `Candidato ${id}`,
      partido: ["PT", "PL", "PSOL"][i],
      cor: "var(--color-cand-1)",
      votos_atuais: 1,
      votos_projetados: 1,
      pct_atual: 40 - i * 10,
      pct_projetado: 40 - i * 10,
      pct_projetado_lower: 0,
      pct_projetado_upper: 100,
      p_vitoria: 0.3,
      rank: i + 1,
      p_passa_2t: 0.3,
      p_fecha_1t: 0,
    }) as EdgeCandidate,
);

const ROW: EdgeUfRow = {
  sigla: "SP",
  pct_apurado: 40,
  lider: 13,
  margem_atual: 10,
  margem_projetada: 10,
  margem_projetada_ci: [8, 12],
  chamada: false,
  swing_vs_2022: null,
  // 🔴 COM `pct_atual` de propósito (2026-09-20, tarde). O rótulo antigo
  // ("Percentuais de projeção") só é FALSO quando a parcial está na tela ao
  // lado: numa fixture sem o campo ele continuaria tecnicamente verdadeiro, e
  // os casos do bloco 2 passariam a proteger nada. A base de teste tem de ser
  // o estado em que a afirmação pode mentir.
  top_candidatos: [
    { id: 13, pct: 40, pct_atual: 37.4, nome: "FERNANDA DA SILVA", partido: "PT", sqcand: "1" },
    { id: 22, pct: 30, pct_atual: 32.1, nome: "MARCOS DE OLIVEIRA", partido: "PL", sqcand: "2" },
    { id: 99, pct: 29, pct_atual: 26.8, nome: "TERCEIRO COLOCADO", partido: "PSOL", sqcand: "3" },
  ],
  vai_a_2t: null,
  bucket: "indefinido",
};

function html(cargo: Cargo): string {
  return renderToStaticMarkup(
    <StateResultSheet open onClose={() => {}} row={ROW} candidatos={CANDIDATOS} cargo={cargo} />,
  );
}

function parse(cargo: Cargo): Document {
  return new DOMParser().parseFromString(html(cargo), "text/html");
}

function rotulo(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>("[data-testid='state-sheet-base-label']");
}

/** Sobe do elemento até o `<body>` juntando o próprio nó e seus ancestrais. */
function comAncestrais(el: Element): Element[] {
  const cadeia: Element[] = [];
  for (let cur: Element | null = el; cur && cur.tagName !== "BODY"; cur = cur.parentElement) {
    cadeia.push(cur);
  }
  return cadeia;
}

describe("<StateResultSheet /> — rótulo de base: a ORDEM é projeção, e a ficha diz isso", () => {
  // -------------------------------------------------------------------
  // 1. O rótulo existe — em TODO cargo que abre esta ficha
  // -------------------------------------------------------------------

  it.each(CARGOS)('cargo="%s" — o rótulo de base está na ficha', (cargo) => {
    // 🔴 MUTAÇÃO ALVO: remover o bloco `<p data-testid="state-sheet-base-label">`
    // de `StateResultSheet.tsx`. Este é o caso que morre.
    expect(rotulo(parse(cargo))).not.toBeNull();
  });

  // -------------------------------------------------------------------
  // 2. Ele diz "projeção" — a palavra do produto, não um sinônimo
  // -------------------------------------------------------------------

  it.each(CARGOS)('cargo="%s" — o rótulo usa a palavra "projeção"', (cargo) => {
    const texto = rotulo(parse(cargo))?.textContent ?? "";
    expect(texto.toLowerCase()).toContain("projeção");
  });

  // -------------------------------------------------------------------
  // 3. 🔴 Ele qualifica a ORDEM, não os números — com os dois na tela,
  //    uma frase sobre "os percentuais" é falsa
  // -------------------------------------------------------------------

  it.each(CARGOS)('cargo="%s" — o rótulo fala de ORDEM', (cargo) => {
    // 🔴 MUTAÇÃO ALVO (3 do briefing): devolver o texto "Percentuais de
    // projeção". Ele contém "projeção" e passaria em todo o bloco 1; morre
    // aqui, porque não diz nada sobre ordem.
    const texto = (rotulo(parse(cargo))?.textContent ?? "").toLowerCase();
    expect(texto).toMatch(/ordem|ordenad/);
  });

  it("🔴 o rótulo NÃO reivindica os percentuais — eles são dois, e só um é projeção", () => {
    // O gatilho é a tela, não a redação: SE a ficha desenha uma célula de
    // parcial, ENTÃO nenhuma frase geral no topo pode qualificar "os
    // percentuais"/"os números", porque metade deles não é projeção. É esta
    // implicação que mata o rótulo antigo — e ela é mais forte que comparar
    // com a string nova, que passaria em qualquer texto que eu escrevesse.
    const doc = parse("pres");
    const temParcialNaTela = doc.querySelector("[data-testid='state-sheet-cand-parcial']");
    expect(temParcialNaTela, "a fixture precisa ter parcial na tela").not.toBeNull();

    const texto = (rotulo(doc)?.textContent ?? "").toLowerCase();
    for (const reivindicacao of ["percentua", "número", "numero", "valores"]) {
      expect(texto).not.toContain(reivindicacao);
    }
  });

  it("não inventa vocabulário: nada de estimativa/previsão/prognóstico/simulação", () => {
    // O produto já diz "Projeção" no segmentado do cabeçalho
    // (`ViewModeSwitch.tsx:28`) e "por projeção" na descrição acessível do
    // mapa (`uf-descricao-candidaturas.ts:112`). Um sinônimo aqui criaria um
    // segundo nome para a mesma coisa, e o leitor teria de descobrir sozinho
    // que são a mesma.
    const texto = (rotulo(parse("pres"))?.textContent ?? "").toLowerCase();
    for (const proibido of ["estimativa", "previsão", "prognóstico", "simulação", "tendência"]) {
      expect(texto).not.toContain(proibido);
    }
  });

  it("o rótulo NÃO promete parcial — a ORDEM não é a da parcial", () => {
    // ⚠️ A razão deste caso MUDOU em 2026-09-20 e a asserção não: antes ele
    // dizia que o dado não existia (o que era falso já naquela manhã); agora
    // diz o que continua verdadeiro — a ficha ordena por PROJEÇÃO e só por
    // ela. Um rótulo do tipo "Em ordem de parcial e projeção" prometeria uma
    // ordenação dupla que a ficha não faz, e um "por parcial" prometeria a
    // ordem errada. Manter a asserção com a razão vencida seria pior que
    // apagá-la: um teste verde por acidente.
    expect((rotulo(parse("pres"))?.textContent ?? "").toLowerCase()).not.toContain("parcial");
  });

  // -------------------------------------------------------------------
  // 4. Alcançável por quem não enxerga
  // -------------------------------------------------------------------

  it("o rótulo está na árvore de acessibilidade (nem ele nem ancestral com aria-hidden)", () => {
    const doc = parse("pres");
    const el = rotulo(doc);
    expect(el).not.toBeNull();
    if (!el) return;
    expect((el.textContent ?? "").trim().length).toBeGreaterThan(0);
    for (const no of comAncestrais(el)) {
      expect(no.getAttribute("aria-hidden")).not.toBe("true");
    }
  });

  it("o rótulo vem ANTES da lista na ordem de leitura", () => {
    // Depois do ranking, o leitor de tela ouviria os quatro percentuais e só
    // então a informação que os qualifica.
    const doc = parse("pres");
    const el = rotulo(doc);
    const lista = doc.querySelector("[data-testid='state-sheet-candidatos']");
    expect(el).not.toBeNull();
    expect(lista).not.toBeNull();
    if (!el || !lista) return;
    // `compareDocumentPosition` devolve um bitmask; o `&` é a leitura dele.
    const precede = el.compareDocumentPosition(lista) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(precede).toBeTruthy();
  });

  it("o nome acessível da lista carrega a MESMA afirmação do rótulo visível", () => {
    // Quem navega POR LISTA salta o rótulo visível: o nome do bloco é o
    // segundo caminho até a mesma informação. "Mesma" é literal — se o nome
    // acessível dissesse só "por projeção" enquanto o rótulo fala de ordem, o
    // leitor de tela ouviria a afirmação ANTIGA, a que virou falsa.
    const doc = parse("pres");
    const rotuloLista = (
      doc.querySelector("[data-testid='state-sheet-candidatos']")?.getAttribute("aria-label") ?? ""
    ).toLowerCase();
    expect(rotuloLista).toContain("projeção");
    expect(rotuloLista).toMatch(/ordem|ordenad/);
    for (const reivindicacao of ["percentua", "número", "numero"]) {
      expect(rotuloLista).not.toContain(reivindicacao);
    }
  });

  it("cada percentual continua auto-descrito para quem navega item a item", () => {
    // Não é duplicação inútil: um leitor que entra no `<li>` direto não passa
    // nem pelo rótulo nem pelo nome da lista. Com DOIS números por linha isso
    // deixou de ser conforto e virou requisito: "37,4% 40,0%" sem rótulo é
    // indistinguível de um número e o seu intervalo de confiança.
    const doc = parse("pres");
    const linhas = Array.from(
      doc.querySelectorAll<HTMLElement>("[data-testid='state-sheet-candidatos'] > li"),
    );
    expect(linhas.length).toBeGreaterThan(0);
    for (const li of linhas) {
      const audivel = (li.textContent ?? "").toLowerCase();
      // A projeção chega pelo `sr-only` (o desenhado, "proj.", é aria-hidden).
      const srOnly = Array.from(li.querySelectorAll(".sr-only"))
        .map((n) => n.textContent ?? "")
        .join(" ")
        .toLowerCase();
      expect(srOnly).toContain("projeção");
      // A parcial chega pela própria palavra desenhada, que já é a inteira.
      expect(audivel).toContain("parcial");
    }
  });

  it("nenhum `sr-only` dentro de <table> nesta ficha (a ficha não tem tabela)", () => {
    // Regra de 2026-09-19: `sr-only` depende de `width:1px`, e `<table>` trata
    // largura como MÍNIMO — o recorte falha e a tabela empurra a página.
    // Ver `tests/unit/design-system/sr-only-tabela.test.ts`.
    const doc = parse("pres");
    expect(doc.querySelectorAll("table")).toHaveLength(0);
  });

  // -------------------------------------------------------------------
  // 5. 🔴 Incondicional: o rótulo não some com a base ativa
  // -------------------------------------------------------------------

  it("o rótulo não carrega os contratos de `data-view` — nem ele, nem seus ancestrais", () => {
    // `app/globals.css` (bloco "ADR-0029 § 2") tem EXATAMENTE dois contratos
    // que fazem um elemento reagir à base ativa:
    //   `[data-view-only]`  → `display: none` fora da base casada;
    //   `[data-view-cell]`  → recua a cor fora da base casada.
    // Nenhum dos dois pode tocar este rótulo: o que ele afirma vale nas DUAS
    // bases, e é na base "Parcial" — a que NÃO é o default — que ele é
    // indispensável.
    //
    // 🔴 MUTAÇÃO ALVO: acrescentar `data-view-only="proj"` ao `<p>`. O caso
    // "o rótulo existe" continuaria verde (o atributo não muda o markup
    // servido) e só ESTE reprova.
    const doc = parse("pres");
    const el = rotulo(doc);
    expect(el).not.toBeNull();
    if (!el) return;
    for (const no of comAncestrais(el)) {
      expect(no.hasAttribute("data-view-only")).toBe(false);
      expect(no.hasAttribute("data-view-cell")).toBe(false);
    }
  });

  it("o markup da ficha não depende de `data-view` no <html> (render idêntico nas duas bases)", () => {
    // A ficha é Server Component puro: não lê a store do segmentado. Este caso
    // trava isso — um `useViewMode()` aqui dentro tornaria o componente client
    // e faria a ficha mudar de comportamento com o seletor, que é exatamente o
    // que o dado não sustenta.
    const antes = document.documentElement.getAttribute("data-view");
    try {
      document.documentElement.setAttribute("data-view", "parcial");
      const emParcial = html("pres");
      document.documentElement.setAttribute("data-view", "proj");
      const emProj = html("pres");
      expect(emParcial).toBe(emProj);
      expect(emParcial).toContain("state-sheet-base-label");
    } finally {
      if (antes === null) document.documentElement.removeAttribute("data-view");
      else document.documentElement.setAttribute("data-view", antes);
    }
  });

  // -------------------------------------------------------------------
  // 6. Não regride o que já estava certo
  // -------------------------------------------------------------------

  it('o rótulo fica ABAIXO das <Figure> — "Apurado" é parcial de verdade e não pode ser rotulado de projeção', () => {
    const doc = parse("pres");
    const el = rotulo(doc);
    const figuras = doc.querySelector("[role='group']");
    expect(el).not.toBeNull();
    expect(figuras).not.toBeNull();
    if (!el || !figuras) return;
    // `compareDocumentPosition` devolve um bitmask; o `&` é a leitura dele.
    const figuraPrimeiro = figuras.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(figuraPrimeiro).toBeTruthy();
    expect(doc.body.textContent).toContain("Apurado");
  });

  it("nenhum hex literal introduzido pelo rótulo (constituição § 2)", () => {
    expect(html("sen")).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
