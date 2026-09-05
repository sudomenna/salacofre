// tests/unit/scripts/tse-watch.test.ts
//
// Fase 0, item 0.8 — testa a função pura `runWatch` de scripts/tse-watch.ts
// com fetch stubado (nenhuma requisição real, nem ao mock, nem ao TSE).

import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runWatch, type WatchTargetsFile } from "../../../scripts/tse-watch";

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

function eleCBody(eleicoes: Array<{ cd: string; t: string; nm: string }>): string {
  return JSON.stringify({
    dg: "05/09/2026",
    hg: "10:00:00",
    f: "o",
    c: "ele2022",
    pl: [{ cd: "440", e: eleicoes }],
  });
}

const BASELINE_ELEICOES = [{ cd: "544", t: "1", nm: "Eleição Geral 2022" }];

const TARGETS: WatchTargetsFile = {
  leiautes: [
    { id: "ea20", url: "https://www.tse.jus.br/fake/ea20" },
    { id: "instrucoes", url: "https://www.tse.jus.br/fake/instrucoes" },
  ],
};

interface FakeFetchConfig {
  eleCBody?: string;
  eleCEtag?: string;
  ea20Etag?: string;
  ea20Status?: number;
  instrucoesEtag?: string;
}

function makeFakeFetch(cfg: FakeFetchConfig): typeof fetch {
  const eleC = cfg.eleCBody ?? eleCBody(BASELINE_ELEICOES);
  const eleCEtag = cfg.eleCEtag ?? '"elec-e1"';
  const ea20Etag = cfg.ea20Etag ?? '"ea20-e1"';
  const ea20Status = cfg.ea20Status ?? 200;
  const instrucoesEtag = cfg.instrucoesEtag ?? '"instr-e1"';

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.includes("ele-c.json")) {
      return new Response(eleC, {
        status: 200,
        headers: { etag: eleCEtag, "last-modified": "Sat, 05 Sep 2026 10:00:00 GMT" },
      });
    }

    if (url.includes("/fake/ea20")) {
      if (ea20Status === 403) {
        return new Response(null, { status: 403 });
      }
      if (method === "HEAD") {
        return new Response(null, {
          status: ea20Status,
          headers: {
            etag: ea20Etag,
            "last-modified": "Sat, 05 Sep 2026 09:00:00 GMT",
            "content-length": "12345",
          },
        });
      }
    }

    if (url.includes("/fake/instrucoes")) {
      if (method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers: {
            etag: instrucoesEtag,
            "last-modified": "Sat, 05 Sep 2026 09:00:00 GMT",
            "content-length": "999",
          },
        });
      }
    }

    return new Response(null, { status: 404 });
  }) as typeof fetch;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let tmpDir: string;
let statePath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "tse-watch-test-"));
  statePath = join(tmpDir, "state.json");
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

const noopSleep = async () => {};

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe("runWatch", () => {
  it("primeira execução cria estado e retorna changed:false", async () => {
    const result = await runWatch({
      statePath,
      targets: TARGETS,
      baseUrl: "https://fake.tse.jus.br/oficial",
      fetchImpl: makeFakeFetch({}),
      sleepImpl: noopSleep,
      now: () => new Date("2026-09-05T00:00:00Z"),
    });

    expect(result.changed).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(existsSync(statePath)).toBe(true);
    expect(result.state.leiautes.ea20?.status).toBe("ok");
  });

  it("segunda execução com ETag diferente no ea20 -> changed:true, diff cita ea20", async () => {
    await runWatch({
      statePath,
      targets: TARGETS,
      baseUrl: "https://fake.tse.jus.br/oficial",
      fetchImpl: makeFakeFetch({}),
      sleepImpl: noopSleep,
      now: () => new Date("2026-09-05T00:00:00Z"),
    });

    const second = await runWatch({
      statePath,
      targets: TARGETS,
      baseUrl: "https://fake.tse.jus.br/oficial",
      fetchImpl: makeFakeFetch({ ea20Etag: '"ea20-e2"' }),
      sleepImpl: noopSleep,
      now: () => new Date("2026-09-05T00:10:00Z"),
    });

    expect(second.changed).toBe(true);
    expect(second.exitCode).toBe(2);
    expect(second.diffLines.some((l) => l.includes("ea20"))).toBe(true);
    expect(second.diffLines.some((l) => l.includes("ea20-e1") && l.includes("ea20-e2"))).toBe(true);
  });

  it('ele-c.json com eleição nova {cd:1234,t:1,nm:"Eleição Geral 2026"} -> diff contém "ELEIÇÃO GERAL"', async () => {
    await runWatch({
      statePath,
      targets: TARGETS,
      baseUrl: "https://fake.tse.jus.br/oficial",
      fetchImpl: makeFakeFetch({}),
      sleepImpl: noopSleep,
      now: () => new Date("2026-09-05T00:00:00Z"),
    });

    const withNovaEleicao = eleCBody([
      ...BASELINE_ELEICOES,
      { cd: "1234", t: "1", nm: "Eleição Geral 2026" },
    ]);

    const second = await runWatch({
      statePath,
      targets: TARGETS,
      baseUrl: "https://fake.tse.jus.br/oficial",
      fetchImpl: makeFakeFetch({ eleCBody: withNovaEleicao, eleCEtag: '"elec-e2"' }),
      sleepImpl: noopSleep,
      now: () => new Date("2026-09-05T00:10:00Z"),
    });

    expect(second.changed).toBe(true);
    expect(second.exitCode).toBe(2);
    expect(second.diffLines.some((l) => l.includes("ELEIÇÃO GERAL"))).toBe(true);
    expect(second.state.eleC?.eleicoes).toHaveLength(2);
  });

  it("403 num leiaute -> inacessivel, não changed", async () => {
    const result = await runWatch({
      statePath,
      targets: TARGETS,
      baseUrl: "https://fake.tse.jus.br/oficial",
      fetchImpl: makeFakeFetch({ ea20Status: 403 }),
      sleepImpl: noopSleep,
      now: () => new Date("2026-09-05T00:00:00Z"),
    });

    expect(result.state.leiautes.ea20?.status).toBe("inacessivel");
    expect(result.changed).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(result.diffLines.some((l) => l.includes("inacessivel"))).toBe(true);
  });
});
