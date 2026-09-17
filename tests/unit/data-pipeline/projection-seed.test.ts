/**
 * tests/unit/data-pipeline/projection-seed.test.ts — RF-164, RF-163.
 *
 * ## A asserção é sobre o STORE, não sobre a intenção do script
 *
 * O RF-163 é literal: "asserção negativa sobre o conjunto de chaves gravadas,
 * **verificada contra o store real**, não contra a intenção do script". Um
 * espião em `writeProjection` provaria que o semeador *pretendia* gravar; o que
 * a spec exige é o conjunto que de fato ficou lá.
 *
 * Então este arquivo não mocka `writeProjection`. Ele mocka o **`fetch`**, uma
 * camada abaixo, e aplica cada `PATCH .../items` a um `Map` em memória. O que
 * decide quais chaves existem no fim é o writer de produção
 * (`lib/edge-config/writer.ts`), incluindo o alias que ele grava a cada
 * chamada — que é precisamente o mecanismo que o M18 vigia.
 *
 * ⚠️ `tests/setup/no-remote-writes.ts` já aponta a publicação para uma porta
 * morta; o `vi.stubGlobal("fetch", …)` daqui é a segunda camada, e nenhuma
 * chamada sai do processo.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  chavesDeDestino,
  chavesOcupadasPorDadoReal,
  ehSemeado,
  montarCandidatoSeed,
  montarPayloadSeed,
  ORDEM_SEMEADURA,
  type SeedDeps,
  SeedReentranciaError,
  semear,
  TURNO_SEMEADO,
  tamanhoBytes,
} from "@/data-pipeline/projection-seed";
import type { CargoTse } from "@/lib/config/cargos";
import { FASE_PRE_ELEICAO } from "@/lib/config/fase";
import type { EdgeCandidate } from "@/lib/edge-config/types";
import { writeProjection } from "@/lib/edge-config/writer";
import { candidatosZerados, NOMES_PRESIDENCIAIS } from "@/tests/fixtures/spec-019/payloads";

vi.mock("@/lib/blob/write", () => ({
  BLOB_CACHE_CONTROL_MAX_AGE_SECONDS: 60,
  hasBlobWriteCredentials: () => false,
  putJson: vi.fn(async () => ({ pathname: "", status: "skipped" as const, bytes: 0, url: null })),
}));

// ---------------------------------------------------------------------------
// Um Global Config de mentira, alimentado pelo writer de verdade
// ---------------------------------------------------------------------------

const ENV_KEYS = ["EDGE_CONFIG_TOKEN", "EDGE_CONFIG_ID", "EDGE_CONFIG", "VERCEL_TEAM_ID"] as const;
const envOriginal: Record<string, string | undefined> = {};

function montarStoreFalso(inicial: ReadonlyMap<string, unknown> = new Map()) {
  const store = new Map<string, unknown>(inicial);

  const fetchFalso = vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)) as {
        items: Array<{ operation: string; key: string; value: unknown }>;
      };
      for (const item of body.items) {
        if (item.operation === "delete") store.delete(item.key);
        else store.set(item.key, item.value);
      }
      return new Response("{}", { status: 200 });
    }
    if (u.endsWith("/items")) {
      return new Response(JSON.stringify([...store].map(([key, value]) => ({ key, value }))), {
        status: 200,
      });
    }
    // Metadados do store — a guarda de tamanho do writer.
    return new Response(
      JSON.stringify({ sizeInBytes: tamanhoBytes([...store.values()]), itemCount: store.size }),
      { status: 200 },
    );
  });

  vi.stubGlobal("fetch", fetchFalso);
  return store;
}

function depsDeTeste(store: Map<string, unknown>, over: Partial<SeedDeps> = {}): SeedDeps {
  return {
    lerStore: async () => new Map(store),
    gravar: (payload) => writeProjection(payload),
    carregarCandidatos: async (cargo: CargoTse): Promise<EdgeCandidate[]> =>
      cargo === 1 ? candidatosZerados() : [],
    agora: () => "2026-09-20T12:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    envOriginal[k] = process.env[k];
    delete process.env[k];
  }
  process.env.EDGE_CONFIG_TOKEN = "token-de-teste";
  process.env.EDGE_CONFIG_ID = "ecfg_teste";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (envOriginal[k] === undefined) delete process.env[k];
    else process.env[k] = envOriginal[k];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// O payload semeado
// ---------------------------------------------------------------------------

describe("RF-164 — o payload que o semeador monta", () => {
  it('carrega `fase: "pre_eleicao"` e `por_uf: []`', () => {
    const p = montarPayloadSeed(1, candidatosZerados(), "2026-09-20T12:00:00.000Z");
    expect(p.fase).toBe(FASE_PRE_ELEICAO);
    // `por_uf` vazio é decisão de desenho: linhas em `por_uf` são a matéria
    // prima das mentiras #1, #2 e #3 da tabela. Não produzi-las é a segunda
    // defesa, e ela coexiste com a supressão do RF-154 de propósito.
    expect(p.por_uf).toEqual([]);
    expect(p.insights).toEqual([]);
    expect(p.pct_apurado_total).toBe(0);
    expect(p.ufs_apuradas).toBe(0);
    expect(p.turno).toBe(TURNO_SEMEADO);
  });

  it("todo campo de medição da candidatura é zero; a identidade sobrevive", () => {
    const c = montarCandidatoSeed({
      numero: 13,
      nome_urna: "CANDIDATA TREZE",
      partido_sigla: "PT",
      sq_candidato: "900000000013",
    });
    // Identidade (ADR-0042): é o que o dono quer no ar.
    expect(c.id).toBe(13);
    expect(c.nome).toBe("CANDIDATA TREZE");
    expect(c.partido).toBe("PT");
    expect(c.sqcand).toBe("900000000013");
    // Medição (ADR-0043 D4): os oito campos numéricos vão a zero.
    for (const campo of [
      "votos_atuais",
      "votos_projetados",
      "pct_atual",
      "pct_projetado",
      "pct_projetado_lower",
      "pct_projetado_upper",
      "p_vitoria",
      "rank",
      "p_passa_2t",
      "p_fecha_1t",
    ] as const) {
      expect(c[campo], campo).toBe(0);
    }
    // A cor NÃO é a tinta do líder — `rank: 0` cai no cinza neutro.
    expect(c.cor).not.toContain("cand-1");
  });

  it("`ehSemeado` compara por igualdade exata — a dúvida resolve para não escrever", () => {
    expect(ehSemeado({ fase: FASE_PRE_ELEICAO })).toBe(true);
    for (const v of [{}, { fase: "normal" }, { fase: "" }, { fase: null }, null, 42, "x"]) {
      expect(ehSemeado(v), JSON.stringify(v)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// M17 / M18 — o conjunto de chaves e o dono do alias
// ---------------------------------------------------------------------------

describe("RF-163 / RF-164 — o que fica no store", () => {
  it("🔴 (M17) NENHUMA chave de cargo `dep` é escrita", async () => {
    const store = montarStoreFalso();
    await semear({ force: false, dryRun: false }, depsDeTeste(store));

    const chaves = [...store.keys()].sort();
    // Asserção negativa sobre o conjunto REAL do store.
    expect(chaves.filter((k) => k.includes("-dep-"))).toEqual([]);
    expect(chaves.some((k) => k.includes("dep"))).toBe(false);
    // E o controle positivo, para que a negativa acima não passe por vazio:
    expect(chaves).toEqual(
      [
        "projection-current",
        "projection-current-gov-t1",
        "projection-current-pres-t1",
        "projection-current-sen-t1",
      ].sort(),
    );
  });

  it("🔴 (M18) o alias `projection-current` contém o payload de CARGO 1", async () => {
    const store = montarStoreFalso();
    await semear({ force: false, dryRun: false }, depsDeTeste(store));

    const alias = store.get("projection-current") as { cargo: number; fase?: string };
    // "Qual cargo está no alias", não "o alias existe": um teste de existência
    // passa com qualquer ordem, e a ordem errada faz a home presidencial ler a
    // corrida do Senado.
    expect(alias.cargo).toBe(1);
    expect(alias.fase).toBe(FASE_PRE_ELEICAO);
    expect(alias).toEqual(store.get("projection-current-pres-t1"));
    // O alias NÃO é o de Senador nem o de Governador.
    expect(alias).not.toEqual(store.get("projection-current-sen-t1"));
  });

  it("(M18) a ordem declarada é `gov → sen → pres`, e `pres` é o último", () => {
    expect([...ORDEM_SEMEADURA]).toEqual([3, 5, 1]);
    expect(ORDEM_SEMEADURA.at(-1)).toBe(1);
  });

  it("a ordem de gravação observada é a declarada", async () => {
    const store = montarStoreFalso();
    const r = await semear({ force: false, dryRun: false }, depsDeTeste(store));
    expect(r.semeadas.map((s) => s.cargo)).toEqual([...ORDEM_SEMEADURA]);
    expect(r.semeadas.map((s) => s.chave)).toEqual([
      "projection-current-gov-t1",
      "projection-current-sen-t1",
      "projection-current-pres-t1",
    ]);
  });

  it("as três chaves nomeadas carregam `fase` e `por_uf: []`", async () => {
    const store = montarStoreFalso();
    await semear({ force: false, dryRun: false }, depsDeTeste(store));
    for (const chave of chavesDeDestino()) {
      const v = store.get(chave) as { fase?: string; por_uf?: unknown[] };
      expect(v, chave).toBeDefined();
      expect(v.fase, chave).toBe(FASE_PRE_ELEICAO);
      expect(v.por_uf, chave).toEqual([]);
    }
  });

  it("só o cargo 1 recebe identidade; gov e sen ficam sem nome (RF-162)", async () => {
    const store = montarStoreFalso();
    await semear({ force: false, dryRun: false }, depsDeTeste(store));
    const cands = (k: string) =>
      (store.get(k) as { national: { candidatos: unknown[] } }).national.candidatos;
    expect(cands("projection-current-pres-t1")).toHaveLength(NOMES_PRESIDENCIAIS.length);
    expect(cands("projection-current-gov-t1")).toEqual([]);
    expect(cands("projection-current-sen-t1")).toEqual([]);
  });

  it("o payload total cabe em ~10 KB — medido, não estimado (ADR-0032)", async () => {
    const store = montarStoreFalso();
    const r = await semear({ force: false, dryRun: false }, depsDeTeste(store));
    expect(r.bytesTotais).toBeGreaterThan(0);
    expect(r.bytesTotais).toBeLessThan(20_000);
    // E o número reportado é o que de fato está no store (3 nomeadas + alias).
    const noStore = [...store.values()].reduce<number>((s, v) => s + tamanhoBytes(v), 0);
    expect(r.bytesTotais).toBe(noStore);
  });

  it("`dryRun` mede e não grava", async () => {
    const store = montarStoreFalso();
    const r = await semear({ force: false, dryRun: true }, depsDeTeste(store));
    expect(r.dryRun).toBe(true);
    expect(r.semeadas).toHaveLength(3);
    expect([...store.keys()]).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// RF-166 — a transição de 04/10, do lado da ESCRITA
// ---------------------------------------------------------------------------

describe("RF-166 — o primeiro upsert real apaga a fase", () => {
  it("🔴 a gravação é SUBSTITUIÇÃO INTEGRAL — um merge deixaria `fase` por baixo do dado real", async () => {
    // O modo de falha: a tela ficaria em modo pré-eleição com apuração de
    // verdade por baixo, indefinidamente e sem alarme. A asserção é sobre o
    // valor que sobrou no store, não sobre o que o writer pretendia mandar.
    const store = montarStoreFalso();
    await semear({ force: false, dryRun: false }, depsDeTeste(store));
    expect((store.get("projection-current-pres-t1") as { fase?: string }).fase).toBe(
      FASE_PRE_ELEICAO,
    );

    // O orchestrator grava o primeiro payload real — sem `fase`, como o
    // RF-166 exige dos dois emissores Python.
    const real = montarPayloadSeed(1, candidatosZerados(), "2026-10-04T23:01:00.000Z");
    delete (real as { fase?: unknown }).fase;
    real.pct_apurado_total = 0.01;
    await writeProjection(real);

    for (const chave of ["projection-current-pres-t1", "projection-current"]) {
      const v = store.get(chave) as { fase?: unknown; pct_apurado_total: number };
      expect("fase" in v, chave).toBe(false);
      expect(v.pct_apurado_total, chave).toBe(0.01);
    }
  });

  it("a transição é POR CARGO — um cron atrasado não arrasta os outros dois", async () => {
    const store = montarStoreFalso();
    await semear({ force: false, dryRun: false }, depsDeTeste(store));

    const realGov = montarPayloadSeed(3, [], "2026-10-04T23:01:00.000Z");
    delete (realGov as { fase?: unknown }).fase;
    await writeProjection(realGov);

    expect("fase" in (store.get("projection-current-gov-t1") as object)).toBe(false);
    // Os outros dois seguem semeados, e a tela deles segue em fase pré.
    for (const chave of ["projection-current-pres-t1", "projection-current-sen-t1"]) {
      expect((store.get(chave) as { fase?: string }).fase, chave).toBe(FASE_PRE_ELEICAO);
    }
  });
});

// ---------------------------------------------------------------------------
// M19 — a guarda de reentrância
// ---------------------------------------------------------------------------

describe("RF-164 — a guarda de reentrância (M19)", () => {
  const payloadReal = { cargo: 1, turno: 1, pct_apurado_total: 37.4, national: {}, por_uf: [] };

  it("🔴 (M19) chave existente SEM `fase` ⇒ não grava NADA e lança", async () => {
    // O modo de falha que ela previne é rodar o semeador por engano às 21h de
    // 04/10: apagaria a apuração ao vivo e poria o país de volta em zero.
    const store = montarStoreFalso(new Map([["projection-current-sen-t1", payloadReal]]));
    const antes = new Map(store);

    await expect(semear({ force: false, dryRun: false }, depsDeTeste(store))).rejects.toThrow(
      SeedReentranciaError,
    );

    // Tudo ou nada: nem a chave de `gov`, que é a PRIMEIRA da ordem e cuja
    // gravação aconteceria antes de o semeador chegar em `sen`.
    expect([...store.entries()]).toEqual([...antes.entries()]);
    expect(store.has("projection-current-gov-t1")).toBe(false);
  });

  it("a recusa nomeia as chaves ocupadas", async () => {
    const store = montarStoreFalso(new Map([["projection-current-pres-t1", payloadReal]]));
    const erro = await semear({ force: false, dryRun: false }, depsDeTeste(store)).catch(
      (e: unknown) => e,
    );
    expect(erro).toBeInstanceOf(SeedReentranciaError);
    expect((erro as SeedReentranciaError).chavesOcupadas).toContain("projection-current-pres-t1");
    expect((erro as SeedReentranciaError).name).toBe("SeedReentranciaError");
  });

  it("chave existente COM `fase` ⇒ sobrescreve (re-semear é operação esperada)", async () => {
    const semeadoVelho = { ...payloadReal, fase: FASE_PRE_ELEICAO, ts: "2026-09-01T00:00:00.000Z" };
    const store = montarStoreFalso(new Map([["projection-current-pres-t1", semeadoVelho]]));
    const r = await semear({ force: false, dryRun: false }, depsDeTeste(store));
    expect(r.forcadasSobre).toEqual([]);
    expect((store.get("projection-current-pres-t1") as { ts: string }).ts).toBe(
      "2026-09-20T12:00:00.000Z",
    );
  });

  it("`--force` levanta a recusa — e SÓ ela", async () => {
    const store = montarStoreFalso(new Map([["projection-current-sen-t1", payloadReal]]));
    const r = await semear({ force: true, dryRun: false }, depsDeTeste(store));
    expect(r.forcadasSobre).toEqual(["projection-current-sen-t1"]);
    expect((store.get("projection-current-sen-t1") as { fase?: string }).fase).toBe(
      FASE_PRE_ELEICAO,
    );
    // O uso fica registrado no log do ciclo.
    expect(console.error).toHaveBeenCalled();
  });

  it("`chavesOcupadasPorDadoReal` ignora ausentes e semeadas, e pega o alias", () => {
    const store = new Map<string, unknown>([
      ["projection-current-gov-t1", { fase: FASE_PRE_ELEICAO }],
      ["projection-current", payloadReal],
    ]);
    expect(chavesOcupadasPorDadoReal(store)).toEqual(["projection-current"]);
  });

  it("a guarda cobre os QUATRO nomes de destino — as três nomeadas e o alias", () => {
    expect(chavesDeDestino().sort()).toEqual(
      [
        "projection-current",
        "projection-current-gov-t1",
        "projection-current-pres-t1",
        "projection-current-sen-t1",
      ].sort(),
    );
  });
});
