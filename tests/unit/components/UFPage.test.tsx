// @vitest-environment happy-dom
/**
 * Smoke tests da página de UF presidencial.
 *
 * Duas camadas:
 *   1. Composição dos blocos (histórico) — garante que o wireframe monta.
 *   2. SSR do `app/uf/[sigla]/page.tsx` com o reader mockado (S07/Fase 2) —
 *      cobre o dispatch `binary` | `multi-1t`, o hero de termômetros
 *      (ADR-0018) e a identidade da trilha presidencial (ADR-0019).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import UFPage from "@/app/uf/[sigla]/page";

import { NewsClippingPlaceholder } from "@/components/atoms/banners/NewsClippingPlaceholder";
import { WinnerBanner } from "@/components/atoms/banners/WinnerBanner";
import { Needle } from "@/components/atoms/needle/Needle";
import { CandidateRow } from "@/components/atoms/tables/CandidateRow";
import { ForecastTransparency } from "@/components/blocks/ForecastTransparency";
import { InsightCard } from "@/components/blocks/InsightCard";
import { MunicipioTable } from "@/components/blocks/MunicipioTable";
import { Footer } from "@/components/layout/Footer";
import type { EdgePayloadUf, EdgeUfCandidate } from "@/lib/edge-config/types";

const readUfProjectionMock = vi.fn();
vi.mock("@/lib/edge-config/reader", () => ({
  readProjection: vi.fn(async () => null),
  readNationalProjection: vi.fn(async () => null),
  readArchivedProjection: vi.fn(async () => null),
  readUfProjection: (sigla: string, opts?: { cargo?: string }) => readUfProjectionMock(sigla, opts),
}));

function makeCand(id: number, nome: string, pct: number): EdgeUfCandidate {
  return {
    id,
    nome,
    partido: `P${id}`,
    cor: `var(--color-cand-${id})`,
    votos_atuais: pct * 1000,
    votos_projetados: pct * 2000,
    pct_atual: pct - 1,
    pct_projetado: pct,
    ci95: { lower: pct - 2, upper: pct + 2 },
  };
}

/** Payload de UF; `turno` + nº de candidatos definem o modo da página. */
function buildUfPayload(opts: {
  turno: 1 | 2;
  candidatos: EdgeUfCandidate[];
  comParticipacao?: boolean;
}): EdgePayloadUf {
  const payload: EdgePayloadUf = {
    uf: "SP",
    ts: "2026-10-04T18:00:00-03:00",
    cargo: 1,
    turno: opts.turno,
    pct_apurado: 42,
    candidatos: opts.candidatos,
    needle_position: 0.3,
    needle_band: "lean_a",
    municipios: [],
    series_temporais: { margem: [], p_vitoria: [], turnout: [] },
  };
  if (opts.comParticipacao) {
    payload.participacao = {
      abstencao: {
        pct_atual: 19.5,
        pct_projetado: 20.8,
        lower: 19.4,
        upper: 22.2,
        base: "eleitores_instalados",
      },
      brancos_nulos: {
        pct_atual: 6.2,
        pct_projetado: 6.6,
        lower: 5.9,
        upper: 7.4,
        base: "comparecimento",
      },
      outros: {
        pct_atual: 7.1,
        pct_projetado: 7.4,
        lower: 6.5,
        upper: 8.4,
        base: "votaveis",
        n_candidatos: 5,
      },
    };
  }
  return payload;
}

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("UF page composition (smoke)", () => {
  it("renderiza conjunto típico sem erro", () => {
    const node = (
      <main>
        <WinnerBanner candidato="Lula" partido="PT" ufSigla="SP" cor="var(--color-pt)" />
        <CandidateRow nome="Lula" partido="PT" cor="var(--color-pt)" votos={null} pct={54.1} />
        <CandidateRow nome="Bolsonaro" partido="PL" cor="var(--color-pl)" votos={null} pct={45.9} />
        <Needle
          needlePosition={0.5}
          pVitoria={0.78}
          candidatoA="Lula"
          candidatoB="Bolsonaro"
          variant="uf"
        />
        <MunicipioTable rows={[]} />
        <InsightCard
          frases={["Lula supera 2022 em SP por 2,1pp.", "Ganho expressivo em capitais."]}
          variant="uf"
        />
        <ForecastTransparency pctApurado={23.4} variant="uf" />
        <NewsClippingPlaceholder />
        <Footer />
      </main>
    );
    const doc = parse(node);
    expect(doc.body.textContent).toContain("Lula");
    expect(doc.body.textContent).toContain("Bolsonaro");
    expect(doc.body.textContent).toContain("Forecast estadual");
    expect(doc.body.textContent).toContain("Não oficial");
    expect(doc.body.textContent).toContain("Repercussão na imprensa");
  });
});

describe("UFPage SSR (S07/Fase 2 — ADR-0018 + ADR-0019)", () => {
  const oitoCandidatos = [
    makeCand(1, "Candidato A", 41),
    makeCand(2, "Candidato B", 33),
    makeCand(3, "Candidato C", 9),
    makeCand(4, "Candidato D", 5),
    makeCand(5, "Candidato E", 3),
  ];

  it("(a) 1T multi-candidato → seis termômetros acima da lista de candidatos", async () => {
    readUfProjectionMock.mockResolvedValueOnce(
      buildUfPayload({ turno: 1, candidatos: oitoCandidatos, comParticipacao: true }),
    );
    const node = await UFPage({ params: Promise.resolve({ sigla: "SP" }) });
    const doc = parse(node);

    const bloco = doc.querySelector('section[aria-labelledby="projecao-termometros-heading"]');
    expect(bloco).not.toBeNull();
    expect(bloco?.querySelectorAll('[role="meter"]')).toHaveLength(6);
    expect(doc.body.textContent).toContain("Projeção do 1º turno em SP");

    // Ordem: o hero vem antes da seção "Candidatos" (lista de CandidateRow).
    const heading = doc.querySelector("#candidates-heading");
    expect(
      bloco && heading && bloco.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("(b) IC dos termômetros vem de `ci95` (payload de UF)", async () => {
    readUfProjectionMock.mockResolvedValueOnce(
      buildUfPayload({ turno: 1, candidatos: oitoCandidatos, comParticipacao: true }),
    );
    const node = await UFPage({ params: Promise.resolve({ sigla: "SP" }) });
    const doc = parse(node);
    const meter = doc.querySelector('#termometro-cand-1 [role="meter"]');
    // ci95 do líder: 39–43 com projeção 41.
    expect(meter?.getAttribute("aria-label")).toContain("39,0% a 43,0%");
    expect(meter?.getAttribute("aria-valuenow")).toBe("41");
  });

  it("(c) 2º turno (duelo) → sem termômetros, agulha estadual preservada", async () => {
    readUfProjectionMock.mockResolvedValueOnce(
      buildUfPayload({ turno: 2, candidatos: oitoCandidatos.slice(0, 2) }),
    );
    const node = await UFPage({ params: Promise.resolve({ sigla: "SP" }) });
    const doc = parse(node);

    expect(doc.querySelector('[id^="termometro-"]')).toBeNull();
    expect(doc.body.textContent).toContain("Forecast ao vivo de SP");
    expect(doc.body.textContent).toContain("Margem estimada");
  });

  // O kicker carrega só o rótulo da trilha; a profundidade da navegação é do
  // breadcrumb, que tem links reais. Antes os dois repetiam "Brasil › SP"
  // (achado 2 do a11y-perf-auditor, 2026-09-05) e este teste fixava a
  // duplicação como esperada.
  it("(d) trilha presidencial: main[data-trilha=pres], kicker sem crumbs, breadcrumb Brasil › SP", async () => {
    readUfProjectionMock.mockResolvedValueOnce(
      buildUfPayload({ turno: 1, candidatos: oitoCandidatos, comParticipacao: true }),
    );
    const node = await UFPage({ params: Promise.resolve({ sigla: "SP" }) });
    const doc = parse(node);

    expect(doc.querySelector("main")?.getAttribute("data-trilha")).toBe("pres");
    expect(
      doc.querySelector("[data-trilha-kicker]")?.textContent?.replace(/\s+/g, " ").trim(),
    ).toBe("PRESIDÊNCIA");

    const crumbs = [...doc.querySelectorAll('nav[aria-label="Breadcrumb"] li')].map((li) =>
      li.textContent?.replace(/[\s›]+/g, " ").trim(),
    );
    expect(crumbs).toEqual(["Brasil", "SP"]);
    expect(doc.querySelector('nav[aria-label="Breadcrumb"] a')?.getAttribute("href")).toBe("/");
  });

  it("(e) sem `participacao` os termômetros de participação ficam no DOM, 'aguardando' (ADR-0017)", async () => {
    readUfProjectionMock.mockResolvedValueOnce(
      buildUfPayload({ turno: 1, candidatos: oitoCandidatos, comParticipacao: false }),
    );
    const node = await UFPage({ params: Promise.resolve({ sigla: "SP" }) });
    const doc = parse(node);

    expect(doc.querySelector("#termometro-brancos-nulos")?.getAttribute("data-estado")).toBe(
      "aguardando",
    );
    expect(doc.querySelector("#termometro-abstencao")?.getAttribute("data-estado")).toBe(
      "aguardando",
    );
    // "Outros" cai no resto aritmético, com nota de IC indisponível.
    expect(doc.querySelector("#termometro-outros")?.textContent).toContain("IC indisponível");
  });
});

// ---------------------------------------------------------------------------
// S07/Bloco 2 (ADR-0029) — "mapa primeiro" na rota de UF presidencial.
//
// O conteúdo não mudou; a ORDEM e o invólucro mudaram. Estes testes fixam a
// nova ordem e as duas invariantes estruturais da página (`Footer` dentro do
// `<main data-trilha>`; exatamente um `<h1>`).
// ---------------------------------------------------------------------------
describe("UFPage — recomposição S07/Bloco 2 (ADR-0029)", () => {
  const candidatos = [
    makeCand(1, "Candidato A", 41),
    makeCand(2, "Candidato B", 33),
    makeCand(3, "Candidato C", 9),
  ];

  async function renderUF(): Promise<Document> {
    readUfProjectionMock.mockResolvedValueOnce(
      buildUfPayload({ turno: 1, candidatos, comParticipacao: true }),
    );
    return parse(await UFPage({ params: Promise.resolve({ sigla: "SP" }) }));
  }

  it("(f) o <Footer> continua DENTRO do <main data-trilha> desta página", async () => {
    const doc = await renderUF();
    const main = doc.querySelector("main[data-trilha]");
    expect(main).not.toBeNull();
    // O shell global (app/layout.tsx) não fornece nenhum dos dois.
    const footer = main?.querySelector("footer");
    expect(footer).not.toBeNull();
    expect(footer?.textContent).toContain("Não oficial");
    expect(doc.querySelectorAll("footer")).toHaveLength(1);
  });

  it("(g) exatamente um <h1>, dentro do painel de resultado, alternando parcial/projeção", async () => {
    const doc = await renderUF();
    const h1s = doc.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.getAttribute("id")).toBe("resultado-heading");
    expect(h1s[0]?.textContent).toContain("SP — Resultado parcial");
    expect(h1s[0]?.textContent).toContain("SP — Projeção Atlas Menna");
    // O `<TrilhaKicker>` fica imediatamente acima do `<h1>` (ADR-0019).
    const kicker = doc.querySelector("[data-trilha-kicker]");
    const h1 = h1s[0];
    expect(
      kicker && h1 && kicker.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("(h) o mapa é o primeiro conteúdo, antes do painel de resultado", async () => {
    const doc = await renderUF();
    const mapa = doc.querySelector('section[aria-labelledby="leader-map-heading"]');
    const painel = doc.querySelector("#resultado-heading");
    expect(mapa).not.toBeNull();
    expect(painel).not.toBeNull();
    expect(
      mapa && painel && mapa.compareDocumentPosition(painel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("(i) as linhas de candidato trazem parcial e projeção lado a lado (ADR-0029 § 7)", async () => {
    const doc = await renderUF();
    const linhas = doc.querySelectorAll('[data-testid="candidate-result-row"]');
    expect(linhas).toHaveLength(candidatos.length);
    // Nenhuma linha sai do DOM (ADR-0017): as duas bases sempre visíveis.
    expect(linhas[0]?.querySelector('[data-view-cell="parcial"]')).not.toBeNull();
    expect(linhas[0]?.querySelector('[data-view-cell="proj"]')).not.toBeNull();
    // `pct_atual` do fixture é `pct - 1`; `pct_projetado` é `pct`.
    expect(linhas[0]?.querySelector('[data-view-cell="parcial"]')?.textContent).toContain("40,0%");
    expect(linhas[0]?.querySelector('[data-view-cell="proj"]')?.textContent).toContain("41,0%");
  });

  it("(j) o kicker da 1ª seção de dado carrega o rótulo 'não oficial' (constituição § 1)", async () => {
    const doc = await renderUF();
    const kickers = [...doc.querySelectorAll('[data-testid="panel-kicker"]')].map(
      (k) => k.textContent,
    );
    expect(kickers).toContain("Projeção Atlas Menna · não oficial");
  });

  it("(k) nenhum <Panel> fica vazio (filete órfão)", async () => {
    const doc = await renderUF();
    const panels = [...doc.querySelectorAll('[data-testid="panel"]')];
    expect(panels.length).toBeGreaterThanOrEqual(6);
    for (const p of panels) {
      expect((p.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
  });

  it("(l) `<ChancesPanel>` consome a probabilidade do líder — o átomo tem consumidor", async () => {
    const doc = await renderUF();
    const painel = doc.querySelector('[data-testid="chances-panel-meters"]');
    expect(painel).not.toBeNull();
    const meter = painel?.querySelector('[role="meter"]');
    // `needle_position` do fixture é 0.3 → p do líder = 0.65.
    expect(meter?.getAttribute("aria-valuenow")).toBe("65");
    expect(meter?.getAttribute("aria-label")).toBe("Candidato A vence em SP");
  });
});

// ---------------------------------------------------------------------------
// S07/Bloco 2 — a folha do município na rota presidencial.
//
// `renderToStaticMarkup` não executa eventos, então o que se pode fixar aqui é
// o CONTRATO: o botão existe, tem alvo de toque de 44px e carrega o
// `cod_ibge` que o handler devolve. A abertura em si é interação de browser.
// ---------------------------------------------------------------------------
describe("UFPage — folha do município (S07/Bloco 2)", () => {
  function makeMunicipio(i: number) {
    return {
      cod_ibge: `35${String(i).padStart(5, "0")}`,
      nome: `Município ${i + 1}`,
      pct_apurado: 60 + i,
      lider: { candidato_id: 1, partido: "P1", votos: 1000 + i, margem_pp: 5 },
      votos_reportados: { 1: 1000 + i, 2: 800 },
    };
  }

  async function renderComMunicipios(): Promise<Document> {
    const payload = buildUfPayload({
      turno: 1,
      candidatos: [makeCand(1, "Candidato A", 41), makeCand(2, "Candidato B", 33)],
      comParticipacao: true,
    });
    payload.municipios = [makeMunicipio(0), makeMunicipio(1), makeMunicipio(2)];
    readUfProjectionMock.mockResolvedValueOnce(payload);
    return parse(await UFPage({ params: Promise.resolve({ sigla: "SP" }) }));
  }

  it("(m) cada município da tabela é um botão de 44px que devolve o cod_ibge", async () => {
    const doc = await renderComMunicipios();
    const botoes = [...doc.querySelectorAll('[data-testid="municipio-open"]')];
    expect(botoes.length).toBeGreaterThan(0);
    expect(botoes[0]?.tagName.toLowerCase()).toBe("button");
    expect(botoes[0]?.getAttribute("style")).toContain("min-height:var(--tap-min)");
    expect(botoes.map((b) => b.getAttribute("data-cod"))).toContain("3500000");
  });

  it("(n) o sheet começa fechado — nada de diálogo no primeiro paint", async () => {
    const doc = await renderComMunicipios();
    expect(doc.querySelector('[data-testid="sheet"]')).toBeNull();
    expect(doc.querySelector('[role="dialog"]')).toBeNull();
  });
});
