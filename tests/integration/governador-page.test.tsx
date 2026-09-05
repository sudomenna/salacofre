// @vitest-environment happy-dom
/**
 * tests/integration/governador-page.test.tsx
 *
 * Smoke da `/governador` (spec 006 — grid nacional governadores).
 *
 * Estratégia
 *   - `readProjection({cargo:"gov"})` retorna `null` sem `EDGE_CONFIG` (dev/test)
 *     → page cai pro `emptyPayload()` graceful. Cobre estrutura mesmo sem dados.
 *   - Para validar grid populado, injetamos um payload via mock do reader.
 *
 * Cobertura
 *   - RFs 021/022/025/029 + RF-006.1 (RaceStatsCards) + RF-006.2 (filtros).
 *   - Estrutura: Tabs, HexCartogram, GovernorCard, Footer.
 *
 * Estes smokes NÃO testam a regressão `useRouter` SSR do mapa nacional
 * (que afeta `home-page.test.tsx`) — `/governador` não monta o mapa
 * MapLibre, só o hex cartogram (SVG inline).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import GovernadorGridPage from "@/app/governador/page";
import type { EdgePayload, EdgeUfRow } from "@/lib/edge-config/types";

// Helper pra construir um payload de governador com bucket diverso.
function buildPayload(buckets: Array<EdgeUfRow["bucket"]>, comParticipacao = true): EdgePayload {
  const candidatos = [
    {
      id: 1,
      nome: "Tarcísio",
      partido: "REP",
      cor: "var(--color-cand-1)",
      votos_atuais: 0,
      votos_projetados: 0,
      pct_atual: 0,
      pct_projetado: 52,
      pct_projetado_lower: 50,
      pct_projetado_upper: 54,
      p_vitoria: 0.7,
      rank: 1,
      p_passa_2t: 1,
      p_fecha_1t: 0.4,
    },
    {
      id: 2,
      nome: "Boulos",
      partido: "PSOL",
      cor: "var(--color-cand-2)",
      votos_atuais: 0,
      votos_projetados: 0,
      pct_atual: 0,
      pct_projetado: 38,
      pct_projetado_lower: 36,
      pct_projetado_upper: 40,
      p_vitoria: 0.3,
      rank: 2,
      p_passa_2t: 1,
      p_fecha_1t: 0.0,
    },
  ];
  const SIGLAS = [
    "AC",
    "AL",
    "AM",
    "AP",
    "BA",
    "CE",
    "DF",
    "ES",
    "GO",
    "MA",
    "MG",
    "MS",
    "MT",
    "PA",
    "PB",
    "PE",
    "PI",
    "PR",
    "RJ",
    "RN",
    "RO",
    "RR",
    "RS",
    "SC",
    "SE",
    "SP",
    "TO",
  ];
  const por_uf: EdgeUfRow[] = SIGLAS.map((sigla, i) => ({
    sigla,
    pct_apurado: 50,
    lider: 1,
    margem_atual: 14,
    margem_projetada: 14,
    margem_projetada_ci: [10, 18] as [number, number],
    chamada: buckets[i % buckets.length] === "chamada",
    swing_vs_2022: 0,
    top_candidatos: [
      { id: 1, pct: 52 },
      { id: 2, pct: 38 },
    ],
    vai_a_2t: null,
    bucket: buckets[i % buckets.length] ?? "indefinido",
  }));
  const payload: EdgePayload = {
    ts: "2026-10-04T17:30:00-03:00",
    cargo: 3,
    turno: 1,
    pct_apurado_total: 50,
    ufs_apuradas: 27,
    national: {
      candidatos,
      needle_position: 0.4,
      needle_band: "lean_a",
      candidato_a_id: 1,
      candidato_b_id: 2,
      p_segundo_turno_overall: 0.3,
      cenarios_2t: [],
      chamadas_recentes: [
        { ts: "2026-10-04T17:25:00-03:00", texto: "SP chamada para Tarcísio (REP)." },
      ],
    },
    por_uf,
    insights: [],
    composition: { pre_election: 0.4, model: 0.3, actual_results: 0.3 },
  };
  if (comParticipacao) {
    payload.national.participacao = {
      abstencao: {
        pct_atual: 21.6,
        pct_projetado: 22.4,
        lower: 20.9,
        upper: 23.9,
        base: "eleitores_instalados",
      },
      brancos_nulos: {
        pct_atual: 7.8,
        pct_projetado: 8.1,
        lower: 7.3,
        upper: 9.0,
        base: "comparecimento",
      },
    };
  }
  return payload;
}

/** Alternado por teste — permite exercitar o payload sem `participacao`. */
let comParticipacao = true;

vi.mock("@/lib/edge-config/reader", () => ({
  readProjection: vi.fn(async (opts?: { cargo?: string }) => {
    if (opts?.cargo === "gov") {
      // 9 decidido_1t, 14 vai_2t, 4 indefinido como pedido no smoke mental.
      const buckets: Array<EdgeUfRow["bucket"]> = [];
      for (let i = 0; i < 9; i++) buckets.push("decidido_1t");
      for (let i = 0; i < 14; i++) buckets.push("vai_2t");
      for (let i = 0; i < 4; i++) buckets.push("indefinido");
      return buildPayload(buckets, comParticipacao);
    }
    return null;
  }),
  readNationalProjection: vi.fn(async () => null),
  readUfProjection: vi.fn(async () => null),
  readArchivedProjection: vi.fn(async () => null),
}));

describe("GovernadorGridPage (integration / smoke)", () => {
  beforeEach(() => {
    comParticipacao = true;
  });

  it("(a) renderiza header 'Governadores 2026'", async () => {
    const node = await GovernadorGridPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Governadores 2026");
  });

  it("(b) renderiza tabs com Senado/Congresso/Assembleias desabilitados", async () => {
    const node = await GovernadorGridPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Presidente");
    expect(html).toContain("Senado");
    expect(html).toContain("Congresso");
    expect(html).toContain("Assembleias");
    // disabled → aria-disabled na tab + tooltip "Disponível em breve"
    expect(html).toMatch(/aria-disabled="true"/);
    expect(html).toContain("Disponível em breve");
  });

  it("(c) RaceStatsCards com counts batendo (9/14/4)", async () => {
    const node = await GovernadorGridPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(node);
    // 3 cards visíveis: Eleitos, 2T, Em apuração
    expect(html).toContain("Eleitos no 1º turno");
    expect(html).toContain("Em 2º turno");
    expect(html).toContain("Em apuração");
    expect(html).toMatch(/data-testid="stat-eleitos"[\s\S]*?>9</);
    expect(html).toMatch(/data-testid="stat-2t"[\s\S]*?>14</);
    expect(html).toMatch(/data-testid="stat-em-apuracao"[\s\S]*?>4</);
  });

  it("(d) renderiza HexCartogramBrasil (SVG inline com label SP)", async () => {
    const node = await GovernadorGridPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Mapa hexagonal");
    // SVG inline tem text com sigla
    expect(html).toContain(">SP<");
    expect(html).toContain(">MG<");
  });

  it("(e) renderiza 27 GovernorCards (1 por UF)", async () => {
    const node = await GovernadorGridPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(node);
    // Cada GovernorCard tem aria-label começando com nome da UF; conta SP/MG/RJ
    expect(html).toContain("São Paulo");
    expect(html).toContain("Minas Gerais");
    expect(html).toContain("Rio de Janeiro");
    // Líder Tarcísio aparece nos cards
    const matches = html.match(/Tarcísio/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(27);
  });

  it("(f) renderiza filtros e BreakingNewsTicker", async () => {
    const node = await GovernadorGridPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Em disputa");
    expect(html).toContain("Decididos no 1º turno");
    expect(html).toContain("Vão a 2º turno");
    expect(html).toContain("Chamadas");
    // Ticker emite chamada de SP via mock
    expect(html).toContain("SP chamada para Tarcísio");
  });

  it("(g) filtro decididos_1t restringe lista para 9 UFs", async () => {
    const node = await GovernadorGridPage({
      searchParams: Promise.resolve({ status: "decididos_1t" }),
    });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("9 corridas");
  });

  it("(h) renderiza Footer constitucional § 1", async () => {
    const node = await GovernadorGridPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Não oficial");
    expect(html).toContain("TSE");
  });

  // -------------------------------------------------------------------------
  // S07/Fase 2 — ADR-0018 (participação) + ADR-0019 (trilha gov).
  // -------------------------------------------------------------------------

  it("(i) trilha governador: main[data-trilha=gov] + kicker 'GOVERNADOR · Brasil (27 UFs)'", async () => {
    const node = await GovernadorGridPage({ searchParams: Promise.resolve({}) });
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");

    expect(doc.querySelector("main")?.getAttribute("data-trilha")).toBe("gov");
    expect(
      doc.querySelector("[data-trilha-kicker]")?.textContent?.replace(/\s+/g, " ").trim(),
    ).toBe("GOVERNADOR · Brasil (27 UFs)");
  });

  it("(j) com `participacao` renderiza só os dois termômetros de participação, acima dos stats", async () => {
    const node = await GovernadorGridPage({ searchParams: Promise.resolve({}) });
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");

    const bloco = doc.querySelector('section[aria-labelledby="projecao-termometros-heading"]');
    expect(bloco).not.toBeNull();
    expect(bloco?.getAttribute("data-variant")).toBe("participacao-only");
    expect(bloco?.querySelectorAll('[role="meter"]')).toHaveLength(2);
    expect(doc.querySelector("#termometro-brancos-nulos")).not.toBeNull();
    expect(doc.querySelector("#termometro-abstencao")).not.toBeNull();
    // Sem "top 3 nacional" de governador — não existe abrangência Brasil.
    expect(doc.querySelector('[id^="termometro-cand-"]')).toBeNull();
    expect(doc.querySelector("#termometro-outros")).toBeNull();

    const stats = doc.querySelector('[data-testid="stat-eleitos"]');
    expect(
      bloco && stats && bloco.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("(k) sem `participacao` no payload o bloco inteiro fica fora (grid intocado)", async () => {
    comParticipacao = false;
    const node = await GovernadorGridPage({ searchParams: Promise.resolve({}) });
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");

    expect(doc.querySelector('[id^="termometro-"]')).toBeNull();
    // Cartograma e cards seguem lá.
    expect(doc.body.textContent).toContain("Mapa hexagonal");
    expect(doc.body.textContent).toContain("São Paulo");
  });
});
