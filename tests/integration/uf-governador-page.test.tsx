// @vitest-environment happy-dom
/**
 * tests/integration/uf-governador-page.test.tsx
 *
 * Smoke da `/uf/[sigla]/governador` (spec 005 — drill-down UF Gov).
 *
 * Estratégia
 *   - Mocka `readUfProjection({cargo:"gov"})` retornando payload populado
 *     com municípios, mesorregiões opcional, e (em um caso) `model_fallback_tier`
 *     — hoje só para provar que ele NÃO gera mais banner (ADR-0021).
 *   - Renderiza via `renderToStaticMarkup`. Mapas via dynamic import com
 *     ssr:false expandem para placeholder em SSR.
 *
 * Cobertura
 *   - RFs 031..044 (espelho da spec 004 com cargo gov).
 *   - MunicipioWaffleGrid (Print 3), mesorregioes condicional, MunicipioTable
 *     top-by-eleitorado, ausência do antigo disclaimer de K-1.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import UFGovernadorPage from "@/app/uf/[sigla]/governador/page";
import type { UfDetailBlob, UfDetailResult } from "@/lib/blob/uf-detail";
import type { EdgePayloadUf, EdgeUfMunicipio } from "@/lib/edge-config/types";

function makeMunicipio(i: number): EdgeUfMunicipio {
  const liderId = i % 2 === 0 ? 1 : 2;
  return {
    cod_ibge: `35${String(i).padStart(5, "0")}`,
    nome: `Município ${i + 1}`,
    pct_apurado: 60 + (i % 30),
    lider: {
      candidato_id: liderId,
      partido: liderId === 1 ? "REP" : "PSOL",
      votos: 10000 + i * 100,
      margem_pp: 10 + (i % 5),
    },
    votos_reportados: {
      1: liderId === 1 ? 15000 : 8000,
      2: liderId === 2 ? 15000 : 8000,
    },
  };
}

function buildUfPayload(opts: {
  municipios: number;
  withMesorregioes: boolean;
  modelTier?: 1 | 2 | 3;
  /** S07/Fase 2 — corrida de 1T com mais de dois nomes (modo multi-1t). */
  multiCandidato?: boolean;
  comParticipacao?: boolean;
  turno?: 1 | 2;
}): EdgePayloadUf {
  const base: EdgePayloadUf = {
    uf: "SP",
    ts: "2026-10-04T17:30:00-03:00",
    cargo: 3,
    turno: 1,
    pct_apurado: 62,
    candidatos: [
      {
        id: 1,
        nome: "Tarcísio",
        partido: "REP",
        cor: "var(--color-cand-1)",
        votos_atuais: 6000000,
        votos_projetados: 9500000,
        pct_atual: 52,
        pct_projetado: 52,
        ci95: { lower: 50, upper: 54 },
      },
      {
        id: 2,
        nome: "Boulos",
        partido: "PSOL",
        cor: "var(--color-cand-2)",
        votos_atuais: 4400000,
        votos_projetados: 7000000,
        pct_atual: 38,
        pct_projetado: 38,
        ci95: { lower: 36, upper: 40 },
      },
    ],
    needle_position: 0.4,
    needle_band: "lean_a",
  };
  base.turno = opts.turno ?? 1;
  if (opts.multiCandidato) {
    base.candidatos = [
      ...base.candidatos,
      {
        id: 3,
        nome: "Marina",
        partido: "REDE",
        cor: "var(--color-cand-3)",
        votos_atuais: 700000,
        votos_projetados: 1100000,
        pct_atual: 6,
        pct_projetado: 6,
        ci95: { lower: 5, upper: 7 },
      },
      {
        id: 4,
        nome: "Datena",
        partido: "PSDB",
        cor: "var(--color-cand-4)",
        votos_atuais: 300000,
        votos_projetados: 500000,
        pct_atual: 3,
        pct_projetado: 3,
        ci95: { lower: 2, upper: 4 },
      },
    ];
  }
  if (opts.comParticipacao) {
    base.participacao = {
      abstencao: {
        pct_atual: 20.4,
        pct_projetado: 21.2,
        lower: 19.9,
        upper: 22.6,
        base: "eleitores_instalados",
      },
      brancos_nulos: {
        pct_atual: 7.1,
        pct_projetado: 7.5,
        lower: 6.8,
        upper: 8.3,
        base: "comparecimento",
      },
      outros: {
        pct_atual: 3.0,
        pct_projetado: 3.2,
        lower: 2.4,
        upper: 4.1,
        base: "votaveis",
        n_candidatos: 1,
      },
    };
  }
  if (opts.withMesorregioes) {
    base.mesorregioes = [
      {
        cod: "3515",
        nome: "Metropolitana de São Paulo",
        pct_apurado: 65,
        lider_candidato_id: 1,
        lider_pct: 51,
        margem: 13,
        delta_vs_2022: 2.4,
        num_municipios: 39,
      },
      {
        cod: "3501",
        nome: "São José do Rio Preto",
        pct_apurado: 60,
        lider_candidato_id: 1,
        lider_pct: 58,
        margem: 22,
        delta_vs_2022: null,
        num_municipios: 96,
      },
    ];
  }
  if (opts.modelTier != null) {
    return { ...base, model_fallback_tier: opts.modelTier };
  }
  return base;
}

const readUfProjectionMock = vi.fn();
vi.mock("@/lib/edge-config/reader", () => ({
  readProjection: vi.fn(async () => null),
  readNationalProjection: vi.fn(async () => null),
  readArchivedProjection: vi.fn(async () => null),
  readUfProjection: (sigla: string, opts?: { cargo?: string }) => readUfProjectionMock(sigla, opts),
}));

/**
 * Desde o ADR-0032 esta página tem DOIS read paths: o resumo no Global Config
 * e o detalhe (municípios + séries) no Vercel Blob. Só `readUfDetail` é
 * mockado — `municipiosFrom`/`seriesFrom` seguem os reais, para o teste
 * exercitar a coalescência de verdade.
 *
 * O default é `unavailable`: sem detalhe explicitamente mockado, a página cai
 * no estado "detalhe indisponível", que é exatamente o comportamento a fixar.
 */
const readUfDetailMock = vi.fn(
  async (): Promise<UfDetailResult> => ({
    status: "unavailable",
    reason: "not_configured",
    url: null,
  }),
);
vi.mock("@/lib/blob/uf-detail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/blob/uf-detail")>()),
  readUfDetail: () => readUfDetailMock(),
}));

/** Detalhe de Blob com `n` municípios e séries vazias. */
function buildUfDetail(n: number): UfDetailBlob {
  return {
    ts: "2026-10-04T17:30:00-03:00",
    uf: "SP",
    cargo: "gov",
    turno: 1,
    municipios: Array.from({ length: n }, (_, i) => makeMunicipio(i)),
    series_temporais: { margem: [], p_vitoria: [], turnout: [] },
  };
}

/** Enfileira os dois read paths de uma renderização — resumo e detalhe. */
function mockUf(opts: Parameters<typeof buildUfPayload>[0]): void {
  readUfProjectionMock.mockResolvedValueOnce(buildUfPayload(opts));
  readUfDetailMock.mockResolvedValueOnce({
    status: "ok",
    detail: buildUfDetail(opts.municipios),
    url: "https://example.test/municipios/uf/SP/gov/t1.json",
  });
}

describe("UFGovernadorPage (integration / smoke)", () => {
  it("(a) renderiza header e breadcrumb 'Governadores › SP' apontando pra /governador", async () => {
    mockUf({ municipios: 20, withMesorregioes: false });
    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");

    // S07/Bloco 2 (ADR-0029 § 5): o `<h1>` saiu da primeira dobra e virou o
    // título do painel de resultado, alternando parcial/projeção por cascata.
    // Os dois textos ficam no DOM; o CSS revela um.
    const h1 = doc.querySelectorAll("h1");
    expect(h1).toHaveLength(1);
    expect(h1[0]?.textContent).toContain("Governador SP — Resultado parcial");
    expect(h1[0]?.textContent).toContain("Governador SP — Projeção Atlas Menna");
    // ADR-0019: breadcrumb passa a mostrar a profundidade real da trilha
    // governador (que não tem nó nacional), preservando o link de volta.
    const crumbs = [...doc.querySelectorAll('nav[aria-label="Breadcrumb"] li')].map((li) =>
      li.textContent?.replace(/[\s›]+/g, " ").trim(),
    );
    expect(crumbs).toEqual(["Governadores", "SP"]);
    expect(doc.querySelector('nav[aria-label="Breadcrumb"] a')?.getAttribute("href")).toBe(
      "/governador",
    );
  });

  it("(b) renderiza waffle grid com SVG e legend", async () => {
    mockUf({ municipios: 25, withMesorregioes: false });
    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Cada quadrado é um município");
    expect(html).toContain('data-testid="waffle-svg"');
    expect(html).toContain('data-testid="waffle-legend"');
    // Tarcísio aparece na legend (líder de municípios pares)
    expect(html).toMatch(/Tarcísio[\s\S]*?mun\./);
  });

  it("(c) bloco mesorregião renderiza quando populado", async () => {
    mockUf({ municipios: 20, withMesorregioes: true });
    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Apuração por mesorregião");
    expect(html).toContain("Metropolitana de São Paulo");
    expect(html).toContain("São José do Rio Preto");
    // delta_vs_2022 = +2.4 para uma; "—" para outra
    expect(html).toContain("+2.4pp");
    expect(html).toContain("—");
  });

  it("(d) bloco mesorregião AUSENTE quando lista vazia/undefined (degrade gracioso)", async () => {
    mockUf({ municipios: 20, withMesorregioes: false });
    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    const html = renderToStaticMarkup(node);
    expect(html).not.toContain("Apuração por mesorregião");
  });

  it("(e) MunicipioTable mode='top-by-eleitorado' renderiza (header)", async () => {
    mockUf({ municipios: 20, withMesorregioes: false });
    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    const html = renderToStaticMarkup(node);
    // O modo top-by-eleitorado renderiza o header customizado; sem eleitorado
    // populado, a lista filtra todos e fica 0 — mas o título aparece.
    expect(html).toContain("Maiores municípios por eleitorado");
  });

  it("(f) NÃO existe mais disclaimer de K-1, nem com model_fallback_tier >= 2", async () => {
    // ADR-0021 supersede o ADR-0015: a projeção não usa 2022 como insumo, logo
    // não existe "bloco político sem mapeamento histórico". O banner foi
    // removido em S07/Fase 5; o campo `model_fallback_tier` segue no payload
    // como @deprecated e não pode mais produzir texto na tela.
    mockUf({ municipios: 10, withMesorregioes: false, modelTier: 2 });
    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    const html = renderToStaticMarkup(node);
    expect(html).not.toContain("Modelagem com prior limitado");
    expect(html).not.toContain("pesquisa pré-eleitoral");
  });

  it("(g) tier 3 também não produz texto de 'sem mapeamento histórico'", async () => {
    mockUf({ municipios: 10, withMesorregioes: false, modelTier: 3 });
    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    const html = renderToStaticMarkup(node);
    expect(html).not.toContain("sem mapeamento histórico");
    // a página segue renderizando normalmente — a remoção não quebra o resto
    expect(html).toContain("Governador SP — Resultado parcial");
  });

  // -------------------------------------------------------------------------
  // S07/Fase 2 — ADR-0018 (hero 1T) + ADR-0019 (trilha gov).
  // -------------------------------------------------------------------------

  it("(i) 1T com mais de dois candidatos → seis termômetros", async () => {
    mockUf({
      municipios: 10,
      withMesorregioes: false,
      multiCandidato: true,
      comParticipacao: true,
    });
    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");

    const bloco = doc.querySelector('section[aria-labelledby="projecao-termometros-heading"]');
    expect(bloco?.querySelectorAll('[role="meter"]')).toHaveLength(6);
    expect(doc.body.textContent).toContain("Projeção do 1º turno — Governador SP");
    // Top 3 da corrida estadual, não do nacional.
    expect(doc.querySelector("#termometro-cand-1")).not.toBeNull();
    expect(doc.querySelector("#termometro-cand-3")).not.toBeNull();
    expect(doc.querySelector("#termometro-cand-4")).toBeNull();
  });

  it("(j) duelo (2 candidatos) e 2º turno → sem termômetros", async () => {
    mockUf({ municipios: 10, withMesorregioes: false });
    const duelo = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    expect(renderToStaticMarkup(duelo)).not.toContain('id="termometro-');

    mockUf({
      municipios: 10,
      withMesorregioes: false,
      multiCandidato: true,
      turno: 2,
    });
    const segundoTurno = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    const html = renderToStaticMarkup(segundoTurno);
    expect(html).not.toContain('id="termometro-');
    // Layout de 2T preservado: agulha estadual continua lá.
    expect(html).toContain("Forecast ao vivo — Governador SP");
  });

  it("(k) trilha gov: main[data-trilha=gov] + kicker 'GOVERNADOR · SP'", async () => {
    mockUf({ municipios: 10, withMesorregioes: false });
    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");

    expect(doc.querySelector("main")?.getAttribute("data-trilha")).toBe("gov");
    expect(
      doc.querySelector("[data-trilha-kicker]")?.textContent?.replace(/\s+/g, " ").trim(),
    ).toBe("GOVERNADOR · SP");
  });

  it("(h) pré-eleição (payload null) renderiza fallback gentil", async () => {
    readUfProjectionMock.mockResolvedValueOnce(null);
    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Aguardando dados");
    expect(html).toContain("Não oficial");
  });
});

// ---------------------------------------------------------------------------
// S07/Bloco 2 (ADR-0029) — "mapa primeiro" na rota de governador por UF.
// ---------------------------------------------------------------------------
describe("UFGovernadorPage — recomposição S07/Bloco 2 (ADR-0029)", () => {
  async function renderGov(): Promise<Document> {
    mockUf({ municipios: 12, withMesorregioes: true, multiCandidato: true });
    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
  }

  it("(l) o <Footer> continua DENTRO do <main data-trilha> desta página", async () => {
    const doc = await renderGov();
    const main = doc.querySelector("main[data-trilha]");
    expect(main).not.toBeNull();
    const footer = main?.querySelector("footer");
    expect(footer).not.toBeNull();
    expect(footer?.textContent).toContain("Não oficial");
    expect(doc.querySelectorAll("footer")).toHaveLength(1);
  });

  it("(m) o mapa é o primeiro conteúdo, antes do painel de resultado", async () => {
    const doc = await renderGov();
    const mapa = doc.querySelector('section[aria-labelledby="leader-map-heading"]');
    const painel = doc.querySelector("#resultado-heading");
    expect(mapa).not.toBeNull();
    expect(painel).not.toBeNull();
    expect(
      mapa && painel && mapa.compareDocumentPosition(painel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("(n) exatamente um <h1>, e ele é o título do painel de resultado", async () => {
    const doc = await renderGov();
    const h1s = doc.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.getAttribute("id")).toBe("resultado-heading");
  });

  it("(o) linhas de candidato com parcial e projeção lado a lado (ADR-0029 § 7)", async () => {
    const doc = await renderGov();
    const linhas = doc.querySelectorAll('[data-testid="candidate-result-row"]');
    expect(linhas.length).toBeGreaterThan(0);
    expect(linhas[0]?.querySelector('[data-view-cell="parcial"]')).not.toBeNull();
    expect(linhas[0]?.querySelector('[data-view-cell="proj"]')).not.toBeNull();
  });

  it("(p) a grade está ligada à folha do município — cada quadrado carrega seu cod_ibge", async () => {
    const doc = await renderGov();

    // A grade é o caminho de ponteiro: o handler do `<svg role="img">` lê o
    // `data-cod` do `<rect>` que recebeu o toque.
    const svg = doc.querySelector('[data-testid="waffle-svg"]');
    expect(svg?.getAttribute("style")).toContain("cursor:pointer");
    const rects = [...doc.querySelectorAll('[data-testid="waffle-svg"] rect')];
    expect(rects).toHaveLength(12);
    expect(rects.every((r) => r.getAttribute("data-cod"))).toBe(true);

    // ACHADO PRÉ-EXISTENTE (não introduzido aqui): a tabela desta rota é
    // `mode="top-by-eleitorado"`, que filtra `eleitorado != null` — e
    // `EdgeUfMunicipio` não tem esse campo. Por isso ela renderiza zero
    // linhas, e nesta rota (só nesta) não há botão de município. Quando o
    // orchestrator publicar `eleitorado`, os botões aparecem sem mais
    // nenhuma mudança de código; o teste (o) da rota presidencial cobre o
    // caminho de teclado enquanto isso.
    expect(doc.querySelector('[data-testid="municipios-top-table"] tbody tr')).toBeNull();

    // O sheet começa fechado — abrir é interação, coberta em e2e.
    expect(doc.querySelector('[data-testid="sheet"]')).toBeNull();
  });

  it("(q) nenhum <Panel> fica vazio (filete órfão)", async () => {
    const doc = await renderGov();
    const panels = [...doc.querySelectorAll('[data-testid="panel"]')];
    expect(panels.length).toBeGreaterThanOrEqual(6);
    for (const p of panels) {
      expect((p.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
  });

  it("(r) mesorregiões, waffle, maiores municípios, agulha e séries seguem na página", async () => {
    const texto = (await renderGov()).body.textContent ?? "";
    expect(texto).toContain("Apuração por mesorregião");
    expect(texto).toContain("Cada quadrado é um município");
    expect(texto).toContain("Maiores municípios por eleitorado");
    expect(texto).toContain("Forecast ao vivo — Governador SP");
    expect(texto).toContain("Margem ao longo do tempo");
    expect(texto).toContain("O que está movendo o forecast");
  });
});

// ---------------------------------------------------------------------------
// ADR-0032 — degradação por seção também nesta rota.
//
// A rota de governador tem estrutura própria (waffle + tabela top-15 num
// `<Panel>` que ANTES sumia quando não havia município). Depois do ADR-0032 a
// fonte desse bloco é o Blob, que falha independentemente do resumo — sumir
// diria "não existe" onde a verdade é "não chegou".
// ---------------------------------------------------------------------------
describe("UFGovernadorPage — degradação do detalhe municipal (ADR-0032)", () => {
  async function renderComDetalhe(detalhe: UfDetailResult): Promise<Document> {
    readUfProjectionMock.mockResolvedValueOnce(
      buildUfPayload({ municipios: 0, withMesorregioes: true }),
    );
    readUfDetailMock.mockResolvedValueOnce(detalhe);
    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
  }

  it("(s) Blob 404: o painel de municípios continua no DOM, com motivo explícito", async () => {
    const doc = await renderComDetalhe({
      status: "unavailable",
      reason: "not_found",
      url: "https://exemplo.test/municipios/uf/SP/gov/t1.json",
    });

    const painelMunicipios = doc.querySelector("#waffle-heading");
    expect(painelMunicipios).not.toBeNull();
    const estados = [...doc.querySelectorAll('[data-testid="detail-unavailable"]')];
    expect(estados.map((e) => e.getAttribute("data-reason"))).toContain("not_found");
    expect(doc.body.textContent).toContain("O detalhe por município está indisponível");

    // Resumo e mesorregiões vêm da OUTRA fonte e seguem inteiros.
    expect(doc.querySelectorAll('[data-testid="candidate-result-row"]').length).toBeGreaterThan(0);
    expect(doc.querySelector('[data-testid="mesorregioes-table"]')).not.toBeNull();
  });

  it("(t) com detalhe, o waffle volta e a idade própria do Blob é exibida", async () => {
    const doc = await renderComDetalhe({
      status: "ok",
      url: "https://exemplo.test/municipios/uf/SP/gov/t1.json",
      detail: buildUfDetail(12),
    });

    expect(doc.querySelector('[data-testid="detail-unavailable"]')).toBeNull();
    expect(doc.querySelector('[data-testid="detail-freshness"]')).not.toBeNull();
    expect(doc.querySelectorAll('[data-testid="waffle-svg"] rect')).toHaveLength(12);
  });
});
