// @vitest-environment happy-dom
/**
 * tests/unit/shell/persistent-map-frame.senadorNacional.test.tsx
 *
 * 2026-09-18 — pedido do dono: "para senador vamos fazer a mesma coisa"
 * (a mesma moldura de mapa nacional que Governador ganhou nesta sessão).
 * `PersistentMapFrame.tsx` (ramo `cargo === "sen"`) monta o MESMO
 * `<NationalMapBlock variant="frame">` no nível Brasil, com `cargo="sen"`.
 *
 * Diferença de Governador que este arquivo trava: Senador NÃO tem nível UF
 * nesta moldura (spec 016 § Escopo/Fora — sem dado municipal). Com `sigla`
 * presente, a moldura deve mostrar um painel textual, SEM montar
 * `<NationalMapBlock>` nem `<UfLeaderMapLazy>`, e sem chamar
 * `/api/projection/municipios` — esse endpoint não tem ramo para `cargo=sen`
 * (`resolveCargoETurno`, `app/api/projection/municipios/route.ts` cai no
 * default PRESIDENCIAL para qualquer valor que não seja `"gov"`), e chamá-lo
 * pintaria o município de Presidente sob o rótulo "Senado" em silêncio.
 *
 * O que este arquivo trava:
 *   (a) payload normal, nível Brasil → `<NationalMapBlock cargo="sen">` monta;
 *   (b) fase pré-eleição / `por_uf` vazio → não monta, mantém o texto de espera;
 *   (c) URL de busca é `/api/projection?cargo=sen` (não `?cargo=gov` nem a
 *       rota padrão de Presidente);
 *   (d) nível UF (`sigla` presente) → NENHUM `<NationalMapBlock>` monta, e
 *       nenhum `fetch` a `/api/projection/municipios` acontece.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EdgePayload } from "@/lib/edge-config/types";

const paramsState = vi.hoisted(() => ({ sigla: undefined as string | undefined }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ sigla: paramsState.sigla }),
  usePathname: () => "/senador",
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

function payloadSen(
  porUf: EdgePayload["por_uf"],
  fase: "pre_eleicao" | "normal" = "normal",
): EdgePayload {
  return {
    ts: "2026-10-04T23:00:00.000Z",
    cargo: 5,
    turno: 1,
    fase,
    national: { candidatos: [{ id: 13, rank: 1 }], candidato_a_id: 13 },
    por_uf: porUf,
    // biome-ignore lint/suspicious/noExplicitAny: payload parcial de teste
  } as any;
}

const UF_ROW = {
  sigla: "AC",
  pct_apurado: 20,
  lider: 13,
  margem_atual: 5,
  margem_projetada: 5,
  margem_projetada_ci: [3, 7],
  chamada: false,
  swing_vs_2022: null,
  top_candidatos: [{ id: 13, pct: 40 }],
  vai_a_2t: null,
  bucket: "indefinido",
  // biome-ignore lint/suspicious/noExplicitAny: EdgeUfRow parcial de teste
} as any;

describe("PersistentMapFrame — nível Brasil de Senador usa o coroplético (mesmo de Presidente/Governador)", () => {
  let container: HTMLElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    espiao.chamadas = [];
    paramsState.sigla = undefined;
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
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => payload }));
    vi.stubGlobal("fetch", fetchMock);
  }

  it('(a) payload normal → <NationalMapBlock cargo="sen"> monta, com a etiqueta "2 vagas"', async () => {
    responderCom(payloadSen([UF_ROW], "normal"));
    await act(async () => {
      root.render(<PersistentMapFrame cargo="sen" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const el = container.querySelector('[data-testid="national-map-block-falso"]');
    expect(el, "NationalMapBlock não foi montado").not.toBeNull();
    expect(el?.getAttribute("data-cargo")).toBe("sen");

    expect(espiao.chamadas).toHaveLength(1);
    expect(espiao.chamadas[0]?.variant).toBe("frame");
    expect(espiao.chamadas[0]?.scopeLabel).toContain("Senador");
    // RF-106/D1 — o rótulo de duas vagas chega à superfície do mapa.
    expect(espiao.chamadas[0]?.scopeLabel).toContain("2 vagas");
    expect(espiao.chamadas[0]?.rows).toEqual([UF_ROW]);
  });

  it("(b) fase pré-eleição → NÃO monta <NationalMapBlock>; mantém o texto de espera (RF-157)", async () => {
    responderCom(payloadSen([], "pre_eleicao"));
    await act(async () => {
      root.render(<PersistentMapFrame cargo="sen" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="national-map-block-falso"]')).toBeNull();
    expect(espiao.chamadas).toHaveLength(0);
    expect(container.textContent).toContain("A eleição ainda não começou");
  });

  it('(c) a busca do payload usa "/api/projection?cargo=sen", não a rota padrão nem "?cargo=gov"', async () => {
    // Mutação: remover o ramo `cargo === "pres"` do ternário de `url` (ou
    // esquecer "sen" nele) faz este teste falhar — a moldura buscaria a
    // rota padrão (Presidente) ou 404/503 em silêncio.
    responderCom(payloadSen([UF_ROW], "normal"));
    await act(async () => {
      root.render(<PersistentMapFrame cargo="sen" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/projection?cargo=sen");
  });

  it("(d) nível UF — NENHUM <NationalMapBlock> monta, e NENHUM fetch a /api/projection/municipios acontece", async () => {
    // Senador não tem dado municipal (spec 016 § Escopo/Fora) — mutação:
    // remover a guarda `cargo === "sen"` dos dois efeitos de nível UF em
    // `PersistentMapFrame.tsx` faz este teste falhar na 2ª asserção (o mock
    // de fetch veria uma chamada a `/api/projection/municipios?...`).
    paramsState.sigla = "SP";
    responderCom(payloadSen([UF_ROW], "normal"));
    await act(async () => {
      root.render(<PersistentMapFrame cargo="sen" />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="national-map-block-falso"]')).toBeNull();
    expect(espiao.chamadas).toHaveLength(0);
    const chamadasMunicipios = fetchMock.mock.calls
      .map((args) => String(args[0]))
      .filter((url) => url.includes("/api/projection/municipios"));
    expect(chamadasMunicipios).toHaveLength(0);
    const chamadasUfResumo = fetchMock.mock.calls
      .map((args) => String(args[0]))
      .filter((url) => url.startsWith("/api/projection?uf="));
    expect(chamadasUfResumo).toHaveLength(0);
    // O painel textual de ausência aparece, não um mapa mudo.
    expect(container.textContent).toContain("SP");
  });
});
