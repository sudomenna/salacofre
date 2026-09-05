// @vitest-environment happy-dom
/**
 * tests/integration/uf-governador-page.test.tsx
 *
 * Smoke da `/uf/[sigla]/governador` (spec 005 — drill-down UF Gov).
 *
 * Estratégia
 *   - Mocka `readUfProjection({cargo:"gov"})` retornando payload populado
 *     com municípios, mesorregiões opcional, e (em um caso) tier 2 K-1.
 *   - Renderiza via `renderToStaticMarkup`. Mapas via dynamic import com
 *     ssr:false expandem para placeholder em SSR.
 *
 * Cobertura
 *   - RFs 031..044 (espelho da spec 004 com cargo gov).
 *   - MunicipioWaffleGrid (Print 3), mesorregioes condicional, MunicipioTable
 *     top-by-eleitorado, K-1 disclaimer.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import UFGovernadorPage from "@/app/uf/[sigla]/governador/page";
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
  const municipios = Array.from({ length: opts.municipios }, (_, i) => makeMunicipio(i));
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
    municipios,
    series_temporais: { margem: [], p_vitoria: [], turnout: [] },
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

describe("UFGovernadorPage (integration / smoke)", () => {
  it("(a) renderiza header e breadcrumb 'Governadores › SP' apontando pra /governador", async () => {
    readUfProjectionMock.mockResolvedValueOnce(
      buildUfPayload({ municipios: 20, withMesorregioes: false }),
    );
    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");

    expect(doc.body.textContent).toContain("Governador SP — Apuração 2026");
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
    readUfProjectionMock.mockResolvedValueOnce(
      buildUfPayload({ municipios: 25, withMesorregioes: false }),
    );
    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Cada quadrado é um município");
    expect(html).toContain('data-testid="waffle-svg"');
    expect(html).toContain('data-testid="waffle-legend"');
    // Tarcísio aparece na legend (líder de municípios pares)
    expect(html).toMatch(/Tarcísio[\s\S]*?mun\./);
  });

  it("(c) bloco mesorregião renderiza quando populado", async () => {
    readUfProjectionMock.mockResolvedValueOnce(
      buildUfPayload({ municipios: 20, withMesorregioes: true }),
    );
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
    readUfProjectionMock.mockResolvedValueOnce(
      buildUfPayload({ municipios: 20, withMesorregioes: false }),
    );
    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    const html = renderToStaticMarkup(node);
    expect(html).not.toContain("Apuração por mesorregião");
  });

  it("(e) MunicipioTable mode='top-by-eleitorado' renderiza (header)", async () => {
    readUfProjectionMock.mockResolvedValueOnce(
      buildUfPayload({ municipios: 20, withMesorregioes: false }),
    );
    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    const html = renderToStaticMarkup(node);
    // O modo top-by-eleitorado renderiza o header customizado; sem eleitorado
    // populado, a lista filtra todos e fica 0 — mas o título aparece.
    expect(html).toContain("Maiores municípios por eleitorado");
  });

  it("(f) K-1 disclaimer aparece quando model_fallback_tier >= 2", async () => {
    readUfProjectionMock.mockResolvedValueOnce(
      buildUfPayload({ municipios: 10, withMesorregioes: false, modelTier: 2 }),
    );
    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Modelagem com prior limitado");
    expect(html).toContain("pesquisa pré-eleitoral");
  });

  it("(g) K-1 disclaimer tier 3 mostra texto 'sem mapeamento histórico'", async () => {
    readUfProjectionMock.mockResolvedValueOnce(
      buildUfPayload({ municipios: 10, withMesorregioes: false, modelTier: 3 }),
    );
    const node = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("sem mapeamento histórico");
  });

  // -------------------------------------------------------------------------
  // S07/Fase 2 — ADR-0018 (hero 1T) + ADR-0019 (trilha gov).
  // -------------------------------------------------------------------------

  it("(i) 1T com mais de dois candidatos → seis termômetros", async () => {
    readUfProjectionMock.mockResolvedValueOnce(
      buildUfPayload({
        municipios: 10,
        withMesorregioes: false,
        multiCandidato: true,
        comParticipacao: true,
      }),
    );
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
    readUfProjectionMock.mockResolvedValueOnce(
      buildUfPayload({ municipios: 10, withMesorregioes: false }),
    );
    const duelo = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    expect(renderToStaticMarkup(duelo)).not.toContain('id="termometro-');

    readUfProjectionMock.mockResolvedValueOnce(
      buildUfPayload({
        municipios: 10,
        withMesorregioes: false,
        multiCandidato: true,
        turno: 2,
      }),
    );
    const segundoTurno = await UFGovernadorPage({ params: Promise.resolve({ sigla: "SP" }) });
    const html = renderToStaticMarkup(segundoTurno);
    expect(html).not.toContain('id="termometro-');
    // Layout de 2T preservado: agulha estadual continua lá.
    expect(html).toContain("Forecast ao vivo — Governador SP");
  });

  it("(k) trilha gov: main[data-trilha=gov] + kicker 'GOVERNADOR · SP'", async () => {
    readUfProjectionMock.mockResolvedValueOnce(
      buildUfPayload({ municipios: 10, withMesorregioes: false }),
    );
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
