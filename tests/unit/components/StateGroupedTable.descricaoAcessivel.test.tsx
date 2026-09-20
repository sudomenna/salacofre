// @vitest-environment happy-dom
/**
 * tests/unit/components/StateGroupedTable.descricaoAcessivel.test.tsx
 *
 * A fiação no DOM da descrição acessível das células de UF (2026-09-20).
 *
 * O CONTEÚDO do texto é provado em `tests/unit/lib/uf-descricao-candidaturas.test.ts`.
 * Aqui provamos as quatro coisas que só o DOM responde:
 *
 *   1. o `aria-describedby` do link aponta para um `id` que EXISTE no
 *      documento (um alvo inexistente é RNF-022 quebrado em silêncio — pior
 *      que não descrever nada);
 *   2. o texto está FORA do `<a>`, não dentro (dentro, ele entra no nome
 *      acessível do link e a lista é lida duas vezes);
 *   3. a classe de esconder é `sr-only` num `<span>` — **nunca** numa
 *      `<table>` (regra de 2026-09-19: 2.424px de rolagem horizontal medidos
 *      na home a 360px; ver `tests/unit/design-system/sr-only-tabela.test.ts`);
 *   4. linha sem candidaturas ⇒ nem `<span>` nem atributo.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StateGroupedTable } from "@/components/blocks/StateGroupedTable";
import type { EdgeUfRow } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

const ROW_SP: EdgeUfRow = {
  sigla: "SP",
  pct_apurado: 42,
  lider: 13,
  margem_atual: 10,
  margem_projetada: 10,
  margem_projetada_ci: [8, 12],
  chamada: false,
  swing_vs_2022: null,
  top_candidatos: [
    { id: 13, pct: 40.5, nome: "FERNANDA DA SILVA", partido: "PT" },
    { id: 22, pct: 30.2, nome: "ROBERTO ALMEIDA", partido: "PL" },
    { id: 12, pct: 15.1, nome: "CARLA MENDES", partido: "PDT" },
    { id: 50, pct: 6.4, nome: "JOAO BATISTA", partido: "PSOL" },
  ],
  outros: { pct: 7.8, n_candidatos: 7 },
  vai_a_2t: null,
  bucket: "indefinido",
};

/** Mesma UF, payload sem nenhuma candidatura e sem cauda. */
const ROW_VAZIA: EdgeUfRow = { ...ROW_SP, sigla: "AC", top_candidatos: [], outros: undefined };

function render(rows: EdgeUfRow[]): Document {
  return parse(<StateGroupedTable rows={rows} candidatoAId={13} />);
}

describe("<StateGroupedTable /> — descrição acessível das candidaturas", () => {
  it("🔴 o link da UF aponta para uma descrição que EXISTE no documento", () => {
    const doc = render([ROW_SP]);
    const link = doc.querySelector('a[href="/uf/SP"]');
    expect(link, "link da célula de SP não encontrado").not.toBeNull();

    const alvo = link?.getAttribute("aria-describedby");
    expect(alvo, "link sem aria-describedby — a descrição não chega a ninguém").toBeTruthy();
    expect(doc.getElementById(alvo as string), `#${alvo} não existe no documento`).not.toBeNull();
  });

  it("🔴 a descrição nomeia AS QUATRO candidaturas + Outros [mutação: nomear só o líder]", () => {
    const doc = render([ROW_SP]);
    const alvo = doc.querySelector('a[href="/uf/SP"]')?.getAttribute("aria-describedby") as string;
    const texto = doc.getElementById(alvo)?.textContent ?? "";

    expect(texto).toContain("FERNANDA DA SILVA (PT) 40,5%");
    expect(texto).toContain("ROBERTO ALMEIDA (PL) 30,2%");
    expect(texto).toContain("CARLA MENDES (PDT) 15,1%");
    expect(texto).toContain("JOAO BATISTA (PSOL) 6,4%");
    expect(texto).toContain("Outros (7) 7,8%");
  });

  it("🔴 a descrição está FORA do `<a>` — senão o nome acessível do link engole a lista", () => {
    const doc = render([ROW_SP]);
    const link = doc.querySelector('a[href="/uf/SP"]') as HTMLElement;
    const alvo = link.getAttribute("aria-describedby") as string;
    const bloco = doc.getElementById(alvo) as HTMLElement;

    expect(link.contains(bloco), "a descrição está dentro do link").toBe(false);
    // O nome acessível do link continua sendo a célula visível, curta.
    expect(link.textContent).not.toContain("FERNANDA DA SILVA");
  });

  it("🔴 esconder é `sr-only` num `<span>`, nunca numa `<table>`", () => {
    const doc = render([ROW_SP]);
    const alvo = doc.querySelector('a[href="/uf/SP"]')?.getAttribute("aria-describedby") as string;
    const bloco = doc.getElementById(alvo) as HTMLElement;

    expect(bloco.tagName.toLowerCase()).toBe("span");
    expect(bloco.className).toContain("sr-only");
    // Par do caso acima: nenhuma tabela nova entrou escondida por esta rodada.
    expect(doc.querySelectorAll("table.sr-only").length).toBe(0);
  });

  it("🔴 UF sem candidaturas e sem cauda ⇒ nem `<span>` nem `aria-describedby`", () => {
    const doc = render([ROW_VAZIA]);
    const link = doc.querySelector('a[href="/uf/AC"]');
    expect(link, "link da célula de AC não encontrado").not.toBeNull();
    expect(link?.hasAttribute("aria-describedby")).toBe(false);
    expect(doc.getElementById("uf-cand-AC")).toBeNull();
  });

  it("cada UF tem a SUA descrição — os ids não colidem entre células", () => {
    const outra: EdgeUfRow = { ...ROW_SP, sigla: "RJ", margem_projetada: -12, lider: 22 };
    const doc = render([ROW_SP, outra]);
    const ids = Array.from(doc.querySelectorAll("a[aria-describedby]")).map((a) =>
      a.getAttribute("aria-describedby"),
    );
    expect(ids).toEqual(["uf-cand-SP", "uf-cand-RJ"]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
