// @vitest-environment happy-dom
/**
 * tests/unit/components/ChoroplethMapUF.hoverCard.test.tsx
 *
 * 2026-09-18 — pedido do dono: o mapa MUNICIPAL (`ChoroplethMapUF`) ganha o
 * mesmo `<HoverCard>` do mapa nacional, com uma diferença deliberada: NUNCA
 * mostra a coluna "Proj." — município não tem projeção (o modelo extrapola
 * por ZONA e agrega para a UF, ADR-0021; ADR-0007 fixa zona como
 * granularidade do modelo).
 *
 * O que estes testes travam:
 *   (a) o balão aparece no hover, com título = nome do município e SEM
 *       "Proj." em lugar nenhum (nem cabeçalho, nem `data-testid`);
 *   (b) a identidade (nome/partido) vem da lista de candidatos DESTA UF
 *       (`EdgeUfCandidate[]`, `ADR-0042 item 2`) — um `id` que colidiria com
 *       outro candidato se resolvido contra um índice nacional/de outra UF
 *       resolve para a pessoa CERTA aqui;
 *   (c) município sem `votos_reportados` não fabrica linha nenhuma — o
 *       balão ainda aparece (título + apurado), mas zero linhas de
 *       candidato;
 *   (d) corta em top-3 mesmo com mais candidatos em `votos_reportados`;
 *   (e) `mouseleave` fecha o balão.
 *
 * Harness: MapLibre falso que grava os handlers registrados via `map.on(...)`
 * e permite disparar `mousemove`/`mouseleave` na camada `municipios-fill`
 * diretamente — mesmo padrão de
 * `NationalChoroplethMap.hoverVotosPctAtualAusente.test.tsx`, adaptado para a
 * API que `ChoroplethMapUF` realmente chama (`setFeatureState`, sem
 * `cameraForBounds`/`jumpTo` — este mapa usa `bounds`/`fitBoundsOptions` no
 * construtor, não `computeFrameCamera`).
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EdgeUfCandidate, EdgeUfMunicipio } from "@/lib/edge-config/types";

type Handler = (e: unknown) => void;

const espiao = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
}));

vi.mock("maplibre-gl", () => {
  class FakeMap {
    setFeatureState() {}
    setFilter() {}
    setPaintProperty() {}
    getCanvas() {
      return {
        style: {} as Record<string, string>,
        setAttribute() {},
        removeAttribute() {},
        tabIndex: 0,
      };
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

import { ChoroplethMapUF } from "@/components/atoms/maps/ChoroplethMapUF";

function cand(over: Partial<EdgeUfCandidate>): EdgeUfCandidate {
  return {
    id: 0,
    nome: "",
    partido: "",
    cor: "var(--color-cand-other)",
    votos_atuais: 0,
    votos_projetados: 0,
    pct_atual: 0,
    pct_projetado: 0,
    ci95: { lower: 0, upper: 0 },
    ...over,
  };
}

function municipio(over: Partial<EdgeUfMunicipio>): EdgeUfMunicipio {
  return {
    cod_ibge: "3550308",
    nome: "São Paulo",
    pct_apurado: 40,
    lider: { candidato_id: 13, partido: "PT", votos: 100, margem_pp: 10 },
    votos_reportados: {},
    ...over,
  };
}

// Candidatos DESTA UF. `id: 13` aqui é uma pessoa deliberadamente DIFERENTE
// da que um índice nacional (ou de outra UF) teria no mesmo número — é essa
// divergência que o teste (b) usa para provar que a resolução é local.
const CANDIDATOS_SP: EdgeUfCandidate[] = [
  cand({ id: 13, nome: "FERNANDA DA SILVA", partido: "PT", cor: "var(--party-pt)" }),
  cand({ id: 22, nome: "JOÃO DE SOUZA", partido: "PL", cor: "var(--party-pl)" }),
  cand({ id: 33, nome: "MARIA LIMA", partido: "PSOL", cor: "var(--party-psol)" }),
  cand({ id: 44, nome: "CARLOS ROCHA", partido: "PSD", cor: "var(--party-psd)" }),
  cand({ id: 55, nome: "ANA COSTA", partido: "MDB", cor: "var(--party-mdb)" }),
];

function montar(props: { detalhe?: EdgeUfMunicipio[]; candidatos?: EdgeUfCandidate[] } = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <ChoroplethMapUF
        ufSigla="SP"
        municipios={[{ cod_ibge: "3550308", cor: "var(--party-pt)", pctApurado: 40 }]}
        mode="leader"
        detalhe={props.detalhe}
        candidatos={props.candidatos}
      />,
    );
  });
  return { host, root };
}

function disparaHoverEmSp(codIbge = "3550308") {
  const onMouseMove = espiao.handlers.get("mousemove:municipios-fill");
  expect(onMouseMove, "handler de mousemove não foi registrado").toBeDefined();
  act(() => {
    onMouseMove?.({
      features: [{ properties: { CD_MUN: codIbge } }],
      originalEvent: { clientX: 10, clientY: 10 },
    });
  });
}

function disparaMouseLeave() {
  const onMouseLeave = espiao.handlers.get("mouseleave:municipios-fill");
  expect(onMouseLeave, "handler de mouseleave não foi registrado").toBeDefined();
  act(() => {
    onMouseLeave?.({});
  });
}

beforeEach(() => {
  espiao.handlers.clear();
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
  }
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("<ChoroplethMapUF /> — balão do hover (mesmo átomo do mapa nacional, sem Proj.)", () => {
  it("(a) hover mostra o balão com título = nome do município, e NUNCA a coluna 'Proj.' [mutação: remover a guarda `proj &&` do header em HoverCard.tsx faria 'Proj.' reaparecer sozinho]", () => {
    const { host, root } = montar({
      detalhe: [municipio({ votos_reportados: { 13: 900, 22: 500 } })],
      candidatos: CANDIDATOS_SP,
    });
    disparaHoverEmSp();

    const card = host.querySelector('[data-testid="hover-card"]');
    expect(card).not.toBeNull();
    expect(host.querySelector('[data-testid="hover-card-title"]')?.textContent).toBe("São Paulo");
    expect(card?.textContent).not.toContain("Proj.");
    expect(host.querySelectorAll('[data-testid="hover-card-proj"]').length).toBe(0);

    act(() => root.unmount());
    host.remove();
  });

  it("(b) identidade vem da lista de candidatos DESTA UF, não de um índice genérico [mutação: trocar `candidatosAtuais`/`candidatos` por um array vazio faria cair no fallback 'Candidato {id}' — este teste apanharia]", () => {
    const { host, root } = montar({
      detalhe: [municipio({ votos_reportados: { 13: 900, 22: 500 } })],
      candidatos: CANDIDATOS_SP,
    });
    disparaHoverEmSp();

    const nomes = Array.from(host.querySelectorAll(".overflow-hidden.text-ellipsis")).map(
      (e) => e.textContent,
    );
    // Nomes resolvidos contra CANDIDATOS_SP — nunca "Candidato 13"/"Candidato 22".
    expect(nomes.some((n) => n?.includes("SILVA"))).toBe(true);
    expect(nomes).not.toContain("Candidato 13");
    expect(host.querySelectorAll('[data-testid="hover-card-partido"]')[0]?.textContent).toBe("PT");

    act(() => root.unmount());
    host.remove();
  });

  it("(c) município sem votos_reportados não fabrica linha nenhuma — o balão aparece (título + apurado), zero candidatos [mutação: trocar `Object.entries(municipio.votos_reportados ?? {})` por um array fixo de 1 item faria este teste apanhar uma linha fantasma]", () => {
    const { host, root } = montar({
      detalhe: [municipio({ votos_reportados: {} })],
      candidatos: CANDIDATOS_SP,
    });
    disparaHoverEmSp();

    expect(host.querySelector('[data-testid="hover-card"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="hover-card-apurado"]')?.textContent).toBe(
      "40% apurado",
    );
    expect(host.querySelectorAll('[data-testid="hover-card-votos"]').length).toBe(0);
    expect(host.querySelectorAll('[data-testid="hover-card-parcial"]').length).toBe(0);
    // Nenhuma linha de candidato fabricada (nem nome, nem ponto de cor).
    expect(host.querySelectorAll(".overflow-hidden.text-ellipsis").length).toBe(0);

    act(() => root.unmount());
    host.remove();
  });

  it("(d) corta em top-3 mesmo com mais candidatos em votos_reportados [mutação: trocar `.slice(0, 3)` por `.slice(0, 5)` em ChoroplethMapUF.tsx faria este teste apanhar 5 linhas]", () => {
    const { host, root } = montar({
      detalhe: [
        municipio({
          votos_reportados: { 13: 900, 22: 800, 33: 700, 44: 600, 55: 500 },
        }),
      ],
      candidatos: CANDIDATOS_SP,
    });
    disparaHoverEmSp();

    expect(host.querySelectorAll('[data-testid="hover-card-votos"]').length).toBe(3);
    // Os TRÊS mais votados — 13, 22, 33 (900/800/700) — não 44/55.
    const votos = Array.from(host.querySelectorAll('[data-testid="hover-card-votos"]')).map(
      (e) => e.textContent,
    );
    expect(votos).toEqual(["900", "800", "700"]);

    act(() => root.unmount());
    host.remove();
  });

  it("(e) mouseleave fecha o balão [mutação: apagar `setTooltip(null)` do handler de mouseleave faria este teste apanhar o cartão ainda visível]", () => {
    const { host, root } = montar({
      detalhe: [municipio({ votos_reportados: { 13: 900 } })],
      candidatos: CANDIDATOS_SP,
    });
    disparaHoverEmSp();
    expect(host.querySelector('[data-testid="hover-card"]')).not.toBeNull();

    disparaMouseLeave();
    expect(host.querySelector('[data-testid="hover-card"]')).toBeNull();

    act(() => root.unmount());
    host.remove();
  });

  it("(f) sem a prop `detalhe`, hover não quebra e não mostra balão nenhum — degradação honesta em vez de cartão pela metade [mutação: remover a guarda `if (!municipio) { setTooltip(null); return; }` faria este teste explodir ou vazar um cartão sem dado]", () => {
    const { host, root } = montar({ candidatos: CANDIDATOS_SP });
    expect(() => disparaHoverEmSp()).not.toThrow();
    expect(host.querySelector('[data-testid="hover-card"]')).toBeNull();

    act(() => root.unmount());
    host.remove();
  });
});
