// @vitest-environment happy-dom
/**
 * tests/unit/shell/persistent-map-frame.test.tsx
 *
 * A moldura persistente do ADR-0033 § 1 — o que faz o mapa não desmontar ao
 * trocar de UF. Três coisas são fixadas aqui, e nenhuma delas é observável nos
 * smokes de página (a página não monta mais o mapa; o layout monta):
 *
 *   1. os dois `layout.tsx` de grupo montam `<AppShellSplit>` com o
 *      `<PersistentMapFrame>` no slot de mapa, e o `page.tsx` (aqui, um filho
 *      qualquer) entra na coluna de painéis;
 *   2. a ordem no DOM é painéis → mapa. O visual do mobile inverte por
 *      `order: -1` (ver `AppShellSplit.module.css`), mas a ordem de leitura e
 *      de tabulação continua começando pelo conteúdo da página;
 *   3. o esqueleto do mapa preenche a coluna (`height: 100%`) — a moldura tem
 *      altura própria, e um esqueleto de altura fixa faria o mapa empurrar o
 *      layout ao chegar (CLS, RNF-007).
 *
 * `useParams()` é mockado porque `renderToStaticMarkup` não monta o App
 * Router. Sem payload buscado (não há `fetch` num render estático), a moldura
 * está no seu estado inicial: o esqueleto.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  usePathname: () => "/",
}));

// O bloco de mapa é substituído nos testes montados abaixo: ele carrega
// MapLibre/PMTiles por `next/dynamic({ ssr: false })`, que não sobe em
// happy-dom e não tem nada a ver com o que se afere aqui. Os testes estáticos
// (a)–(d) nunca chegam a ele (sem `fetch` num render estático, a moldura para
// no esqueleto) e (e) lê o arquivo do disco, não o módulo.
vi.mock("@/components/blocks/NationalMapBlock", () => ({
  CHIP_STYLE: {},
  NationalMapBlock: () => <div data-testid="mapa-nacional-falso" />,
}));

import GovLayout from "@/app/(gov)/layout";
import PresLayout from "@/app/(pres)/layout";
import { PersistentMapFrame } from "@/components/layout/PersistentMapFrame";
import type { EdgePayload } from "@/lib/edge-config/types";
import { useDadoFrescorStore } from "@/lib/state/dado-freshness-store";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

const FILHO = <main data-trilha="pres">painéis</main>;

describe("moldura persistente (ADR-0033 § 1)", () => {
  it("(a) o layout de `(pres)` monta a moldura com o `<main>` na coluna de painéis", () => {
    const doc = parse(renderToStaticMarkup(<PresLayout>{FILHO}</PresLayout>));
    const split = doc.querySelector("[data-shell-split]");
    expect(split).not.toBeNull();
    expect(split?.children).toHaveLength(2);
    expect(doc.querySelector("main[data-trilha]")?.closest("[data-shell-split]")).toBe(split);
  });

  it("(b) o layout de `(gov)` monta a mesma moldura", () => {
    const doc = parse(
      renderToStaticMarkup(<GovLayout>{<main data-trilha="gov">painéis</main>}</GovLayout>),
    );
    expect(doc.querySelector("[data-shell-split]")).not.toBeNull();
    expect(doc.querySelector("main[data-trilha='gov']")).not.toBeNull();
  });

  it("(c) no DOM os painéis vêm antes do mapa — o visual do mobile é `order`, não ordem de leitura", () => {
    const doc = parse(renderToStaticMarkup(<PresLayout>{FILHO}</PresLayout>));
    const split = doc.querySelector("[data-shell-split]");
    const [primeira, segunda] = [...(split?.children ?? [])];
    expect(primeira?.querySelector("main")).not.toBeNull();
    expect(segunda?.querySelector("main")).toBeNull();
  });

  it("(d) o esqueleto do mapa preenche a coluna, sem altura fixa (CLS — RNF-007)", () => {
    const doc = parse(renderToStaticMarkup(<PresLayout>{FILHO}</PresLayout>));
    const esqueleto = doc.querySelector('[data-testid="map-skeleton"]');
    expect(esqueleto).not.toBeNull();
    expect(esqueleto?.getAttribute("style")).toContain("height:100%");
  });

  it('(e) o bloco do mapa pede `height="100%"` na variante de moldura', async () => {
    // Guarda de fonte, no estilo do `static-shell.test.ts`: a altura do mapa
    // montado só é observável com MapLibre no browser, mas se a variante
    // `frame` deixar de pedir 100%, o mapa e o esqueleto passam a reservar
    // alturas diferentes — que é exatamente o CLS que (d) protege do outro lado.
    const fs = await import("node:fs");
    const src = fs.readFileSync("components/blocks/NationalMapBlock.tsx", "utf-8");
    const frame = src.slice(src.indexOf('if (variant === "frame")'));
    expect(frame).toContain('height="100%"');
    expect(frame).toContain('legendPlacement="overlay"');
  });
});

// ---------------------------------------------------------------------------
// O outro trabalho da moldura: publicar o `dado_ts` (ADR-0038 D4)
// ---------------------------------------------------------------------------

/**
 * A moldura é o único relógio vivo do `dado_ts` no cliente. O
 * `<DadoParadoBanner>` das páginas é árvore irmã (ele vem do `page.tsx`, a
 * moldura do `layout.tsx`) e, sem isto, o veredito dele ficaria congelado no
 * render de servidor: quem abriu a página às 20h nunca saberia que a ingestão
 * morreu às 20h30.
 *
 * O payload já vinha com `dado_ts` e era descartado — nada aqui custa
 * requisição nem query novas.
 */
// biome-ignore lint/suspicious/noExplicitAny: flag global do ambiente de `act`
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * "A chave `dado_ts` não existe neste payload" — estado distinto de `null`
 * (ADR-0038 D1) e que `undefined` como valor default não conseguiria exprimir
 * sem ambiguidade.
 */
const SEM_CHAVE = Symbol("payload pré-ADR-0038");

/** O mínimo que a moldura lê do payload no nível Brasil, mais o campo em teste. */
function payloadFalso(
  cargo: number,
  dadoTs: string | null | typeof SEM_CHAVE = SEM_CHAVE,
): EdgePayload {
  const base: Record<string, unknown> = {
    ts: "2026-10-04T23:00:30.000Z",
    cargo,
    turno: 1,
    national: { candidatos: [], candidato_a_id: null },
    por_uf: [],
  };
  if (dadoTs !== SEM_CHAVE) base.dado_ts = dadoTs;
  return base as unknown as EdgePayload;
}

describe("a moldura publica o `dado_ts` (ADR-0038 D4)", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    useDadoFrescorStore.setState({ pollers: {}, relogios: {} });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function responderCom(payload: EdgePayload) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => payload })),
    );
  }

  async function montar(cargo: "pres" | "gov") {
    await act(async () => {
      root.render(<PersistentMapFrame cargo={cargo} />);
    });
  }

  it("(f) registra o poller do próprio cargo ao montar e dá baixa ao desmontar", async () => {
    responderCom(payloadFalso(1, "2026-10-04T23:00:00.000Z"));
    await montar("pres");
    // 1 = Presidente. É a chave que o banner da home consulta para saber se
    // pode reavaliar por tempo; sem ela, ele fica com o veredito do servidor.
    expect(useDadoFrescorStore.getState().pollers[1]).toBe(1);
    expect(useDadoFrescorStore.getState().pollers[3]).toBeUndefined();

    await act(async () => root.unmount());
    expect(useDadoFrescorStore.getState().pollers[1]).toBeUndefined();
    // `afterEach` desmonta de novo; a baixa é idempotente.
  });

  it("(g) a moldura de Governador registra o cargo 3, não o 1", async () => {
    responderCom(payloadFalso(3, "2026-10-04T23:00:00.000Z"));
    await montar("gov");
    expect(useDadoFrescorStore.getState().pollers[3]).toBe(1);
    expect(useDadoFrescorStore.getState().pollers[1]).toBeUndefined();
    expect(useDadoFrescorStore.getState().relogios[3]?.dadoTs).toBe("2026-10-04T23:00:00.000Z");
  });

  it("(h) publica o `dado_ts` do payload buscado", async () => {
    responderCom(payloadFalso(1, "2026-10-04T23:00:00.000Z"));
    await montar("pres");
    expect(useDadoFrescorStore.getState().relogios[1]?.dadoTs).toBe("2026-10-04T23:00:00.000Z");
  });

  it("(i) `null` e chave ausente chegam crus, sem `??` pelo caminho", async () => {
    responderCom(payloadFalso(1, null));
    await montar("pres");
    expect(useDadoFrescorStore.getState().relogios[1]?.dadoTs).toBeNull();

    useDadoFrescorStore.setState({ pollers: {}, relogios: {} });
    await act(async () => root.unmount());

    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    responderCom(payloadFalso(1)); // sem a chave — payload pré-ADR-0038
    await montar("pres");
    const relogio = useDadoFrescorStore.getState().relogios[1];
    // Publicado (o poller falou) mas com o campo ausente: os dois fatos
    // precisam sobreviver à viagem, senão o banner confunde "canary em voo"
    // com "primeiro fetch ainda não voltou".
    expect(relogio).toEqual({ dadoTs: undefined });
  });

  it("(j) payload de OUTRO cargo não é publicado nesta chave", async () => {
    // A URL já determina o cargo; discordância significa endpoint devolvendo a
    // corrida errada. Publicar assim mesmo mandaria o relógio de um cargo para
    // o banner de outro — o "default silencioso de enum" que esta base já
    // pagou três vezes.
    responderCom(payloadFalso(5, "2026-10-04T23:00:00.000Z"));
    await montar("pres");
    expect(useDadoFrescorStore.getState().pollers[1]).toBe(1);
    expect(useDadoFrescorStore.getState().relogios[1]).toBeUndefined();
    expect(useDadoFrescorStore.getState().relogios[5]).toBeUndefined();
  });
});
