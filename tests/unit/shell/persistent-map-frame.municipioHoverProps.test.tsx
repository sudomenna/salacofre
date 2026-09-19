// @vitest-environment happy-dom
/**
 * tests/unit/shell/persistent-map-frame.municipioHoverProps.test.tsx
 *
 * 2026-09-18 (achado do dono, ao vivo em `/uf/sp`) — o balão do hover
 * municipal (`ChoroplethMapUF`) tinha as props certas e ninguém as
 * alimentava: `PersistentMapFrame` monta `<UfLeaderMapLazy>` sem `detalhe`
 * nem `candidatos`, então `ChoroplethMapUF` sempre recebe `undefined` nos
 * dois, e o balão NUNCA aparece em produção — mesmo com 11 testes
 * (`ChoroplethMapUF.hoverCard.test.tsx`, `municipio-votos.test.ts`) todos
 * verdes, porque nenhum deles renderizava a partir do PAI de verdade.
 *
 * Este arquivo exercita exatamente essa costura: `PersistentMapFrame` →
 * `UfLeaderMapLazy`. A prova de que ele discrimina o defeito real está na
 * mutação aplicada ao vivo nesta sessão (registrada no relatório): apagar
 * `detalhe={municipiosDaUf}` de `PersistentMapFrame.tsx` derruba o teste (a).
 *
 * ## Por que este teste NÃO desce até `ChoroplethMapUF`/MapLibre
 *
 * `UfLeaderMapLazy` (`components/blocks/UfMapsLazy.tsx`) importa
 * `ChoroplethMapUF` via `next/dynamic({ ssr: false })`. O precedente já
 * registrado neste repositório (`tests/unit/shell/persistent-map-frame.test.tsx`,
 * comentário acima do mock de `NationalMapBlock`) documenta o mesmo obstáculo
 * para o bloco de mapa NACIONAL: o `next/dynamic` "não sobe em happy-dom" —
 * não há runtime de chunk do Next fora de um build real, e o componente por
 * trás dele monta `maplibregl.Map` de verdade. Este arquivo segue o MESMO
 * precedente: mocka `@/components/blocks/UfMapsLazy` (a fronteira exportada,
 * de onde `PersistentMapFrame` importa `UfLeaderMapLazy`) para capturar as
 * props que ela RECEBE, sem atravessar `next/dynamic`.
 *
 * O elo que falta entre este teste e `ChoroplethMapUF.hoverCard.test.tsx`
 * (que prova que `ChoroplethMapUF`, alimentado, mostra o balão) é
 * `UfLeaderMapLazy` repassar `detalhe`/`candidatos` para `ChoroplethMapUF`
 * sem transformação — 2 linhas de passagem direta de prop
 * (`UfMapsLazy.tsx`), conferidas por leitura + typecheck, não por mais um
 * mock: introduzir um SEGUNDO nível de mock ali só re-provaria a mesma
 * passagem de prop que este arquivo já prova na fronteira de cima.
 *
 * Harness: mesmo padrão de `persistent-map-frame.test.tsx` (mock de
 * `next/navigation`, `fetch` global stub por URL, `act(async () => …)` para
 * assentar os três `useEffect` que buscam payload/resumo/detalhe).
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// biome-ignore lint/suspicious/noExplicitAny: flag global do ambiente de `act`
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  useParams: () => ({ sigla: "sp" }),
  usePathname: () => "/uf/sp",
}));

vi.mock("@/components/blocks/NationalMapBlock", () => ({
  CHIP_STYLE: {},
  NationalMapBlock: () => <div data-testid="mapa-nacional-falso" />,
}));

const espiaoProps = vi.hoisted(() => ({
  chamadas: [] as Array<{ detalhe: unknown; candidatos: unknown }>,
}));

vi.mock("@/components/blocks/UfMapsLazy", () => ({
  UfLeaderMapLazy: (props: { detalhe?: unknown; candidatos?: unknown }) => {
    espiaoProps.chamadas.push({ detalhe: props.detalhe, candidatos: props.candidatos });
    return <div data-testid="uf-leader-map-fake" />;
  },
}));

import { PersistentMapFrame } from "@/components/layout/PersistentMapFrame";
import { useDadoFrescorStore } from "@/lib/state/dado-freshness-store";

const PAYLOAD_NACIONAL = {
  ts: "2026-09-18T20:00:00.000Z",
  cargo: 1,
  turno: 1,
  national: { candidatos: [], candidato_a_id: null },
  por_uf: [],
};

const CANDIDATOS_SP = [
  {
    id: 13,
    nome: "FERNANDA DA SILVA",
    partido: "PT",
    cor: "var(--party-pt)",
    votos_atuais: 900,
    votos_projetados: 900,
    pct_atual: 64.3,
    pct_projetado: 64.3,
    ci95: { lower: 60, upper: 68 },
  },
];

const UF_RESUMO = {
  uf: "SP",
  ts: "2026-09-18T20:00:00.000Z",
  cargo: 1,
  turno: 1,
  pct_apurado: 40,
  candidatos: CANDIDATOS_SP,
  needle_position: 0,
  needle_band: "tossup",
};

const MUNICIPIOS_SP = [
  {
    cod_ibge: "3550308",
    nome: "São Paulo",
    pct_apurado: 40,
    lider: { candidato_id: 13, partido: "PT", votos: 900, margem_pp: 30 },
    votos_reportados: { 13: 900, 22: 500 },
  },
];

function respostaPara(url: string) {
  if (url.startsWith("/api/projection/municipios")) {
    return { status: "ok", municipios: MUNICIPIOS_SP };
  }
  if (url.startsWith("/api/projection?uf=")) {
    return UF_RESUMO;
  }
  if (url.startsWith("/api/projection")) {
    return PAYLOAD_NACIONAL;
  }
  throw new Error(`URL inesperada no fetch falso: ${url}`);
}

describe("PersistentMapFrame → UfLeaderMapLazy — detalhe/candidatos chegam ao mapa municipal", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    espiaoProps.chamadas = [];
    useDadoFrescorStore.setState({ pollers: {}, relogios: {} });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({ ok: true, json: async () => respostaPara(url) })),
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function montar() {
    await act(async () => {
      root.render(<PersistentMapFrame cargo="pres" />);
    });
    // Os três `fetch` (nacional, resumo da UF, detalhe municipal) resolvem em
    // ticks de microtask separados — mais uma rodada de `act` assíncrona
    // assenta os `setState` em cascata antes de inspecionar as props.
    await act(async () => {
      await Promise.resolve();
    });
  }

  it("(a) 🔴 detalhe (EdgeUfMunicipio[], com votos_reportados) e candidatos (EdgeUfCandidate[], da UF) chegam ao componente do mapa municipal [mutação testada ao vivo: apagar `detalhe={municipiosDaUf}` da JSX de PersistentMapFrame.tsx derruba este teste]", async () => {
    await montar();

    expect(espiaoProps.chamadas.length).toBeGreaterThan(0);
    const ultima = espiaoProps.chamadas.at(-1);
    expect(ultima?.detalhe).toEqual(MUNICIPIOS_SP);
    expect(ultima?.candidatos).toEqual(CANDIDATOS_SP);
  });

  it("(b) antes do resumo da UF chegar, `candidatos` é `undefined` — nunca um array inventado [mutação: trocar `ufResumo?.candidatos` por `ufResumo?.candidatos ?? []` esconderia a diferença entre 'ainda não chegou' e 'chegou vazio']", async () => {
    // `fetch` nunca resolve para o resumo da UF nesta rodada — simula o
    // intervalo real em que `ufResumo` ainda é `null` (busca client-side em
    // voo). `detalhe`/nacional respondem normalmente.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.startsWith("/api/projection?uf=")) {
          return new Promise(() => {}); // nunca resolve nesta rodada
        }
        return { ok: true, json: async () => respostaPara(url) };
      }),
    );

    await montar();

    const ultima = espiaoProps.chamadas.at(-1);
    expect(ultima?.candidatos).toBeUndefined();
    // `detalhe`, que não depende de `ufResumo`, já chegou.
    expect(ultima?.detalhe).toEqual(MUNICIPIOS_SP);
  });
});
