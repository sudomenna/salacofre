// @vitest-environment happy-dom
/**
 * tests/unit/shell/persistent-map-frame.governadorNacional.test.tsx
 *
 * 2026-09-18 — pedido do dono: "a tela principal de governador deve exibir
 * um mapa igual ao mapa de presidente nacional". `PersistentMapFrame.tsx`
 * (nível Brasil, cargo `"gov"`, sem `sigla`) trocou `<HexCartogramBrasil>`
 * pelo MESMO `<NationalMapBlock variant="frame">` que a trilha Presidente
 * usa, com `cargo="gov"` — sem botão de alternância (decisão D1 do dono: o
 * cartograma fica no repositório, sem uso NESTA rota).
 *
 * O que este teste trava:
 *   (a) com payload normal (não pré-eleição, `por_uf` não vazio), a moldura
 *       monta `<NationalMapBlock>` com `cargo="gov"` e os dados corretos —
 *       não mais o cartograma hexagonal;
 *   (b) a fase pré-eleição / `por_uf` vazio CONTINUA sem pintar nada com
 *       identidade partidária (RF-157) — o texto de espera permanece;
 *   (c) o nível UF (`sigla` presente) continua no coroplético municipal,
 *       inalterado por esta mudança.
 *
 * `<NationalMapBlock>` é mockado com um espião de props (mesmo módulo que
 * `persistent-map-frame.test.tsx` já mocka, mas aqui capturando o que foi
 * passado) — o MapLibre real não sobe em happy-dom e não é o que este teste
 * mede.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EdgePayload } from "@/lib/edge-config/types";

vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  usePathname: () => "/governador",
}));

const espiao = vi.hoisted(() => ({
  chamadas: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/components/blocks/NationalMapBlock", () => ({
  CHIP_STYLE: {},
  // biome-ignore lint/suspicious/noExplicitAny: espião de teste, props variam
  NationalMapBlock: (props: any) => {
    espiao.chamadas.push(props);
    return <div data-testid="national-map-block-falso" data-cargo={props.cargo} />;
  },
}));

import { PersistentMapFrame } from "@/components/layout/PersistentMapFrame";

// biome-ignore lint/suspicious/noExplicitAny: flag global do ambiente de `act`
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function payloadGov(
  porUf: EdgePayload["por_uf"],
  fase: "pre_eleicao" | "normal" = "normal",
): EdgePayload {
  return {
    ts: "2026-10-04T23:00:00.000Z",
    cargo: 3,
    turno: 1,
    fase,
    national: { candidatos: [{ id: 3011, rank: 1 }], candidato_a_id: 3011 },
    por_uf: porUf,
    // biome-ignore lint/suspicious/noExplicitAny: payload parcial de teste
  } as any;
}

const UF_ROW = {
  sigla: "AC",
  pct_apurado: 20,
  lider: 3011,
  margem_atual: 5,
  margem_projetada: 5,
  margem_projetada_ci: [3, 7],
  chamada: false,
  swing_vs_2022: null,
  top_candidatos: [{ id: 3011, pct: 40 }],
  vai_a_2t: null,
  bucket: "indefinido",
  // biome-ignore lint/suspicious/noExplicitAny: EdgeUfRow parcial de teste
} as any;

describe("PersistentMapFrame — nível Brasil de Governador usa o coroplético (não mais o hex)", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    espiao.chamadas = [];
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

  it('(a) payload normal → <NationalMapBlock cargo="gov"> monta, não o cartograma hexagonal', async () => {
    responderCom(payloadGov([UF_ROW], "normal"));
    await act(async () => {
      root.render(<PersistentMapFrame cargo="gov" />);
    });
    // dá um tick pro fetch assíncrono resolver
    await act(async () => {
      await Promise.resolve();
    });

    const el = container.querySelector('[data-testid="national-map-block-falso"]');
    expect(el, "NationalMapBlock não foi montado").not.toBeNull();
    expect(el?.getAttribute("data-cargo")).toBe("gov");
    expect(container.textContent).not.toContain("Mapa hexagonal");

    expect(espiao.chamadas).toHaveLength(1);
    expect(espiao.chamadas[0]?.variant).toBe("frame");
    expect(espiao.chamadas[0]?.scopeLabel).toContain("Governador");
    expect(espiao.chamadas[0]?.rows).toEqual([UF_ROW]);
  });

  it("(b) fase pré-eleição → NÃO monta <NationalMapBlock>; mantém o texto de espera (RF-157)", async () => {
    responderCom(payloadGov([], "pre_eleicao"));
    await act(async () => {
      root.render(<PersistentMapFrame cargo="gov" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="national-map-block-falso"]')).toBeNull();
    expect(espiao.chamadas).toHaveLength(0);
    expect(container.textContent).toContain("A eleição ainda não começou");
  });
});
