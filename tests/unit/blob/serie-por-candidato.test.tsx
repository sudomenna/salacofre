/**
 * tests/unit/blob/serie-por-candidato.test.tsx — spec 020 / ADR-0046, lado TS.
 *
 * O transporte da série por candidatura, dos dois lados da divisória do
 * ADR-0032: o campo novo desce para o Blob junto com as séries que já desciam,
 * e o campo novo NÃO sobe para o Global Config. E o texto que a tela mostra
 * quando o arquivo chega sem ele.
 *
 * Cada `it` abaixo é escrito contra uma mutação nomeada no próprio título ou no
 * comentário. `.tsx` e não `.ts` porque o quarto grupo renderiza um componente.
 *
 * O projeto tem histórico de teste que passa sem provar nada (ver
 * `docs/specs/020-evolucao-da-apuracao/design.md` § 9): nenhuma asserção aqui é
 * "o campo existe" — todas comparam valor, e as fixtures são construídas para
 * que a mutação mude o resultado.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DetailUnavailable,
  type DetailUnavailableReason,
} from "@/components/atoms/surfaces/DetailUnavailable";
import {
  readUfDetail,
  seriePorCandidatoFrom,
  seriesFrom,
  splitUfPayload,
  type UfDetailResult,
} from "@/lib/blob/uf-detail";
import type {
  EdgeSeriePorCandidato,
  EdgeUfMunicipio,
  UfPayloadInput,
} from "@/lib/edge-config/types";

const BASE = "https://exemplo.test";
const URL_SP_PRES_T1 = `${BASE}/municipios/uf/SP/pres/t1.json`;

/**
 * A série de fixture tem três propriedades escolhidas de propósito:
 *
 *   1. **Um furo no meio** (`null` no índice 1 de Lima). É o valor que um
 *      `?? 0` em qualquer ponto da pilha destruiria, e a regra dos três
 *      estados do dono proíbe fabricar.
 *   2. **Ordem que não é a ordem por id** (id 22 antes do id 11). Uma mutação
 *      que ordene o array em qualquer etapa do transporte muda o resultado.
 *   3. **Valores distintos entre `apurado` e `projetado`**, e em direções
 *      opostas, para que trocar as duas colunas mude o resultado.
 */
function makeSerie(): EdgeSeriePorCandidato {
  return {
    eixo: ["2026-10-04T20:15:00-03:00", "2026-10-04T20:30:00-03:00", "2026-10-04T20:45:00-03:00"],
    cadencia_min: 15,
    candidatos: [
      {
        id: 22,
        nome: "Souza",
        partido: "PT",
        apurado: [10, 20, 30],
        projetado: [40, 35, 31],
      },
      {
        id: 11,
        nome: "Lima",
        partido: "PL",
        sqcand: "250001234567",
        apurado: [30, null, 32],
        projetado: [29, 31, 33],
      },
    ],
  };
}

function makeMunicipio(i: number): EdgeUfMunicipio {
  return {
    cod_ibge: `35${String(i).padStart(5, "0")}`,
    nome: `Município ${i}`,
    pct_apurado: 50 + i,
    lider: { candidato_id: 22, partido: "PT", votos: 1000 + i, margem_pp: 5 },
    votos_reportados: { 22: 1000 + i, 11: 800 },
  };
}

function makeInput(opts: { comSerie: boolean }): UfPayloadInput {
  return {
    uf: "SP",
    ts: "2026-10-04T20:45:00-03:00",
    cargo: 1,
    turno: 1,
    pct_apurado: 42,
    candidatos: [],
    needle_position: 0.3,
    needle_band: "lean_a",
    mesorregioes: [],
    municipios: [makeMunicipio(0)],
    series_temporais: {
      margem: [{ ts: "2026-10-04T20:45:00-03:00", margem_pp: 2 }],
      p_vitoria: [],
      turnout: [],
      ...(opts.comSerie ? { por_candidato: makeSerie() } : {}),
    },
  };
}

function okResult(detail: Record<string, unknown>): UfDetailResult {
  return {
    status: "ok",
    detail: detail as unknown as Extract<UfDetailResult, { status: "ok" }>["detail"],
    url: URL_SP_PRES_T1,
  };
}

// ---------------------------------------------------------------------------
// 1. splitUfPayload — a divisória do ADR-0032 aplicada ao campo novo
// ---------------------------------------------------------------------------

describe("splitUfPayload — `por_candidato` desce ao Blob e não sobe ao Global Config", () => {
  /**
   * MUTAÇÃO QUE ESTE TESTE MATA: trocar o destructuring por uma reconstrução
   * explícita do objeto de séries no detalhe —
   * `series_temporais: { margem, p_vitoria, turnout }` — que é a forma natural
   * de "deixar o tipo explícito" e que dropa `por_candidato` em silêncio. O
   * blob continuaria válido, o typecheck continuaria limpo, e o gráfico ficaria
   * permanentemente em "sem série" sem nenhum erro em lugar nenhum.
   *
   * Também mata `?? 0` / `.filter(Boolean)` aplicado às colunas em trânsito: a
   * asserção é sobre o furo (`null` no índice 1), não sobre o comprimento.
   */
  it("o detalhe carrega a série INTEIRA, com o furo preservado como null", () => {
    const { detail } = splitUfPayload(makeInput({ comSerie: true }), "pres", 1);
    const serie = detail.series_temporais?.por_candidato;

    expect(serie?.eixo).toEqual([
      "2026-10-04T20:15:00-03:00",
      "2026-10-04T20:30:00-03:00",
      "2026-10-04T20:45:00-03:00",
    ]);
    expect(serie?.cadencia_min).toBe(15);
    // O furo é `null`, e não `0`: um balde sem ciclo não é um mergulho ao chão.
    expect(serie?.candidatos[1]?.apurado).toEqual([30, null, 32]);
    expect(serie?.candidatos[1]?.apurado[1]).toBeNull();
    // E a coluna de projeção não foi trocada com a de apurado (direções opostas).
    expect(serie?.candidatos[0]?.apurado).toEqual([10, 20, 30]);
    expect(serie?.candidatos[0]?.projetado).toEqual([40, 35, 31]);
    // Ordem de exibição é contrato do produtor (ADR-0046 D4): 22 antes de 11.
    expect(serie?.candidatos.map((c) => c.id)).toEqual([22, 11]);
  });

  /**
   * MUTAÇÃO QUE ESTE TESTE MATA: alguém "resolver" o caso nacional copiando o
   * padrão para UF — acrescentar `serie_por_candidato` (ou deixar
   * `series_temporais` inteiro) ao lado `stored`. É a mutação mais provável
   * aqui, porque o campo nacional EXISTE em `EdgePayload` e a simetria convida.
   * Custo real: 27 UF × 3 cargos × 6.905 B = 559.305 B, levando o store de
   * ~410 KB a ~969 KB — escrita RECUSADA na noite de 04/10 (ADR-0046 D3).
   *
   * A asserção é sobre o JSON serializado, não sobre a ausência da chave: um
   * campo aninhado três níveis abaixo passaria por um `not.toHaveProperty`.
   */
  it("o payload ARMAZENADO não menciona a série em nenhum nível (ADR-0046 D3)", () => {
    const { stored } = splitUfPayload(makeInput({ comSerie: true }), "pres", 1);
    const json = JSON.stringify(stored);

    expect(json).not.toContain("por_candidato");
    expect(json).not.toContain("serie_por_candidato");
    expect(json).not.toContain("cadencia_min");
    // Nome de urna só existe dentro da série nesta fixture — se ele aparecer,
    // a série vazou inteira, por qualquer caminho.
    expect(json).not.toContain("Souza");
    // E o resumo que DEVE ficar continua lá.
    expect(stored.pct_apurado).toBe(42);
    expect(stored.uf).toBe("SP");
  });

  /**
   * MUTAÇÃO QUE ESTE TESTE MATA: tornar `por_candidato` obrigatório no
   * caminho de escrita (um `series_temporais.por_candidato!` ou um throw de
   * validação). Em fase pré-eleição e em todo ciclo anterior à spec 020 o
   * produtor não emite o campo, e a escrita do Blob inteiro passaria a falhar.
   */
  it("input SEM a série continua escrevendo o Blob, com o campo apenas ausente", () => {
    const { detail } = splitUfPayload(makeInput({ comSerie: false }), "gov", 2);
    expect(detail.series_temporais).not.toBeNull();
    expect(detail.series_temporais).not.toHaveProperty("por_candidato");
    expect(detail.series_temporais?.margem).toHaveLength(1);
    expect(detail.cargo).toBe("gov");
    expect(detail.turno).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 2. isUfDetailBlob — compatibilidade com o que já está gravado
// ---------------------------------------------------------------------------

describe("isUfDetailBlob — blob antigo, sem o campo novo, continua válido", () => {
  const savedBase = process.env.BLOB_PUBLIC_BASE_URL;
  const savedToken = process.env.BLOB_READ_WRITE_TOKEN;

  beforeEach(() => {
    process.env.BLOB_PUBLIC_BASE_URL = BASE;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (savedBase === undefined) delete process.env.BLOB_PUBLIC_BASE_URL;
    else process.env.BLOB_PUBLIC_BASE_URL = savedBase;
    if (savedToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = savedToken;
    vi.restoreAllMocks();
  });

  function mockFetch(body: unknown) {
    return vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch,
      );
  }

  /**
   * MUTAÇÃO QUE ESTE TESTE MATA: endurecer o guard junto com o campo novo —
   * `typeof v.series_temporais === "object"`, ou exigir `por_candidato`. Todo
   * blob gravado antes da spec 020 (e a fixture municipal versionada, que nem
   * `series_temporais` tem) viraria `invalid` de uma vez, em todas as 27 UFs.
   * Note que o corpo abaixo não tem a chave `series_temporais` DE FORMA ALGUMA.
   */
  it("200 sem `series_temporais` → ok, e os dois acessores devolvem null", async () => {
    mockFetch({
      ts: "2026-10-04T20:45:30-03:00",
      uf: "SP",
      cargo: "pres",
      turno: 1,
      municipios: [makeMunicipio(0)],
    });

    const result = await readUfDetail("SP", { cargo: "pres", turno: 1 });

    expect(result.status).toBe("ok");
    expect(seriesFrom(result)).toBeUndefined();
    expect(seriePorCandidatoFrom(result)).toBeNull();
  });

  /**
   * O par do anterior: o campo novo ATRAVESSA a leitura com os valores
   * intactos. Sem este, a permissividade do guard poderia ser "sempre true"
   * e o campo nunca chegar ao consumidor.
   */
  it("200 com `por_candidato` → ok, e a série chega com o furo intacto", async () => {
    mockFetch({
      ts: "2026-10-04T20:45:30-03:00",
      uf: "SP",
      cargo: "pres",
      turno: 1,
      municipios: [],
      series_temporais: { margem: [], p_vitoria: [], turnout: [], por_candidato: makeSerie() },
    });

    const result = await readUfDetail("SP", { cargo: "pres", turno: 1 });
    const serie = seriePorCandidatoFrom(result);

    expect(serie?.candidatos.map((c) => c.id)).toEqual([22, 11]);
    expect(serie?.candidatos[1]?.apurado).toEqual([30, null, 32]);
    expect(serie?.cadencia_min).toBe(15);
  });

  /**
   * MUTAÇÃO QUE ESTE TESTE MATA: "o guard é permissivo" virar "o guard não
   * discrimina nada". Um blob da UF errada — o modo de falha que motivou o
   * campo `uf` redundante no objeto — precisa continuar sendo recusado, mesmo
   * trazendo a série nova e bem-formada.
   */
  it("blob de OUTRA UF, mesmo COM a série, continua invalid", async () => {
    mockFetch({
      ts: "2026-10-04T20:45:30-03:00",
      uf: "RJ",
      cargo: "pres",
      turno: 1,
      municipios: [],
      series_temporais: { margem: [], p_vitoria: [], turnout: [], por_candidato: makeSerie() },
    });

    const result = await readUfDetail("SP", { cargo: "pres", turno: 1 });

    expect(result).toMatchObject({ status: "unavailable", reason: "invalid" });
    expect(seriePorCandidatoFrom(result)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. seriePorCandidatoFrom — os dois nulls que a tela precisa distinguir
// ---------------------------------------------------------------------------

describe("seriePorCandidatoFrom", () => {
  /**
   * MUTAÇÃO QUE ESTE TESTE MATA: `result.detail.series_temporais.por_candidato`
   * sem o `?.`. `series_temporais: null` é o valor CANÔNICO que
   * `splitUfPayload` grava quando o orchestrator não emite séries — não é um
   * caso de borda inventado —, e o acessor lançaria `TypeError` dentro de um
   * Server Component, derrubando a página inteira em vez de mostrar um estado.
   */
  it("detalhe veio com `series_temporais: null` → null, sem lançar", () => {
    const result = okResult({
      ts: "x",
      uf: "SP",
      cargo: "pres",
      turno: 1,
      municipios: [],
      series_temporais: null,
    });
    expect(() => seriePorCandidatoFrom(result)).not.toThrow();
    expect(seriePorCandidatoFrom(result)).toBeNull();
  });

  /**
   * MUTAÇÃO QUE ESTE TESTE MATA: devolver `series_temporais` inteiro (ou
   * `series_temporais ?? null`) em vez do campo aninhado — um copiar-colar de
   * `seriesFrom`, que é literalmente a função vizinha. O consumidor receberia
   * um objeto truthy com `margem`/`p_vitoria`/`turnout` e nenhum `eixo`, e o
   * gráfico renderizaria vazio em vez de cair no estado `sem_serie`.
   */
  it("detalhe veio, séries vieram, mas SEM `por_candidato` → null (não o objeto de séries)", () => {
    const result = okResult({
      ts: "x",
      uf: "SP",
      cargo: "pres",
      turno: 1,
      municipios: [],
      series_temporais: { margem: [{ ts: "x", margem_pp: 1 }], p_vitoria: [], turnout: [] },
    });

    expect(seriePorCandidatoFrom(result)).toBeNull();
    // ... e a função vizinha continua devolvendo o objeto de séries: as duas
    // não colapsaram uma na outra.
    expect(seriesFrom(result)?.margem).toHaveLength(1);
  });

  /**
   * MUTAÇÃO QUE ESTE TESTE MATA: trocar o gate `status !== "ok"` por uma
   * leitura otimista (`(result as any).detail?...`). O resultado seria o mesmo
   * `null` — mas o par com o teste acima é o que importa: a tela tem de poder
   * separar "o Blob não respondeu" de "o Blob respondeu sem a série", e é este
   * teste que fixa que os dois caminhos existem e são distinguíveis pelo
   * `status`/`reason` do resultado, não pelo retorno do acessor.
   */
  it("detalhe NÃO veio → null, e o motivo continua legível no resultado", () => {
    const result: UfDetailResult = {
      status: "unavailable",
      reason: "fetch_error",
      url: URL_SP_PRES_T1,
    };
    expect(seriePorCandidatoFrom(result)).toBeNull();
    expect(result.status === "unavailable" && result.reason).toBe("fetch_error");
  });

  /**
   * MUTAÇÃO QUE ESTE TESTE MATA: o acessor ordenar `candidatos` (por id, por
   * `apurado[last]`, tanto faz). A ordem do array é contrato do produtor
   * (ADR-0046 D4) e o consumidor não re-ordena; a fixture usa id 22 antes de
   * id 11 justamente para que qualquer sort mude o resultado.
   */
  it("devolve a série na ordem recebida — o consumidor não re-ordena", () => {
    const result = okResult({
      ts: "x",
      uf: "SP",
      cargo: "pres",
      turno: 1,
      municipios: [],
      series_temporais: { margem: [], p_vitoria: [], turnout: [], por_candidato: makeSerie() },
    });

    const serie = seriePorCandidatoFrom(result);
    expect(serie?.candidatos.map((c) => c.id)).toEqual([22, 11]);
    expect(serie?.candidatos.map((c) => c.partido)).toEqual(["PT", "PL"]);
  });
});

// ---------------------------------------------------------------------------
// 4. DetailUnavailable — `sem_serie` tem frase própria
// ---------------------------------------------------------------------------

describe("DetailUnavailable — o motivo `sem_serie`", () => {
  function textoDe(reason: DetailUnavailableReason): string {
    const html = renderToStaticMarkup(
      <DetailUnavailable label="A evolução da apuração" reason={reason} />,
    );
    return html;
  }

  /**
   * MUTAÇÃO QUE ESTE TESTE MATA: mapear `sem_serie` para a frase de `invalid`
   * (ou de `fetch_error`) — o colapso exato que o design § 3.4 nomeia. É a
   * mutação barata: as três frases falam do "arquivo de detalhe", e reusar uma
   * delas parece inofensivo. O custo é operacional: na noite da apuração o
   * operador lê "fora do formato esperado", vai caçar parser ou rede, e o que
   * aconteceu foi o produtor não ter publicado a série.
   *
   * A asserção compara o HTML renderizado inteiro, não só o `data-reason`: um
   * teste que só checasse o atributo passaria com as duas frases idênticas.
   */
  it("rende texto PRÓPRIO, diferente de `invalid` e de `fetch_error`", () => {
    const semSerie = textoDe("sem_serie");
    expect(semSerie).toContain("ainda sem a série por candidatura");
    expect(semSerie).toContain('data-reason="sem_serie"');
    expect(semSerie).not.toContain("fora do formato esperado");

    // E as três são efetivamente três frases, não uma repetida.
    const corpo = (html: string) => html.replace(/data-reason="[^"]*"/, "");
    expect(corpo(semSerie)).not.toBe(corpo(textoDe("invalid")));
    expect(corpo(semSerie)).not.toBe(corpo(textoDe("fetch_error")));
  });

  /**
   * Propriedade, e não caso: os SEIS motivos rendem seis frases distintas.
   * MUTAÇÃO QUE ESTE TESTE MATA: qualquer colapso futuro entre dois motivos
   * quaisquer — inclusive um motivo novo adicionado ao union copiando a frase
   * do vizinho, que é como `sem_serie` quase nasceu.
   */
  it("os seis motivos rendem seis frases distintas", () => {
    const motivos: DetailUnavailableReason[] = [
      "not_configured",
      "not_found",
      "fetch_error",
      "invalid",
      "empty",
      "sem_serie",
    ];
    const frases = motivos.map((r) => textoDe(r).replace(/data-reason="[^"]*"/, ""));
    expect(new Set(frases).size).toBe(motivos.length);
  });

  /**
   * O bloco continua NO DOM (ADR-0032 item 3 / ADR-0017): `sem_serie` não pode
   * virar um atalho para esconder o gráfico.
   * MUTAÇÃO QUE ESTE TESTE MATA: `if (reason === "sem_serie") return null`.
   */
  it("o bloco continua no DOM, com o rótulo do que faltou", () => {
    const html = textoDe("sem_serie");
    expect(html).toContain("A evolução da apuração");
    expect(html).toContain('data-testid="detail-unavailable"');
    expect(html).toContain("não são afetados por isto");
  });
});
