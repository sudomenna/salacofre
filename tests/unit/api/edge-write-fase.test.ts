/**
 * tests/unit/api/edge-write-fase.test.ts — RF-153 (borda de escrita).
 *
 * Três critérios do RF-153 sobre a borda:
 *
 *   - o campo é **opcional** nos dois envelopes, e um payload pré-019
 *     continua validando sem tocar em fixture nenhuma;
 *   - quando presente, ele **atravessa** — o writer não pode descartá-lo em
 *     silêncio, senão o semeador gravaria um payload sem fase e a tela cairia
 *     em modo normal com zeros (a mentira #1);
 *   - `"pre_eleicao"` é o **único** valor aceito. "Ausente = normal" é o
 *     contrato inteiro; um `fase: "normal"` ou `fase: null` no store criaria
 *     um segundo jeito de dizer a mesma coisa, e o fiscal do RF-165 (que
 *     compara por igualdade exata) deixaria de encontrá-lo.
 *
 * A cobertura geral do handler continua em `tests/unit/api/edge-write.test.ts`.
 */

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/edge-config/writer", () => ({
  writeProjection: vi.fn(),
  writeDeputadoProjection: vi.fn(),
}));

import { POST } from "@/app/api/internal/edge-write/route";
import { FASE_PRE_ELEICAO } from "@/lib/config/fase";
import { writeDeputadoProjection, writeProjection } from "@/lib/edge-config/writer";

let secretOriginal: string | undefined;

beforeEach(() => {
  secretOriginal = process.env.MODEL_SECRET;
  process.env.MODEL_SECRET = "test-secret-xyz";
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  if (secretOriginal === undefined) delete process.env.MODEL_SECRET;
  else process.env.MODEL_SECRET = secretOriginal;
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

/** Envelope nacional mínimo — o mesmo de `edge-write.test.ts`, sem `fase`. */
function bodyNacional(fase?: unknown) {
  return {
    payload: {
      ts: "2026-09-20T12:00:00Z",
      cargo: 1 as const,
      turno: 1 as const,
      pct_apurado_total: 0,
      ufs_apuradas: 0,
      national: { candidatos: [], needle_position: 0, needle_band: "tossup" },
      por_uf: [],
      insights: [],
      composition: { pre_election: 1, model: 0, actual_results: 0 },
      ...(fase === undefined ? {} : { fase }),
    },
  };
}

function bodyDeputado(fase?: unknown) {
  return {
    payload: {
      ts: "2026-09-20T12:00:00Z",
      cargo: 6 as const,
      turno: 1 as const,
      pct_apurado_total: 0,
      ufs_apuradas: 0,
      atualizacao_min: 15,
      bancada: {
        total_cadeiras: 513,
        cadeiras_atribuidas: 0,
        ufs_calculadas: 0,
        ufs_aguardando: 27,
        por_agremiacao: [],
      },
      por_uf: [],
      insights: [],
      composition: { pre_election: 0, model: 0, actual_results: 1 },
      ...(fase === undefined ? {} : { fase }),
    },
  };
}

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/internal/edge-write", {
    method: "POST",
    headers: { "content-type": "application/json", "x-model-secret": "test-secret-xyz" },
    body: JSON.stringify(body),
  });
}

describe("RF-153 — o campo `fase` na borda de escrita", () => {
  it("payload pré-019 (SEM `fase`) continua validando", async () => {
    const res = await POST(req(bodyNacional()));
    expect(res.status).toBe(200);
    const enviado = vi.mocked(writeProjection).mock.calls[0]?.[0] as { fase?: unknown };
    expect(enviado).toBeDefined();
    expect("fase" in enviado).toBe(false);
  });

  it('🔴 `fase: "pre_eleicao"` ATRAVESSA até o writer — não é descartado em silêncio', async () => {
    // Se o schema não declarasse o campo, o tipo inferido o perderia e o
    // semeador gravaria um payload sem fase: a tela cairia em modo normal com
    // zeros, que é a mentira #1 desta spec.
    const res = await POST(req(bodyNacional(FASE_PRE_ELEICAO)));
    expect(res.status).toBe(200);
    expect(vi.mocked(writeProjection).mock.calls[0]?.[0]).toMatchObject({
      fase: FASE_PRE_ELEICAO,
    });
  });

  it("o mesmo vale no envelope de Deputado (declarado por simetria)", async () => {
    const semFase = await POST(req(bodyDeputado()));
    expect(semFase.status).toBe(200);
    expect("fase" in (vi.mocked(writeDeputadoProjection).mock.calls[0]?.[0] ?? {})).toBe(false);

    vi.mocked(writeDeputadoProjection).mockClear();
    const comFase = await POST(req(bodyDeputado(FASE_PRE_ELEICAO)));
    expect(comFase.status).toBe(200);
    expect(vi.mocked(writeDeputadoProjection).mock.calls[0]?.[0]).toMatchObject({
      fase: FASE_PRE_ELEICAO,
    });
  });

  it("🔴 nenhum outro valor é aceito — `ausente = normal` é o contrato inteiro", async () => {
    for (const invalido of ["normal", "", "pre-eleicao", "PRE_ELEICAO", null, 1, true]) {
      vi.mocked(writeProjection).mockClear();
      const res = await POST(req(bodyNacional(invalido)));
      expect(res.status, JSON.stringify(invalido)).toBe(400);
      expect(writeProjection, JSON.stringify(invalido)).not.toHaveBeenCalled();
    }
  });

  it("um `fase` inválido no envelope de Deputado também é 400", async () => {
    const res = await POST(req(bodyDeputado("normal")));
    expect(res.status).toBe(400);
    expect(writeDeputadoProjection).not.toHaveBeenCalled();
  });
});
