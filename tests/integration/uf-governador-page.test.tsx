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

import UFGovernadorPage from "@/app/(gov)/uf/[sigla]/governador/page";
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
    // 2026-09-09 (decisão D23): o `<UFBreadcrumb>` (RF-031) saiu — não existe
    // no protótipo do kit. A volta para a grade das 27 corridas fica com o
    // `<CargoTabs>` do shell (`app/layout.tsx`), que este teste não monta.
    expect(doc.querySelector('nav[aria-label="Breadcrumb"]')).toBeNull();
  });

  // 2026-09-08 — a grade de quadrados (`<MunicipioWaffleGrid>`) saiu desta
  // rota: não existe no protótipo do kit. O teste (b) que a exercitava foi
  // removido; a cobertura do componente segue em
  // `tests/unit/components/MunicipioWaffleGrid.test.tsx`.
  it("(b) a grade de quadrados NÃO está mais na página", async () => {
    mockUf({ municipios: 25, withMesorregioes: false });
    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    const html = renderToStaticMarkup(node);
    expect(html).not.toContain('data-testid="waffle-svg"');
    expect(html).not.toContain("Cada quadrado é um município");
  });

  // 2026-09-08 — o bloco "Apuração por mesorregião" saiu: não tem contraparte
  // no protótipo do kit. O teste (c), que fixava seu conteúdo com
  // `withMesorregioes: true`, foi removido. O que sobra é a invariante do
  // corte: nem com `mesorregioes` populado o bloco volta.
  it("(d) bloco mesorregião AUSENTE mesmo com `mesorregioes` populado", async () => {
    mockUf({ municipios: 20, withMesorregioes: true });
    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    const html = renderToStaticMarkup(node);
    expect(html).not.toContain("Apuração por mesorregião");
    expect(html).not.toContain('data-testid="mesorregioes-table"');
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

  // 2026-09-09 (decisão D23): os seis termômetros do ADR-0018 SAÍRAM desta
  // rota — na coluna de 400px do `<AppShellSplit>` eles sobrepunham os
  // próprios números. Entrou o `<ResultPanel>` do kit, o MESMO componente da
  // home. Consequência declarada e aceita: brancos, nulos e abstenção saem
  // desta tela; o bloco continua obrigatório (ADR-0022) em `/governador`, onde
  // é testado.
  it("(i) 1T com mais de dois candidatos → `<ResultPanel>`, sem termômetros", async () => {
    mockUf({
      municipios: 10,
      withMesorregioes: false,
      multiCandidato: true,
      comParticipacao: true,
    });
    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");

    expect(doc.querySelector('section[aria-labelledby="projecao-termometros-heading"]')).toBeNull();
    expect(doc.querySelectorAll('[id^="termometro-"]')).toHaveLength(0);
    expect(doc.body.textContent).not.toContain("Projeção do 1º turno — Governador SP");

    // O painel do kit: `<Figure>` "Apurado" + margem do líder, e uma linha por
    // candidato da corrida ESTADUAL.
    const figuras = [...doc.querySelectorAll('[data-testid="figure-label"]')].map(
      (f) => f.textContent,
    );
    expect(figuras).toContain("Apurado");
    expect(doc.querySelector('[data-testid="result-margem-parcial"]')).not.toBeNull();
    expect(
      doc.querySelectorAll('[data-testid="candidate-result-row"]').length,
    ).toBeGreaterThanOrEqual(3);
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
    // A agulha estadual saiu em 2026-09-08 (não está no protótipo); o que
    // resta como leitura da corrida em 2T são as linhas de candidato.
    expect(html).toContain('data-testid="candidate-result-row"');
  });

  // 2026-09-09 (D23): o `<TrilhaKicker>` (ADR-0019) saiu — não existe no
  // protótipo. Resta a identidade da trilha no `<main>`, que o CSS usa, e o
  // `<h1>` do painel, que nomeia cargo e UF.
  it("(k) trilha gov: main[data-trilha=gov], sem kicker de trilha", async () => {
    mockUf({ municipios: 10, withMesorregioes: false });
    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");

    expect(doc.querySelector("main")?.getAttribute("data-trilha")).toBe("gov");
    expect(doc.querySelector("[data-trilha-kicker]")).toBeNull();
    expect(doc.querySelector("h1")?.textContent).toContain("Governador SP");
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

  it("(m) o `<ResultPanel>` é o primeiro conteúdo — o mapa e o breadcrumb saíram desta página", async () => {
    // 2026-09-09 (map-builder): o coroplético "{sigla} · quem lidera cada
    // município" (`section[aria-labelledby="leader-map-heading"]`) MUDOU DE
    // ENDEREÇO — foi para a coluna do mapa (`<PersistentMapFrame>`,
    // ADR-0033 § 1), que não é renderizada por este teste (ele monta só
    // `<UFGovernadorPage>`, não o `layout.tsx` que hospeda a moldura).
    //
    // 2026-09-09 (D23): o `<UFBreadcrumb>` saiu, e com ele o que este teste
    // fixava como "primeiro conteúdo". O primeiro conteúdo passa a ser o
    // painel de resultado.
    const doc = await renderGov();
    expect(doc.querySelector('section[aria-labelledby="leader-map-heading"]')).toBeNull();
    expect(doc.querySelector('nav[aria-label="Breadcrumb"]')).toBeNull();
    const paineis = [...doc.querySelectorAll('[data-testid="panel"]')];
    expect(paineis[0]?.getAttribute("aria-labelledby")).toBe("resultado-heading");
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

  it("(p) sem a grade, a folha do município começa fechada e a tabela é o único caminho", async () => {
    const doc = await renderGov();

    // 2026-09-08 — a grade de quadrados saiu (não está no protótipo). Ela era
    // o caminho de PONTEIRO para abrir a folha; o caminho acessível sempre
    // foi a tabela, que permanece.
    expect(doc.querySelector('[data-testid="waffle-svg"]')).toBeNull();

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
    // Eram >= 6 até 2026-09-08 (mapa, projeção, municípios, metodologia); em
    // 2026-09-09 o `<Panel>` do mapa saiu desta página (ver teste (m)) —
    // restam projeção, municípios e metodologia.
    expect(panels.length).toBeGreaterThanOrEqual(3);
    for (const p of panels) {
      expect((p.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
  });

  // 2026-09-08 — o teste (r) fixava que mesorregiões, waffle, agulha e séries
  // seguiam na página. Todos saíram (não estão no protótipo do kit); ele agora
  // fixa o CORTE, mais o que a constituição obriga a manter.
  it("(r) sobraram maiores municípios e metodologia; mesorregiões, waffle, agulha e séries saíram", async () => {
    const texto = (await renderGov()).body.textContent ?? "";
    expect(texto).toContain("Maiores municípios por eleitorado");
    // Constituição § 8 — o bloco de transparência fica em toda página com
    // projeção, esteja ou não no protótipo.
    expect(texto).toContain("O que está movendo o forecast");

    expect(texto).not.toContain("Apuração por mesorregião");
    expect(texto).not.toContain("Cada quadrado é um município");
    expect(texto).not.toContain("Forecast ao vivo — Governador SP");
    expect(texto).not.toContain("Margem ao longo do tempo");
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

    // `#waffle-heading` virou `#municipios-heading` quando a grade saiu
    // (2026-09-08) e o painel passou a se chamar "Maiores colégios
    // eleitorais".
    const painelMunicipios = doc.querySelector("#municipios-heading");
    expect(painelMunicipios).not.toBeNull();
    const estados = [...doc.querySelectorAll('[data-testid="detail-unavailable"]')];
    expect(estados.map((e) => e.getAttribute("data-reason"))).toContain("not_found");
    expect(doc.body.textContent).toContain("O detalhe por município está indisponível");

    // O resumo vem da OUTRA fonte e segue inteiro. (A tabela de mesorregiões
    // que este teste também checava saiu da página em 2026-09-08.)
    expect(doc.querySelectorAll('[data-testid="candidate-result-row"]').length).toBeGreaterThan(0);
  });

  it("(t) com detalhe, some o estado de falha e a idade própria do Blob é exibida", async () => {
    const doc = await renderComDetalhe({
      status: "ok",
      url: "https://exemplo.test/municipios/uf/SP/gov/t1.json",
      detail: buildUfDetail(12),
    });

    expect(doc.querySelector('[data-testid="detail-unavailable"]')).toBeNull();
    expect(doc.querySelector('[data-testid="detail-freshness"]')).not.toBeNull();
    // A asserção sobre os 12 `<rect>` do waffle saiu com a grade (2026-09-08).
    expect(doc.querySelector('[data-testid="waffle-svg"]')).toBeNull();
  });
});
