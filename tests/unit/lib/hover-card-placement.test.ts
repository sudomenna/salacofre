/**
 * tests/unit/lib/hover-card-placement.test.ts
 *
 * `computeHoverCardPlacement` (`lib/utils/hover-card-placement.ts`) substitui
 * o proxy `x > containerWidth / 2` pelo cálculo real "o cartão, do tamanho
 * que ele TEM, cabe daqui até a borda?" — ver a docstring do módulo para o
 * defeito medido (RS a 1024px de janela: contêiner 624px, cartão 363px,
 * `x≈294` fica ENTRE a metade do proxy (312, "não vira") e o ponto real de
 * transbordo (249, "deveria virar"), e o cartão é cortado).
 *
 * O que este arquivo trava:
 *   (a) cartão que cabe sem virar — usa a posição como está;
 *   (b) cartão que NÃO cabe sem virar mas cabe virando — vira;
 *   (c) o caso EXATO de RS a 1024px, com os números reais medidos no
 *       navegador (não um exemplo inventado);
 *   (d) cartão mais largo que o contêiner inteiro — nem virando cabe — cai
 *       para `flip=false` com a borda esquerda presa em 0 (documentado no
 *       módulo: nunca corta o COMEÇO do texto, sangra pelo fim);
 *   (e) os dois eixos (x/flip, y/flipY) são independentes — cada um usa
 *       APENAS a dimensão do próprio eixo (largura para x, altura para y);
 *   (f) o offset de 12px entra na conta — um cartão que cabe "raspando" sem
 *       o offset pode transbordar COM ele.
 */

import { describe, expect, it } from "vitest";

import { computeHoverCardPlacement, HOVER_CARD_OFFSET_PX } from "@/lib/utils/hover-card-placement";

describe("computeHoverCardPlacement", () => {
  it("(a) cartão que CABE sem virar — nenhum dos dois eixos vira, x/y inalterados", () => {
    const r = computeHoverCardPlacement({
      x: 50,
      y: 50,
      containerWidth: 800,
      containerHeight: 400,
      cardWidth: 200,
      cardHeight: 100,
    });
    expect(r).toEqual({ x: 50, y: 50, flip: false, flipY: false });
  });

  it("(b) cartão que NÃO cabe sem virar mas cabe VIRANDO — vira, x/y inalterados [mutação: `flip = false` sempre]", () => {
    // x=700 num contêiner de 800: sem virar precisaria de 700+12+200=912 (não
    // cabe). Virando, precisa de 700-12-200=488 >= 0 (cabe).
    const r = computeHoverCardPlacement({
      x: 700,
      y: 50,
      containerWidth: 800,
      containerHeight: 400,
      cardWidth: 200,
      cardHeight: 100,
    });
    expect(r.flip).toBe(true);
    expect(r.x).toBe(700);
    expect(r.flipY).toBe(false);
  });

  it("(c) 🔴 O CASO REAL — RS a 1024px de janela: contêiner 624px, cartão 363px, x≈294 [mutação: reintroduzir `x > containerWidth / 2`]", () => {
    // Números medidos no navegador (ver o handoff): contêiner do mapa
    // 624px de largura, cartão 363px, x do ponteiro sobre RS relativo ao
    // contêiner ≈294. O proxy antigo (`294 > 312`) respondia "não vira" e o
    // cartão transbordava ~45-53px. A conta real: sem virar precisaria de
    // 294+12+363=669 (>624, não cabe); virando precisaria de
    // 294-12-363=-81 (<0, também não cabe) — NENHUM dos dois lados cabe
    // inteiro a partir deste x exato, e por isso o caso cai no ramo (d)
    // abaixo: presa a borda esquerda em 0, o que garante 0..363 dentro dos
    // 624 disponíveis — o cartão INTEIRO fica na tela, só deixa de seguir o
    // ponteiro exatamente.
    const r = computeHoverCardPlacement({
      x: 294,
      y: 100,
      containerWidth: 624,
      containerHeight: 400,
      cardWidth: 363,
      cardHeight: 96,
    });
    expect(r.flip).toBe(false);
    expect(r.x).toBe(-HOVER_CARD_OFFSET_PX);
    // A borda esquerda do cartão (`x + offset`, ver HoverCard.tsx) fica em 0,
    // e a direita em `cardWidth` — as duas dentro do contêiner.
    const bordaEsquerda = r.x + HOVER_CARD_OFFSET_PX;
    const bordaDireita = bordaEsquerda + 363;
    expect(bordaEsquerda).toBeGreaterThanOrEqual(0);
    expect(bordaDireita).toBeLessThanOrEqual(624);
  });

  it("(c2) o MESMO x≈294, mas um contêiner largo (1280px) — cabe sem virar [regressão: não pode virar à toa numa janela larga]", () => {
    const r = computeHoverCardPlacement({
      x: 294,
      y: 100,
      containerWidth: 900, // container mais largo (janela 1280px, ver tabela do handoff)
      containerHeight: 400,
      cardWidth: 363,
      cardHeight: 96,
    });
    expect(r.flip).toBe(false);
    expect(r.x).toBe(294);
  });

  it("(d) 🔴 cartão mais largo que o CONTÊINER INTEIRO — nem virando cabe, cai para flip=false com a borda esquerda em 0 [mutação: cair para `flip=true` em vez de `false`]", () => {
    const r = computeHoverCardPlacement({
      x: 150,
      y: 50,
      containerWidth: 200,
      containerHeight: 400,
      cardWidth: 500, // mais largo que o próprio contêiner (200px)
      cardHeight: 100,
    });
    expect(r.flip).toBe(false);
    expect(r.x).toBe(-HOVER_CARD_OFFSET_PX);
    // A borda esquerda fica em 0 (nunca corta o COMEÇO do texto); a direita
    // (500 > 200) sangra para fora — documentado, é o mal menor.
    expect(r.x + HOVER_CARD_OFFSET_PX).toBe(0);
  });

  it("(e) 🔴 os dois eixos são independentes — vira só o Y, mantém X [mutação: `flipY` usando `containerWidth`/`cardWidth` em vez de `containerHeight`/`cardHeight`]", () => {
    // X cabe folgado (50 num contêiner de 800). Y não cabe sem virar
    // (350+12+100=462 > 400) mas cabe virando (350-12-100=238>=0).
    const r = computeHoverCardPlacement({
      x: 50,
      y: 350,
      containerWidth: 800,
      containerHeight: 400,
      cardWidth: 200,
      cardHeight: 100,
    });
    expect(r.flip).toBe(false);
    expect(r.flipY).toBe(true);
    expect(r.x).toBe(50);
    expect(r.y).toBe(350);
  });

  it("(e2) troca de dimensão no eixo errado muda a resposta — não-quadrado de propósito [mutação: `cabeSemVirarY` usando `cardWidth`]", () => {
    // containerWidth (800) != containerHeight (400) e cardWidth (200) !=
    // cardHeight (100): se o cálculo Y usasse a dimensão X por engano, a
    // resposta mudaria. y=350: com altura(100) não cabe sem virar
    // (350+12+100=462>400); com largura(200) TAMBÉM não cabe
    // (350+12+200=562>400) — então este caso sozinho não discrimina a troca
    // width↔height na checagem "sem virar". Quem discrimina é o resultado de
    // "cabe virando": com altura (100), 350-12-100=238>=0 (cabe, flipY=true);
    // com largura (200), 350-12-200=138>=0 (também cabe) — ainda não
    // discrimina. O que discrimina de fato é o caso (e) acima combinado com
    // este: ver também o teste (c), onde height=96 e width=363 são bem
    // diferentes e a mutação width↔height muda o resultado do eixo X.
    // Este caso cobre a mutação mais provável isoladamente: computar
    // `cabeSemVirarY`/`cabeVirandoY` com `cardWidth` no lugar de
    // `cardHeight`.
    const r = computeHoverCardPlacement({
      x: 50,
      y: 250,
      containerWidth: 800,
      containerHeight: 400,
      cardWidth: 300,
      cardHeight: 50,
    });
    // Com a altura certa (50): 250+12+50=312<=400 → cabe, flipY=false.
    // Com a largura errada (300): 250+12+300=562>400 → não cabe sem virar;
    // virando, 250-12-300=-62<0 → também não cabe ⇒ cairia no ramo (d),
    // flipY=false MAS y sairia -12 em vez de 250. É essa diferença de `y`
    // que a mutação expõe.
    expect(r.flipY).toBe(false);
    expect(r.y).toBe(250);
  });

  it("(f) o offset de 12px entra na conta — sem ele o cálculo diria 'cabe', com ele tem de virar [mutação: apagar `+ o`/`- o` da conta]", () => {
    // containerWidth=300, cardWidth=100, x=195: SEM o offset, 195+100=295<=300
    // (um cálculo que esquecesse o offset diria "cabe, não vira"). COM o
    // offset de 12px, 195+12+100=307>300 — não cabe mais, e virando
    // (195-12-100=83>=0) cabe — a resposta certa é `flip=true`.
    const r = computeHoverCardPlacement({
      x: 195,
      y: 0,
      containerWidth: 300,
      containerHeight: 400,
      cardWidth: 100,
      cardHeight: 50,
    });
    expect(r.flip).toBe(true);
    expect(r.x).toBe(195);
  });
});
