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
 *   5. As pílulas de 2026-09-10 (k..o): existem, uma por candidato até 5, a
 *      primeira nasce selecionada, e a SELECIONADA usa o par medido
 *      `-chip`/`-ink` — nunca `colorForParty()`, que não garante contraste
 *      do texto por cima (constituição § 4).
 *
 * O arquivo tem duas metades. A primeira usa `renderToStaticMarkup`, como o
 * resto da suíte de componentes: cobre a regra pura (`strongholdsFor`) e o
 * markup no estado inicial. A segunda monta de verdade (`createRoot` + `act`,
 * happy-dom), porque `renderToStaticMarkup` não hidrata e o CLIQUE na pílula
 * — que é o comportamento inteiro da mudança — só existe numa árvore montada.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  chipFillFor,
  chipLabels,
  StrongholdsPanel,
  strongholdsFor,
} from "@/components/blocks/StrongholdsPanel";
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
    // A tabela visível é a do candidato selecionado — por default o primeiro
    // da lista. Então cada asserção renderiza com o candidato que interessa
    // na cabeça da lista, em vez de procurar três tabelas na mesma árvore.
    const tagStyle = (cands: EdgeCandidate[], sigla: string) => {
      const doc = parse(<StrongholdsPanel candidatos={cands} rows={rows} />);
      return (
        Array.from(doc.querySelectorAll<HTMLElement>('[data-testid="party-tag"]'))
          .find((t) => t.getAttribute("data-sigla") === sigla)
          ?.getAttribute("style") ?? ""
      );
    };

    expect(tagStyle([pt, pl], "PT")).toContain("var(--party-pt)");
    expect(tagStyle([pl, pt], "PL")).toContain("var(--party-pl)");
    // `partido: ""` não tem token — usa o rank 3 do fallback, não `--party-outros`.
    expect(tagStyle([semPartido], "")).toContain("var(--color-cand-3)");
  });

  it("(g) UMA <table> por vez — a do candidato selecionado — com <caption> e cabeçalhos (RNF-023)", () => {
    const doc = parse(<StrongholdsPanel candidatos={candidatos} rows={rows} />);
    const tabelas = doc.querySelectorAll('[data-testid="stronghold-column"]');
    // Antes de 2026-09-10 eram três colunas simultâneas; agora as pílulas
    // filtram e só a selecionada é desenhada.
    expect(tabelas).toHaveLength(1);

    const unica = tabelas[0];
    expect(unica?.querySelector("caption")?.textContent).toContain("Candidato PT");
    expect(
      Array.from(unica?.querySelectorAll("thead th") ?? []).map((th) => th.textContent),
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

  it("(k) uma pílula por candidato, rotulada pelo PRIMEIRO nome, no máximo 5", () => {
    const seis = [1, 2, 3, 4, 5, 6].map((n) =>
      makeCand({ id: n, nome: `Nome${n} Sobrenome${n}`, partido: "PT", rank: n }),
    );
    const doc = parse(<StrongholdsPanel candidatos={seis} rows={rows} />);
    const chips = Array.from(doc.querySelectorAll<HTMLElement>('[data-testid="stronghold-chip"]'));

    expect(chips).toHaveLength(5); // `race.candidates.slice(0, 5)` do kit
    // O `<span class="sr-only">` acrescenta a sigla só para leitor de tela; o
    // rótulo VISÍVEL é o primeiro nome e nada mais.
    const rotuloVisivel = (el: HTMLElement) => {
      const copia = el.cloneNode(true) as HTMLElement;
      copia.querySelector(".sr-only")?.remove();
      return copia.textContent?.trim();
    };
    expect(chips.map((c) => rotuloVisivel(c))).toEqual([
      "Nome1",
      "Nome2",
      "Nome3",
      "Nome4",
      "Nome5",
    ]);
    expect(chips.map((c) => c.getAttribute("data-candidato"))).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("(k2) primeiros nomes iguais não viram pílulas idênticas — desempata pela sigla", () => {
    // Caso real do fixture do repo: "Candidato PT", "Candidato PL", … — o
    // corte no primeiro nome produziria cinco pílulas escritas "Candidato".
    expect(
      chipLabels([
        { nome: "Candidato PT", partido: "PT" },
        { nome: "Candidato PL", partido: "PL" },
        { nome: "Ciro Gomes", partido: "PDT" },
      ]),
    ).toEqual(["Candidato PT", "Candidato PL", "Ciro"]);

    // Nomes de urna distintos (o caso do protótipo): saída idêntica à do kit.
    expect(
      chipLabels([
        { nome: "Lula da Silva", partido: "PT" },
        { nome: "Tarcísio de Freitas", partido: "REPUBLICANOS" },
      ]),
    ).toEqual(["Lula", "Tarcísio"]);

    // Colidem e não há sigla para desempatar → nome completo.
    expect(
      chipLabels([
        { nome: "Maria Silva", partido: "" },
        { nome: "Maria Souza", partido: "" },
      ]),
    ).toEqual(["Maria Silva", "Maria Souza"]);
  });

  it("(l) a primeira pílula nasce selecionada e as demais não (aria-pressed)", () => {
    const doc = parse(<StrongholdsPanel candidatos={candidatos} rows={rows} />);
    const chips = Array.from(doc.querySelectorAll<HTMLElement>('[data-testid="stronghold-chip"]'));
    expect(chips.map((c) => c.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"]);
    // O estado NÃO é carregado só pela cor — `aria-pressed` é o portador.
    expect(chips[0]?.getAttribute("data-ativo")).toBe("true");
  });

  it("(m) a pílula selecionada pinta com o par medido -chip/-ink, não com colorForParty()", () => {
    const doc = parse(<StrongholdsPanel candidatos={candidatos} rows={rows} />);
    const chips = Array.from(doc.querySelectorAll<HTMLElement>('[data-testid="stronghold-chip"]'));
    const estilo = chips[0]?.getAttribute("style") ?? "";

    expect(estilo).toContain("var(--party-pt-chip)");
    expect(estilo).toContain("var(--party-pt-ink)");
    // `--party-pt` cru como fundo seria o erro que este teste existe para
    // impedir: ele não vem com tinta medida.
    expect(estilo).not.toMatch(/var\(--party-pt\)/);

    // Não selecionada: sem preenchimento inline nenhum (contorno hairline do
    // módulo CSS).
    expect(chips[1]?.getAttribute("style")).toBeNull();
  });

  it("(n) sigla sem token de partido não inventa par — cai no inverso do shell", () => {
    expect(chipFillFor("PT")).toEqual({
      background: "var(--party-pt-chip)",
      ink: "var(--party-pt-ink)",
    });
    expect(chipFillFor("")).toEqual({
      background: "var(--surface-inverse)",
      ink: "var(--text-inverse)",
    });
    expect(chipFillFor(undefined)).toEqual({
      background: "var(--surface-inverse)",
      ink: "var(--text-inverse)",
    });
  });

  it("(o) as pílulas são um grupo rotulado e apontam para a tabela que trocam", () => {
    const doc = parse(<StrongholdsPanel candidatos={candidatos} rows={rows} />);
    const grupo = doc.querySelector('[data-testid="strongholds-chips"]');
    expect(grupo?.tagName).toBe("FIELDSET");
    expect(grupo?.querySelector("legend")?.textContent).toBe("Escolher candidato");

    const chip = doc.querySelector<HTMLElement>('[data-testid="stronghold-chip"]');
    const tabela = doc.querySelector<HTMLElement>('[data-testid="stronghold-column"]');
    expect(chip?.getAttribute("aria-controls")).toBe(tabela?.getAttribute("id"));
    expect(tabela?.getAttribute("id")).toBeTruthy();
  });

  it("(p) lista as 10 UFs mais fortes do selecionado, não 5", () => {
    // 12 UFs em que o PT aparece; o corte tem de ser 10.
    const muitas = Array.from({ length: 12 }, (_, i) =>
      makeRow(`U${i}`, [
        { id: 13, pct: 60 - i },
        { id: 22, pct: 20 },
      ]),
    );
    const doc = parse(<StrongholdsPanel candidatos={[pt, pl]} rows={muitas} />);
    expect(doc.querySelectorAll("tbody tr")).toHaveLength(10);
  });
});

/**
 * O clique. `renderToStaticMarkup` não hidrata, então esta parte monta de
 * verdade (`createRoot` + `act`, happy-dom) — é o único jeito de medir que a
 * pílula TROCA a tabela, que é o comportamento inteiro da mudança.
 */
// biome-ignore lint/suspicious/noExplicitAny: flag global do ambiente de `act`
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("<StrongholdsPanel /> — a pílula filtra", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<StrongholdsPanel candidatos={candidatos} rows={rows} />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const chips = () =>
    Array.from(container.querySelectorAll<HTMLElement>('[data-testid="stronghold-chip"]'));
  const caption = () => container.querySelector("caption")?.textContent ?? "";
  const ufsNaTabela = () =>
    Array.from(container.querySelectorAll<HTMLElement>("tbody tr[data-uf]")).map((tr) =>
      tr.getAttribute("data-uf"),
    );

  it("(q) clicar na segunda pílula troca a tabela para aquele candidato", () => {
    expect(caption()).toContain("Candidato PT");
    expect(ufsNaTabela()).toEqual(["BA", "MG", "SC"]); // as UFs do PT

    act(() => chips()[1]?.click());

    expect(caption()).toContain("Candidato PL");
    // As UFs do PL, por percentual desc: SC 58, MG 44, RR 35, BA 28.
    expect(ufsNaTabela()).toEqual(["SC", "MG", "RR", "BA"]);
  });

  it("(r) só uma pílula fica pressionada por vez", () => {
    act(() => chips()[2]?.click());
    expect(chips().map((c) => c.getAttribute("aria-pressed"))).toEqual(["false", "false", "true"]);
    // E a tabela seguiu: `semPartido` (#99) só aparece em RR.
    expect(ufsNaTabela()).toEqual(["RR"]);
  });

  it("(s) a pílula pressionada ganha o preenchimento medido; a anterior o perde", () => {
    act(() => chips()[1]?.click());

    // `style.background` volta o token literal — não resolvemos CSS aqui.
    expect(chips()[1]?.style.background).toContain("--party-pl-chip");
    expect(chips()[1]?.style.color).toContain("--party-pl-ink");
    expect(chips()[0]?.style.background).toBe("");
  });

  it("(t) o aria-controls continua apontando para a tabela depois da troca", () => {
    act(() => chips()[1]?.click());
    const alvo = chips()[1]?.getAttribute("aria-controls");
    expect(alvo).toBeTruthy();
    expect(container.querySelector(`#${alvo}`)?.getAttribute("data-testid")).toBe(
      "stronghold-column",
    );
  });
});
