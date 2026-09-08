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

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  usePathname: () => "/",
}));

import GovLayout from "@/app/(gov)/layout";
import PresLayout from "@/app/(pres)/layout";

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
