// @vitest-environment happy-dom
/**
 * tests/unit/pages/serie-apuracao-fiacao.test.tsx
 *
 * Spec 020, Fase 2 — a FIAÇÃO entre o payload e o `<SerieApuracaoChart>`.
 *
 * O componente já tem cobertura própria em
 * `tests/unit/components/serie-apuracao-chart.test.tsx` (T1, T3, T5, T7): lá
 * as props chegam escritas à mão. Aqui o que se mede é o trecho que não existe
 * lá — o caminho do dado desde o payload publicado até a prop —, e cada bloco
 * nomeia no título a mutação que ele mata. As duas rotas cobrem os DOIS
 * transportes do ADR-0046 D3, que são diferentes: o nacional viaja na chave de
 * Global Config, o de UF no objeto do Vercel Blob.
 *
 * ## A fixture é incoerente de propósito
 *
 * O eixo tem instantes espaçados de **5 minutos** e `cadencia_min` declara
 * **15**. Nenhum produtor emitiria isso — e é exatamente por isso que serve:
 * uma sentinela coerente faria a aritmética re-inlineada (inferir a cadência de
 * `eixo[1] - eixo[0]`) devolver o mesmo número, e o teste passaria com a
 * mutação aplicada. A mesma lição está registrada no handoff de 2026-09-17.
 *
 * Pela mesma razão a ordem do array não é ordenável por nada: nem por
 * `apurado`, nem por `projetado`, nem por `id`. Qualquer `sort` no consumidor
 * muda o resultado observável.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { UfDetailResult } from "@/lib/blob/uf-detail";
import type {
  EdgePayload,
  EdgePayloadUf,
  EdgeSeriePorCandidato,
  EdgeUfCandidate,
} from "@/lib/edge-config/types";
import fixtureNacional from "@/tests/fixtures/edge-config/projection-current.json" with {
  type: "json",
};

// ---------------------------------------------------------------------------
// Mocks — os dois read paths
// ---------------------------------------------------------------------------

const readNationalProjectionMock = vi.fn();
const readUfProjectionMock = vi.fn();
const readUfDetailMock = vi.fn(
  async (): Promise<UfDetailResult> => ({
    status: "unavailable",
    reason: "not_configured",
    url: null,
  }),
);

vi.mock("@/lib/blob/candidatos", () => ({
  readCandidatosUf: () =>
    Promise.resolve({ status: "unavailable", reason: "not_configured", url: null }) as never,
}));

vi.mock("@/lib/edge-config/reader", () => ({
  readProjection: vi.fn(async () => null),
  readNationalProjection: () => readNationalProjectionMock(),
  readArchivedProjection: vi.fn(async () => null),
  readUfProjection: () => readUfProjectionMock(),
}));

// `importOriginal`: `seriePorCandidatoFrom` e `municipiosFrom` seguem REAIS —
// é parte do caminho que este arquivo mede. Só a ida à rede é substituída.
vi.mock("@/lib/blob/uf-detail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/blob/uf-detail")>()),
  readUfDetail: () => readUfDetailMock(),
}));

// ---------------------------------------------------------------------------
// A fixture
// ---------------------------------------------------------------------------

/** Três instantes espaçados de 5 min. Ver o cabeçalho: a cadência DIZ 15. */
const EIXO = [
  "2026-10-04T20:00:00-03:00",
  "2026-10-04T20:05:00-03:00",
  "2026-10-04T20:10:00-03:00",
];

const CADENCIA_DECLARADA = 15;

/**
 * A ordem abaixo é a do produtor e é contrato (ADR-0046 D4 / RF-170c).
 *
 * Nenhum critério óbvio a reproduz: por `apurado` final seria 10, 20, 30; por
 * `projetado` seria 10, 20, 30; por `id` seria 10, 20, 30. A ordem emitida é
 * 30, 10, 20 — de modo que QUALQUER `sort` no consumidor muda a tela.
 *
 * A candidatura 10 carrega um **furo** no meio (`null` no segundo balde): é o
 * ponto onde um `?? 0` na fiação desenharia um mergulho ao chão que nunca
 * aconteceu.
 */
const SERIE: EdgeSeriePorCandidato = {
  eixo: EIXO,
  cadencia_min: CADENCIA_DECLARADA,
  candidatos: [
    {
      id: 30,
      nome: "Terceira Via",
      partido: "PSOL",
      apurado: [12, 11, 10],
      projetado: [12, 12, 12],
    },
    {
      id: 10,
      nome: "Primeira Colocada",
      partido: "PT",
      apurado: [30, null, 32],
      projetado: [31, 31, 31],
    },
    {
      id: 20,
      nome: "Segunda Colocada",
      partido: "PL",
      apurado: [25, 26, 27],
      projetado: [26, 26, 26],
    },
  ],
};

/** A ordem EXIBIDA esperada — a mesma do array acima, sem mexer. */
const ORDEM_ESPERADA = ["30", "10", "20"];

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

/** A `<figure>` do gráfico, onde as asserções de cor precisam ficar contidas. */
function figura(doc: Document): Element {
  const el = doc.querySelector('[data-testid="serie-apuracao-chart"]');
  if (!el) throw new Error("o bloco da evolução da apuração não está no DOM");
  return el;
}

/** Ordem de exibição, lida dos grupos da base "parcial". */
function ordemExibida(doc: Document): string[] {
  return [...figura(doc).querySelectorAll('g[data-cand][data-base="parcial"]')]
    .map((g) => g.getAttribute("data-cand") ?? "")
    .filter((id, i, todos) => todos.indexOf(id) === i);
}

/** Células da tabela acessível de uma candidatura, na base "apurado". */
function celulas(doc: Document, id: number): string[] {
  return [...figura(doc).querySelectorAll(`td[data-cand="${id}"][data-base="parcial"]`)].map(
    (td) => td.textContent ?? "",
  );
}

function legenda(doc: Document): string {
  return figura(doc).querySelector("caption")?.textContent ?? "";
}

// ---------------------------------------------------------------------------
// Home — o transporte NACIONAL (chave de Global Config)
// ---------------------------------------------------------------------------

async function renderHome(serie: EdgeSeriePorCandidato | null): Promise<Document> {
  const { default: HomePage } = await import("@/app/(pres)/page");
  const base = fixtureNacional as unknown as EdgePayload;
  const payload: EdgePayload = serie ? { ...base, serie_por_candidato: serie } : { ...base };
  readNationalProjectionMock.mockResolvedValueOnce(payload);
  return parse(renderToStaticMarkup(await HomePage()));
}

describe("Fase 2 — a home passa a série NACIONAL do payload (RF-170c, RF-168)", () => {
  it("mata o consumidor re-ordenando: a ordem exibida é a do array emitido", async () => {
    const doc = await renderHome(SERIE);
    expect(ordemExibida(doc)).toEqual(ORDEM_ESPERADA);

    // A tabela acessível percorre o mesmo elenco, e na mesma ordem: se só o
    // SVG respeitasse o contrato, quem lê por leitor de tela veria outra
    // corrida.
    const colunas = [...figura(doc).querySelectorAll("thead th")].map((th) => th.textContent ?? "");
    expect(colunas[0]).toBe("Hora do boletim");
    expect(colunas[1]).toContain("Terceira Via");
    expect(colunas[2]).toContain("Primeira Colocada");
    expect(colunas[3]).toContain("Segunda Colocada");
  });

  it("mata a cadência inferida do eixo: a legenda diz a DECLARADA", async () => {
    const doc = await renderHome(SERIE);
    // 15, e não 5 — o espaçamento real entre os dois primeiros instantes.
    expect(legenda(doc)).toContain(`a cada ${CADENCIA_DECLARADA} minutos`);
    expect(legenda(doc)).not.toContain("a cada 5 minutos");
  });

  it("mata o `?? 0` na fiação: o furo chega como furo", async () => {
    const doc = await renderHome(SERIE);

    // Tabela: "sem medição" no balde do meio, e nenhuma célula desta
    // candidatura em zero.
    expect(celulas(doc, 10)).toEqual(["30,0%", "sem medição", "32,0%"]);

    // Traçado: o furo parte a linha em DOIS elementos. Com `?? 0` seria um só,
    // e ele desceria ao chão e voltaria.
    const tracos = figura(doc).querySelectorAll(
      'path[data-traco][data-cand="10"][data-base="parcial"]',
    );
    expect(tracos).toHaveLength(2);
  });

  it("mata a cor por rank: o token `--color-cand-` não entra no bloco", async () => {
    // O payload nacional publica `cor: var(--color-cand-N)` em cada
    // candidatura, e a fixture usada aqui também. A asserção é NEGATIVA e
    // escopada à figura: a positiva ("tem uma cor") passa com a cor errada.
    const doc = await renderHome(SERIE);
    expect(figura(doc).innerHTML).not.toContain("--color-cand-");
  });

  it("sem o campo no payload, o bloco fica no DOM e não inventa série", async () => {
    const doc = await renderHome(null);
    expect(figura(doc).getAttribute("data-estado")).toBe("indisponivel");
    expect(doc.querySelectorAll("[data-traco]")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// UF presidencial — o transporte por UF (objeto do Vercel Blob)
// ---------------------------------------------------------------------------

function candUf(id: number, pct: number): EdgeUfCandidate {
  return {
    id,
    nome: `Candidato ${id}`,
    partido: `P${id}`,
    cor: `var(--color-cand-${id})`,
    votos_atuais: pct * 1000,
    votos_projetados: pct * 2000,
    pct_atual: pct - 1,
    pct_projetado: pct,
    ci95: { lower: pct - 2, upper: pct + 2 },
  };
}

const PAYLOAD_UF: EdgePayloadUf = {
  uf: "SP",
  ts: "2026-10-04T20:10:00-03:00",
  cargo: 1,
  turno: 1,
  pct_apurado: 42,
  candidatos: [candUf(10, 41), candUf(20, 33)],
  needle_position: 0.3,
  needle_band: "lean_a",
};

function blobCom(serie: EdgeSeriePorCandidato | null): UfDetailResult {
  return {
    status: "ok",
    url: "https://exemplo.test/municipios/uf/SP/pres/t1.json",
    detail: {
      ts: "2026-10-04T20:10:00-03:00",
      uf: "SP",
      cargo: "pres",
      turno: 1,
      municipios: [],
      series_temporais: serie
        ? { margem: [], p_vitoria: [], turnout: [], por_candidato: serie }
        : null,
    },
  };
}

async function renderUf(detalhe: UfDetailResult): Promise<Document> {
  const { default: UFPage } = await import("@/app/(pres)/uf/[sigla]/page");
  readUfProjectionMock.mockResolvedValueOnce(PAYLOAD_UF);
  readUfDetailMock.mockResolvedValueOnce(detalhe);
  return parse(renderToStaticMarkup(await UFPage({ params: Promise.resolve({ sigla: "SP" }) })));
}

/** O `<DetailUnavailable>` do painel da evolução — nunca o dos municípios. */
function estadoDaSerie(doc: Document): Element | null {
  const painel = [...doc.querySelectorAll('[data-testid="panel"]')].find(
    (el) =>
      el.querySelector('[data-testid="panel-kicker"]')?.textContent === "Evolução da apuração",
  );
  return painel?.querySelector('[data-testid="detail-unavailable"]') ?? null;
}

describe("Fase 2 — a rota de UF passa a série do Blob (RF-170c, RF-175)", () => {
  it("mata o consumidor re-ordenando, a cadência inferida e o `?? 0`, de uma vez", async () => {
    const doc = await renderUf(blobCom(SERIE));

    expect(ordemExibida(doc)).toEqual(ORDEM_ESPERADA);
    expect(legenda(doc)).toContain(`a cada ${CADENCIA_DECLARADA} minutos`);
    expect(celulas(doc, 10)).toEqual(["30,0%", "sem medição", "32,0%"]);
    expect(
      figura(doc).querySelectorAll('path[data-traco][data-cand="10"][data-base="parcial"]'),
    ).toHaveLength(2);
    expect(figura(doc).innerHTML).not.toContain("--color-cand-");
  });

  /**
   * O ramo de ESPERA da rota (sem payload de UF) é um call site próprio, e o
   * quarto defeito do handoff de 2026-09-17 nasceu exatamente de um bloco que
   * entrou num ramo e não no outro.
   *
   * Aqui não há payload de UF e HÁ série no Blob — combinação real: os dois
   * read paths falham de forma independente (ADR-0032), e o Blob pode
   * responder enquanto a chave de Global Config não.
   */
  it("o ramo de ESPERA também recebe a série, e na ordem emitida", async () => {
    const { default: UFPage } = await import("@/app/(pres)/uf/[sigla]/page");
    vi.stubEnv("NODE_ENV", "production");
    readUfProjectionMock.mockResolvedValueOnce(null);
    readNationalProjectionMock.mockResolvedValueOnce(null);
    readUfDetailMock.mockResolvedValueOnce(blobCom(SERIE));
    const doc = parse(
      renderToStaticMarkup(await UFPage({ params: Promise.resolve({ sigla: "SP" }) })),
    );
    vi.unstubAllEnvs();

    expect(ordemExibida(doc)).toEqual(ORDEM_ESPERADA);
    expect(legenda(doc)).toContain(`a cada ${CADENCIA_DECLARADA} minutos`);
    expect(celulas(doc, 10)).toEqual(["30,0%", "sem medição", "32,0%"]);
    // O `<h1>` do ramo de espera continua único.
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
  });

  /**
   * RF-175 — o par que discrimina. As duas causas têm correções OPOSTAS:
   * "a rede caiu" se conserta na infraestrutura, "o produtor não publicou" se
   * conserta no orchestrator. Um texto só para as duas manda quem opera na
   * noite de 04/10 caçar a errada.
   */
  it("mata o colapso de `sem_serie` com falha de leitura: são motivos distintos", async () => {
    const semSerie = await renderUf(blobCom(null));
    expect(estadoDaSerie(semSerie)?.getAttribute("data-reason")).toBe("sem_serie");

    const semBlob = await renderUf({ status: "unavailable", reason: "fetch_error", url: null });
    expect(estadoDaSerie(semBlob)?.getAttribute("data-reason")).toBe("fetch_error");

    // E nos dois casos o bloco CONTINUA no DOM (ADR-0017 / ADR-0032 item 3).
    for (const doc of [semSerie, semBlob]) {
      const kickers = [...doc.querySelectorAll('[data-testid="panel-kicker"]')].map(
        (k) => k.textContent ?? "",
      );
      expect(kickers).toContain("Evolução da apuração");
    }
  });
});
