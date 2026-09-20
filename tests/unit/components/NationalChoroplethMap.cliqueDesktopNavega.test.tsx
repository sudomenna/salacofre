// @vitest-environment happy-dom
/**
 * tests/unit/components/NationalChoroplethMap.cliqueDesktopNavega.test.tsx
 *
 * 2026-09-19 (decisão do dono): clicar numa UF do mapa nacional volta a
 * NAVEGAR para a página daquele estado — **no desktop**. No mobile continua
 * abrindo a `<StateResultSheet>`, como decidido em 08/09. Vale nos três mapas
 * nacionais: Presidente (`/`), Governador (`/governador`) e Senador
 * (`/senador`).
 *
 * Este arquivo cobre o comportamento inteiro, fim a fim dentro do componente:
 * monta o WRAPPER público (`<NationalChoroplethMap>`, que é quem resolve a
 * media query) e dispara o handler de clique que o IMPL registra no MapLibre
 * (que é quem navega). Testar só o impl não provaria nada: o defeito que mais
 * assusta nesta mudança é de FIAÇÃO entre os dois níveis.
 *
 * ## O que cada caso mata
 *
 *   1. `it.each` sobre os três cargos — mata `ufHref("pres", …)` cravado e
 *      qualquer template escrito à mão sem o sufixo de rota. 🔴 **Um cargo só
 *      não bastaria**: com `cargo` ignorado, o caso de Presidente passa (o
 *      sufixo dele é ""), e só gov/sen denunciam.
 *   2. Mobile — mata "navegar sempre".
 *   3. 🔴 A media query virando MOBILE **depois da montagem** — mata capturar
 *      `navegarNoClique` numa closure do `mount()`. É o defeito mais provável
 *      desta mudança, porque o valor NASCE `false` (o `matchMedia` do wrapper
 *      só resolve no `useEffect`) e vira `true` um tick depois: uma closure
 *      congelaria o `false` e o desktop nunca navegaria. O caso abaixo testa
 *      a direção inversa (true → false) porque ela é a que discrimina: com
 *      closure, o mapa montado em desktop continuaria navegando depois de
 *      virar mobile.
 *   4. Desktop usa `router.push`, não navegação dura — mata `<a href>` /
 *      `location.assign` / `location.href =`, que remontariam a instância
 *      MapLibre da moldura persistente (o defeito que o ADR-0033 § 1 existe
 *      para evitar).
 *   5. Desktop não abre a folha — mata "navega E abre", que deixaria a ficha
 *      piscando por cima da transição de rota.
 *
 * ## Harness
 *
 *   - MapLibre falso, no mesmo molde de
 *     `NationalChoroplethMap.hoverIdentidadePorUf.test.tsx`: grava os handlers
 *     por evento/camada para que o teste dispare o clique REAL do produto, e
 *     não uma função interna não-exportada.
 *   - `next/dynamic` substituído por um carregador SÍNCRONO do impl. O wrapper
 *     usa `next/dynamic({ ssr: false })`, cujo `React.lazy` não resolve dentro
 *     de um `act()` síncrono em happy-dom; o que se afere aqui é a fiação de
 *     props entre wrapper e impl, não o carregamento preguiçoso (esse é do
 *     `ANALYZE`/e2e). O mock recebe as MESMAS props que o `dynamic` real
 *     receberia, então um wrapper que esqueça de passar `navegarNoClique`
 *     continua sendo pego.
 *   - `next/navigation` mockado: `useRouter().push` é um espião. É a única
 *     forma de observar a navegação sem App Router montado.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EdgeUfRow } from "@/lib/edge-config/types";

// ---------------------------------------------------------------------------
// Mocks (hoisted)
// ---------------------------------------------------------------------------

type Handler = (e: unknown) => void;

const espiao = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  push: vi.fn(),
}));

vi.mock("maplibre-gl", () => {
  class FakeMap {
    cameraForBounds() {
      return { center: [-51.415, -14.24] as [number, number], zoom: 3 };
    }
    jumpTo() {}
    setPaintProperty() {}
    setFilter() {}
    getCanvas() {
      return { style: {} };
    }
    isStyleLoaded() {
      return true;
    }
    loaded() {
      return true;
    }
    remove() {}
    on(event: string, a: unknown, b?: unknown) {
      if (typeof a === "function") {
        espiao.handlers.set(event, a as Handler);
      } else {
        espiao.handlers.set(`${event}:${String(a)}`, b as Handler);
      }
    }
  }
  return { default: { Map: FakeMap } };
});
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("@/components/atoms/maps/_pmtiles-protocol", () => ({
  registerPmtilesProtocolOnce: () => {},
  resetPmtilesProtocol: () => {},
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: espiao.push,
    replace: () => {},
    prefetch: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
  }),
}));

/** Carrega o impl de verdade, sem o `React.lazy` do `next/dynamic`. */
vi.mock("next/dynamic", async () => {
  const mod = await import("@/components/blocks/_NationalChoroplethMapImpl");
  return { default: () => mod.NationalChoroplethMapImpl };
});

import { NationalChoroplethMap } from "@/components/blocks/NationalChoroplethMap";
import { type UfPickerCargo, ufHref } from "@/lib/utils/uf-href";

// ---------------------------------------------------------------------------
// `window.matchMedia` controlável
// ---------------------------------------------------------------------------

/** Mesmo valor de `DESKTOP_QUERY` em `NationalChoroplethMap.tsx` (ADR-0029). */
const DESKTOP_QUERY = "(min-width: 960px)";

type MqlListener = (e: MediaQueryListEvent) => void;

let desktop = false;
const ouvintes = new Set<MqlListener>();

function instalaMatchMedia() {
  window.matchMedia = ((query: string) => {
    // 🔴 `matches: true` SÓ para a query de desktop. O impl também consulta
    // `(prefers-reduced-motion: reduce)` na montagem; um `matches: true`
    // indiscriminado responderia "sim" às duas e o teste passaria a afirmar
    // algo sobre a query errada.
    const eDesktop = query === DESKTOP_QUERY;
    return {
      media: query,
      matches: eDesktop ? desktop : false,
      onchange: null,
      addEventListener: (_tipo: string, cb: MqlListener) => {
        if (eDesktop) ouvintes.add(cb);
      },
      removeEventListener: (_tipo: string, cb: MqlListener) => {
        ouvintes.delete(cb);
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  }) as unknown as typeof window.matchMedia;
}

/** Dispara o evento `change` real do `matchMedia`, como o browser faria. */
function viraViewport(paraDesktop: boolean) {
  desktop = paraDesktop;
  act(() => {
    for (const cb of ouvintes) cb({ matches: paraDesktop } as MediaQueryListEvent);
  });
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const ROW_SP: EdgeUfRow = {
  sigla: "SP",
  pct_apurado: 40,
  lider: 13,
  margem_atual: 10,
  margem_projetada: 10,
  margem_projetada_ci: [8, 12],
  chamada: false,
  swing_vs_2022: null,
  top_candidatos: [
    { id: 13, pct: 55, nome: "FERNANDA DA SILVA", partido: "PT" },
    { id: 22, pct: 45, nome: "ROBERTO ALVES", partido: "PL" },
  ],
  vai_a_2t: null,
  bucket: "indefinido",
};

function montar(cargo: UfPickerCargo) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <NationalChoroplethMap candidatoAId={13} rows={[ROW_SP]} view="winner" cargo={cargo} />,
    );
  });
  return { host, root };
}

function clicaEmSp() {
  const onClick = espiao.handlers.get("click:ufs-fill");
  expect(onClick, "handler de click não foi registrado pelo impl").toBeDefined();
  act(() => {
    onClick?.({
      features: [{ properties: { SIGLA_UF: "SP" } }],
      originalEvent: { clientX: 10, clientY: 10 },
    });
  });
}

function desmonta(host: HTMLElement, root: Root) {
  act(() => root.unmount());
  host.remove();
}

beforeEach(() => {
  espiao.handlers.clear();
  espiao.push.mockClear();
  ouvintes.clear();
  desktop = false;
  instalaMatchMedia();
});

afterEach(() => {
  document.body.innerHTML = "";
});

// ---------------------------------------------------------------------------

describe("clique numa UF do mapa nacional (RF-030.3, decisão 2026-09-19)", () => {
  it.each([
    ["pres" as const, "/uf/SP"],
    ["gov" as const, "/uf/SP/governador"],
    ["sen" as const, "/uf/SP/senador"],
  ])("desktop, cargo=%s → navega para %s", (cargo, destino) => {
    desktop = true;
    const { host, root } = montar(cargo);
    clicaEmSp();

    expect(espiao.push).toHaveBeenCalledTimes(1);
    expect(espiao.push).toHaveBeenCalledWith(destino);
    // Redundante de propósito: amarra o destino esperado ao módulo que é a
    // fonte única dele, para que renomear uma rota quebre este teste junto.
    expect(destino).toBe(ufHref(cargo, "SP"));

    desmonta(host, root);
  });

  it("mobile → NÃO navega; abre a folha do estado", () => {
    desktop = false;
    const { host, root } = montar("gov");
    clicaEmSp();

    expect(espiao.push).not.toHaveBeenCalled();
    // A folha só existe no DOM quando aberta (`Sheet.tsx`: `if (!open) return null`).
    expect(host.querySelector('[data-testid="sheet"]'), "folha não abriu no mobile").not.toBeNull();
    expect(host.querySelector('[data-testid="state-sheet-cta"]')).not.toBeNull();

    desmonta(host, root);
  });

  it("🔴 media query vira MOBILE depois da montagem → o clique volta a abrir a folha", () => {
    // Com `navegarNoClique` capturado numa closure do `mount()` (o efeito que
    // registra o handler roda UMA vez), este caso continuaria navegando — o
    // handler ainda enxergaria o `true` da montagem.
    desktop = true;
    const { host, root } = montar("sen");

    viraViewport(false);
    clicaEmSp();

    expect(espiao.push).not.toHaveBeenCalled();
    expect(host.querySelector('[data-testid="sheet"]')).not.toBeNull();

    desmonta(host, root);
  });

  it("desktop → navegação SOFT (`router.push`), nunca dura", () => {
    // Um `<a href>` cru ou `location.assign` remontaria a instância MapLibre
    // da moldura persistente — ADR-0033 § 1. `/` e `/uf/[sigla]` são irmãos
    // sob o MESMO `layout.tsx` de grupo; só `router.push` preserva o mapa.
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    const hrefAntes = window.location.href;

    desktop = true;
    const { host, root } = montar("pres");
    clicaEmSp();

    expect(espiao.push).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
    expect(window.location.href).toBe(hrefAntes);

    assign.mockRestore();
    desmonta(host, root);
  });

  it("desktop → a folha NÃO abre junto com a navegação", () => {
    desktop = true;
    const { host, root } = montar("gov");
    clicaEmSp();

    expect(host.querySelector('[data-testid="state-sheet-cta"]')).toBeNull();
    expect(host.querySelector('[data-testid="sheet"]')).toBeNull();

    desmonta(host, root);
  });
});
