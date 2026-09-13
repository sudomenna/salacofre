// @vitest-environment happy-dom
/**
 * tests/unit/components/CandidatosGrid.test.tsx — RF-146 / RF-148 / RF-149.
 *
 * Dois invariantes estruturais e um de neutralidade:
 *
 *   - **lista semântica, não tabela.** Não há relação linha × coluna; as
 *     colunas são acidente de largura de viewport. `<table>` faria o leitor de
 *     tela anunciar coordenadas que não significam nada (RNF-023);
 *   - **estado vazio nomeado.** O RF-147 proíbe tanto o 500 quanto a grade
 *     vazia em silêncio. Um `items.map()` sem guarda produz exatamente a grade
 *     vazia em silêncio — é a mutação do caso (c);
 *   - **ordem por número, sempre.** Constituição § 2 e § 6. Ordenar por nome,
 *     por partido ou por "relevância" é critério editorial numa tela que não
 *     pode ter nenhum. É a mutação do caso (d), e o desempate dos 4 casos reais
 *     da Bahia é o caso (e).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CandidatosGrid } from "@/components/blocks/CandidatosGrid";
import type { CandidatoIdentidade } from "@/lib/blob/candidatos";

const ORIGINAL_BASE = process.env.BLOB_PUBLIC_BASE_URL;

// Sem base pública, `blobUrlFor` devolve `null` e NENHUM `<img>` é emitido —
// o que faria o caso (h) passar sem provar nada.
beforeAll(() => {
  process.env.BLOB_PUBLIC_BASE_URL = "https://exemplo.public.blob.vercel-storage.com";
});
afterAll(() => {
  if (ORIGINAL_BASE === undefined) delete process.env.BLOB_PUBLIC_BASE_URL;
  else process.env.BLOB_PUBLIC_BASE_URL = ORIGINAL_BASE;
});

function cand(
  numero: number,
  nome_urna: string,
  over: Partial<CandidatoIdentidade> = {},
): CandidatoIdentidade {
  return {
    sqcand: `2500025539${String(numero).padStart(2, "0")}`,
    numero,
    nome_urna,
    nome: nome_urna,
    partido: "PT",
    sob_ressalva: false,
    foto_ok: false,
    situacao_julgamento: "DEFERIDO",
    ...over,
  };
}

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function render(
  candidatos: CandidatoIdentidade[],
  textoVazio = "Nenhuma candidatura publicada para este filtro.",
): Document {
  return parse(
    <CandidatosGrid
      candidatos={candidatos}
      uf="BA"
      rotulo="Candidaturas a Deputado Federal em BA"
      textoVazio={textoVazio}
    />,
  );
}

describe("<CandidatosGrid /> — estrutura", () => {
  it("(a) a grade é <ul>/<li> com nome acessível, não <table>", () => {
    const doc = render([cand(13, "LULA"), cand(22, "ZÉ")]);

    expect(doc.querySelectorAll("table")).toHaveLength(0);
    const lista = doc.querySelector("[data-testid='candidatos-grid-lista']");
    expect(lista?.tagName).toBe("UL");
    expect(lista?.getAttribute("aria-label")).toBe("Candidaturas a Deputado Federal em BA");
    expect(lista?.querySelectorAll("li")).toHaveLength(2);
  });

  it("(b) a contagem sai do dado e é `aria-live=polite`", () => {
    const um = render([cand(13, "LULA")]).querySelector("[data-testid='candidatos-grid-contagem']");
    expect(um?.getAttribute("aria-live")).toBe("polite");
    expect(um?.textContent).toBe("1 candidatura");

    // Dois números diferentes → dois textos diferentes. Um teste que só
    // conferisse "a tela diz 2" passaria com o número cravado no JSX.
    const tres = render([cand(13, "A"), cand(22, "B"), cand(50, "C")]).querySelector(
      "[data-testid='candidatos-grid-contagem']",
    );
    expect(tres?.textContent).toBe("3 candidaturas");
  });

  it("(f) a célula declara `content-visibility` e tamanho intrínseco", () => {
    // Sem eles, cargo 6 em SP faz layout e paint de ~1.131 células de uma vez;
    // sem o intrínseco, a barra de rolagem salta durante a leitura.
    const style =
      render([cand(13, "LULA")])
        .querySelector("li")
        ?.getAttribute("style") ?? "";
    expect(style).toContain("content-visibility:auto");
    expect(style).toContain("contain-intrinsic-size");
  });
});

describe("<CandidatosGrid /> — vazio (RF-147)", () => {
  it("(c) lista vazia produz estado NOMEADO, nunca uma grade vazia muda", () => {
    const doc = render([], "Nenhuma candidatura publicada para este filtro.");

    expect(doc.querySelector("[data-testid='candidatos-grid-lista']")).toBeNull();
    expect(doc.querySelector("[data-testid='candidatos-grid-vazio']")?.textContent).toBe(
      "Nenhuma candidatura publicada para este filtro.",
    );
    expect(doc.querySelector("[data-testid='candidatos-grid-contagem']")?.textContent).toBe(
      "0 candidaturas",
    );
  });

  it("(c2) o texto do vazio vem do chamador — a grade não inventa a notícia", () => {
    // "filtro sem resultado" e "corrida não publicada" são notícias diferentes
    // para o leitor (constituição § 8); quem sabe qual é o chamador.
    const doc = render([], "Nenhuma candidatura desta corrida casa com a busca.");
    expect(doc.querySelector("[data-testid='candidatos-grid-vazio']")?.textContent).toBe(
      "Nenhuma candidatura desta corrida casa com a busca.",
    );
  });
});

describe("<CandidatosGrid /> — ordem (constituição §§ 2 e 6)", () => {
  function numerosRenderizados(doc: Document): number[] {
    return [...doc.querySelectorAll("[data-testid='candidate-card-numero']")].map((el) =>
      Number(el.textContent),
    );
  }

  it("(d) a ordem renderizada é por número, não a de entrada nem alfabética", () => {
    // Entrada embaralhada de propósito, e com nomes em ordem alfabética
    // INVERSA ao número: ordenar por nome produziria [50, 22, 13].
    const doc = render([cand(50, "ANA"), cand(13, "ZÉ"), cand(22, "MARIA")]);
    expect(numerosRenderizados(doc)).toEqual([13, 22, 50]);
  });

  it("(d2) a ordem não depende da ordem de entrada", () => {
    const a = numerosRenderizados(render([cand(13, "A"), cand(22, "B"), cand(50, "C")]));
    const b = numerosRenderizados(render([cand(50, "C"), cand(13, "A"), cand(22, "B")]));
    expect(a).toEqual(b);
  });

  it("(e) número repetido desempata por `sqcand`, de forma determinística", () => {
    // Os 4 casos reais da Bahia: `(cargo, uf, numero)` NÃO é única nem na fonte
    // oficial (ADR-0042 item 5), e dois pares têm o mesmo nome no mesmo número.
    // Sem desempate, a ordem sairia da ordem de leitura do banco.
    const marliA = cand(2727, "MARLI LIMA", { sqcand: "250000111111" });
    const marliB = cand(2727, "MARLI LIMA", { sqcand: "250000222222" });

    const ordem1 = [...render([marliA, marliB]).querySelectorAll("[data-sqcand]")].map((el) =>
      el.getAttribute("data-sqcand"),
    );
    const ordem2 = [...render([marliB, marliA]).querySelectorAll("[data-sqcand]")].map((el) =>
      el.getAttribute("data-sqcand"),
    );

    expect(ordem1).toEqual(["250000111111", "250000222222"]);
    expect(ordem2).toEqual(ordem1);
  });

  it("(g) a grade não muta o array que recebeu", () => {
    const entrada = [cand(50, "C"), cand(13, "A")];
    const copia = [...entrada];
    render(entrada);
    expect(entrada.map((c) => c.numero)).toEqual(copia.map((c) => c.numero));
  });
});

describe("<CandidatosGrid /> — carregamento de imagem", () => {
  it("(h) só as primeiras células são `eager`; o resto é `lazy`", () => {
    const muitos = Array.from({ length: 9 }, (_, i) =>
      cand(10 + i, `C${i}`, { foto_ok: true, sqcand: `25000000000${i}` }),
    );
    const doc = parse(
      <CandidatosGrid candidatos={muitos} uf="SP" rotulo="Candidaturas" textoVazio="vazio" />,
    );
    const loadings = [...doc.querySelectorAll("img")].map((i) => i.getAttribute("loading"));

    // Incondicional de propósito: se a base pública sumir, o array fica vazio
    // e ESTA asserção quebra, em vez de o caso passar sem provar nada.
    expect(loadings).toEqual([
      "eager",
      "eager",
      "eager",
      "eager",
      "eager",
      "eager",
      "lazy",
      "lazy",
      "lazy",
    ]);
  });
});
