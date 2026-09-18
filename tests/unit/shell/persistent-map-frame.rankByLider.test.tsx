// @vitest-environment happy-dom
/**
 * tests/unit/shell/persistent-map-frame.rankByLider.test.tsx
 *
 * 2026-09-18 (2ª rodada, achado do `constitution-guard`) —
 * `PersistentMapFrame.tsx` copiava, para o ramo `cargo="gov"`, o MESMO
 * `Object.fromEntries(national.candidatos.map(c => [c.id, c.rank]))` que o
 * ramo de Presidente usa (seguro lá porque `id` é único no país inteiro numa
 * corrida presidencial).
 *
 * Em cargo 3 (Governador), `id` é o número de urna — que em corrida
 * majoritária é o número do PARTIDO — e o MESMO partido concorre a
 * governador em várias UFs com o MESMO número. `national.candidatos` é a
 * união de 27 corridas (RF-145): o `Object.fromEntries` colapsava, por `id`,
 * o `rank` de até 27 UFs num só valor — a ÚLTIMA UF do array vencendo em
 * silêncio.
 *
 * A correção: `cargo="gov"` NÃO passa `rankByLider` a `<NationalMapBlock>` —
 * cai no fallback documentado (`rankFor` → 99) em vez de um valor colidido.
 * `cargo="pres"` continua construindo e passando `rankByLider` normalmente
 * (comportamento inalterado — `id` é único nessa corrida).
 *
 * 🔴 2026-09-18 (2ª rodada, senador) — `cargo="sen"` sofre do MESMO defeito
 * que `cargo="gov"` e pela MESMA razão (corrida majoritária, número de urna =
 * número do partido, `national.candidatos` é união de 27 UFs — RF-145 cobre
 * os dois cargos 3 e 5 explicitamente). Reaproveita a MESMA fixture
 * `payloadComIdColidindo`, parametrizada pelo código de cargo.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EdgePayload } from "@/lib/edge-config/types";

vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  usePathname: () => "/",
}));

const espiao = vi.hoisted(() => ({
  chamadas: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/components/blocks/NationalMapBlock", () => ({
  CHIP_STYLE: {},
  // biome-ignore lint/suspicious/noExplicitAny: espião de teste, props variam
  NationalMapBlock: (props: any) => {
    espiao.chamadas.push(props);
    return <div data-testid="national-map-block-falso" />;
  },
}));

import { PersistentMapFrame } from "@/components/layout/PersistentMapFrame";

// biome-ignore lint/suspicious/noExplicitAny: flag global do ambiente de `act`
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * `national.candidatos` com `id` COLIDINDO entre "UFs" — a forma real do
 * defeito: o mesmo número de urna (13, PT) aparece em duas entradas com
 * `rank` diferente (1ª colocado no Acre, 3º colocado na Bahia, por exemplo).
 * `Object.fromEntries` ingenuamente ficaria só com o ÚLTIMO — aqui, rank 3.
 */
function payloadComIdColidindo(cargo: 1 | 3 | 5): EdgePayload {
  return {
    ts: "2026-10-04T23:00:00.000Z",
    cargo,
    turno: 1,
    fase: "normal",
    national: {
      candidatos: [
        { id: 13, rank: 1 }, // "Acre": 13 em 1º
        { id: 13, rank: 3 }, // "Bahia": MESMO id 13, agora em 3º — sobrescreveria em silêncio
        { id: 22, rank: 2 },
      ],
      candidato_a_id: 13,
    },
    por_uf: [
      {
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
      },
    ],
    // biome-ignore lint/suspicious/noExplicitAny: payload parcial de teste
  } as any;
}

describe("PersistentMapFrame — `rankByLider` não colide entre UFs (2ª rodada)", () => {
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

  it('cargo="gov" — NÃO passa `rankByLider` a `<NationalMapBlock>`, mesmo com `id` colidindo entre UFs', async () => {
    responderCom(payloadComIdColidindo(3));
    await act(async () => {
      root.render(<PersistentMapFrame cargo="gov" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(espiao.chamadas).toHaveLength(1);
    expect(espiao.chamadas[0]?.rankByLider).toBeUndefined();
    // `candidatoAId` continua vindo — é um valor único e agregado (soma
    // nacional ponderada por `id`), não um artefato de colisão.
    expect(espiao.chamadas[0]?.candidatoAId).toBe(13);
  });

  it('cargo="pres" — CONTINUA construindo e passando `rankByLider` normalmente (comportamento inalterado)', async () => {
    responderCom(payloadComIdColidindo(1));
    await act(async () => {
      root.render(<PersistentMapFrame cargo="pres" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(espiao.chamadas).toHaveLength(1);
    // Numa corrida presidencial de verdade `id` nunca colide — o teste só
    // reaproveita a mesma fixture "colidida" para confirmar que o ramo de
    // Presidente NÃO foi tocado por esta correção: ele segue construindo o
    // mapa a partir de `national.candidatos`, qualquer que seja o array.
    expect(espiao.chamadas[0]?.rankByLider).toBeDefined();
    expect(espiao.chamadas[0]?.rankByLider).toEqual({ 13: 3, 22: 2 });
  });

  it('cargo="sen" (2026-09-18) — NÃO passa `rankByLider`, mesma razão de "gov" (RF-145 cobre cargo 5)', async () => {
    // Mutação: reaproveitar o `Object.fromEntries` do ramo pres para "sen"
    // (ou trocar o gate de `cargo === "sen"` por só `cargo === "gov"`) faz
    // este teste falhar.
    responderCom(payloadComIdColidindo(5));
    await act(async () => {
      root.render(<PersistentMapFrame cargo="sen" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(espiao.chamadas).toHaveLength(1);
    expect(espiao.chamadas[0]?.rankByLider).toBeUndefined();
    expect(espiao.chamadas[0]?.candidatoAId).toBe(13);
  });
});
