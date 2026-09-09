// @vitest-environment happy-dom
/**
 * Smoke tests da página de UF presidencial.
 *
 * Duas camadas:
 *   1. Composição dos blocos (histórico) — garante que o wireframe monta.
 *   2. SSR do `app/(pres)/uf/[sigla]/page.tsx` com o reader mockado.
 *
 * 2026-09-09 (decisão D23): a camada 2 mudou de objeto. O hero desta rota
 * deixou de ser o dispatch `binary` | `multi-1t` com os seis termômetros do
 * ADR-0018 e passou a ser o `<ResultPanel>` do kit — o MESMO componente da
 * home. Os testes que fixavam os termômetros, o `<TrilhaKicker>` (ADR-0019) e
 * o `<UFBreadcrumb>` (RF-031) passaram a fixar a AUSÊNCIA deles e a presença
 * do painel; a cobertura própria de cada componente segue nos seus arquivos.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import UFPage from "@/app/(pres)/uf/[sigla]/page";

import { NewsClippingPlaceholder } from "@/components/atoms/banners/NewsClippingPlaceholder";
import { WinnerBanner } from "@/components/atoms/banners/WinnerBanner";
import { Needle } from "@/components/atoms/needle/Needle";
import { CandidateRow } from "@/components/atoms/tables/CandidateRow";
import { ForecastTransparency } from "@/components/blocks/ForecastTransparency";
import { InsightCard } from "@/components/blocks/InsightCard";
import { MunicipioTable } from "@/components/blocks/MunicipioTable";
import { Footer } from "@/components/layout/Footer";
import type { UfDetailResult } from "@/lib/blob/uf-detail";
import type { EdgePayloadUf, EdgeUfCandidate } from "@/lib/edge-config/types";

const readUfProjectionMock = vi.fn();
vi.mock("@/lib/edge-config/reader", () => ({
  readProjection: vi.fn(async () => null),
  readNationalProjection: vi.fn(async () => null),
  readArchivedProjection: vi.fn(async () => null),
  readUfProjection: (sigla: string, opts?: { cargo?: string }) => readUfProjectionMock(sigla, opts),
}));

/**
 * Segundo read path (ADR-0032): o detalhe municipal e as séries vêm do Vercel
 * Blob, em paralelo com o resumo. Só `readUfDetail` é mockado — os acessores
 * `municipiosFrom`/`seriesFrom` seguem reais.
 *
 * Default `unavailable`: sem detalhe explícito, a página deve cair no estado
 * "detalhe indisponível" — que é o comportamento a fixar, não um efeito
 * colateral do mock.
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

  // 2026-09-09 (decisão D23): os seis termômetros do ADR-0018 SAÍRAM desta
  // rota — na coluna de 400px do `<AppShellSplit>` eles sobrepunham os
  // próprios números. O hero passou a ser o `<ResultPanel>` do kit, o MESMO
  // componente da home. O que (a) e (b) fixavam sobre os termômetros passa a
  // ser fixado sobre o painel que os substituiu; a cobertura do componente em
  // si segue em `tests/unit/components/ProjectionThermometers.test.tsx`.
  it("(a) 1T multi-candidato → `<ResultPanel>` no lugar dos seis termômetros", async () => {
    readUfProjectionMock.mockResolvedValueOnce(
      buildUfPayload({ turno: 1, candidatos: oitoCandidatos, comParticipacao: true }),
    );
    const node = await UFPage({ params: Promise.resolve({ sigla: "SP" }) });
    const doc = parse(node);

    expect(doc.querySelector('section[aria-labelledby="projecao-termometros-heading"]')).toBeNull();
    // Nenhum termômetro. (Os `role="meter"` que sobram na página são as três
    // barras de composição do `<ForecastTransparency>`, que a constituição § 8
    // mantém aqui — por isso a contagem é dos `#termometro-*`, não global.)
    expect(doc.querySelectorAll('[id^="termometro-"]')).toHaveLength(0);
    expect(doc.body.textContent).not.toContain("Projeção do 1º turno em SP");

    // O painel do kit: as duas `<Figure>` do topo e uma linha por candidato.
    const figuras = [...doc.querySelectorAll('[data-testid="figure-label"]')].map(
      (f) => f.textContent,
    );
    expect(figuras).toContain("Apurado");
    expect(figuras).toContain("Margem Candidato");
    expect(doc.querySelectorAll('[data-testid="candidate-result-row"]')).toHaveLength(
      oitoCandidatos.length,
    );
  });

  // O rank exibido nas rotas de UF é DERIVADO: `EdgeUfCandidate` não tem a
  // chave `rank` do payload nacional, então a ordem do array que a página
  // passa ao `<ResultPanel>` é o ranking. O critério é `pct_atual` desc, com
  // `pct_projetado` desc como desempate — ver `rankByParcial` na página.
  it("(b) o rank vem de `pct_atual` desc, com `pct_projetado` como desempate", async () => {
    // `makeCand` produz `pct_atual = pct - 1`. Aqui o array chega FORA de
    // ordem e com dois empates em `pct_atual` (20 e 20), que só `pct_projetado`
    // separa.
    const foraDeOrdem: EdgeUfCandidate[] = [
      { ...makeCand(3, "Terceiro", 21), pct_atual: 20, pct_projetado: 21 },
      makeCand(1, "Primeiro", 41),
      { ...makeCand(4, "Quarto", 19), pct_atual: 20, pct_projetado: 19 },
      makeCand(2, "Segundo", 33),
    ];
    readUfProjectionMock.mockResolvedValueOnce(
      buildUfPayload({ turno: 1, candidatos: foraDeOrdem, comParticipacao: true }),
    );
    const doc = parse(await UFPage({ params: Promise.resolve({ sigla: "SP" }) }));

    const nomes = [...doc.querySelectorAll('[data-testid="candidate-result-row"]')].map(
      (l) => l.querySelector("span.truncate")?.textContent,
    );
    expect(nomes).toEqual(["Primeiro", "Segundo", "Terceiro", "Quarto"]);

    // E a margem do painel é derivada do 1º sobre o 2º nessa mesma ordem:
    // 40,0 − 32,0 = 8,0pp na parcial.
    expect(doc.querySelector('[data-testid="result-margem-parcial"]')?.textContent).toContain(
      "8,0",
    );
  });

  // 2026-09-08 — o `<Panel>` "Forecast" (`<Needle>` + "Margem estimada") saiu
  // desta rota: não existe no protótipo do kit. O que este teste ainda fixa é
  // o dispatch de modo — em 2T não há termômetros, e as linhas de candidato
  // continuam sendo a leitura da corrida.
  it("(c) 2º turno (duelo) → sem termômetros", async () => {
    readUfProjectionMock.mockResolvedValueOnce(
      buildUfPayload({ turno: 2, candidatos: oitoCandidatos.slice(0, 2) }),
    );
    const node = await UFPage({ params: Promise.resolve({ sigla: "SP" }) });
    const doc = parse(node);

    expect(doc.querySelector('[id^="termometro-"]')).toBeNull();
    expect(doc.querySelectorAll('[data-testid="candidate-result-row"]')).toHaveLength(2);
  });

  // 2026-09-09 (D23): `<TrilhaKicker>` (ADR-0019) e `<UFBreadcrumb>` (RF-031)
  // saíram — nenhum dos dois existe no protótipo do kit. O que resta desta
  // invariante é a identidade da trilha no `<main>`, que o CSS usa.
  it("(d) trilha presidencial: main[data-trilha=pres], sem kicker de trilha e sem breadcrumb", async () => {
    readUfProjectionMock.mockResolvedValueOnce(
      buildUfPayload({ turno: 1, candidatos: oitoCandidatos, comParticipacao: true }),
    );
    const node = await UFPage({ params: Promise.resolve({ sigla: "SP" }) });
    const doc = parse(node);

    expect(doc.querySelector("main")?.getAttribute("data-trilha")).toBe("pres");
    expect(doc.querySelector("[data-trilha-kicker]")).toBeNull();
    expect(doc.querySelector('nav[aria-label="Breadcrumb"]')).toBeNull();
    // A UF continua nomeada — pelo `<h1>` do painel de resultado.
    expect(doc.querySelector("h1")?.textContent).toContain("SP");
  });

  // 2026-09-09 (D23): consequência declarada e aceita do corte dos termômetros
  // — brancos, nulos e abstenção SAEM desta tela, exatamente como saíram da
  // home em 09/09. O dado segue em `EdgePayloadUf.participacao`, e o bloco
  // continua obrigatório (ADR-0022) em `/governador`, onde é testado.
  it("(e) a participação do eleitorado não é mais renderizada nesta rota", async () => {
    readUfProjectionMock.mockResolvedValueOnce(
      buildUfPayload({ turno: 1, candidatos: oitoCandidatos, comParticipacao: true }),
    );
    const node = await UFPage({ params: Promise.resolve({ sigla: "SP" }) });
    const doc = parse(node);

    expect(doc.querySelector("#termometro-brancos-nulos")).toBeNull();
    expect(doc.querySelector("#termometro-abstencao")).toBeNull();
    expect(doc.querySelector("#termometro-outros")).toBeNull();
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
    // O `<TrilhaKicker>` acima do `<h1>` (ADR-0019) saiu em 09/09 (D23) — o
    // `<h1>` agora abre a página. A alternância continua sendo por cascata:
    // os dois textos ficam no DOM, marcados por `data-view-only`.
    const bases = [...h1s[0]!.querySelectorAll("[data-view-only]")].map((s) =>
      s.getAttribute("data-view-only"),
    );
    expect(bases).toEqual(["parcial", "proj"]);
  });

  it("(h) o `<ResultPanel>` é o primeiro conteúdo — o mapa e o breadcrumb saíram desta página", async () => {
    // 2026-09-09 (map-builder): o coroplético "{sigla} · quem lidera cada
    // município" (`section[aria-labelledby="leader-map-heading"]`) MUDOU DE
    // ENDEREÇO — foi para a coluna do mapa (`<PersistentMapFrame>`,
    // ADR-0033 § 1), que não é renderizada por este teste (ele monta só
    // `<UFPage>`, não o `layout.tsx` que hospeda a moldura).
    //
    // 2026-09-09 (D23): o `<UFBreadcrumb>` saiu, e com ele o que este teste
    // fixava como "primeiro conteúdo". O primeiro conteúdo passa a ser o
    // painel de resultado.
    const doc = await renderUF();
    expect(doc.querySelector('section[aria-labelledby="leader-map-heading"]')).toBeNull();
    expect(doc.querySelector('nav[aria-label="Breadcrumb"]')).toBeNull();

    const paineis = [...doc.querySelectorAll('[data-testid="panel"]')];
    expect(paineis[0]?.getAttribute("aria-labelledby")).toBe("resultado-heading");
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
    // Eram >= 6 até 2026-09-08 (mapa, projeção, municípios, metodologia); em
    // 2026-09-09 o `<Panel>` do mapa saiu desta página (ver teste (h)) —
    // restam projeção, municípios e metodologia.
    expect(panels.length).toBeGreaterThanOrEqual(3);
    for (const p of panels) {
      expect((p.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
  });

  // (l) removido em 2026-09-08: o `<ChancesPanel>` saiu desta rota — no
  // protótipo do kit ele é NACIONAL (`App.jsx:350`) e migrou para a home. A
  // cobertura do componente em si segue em
  // `tests/unit/components/ChancesPanel.test.tsx`.
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
    readUfProjectionMock.mockResolvedValueOnce(payload);
    readUfDetailMock.mockResolvedValueOnce({
      status: "ok",
      detail: {
        ts: "2026-10-04T18:00:00-03:00",
        uf: "SP",
        cargo: "pres",
        turno: 1,
        municipios: [makeMunicipio(0), makeMunicipio(1), makeMunicipio(2)],
        series_temporais: null,
      },
      url: "https://example.test/municipios/uf/SP/pres/t1.json",
    });
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

// ---------------------------------------------------------------------------
// ADR-0032 — dois read paths, degradação POR SEÇÃO.
//
// O resumo (Global Config) e o detalhe municipal (Vercel Blob) falham
// independentemente. Quando o Blob não responde, as seções de detalhe precisam
// continuar no DOM com um estado explícito — nunca sumir, nunca ficar vazias em
// silêncio (ADR-0017 aplicado a uma fonte de dado).
// ---------------------------------------------------------------------------
describe("UFPage — degradação do detalhe municipal (ADR-0032)", () => {
  function payloadPadrao(): EdgePayloadUf {
    return buildUfPayload({
      turno: 1,
      candidatos: [makeCand(1, "Candidato A", 41), makeCand(2, "Candidato B", 33)],
      comParticipacao: true,
    });
  }

  async function render(detalhe: UfDetailResult): Promise<Document> {
    readUfProjectionMock.mockResolvedValueOnce(payloadPadrao());
    readUfDetailMock.mockResolvedValueOnce(detalhe);
    return parse(await UFPage({ params: Promise.resolve({ sigla: "SP" }) }));
  }

  function detalheOk(municipios: number, ts = "2026-10-04T18:00:00-03:00"): UfDetailResult {
    return {
      status: "ok",
      url: "https://exemplo.test/municipios/uf/SP/pres/t1.json",
      detail: {
        ts,
        uf: "SP",
        cargo: "pres",
        turno: 1,
        municipios: Array.from({ length: municipios }, (_, i) => ({
          cod_ibge: `35${String(i).padStart(5, "0")}`,
          nome: `Município ${i + 1}`,
          pct_apurado: 60,
          lider: { candidato_id: 1, partido: "P1", votos: 1000, margem_pp: 5 },
          votos_reportados: { 1: 1000, 2: 800 },
        })),
        series_temporais: null,
      },
    };
  }

  it("(o) Blob 404: o bloco de municípios CONTINUA no DOM, com motivo explícito", async () => {
    const doc = await render({
      status: "unavailable",
      reason: "not_found",
      url: "https://exemplo.test/municipios/uf/SP/pres/t1.json",
    });

    const estados = [...doc.querySelectorAll('[data-testid="detail-unavailable"]')];
    expect(estados.length).toBeGreaterThan(0);
    expect(estados.map((e) => e.getAttribute("data-reason"))).toContain("not_found");
    expect(doc.body.textContent).toContain("O detalhe por município está indisponível");
    // E o resumo, que vem da OUTRA fonte, segue inteiro.
    expect(doc.querySelectorAll('[data-testid="candidate-result-row"]').length).toBeGreaterThan(0);
  });

  it("(p) erro de rede no Blob: as séries também declaram indisponibilidade", async () => {
    const doc = await render({ status: "unavailable", reason: "fetch_error", url: null });
    const razoes = [...doc.querySelectorAll('[data-testid="detail-unavailable"]')].map((e) =>
      e.getAttribute("data-reason"),
    );
    expect(razoes.every((r) => r === "fetch_error")).toBe(true);
    // A asserção sobre "A evolução ao longo da noite" saiu com o `<Panel>` dos
    // três charts (cortes de 2026-09-08). O estado de falha do Blob continua
    // sendo declarado pelas seções de município que restaram.
    expect(razoes.length).toBeGreaterThan(0);
  });

  it("(q) Blob OK e vazio é `empty`, não `not_found` — são notícias diferentes", async () => {
    const doc = await render(detalheOk(0));
    const estado = doc.querySelector('[data-testid="detail-unavailable"]');
    expect(estado?.getAttribute("data-reason")).toBe("empty");
  });

  it("(r) com detalhe, a seção mostra a idade PRÓPRIA do Blob e nenhum estado de falha", async () => {
    const doc = await render(detalheOk(3));
    expect(doc.querySelector('[data-testid="detail-unavailable"]')).toBeNull();
    const frescor = doc.querySelector('[data-testid="detail-freshness"]');
    expect(frescor).not.toBeNull();
    expect(frescor?.textContent).toContain("Detalhe atualizado às");
    expect(doc.querySelectorAll('[data-testid="municipio-open"]').length).toBeGreaterThan(0);
  });

  it("(s) detalhe atrasado em relação ao resumo: a defasagem é dita, não silenciada", async () => {
    // Resumo às 18:00 (fixture), detalhe às 17:51 → 9 min de defasagem.
    const doc = await render(detalheOk(2, "2026-10-04T17:51:00-03:00"));
    const frescor = doc.querySelector('[data-testid="detail-freshness"]');
    expect(frescor?.getAttribute("data-lag-minutes")).toBe("9");
    expect(frescor?.textContent).toContain("9 min mais antigo que o resumo");
  });
});
