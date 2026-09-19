/**
 * tests/unit/scripts/gen-uf-flags.test.ts — o gerador do sprite de bandeiras.
 *
 * O que ele existe para impedir é um defeito que **só aparece em runtime, numa
 * bandeira**: 27 SVGs exportados por editores diferentes trazem `id="a"`,
 * `id="clip0"`, `id="path1"` — os mesmos nomes. Colados no mesmo documento, o
 * primeiro `#a` vence e uma bandeira passa a pintar com o gradiente de outra.
 * Ninguém liga a causa ao efeito.
 *
 * Por isso o teste central é uma **colisão de verdade**: dois arquivos com o
 * mesmo `id`, normalizados, e a exigência de que as referências de cada um
 * apontem para o seu.
 */

import { describe, expect, it } from "vitest";

import {
  extrairCorpo,
  gerarModulo,
  minificar,
  prefixarIds,
  recusarPerigo,
} from "@/scripts/gen-uf-flags";

describe("gen-uf-flags — 🔴 a colisão de `id` entre bandeiras", () => {
  // 🔴 MUTAÇÃO: fazer `prefixarIds` devolver `svg` sem tocar em nada. Os dois
  // arquivos passam a declarar `id="a"` no mesmo documento e o `fill` de RJ
  // resolve para o gradiente de SP.
  it('dois arquivos com `id="a"` deixam de colidir depois de normalizados', () => {
    const bruto = '<linearGradient id="a"><stop/></linearGradient><path fill="url(#a)" d="M0 0"/>';

    const sp = prefixarIds(bruto, "SP");
    const rj = prefixarIds(bruto, "RJ");

    expect(sp).toContain('id="ufflag-SP-a"');
    expect(sp).toContain("url(#ufflag-SP-a)");
    expect(rj).toContain('id="ufflag-RJ-a"');
    expect(rj).toContain("url(#ufflag-RJ-a)");

    // O que importa não é só o prefixo existir: é que, juntos, não haja mais um
    // único `id` repetido no documento.
    const juntos = sp + rj;
    const ids = [...juntos.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size, `ids repetidos em ${ids.join(",")}`).toBe(ids.length);
    expect(juntos).not.toMatch(/\bid="a"/);
    expect(juntos).not.toContain("url(#a)");
  });

  it("persegue também `href` e `xlink:href` locais", () => {
    const bruto = '<path id="c" d="M0 0"/><use href="#c"/><use xlink:href="#c"/>';
    const out = prefixarIds(bruto, "MG");
    expect(out).toContain('href="#ufflag-MG-c"');
    expect(out).toContain('xlink:href="#ufflag-MG-c"');
    expect(out).not.toMatch(/href="#c"/);
  });

  it("não mexe em arquivo sem `id` nenhum", () => {
    const bruto = '<path d="M0 0h1v1z"/>';
    expect(prefixarIds(bruto, "TO")).toBe(bruto);
  });
});

describe("gen-uf-flags — recusa o que não é geometria", () => {
  // 🔴 MUTAÇÃO: esvaziar a lista de `proibidos`. O sprite é embutido no MESMO
  // documento que serve a apuração, e a página não tem nenhum JavaScript de
  // aplicação justamente para não ter essa superfície.
  it.each([
    ['<script>alert(1)</script><path d="M0"/>', "script"],
    ['<path onload="x()" d="M0"/>', "evento"],
    ['<a href="javascript:x()"/>', "javascript:"],
    ["<foreignObject><div/></foreignObject>", "foreignObject"],
    ['<image href="https://exemplo.com/a.png"/>', "referência externa"],
  ])("recusa %s", (svg) => {
    expect(() => recusarPerigo(svg, "XX")).toThrow();
  });

  it("aceita geometria pura", () => {
    expect(() => recusarPerigo('<path d="M0 0h1v1z" fill="#009"/>', "XX")).not.toThrow();
  });
});

describe("gen-uf-flags — extração e minificação", () => {
  it("exige `viewBox` — sem ele o `<use>` não sabe escalar", () => {
    expect(() => extrairCorpo('<svg xmlns="x"><path/></svg>', "AC")).toThrow(/viewBox/);
  });

  it("devolve o miolo e o `viewBox` do arquivo, não o alvo normalizado", () => {
    const { viewBox, corpo } = extrairCorpo(
      '<svg viewBox="0 0 700 1000"><path d="M0"/></svg>',
      "AC",
    );
    expect(viewBox).toBe("0 0 700 1000");
    expect(corpo).toBe('<path d="M0"/>');
  });

  it("minificar tira comentário e metadado, e preserva o traçado", () => {
    const out = minificar(
      '<!-- feito no editor --> <metadata>x</metadata>\n  <path d="M0 0h1v1z"/>  ',
    );
    expect(out).toBe('<path d="M0 0h1v1z"/>');
  });
});

describe("gen-uf-flags — o módulo gerado", () => {
  it("com fonte vazia produz um mapa vazio, e o cabeçalho diz 0 de 27", () => {
    // Este É o estado de 2026-09-18, e ele tem de compilar e degradar — o que
    // não pode é o COMANDO sair com 0 (isso é verificado no próprio script,
    // que falha enquanto faltar bandeira).
    const src = gerarModulo([]);
    expect(src).toContain("ARQUIVO GERADO");
    expect(src).toContain("0 de 27 bandeiras");
    expect(src).toMatch(/UF_FLAGS[\s\S]*Object\.freeze\(\{\s*\n?\s*\}\)/);
  });

  it("serializa cada bandeira com `viewBox` e corpo escapados", () => {
    const src = gerarModulo([
      { sigla: "SP", viewBox: "0 0 7 10", corpo: '<path d="M0"/>', bytes: 14 },
    ]);
    expect(src).toContain('SP: { viewBox: "0 0 7 10", corpo: "<path d=\\"M0\\"/>" }');
  });
});
