/**
 * tests/unit/tse/insert-snapshot-nivel.test.ts
 *
 * RF-199 (spec 021) — a coluna `nivel` (migration 0010,
 * `data-pipeline/migrations/0010_snapshots_nivel.ts`) precisa viajar do
 * `Target` (`lib/tse/targets.ts`) até a linha gravada em `snapshots`
 * (`lib/tse/repository.ts::insertSnapshot`).
 *
 * `@/lib/db` é mockado (vi.hoisted, sem tocar Neon — mesma estratégia de
 * `tests/unit/tse/targets.test.ts`) porque o ponto do teste é o CONTRATO do
 * INSERT, não o banco real: `repository.test.ts` (Neon real, requer
 * DATABASE_URL) prova o roundtrip; este arquivo prova que `target.nivel`
 * chega ao `.values(...)` sem se perder no caminho, para os três valores —
 * não só o caso feliz de sempre `"zona"` que os fixtures de
 * `repository.test.ts` exercitam.
 *
 * `eq`/`and`/`desc` (drizzle-orm) toleram colunas mockadas como string plana
 * — confirmado contra a mesma import real usada em produção; não precisam de
 * mock próprio.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { valuesMock, selectChain } = vi.hoisted(() => {
  const valuesMock = vi.fn((_values: Record<string, unknown>) => ({
    returning: () => Promise.resolve([{ id: 1n }]),
  }));
  const selectChain = {
    from: () => ({
      where: () => ({
        orderBy: () => ({
          // Sem snapshot anterior — `insertSnapshot` sempre segue pro INSERT
          // (dedup por hash não entra em jogo neste arquivo).
          limit: () => Promise.resolve([]),
        }),
      }),
    }),
  };
  return { valuesMock, selectChain };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => ({ values: valuesMock })),
  },
  schema: {
    snapshots: {
      id: "id",
      cargo: "cargo",
      turno: "turno",
      uf: "uf",
      codMunicipioTse: "cod_municipio_tse",
      codZona: "cod_zona",
      etag: "etag",
      hashPayload: "hash_payload",
      ts: "ts",
    },
  },
}));

import type { EA20 } from "@/lib/tse/ea20-schema";
import { insertSnapshot } from "@/lib/tse/repository";
import type { Target } from "@/lib/tse/targets";

// `insertSnapshot` só repassa `payload` pro jsonb — não o interpreta. Um
// objeto vazio basta; o schema Zod do EA20 real é exercitado em
// `ea20-parser.test.ts`, não aqui.
const PAYLOAD_MINIMO = {} as unknown as EA20;

function buildTarget(nivel: Target["nivel"]): Target {
  return {
    uf: nivel === "br" ? "BR" : "SP",
    cargo: 1,
    nivel,
    // Sentinela 0 para uf/br (ver lib/tse/targets.ts::SENTINEL_ZONA_OU_MUNICIPIO)
    codMunicipioTse: nivel === "zona" ? 71072 : 0,
    codZona: nivel === "zona" ? 1 : 0,
    url: `https://test.invalid/${nivel}.json`,
    codEleicao: "ele2026/619",
  };
}

async function insert(nivel: Target["nivel"], hash: string) {
  return insertSnapshot({
    target: buildTarget(nivel),
    turno: 1,
    etag: null,
    hash,
    payload: PAYLOAD_MINIMO,
    pctApurado: 0,
    votosTotal: 0,
  });
}

beforeEach(() => {
  valuesMock.mockClear();
});

describe("insertSnapshot — RF-199 (spec 021): nivel viaja do Target até o INSERT", () => {
  it.each([
    "zona",
    "uf",
    "br",
  ] as const)("grava nivel=%s exatamente como veio do target", async (nivel) => {
    await insert(nivel, "a".repeat(64));

    expect(valuesMock).toHaveBeenCalledTimes(1);
    const values = valuesMock.mock.calls[0]?.[0] as { nivel?: string } | undefined;
    expect(values?.nivel).toBe(nivel);
  });

  it("uma linha de nível uf e uma de nível br são distinguíveis por nivel — não dependem só do sentinela cod_zona=0", async () => {
    await insert("uf", "b".repeat(64));
    const linhaUf = valuesMock.mock.calls[0]?.[0] as
      | { nivel?: string; codZona?: number; codMunicipioTse?: number }
      | undefined;

    valuesMock.mockClear();
    await insert("br", "c".repeat(64));
    const linhaBr = valuesMock.mock.calls[0]?.[0] as
      | { nivel?: string; codZona?: number; codMunicipioTse?: number }
      | undefined;

    // As duas compartilham o MESMO sentinela cod_zona=0/cod_municipio_tse=0
    // — antes da migration 0010, essa dupla sozinha não distinguia "agregado
    // de UF" de "agregado nacional" nenhum dos dois de uma zona real (que
    // nunca usa 0). `nivel` é o que fecha essa distinção.
    expect(linhaUf?.codZona).toBe(0);
    expect(linhaUf?.codMunicipioTse).toBe(0);
    expect(linhaBr?.codZona).toBe(0);
    expect(linhaBr?.codMunicipioTse).toBe(0);
    expect(linhaUf?.nivel).toBe("uf");
    expect(linhaBr?.nivel).toBe("br");
    expect(linhaUf?.nivel).not.toBe(linhaBr?.nivel);
  });
});
