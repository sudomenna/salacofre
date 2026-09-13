/**
 * tests/unit/blob/candidatos.test.ts
 *
 * A leitura das fatias de identidade de candidatura no Blob (spec 018).
 *
 * O que estes testes protegem:
 *   - Que **toda** falha devolva um MOTIVO distinto, e não `null` nem exceção.
 *     Colapsar `not_found`, `fetch_error` e `not_configured` num só valor
 *     tiraria da UI a informação com que ela escolhe o texto: "esta UF não foi
 *     importada" e "não conseguimos falar com o armazenamento" são notícias
 *     diferentes para o leitor (ADR-0017, constituição § 7).
 *   - Que a fatia de OUTRA UF **e** a de OUTRO CARGO sejam recusadas. É a razão
 *     de o objeto carregar a própria `uf` e o próprio `cargo`, redundantes com o
 *     caminho — e as duas checagens são independentes: `candidatos/uf/SP/dep`
 *     e `candidatos/uf/SP/sen` têm a mesma UF, e uma troca entre eles
 *     publicaria a lista do Senado sob o rótulo da Câmara sem erro nenhum.
 *   - Que a revalidação seja de 1 hora, e não os 60 s dos leitores irmãos —
 *     identidade de candidatura não é dado vivo.
 *   - Que nenhum `AbortSignal` entre no `fetch`: um `signal` desabilita o Data
 *     Cache do Next, trocando proteção de latência por ida à origem a cada
 *     request na noite da apuração.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CANDIDATOS_REVALIDATE_SECONDS,
  type CandidatosUfSlice,
  candidatosFrom,
  readCandidatosUf,
} from "@/lib/blob/candidatos";

const BASE = "https://exemplo.test";
const URL_SP_DEP = `${BASE}/candidatos/uf/SP/dep.json`;

function fatia(over: Partial<CandidatosUfSlice> = {}): CandidatosUfSlice {
  return {
    uf: "SP",
    cargo: "dep",
    fonte_ts: "2026-08-20T00:00:00-03:00",
    gerado_ts: "2026-09-13T06:00:00-03:00",
    candidatos: [
      // Valores de `situacao_julgamento` são os REAIS do TSE (medidos em
      // 2026-09-13: 9 valores distintos somando as 20.939 candidaturas).
      // A versão anterior desta fixture usava "APTO", que não existe no
      // dado — fixture com valor inventado deixa de provar que o consumidor
      // aguenta o que a fonte realmente emite.
      {
        sqcand: "250002553928",
        numero: 1234,
        nome_urna: "FULANO DE TAL",
        nome: "FULANO DE TAL E QUAL",
        partido: "PL",
        coligacao: "COLIGAÇÃO EXEMPLO",
        situacao_julgamento: "DEFERIDO",
        sob_ressalva: false,
        foto_ok: true,
      },
      {
        // `sqcand` de 11 dígitos — 5.569 das 20.939 têm 11, não 12. Sem um
        // caso curto aqui, nada exercita a diferença de largura.
        // Sob ressalva: está na urna com registro indeferido em recurso —
        // 743 candidaturas reais nessa situação (ADR-0040), e é o caso que
        // a tela precisa saber exibir sem excluir.
        sqcand: "90002553929",
        numero: 5678,
        nome_urna: "BELTRANA",
        nome: "BELTRANA DE SOUZA",
        partido: "PT",
        situacao_julgamento: "INDEFERIDO EM PRAZO RECURSAL OU COM RECURSO",
        sob_ressalva: true,
        foto_ok: false,
      },
    ],
    ...over,
  };
}

const savedBase = process.env.BLOB_PUBLIC_BASE_URL;
const savedToken = process.env.BLOB_READ_WRITE_TOKEN;

beforeEach(() => {
  process.env.BLOB_PUBLIC_BASE_URL = BASE;
  // O token TAMBÉM sai, e não é zelo excessivo: `blobPublicBaseUrl()` deriva o
  // host do `storeId` embutido nele quando o override não está presente. Com um
  // `.env.local` carregado (o que `pnpm test` faz), um teste que só apagasse o
  // override continuaria tendo URL — e o caso `not_configured` passaria a
  // exercitar outro ramo, verde e mentindo. Aconteceu exatamente assim aqui.
  delete process.env.BLOB_READ_WRITE_TOKEN;
  vi.restoreAllMocks();
});

afterEach(() => {
  if (savedBase === undefined) delete process.env.BLOB_PUBLIC_BASE_URL;
  else process.env.BLOB_PUBLIC_BASE_URL = savedBase;
  if (savedToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = savedToken;
  vi.restoreAllMocks();
});

function mockFetch(impl: () => Promise<Response>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(impl as typeof fetch);
}

// ---------------------------------------------------------------------------
// Caminho feliz e cadência
// ---------------------------------------------------------------------------

describe("readCandidatosUf — leitura", () => {
  it("200 com objeto válido → ok, na URL determinística", async () => {
    const spy = mockFetch(async () => new Response(JSON.stringify(fatia()), { status: 200 }));

    const result = await readCandidatosUf("SP", "dep");

    expect(spy).toHaveBeenCalledWith(URL_SP_DEP, { next: { revalidate: 43_200 } });
    expect(result.status).toBe("ok");
    expect(candidatosFrom(result)).toHaveLength(2);
    if (result.status === "ok") {
      expect(result.url).toBe(URL_SP_DEP);
      // `sqcand` atravessa como string — nunca convertido a number.
      expect(result.slice.candidatos[0]?.sqcand).toBe("250002553928");
      expect(typeof result.slice.candidatos[0]?.sqcand).toBe("string");
    }
  });

  it("revalida a cada 12 horas — não os 60 s dos leitores de apuração", async () => {
    // Literal de um lado, constante do outro: se alguém alinhar a cadência
    // deste leitor com a dos irmãos "por consistência", reprova aqui.
    expect(CANDIDATOS_REVALIDATE_SECONDS).toBe(43_200);

    const spy = mockFetch(async () => new Response(JSON.stringify(fatia()), { status: 200 }));
    await readCandidatosUf("SP", "dep");

    const init = spy.mock.calls.at(-1)?.[1] as RequestInit & {
      next?: { revalidate?: number };
    };
    expect(init.next?.revalidate).toBe(43_200);
  });

  it("não passa AbortSignal — um signal desabilitaria o Data Cache do Next", async () => {
    const spy = mockFetch(async () => new Response(JSON.stringify(fatia()), { status: 200 }));
    await readCandidatosUf("SP", "dep");

    const init = spy.mock.calls.at(-1)?.[1] as RequestInit;
    expect(init.signal).toBeUndefined();
  });

  it("sigla em minúscula resolve para o mesmo caminho canônico", async () => {
    const spy = mockFetch(async () => new Response(JSON.stringify(fatia()), { status: 200 }));
    await readCandidatosUf("sp", "dep");
    expect(spy).toHaveBeenCalledWith(URL_SP_DEP, { next: { revalidate: 43_200 } });
  });

  it("cada cargo tem o seu caminho", async () => {
    const spy = mockFetch(
      async () => new Response(JSON.stringify(fatia({ cargo: "sen" })), { status: 200 }),
    );
    await readCandidatosUf("SP", "sen");
    expect(spy).toHaveBeenCalledWith(`${BASE}/candidatos/uf/SP/sen.json`, {
      next: { revalidate: 43_200 },
    });
  });
});

// ---------------------------------------------------------------------------
// Degradação com motivo
// ---------------------------------------------------------------------------

describe("readCandidatosUf — cada falha tem o SEU motivo", () => {
  it("404 → not_found, e o acessor coalesce para vazio", async () => {
    mockFetch(async () => new Response("", { status: 404 }));
    const result = await readCandidatosUf("SP", "dep");
    expect(result).toEqual({ status: "unavailable", reason: "not_found", url: URL_SP_DEP });
    expect(candidatosFrom(result)).toEqual([]);
  });

  it("5xx → fetch_error, e NÃO not_found", async () => {
    mockFetch(async () => new Response("boom", { status: 503 }));
    const result = await readCandidatosUf("SP", "dep");
    expect(result).toEqual({ status: "unavailable", reason: "fetch_error", url: URL_SP_DEP });
  });

  it("rede caiu → fetch_error, sem propagar exceção", async () => {
    mockFetch(async () => {
      throw new Error("ECONNRESET");
    });
    const result = await readCandidatosUf("SP", "dep");
    expect(result).toEqual({ status: "unavailable", reason: "fetch_error", url: URL_SP_DEP });
  });

  it("ambiente sem Blob → not_configured, sem sequer tentar o fetch", async () => {
    delete process.env.BLOB_PUBLIC_BASE_URL;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const spy = mockFetch(async () => new Response("", { status: 200 }));

    expect(await readCandidatosUf("SP", "dep")).toEqual({
      status: "unavailable",
      reason: "not_configured",
      url: null,
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("os quatro motivos são distintos entre si — nada de colapsar num só", async () => {
    const motivos: string[] = [];

    mockFetch(async () => new Response("", { status: 404 }));
    let r = await readCandidatosUf("SP", "dep");
    if (r.status === "unavailable") motivos.push(r.reason);

    mockFetch(async () => new Response("boom", { status: 500 }));
    r = await readCandidatosUf("SP", "dep");
    if (r.status === "unavailable") motivos.push(r.reason);

    mockFetch(async () => new Response("não é json", { status: 200 }));
    r = await readCandidatosUf("SP", "dep");
    if (r.status === "unavailable") motivos.push(r.reason);

    delete process.env.BLOB_PUBLIC_BASE_URL;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    r = await readCandidatosUf("SP", "dep");
    if (r.status === "unavailable") motivos.push(r.reason);

    expect(motivos).toEqual(["not_found", "fetch_error", "invalid", "not_configured"]);
    expect(new Set(motivos).size).toBe(4);
  });

  it("sigla malformada → invalid, sem lançar", async () => {
    expect(await readCandidatosUf("SPP", "dep")).toEqual({
      status: "unavailable",
      reason: "invalid",
      url: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Guard estrutural — blob trocado
// ---------------------------------------------------------------------------

describe("guard estrutural — o objeto é autodescritivo por isto", () => {
  it("JSON inválido → invalid", async () => {
    mockFetch(async () => new Response("não é json", { status: 200 }));
    expect(await readCandidatosUf("SP", "dep")).toMatchObject({
      status: "unavailable",
      reason: "invalid",
    });
  });

  it("fatia de OUTRA UF → invalid", async () => {
    // Cargo certo, UF errada. Só a checagem de `uf` pega este caso.
    mockFetch(async () => new Response(JSON.stringify(fatia({ uf: "RJ" })), { status: 200 }));
    expect(await readCandidatosUf("SP", "dep")).toMatchObject({
      status: "unavailable",
      reason: "invalid",
    });
  });

  it("fatia de OUTRO CARGO → invalid", async () => {
    // UF certa, cargo errado. Só a checagem de `cargo` pega este caso — é por
    // isso que as duas existem, e nenhuma cobre a outra.
    mockFetch(async () => new Response(JSON.stringify(fatia({ cargo: "sen" })), { status: 200 }));
    expect(await readCandidatosUf("SP", "dep")).toMatchObject({
      status: "unavailable",
      reason: "invalid",
    });
  });

  it("a fatia certa, com a MESMA UF e o MESMO cargo, passa", async () => {
    // O contra-exemplo dos dois acima: sem ele, um guard que recusasse tudo
    // também passaria nos testes de recusa.
    mockFetch(async () => new Response(JSON.stringify(fatia()), { status: 200 }));
    expect((await readCandidatosUf("SP", "dep")).status).toBe("ok");
  });

  it("objeto sem o array de candidatos → invalid", async () => {
    const semArray = { ...fatia(), candidatos: undefined };
    mockFetch(async () => new Response(JSON.stringify(semArray), { status: 200 }));
    expect(await readCandidatosUf("SP", "dep")).toMatchObject({
      status: "unavailable",
      reason: "invalid",
    });
  });

  it("objeto sem as datas → invalid", async () => {
    for (const campo of ["fonte_ts", "gerado_ts"] as const) {
      const semData: Record<string, unknown> = { ...fatia() };
      delete semData[campo];
      mockFetch(async () => new Response(JSON.stringify(semData), { status: 200 }));
      expect(await readCandidatosUf("SP", "dep")).toMatchObject({
        status: "unavailable",
        reason: "invalid",
      });
    }
  });

  it("null no corpo → invalid, não crash", async () => {
    mockFetch(async () => new Response("null", { status: 200 }));
    expect(await readCandidatosUf("SP", "dep")).toMatchObject({
      status: "unavailable",
      reason: "invalid",
    });
  });
});
