// @vitest-environment happy-dom
/**
 * tests/unit/state/store-por-pagina.test.ts
 *
 * **Duas avaliações do módulo, UMA store** — no navegador.
 *
 * ## Por que este arquivo é diferente de todos os outros testes de store
 *
 * Nenhum teste de unidade desta base poderia ter pego o defeito que
 * `lib/state/store-por-pagina.ts` remove, e o motivo é simples: no processo de
 * teste o módulo é avaliado **uma vez**, então a store é única por construção e
 * a pergunta nunca é feita. O navegador é que pode avaliar o mesmo módulo duas
 * vezes (cópia em dois pacotes, HMR, ids divergentes) — e aí quem escreve e
 * quem lê ficam em stores diferentes, sem erro, sem console, sem sintoma além
 * de "o evento acontece e a outra ponta não reage".
 *
 * `vi.resetModules()` + `import()` de novo é exatamente essa reavaliação,
 * dentro do processo de teste. É o único instrumento aqui que discrimina: sem a
 * proteção, o segundo `import()` devolve uma store NOVA, e o primeiro caso
 * abaixo reprova.
 *
 * ## Mutações que estes casos matam (aplicadas de verdade em 2026-09-20)
 *
 *   1. `useHoverStore = create(...)` direto, sem `storeUnicaPorPagina`
 *      → morre "(a) duas avaliações devolvem A MESMA store".
 *   2. `Symbol.for(...)` trocado por `Symbol(...)` em `store-por-pagina.ts`
 *      (símbolo novo a cada avaliação — proteção com cara de proteção e
 *      nenhum efeito) → morre o mesmo caso.
 *
 * A mutação (3) — registrar também no servidor — é morta pelo arquivo irmão
 * `store-por-pagina.servidor.test.ts`, que roda em ambiente `node`.
 *
 * ## Instrumento
 *
 * `vi.resetModules()` limpa o cache de módulos do Vitest, mas NÃO limpa o
 * `globalThis` — que é justamente o ponto: é ele que faz a segunda avaliação
 * reencontrar a primeira. Por isso o `beforeEach` esvazia o registro à mão
 * (`__limparRegistroDeStoresParaTestes`), senão uma store vaza de um caso para
 * o seguinte e "a mesma instância" passaria a ser verdade por contaminação.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  __limparRegistroDeStoresParaTestes,
  storeUnicaPorPagina,
} from "@/lib/state/store-por-pagina";

/** Reavalia o módulo do zero e devolve o que ele exporta. */
async function reavaliar<T>(carregar: () => Promise<T>): Promise<T> {
  vi.resetModules();
  return carregar();
}

beforeEach(() => {
  __limparRegistroDeStoresParaTestes();
});

describe("useHoverStore — a ponte entre a tabela e o mapa (lados opostos de next/dynamic)", () => {
  it("(a) duas avaliações do módulo devolvem A MESMA store [mutação: remover storeUnicaPorPagina, ou Symbol() no lugar de Symbol.for]", async () => {
    const primeira = (await reavaliar(() => import("@/lib/state/hover-store"))).useHoverStore;
    const segunda = (await reavaliar(() => import("@/lib/state/hover-store"))).useHoverStore;

    // Controle do instrumento: `resetModules` de fato reavaliou o módulo. Se o
    // Vitest passasse a servir o módulo do cache, `toBe` passaria sem provar
    // nada — o teste inteiro viraria tautologia.
    expect(
      (await reavaliar(() => import("@/lib/state/store-por-pagina"))).storeUnicaPorPagina,
      "resetModules não reavaliou nada — o instrumento deste arquivo está cego",
    ).not.toBe(storeUnicaPorPagina);

    expect(primeira, "a segunda cópia do módulo criou uma store própria").toBe(segunda);
  });

  it("(b) o que a PRIMEIRA cópia escreve, a SEGUNDA lê — é o defeito de produção, ao contrário", async () => {
    const daTabela = (await reavaliar(() => import("@/lib/state/hover-store"))).useHoverStore;
    const doMapa = (await reavaliar(() => import("@/lib/state/hover-store"))).useHoverStore;

    // A tabela escreve pela referência dela (o que `<UfHoverLink>` faz no foco).
    daTabela.getState().setHovered({ type: "uf", sigla: "RS" }, "table");

    // O mapa lê pela referência dele (o selector de `_NationalChoroplethMapImpl`).
    const estado = doMapa.getState();
    expect(estado.source, "o mapa não viu a origem que a tabela escreveu").toBe("table");
    expect(
      estado.hovered,
      "o mapa não viu a UF que a tabela acendeu — é exatamente o sintoma silencioso",
    ).toEqual({ type: "uf", sigla: "RS" });

    // E a volta: limpar por uma referência apaga para a outra.
    doMapa.getState().clear();
    expect(daTabela.getState().hovered).toBeNull();
  });

  it("(c) quem ASSINA por uma referência é notificado pela outra", async () => {
    const daTabela = (await reavaliar(() => import("@/lib/state/hover-store"))).useHoverStore;
    const doMapa = (await reavaliar(() => import("@/lib/state/hover-store"))).useHoverStore;

    // Identidade de objeto não bastaria se o Zustand guardasse os assinantes
    // fora da store; o que o mapa precisa é ser ACORDADO, não só ler igual.
    const vistos: Array<string | null> = [];
    const cancelar = doMapa.subscribe((s) =>
      vistos.push(s.hovered?.type === "uf" ? s.hovered.sigla : null),
    );

    daTabela.getState().setHovered({ type: "uf", sigla: "PB" }, "table");
    daTabela.getState().clear();
    cancelar();

    expect(vistos, "a assinatura de uma cópia não ouviu a escrita da outra").toEqual(["PB", null]);
  });
});

describe("useMunicipioSheetStore — o mapa de UF abre a folha que o explorador desenha", () => {
  it("duas avaliações devolvem a mesma store, e o clique do mapa chega ao explorador", async () => {
    const doMapa = (await reavaliar(() => import("@/components/shared/municipio-sheet-store")))
      .useMunicipioSheetStore;
    const doExplorador = (
      await reavaliar(() => import("@/components/shared/municipio-sheet-store"))
    ).useMunicipioSheetStore;

    expect(doMapa).toBe(doExplorador);

    doMapa.getState().select("4314902");
    expect(doExplorador.getState().codIbge, "a folha não soube qual município o mapa abriu").toBe(
      "4314902",
    );
  });
});

describe("storeUnicaPorPagina — o contrato cru", () => {
  it("chaves diferentes não se misturam", () => {
    const a = storeUnicaPorPagina("a", () => ({ nome: "a" }));
    const b = storeUnicaPorPagina("b", () => ({ nome: "b" }));
    expect(a).not.toBe(b);
    expect(storeUnicaPorPagina("a", () => ({ nome: "outro" }))).toBe(a);
  });

  it("a fábrica roda UMA vez por chave — a segunda avaliação não paga o preço nem zera o estado", () => {
    const fabrica = vi.fn(() => ({ n: Math.random() }));
    const primeira = storeUnicaPorPagina("contagem", fabrica);
    const segunda = storeUnicaPorPagina("contagem", fabrica);

    expect(fabrica).toHaveBeenCalledTimes(1);
    expect(primeira).toBe(segunda);
  });

  it("valor `undefined` não é recriado a cada avaliação [mutação: `get(chave) !== undefined` no lugar de `has`]", () => {
    const fabrica = vi.fn(() => undefined);
    storeUnicaPorPagina("vazia", fabrica);
    storeUnicaPorPagina("vazia", fabrica);
    expect(fabrica).toHaveBeenCalledTimes(1);
  });
});
