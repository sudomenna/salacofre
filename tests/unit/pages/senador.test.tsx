// @vitest-environment happy-dom
/**
 * tests/unit/pages/senador.test.tsx — spec 016, as duas telas.
 *
 * `/senador` (T-09) e `/uf/[sigla]/senador` (T-10), renderizadas por SSR com
 * o reader mockado — o mesmo padrão de `tests/unit/components/UFPage.test.tsx`.
 *
 * O fio condutor de todos os casos é o mesmo da spec: **são duas vagas, e
 * quase toda a gramática das outras telas descreve uma só.** Por isso boa
 * parte dos asserts é negativa — eles falham se a tela voltar a falar de
 * "líder", de "margem do 1º sobre o 2º" ou de "1 vaga".
 *
 * `NODE_ENV` aqui é `test`, então o atalho de fixture das páginas (que só roda
 * em `development`) fica fora do caminho: o que se mede é o comportamento com
 * o payload que o reader devolve, inclusive o `null`.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SenadoPage from "@/app/(sen)/senador/page";
import UFSenadorPage from "@/app/(sen)/uf/[sigla]/senador/page";
import type {
  EdgeCandidate,
  EdgePayload,
  EdgePayloadUf,
  EdgeUfCandidate,
} from "@/lib/edge-config/types";

const readProjectionMock = vi.fn();
const readUfProjectionMock = vi.fn();

vi.mock("@/lib/edge-config/reader", () => ({
  readProjection: (opts?: { cargo?: string; turno?: number }) => readProjectionMock(opts),
  readNationalProjection: vi.fn(async () => null),
  readArchivedProjection: vi.fn(async () => null),
  readUfProjection: (sigla: string, opts?: { cargo?: string }) => readUfProjectionMock(sigla, opts),
}));

function parse(markup: string): Document {
  return new DOMParser().parseFromString(markup, "text/html");
}

async function render(node: Promise<React.ReactElement> | React.ReactElement): Promise<Document> {
  return parse(renderToStaticMarkup(await node));
}

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

function ufCand(
  id: number,
  nome: string,
  partido: string,
  pct: number,
  over: Partial<EdgeUfCandidate> = {},
): EdgeUfCandidate {
  return {
    id,
    nome,
    partido,
    cor: `var(--color-cand-${id})`,
    votos_atuais: Math.round(pct * 10_000),
    votos_projetados: Math.round(pct * 20_000),
    pct_atual: pct,
    pct_projetado: pct,
    // IC com largura > 0 ⇒ há incerteza medida e o painel de chances aparece.
    ci95: { lower: pct - 2, upper: pct + 2 },
    ...over,
  };
}

/** SP: 40 / 30 / 29 / 1 — o cenário literal da aceitação do RF-104. */
function ufPayload(over: Partial<EdgePayloadUf> = {}): EdgePayloadUf {
  return {
    uf: "SP",
    ts: "2026-10-04T21:00:00Z",
    cargo: 5,
    turno: 1,
    pct_apurado: 62,
    candidatos: [
      ufCand(1, "Ana Lima", "PT", 40, { p_eleito: 0.97 }),
      ufCand(2, "Bruno Reis", "PL", 30, { p_eleito: 0.61 }),
      ufCand(3, "Célia Mota", "MDB", 29, { p_eleito: 0.39 }),
      ufCand(4, "Davi Nunes", "PSOL", 1, { p_eleito: 0.03 }),
    ],
    needle_position: 0,
    needle_band: "tossup",
    vagas: 2,
    granularidade: "uf",
    ...over,
  };
}

function natCand(id: number, nome: string, partido: string, pct: number): EdgeCandidate {
  return {
    id,
    nome,
    partido,
    cor: `var(--color-cand-${id})`,
    votos_atuais: 0,
    votos_projetados: 0,
    pct_atual: pct,
    pct_projetado: pct,
    pct_projetado_lower: pct - 2,
    pct_projetado_upper: pct + 2,
    p_vitoria: 0,
    rank: id,
    p_passa_2t: 0,
    p_fecha_1t: 0,
  };
}

function nacional(over: Partial<EdgePayload> = {}): EdgePayload {
  return {
    ts: "2026-10-04T21:00:00Z",
    cargo: 5,
    turno: 1,
    pct_apurado_total: 55.5,
    ufs_apuradas: 2,
    national: {
      candidatos: [
        natCand(1, "Ana Lima", "PT", 40),
        natCand(2, "Bruno Reis", "PL", 30),
        natCand(3, "Célia Mota", "MDB", 29),
        natCand(11, "Eva Prado", "PSD", 45),
        natCand(12, "Fábio Cruz", "PP", 28),
        natCand(13, "Gil Souza", "PDT", 20),
      ],
      needle_position: 0,
      needle_band: "tossup",
      candidato_a_id: null,
      candidato_b_id: null,
      p_segundo_turno_overall: null,
      cenarios_2t: [],
    },
    por_uf: [
      {
        sigla: "SP",
        pct_apurado: 62,
        lider: 1,
        margem_atual: 1,
        margem_projetada: 1,
        margem_projetada_ci: [-1, 3],
        chamada: false,
        swing_vs_2022: null,
        top_candidatos: [
          { id: 1, pct: 40 },
          { id: 2, pct: 30 },
          { id: 3, pct: 29 },
        ],
        vai_a_2t: null,
        bucket: "indefinido",
      },
      {
        sigla: "RJ",
        pct_apurado: 48,
        lider: 11,
        margem_atual: 8,
        margem_projetada: 8,
        margem_projetada_ci: [6, 10],
        chamada: false,
        swing_vs_2022: null,
        top_candidatos: [
          { id: 11, pct: 45 },
          { id: 12, pct: 28 },
          { id: 13, pct: 20 },
        ],
        vai_a_2t: null,
        bucket: "indefinido",
      },
    ],
    insights: [],
    composition: { pre_election: 0, model: 1, actual_results: 0 },
    composicao_vagas: {
      vagas_em_disputa: 54,
      total_cadeiras: 81,
      vagas_por_uf: 2,
      ufs_projetadas: 2,
      ufs_aguardando: 25,
      vagas_projetadas: 4,
      por_partido: [
        { partido: "PL", vagas: 1 },
        { partido: "PP", vagas: 1 },
        { partido: "PSD", vagas: 1 },
        { partido: "PT", vagas: 1 },
      ],
    },
    ...over,
  };
}

beforeEach(() => {
  readProjectionMock.mockReset();
  readUfProjectionMock.mockReset();
});

// ---------------------------------------------------------------------------
// T-09 — /senador
// ---------------------------------------------------------------------------

describe("/senador (T-09)", () => {
  it("(a) lê a chave do cargo 5 com cargo E turno explícitos (ADR-0028)", async () => {
    readProjectionMock.mockResolvedValue(nacional());
    await render(SenadoPage());

    expect(readProjectionMock).toHaveBeenCalledWith({ cargo: "sen", turno: 1 });
  });

  it("(b) RF-106: diz '2 vagas por estado' junto ao título — e nunca '1 vaga'", async () => {
    readProjectionMock.mockResolvedValue(nacional());
    const doc = await render(SenadoPage());

    expect(doc.querySelector("[data-testid='senado-vagas-label']")?.textContent).toContain(
      "2 vagas por estado",
    );
    // O kit rotula "1 vaga" (ADR-0029). Herdar esse rótulo aqui seria um erro
    // de fato sobre a eleição.
    expect(doc.body.textContent).not.toMatch(/\b1 vaga\b/);
  });

  it("(c) RF-107: o denominador é 54, e as 81 cadeiras são distinguidas dele", async () => {
    readProjectionMock.mockResolvedValue(nacional());
    const doc = await render(SenadoPage());
    const nota = doc.querySelector("[data-testid='composicao-nota']")?.textContent ?? "";

    expect(doc.body.textContent).toContain("54");
    expect(nota).toContain("81 cadeiras");
    expect(nota).toMatch(/renova dois terços/i);
    // As 27 que não estão em disputa precisam ser nomeadas — senão o leitor
    // soma 54 e conclui que o Senado tem 54 cadeiras.
    expect(nota).toContain("27");
    expect(nota).toMatch(/eleitos em 2022/i);
  });

  it("(d) RF-107: conta vagas por partido e nomeia o que ainda falta apurar", async () => {
    readProjectionMock.mockResolvedValue(nacional());
    const doc = await render(SenadoPage());
    const lista = doc.querySelector("[data-testid='composicao-partidos']")?.textContent ?? "";

    for (const sigla of ["PT", "PL", "PSD", "PP"]) {
      expect(lista).toContain(sigla);
    }
    // 54 em disputa − 4 projetadas = 50 aguardando. Sem esse número a soma
    // não fecha e o leitor conclui que sumiram vagas.
    expect(doc.querySelector("[data-testid='composicao-aguardando']")?.textContent).toContain("50");
  });

  it("(e) RF-107: a nota declara que o total é soma nossa, não dado nacional do TSE", async () => {
    readProjectionMock.mockResolvedValue(nacional());
    const doc = await render(SenadoPage());
    const nota = doc.querySelector("[data-testid='composicao-nota']")?.textContent ?? "";

    expect(nota).toMatch(/soma das 27 corridas/i);
    expect(nota).toMatch(/não publica um arquivo nacional/i);
  });

  it("(f) RF-104: a margem de cada estado é a da 2ª vaga, não a do líder", async () => {
    readProjectionMock.mockResolvedValue(nacional());
    const doc = await render(SenadoPage());
    const sp = doc.querySelector("[data-uf='SP'] [data-testid='corrida-margem']")?.textContent;
    const rj = doc.querySelector("[data-uf='RJ'] [data-testid='corrida-margem']")?.textContent;

    // SP: 30 − 29 = 1 pp (e NÃO 40 − 30 = 10).
    expect(sp).toContain("1,0");
    expect(sp).not.toContain("10,0");
    expect(sp).toMatch(/2ª vaga/);
    // RJ: 28 − 20 = 8 pp (e NÃO 45 − 28 = 17).
    expect(rj).toContain("8,0");
    expect(rj).not.toContain("17,0");
  });

  it("(g) cada estado nomeia os DOIS que ocupam vaga, sem ordinal", async () => {
    readProjectionMock.mockResolvedValue(nacional());
    const doc = await render(SenadoPage());
    const sp = doc.querySelector("[data-uf='SP']")?.textContent ?? "";

    expect(sp).toContain("Ana Lima");
    expect(sp).toContain("Bruno Reis");
    // O 3º não ocupa vaga — não pode aparecer como se ocupasse.
    expect(sp).not.toContain("Célia Mota");
  });

  it("(h) RF-108: cadência em texto, e SEM a afirmação de nível de estado", async () => {
    // Até 2026-09-11 esta asserção era invertida: exigia o texto "esta projeção
    // é feita no nível do estado — o TSE publica um boletim agregado por UF
    // para este cargo, e não um por zona eleitoral". Isso deixou de ser verdade
    // quando o cargo 5 passou a ser ingerido por ZONA (emenda (b) do ADR-0026),
    // e uma tela que afirma isso mente sobre a própria metodologia
    // (constituição § 8). A granularidade agora sai de `lib/config/cargos.ts`,
    // não de literal na página — se alguém voltar a fixá-la, este teste cai.
    readProjectionMock.mockResolvedValue(nacional());
    const doc = await render(SenadoPage());
    const nota = doc.querySelector("[data-testid='forecast-cadencia']")?.textContent ?? "";

    expect(nota).toContain("a cada 5 minutos");
    expect(nota).not.toMatch(/nível do estado/i);
    expect(nota).not.toMatch(/não um por zona eleitoral/i);
  });

  it("(i) trilha `sen` e exatamente um <h1> (a aba do shell depende do atributo)", async () => {
    readProjectionMock.mockResolvedValue(nacional());
    const doc = await render(SenadoPage());

    expect(doc.querySelector("main")?.getAttribute("data-trilha")).toBe("sen");
    expect(doc.querySelectorAll("h1").length).toBe(1);
  });

  it("(j) sem payload a página não some — degrada com a estrutura inteira", async () => {
    readProjectionMock.mockResolvedValue(null);
    const doc = await render(SenadoPage());

    expect(doc.querySelectorAll("h1").length).toBe(1);
    expect(doc.body.textContent).toContain("54 vagas em disputa");
    expect(doc.body.textContent).toMatch(/nenhum estado apurado/i);
    // O bloco de transparência é obrigatório em toda página com projeção
    // (constituição § 8) — inclusive quando ainda não há projeção.
    expect(doc.querySelector("[data-testid='forecast-cadencia']")).not.toBeNull();
  });

  it("(k) o rodapé constitucional continua DENTRO do <main>", async () => {
    readProjectionMock.mockResolvedValue(nacional());
    const doc = await render(SenadoPage());

    expect(doc.querySelector("main footer")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T-10 — /uf/[sigla]/senador
// ---------------------------------------------------------------------------

const PARAMS_SP = { params: Promise.resolve({ sigla: "SP" }) };

describe("/uf/[sigla]/senador (T-10)", () => {
  it("(l) lê a chave da UF com cargo e turno explícitos (ADR-0028)", async () => {
    readUfProjectionMock.mockResolvedValue(ufPayload());
    await render(UFSenadorPage(PARAMS_SP));

    expect(readUfProjectionMock).toHaveBeenCalledWith("SP", { cargo: "sen", turno: 1 });
  });

  it("(m) RF-105: exatamente 2 linhas carregam o marcador de vaga", async () => {
    readUfProjectionMock.mockResolvedValue(ufPayload());
    const doc = await render(UFSenadorPage(PARAMS_SP));

    expect(doc.querySelectorAll("[data-testid='result-vaga-marker']").length).toBe(2);
    expect(doc.querySelectorAll("[data-testid='candidate-result-row']").length).toBe(4);
  });

  it("(n) RF-104: a margem exibida é 1 pp (2º→3º), não 10 pp (1º→2º)", async () => {
    readUfProjectionMock.mockResolvedValue(ufPayload());
    const doc = await render(UFSenadorPage(PARAMS_SP));
    const margem = doc.querySelector("[data-testid='result-margem-parcial']")?.textContent ?? "";

    expect(margem).toContain("1,0");
    expect(margem).not.toContain("10,0");
    expect(margem).toMatch(/margem para a 2ª vaga/i);
  });

  it("(o) RF-106: a nota do painel diz 2 vagas por estado, e a tela nunca diz '1 vaga'", async () => {
    readUfProjectionMock.mockResolvedValue(ufPayload());
    const doc = await render(UFSenadorPage(PARAMS_SP));

    expect(doc.body.textContent).toContain("2 vagas por estado");
    expect(doc.body.textContent).not.toMatch(/\b1 vaga\b/);
  });

  it("(p) RF-103: os medidores de p_eleito aparecem quando há incerteza medida", async () => {
    readUfProjectionMock.mockResolvedValue(ufPayload());
    const doc = await render(UFSenadorPage(PARAMS_SP));

    // Os `vagas + 1` primeiros: quem entra e quem está na porta. O seletor é
    // escopado ao painel de chances — o `<ForecastTransparency>` da mesma
    // página também usa `role="meter"` nas duas barras dele.
    expect(doc.querySelectorAll("[data-testid='chances-panel-meters'] [role='meter']").length).toBe(
      3,
    );
    expect(doc.body.textContent).toContain("Célia Mota se elege em SP");
  });

  it("(q) IC de largura zero: nada de 'chance' — o bloco explica por quê", async () => {
    // É o caso REAL do cargo hoje: com um boletim por estado, o bootstrap não
    // tem o que reamostrar e `p_eleito` degenera para 0/1. Publicar "100%"
    // com 62% apurado afirmaria uma certeza que o modelo não tem.
    const degenerado = ufPayload({
      candidatos: [
        ufCand(1, "Ana Lima", "PT", 40, { p_eleito: 1, ci95: { lower: 40, upper: 40 } }),
        ufCand(2, "Bruno Reis", "PL", 30, { p_eleito: 1, ci95: { lower: 30, upper: 30 } }),
        ufCand(3, "Célia Mota", "MDB", 29, { p_eleito: 0, ci95: { lower: 29, upper: 29 } }),
      ],
    });
    readUfProjectionMock.mockResolvedValue(degenerado);
    const doc = await render(UFSenadorPage(PARAMS_SP));

    expect(doc.querySelectorAll("[data-testid='chances-panel-meters']").length).toBe(0);
    // O bloco NÃO some (ADR-0017) — ele diz o que o modelo sabe e o que não.
    const explicacao = doc.querySelector("[data-testid='chances-sem-incerteza']")?.textContent;
    expect(explicacao).toMatch(/um único boletim por estado/i);
    expect(doc.body.textContent).not.toContain("100%");
  });

  it("(r) RF-108: cadência de 5 min no bloco de metodologia", async () => {
    readUfProjectionMock.mockResolvedValue(ufPayload());
    const doc = await render(UFSenadorPage(PARAMS_SP));
    const nota = doc.querySelector("[data-testid='forecast-cadencia']")?.textContent ?? "";

    expect(nota).toMatch(/nível do estado/i);
    expect(nota).toContain("a cada 5 minutos");
  });

  it("(s) a tela não promete o que este cargo não tem: município e 2º turno", async () => {
    readUfProjectionMock.mockResolvedValue(ufPayload());
    const doc = await render(UFSenadorPage(PARAMS_SP));
    const texto = doc.body.textContent ?? "";

    expect(texto).not.toMatch(/maiores colégios/i);
    expect(texto).not.toMatch(/2º turno|segundo turno/i);
  });

  it("(t) trilha `sen`, um <h1> e o rodapé dentro do <main>", async () => {
    readUfProjectionMock.mockResolvedValue(ufPayload());
    const doc = await render(UFSenadorPage(PARAMS_SP));

    expect(doc.querySelector("main")?.getAttribute("data-trilha")).toBe("sen");
    expect(doc.querySelectorAll("h1").length).toBe(1);
    expect(doc.querySelector("main footer")).not.toBeNull();
  });

  it("(u) payload sem `vagas` (gravado antes da spec 016) cai na tabela canônica", async () => {
    const semVagas = ufPayload();
    delete (semVagas as Partial<EdgePayloadUf>).vagas;
    readUfProjectionMock.mockResolvedValue(semVagas);
    const doc = await render(UFSenadorPage(PARAMS_SP));

    expect(doc.querySelectorAll("[data-testid='result-vaga-marker']").length).toBe(2);
  });

  it("(v) sem payload, o estado de espera já diz quantas vagas estão em jogo", async () => {
    readUfProjectionMock.mockResolvedValue(null);
    const doc = await render(UFSenadorPage(PARAMS_SP));

    expect(doc.querySelectorAll("h1").length).toBe(1);
    expect(doc.body.textContent).toContain("Aguardando dados");
    expect(doc.body.textContent).toContain("2 vagas por estado");
  });

  it("(w) a ordem exibida é a do apurado, com a projeção como desempate", async () => {
    // Espelho de `rankByParcial` nas outras rotas: é o apurado que o leitor
    // confere contra o boletim do TSE. Aqui o 3º tem o MAIOR `pct_atual`, e
    // por isso ele é quem ocupa a 1ª linha — e uma das vagas.
    const invertido = ufPayload({
      candidatos: [
        ufCand(1, "Ana Lima", "PT", 40, { pct_atual: 10, p_eleito: 0.5 }),
        ufCand(2, "Bruno Reis", "PL", 30, { pct_atual: 20, p_eleito: 0.5 }),
        ufCand(3, "Célia Mota", "MDB", 29, { pct_atual: 60, p_eleito: 1 }),
      ],
    });
    readUfProjectionMock.mockResolvedValue(invertido);
    const doc = await render(UFSenadorPage(PARAMS_SP));
    const linhas = [...doc.querySelectorAll("ol > li")];

    expect(linhas[0]?.textContent).toContain("Célia Mota");
    expect(linhas[0]?.getAttribute("data-vaga")).toBe("true");
    expect(linhas[2]?.getAttribute("data-vaga")).toBeNull();
  });
});
