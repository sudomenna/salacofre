// @vitest-environment happy-dom
/**
 * tests/unit/components/DadoParadoBanner.test.tsx — ADR-0038 D4.
 *
 * O banner que a spec 003 descreve em prosa desde a redação original
 * (`spec.md:108`, "Erro de dados (>60s sem update): banner amarelo") e que
 * nenhum componente do repositório implementava.
 *
 * O que se mede aqui não é "renderiza uma div amarela". É:
 *
 *   - que ele aparece **só** no estado `"parado"`, e cala nos outros três —
 *     um banner que também acendesse em `"indisponivel"` ou em `"ausente"`
 *     estaria alarmando sobre a ausência da informação, não sobre o TSE;
 *   - que o texto é **proporcional à cadência do cargo**, e não um "60s" fixo;
 *   - que a cor não carrega significado sozinha (WCAG 1.4.1) e sai de token,
 *     nunca de hex solto (constituição § 2 e § 4);
 *   - **e, desde 2026-09-13, os dois cenários do leitor sentado.** O veredito do
 *     servidor vale para um instante só — quatro das cinco rotas são ISR-60 e
 *     uma é estática pura, e nenhuma das duas coisas ajuda uma aba já aberta —,
 *     então o banner reavalia no cliente. Os dois cenários são opostos e um
 *     conserto que resolva só um piora a situação:
 *
 *       (1) ingestão morta + leitor sentado → o aviso **tem** de acender sem
 *           recarga;
 *       (2) ingestão saudável + leitor sentado → o aviso **não pode** acender
 *           nunca. É o teste que mata a implementação ingênua — um timer em
 *           cima do `dado_ts` fixo que veio do servidor acende em toda página
 *           aberta por mais que o limiar, um alarme falso recorrente.
 *
 * O que esta suíte afere desde o conserto de a11y (mesma data) é a **live
 * region**, que é onde os dois defeitos altos moravam:
 *
 *   - o texto **anunciado** não pode mudar enquanto a queda dura. `role=status`
 *     é `aria-atomic` implícito, e o texto começa com um contador que muda
 *     1×/minuto: sem isolar o número, as três frases são relidas a cada minuto
 *     por horas. O que se afere é a **estabilidade do anunciado com o visual
 *     andando** — os dois ao mesmo tempo, porque congelar os dois "passa" o
 *     teste ingênuo e empobrece a tela;
 *   - a região tem de estar no DOM **antes** de haver aviso, e ser o **mesmo
 *     nó** quando o aviso chega. Região que nasce junto com o texto é o modo de
 *     falha clássico (VoiceOver não anuncia).
 *
 * O arquivo tem duas metades. A primeira usa `renderToStaticMarkup`, como o
 * resto da suíte de componentes, e cobre os quatro estados e a a11y do markup.
 * A segunda monta de verdade (`createRoot` + `act` + timers falsos), porque
 * "acende sozinho três minutos depois" não é observável num render estático.
 */

import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DadoParadoBanner, type EscopoDado } from "@/components/atoms/banners/DadoParadoBanner";
import type { CargoTse } from "@/lib/config/cargos";
import { avaliarFrescorDado, type FrescorDado, textoDadoParado } from "@/lib/config/dado-freshness";
import { useDadoFrescorStore } from "@/lib/state/dado-freshness-store";

const AGORA = Date.parse("2026-10-04T23:00:00-03:00");

function dadoTsHa(segundos: number): string {
  return new Date(AGORA - segundos * 1000).toISOString();
}

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function banner(dadoTs: string | null | undefined, cargo: 1 | 3 | 5 | 6): Element | null {
  const doc = parse(<DadoParadoBanner frescor={avaliarFrescorDado(dadoTs, cargo, AGORA)} />);
  return doc.querySelector("[data-testid='dado-parado-banner']");
}

/** A live region — que, ao contrário do aviso, existe nos quatro estados. */
function regiao(dadoTs: string | null | undefined, cargo: 1 | 3 | 5 | 6): Element | null {
  const doc = parse(<DadoParadoBanner frescor={avaliarFrescorDado(dadoTs, cargo, AGORA)} />);
  return doc.querySelector("[data-testid='dado-parado-regiao']");
}

/**
 * O que um leitor de tela **relê** quando algo muda dentro da região: tudo o
 * que está nela menos o que está sob um `aria-live="off"`, porque a politeness
 * de uma mutação é resolvida pelo ancestral mais próximo com `aria-live`
 * (ARIA 1.2) e `off` significa "não anuncie".
 *
 * É esta função que dá o teste de mutação de graça: devolver o contador para
 * dentro do texto anunciado, ou tirar o `aria-live="off"` do `<span>`, faz o
 * número reaparecer aqui — e o número muda a cada minuto.
 */
function textoAnunciado(regiaoEl: Element): string {
  const copia = regiaoEl.cloneNode(true) as Element;
  for (const mudo of Array.from(copia.querySelectorAll("[aria-live='off']"))) {
    mudo.remove();
  }
  return (copia.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("<DadoParadoBanner /> — os quatro estados", () => {
  it("(a) 'parado' → acende, com o tempo e a cadência do cargo", () => {
    const el = banner(dadoTsHa(600), 1);
    expect(el).not.toBeNull();

    const texto = el?.textContent ?? "";
    expect(texto).toContain("Os dados do TSE não avançam há 10 minutos");
    expect(texto).toContain("a cada minuto");
    // Constituição § 7 / RNF-010: a página não some, e o texto diz isso.
    expect(texto).toContain("último apurado conhecido");

    // O gatilho fica auditável fora da redação da frase.
    expect(el?.getAttribute("data-lag-seconds")).toBe("600");
    expect(el?.getAttribute("data-limiar-seconds")).toBe("180");
  });

  it("(b) 'fresco' → nada no DOM", () => {
    expect(banner(dadoTsHa(30), 1)).toBeNull();
  });

  it("(c) `null` ('indisponivel') → nada no DOM: não se mede defasagem de relógio inexistente", () => {
    expect(banner(null, 1)).toBeNull();
  });

  it("(d) ausente → nada no DOM: durante o canary a tela se comporta como antes", () => {
    expect(banner(undefined, 1)).toBeNull();
  });

  it("(e) o limiar é do cargo — 40 min acende Presidente e cala Deputado Federal", () => {
    const lag = 40 * 60;
    expect(banner(dadoTsHa(lag), 1)).not.toBeNull();
    expect(banner(dadoTsHa(lag), 5)).not.toBeNull();
    expect(banner(dadoTsHa(lag), 6)).toBeNull();
    // E o cargo 6 acende quando de fato passa dos 90 min — senão a linha acima
    // passaria com um banner que nunca aparece nesta trilha.
    expect(banner(dadoTsHa(100 * 60), 6)).not.toBeNull();
  });

  it("(f) o texto do Deputado fala em 30 minutos, não nos 5 do intervalo entre fatias", () => {
    const texto = banner(dadoTsHa(100 * 60), 6)?.textContent ?? "";
    expect(texto).toContain("a cada 30 minutos");
    expect(texto).not.toContain("a cada 5 minutos");
    expect(texto).not.toContain("a cada minuto");
    expect(texto).toContain("1h40");
  });
});

describe("<DadoParadoBanner /> — a11y e cor (constituição § 2 e § 4)", () => {
  const el = banner(dadoTsHa(600), 1);
  const reg = regiao(dadoTsHa(600), 1);

  it("(a) é live region polida — o aviso pode nascer com a página aberta", () => {
    // Virada de 2026-09-13. Era `role="note"`, com a justificativa de que o
    // conteúdo vinha do servidor e não mudava depois da hidratação. Deixou de
    // ser verdade: o banner agora acende sozinho quando o `dado_ts` para de
    // avançar (ver a segunda metade deste arquivo). Um aviso que aparece só e
    // não é anunciado é regressão de a11y — e a a11y é constitucional (§ 4).
    //
    // Os atributos moram na REGIÃO (que existe sempre), não no aviso (que só
    // existe em "parado"): é a região que tem de preceder o texto.
    expect(reg?.getAttribute("role")).toBe("status");
    expect(reg?.getAttribute("aria-live")).toBe("polite");
    expect(reg?.getAttribute("aria-label")).toBe("Aviso sobre os dados do TSE");
    // `alert`/`assertive` interrompe a leitura no meio da frase. Dado parado
    // não é emergência: a página segue inteira, com o último valor conhecido.
    expect(reg?.getAttribute("role")).not.toBe("alert");
    expect(reg?.getAttribute("aria-live")).not.toBe("assertive");
    expect(reg?.getAttribute("role")).not.toBe("note");
    // E o aviso mora DENTRO dela — senão os atributos acima não governam nada.
    // (`el` vem de outro `parse`, logo de outro Document: a checagem tem de ser
    // feita na própria árvore de `reg`.)
    expect(reg?.querySelector("[data-testid='dado-parado-banner']")).not.toBeNull();
  });

  it("(a2) a região existe nos quatro estados — live region não nasce com o texto", () => {
    // O modo de falha clássico: inserir `role=status` e o conteúdo no mesmo
    // instante. NVDA/JAWS anunciam de forma inconsistente e o VoiceOver
    // notoriamente não anuncia nada. A região vazia custa 0 px: `.sr-only` é
    // `position: absolute` (`app/globals.css:619-629`), e filho absolutamente
    // posicionado NÃO é flex item (CSS Flexbox L1 § 4.1) — não gera caixa no
    // fluxo nem consome o `gap` de nenhuma das cinco páginas.
    const mudos: Array<[string, string | null | undefined]> = [
      ["fresco", dadoTsHa(30)],
      ["indisponivel", null],
      ["ausente", undefined],
    ];
    for (const [rotulo, ts] of mudos) {
      const doc = parse(<DadoParadoBanner frescor={avaliarFrescorDado(ts, 1, AGORA)} />);
      const vazia = doc.querySelector("[data-testid='dado-parado-regiao']");
      expect(vazia, rotulo).not.toBeNull();
      expect(vazia?.getAttribute("role"), rotulo).toBe("status");
      expect(vazia?.getAttribute("aria-live"), rotulo).toBe("polite");
      expect(vazia?.getAttribute("class"), rotulo).toContain("sr-only");
      // Montada, e mesmo assim sem uma palavra: nada a anunciar ainda.
      expect(vazia?.textContent, rotulo).toBe("");
      expect(doc.querySelector("[data-testid='dado-parado-banner']"), rotulo).toBeNull();
    }
    // E, com aviso, a região deixa de ser `sr-only` — senão a faixa amarela
    // estaria escondida e o defeito seria visual em vez de sonoro.
    expect(reg?.getAttribute("class") ?? "").not.toContain("sr-only");
  });

  it("(a3) o contador mora num `aria-live=off`; o que é anunciado não tem número", () => {
    const contador = reg?.querySelector("[aria-live='off']");
    expect(contador?.textContent).toBe("10 minutos");
    // Cargo 1 fala "a cada minuto": tirado o contador, não sobra um dígito
    // sequer no que o leitor relê. É o que garante que a releitura, se vier,
    // não traz informação nova — e por isso pode ser suprimida.
    expect(textoAnunciado(reg as Element)).not.toMatch(/\d/);
    // O VISUAL não empobrece: continua dizendo há quanto tempo.
    expect(reg?.textContent).toContain("não avançam há 10 minutos");
    // E a partição reproduz a frase ao pé da letra — `antes + duração + depois`
    // não pode divergir de `textoDadoParado`.
    const frescor = avaliarFrescorDado(dadoTsHa(600), 1, AGORA);
    if (frescor.estado !== "parado") throw new Error("fixture errada: deveria estar parado");
    expect(el?.textContent).toBe(textoDadoParado(frescor));
  });

  it("(b) a cor é token, nunca hex solto, e nunca a única portadora do aviso", () => {
    const style = el?.getAttribute("style") ?? "";
    expect(style).toContain("var(--accent-soft)");
    expect(style).toContain("var(--accent-ink)");
    expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    // WCAG 1.4.1: sem enxergar cor nenhuma, o texto já diz tudo.
    expect((el?.textContent ?? "").length).toBeGreaterThan(60);
  });

  it("(c) o texto é nó de texto, não `content` de CSS (lição do <ShellLiveBadge>)", () => {
    expect(el?.querySelector("p")?.textContent).toContain("Os dados do TSE não avançam");
  });

  it("(d) não anima — nada a gatear em prefers-reduced-motion", () => {
    const html = renderToStaticMarkup(
      <DadoParadoBanner frescor={avaliarFrescorDado(dadoTsHa(600), 1, AGORA)} />,
    );
    expect(html).not.toContain("animation");
    expect(html).not.toContain("transition");
  });
});

// ---------------------------------------------------------------------------
// O leitor sentado — precisa de árvore montada e de relógio controlado
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: flag global do ambiente de `act`
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("<DadoParadoBanner /> — o leitor sentado (ADR-0038 D4, virada de 2026-09-13)", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    // Store de módulo: sem isto um teste herda o relógio do anterior.
    useDadoFrescorStore.setState({ pollers: {}, relogios: {} });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  const aviso = () => container.querySelector("[data-testid='dado-parado-banner']");
  const regiaoViva = () => container.querySelector("[data-testid='dado-parado-regiao']");

  /** A moldura do mapa se anunciando — é o que autoriza a reavaliação. */
  function molduraMonta(cargo: CargoTse = 1) {
    useDadoFrescorStore.getState().registrarPoller(cargo);
  }

  /** Um ciclo de polling que voltou com payload. */
  function cicloDePolling(dadoTs: string | null | undefined, cargo: CargoTse = 1) {
    act(() => {
      useDadoFrescorStore.getState().publicarDadoTs(cargo, dadoTs);
    });
  }

  /** `dado_ts` carimbado no instante (falso) corrente. */
  function dadoTsDeAgora(): string {
    return new Date(Date.now()).toISOString();
  }

  function montar(semente: FrescorDado, escopo?: EscopoDado) {
    act(() => {
      root.render(<DadoParadoBanner frescor={semente} escopo={escopo} />);
    });
  }

  function passar(ms: number) {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  it("(g) CENÁRIO 1 — ingestão morta, leitor sentado: o aviso acende sem recarga", () => {
    molduraMonta();
    // O `dado_ts` que congelou. A moldura continua buscando e continua
    // recebendo 200 — o TSE é que parou de gerar boletim novo.
    const congelado = dadoTsDeAgora();
    cicloDePolling(congelado);
    montar(avaliarFrescorDado(congelado, 1, Date.now()));
    expect(aviso()).toBeNull();

    // Três minutos é o limiar exato de Presidente (60 s × 3), e o limiar é o
    // último valor ainda tolerado (`>`, não `>=`).
    for (let i = 0; i < 3; i++) {
      passar(60_000);
      cicloDePolling(congelado);
    }
    expect(aviso()).toBeNull();

    passar(60_000);
    cicloDePolling(congelado);

    const el = aviso();
    expect(el).not.toBeNull();
    expect(el?.getAttribute("data-lag-seconds")).toBe("240");
    expect(el?.textContent).toContain("Os dados do TSE não avançam há 4 minutos");
  });

  it("(h) CENÁRIO 2 — ingestão saudável, leitor sentado: o aviso NUNCA acende", () => {
    // Este é o teste que mata a implementação ingênua. Um timer que reavalie
    // em cima do `dado_ts` do render de servidor (fixo) acende aqui no minuto
    // 4 — alarme falso em toda página deixada aberta, pior que o defeito que a
    // mudança veio consertar.
    molduraMonta();
    cicloDePolling(dadoTsDeAgora());
    montar(avaliarFrescorDado(dadoTsDeAgora(), 1, Date.now()));

    // 20 minutos — quase sete vezes o limiar de 180 s.
    for (let ciclo = 1; ciclo <= 20; ciclo++) {
      passar(60_000);
      expect(aviso(), `ciclo ${ciclo}, antes do poll`).toBeNull();
      cicloDePolling(dadoTsDeAgora());
      expect(aviso(), `ciclo ${ciclo}, depois do poll`).toBeNull();
    }
  });

  it("(i) polling que nunca entrega: o último `dado_ts` conhecido envelhece e acende", () => {
    // A moldura está montada mas todo `fetch` falha (o `catch` dela é
    // silencioso de propósito). A página perdeu a capacidade de confirmar que
    // o TSE avança — acender é o desfecho certo, não um bug.
    molduraMonta();
    montar(avaliarFrescorDado(dadoTsDeAgora(), 1, Date.now()));
    expect(aviso()).toBeNull();

    passar(4 * 60_000);
    expect(aviso()).not.toBeNull();
  });

  it("(j) sem moldura (as duas telas de Deputado Federal): nenhum timer, nenhum alarme falso", () => {
    // `(dep)` não tem `layout.tsx` com `<PersistentMapFrame>`: ninguém publica
    // `dado_ts` vivo para o cargo 6. Reavaliar por tempo ali seria garantir o
    // alarme falso em toda aba aberta por mais de 90 min.
    montar(avaliarFrescorDado(dadoTsDeAgora(), 6, Date.now()));
    expect(aviso()).toBeNull();

    passar(3 * 60 * 60_000); // 3 horas, o dobro do limiar do cargo 6
    expect(aviso()).toBeNull();
  });

  it("(k) quando acende com a página aberta, é live region — senão ninguém é avisado", () => {
    molduraMonta();
    const congelado = dadoTsDeAgora();
    cicloDePolling(congelado);
    montar(avaliarFrescorDado(congelado, 1, Date.now()));
    expect(aviso()).toBeNull();

    passar(4 * 60_000);

    const el = aviso();
    expect(el).not.toBeNull();
    const reg = regiaoViva();
    expect(reg?.getAttribute("role")).toBe("status");
    expect(reg?.getAttribute("aria-live")).toBe("polite");
    expect(reg?.contains(el as Node)).toBe(true);
  });

  it("(k2) a região está montada ANTES do aviso, e é o MESMO nó quando ele chega", () => {
    // Região que nasce junto com o texto é o modo de falha clássico de live
    // region — VoiceOver notoriamente não anuncia, porque o observador precisa
    // da região já registrada para enxergar a mutação. Aferir "existe depois"
    // não prova nada: o que prova é a identidade do nó através da transição.
    molduraMonta();
    const congelado = dadoTsDeAgora();
    cicloDePolling(congelado);
    montar(avaliarFrescorDado(congelado, 1, Date.now()));

    const antes = regiaoViva();
    expect(antes).not.toBeNull();
    expect(aviso(), "ainda não há aviso").toBeNull();
    expect(antes?.getAttribute("role")).toBe("status");
    expect(antes?.getAttribute("aria-live")).toBe("polite");
    expect(antes?.getAttribute("aria-label")).toBe("Aviso sobre os dados do TSE");
    // Vazia e fora do fluxo: `position: absolute`, não é flex item, 0 px.
    expect(antes?.getAttribute("class")).toContain("sr-only");
    expect(antes?.textContent).toBe("");

    passar(4 * 60_000);
    cicloDePolling(congelado);

    expect(aviso()).not.toBeNull();
    expect(regiaoViva(), "a região não pode ser recriada com o texto").toBe(antes);
    expect(antes?.getAttribute("class") ?? "").not.toContain("sr-only");
    expect(antes?.textContent).toContain("Os dados do TSE não avançam");
  });

  it("(k3) a queda dura minutos: o VISUAL conta, o ANUNCIADO não muda", () => {
    // O defeito: `role=status` é `aria-atomic` implícito, o texto começa com um
    // contador que muda 1×/minuto, e o veredito é refeito a cada 15 s (cargo 1).
    // Sem isolar o número, as três frases (~135 caracteres, ~8 s de fala) são
    // relidas a cada minuto enquanto durar a queda — numa noite de apuração,
    // por horas.
    molduraMonta();
    const congelado = dadoTsDeAgora();
    cicloDePolling(congelado);
    montar(avaliarFrescorDado(congelado, 1, Date.now()));

    passar(4 * 60_000);
    cicloDePolling(congelado);
    expect(aviso()?.textContent).toContain("não avançam há 4 minutos");

    const anunciadoInicial = textoAnunciado(regiaoViva() as Element);
    expect(anunciadoInicial).not.toMatch(/\d/);
    expect(anunciadoInicial).toContain("Os dados do TSE não avançam");

    const visuais: string[] = [];
    for (let minuto = 5; minuto <= 9; minuto++) {
      passar(60_000);
      cicloDePolling(congelado);
      visuais.push(aviso()?.textContent ?? "");
      expect(textoAnunciado(regiaoViva() as Element), `minuto ${minuto}`).toBe(anunciadoInicial);
    }

    // E a metade que NÃO pode ser sacrificada para calar o áudio: o visual de
    // fato andou, minuto a minuto. Um conserto que congelasse os dois passaria
    // a asserção de cima e empobreceria a tela.
    expect(visuais.at(-1)).toContain("não avançam há 9 minutos");
    expect(new Set(visuais).size, "cada minuto tem um texto visual próprio").toBe(visuais.length);
    expect(aviso()?.getAttribute("data-lag-seconds")).toBe(String(9 * 60));
  });

  it("(l) o aviso APAGA quando a ingestão volta — o veredito é do dado, não do histórico", () => {
    // Servidor renderizou "parado"; a ingestão voltou enquanto o leitor estava
    // sentado. Manter o aviso aceso seria a mentira simétrica à de (h).
    molduraMonta();
    montar(avaliarFrescorDado(dadoTsHa(600), 1, AGORA));
    expect(aviso()).not.toBeNull();

    cicloDePolling(dadoTsDeAgora());
    passar(15_000);
    expect(aviso()).toBeNull();
  });

  it("(m) escopo UF: o nacional fresco NÃO apaga um aviso de degradação regional", () => {
    // ADR-0038 D2 — a ingestão degrada regionalmente sem o nacional acusar
    // nada. O relógio vivo é o nacional; usá-lo nos DOIS sentidos apagaria o
    // aviso verdadeiro desta UF, que é pior do que não ter aviso nenhum.
    molduraMonta(1);
    cicloDePolling(dadoTsDeAgora(), 1);
    montar(avaliarFrescorDado(dadoTsHa(600), 1, AGORA), "uf");
    expect(aviso()).not.toBeNull();

    for (let ciclo = 1; ciclo <= 5; ciclo++) {
      passar(60_000);
      cicloDePolling(dadoTsDeAgora(), 1);
      expect(aviso(), `ciclo ${ciclo}`).not.toBeNull();
    }
  });

  it("(n) escopo UF: nacional parado prova UF parada — acende sem recarga", () => {
    // `dado_ts` nacional é o `max` sobre todos os pares, logo ≥ o de qualquer
    // UF: se o nacional passou do limiar, esta UF passou também.
    molduraMonta(1);
    const congelado = dadoTsDeAgora();
    cicloDePolling(congelado, 1);
    montar(avaliarFrescorDado(congelado, 1, Date.now()), "uf");
    expect(aviso()).toBeNull();

    passar(4 * 60_000);
    cicloDePolling(congelado, 1);
    expect(aviso()).not.toBeNull();
  });

  it("(o) escopo UF + ingestão saudável: o aviso nunca acende", () => {
    molduraMonta(1);
    cicloDePolling(dadoTsDeAgora(), 1);
    montar(avaliarFrescorDado(dadoTsDeAgora(), 1, Date.now()), "uf");

    for (let ciclo = 1; ciclo <= 20; ciclo++) {
      passar(60_000);
      expect(aviso(), `ciclo ${ciclo}, antes do poll`).toBeNull();
      cicloDePolling(dadoTsDeAgora(), 1);
      expect(aviso(), `ciclo ${ciclo}, depois do poll`).toBeNull();
    }
  });

  it("(p) o relógio publicado só substitui o do servidor quando é mais NOVO", () => {
    // O `/api/projection` tem CDN de 30 s (ADR-0002) e pode devolver por alguns
    // segundos o ciclo anterior ao que o servidor leu. Sem a guarda, o lag
    // daria um pulo para trás — e, num payload já perto do limiar, um pulo
    // para trás é um aviso que acende cedo demais.
    molduraMonta();
    montar(avaliarFrescorDado(dadoTsHa(170), 1, AGORA));
    expect(aviso()).toBeNull();

    // O poller volta com um `dado_ts` 10 min MAIS VELHO que o do servidor.
    cicloDePolling(dadoTsHa(600));
    passar(15_000);
    // Vence o mais novo (o do servidor): 170 + 15 = 185 s… que já passou do
    // limiar, então o que se afere aqui é o NÚMERO, não a presença.
    expect(aviso()?.getAttribute("data-lag-seconds")).toBe("185");
  });

  it("(q) hidratação: o primeiro render do cliente é o do servidor, com a store já cheia", () => {
    // Navegar dentro do grupo de rotas NÃO desmonta a moldura (ADR-0033 § 1),
    // então a store pode estar populada antes de a página nova hidratar. Se o
    // veredito fosse calculado com `Date.now()` no corpo do componente, o
    // cliente renderizaria "sem aviso" sobre um HTML que TEM aviso —
    // descompasso de hidratação e salto visual no mesmo golpe.
    const alvo = document.createElement("div");
    document.body.appendChild(alvo);
    const semente = avaliarFrescorDado(dadoTsHa(600), 1, AGORA);
    alvo.innerHTML = renderToStaticMarkup(<DadoParadoBanner frescor={semente} />);
    expect(alvo.querySelector("[data-testid='dado-parado-banner']")).not.toBeNull();

    useDadoFrescorStore.getState().registrarPoller(1);
    useDadoFrescorStore.getState().publicarDadoTs(1, dadoTsDeAgora());

    const erros = vi.spyOn(console, "error").mockImplementation(() => {});
    let hidratada: Root | null = null;
    act(() => {
      hidratada = hydrateRoot(alvo, <DadoParadoBanner frescor={semente} />);
    });
    expect(erros).not.toHaveBeenCalled();
    erros.mockRestore();

    // E, passada a hidratação, o efeito troca o veredito pelo do relógio vivo.
    expect(alvo.querySelector("[data-testid='dado-parado-banner']")).toBeNull();

    act(() => (hidratada as Root | null)?.unmount());
    alvo.remove();
  });
});
