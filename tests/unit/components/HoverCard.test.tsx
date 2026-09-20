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
    //
    // ⚠️ O padrão NÃO exige que `background` venha logo depois de `grid-row` —
    // exigia até 19/09, e quebrou quando a faixa ganhou `align-self:stretch`
    // no meio (a grade passou a centrar as células, e uma faixa centrada
    // encolheria para altura zero). Travar a ORDEM das propriedades faz o
    // teste reprovar por edição inócua e não reprova nada que importe; o que
    // importa é a faixa começar em `1 / 2` e ter a cor do partido.
    expect(html).toMatch(/grid-column:1 \/ 2;grid-row:2;[^"]*background:var\(--party-pt-chip\)/);
    // `1 / -1` na faixa do vencedor é a mutação que este caso existe para
    // matar — e ela não é pega pelo padrão acima, que casaria com o prefixo.
    expect(html).not.toMatch(/grid-column:1 \/ -1;[^"]*background:var\(--party-pt-chip\)/);
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

/**
 * 2026-09-19 (pedido do dono) — **a linha "Outros"**.
 *
 * O balão passou de 3 para 4 candidaturas mais uma linha com o agregado do
 * resto. O átomo não soma nada: quem soma é o caller (o produtor do payload,
 * no mapa nacional; `votosPorCandidatoMunicipio`, no municipal). O que se
 * trava aqui é só o que o átomo decide — e é pouco de propósito.
 *
 * 🔴 `kind` é opcional e AUSENTE ⇒ `"candidatura"`: é o que mantém válido,
 * sem uma letra de mudança, todo call-site anterior a esta data. Os testes
 * acima (que nunca passam `kind`) são, por consequência, a prova viva desse
 * default — se ele invertesse, eles quebrariam em bloco.
 */
describe("<HoverCard /> — a linha Outros", () => {
  const LIDER = {
    name: "LULA",
    color: "var(--party-pt-text)",
    partido: "PT",
    votos: 900,
    pct: 45.1,
    proj: 46.2,
  };
  const SEGUNDO = {
    name: "FLAVIO",
    color: "var(--party-pl-text)",
    partido: "PL",
    votos: 800,
    pct: 40.2,
    proj: 41.0,
  };
  const OUTROS = {
    kind: "outros" as const,
    name: "Outros (3)",
    votos: 120,
    pct: 14.7,
    proj: 12.8,
  };

  function render(rows: React.ComponentProps<typeof HoverCard>["rows"]) {
    return renderToStaticMarkup(
      <HoverCard x={0} y={0} title="Minas Gerais (MG)" apurado={32} rows={rows} />,
    );
  }

  it("🔴 põe um espaçador INVISÍVEL de 8px no lugar do ponto de cor — nunca um ponto cinza [mutação: renderizar o mesmo `<span>` de cor com um token neutro, ou apagar o ramo e deixar o espaço colapsar]", () => {
    const doc = new DOMParser().parseFromString(render([LIDER, SEGUNDO, OUTROS]), "text/html");
    const marcadores = Array.from(doc.querySelectorAll(".flex.min-w-0.items-center")).map(
      (linha) => linha.firstElementChild?.getAttribute("style") ?? "",
    );
    expect(marcadores).toHaveLength(3);
    // As duas candidaturas têm ponto de cor de verdade.
    expect(marcadores[0]).toContain("background:var(--party-pt-text)");
    expect(marcadores[1]).toContain("background:var(--party-pl-text)");
    // "Outros" ocupa os MESMOS 8px — sem eles o rótulo desalinha das linhas
    // de cima, que é o defeito que o espaçador existe para evitar.
    expect(marcadores[2]).toContain("width:8px");
    expect(marcadores[2]).toContain("height:8px");
    // 🔴 E não pinta nada: nem cor, nem raio de canto (um `border-radius` sem
    // `background` seria inofensivo, mas denuncia que o ramo copiado do ponto
    // só teve a cor removida — o espaçador não é um ponto transparente).
    expect(marcadores[2]).not.toContain("background");
    expect(marcadores[2]).not.toContain("border-radius");
  });

  it("o nome de Outros recua para --text-secondary e NÃO é itálico [mutação: `font-style:italic` no lugar da cor]", () => {
    const html = render([LIDER, SEGUNDO, OUTROS]);
    expect(html).toContain("var(--text-secondary)");
    // 🔴 Itálico lê como comentário editorial do produto sobre o número. Este
    // número é dado medido igual aos de cima — mesma base, mesmo denominador.
    expect(html).not.toContain("italic");
    // O rótulo chega pronto do caller (é ele que conhece `n_candidatos`); o
    // átomo não o fabrica nem o reescreve.
    expect(html).toContain("Outros (3)");
  });

  it('a coluna "Part." continua existindo com a linha de Outros sem partido [mutação: trocar `some` por `every` em `hasPartido`]', () => {
    const doc = new DOMParser().parseFromString(render([LIDER, SEGUNDO, OUTROS]), "text/html");
    // `hasPartido` é `some()`: a linha sem partido não derruba a coluna — só
    // não contribui para ela existir. Com `every()` a coluna sumiria inteira
    // e "PT"/"PL" iriam junto, o que é a regressão que este teste apanha.
    expect(doc.body.textContent).toContain("Part.");
    const siglas = Array.from(doc.querySelectorAll("[data-testid='hover-card-partido']")).map(
      (e) => e.textContent,
    );
    expect(siglas).toEqual(["PT", "PL", "—"]);
  });

  it("🔴 a linha Outros nunca vira vencedora chamada, nem com `winnerBackground` cravado nela [mutação: apagar `!isOutros` de `isCalledWinner`]", () => {
    // Uma UF chamada + o agregado sozinho no índice 0 (o que acontece se um
    // consumidor cortar o topo com `.slice()`): sem a guarda de `kind`, o
    // cartão declararia "✓ Outros (3)" vencedor da corrida.
    const html = render([
      {
        ...OUTROS,
        winnerBackground: "var(--party-pt-chip)",
        winnerInk: "var(--party-pt-ink)",
      },
      LIDER,
    ]);
    expect(html).not.toContain("✓");
    expect(html).not.toContain("font-weight:600");
    expect(html).not.toContain("var(--party-pt-chip)");
  });

  it("e o vencedor chamado de verdade continua marcado — uma vez só, na linha 0 [controle do teste acima]", () => {
    // Sem este controle, a guarda poderia ter sido implementada como "nunca
    // marcar ninguém" e o teste anterior passaria.
    const html = render([
      { ...LIDER, winnerBackground: "var(--party-pt-chip)", winnerInk: "var(--party-pt-ink)" },
      SEGUNDO,
      OUTROS,
    ]);
    expect(html.match(/✓/g)).toHaveLength(1);
    expect(html.match(/font-weight:600/g)).toHaveLength(1);
  });
});

/**
 * 2026-09-19 (queixa do dono: hover em RS e SC — o pé do mapa — abria o
 * cartão para baixo, onde a moldura do mapa o cortava).
 *
 * Até aqui NÃO existia lógica vertical nenhuma: o deslocamento era `+12px`
 * fixo nos dois ramos do ternário de `transform`, e só o eixo horizontal
 * virava. `flipY` é o simétrico exato — mesmo default, mesmos 12px, mesma
 * divisão de trabalho (quem mede o contêiner é o mapa; o átomo obedece).
 *
 * 🔴 O que estes testes protegem além do óbvio: que os dois casos ANTIGOS
 * saiam byte a byte idênticos. O teste (c) lá em cima é a canária — um
 * template que gere `translate(12px,12px)` sem o espaço, ou que troque a
 * ordem dos eixos, o deixa vermelho antes de qualquer um destes aqui.
 */
describe("<HoverCard /> — flip vertical", () => {
  const ROWS_2 = [{ name: "LULA", color: "var(--party-pt-text)", proj: 33.3 }];

  function card(extra: Record<string, unknown>) {
    return new DOMParser()
      .parseFromString(
        renderToStaticMarkup(<HoverCard x={40} y={300} title="RS" rows={ROWS_2} {...extra} />),
        "text/html",
      )
      .querySelector("[data-testid='hover-card']");
  }

  it("sem flipY, o cartão desce 12px e `data-flip-y` é 'false' [mutação: cravar `flipY` em true]", () => {
    const el = card({});
    expect(el?.getAttribute("data-flip-y")).toBe("false");
    expect(el?.getAttribute("style")).toContain("translate(12px, 12px)");
  });

  it("com flipY, o cartão SOBE — e o eixo horizontal não se mexe [mutação: aplicar `calc(-100% - 12px)` nos dois eixos de uma vez]", () => {
    const el = card({ flipY: true });
    expect(el?.getAttribute("data-flip-y")).toBe("true");
    expect(el?.getAttribute("data-flip")).toBe("false");
    // 🔴 X continua em `12px`: os eixos são independentes. Um ternário único
    // de quatro casos (ou um `flip || flipY`) espelharia os dois juntos.
    expect(el?.getAttribute("style")).toContain("translate(12px, calc(-100% - 12px))");
  });

  it("os dois eixos ao mesmo tempo (canto inferior direito do mapa) [mutação: ignorar `flip` quando `flipY` é true, ou vice-versa]", () => {
    const el = card({ flip: true, flipY: true });
    expect(el?.getAttribute("data-flip")).toBe("true");
    expect(el?.getAttribute("data-flip-y")).toBe("true");
    expect(el?.getAttribute("style")).toContain(
      "translate(calc(-100% - 12px), calc(-100% - 12px))",
    );
  });
});

describe("grade — cada célula declara a própria linha (2026-09-19)", () => {
  /**
   * 🔴 **O defeito que este bloco existe para impedir, reproduzido em 19/09.**
   *
   * O fio separador é `gridColumn: "1 / -1"` com `gridRow` explícito: ele OCUPA
   * a linha inteira da grade. Enquanto as células de texto eram
   * auto-posicionadas, o CSS Grid colocava primeiro os itens com linha
   * explícita (os fios, em 3, 4, 5, 6…) e só depois derramava o texto nas
   * linhas livres seguintes. O cartão saía com os QUATRO fios empilhados logo
   * abaixo do 1º colocado e nenhum entre os demais.
   *
   * Passou meses despercebido porque com 3 candidatos eram dois fios juntos —
   * lia-se como espaçamento. A 4ª linha e a de "Outros", de 19/09, tornaram o
   * empilhamento óbvio na tela.
   *
   * O teste é ESTRUTURAL de propósito: `renderToStaticMarkup` não roda layout,
   * então não dá para medir o `y` do fio. O que dá para provar é a CAUSA —
   * auto-posicionamento convivendo com posicionamento explícito na mesma
   * grade — e a relação que tem de valer: fio e texto da mesma linha carregam
   * o MESMO `grid-row`.
   */
  const CINCO = [
    { name: "PRIMEIRO", color: "#111", partido: "PL", votos: 200162, pct: 39.5, proj: 38.5 },
    { name: "SEGUNDO", color: "#222", partido: "REPUBLICANOS", votos: 182566, pct: 36, proj: 35.4 },
    { name: "TERCEIRO", color: "#333", partido: "PSD", votos: 73419, pct: 14.5, proj: 15.6 },
    { name: "QUARTO", color: "#444", partido: "MOBILIZA", votos: 30763, pct: 6.1, proj: 6 },
    { name: "Outros (1)", kind: "outros" as const, votos: 19884, pct: 3.9, proj: 4.5 },
  ];

  function gridRowDe(el: Element | null): string | null {
    return /grid-row:\s*([^;"]+)/.exec(el?.getAttribute("style") ?? "")?.[1]?.trim() ?? null;
  }

  function cartao() {
    return parse(<HoverCard x={0} y={0} title="MT" apurado={28} rows={CINCO} />);
  }

  it("toda célula de dado carrega `grid-row` — nenhuma fica no automático", () => {
    // Mutação que morre: tirar `gridRow: i + 2` de QUALQUER uma das 5 células.
    // Basta uma auto-posicionada para o derrame recomeçar.
    const doc = cartao();
    const semLinha: string[] = [];
    for (const testid of ["partido", "votos", "parcial", "proj"]) {
      for (const el of doc.querySelectorAll(`[data-testid="hover-card-${testid}"]`)) {
        if (gridRowDe(el) === null) semLinha.push(testid);
      }
    }
    expect(semLinha, "células sem grid-row explícito").toEqual([]);
  });

  it("🔴 cada fio separador tem uma linha PRÓPRIA — 4 fios, 4 linhas distintas", () => {
    // Este é o caso que reproduz o print do dono: 5 candidaturas ⇒ 4 fios. Se
    // os quatro caírem na mesma linha, ou se as linhas não forem consecutivas,
    // é o empilhamento de volta.
    const doc = cartao();
    const fios = [...doc.querySelectorAll("span")].filter((s) =>
      (s.getAttribute("style") ?? "").includes("border-top"),
    );
    expect(fios).toHaveLength(CINCO.length - 1);
    const linhas = fios.map((f) => gridRowDe(f));
    expect(new Set(linhas).size, `fios empilhados na mesma linha: ${linhas.join(",")}`).toBe(
      fios.length,
    );
    expect(linhas).toEqual(["3", "4", "5", "6"]);
  });

  it("🔴 o fio e o NOME da mesma candidatura ficam na MESMA linha da grade", () => {
    // A relação que o defeito quebrava: o fio da 2ª candidatura ia para a linha
    // 3 e o nome dela era empurrado para a 7. Mutação que morre: voltar
    // qualquer célula ao automático, ou trocar `i + 2` por `i + 1` só no fio.
    const doc = cartao();
    const nomes = [...doc.querySelectorAll("span")].filter((s) =>
      (s.getAttribute("style") ?? "").includes("grid-row"),
    );
    // A célula do nome é a que CONTÉM o texto da candidatura.
    for (let i = 1; i < CINCO.length; i++) {
      const nome = nomes.find((s) => s.textContent?.includes(CINCO[i]?.name ?? ""));
      const fio = [...doc.querySelectorAll("span")].filter((s) =>
        (s.getAttribute("style") ?? "").includes("border-top"),
      )[i - 1];
      expect(gridRowDe(nome ?? null), `linha do nome de ${CINCO[i]?.name}`).toBe(
        gridRowDe(fio ?? null),
      );
    }
  });

  it("🔴 toda célula declara `grid-column` — senão nascem COLUNAS IMPLÍCITAS", () => {
    // Este caso nasceu de um defeito que eu mesmo introduzi ao consertar o
    // empilhamento dos fios, e que os três casos acima NÃO pegaram.
    //
    // Dar `gridRow` às células sem dar `gridColumn` não resolve: o fio é
    // `gridColumn: "1 / -1"` e consome a faixa inteira da linha, então o CSS
    // Grid não acha onde encaixar as 5 células naquela linha e cria colunas
    // IMPLÍCITAS à direita. Medido ao vivo: um cartão que declara 5 colunas
    // computava `grid-template-columns` com **10**, e a coluna do nome caía
    // para 15px — "WILDER MORAIS" virava uma letra e reticências.
    //
    // Com as duas coordenadas explícitas em todo item não há
    // auto-posicionamento: o fio SOBREPÕE a linha em vez de disputá-la.
    //
    // Mutação que morre: tirar `gridColumn` de qualquer célula.
    const doc = cartao();
    const semColuna: string[] = [];
    for (const testid of ["partido", "votos", "parcial", "proj"]) {
      for (const el of doc.querySelectorAll(`[data-testid="hover-card-${testid}"]`)) {
        if (!(el.getAttribute("style") ?? "").includes("grid-column")) semColuna.push(testid);
      }
    }
    expect(semColuna, "células sem grid-column explícito").toEqual([]);
  });

  it("🔴 a coluna de cada campo acompanha as colunas PRESENTES, não um número fixo", () => {
    // Sem `proj` e sem `votos`, "parcial" deixa de ser a 4ª coluna e passa a
    // ser a 3ª. Mutação que morre: cravar os índices (1,2,3,4,5) em vez de
    // derivá-los da mesma lista que monta o `grid-template-columns` — o cartão
    // do MUNICÍPIO não tem `proj`, então o número fixo quebraria justamente lá.
    const semColunas = parse(
      <HoverCard
        x={0}
        y={0}
        title="MT"
        rows={[
          { name: "A", color: "#111", partido: "PL", pct: 40 },
          { name: "B", color: "#222", partido: "PT", pct: 30 },
        ]}
      />,
    );
    const parcial = semColunas.querySelector('[data-testid="hover-card-parcial"]');
    const coluna = /grid-column:\s*([^;"]+)/
      .exec(parcial?.getAttribute("style") ?? "")?.[1]
      ?.trim();
    // nome=1, partido=2, parcial=3 — `votos` e `proj` ausentes não reservam trilho.
    expect(coluna).toBe("3");
  });

  it("🔴 o respiro vertical está na CÉLULA, não no `rowGap` da grade", () => {
    // O fio separador é `border-top` de uma faixa que começa no topo exato da
    // linha. Com `rowGap`, a folga entre linhas caía inteira ABAIXO do texto —
    // medido na tela: faixa de 23px, texto de 19px, **0px acima e 4px abaixo**,
    // o texto encostado no fio. Com `paddingBlock` na célula a mesma folga se
    // divide: medido depois, **4px acima e 4px abaixo** nas quatro faixas.
    //
    // O teste é estrutural porque `renderToStaticMarkup` não roda layout — o
    // que dá para provar é a causa. Mutação que morre: devolver `row-gap` à
    // grade (os dois somados dariam sobra assimétrica de novo) ou tirar o
    // `padding-block` de qualquer célula.
    const doc = cartao();
    const grade = [...doc.querySelectorAll("div")].find((d) =>
      (d.getAttribute("style") ?? "").includes("display:grid"),
    );
    const estiloGrade = grade?.getAttribute("style") ?? "";
    expect(estiloGrade, "a grade voltou a ter row-gap").not.toMatch(/row-gap|(^|;)\s*gap:/);
    expect(estiloGrade).toContain("column-gap");

    const semPadding: string[] = [];
    for (const testid of ["partido", "votos", "parcial", "proj"]) {
      for (const el of doc.querySelectorAll(`[data-testid="hover-card-${testid}"]`)) {
        if (!(el.getAttribute("style") ?? "").includes("padding-block")) semPadding.push(testid);
      }
    }
    expect(semPadding, "células sem padding-block").toEqual([]);
  });

  it("🔴 a grade CENTRA as células, e as faixas continuam esticadas", () => {
    // Segunda queixa do dono sobre a mesma linha, e a razão pela qual a
    // primeira correção não bastou: as colunas não usam a mesma fonte (nome e
    // sigla em `--type-body-sm`, números em `--type-figure-sm`, `line-height`
    // diferente). Com o `stretch` padrão, a linha toma a altura da caixa mais
    // ALTA e as outras são esticadas até ela — e dentro de uma caixa esticada o
    // texto fica no TOPO. Medido na tela DEPOIS de `align-items: center`, pelo
    // retângulo real dos glifos (não pela caixa da célula): número 4,4px acima
    // / 4,9px abaixo, nome 6,0px / 6,8px. Centrado nos dois.
    //
    // ⚠️ E as duas faixas de largura total precisam do `stretch` de volta, ou
    // a correção vira outro defeito: o fio separador não tem conteúdo, e
    // centrado ele viraria uma caixa de altura zero no MEIO da linha —
    // desenhando o traço por cima do texto em vez de acima dele.
    //
    // Mutações que morrem: tirar `align-items` da grade; tirar `align-self` do
    // fio ou da faixa do vencedor.
    const doc = cartao();
    const grade = [...doc.querySelectorAll("div")].find((d) =>
      (d.getAttribute("style") ?? "").includes("display:grid"),
    );
    expect(grade?.getAttribute("style") ?? "").toContain("align-items:center");

    const fios = [...doc.querySelectorAll("span")].filter((s) =>
      (s.getAttribute("style") ?? "").includes("border-top"),
    );
    expect(fios.length).toBeGreaterThan(0);
    for (const fio of fios) {
      expect(fio.getAttribute("style") ?? "", "fio separador sem align-self").toContain(
        "align-self:stretch",
      );
    }
  });

  it("a faixa do vencedor chamado também fica esticada, de fio a fio", () => {
    // Mutação que morre: tirar o `align-self` da faixa. Ela encolheria para a
    // altura do conteúdo — zero — e o destaque do vencedor sumiria da tela sem
    // quebrar nenhum outro caso.
    const doc = parse(
      <HoverCard
        x={0}
        y={0}
        title="MT"
        rows={[
          {
            name: "VENCEDOR",
            color: "#111",
            partido: "PL",
            pct: 55,
            winnerBackground: "#dff",
            winnerInk: "#012",
          },
          { name: "SEGUNDO", color: "#222", partido: "PT", pct: 40 },
        ]}
      />,
    );
    const faixa = [...doc.querySelectorAll("span")].find((s) =>
      (s.getAttribute("style") ?? "").includes("background:#dff"),
    );
    expect(faixa, "faixa do vencedor não renderizou").toBeTruthy();
    expect(faixa?.getAttribute("style") ?? "").toContain("align-self:stretch");
  });

  it("o cabeçalho continua na linha 1 — as candidaturas começam na 2", () => {
    // Mutação que morre: `i + 1` no lugar de `i + 2`, que faria a 1ª
    // candidatura dividir a linha com o cabeçalho.
    const doc = cartao();
    const primeiro = [...doc.querySelectorAll("span")].find((s) =>
      s.textContent?.includes("PRIMEIRO"),
    );
    expect(gridRowDe(primeiro ?? null)).toBe("2");
  });
});
