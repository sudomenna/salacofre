// @vitest-environment happy-dom
/**
 * tests/unit/components/BaseToggle.test.tsx
 *
 * Unit tests do `<BaseToggle />` — segmented control que troca o denominador
 * dos termômetros de candidato (S07/Fase 5, decisão E2b).
 *
 * O que estes testes travam:
 *   - o controle é um par de links reais (zero JS: o estado mora na URL);
 *   - o href preserva a rota atual e os demais search params, mexendo só em
 *     `base`;
 *   - a base default (`votaveis`) SAI da URL — o link default aponta para a
 *     mesma URL do canonical (RNF-027);
 *   - o item ativo é marcado com `aria-current`, e NUNCA com `aria-pressed`
 *     (atributo não permitido em `role="link"` — reprovaria em axe-core
 *     `aria-allowed-attr`, gate de RNF-022);
 *   - o rótulo vem de `denominadorLabel`, então nunca diz "válidos" para
 *     `votaveis` (o `pvap` do TSE inclui anulados e sub judice).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BaseToggle, hrefForBase, parseBaseParam } from "@/components/atoms/controls/BaseToggle";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function links(doc: Document): HTMLAnchorElement[] {
  return Array.from(doc.querySelectorAll("[data-testid='base-toggle'] a"));
}

describe("parseBaseParam()", () => {
  it("(a) ausente, vazio ou inválido → 'votaveis' (a tela abre em votáveis)", () => {
    expect(parseBaseParam(undefined)).toBe("votaveis");
    expect(parseBaseParam("")).toBe("votaveis");
    expect(parseBaseParam("validos")).toBe("votaveis");
    expect(parseBaseParam("VOTAVEIS")).toBe("votaveis");
    expect(parseBaseParam("eleitores_instalados")).toBe("votaveis");
  });

  it("(b) 'comparecimento' é o único valor que muda a base", () => {
    expect(parseBaseParam("comparecimento")).toBe("comparecimento");
  });

  it("(c) param repetido usa o primeiro valor e não quebra", () => {
    expect(parseBaseParam(["comparecimento", "votaveis"])).toBe("comparecimento");
    expect(parseBaseParam(["lixo"])).toBe("votaveis");
    expect(parseBaseParam([])).toBe("votaveis");
  });
});

describe("hrefForBase()", () => {
  it("(d) a base default sai da URL; a segunda base entra como ?base=", () => {
    expect(hrefForBase("/", "votaveis")).toBe("/");
    expect(hrefForBase("/", "comparecimento")).toBe("/?base=comparecimento");
    expect(hrefForBase("/uf/SP", "comparecimento")).toBe("/uf/SP?base=comparecimento");
  });

  it("(e) preserva os demais search params e descarta o `base` de entrada", () => {
    expect(
      hrefForBase("/governador", "comparecimento", { status: "vai_2t", base: "votaveis" }),
    ).toBe("/governador?status=vai_2t&base=comparecimento");
    expect(hrefForBase("/governador", "votaveis", { status: "vai_2t" })).toBe(
      "/governador?status=vai_2t",
    );
  });

  it("(f) é determinístico: ordem das chaves não depende da ordem do objeto", () => {
    const a = hrefForBase("/uf/SP", "comparecimento", { z: "1", a: "2" });
    const b = hrefForBase("/uf/SP", "comparecimento", { a: "2", z: "1" });
    expect(a).toBe(b);
    expect(a).toBe("/uf/SP?a=2&z=1&base=comparecimento");
  });

  it("(g) params repetidos e `undefined` não corrompem a URL", () => {
    expect(hrefForBase("/", "votaveis", { t: ["1", "2"], vazio: undefined })).toBe("/?t=1&t=2");
  });
});

describe("<BaseToggle />", () => {
  it("(h) renderiza dois links reais — zero JS, estado na URL", () => {
    const doc = parse(<BaseToggle value="votaveis" pathname="/" />);
    const as = links(doc);
    expect(as.length).toBe(2);
    expect(as.map((a) => a.getAttribute("href"))).toEqual(["/", "/?base=comparecimento"]);
    expect(as.map((a) => a.getAttribute("data-base"))).toEqual(["votaveis", "comparecimento"]);
  });

  it("(i) href preserva a rota atual em cada uma das rotas do hero", () => {
    for (const pathname of ["/", "/uf/SP", "/uf/SP/governador", "/governador"]) {
      const doc = parse(<BaseToggle value="votaveis" pathname={pathname} />);
      const as = links(doc);
      expect(as[0]?.getAttribute("href")).toBe(pathname);
      expect(as[1]?.getAttribute("href")).toBe(`${pathname}?base=comparecimento`);
    }
  });

  it("(j) marca o ativo com aria-current e só ele", () => {
    const votaveis = links(parse(<BaseToggle value="votaveis" pathname="/" />));
    expect(votaveis[0]?.getAttribute("aria-current")).toBe("true");
    expect(votaveis[1]?.getAttribute("aria-current")).toBeNull();
    expect(votaveis[0]?.getAttribute("data-active")).toBe("true");

    const comp = links(parse(<BaseToggle value="comparecimento" pathname="/" />));
    expect(comp[0]?.getAttribute("aria-current")).toBeNull();
    expect(comp[1]?.getAttribute("aria-current")).toBe("true");
    expect(comp[1]?.getAttribute("data-active")).toBe("true");
  });

  it("(k) NÃO emite aria-pressed — atributo proibido em role=link (RNF-022/axe)", () => {
    const doc = parse(<BaseToggle value="comparecimento" pathname="/uf/SP" />);
    expect(doc.querySelectorAll("[aria-pressed]").length).toBe(0);
  });

  it("(l) o grupo é anunciado e declara a base ativa", () => {
    const doc = parse(<BaseToggle value="comparecimento" pathname="/" />);
    const group = doc.querySelector("[data-testid='base-toggle']");
    // <nav> nomeado — mesma forma de um controle de paginação (ver cabeçalho
    // do componente). `role="group"` implicaria <fieldset> pelo Biome.
    expect(group?.tagName).toBe("NAV");
    expect(group?.getAttribute("aria-label")).toBe("Base do percentual dos candidatos");
    expect(group?.getAttribute("data-value")).toBe("comparecimento");
  });

  it("(m) rótulos vêm de denominadorLabel — nunca a palavra 'válidos'", () => {
    const doc = parse(<BaseToggle value="votaveis" pathname="/" />);
    const texto = doc.body.textContent ?? "";
    expect(texto).toContain("% dos votos a votáveis");
    expect(texto).toContain("% do comparecimento");
    expect(texto.toLowerCase()).not.toContain("válidos");
  });

  it("(n) preserva o ?status= de /governador nos dois links", () => {
    const doc = parse(
      <BaseToggle value="votaveis" pathname="/governador" searchParams={{ status: "chamadas" }} />,
    );
    const as = links(doc);
    expect(as[0]?.getAttribute("href")).toBe("/governador?status=chamadas");
    expect(as[1]?.getAttribute("href")).toBe("/governador?status=chamadas&base=comparecimento");
  });
});
