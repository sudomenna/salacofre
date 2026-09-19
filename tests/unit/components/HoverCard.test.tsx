// @vitest-environment happy-dom
/**
 * tests/unit/components/HoverCard.test.tsx
 *
 * `<HoverCard />` — tooltip do mapa (ADR-0025, Bloco 1).
 *
 * O que estes testes travam:
 *   - o cartão é `aria-hidden` e `pointer-events: none`: ele espelha o que o
 *     hover do mouse já mostrou. Quem navega por teclado ou leitor de tela
 *     recebe a mesma informação pela tabela que acompanha o mapa (RNF-023) —
 *     não por um tooltip preso a um ponteiro que essa pessoa não tem;
 *   - o par editorial Parcial (tinta) × Projeção (ocre), com o cabeçalho
 *     "Proj." em `--accent-text` (5.12:1) e não `--accent-strong` (4.21:1);
 *   - projeção ausente vira travessão, nunca "undefined" ou NaN;
 *   - o arquivo é Server Component (sem estado nem evento).
 */

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HoverCard } from "@/components/atoms/overlays/HoverCard";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

const ROWS = [
  { name: "Lula", color: "var(--color-cand-1)", pct: 47.1, proj: 48.04 },
  { name: "Flávio", color: "var(--color-cand-2)", pct: 41.9 },
];

function render(extra: Record<string, unknown> = {}) {
  return parse(
    <HoverCard
      x={120}
      y={80}
      kicker="Unidade federativa"
      title="Minas Gerais"
      rows={ROWS}
      {...extra}
    />,
  );
}

/** Código do componente sem comentários — o cabeçalho fala de "use client",
 *  `useState` etc. justamente para explicar por que eles não estão lá. */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("<HoverCard />", () => {
  it("(a) posiciona pelo offset do ponteiro e não intercepta o mouse", () => {
    const el = render().querySelector("[data-testid='hover-card']");
    expect(el?.getAttribute("style")).toContain("left:120px");
    expect(el?.getAttribute("style")).toContain("top:80px");
    expect(el?.getAttribute("class")).toContain("pointer-events-none");
  });

  it("(b) é aria-hidden — a rota acessível é a tabela do mapa (RNF-023)", () => {
    expect(render().querySelector("[data-testid='hover-card']")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("(c) flip inverte o cartão para a esquerda do ponteiro", () => {
    expect(render().querySelector("[data-testid='hover-card']")?.getAttribute("style")).toContain(
      "translate(12px, 12px)",
    );
    const flipped = render({ flip: true }).querySelector("[data-testid='hover-card']");
    expect(flipped?.getAttribute("data-flip")).toBe("true");
    expect(flipped?.getAttribute("style")).toContain("translate(calc(-100% - 12px), 12px)");
  });

  it("(d) título, kicker e apurado arredondado", () => {
    const doc = render({ apurado: 71.4 });
    expect(doc.querySelector("[data-testid='hover-card-title']")?.textContent).toBe("Minas Gerais");
    expect(doc.body.textContent).toContain("Unidade federativa");
    expect(doc.querySelector("[data-testid='hover-card-apurado']")?.textContent).toBe(
      "71% apurado",
    );
  });

  it("(e) apurado fora de [0, 100] é clampeado; ausente não renderiza", () => {
    expect(
      render({ apurado: 140 }).querySelector("[data-testid='hover-card-apurado']")?.textContent,
    ).toBe("100% apurado");
    expect(render().querySelector("[data-testid='hover-card-apurado']")).toBeNull();
  });

  it("(f) parcial em pt-BR e projeção ausente vira travessão", () => {
    const doc = render();
    const parcial = Array.from(doc.querySelectorAll("[data-testid='hover-card-parcial']"));
    const proj = Array.from(doc.querySelectorAll("[data-testid='hover-card-proj']"));
    expect(parcial.map((e) => e.textContent)).toEqual(["47,1%", "41,9%"]);
    expect(proj.map((e) => e.textContent)).toEqual(["48,0%", "—"]);
  });

  it("(g) a coluna de projeção usa --accent-text, nunca --accent-strong", () => {
    const html = renderToStaticMarkup(<HoverCard x={0} y={0} title="MG" rows={ROWS} />);
    expect(html).toContain("var(--accent-text)");
    expect(html).not.toContain("var(--accent-strong)");
  });

  it("(h) a cor de cada linha vem por prop (o átomo não conhece partido)", () => {
    const html = renderToStaticMarkup(<HoverCard x={0} y={0} title="MG" rows={ROWS} />);
    expect(html).toContain("var(--color-cand-1)");
    expect(html).toContain("var(--color-cand-2)");
  });

  it("(i) lista vazia não quebra", () => {
    expect(render({ rows: [] }).querySelector("[data-testid='hover-card-parcial']")).toBeNull();
  });

  it('(k) sem parcial em nenhuma linha, a coluna "Parcial" some do cartão', () => {
    // O payload nacional só tem parcial agregada por UF (`pct_apurado`, que vai
    // no cabeçalho), não por candidato — `EdgeUfRow.top_candidatos` carrega só
    // `pct_projetado`. Uma coluna que só renderiza travessão promete um dado
    // que o produto não tem; ela desaparece, e o cabeçalho "Proj." fica.
    const doc = parse(
      <HoverCard
        x={0}
        y={0}
        title="Bahia"
        rows={[
          { name: "Lula", color: "var(--party-pt)", proj: 52.3 },
          { name: "Flávio", color: "var(--party-pl)", proj: 41.2 },
        ]}
      />,
    );
    expect(doc.body.textContent).not.toContain("Parcial");
    expect(doc.body.textContent).toContain("Proj.");
    expect(doc.querySelectorAll("[data-testid='hover-card-parcial']").length).toBe(0);
    expect(doc.querySelectorAll("[data-testid='hover-card-proj']").length).toBe(2);
  });

  it("(l) parcial não-finita (NaN) conta como ausente", () => {
    const doc = parse(
      <HoverCard
        x={0}
        y={0}
        title="Bahia"
        rows={[{ name: "Lula", color: "var(--party-pt)", pct: Number.NaN, proj: 52.3 }]}
      />,
    );
    expect(doc.body.textContent).not.toContain("Parcial");
  });

  it("(m) basta UMA linha com parcial para a coluna existir", () => {
    const doc = parse(
      <HoverCard
        x={0}
        y={0}
        title="Bahia"
        rows={[
          { name: "Lula", color: "var(--party-pt)", pct: 47.1, proj: 52.3 },
          { name: "Flávio", color: "var(--party-pl)", proj: 41.2 },
        ]}
      />,
    );
    expect(doc.body.textContent).toContain("Parcial");
    // a linha sem parcial mostra travessão, não some
    expect(doc.querySelectorAll("[data-testid='hover-card-parcial']").length).toBe(2);
  });

  it("(j) é Server Component e não tem hex literal", () => {
    const src = codeOf("components/atoms/overlays/HoverCard.tsx");
    expect(src).not.toContain('"use client"');
    expect(
      renderToStaticMarkup(<HoverCard x={0} y={0} title="MG" rows={ROWS} apurado={50} />),
    ).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("(n) 🔴 com as 5 colunas cheias, o nome recebe um PISO de largura — não colapsa a uma letra [mutação: voltar a coluna do nome para `1fr` puro]", () => {
    // 2026-09-18 (achado do dono, com captura de `/`): `1fr` é fração do que
    // SOBRAR, e com 4 colunas `auto` numéricas (Partido/Votos/Parcial/Proj.)
    // não sobrava nada — "FLAVIO BOLSONARO" virava "F". `1fr` funcionava com
    // as 2 colunas originais (nome + Proj.) e ninguém reavaliou quando o
    // balão cresceu para 5. O remédio é `minmax(NOME_MIN_PX, 1fr)`: o piso
    // vence a fração antes de qualquer coluna `auto` levar a sobra.
    const html = renderToStaticMarkup(
      <HoverCard
        x={0}
        y={0}
        title="Rondônia (RO)"
        apurado={12}
        rows={[
          {
            name: "FLAVIO BOLSONARO",
            color: "var(--party-pl-text)",
            partido: "PL",
            votos: 58149,
            pct: 55.5,
            proj: 53.5,
          },
        ]}
      />,
    );
    // As 5 colunas realmente estão presentes — senão o teste "passaria" sem
    // nunca ter exercitado o cenário de aperto que o defeito precisa.
    expect(html).toContain('data-testid="hover-card-partido"');
    expect(html).toContain('data-testid="hover-card-votos"');
    expect(html).toContain('data-testid="hover-card-parcial"');
    expect(html).toContain('data-testid="hover-card-proj"');
    // A coluna do nome tem PISO em px — não é `1fr` puro competindo sozinho
    // pela sobra contra 4 colunas `auto`.
    expect(html).toMatch(/grid-template-columns:minmax\(\d+px, 1fr\) auto auto auto auto/);
  });
});

/**
 * 2026-09-18 (3ª leva do dono, com captura de `Minas Gerais (MG)`) —
 * fidelidade ao tooltip do mapa eleitoral do NYT.
 *
 * Três pedidos, e os dois primeiros têm a MESMA causa que o nome cortado de
 * horas antes: a coluna do nome era `1fr` num cartão que sempre ocupava o
 * `maxWidth`. Espremia o nome a uma letra quando as colunas numéricas eram
 * muitas; abria um vão de ~200px entre "LULA" e "PT" quando o nome era curto.
 * Piso (`minmax`) resolveu uma ponta; `width: max-content` resolve a outra.
 *
 * O terceiro é divergência real da referência: no NYT `PARTY`/`Dem.`/`Rep.`
 * têm as bordas ESQUERDAS alinhadas — só as colunas numéricas vão à direita.
 */
describe("<HoverCard /> — fidelidade ao tooltip do NYT", () => {
  const LINHA = {
    name: "LULA",
    color: "var(--party-pt-text)",
    partido: "PT",
    votos: 1_116_005,
    pct: 28.7,
    proj: 33.3,
  };

  function render() {
    return renderToStaticMarkup(
      <HoverCard x={0} y={0} title="Minas Gerais (MG)" apurado={32} rows={[LINHA]} />,
    );
  }

  it('o cabeçalho da coluna de partido é "Part.", não "Partido"', () => {
    const html = render();
    expect(html).toContain("Part.");
    // O rótulo longo não pode sobreviver em lugar nenhum do cartão: era ele
    // que empurrava a largura da coluna e afastava a sigla do nome.
    expect(html).not.toContain(">Partido<");
  });

  it("a coluna de partido alinha à ESQUERDA; as numéricas seguem à direita", () => {
    const html = render();
    // A célula da sigla encosta no nome (esquerda) — o vão da captura do dono.
    expect(html).toMatch(/data-testid="hover-card-partido"[^>]*style="[^"]*text-align:left/);
    // 🔴 Controle: número alinhado à esquerda perde a coluna decimal, que é o
    // que torna a tabela comparável de relance. `HEAD_STYLE` é compartilhado
    // pelos quatro cabeçalhos — mutá-lo no lugar levaria os números junto, e
    // é exatamente isso que esta asserção existe para pegar.
    expect(html).toMatch(/data-testid="hover-card-votos"[^>]*style="[^"]*text-align:right/);
    expect(html).toMatch(/data-testid="hover-card-parcial"[^>]*style="[^"]*text-align:right/);
    expect(html).toMatch(/data-testid="hover-card-proj"[^>]*style="[^"]*text-align:right/);
  });

  it("o cartão encolhe para o conteúdo em vez de esticar até o teto", () => {
    const html = render();
    expect(html).toMatch(/width:max-content/);
    // O piso e o teto continuam existindo: `max-content` sem eles deixaria o
    // cartão sair da viewport com um nome longo.
    expect(html).toMatch(/min-width:220px/);
    expect(html).toMatch(/max-width:min\(92vw/);
  });
});

/**
 * 2026-09-18 — as três diferenças restantes em relação ao tooltip do NYT,
 * levantadas por mim na comparação com as capturas e aprovadas pelo dono.
 *
 * A terceira é a que importa além da estética: o negrito na linha 0 existia
 * **independente de a UF ter sido chamada**. Liderar a projeção com 12%
 * apurado não é vencer, e o negrito era a única marca visual daquela linha —
 * ênfase sem fato por trás (constituição § 1). Nenhum teste cobria isso, que é
 * por que sobreviveu tanto tempo.
 */
describe("<HoverCard /> — fio, sangria e o negrito sem fato", () => {
  const LIDER = { name: "LULA", color: "var(--party-pt-text)", partido: "PT", proj: 33.3 };
  const SEGUNDO = { name: "FLAVIO", color: "var(--party-pl-text)", partido: "PL", proj: 33.1 };
  const TERCEIRO = { name: "CAIADO", color: "var(--party-psd-text)", partido: "PSD", proj: 14.7 };

  /** UF ainda NÃO chamada — o caso comum durante a apuração. */
  function semChamada() {
    return renderToStaticMarkup(
      <HoverCard
        x={0}
        y={0}
        title="Minas Gerais (MG)"
        apurado={32}
        rows={[LIDER, SEGUNDO, TERCEIRO]}
      />,
    );
  }

  /** UF chamada: o caller resolveu o par (fundo, tinta) para a linha 0. */
  function comChamada() {
    return renderToStaticMarkup(
      <HoverCard
        x={0}
        y={0}
        title="Minas Gerais (MG)"
        apurado={100}
        rows={[
          { ...LIDER, winnerBackground: "var(--party-pt-chip)", winnerInk: "var(--party-pt-ink)" },
          SEGUNDO,
          TERCEIRO,
        ]}
      />,
    );
  }

  it("🔴 sem chamada, NENHUM nome fica em negrito — nem o do líder", () => {
    const html = semChamada();
    expect(html).not.toContain("font-weight:600");
  });

  it("com chamada, o negrito aparece — e só uma vez", () => {
    const html = comChamada();
    expect(html.match(/font-weight:600/g)).toHaveLength(1);
  });

  it("a faixa do vencedor cobre SÓ a coluna do nome e sangra à esquerda", () => {
    const html = comChamada();
    // 🔴 `1 / 2` (só o nome), nunca `1 / -1` (linha inteira). Correção de uma
    // leitura errada minha das capturas do NYT: lá a faixa cobre
    // "✓ Hillary Clinton" e **termina antes de "Dem."** — os números seguem em
    // tinta escura sobre o fundo do cartão. Pintar a linha toda trocaria a cor
    // de quatro colunas de números e afogaria a comparação.
    expect(html).toMatch(/grid-column:1 \/ 2;grid-row:2;background:var\(--party-pt-chip\)/);
    // Sangra só à ESQUERDA, até a borda do cartão; à direita para onde a
    // coluna do nome acaba.
    expect(html).toMatch(
      /background:var\(--party-pt-chip\)[^"]*margin-left:calc\(-1 \* var\(--space-3\)\)/,
    );
    expect(html).toMatch(/background:var\(--party-pt-chip\)[^"]*border-radius:0/);
    // E a tinta clara do vencedor NÃO vaza para as colunas numéricas — elas
    // estão sobre o fundo claro do cartão, onde branco seria ilegível.
    expect(html).not.toMatch(/data-testid="hover-card-votos"[^>]*var\(--party-pt-ink\)/);
    expect(html).not.toMatch(/data-testid="hover-card-proj"[^>]*var\(--party-pt-ink\)/);
  });

  it("há fio separador entre candidatos, e nenhum acima do primeiro", () => {
    const html = semChamada();
    // 3 candidatos ⇒ 2 fios (entre 1º/2º e entre 2º/3º). Um terceiro fio
    // significaria fio acima do 1º, colado no cabeçalho.
    expect(html.match(/border-top:1px solid var\(--border-hairline\)/g)).toHaveLength(2);
    // E os fios SANGRAM como a faixa do vencedor — um fio que parasse no
    // padding ficaria mais curto que a faixa logo acima dele, e a diferença
    // de largura entre os dois é justamente o que salta aos olhos.
    expect(
      html.match(/margin-inline:calc\(-1 \* var\(--space-3\)\);border-top:1px solid/g),
    ).toHaveLength(2);
  });
});
