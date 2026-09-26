// @vitest-environment happy-dom
/**
 * tests/integration/uf-governador-corrida-inteira.test.tsx
 *
 * `/uf/[sigla]/governador` no modo SIMULADO tem de listar a corrida INTEIRA
 * daquele estado — não o pódio.
 *
 * ===========================================================================
 * 🔴 O defeito que este arquivo existe para impedir (achado em 2026-09-21,
 * pelo dono, olhando o Rio Grande do Sul)
 * ===========================================================================
 *
 * Com a simulação ligada a página não lia `governador-uf.json`. Ela caía em
 * `synthesizeGovUfFromFixture`, que monta a lista filtrando
 * `national.candidatos` pelos ids de `por_uf[sigla].top_candidatos` — e esse
 * campo é `ordered[:TOP_CANDIDATOS_POR_UF]`, hoje **4**.
 *
 * Medido na fixture daquele dia, com `pnpm dev:sim`:
 *
 *   RS ....... 6 candidaturas, **4** na tela (faltavam PRISCILA VOIGT/UP e
 *              REJANE DE OLIVEIRA/PSTU)
 *   SP ....... 7 → 4
 *   MG, DF ... 11 → **4**
 *
 * E a lista **não tinha linha "Outros"**: a tela afirmava, por omissão, que
 * aquela era a corrida inteira. Ao mesmo tempo
 * `GET /api/projection?uf=RS&cargo=gov` já servia as 6 ao balão do mapa — duas
 * superfícies do mesmo site discordando sobre quem está concorrendo.
 *
 * O conserto foi UMA linha (`if (!payload) payload = simulacaoGovernadorUf(...)`),
 * espelhando `simulacaoUfPresidente` na rota presidencial e `simulacaoSenadorUf`
 * na de Senador. Governador era a única das três sem o equivalente: o getter
 * existia, a docstring dele já dizia "tem PRIORIDADE sobre a síntese", e a
 * chamada nunca foi escrita.
 *
 * 🔴 **Produção nunca teve isso** — `build_uf_payloads` (`api/model/project.py`)
 * percorre `ordered` inteiro sem fatiar, e fora da simulação a rota lê o
 * payload real. Por isso este arquivo mede o RAMO DE SIMULAÇÃO, e é o único
 * lugar que o mede.
 *
 * ===========================================================================
 * Por que um arquivo separado de `uf-governador-page.test.tsx`
 * ===========================================================================
 *
 * Aquele arquivo tem 20 casos e **nenhum** chegava perto deste caminho: todos
 * entregam o payload pronto por `readUfProjection`, então `if (!payload)` nunca
 * roda. Foi por isso que o defeito viveu no repositório sem ninguém ver, e é a
 * razão de não bastar acrescentar um caso lá — `vi.mock` é de MÓDULO, e mockar
 * `@/lib/dev/simulacao` naquele arquivo mudaria os 20 casos de uma vez.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import UFGovernadorPage from "@/app/(gov)/uf/[sigla]/governador/page";
import type { EdgePayload, EdgePayloadUf, EdgeUfCandidate } from "@/lib/edge-config/types";

/**
 * As 6 candidaturas a governador do RS na fixture de 2026-09-21, com os nomes
 * reais — é o caso que o dono viu, e nome real é o que torna a falha legível
 * quando este teste ficar vermelho.
 */
const CORRIDA_RS: ReadonlyArray<{ id: number; nome: string; partido: string; pct: number }> = [
  { id: 23000, nome: "GABRIEL SOUZA", partido: "MDB", pct: 57.5 },
  { id: 23001, nome: "ZUCCO", partido: "PL", pct: 24 },
  { id: 23002, nome: "MARCELO MARANATA", partido: "PSDB", pct: 11 },
  { id: 23003, nome: "JULIANA BRIZOLA", partido: "PDT", pct: 4 },
  // 🔴 As duas que sumiam. Elas são o teste.
  { id: 23004, nome: "PRISCILA VOIGT", partido: "UP", pct: 2.19 },
  { id: 23005, nome: "REJANE DE OLIVEIRA", partido: "PSTU", pct: 1.31 },
];

/** Quantos o `top_candidatos` do payload nacional carrega — `TOP_CANDIDATOS_POR_UF`. */
const PODIO = 4;

function candidatoUf(c: (typeof CORRIDA_RS)[number]): EdgeUfCandidate {
  return {
    id: c.id,
    nome: c.nome,
    partido: c.partido,
    votos_atuais: Math.round(c.pct * 10_000),
    votos_projetados: Math.round(c.pct * 40_000),
    pct_atual: c.pct,
    pct_projetado: c.pct,
    ci95: { lower: c.pct, upper: c.pct },
  };
}

/** O payload por UF do simulado: a corrida INTEIRA. */
const PAYLOAD_UF: EdgePayloadUf = {
  uf: "RS",
  ts: "2026-09-21T11:04:27.111Z",
  cargo: 3,
  turno: 1,
  pct_apurado: 27.5,
  candidatos: CORRIDA_RS.map(candidatoUf),
  needle_position: 1,
  needle_band: "very_likely_a",
} as EdgePayloadUf;

/**
 * O payload NACIONAL, com o corte de pódio — a fonte da síntese.
 *
 * 🔴 `top_candidatos` tem `PODIO` entradas e `national.candidatos` tem as 6.
 * Essa diferença É o discriminante: se os dois tivessem os mesmos 6, apagar a
 * linha do conserto na página deixaria este teste VERDE, e ele não estaria
 * medindo nada. Ver a asserção de sanidade dentro do caso.
 */
const PAYLOAD_NACIONAL: EdgePayload = {
  ts: "2026-09-21T11:04:27.111Z",
  cargo: 3,
  turno: 1,
  pct_apurado_total: 27.5,
  ufs_apuradas: 1,
  national: {
    candidatos: CORRIDA_RS.map((c) => ({
      id: c.id,
      nome: c.nome,
      partido: c.partido,
      votos_atuais: Math.round(c.pct * 10_000),
      votos_projetados: Math.round(c.pct * 40_000),
      pct_atual: c.pct,
      pct_projetado: c.pct,
      pct_projetado_lower: c.pct,
      pct_projetado_upper: c.pct,
      p_vitoria: 0,
      rank: 1,
    })),
    needle_position: 1,
    needle_band: "very_likely_a",
  },
  por_uf: [
    {
      sigla: "RS",
      pct_apurado: 27.5,
      lider: CORRIDA_RS[0]?.id ?? 0,
      margem_atual: 33.5,
      margem_projetada: 33.5,
      top_candidatos: CORRIDA_RS.slice(0, PODIO).map((c) => ({
        id: c.id,
        nome: c.nome,
        partido: c.partido,
        pct: c.pct,
        pct_atual: c.pct,
      })),
    },
  ],
} as unknown as EdgePayload;

vi.mock("@/lib/blob/candidatos", () => ({
  readCandidatosUf: () =>
    Promise.resolve({ status: "unavailable", reason: "not_configured", url: null }) as never,
}));

vi.mock("@/lib/edge-config/reader", () => ({
  readProjection: vi.fn(async () => null),
  readNationalProjection: vi.fn(async () => null),
  readArchivedProjection: vi.fn(async () => null),
  readUfProjection: vi.fn(async () => null),
}));

vi.mock("@/lib/blob/uf-detail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/blob/uf-detail")>()),
  readUfDetail: async () => ({ status: "unavailable", reason: "not_configured", url: null }),
}));

/**
 * `resultadoEleitoral` é repassado com o MESMO corpo do real
 * (`lib/dev/simulacao.ts:142-148`) em vez de virar `() => null`: se ele
 * devolvesse nulo, o ramo da síntese morreria por outro motivo e a mutação de
 * apagar a linha do conserto passaria despercebida — o teste ficaria verde pelo
 * mock, não pelo código.
 */
vi.mock("@/lib/dev/simulacao", () => ({
  simulacaoLigada: () => true,
  simulacaoGovernadorUf: (sigla: string) => (sigla === "RS" ? PAYLOAD_UF : null),
  simulacaoNacional: () => PAYLOAD_NACIONAL,
  simulacaoMunicipiosUf: () => null,
  resultadoEleitoral: async <T,>(daSimulacao: () => T | null) => daSimulacao(),
}));

describe("/uf/RS/governador no simulado — a corrida inteira, não o pódio", () => {
  it("lista as 6 candidaturas do RS, e não as 4 do `top_candidatos`", async () => {
    // 🔴 Sanidade do PRÓPRIO teste, antes de medir a página. Um dado em que o
    // nacional já trouxesse todo mundo não conseguiria reprovar o defeito —
    // é a armadilha de "fixture em que as duas ordens coincidem", que nesta
    // base já deixou três mutações sobreviverem.
    expect(
      PAYLOAD_NACIONAL.por_uf[0]?.top_candidatos?.length,
      "o payload nacional precisa carregar MENOS que a corrida, senão este teste não discrimina",
    ).toBeLessThan(CORRIDA_RS.length);

    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "RS" }) });
    const html = renderToStaticMarkup(node);
    const doc = new DOMParser().parseFromString(html, "text/html");

    const linhas = doc.querySelectorAll('[data-testid="candidate-result-row"]');
    expect(
      linhas.length,
      `A página renderizou ${linhas.length} linhas para uma corrida de ${CORRIDA_RS.length}. ` +
        `${PODIO} é exatamente o tamanho de \`top_candidatos\` — se for esse o número, a rota ` +
        "voltou a sintetizar a partir do payload nacional em vez de ler `governador-uf.json`.",
    ).toBe(CORRIDA_RS.length);

    // Nome a nome, e não só a contagem: uma lista de 6 com a pessoa errada
    // passaria no `toBe` acima.
    for (const c of CORRIDA_RS) {
      expect(html, `"${c.nome}" (${c.partido}) não está na tela`).toContain(c.nome);
    }
  });

  it("não inventa linha 'Outros' quando a corrida inteira já está na tela", async () => {
    // A contrapartida do caso acima: com todo mundo listado, um agregado de
    // cauda seria uma linha a mais sem ninguém dentro. É também o que separa
    // "a página passou a mostrar 6" de "a página passou a mostrar 4 + Outros".
    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "RS" }) });
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");

    const linhas = [...doc.querySelectorAll('[data-testid="candidate-result-row"]')];
    const comOutros = linhas.filter((l) => (l.textContent ?? "").includes("Outros"));
    expect(comOutros).toHaveLength(0);
  });
});
