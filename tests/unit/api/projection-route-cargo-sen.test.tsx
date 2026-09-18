/**
 * tests/unit/api/projection-route-cargo-sen.test.tsx
 *
 * `GET /api/projection?cargo=sen` (2026-09-18) — o read path client-side que
 * `PersistentMapFrame` (ramo `cargo === "sen"`) usa para buscar o próprio
 * dado, mesma estrutura de `?cargo=gov` (ADR-0033 § 1). Provado por MOCK dos
 * dois produtores (`readProjection`, `simulacaoNacional`), não pela fixture
 * de simulação real — o ponto aqui é a ROTA escolhida dentro do handler
 * (`readProjection({ cargo: "sen", turno: 1 })`), não o conteúdo de um
 * arquivo específico.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readProjectionMock = vi.fn();
vi.mock("@/lib/edge-config/reader", () => ({
  readNationalProjection: vi.fn(),
  readProjection: (o?: unknown) => readProjectionMock(o),
  readUfProjection: vi.fn(),
}));

const simulacaoLigadaMock = vi.fn(() => false);
const simulacaoNacionalMock = vi.fn();
vi.mock("@/lib/dev/simulacao", () => ({
  simulacaoLigada: () => simulacaoLigadaMock(),
  simulacaoNacional: (cargo: string) => simulacaoNacionalMock(cargo),
  simulacaoUfPresidente: vi.fn(),
}));

const { GET } = await import("@/app/api/projection/route");

const PAYLOAD_SEN = {
  ts: "2026-10-04T22:15:00-03:00",
  cargo: 5,
  turno: 1,
  fase: "normal",
  national: { candidatos: [], candidato_a_id: null },
  por_uf: [],
} as unknown;

describe("GET /api/projection?cargo=sen", () => {
  beforeEach(() => {
    readProjectionMock.mockReset();
    simulacaoLigadaMock.mockReset().mockReturnValue(false);
    simulacaoNacionalMock.mockReset();
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('lê `readProjection({ cargo: "sen", turno: 1 })` — não "gov" nem "pres"', async () => {
    // Mutação: trocar `{ cargo: "sen", turno: 1 }` por `{ cargo: "gov", turno:
    // 1 }` (ou por 2 turnos, como o ramo gov faz) neste ramo de
    // `route.ts` faz este teste falhar — a asserção é sobre o ARGUMENTO da
    // chamada, não só sobre o retorno.
    readProjectionMock.mockResolvedValue(PAYLOAD_SEN);

    const res = await GET(new Request("http://x/api/projection?cargo=sen"));

    expect(readProjectionMock).toHaveBeenCalledTimes(1);
    expect(readProjectionMock).toHaveBeenCalledWith({ cargo: "sen", turno: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PAYLOAD_SEN);
  });

  it("sem payload nenhum (produção) → 503 com `error: no_payload, cargo: sen`, nunca a fixture", async () => {
    readProjectionMock.mockResolvedValue(null);

    const res = await GET(new Request("http://x/api/projection?cargo=sen"));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "no_payload", cargo: "sen" });
  });

  it('simulação ligada → usa `simulacaoNacional("sen")` e NÃO chama `readProjection`', async () => {
    simulacaoLigadaMock.mockReturnValue(true);
    simulacaoNacionalMock.mockReturnValue(PAYLOAD_SEN);

    const res = await GET(new Request("http://x/api/projection?cargo=sen"));

    expect(simulacaoNacionalMock).toHaveBeenCalledWith("sen");
    expect(readProjectionMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PAYLOAD_SEN);
  });
});
