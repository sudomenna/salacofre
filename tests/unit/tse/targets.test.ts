/**
 * tests/unit/tse/targets.test.ts
 *
 * Unit tests para lib/tse/targets.ts — hardening pré-simulado (2026-09-05).
 *
 * Cobre: RF-001 (descoberta de endpoints, agora com host configurável via
 * TSE_BASE_URL), validação de TSE_COD_ELEICAO, cache keyed por
 * env|codEleicao|baseUrl|granularidade, TSE_CARGOS e TSE_GRANULARIDADE.
 *
 * 2026-09-05 — REESCRITA (9 PDFs oficiais TSE 2026): o builder de URL
 * anterior tinha subpasta de município, ordem `-c-z` invertida e faltava o
 * sufixo `-u` (Divergência 1 do diagnóstico pré-simulado). Os testes de URL
 * abaixo conferem string EXATA contra os exemplos dos documentos oficiais
 * (tse_docs/txt/tse-ea20-arquivo-de-resultado-unificado.txt § 2,
 * tse-ea14-.../tse-ea15-... § 2) — ver docs/reference/tse-2026-leiautes.md.
 *
 * `@/lib/db` é mockado (vi.mock, hoisted) para que `listIngestTargets`
 * nunca toque o Neon real quando a granularidade é "zona" — o ponto do teste
 * é o cache/URL/env parsing, não o conteúdo da tabela `zonas`. O mock devolve
 * sempre `[]` (zero zonas); o que importa é QUANTAS VEZES `db.select` foi
 * chamado, não o resultado. Em granularidade "uf" (opt-in), `listIngestTargets`
 * NÃO toca o DB — as 27 UFs são uma lista estática.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => {
  const chain = {
    // `.from()` retorna um Promise REAL (não um objeto com uma prop `then`
    // fabricada) com `.where()` anexado — assim ele é "awaitable" tanto no
    // caminho de produção (sem `.where()`) quanto no de preview (com
    // `.where()`), e o biome não reclama de "then property" suspeita porque
    // `.then` aqui é herdado do protótipo de Promise, não uma prop própria.
    from: () => Object.assign(Promise.resolve([]), { where: () => Promise.resolve([]) }),
  };
  return {
    db: { select: vi.fn(() => chain) },
    schema: {
      zonas: { codZona: "cod_zona", codMunicipioTse: "cod_municipio_tse", uf: "uf" },
    },
  };
});

import { db } from "@/lib/db";
import {
  buildEA14Url,
  buildEA15Url,
  buildEA20Url,
  buildEA20UrlBr,
  buildEA20UrlMunicipio,
  buildEA20UrlUf,
  buildEA20UrlZona,
  clearTargetsCache,
  getActiveCargos,
  getCodEleicao,
  getGranularidade,
  getTseBaseUrl,
  listIngestTargets,
} from "@/lib/tse/targets";

afterEach(() => {
  vi.unstubAllEnvs();
  clearTargetsCache();
  vi.mocked(db.select).mockClear();
});

// ---------------------------------------------------------------------------
// getTseBaseUrl
// ---------------------------------------------------------------------------

describe("getTseBaseUrl", () => {
  it("retorna o default de produção quando TSE_BASE_URL está ausente", () => {
    vi.stubEnv("TSE_BASE_URL", "");
    expect(getTseBaseUrl()).toBe("https://resultados.tse.jus.br/oficial");
  });

  it("aceita host https customizado (ex.: ambiente de simulado)", () => {
    vi.stubEnv("TSE_BASE_URL", "https://resultados-sim.tse.jus.br/oficial");
    expect(getTseBaseUrl()).toBe("https://resultados-sim.tse.jus.br/oficial");
  });

  it("aceita http://localhost (mock local)", () => {
    vi.stubEnv("TSE_BASE_URL", "http://localhost:8787/oficial");
    expect(getTseBaseUrl()).toBe("http://localhost:8787/oficial");
  });

  it("aceita http://127.0.0.1 (mock local)", () => {
    vi.stubEnv("TSE_BASE_URL", "http://127.0.0.1:8787/oficial");
    expect(getTseBaseUrl()).toBe("http://127.0.0.1:8787/oficial");
  });

  it("normaliza barra final", () => {
    vi.stubEnv("TSE_BASE_URL", "https://resultados.tse.jus.br/oficial/");
    expect(getTseBaseUrl()).toBe("https://resultados.tse.jus.br/oficial");
  });

  it("lança erro para http:// em host não-local (downgrade de TLS)", () => {
    vi.stubEnv("TSE_BASE_URL", "http://resultados.tse.jus.br/oficial");
    expect(() => getTseBaseUrl()).toThrow();
  });

  it("lança erro para valor que não é uma URL válida", () => {
    vi.stubEnv("TSE_BASE_URL", "não-é-url");
    expect(() => getTseBaseUrl()).toThrow();
  });
});

// ---------------------------------------------------------------------------
// URL builders — string exata contra os exemplos dos documentos oficiais
// ---------------------------------------------------------------------------

const BASE = "https://x.test/oficial";
const COD_ELEICAO = "ele2026/999999"; // segmento numérico "999999" == exemplo dos PDFs

describe("buildEA20UrlZona", () => {
  it("monta a URL de zona no formato oficial (Instruções §5 + EA20 §2)", () => {
    const url = buildEA20UrlZona({
      codEleicao: COD_ELEICAO,
      uf: "sp",
      codMunicipioTse: 71072,
      codZona: 1,
      cargo: 3,
      baseUrl: BASE,
    });
    expect(url).toBe(`${BASE}/${COD_ELEICAO}/dados/sp/sp71072-z0001-c0003-e999999-u.json`);
  });

  it("zero-pad município a 5 dígitos", () => {
    const url = buildEA20UrlZona({
      codEleicao: COD_ELEICAO,
      uf: "rj",
      codMunicipioTse: 555,
      codZona: 42,
      cargo: 1,
      baseUrl: BASE,
    });
    expect(url).toBe(`${BASE}/${COD_ELEICAO}/dados/rj/rj00555-z0042-c0001-e999999-u.json`);
  });

  it("NÃO tem subpasta de município (dados/<uf> é pasta folha)", () => {
    const url = buildEA20UrlZona({
      codEleicao: COD_ELEICAO,
      uf: "sp",
      codMunicipioTse: 71072,
      codZona: 1,
      cargo: 3,
      baseUrl: BASE,
    });
    // Exatamente 1 segmento de UF entre "dados/" e o nome do arquivo.
    expect(url).not.toContain("dados/sp/sp71072/");
  });
});

describe("buildEA20UrlMunicipio", () => {
  it("monta a URL de município no formato oficial (EA20 §2)", () => {
    const url = buildEA20UrlMunicipio({
      codEleicao: COD_ELEICAO,
      uf: "sp",
      codMunicipioTse: 71072,
      cargo: 3,
      baseUrl: BASE,
    });
    expect(url).toBe(`${BASE}/${COD_ELEICAO}/dados/sp/sp71072-c0003-e999999-u.json`);
  });
});

describe("buildEA20UrlUf", () => {
  it("monta a URL de UF agregada no formato oficial (EA20 §2)", () => {
    const url = buildEA20UrlUf({ codEleicao: COD_ELEICAO, uf: "sp", cargo: 3, baseUrl: BASE });
    expect(url).toBe(`${BASE}/${COD_ELEICAO}/dados/sp/sp-c0003-e999999-u.json`);
  });
});

describe("buildEA20UrlBr", () => {
  it("monta a URL nacional agregada no formato oficial (EA20 §2)", () => {
    const url = buildEA20UrlBr({ codEleicao: COD_ELEICAO, cargo: 1, baseUrl: BASE });
    expect(url).toBe(`${BASE}/${COD_ELEICAO}/dados/br/br-c0001-e999999-u.json`);
  });
});

describe("buildEA14Url", () => {
  it("monta a URL de acompanhamento Brasil — SEM cargo no nome (EA14 §2)", () => {
    const url = buildEA14Url({ codEleicao: COD_ELEICAO, baseUrl: BASE });
    expect(url).toBe(`${BASE}/${COD_ELEICAO}/dados/br/br-e999999-ab.json`);
  });
});

describe("buildEA15Url", () => {
  it("monta a URL de acompanhamento por UF — SEM cargo no nome (EA15 §2)", () => {
    const url = buildEA15Url({ codEleicao: COD_ELEICAO, uf: "sp", baseUrl: BASE });
    expect(url).toBe(`${BASE}/${COD_ELEICAO}/dados/sp/sp-e999999-ab.json`);
  });
});

// ---------------------------------------------------------------------------
// buildEA20Url — alias legado, delega para buildEA20UrlZona
// ---------------------------------------------------------------------------

describe("buildEA20Url (legado — delega para buildEA20UrlZona)", () => {
  it("usa o baseUrl explícito e monta no formato oficial corrigido", () => {
    const url = buildEA20Url(COD_ELEICAO, "SP", 71072, 1, 3, BASE);
    expect(url).toBe(`${BASE}/${COD_ELEICAO}/dados/sp/sp71072-z0001-c0003-e999999-u.json`);
  });

  it("usa TSE_BASE_URL do ambiente quando baseUrl não é passado explicitamente", () => {
    vi.stubEnv("TSE_BASE_URL", "https://resultados-sim.tse.jus.br/oficial");
    const url = buildEA20Url("ele2026/1", "RJ", 12345, 2, 3);
    expect(url.startsWith("https://resultados-sim.tse.jus.br/oficial/")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getCodEleicao
// ---------------------------------------------------------------------------

describe("getCodEleicao", () => {
  it("lança erro quando ausente", () => {
    vi.stubEnv("TSE_COD_ELEICAO", "");
    expect(() => getCodEleicao()).toThrow();
  });

  it("lança erro para formato inválido (sem barra, sem dígitos, prefixo errado)", () => {
    for (const bad of ["2026/619", "ele2026-619", "ele26/619", "ele2026/abc", "ele2026/"]) {
      vi.stubEnv("TSE_COD_ELEICAO", bad);
      expect(() => getCodEleicao(), `esperava throw para "${bad}"`).toThrow();
    }
  });

  it("aceita e retorna trimado o formato válido ele<AAAA>/<dígitos>", () => {
    vi.stubEnv("TSE_COD_ELEICAO", "  ele2026/619  ");
    expect(getCodEleicao()).toBe("ele2026/619");
  });
});

// ---------------------------------------------------------------------------
// getActiveCargos (TSE_CARGOS)
// ---------------------------------------------------------------------------

describe("getActiveCargos", () => {
  it("default [1, 3] quando TSE_CARGOS está ausente", () => {
    vi.stubEnv("TSE_CARGOS", "");
    expect(getActiveCargos()).toEqual([1, 3]);
  });

  it('TSE_CARGOS="1" → [1]', () => {
    vi.stubEnv("TSE_CARGOS", "1");
    expect(getActiveCargos()).toEqual([1]);
  });

  it('TSE_CARGOS="3" → [3]', () => {
    vi.stubEnv("TSE_CARGOS", "3");
    expect(getActiveCargos()).toEqual([3]);
  });

  it("ignora tokens inválidos e cai no default se nada sobrar", () => {
    vi.stubEnv("TSE_CARGOS", "2,9,abc");
    expect(getActiveCargos()).toEqual([1, 3]);
  });

  it("ignora tokens inválidos individuais mantendo os válidos", () => {
    vi.stubEnv("TSE_CARGOS", "1,7");
    expect(getActiveCargos()).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
// getGranularidade (TSE_GRANULARIDADE)
// ---------------------------------------------------------------------------

describe("getGranularidade", () => {
  // Default `zona` desde 2026-09-05 (E4): o modelo precisa de dado por zona e o
  // modo `uf` está quebrado no modelo (peso 0 para `cod_zona = 0`). Se este teste
  // voltar a esperar "uf", produção passa a cair num modo quebrado quando a env
  // faltar — a mudança é deliberada, não regressão.
  it('default "zona" quando TSE_GRANULARIDADE está ausente', () => {
    vi.stubEnv("TSE_GRANULARIDADE", "");
    expect(getGranularidade()).toBe("zona");
  });

  it('"uf" continua aceito como opt-in explícito', () => {
    vi.stubEnv("TSE_GRANULARIDADE", "uf");
    expect(getGranularidade()).toBe("uf");
  });

  it('aceita "zona"', () => {
    vi.stubEnv("TSE_GRANULARIDADE", "zona");
    expect(getGranularidade()).toBe("zona");
  });

  it('aceita "uf" explícito e é case-insensitive', () => {
    vi.stubEnv("TSE_GRANULARIDADE", "UF");
    expect(getGranularidade()).toBe("uf");
  });

  it('cai no default "zona" para valor inválido', () => {
    vi.stubEnv("TSE_GRANULARIDADE", "municipio");
    expect(getGranularidade()).toBe("zona");
  });
});

// ---------------------------------------------------------------------------
// listIngestTargets — granularidade "uf" (default) — NÃO toca o DB
// ---------------------------------------------------------------------------

describe("listIngestTargets — granularidade uf (opt-in explícito)", () => {
  // Desde 2026-09-05 o default é "zona" (E4). Estes testes exercitam o caminho
  // `uf` — que continua existindo como opt-in — e por isso o pedem explicitamente.
  beforeEach(() => {
    vi.stubEnv("TSE_GRANULARIDADE", "uf");
  });

  it("produção: 27 UFs × cargos ativos + 1 BR (só cargo 1) — zero chamadas ao DB", async () => {
    vi.stubEnv("TSE_COD_ELEICAO", "ele2026/619");
    vi.stubEnv("TSE_CARGOS", "1,3");

    const targets = await listIngestTargets("production");

    expect(targets).toHaveLength(27 * 2 + 1);
    expect(targets.every((t) => t.nivel === "uf" || t.nivel === "br")).toBe(true);
    expect(targets.filter((t) => t.nivel === "br")).toHaveLength(1);
    expect(targets.find((t) => t.nivel === "br")?.cargo).toBe(1);
    expect(vi.mocked(db.select)).not.toHaveBeenCalled();
  });

  it("produção: sem BR quando cargo 1 não está ativo", async () => {
    vi.stubEnv("TSE_COD_ELEICAO", "ele2026/619");
    vi.stubEnv("TSE_CARGOS", "3");

    const targets = await listIngestTargets("production");

    expect(targets).toHaveLength(27);
    expect(targets.filter((t) => t.nivel === "br")).toHaveLength(0);
  });

  it("preview: 1 target de nível uf por entrada da whitelist", async () => {
    vi.stubEnv("TSE_COD_ELEICAO", "ele2026/619");
    vi.stubEnv("TSE_TARGETS_WHITELIST", "SP:1,RJ:3");

    const targets = await listIngestTargets("preview");

    expect(targets).toHaveLength(2);
    expect(targets.every((t) => t.nivel === "uf")).toBe(true);
    expect(vi.mocked(db.select)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// listIngestTargets — granularidade "zona" (opt-in) — cache keyed por
// env|codEleicao|baseUrl|granularidade
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// listIngestTargets — pares (município × zona), migration 0006 (ADR-0035 D1)
// e filtro por cargo (ADR-0035 D3 — cron por cargo)
// ---------------------------------------------------------------------------

/**
 * mockZonasRowsOnce — sobrescreve APENAS a próxima chamada de `db.select`
 * para devolver `rows` — usado para simular `zonas` com 2+ pares (mesma
 * zona, municípios distintos), o cenário real do TSE 2026 (migration 0006:
 * uma linha de `zonas` é um PAR, não mais "1 município por zona"). O objeto
 * devolvido é awaitable (Promise real) e também tem `.where()` — cobre tanto
 * `buildProductionTargetsZona` (sem `.where()`) quanto
 * `buildPreviewTargetsZona` (com `.where()`).
 */
function mockZonasRowsOnce(
  rows: Array<{ uf: string; codMunicipioTse: number; codZona: number }>,
): void {
  const awaitable = Object.assign(Promise.resolve(rows), {
    where: () => Promise.resolve(rows),
  });
  vi.mocked(db.select).mockReturnValueOnce({ from: () => awaitable } as never);
}

describe("listIngestTargets — granularidade por cargo (ADR-0026 + emenda (b))", () => {
  beforeEach(() => {
    vi.stubEnv("TSE_COD_ELEICAO", "ele2026/619");
    // Sem `TSE_GRANULARIDADE`: é o ponto do teste — cada cargo cai no padrão da
    // tabela canônica, e não num modo global.
  });

  // Lacuna apontada pelo `rf-coverage-checker` em 2026-09-11: existiam testes
  // que USAVAM 6.110 como constante (o de `maxDuration` no rate limiter) mas
  // nenhum que exigisse que a enumeração de fato produzisse um alvo por par.
  // Um erro na montagem dos pares — na migration 0006 ou na query de `zonas` —
  // passaria despercebido, que é exatamente o defeito de 10/09 (2.651 alvos em
  // vez de 6.110, sem um único 404).
  it.each([
    { cargo: 1, nome: "Presidente" },
    { cargo: 3, nome: "Governador" },
    { cargo: 5, nome: "Senador" },
  ] as const)("cargo $cargo ($nome) enumera UM alvo de zona por par, sem perder nenhum", async ({
    cargo,
  }) => {
    const pares = [
      { uf: "SP", codMunicipioTse: 71072, codZona: 1 },
      { uf: "SP", codMunicipioTse: 12345, codZona: 1 },
      { uf: "MG", codMunicipioTse: 40177, codZona: 4 },
      { uf: "MG", codMunicipioTse: 49352, codZona: 4 },
      { uf: "MG", codMunicipioTse: 41319, codZona: 4 },
    ];
    mockZonasRowsOnce(pares);

    const targets = await listIngestTargets("production", { cargo });

    // Um alvo por PAR — não por zona. Com a regra antiga (uma linha por zona)
    // isto daria 2, e é assim que 56% dos votos sumiam em silêncio.
    expect(targets).toHaveLength(pares.length);
    expect(targets.every((t) => t.nivel === "zona" && t.cargo === cargo)).toBe(true);
    expect(new Set(targets.map((t) => t.url)).size).toBe(pares.length);
    expect(targets.map((t) => t.codMunicipioTse).sort()).toEqual(
      pares.map((p) => p.codMunicipioTse).sort(),
    );
  });

  it("cargo 6 (Deputado Federal) enumera 27 UFs e NÃO toca o banco", async () => {
    const targets = await listIngestTargets("production", { cargo: 6 });

    expect(targets).toHaveLength(27);
    expect(targets.every((t) => t.nivel === "uf" && t.cargo === 6)).toBe(true);
    // Granularidade UF não lê `zonas` — se ler, o ciclo de 15 min paga uma
    // consulta ao Postgres por nada.
    expect(vi.mocked(db.select)).not.toHaveBeenCalled();
    // E não há arquivo agregado `br-` para este cargo (só Presidente tem).
    expect(targets.some((t) => t.uf === "BR")).toBe(false);
  });

  it("cargo 5 saiu de UF para zona — a regressão seria silenciosa", async () => {
    // Se alguém devolver o cargo 5 para `uf`, ele passa a enumerar 27 alvos em
    // vez de um por par. Nada quebra: a tela continua renderizando, o modelo
    // continua rodando, e `p_eleito` volta a degenerar para 0%/100% porque o
    // bootstrap fica com uma única unidade de reamostragem por estado.
    mockZonasRowsOnce([{ uf: "SP", codMunicipioTse: 71072, codZona: 1 }]);

    const targets = await listIngestTargets("production", { cargo: 5 });

    expect(targets.every((t) => t.nivel === "zona")).toBe(true);
    expect(targets.some((t) => t.nivel === "uf")).toBe(false);
  });
});

describe("listIngestTargets — pares (2 municípios na mesma zona)", () => {
  const PARES_MESMA_ZONA = [
    { uf: "SP", codMunicipioTse: 71072, codZona: 1 },
    { uf: "SP", codMunicipioTse: 12345, codZona: 1 },
  ] as const;

  beforeEach(() => {
    vi.stubEnv("TSE_GRANULARIDADE", "zona");
    vi.stubEnv("TSE_COD_ELEICAO", "ele2026/619");
  });

  it("2 pares da mesma zona × 1 cargo ativo → 2 targets com URLs distintas (por mun5)", async () => {
    vi.stubEnv("TSE_CARGOS", "1");
    mockZonasRowsOnce([...PARES_MESMA_ZONA]);

    const targets = await listIngestTargets("production");

    expect(targets).toHaveLength(2);
    expect(targets.every((t) => t.nivel === "zona" && t.codZona === 1 && t.cargo === 1)).toBe(true);
    expect(new Set(targets.map((t) => t.url)).size).toBe(2);
    expect(targets.map((t) => t.codMunicipioTse).sort()).toEqual([12345, 71072]);
    expect(targets.find((t) => t.codMunicipioTse === 71072)?.url).toContain("sp71072-");
    expect(targets.find((t) => t.codMunicipioTse === 12345)?.url).toContain("sp12345-");
  });

  it("opts.cargo restringe a um único cargo mesmo com TSE_CARGOS=1,3 (2 pares → 2 targets, não 4)", async () => {
    vi.stubEnv("TSE_CARGOS", "1,3");
    mockZonasRowsOnce([...PARES_MESMA_ZONA]);

    const targets = await listIngestTargets("production", { cargo: 3 });

    expect(targets).toHaveLength(2);
    expect(targets.every((t) => t.cargo === 3)).toBe(true);
  });

  it("opts.cargo pedido fora de TSE_CARGOS → lista vazia (sem fallback silencioso)", async () => {
    vi.stubEnv("TSE_CARGOS", "3");
    mockZonasRowsOnce([...PARES_MESMA_ZONA]);

    const targets = await listIngestTargets("production", { cargo: 1 });

    expect(targets).toHaveLength(0);
  });

  it("cache diferencia por cargo — opts.cargo=1 e opts.cargo=3 não reaproveitam a mesma entrada", async () => {
    vi.stubEnv("TSE_CARGOS", "1,3");
    mockZonasRowsOnce([...PARES_MESMA_ZONA]);
    await listIngestTargets("production", { cargo: 1 });
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(1);

    mockZonasRowsOnce([...PARES_MESMA_ZONA]);
    await listIngestTargets("production", { cargo: 3 });
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(2);
  });
});

describe("listIngestTargets — granularidade zona (opt-in) — cache não cruza bases", () => {
  it("reaproveita cache no mesmo baseUrl, refaz query quando baseUrl muda", async () => {
    vi.stubEnv("TSE_GRANULARIDADE", "zona");
    vi.stubEnv("TSE_COD_ELEICAO", "ele2026/619");
    vi.stubEnv("TSE_TARGETS_WHITELIST", "SP:1");
    vi.stubEnv("TSE_BASE_URL", "https://mock-a.test/oficial");

    await listIngestTargets("preview");
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(1);

    // Mesmo ambiente (mesma chave de cache) — não deve rodar query de novo.
    await listIngestTargets("preview");
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(1);

    // baseUrl mudou — cache não pode ser reaproveitado (bug que motivou esta task).
    vi.stubEnv("TSE_BASE_URL", "https://mock-b.test/oficial");
    await listIngestTargets("preview");
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(2);
  });

  it("codEleicao diferente também invalida o cache", async () => {
    vi.stubEnv("TSE_GRANULARIDADE", "zona");
    vi.stubEnv("TSE_TARGETS_WHITELIST", "SP:1");
    vi.stubEnv("TSE_BASE_URL", "https://mock-a.test/oficial");

    vi.stubEnv("TSE_COD_ELEICAO", "ele2026/619");
    await listIngestTargets("preview");
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(1);

    vi.stubEnv("TSE_COD_ELEICAO", "ele2026/620");
    await listIngestTargets("preview");
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(2);
  });

  it("granularidade diferente também invalida o cache (uf vs zona)", async () => {
    vi.stubEnv("TSE_COD_ELEICAO", "ele2026/619");
    vi.stubEnv("TSE_TARGETS_WHITELIST", "SP:1");
    vi.stubEnv("TSE_BASE_URL", "https://mock-a.test/oficial");

    vi.stubEnv("TSE_GRANULARIDADE", "uf");
    const ufTargets = await listIngestTargets("preview");
    expect(vi.mocked(db.select)).not.toHaveBeenCalled();

    vi.stubEnv("TSE_GRANULARIDADE", "zona");
    await listIngestTargets("preview");
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(1);
    expect(ufTargets.every((t) => t.nivel === "uf")).toBe(true);
  });
});
