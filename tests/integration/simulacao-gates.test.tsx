// @vitest-environment happy-dom
/**
 * tests/integration/simulacao-gates.test.tsx
 *
 * Os dois portões do modo de simulação (`lib/dev/simulacao.ts`), provados pela
 * DIREÇÃO e não pela forma: cada teste nomeia a mutação que deve derrubá-lo.
 *
 * ## Por que este arquivo existe
 *
 * Em 14/09/2026 o site público publicou resultado eleitoral inventado pela
 * terceira vez, e uma das causas anteriores foi leitura de fixture escapando
 * para produção. A simulação é PIOR que as fixtures antigas nesse cenário: ela
 * carrega nomes, partidos e fotos de políticos REAIS com votos inventados.
 * Vazada, não parece teste — parece apuração.
 *
 * O precedente do teste certo é `tests/integration/home-page.test.tsx:565`
 * ("HomePage — produção sem Global Config"), e a lição dele vale aqui inteira:
 * asserção em string literal do dado que não pode vazar, porque é a regressão
 * literal que precisa ser pega.
 *
 * ## Como os arquivos da simulação entram sem existir no disco
 *
 * `tests/fixtures/simulacao/` é gerado por outro processo e pode não existir.
 * `node:fs` é mockado abaixo e serve stubs EM MEMÓRIA — assim o teste prova o
 * portão mesmo antes das fixtures aparecerem, e continua provando depois, sem
 * depender do conteúdo delas.
 *
 * Os stubs derivam das fixtures reais e trocam o nome do primeiro candidato por
 * {@link MARCA}. Derivar em vez de inventar mantém a forma estruturalmente
 * válida (a home renderiza de verdade); a marca torna o vazamento inconfundível
 * — nenhum outro caminho do código produz essa string.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import baseDep from "@/tests/fixtures/edge-config/dep-current.json" with { type: "json" };
import baseGov from "@/tests/fixtures/edge-config/gov-current.json" with { type: "json" };
import baseNacional from "@/tests/fixtures/edge-config/projection-current.json" with {
  type: "json",
};
import baseSen from "@/tests/fixtures/edge-config/sen-current.json" with { type: "json" };
import baseSenUf from "@/tests/fixtures/edge-config/sen-uf.json" with { type: "json" };

/**
 * A string que NUNCA pode aparecer fora do `pnpm dev`. Escolhida para não
 * colidir com nada: se ela está no HTML ou no JSON, só pode ter vindo daqui.
 */
const MARCA = "CANDIDATO-DA-SIMULACAO-VAZOU";

/**
 * Marca própria do município, separada de {@link MARCA} de propósito: a tabela
 * de municípios e o painel de candidatos são as DUAS coisas que (d6) precisa
 * distinguir. Com uma marca só, o município carimbaria a string do candidato no
 * HTML e o teste acusaria vazamento onde não há.
 */
const MARCA_MUNICIPIO = "MUNICIPIO-DA-SIMULACAO";

// ---------------------------------------------------------------------------
// Stubs em memória, servidos por um `node:fs` mockado
// ---------------------------------------------------------------------------

/** `mtimeMs` sempre novo: o cache de `lerArquivo` é chaveado por mtime, e um
 *  valor fixo faria um teste herdar o conteúdo lido por outro. */
let relogioDoArquivo = 0;
const arquivos = new Map<string, string>();

function registrar(nome: string, conteudo: unknown) {
  arquivos.set(nome, JSON.stringify(conteudo));
}

function nomeDe(caminho: unknown): string {
  return String(caminho).split("/").pop() ?? "";
}

/**
 * 🔴 O diretório da simulação é HERMÉTICO neste teste: dentro dele, só o mapa
 * em memória existe.
 *
 * Não é preciosismo. `tests/fixtures/simulacao/` **existe de verdade no disco**
 * e é REGENERADO por outro processo enquanto esta suíte roda — o arquivo
 * municipal sozinho tem 3,1 MB. Um mock que caísse para o `fs` real quando a
 * chave falta leria esse arquivo, e o teste "sem arquivo municipal" passaria a
 * afirmar o contrário do que diz — verde, e provando nada. Fora do diretório,
 * tudo segue para o `fs` real, senão o mock derrubaria o resto da suíte.
 */
function ehDaSimulacao(caminho: unknown): boolean {
  return String(caminho).includes("fixtures/simulacao");
}

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  const statSync = (caminho: unknown, ...resto: unknown[]) => {
    if (!ehDaSimulacao(caminho)) {
      return (real.statSync as (...a: unknown[]) => unknown)(caminho, ...resto);
    }
    if (!arquivos.has(nomeDe(caminho))) {
      throw Object.assign(new Error(`ENOENT: ${caminho}`), { code: "ENOENT" });
    }
    relogioDoArquivo += 1;
    return { mtimeMs: relogioDoArquivo };
  };
  const readFileSync = (caminho: unknown, ...resto: unknown[]) => {
    if (!ehDaSimulacao(caminho)) {
      return (real.readFileSync as (...a: unknown[]) => unknown)(caminho, ...resto);
    }
    const conteudo = arquivos.get(nomeDe(caminho));
    if (conteudo === undefined) {
      throw Object.assign(new Error(`ENOENT: ${caminho}`), { code: "ENOENT" });
    }
    return conteudo;
  };
  return { ...real, default: { ...real, statSync, readFileSync }, statSync, readFileSync };
});

// ---------------------------------------------------------------------------
// Readers mockados — sempre vazios, que é o estado em que o fallback de
// desenvolvimento é alcançado. É esse estado que 14/09 mostrou ser o perigoso.
// ---------------------------------------------------------------------------

const readNationalProjectionMock = vi.fn();
const readArchivedProjectionMock = vi.fn();
const readProjectionMock = vi.fn();
const readUfProjectionMock = vi.fn();
const readDeputadoProjectionMock = vi.fn();

vi.mock("@/lib/edge-config/reader", () => ({
  readNationalProjection: () => readNationalProjectionMock(),
  readArchivedProjection: (o?: unknown) => readArchivedProjectionMock(o),
  readProjection: (o?: unknown) => readProjectionMock(o),
  readUfProjection: (s: string, o?: unknown) => readUfProjectionMock(s, o),
  readDeputadoProjection: () => readDeputadoProjectionMock(),
}));

vi.mock("@/lib/blob/candidatos", () => ({
  // O contrato é um `CandidatosResult`, nunca `null` — `CandidaturasAguardando`
  // lê `.status` direto. Devolver `null` aqui derrubaria a home por TypeError e
  // o teste passaria a provar "a página quebrou", não "nada vazou".
  readCandidatosUf: () =>
    Promise.resolve({ status: "unavailable", reason: "not_configured", url: null }),
}));

/**
 * `readUfDetail` é um `vi.fn()` e não uma seta fixa porque o defeito de
 * 2026-09-15 depende do que ele RESPONDE: o Blob real dizendo `ok` com lista
 * vazia era o que derrubava a simulação. Um mock que só sabe dizer
 * "unavailable" nunca reproduziria isso.
 */
const readUfDetailMock = vi.fn();

vi.mock("@/lib/blob/uf-detail", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/blob/uf-detail")>();
  return { ...real, readUfDetail: (s: string, o?: unknown) => readUfDetailMock(s, o) };
});

// Importados DEPOIS dos mocks, de propósito.
const { GET: getProjection } = await import("@/app/api/projection/route");
const { GET: getMunicipios } = await import("@/app/api/projection/municipios/route");
const simulacao = await import("@/lib/dev/simulacao");
const { default: HomePage } = await import("@/app/(pres)/page");
const { default: UfPresPage } = await import("@/app/(pres)/uf/[sigla]/page");

// ---------------------------------------------------------------------------

type Qualquer = Record<string, unknown>;

function comMarca(base: unknown): Qualquer {
  const p = structuredClone(base) as Qualquer;
  const nacional = p.national as Qualquer | undefined;
  const candidatos = nacional?.candidatos as Qualquer[] | undefined;
  if (candidatos?.[0]) candidatos[0].nome = MARCA;
  return p;
}

beforeEach(() => {
  arquivos.clear();
  registrar("presidente.json", comMarca(baseNacional));
  registrar("governador.json", comMarca(baseGov));
  registrar("senador.json", comMarca(baseSen));
  registrar("deputado.json", { ...(structuredClone(baseDep) as Qualquer), marca: MARCA });
  const senUfSp = (structuredClone(baseSenUf) as Record<string, Qualquer>).SP ?? {};
  registrar("senador-uf.json", { SP: { ...senUfSp, uf: MARCA } });
  registrar("deputado-uf.json", { SP: { ts: "2026-10-04T22:15:00-03:00", uf: MARCA } });
  // O município precisa de `lider` e `votos_reportados`: `toMunicipioRows`
  // (`app/(pres)/uf/[sigla]/page.tsx`) lê `m.lider.candidato_id` direto, e um
  // stub magro derruba a página com TypeError — o teste passaria a provar "a
  // tela quebrou", não "o dado certo chegou".
  const municipio = {
    cod_ibge: "3550308",
    nome: MARCA_MUNICIPIO,
    lider: { candidato_id: 1 },
    votos_reportados: { 1: 1000 },
    pct_apurado: 25,
  };
  for (const turno of [1, 2]) {
    registrar(`municipios-pres-t${turno}.json`, {
      SP: { ts: "2026-10-04T22:15:00-03:00", uf: "SP", municipios: [municipio] },
    });
  }

  for (const m of [
    readNationalProjectionMock,
    readArchivedProjectionMock,
    readProjectionMock,
    readUfProjectionMock,
    readDeputadoProjectionMock,
  ]) {
    m.mockReset().mockResolvedValue(null);
  }
  readUfDetailMock
    .mockReset()
    .mockResolvedValue({ status: "unavailable", reason: "not_configured", url: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Todo caminho que pode servir dado ao leitor, num lugar só. */
async function tudoQueChegaNaTela(): Promise<string> {
  const partes: string[] = [];

  for (const url of [
    "http://x/api/projection",
    "http://x/api/projection?cargo=gov",
    "http://x/api/projection?uf=SP",
  ]) {
    partes.push(await (await getProjection(new Request(url))).text());
  }
  partes.push(
    await (await getMunicipios(new Request("http://x/api/projection/municipios?uf=SP"))).text(),
  );
  partes.push(renderToStaticMarkup(await HomePage()));

  partes.push(
    JSON.stringify([
      simulacao.simulacaoNacional("pres"),
      simulacao.simulacaoNacional("gov"),
      simulacao.simulacaoNacional("sen"),
      simulacao.simulacaoDeputadoNacional(),
      simulacao.simulacaoSenadorUf("SP"),
      simulacao.simulacaoDeputadoUf("SP"),
      simulacao.simulacaoMunicipiosUf("SP", "pres", 1),
    ]),
  );

  return partes.join("\n");
}

// ===========================================================================

describe("modo de simulação — o portão do ambiente (NODE_ENV)", () => {
  // A matriz inclui `preview` e um valor inventado de propósito: é exatamente
  // o que `!== "production"` deixaria passar, e é a mutação que estes casos
  // existem para matar.
  for (const ambiente of ["test", "production", "preview", "staging"]) {
    for (const variante of ["sim", "sim-velho"]) {
      it(`(g1) NODE_ENV=${ambiente} + FIXTURE_VARIANT=${variante}: nada da simulação chega à tela`, async () => {
        // Mutação que deve derrubá-lo: trocar `=== "development"` por
        // `!== "production"` em `varianteAtiva()`, ou remover a checagem de
        // ambiente e deixar só `FIXTURE_VARIANT`.
        vi.stubEnv("NODE_ENV", ambiente);
        vi.stubEnv("FIXTURE_VARIANT", variante);

        expect(simulacao.simulacaoLigada()).toBe(false);
        expect(await tudoQueChegaNaTela()).not.toContain(MARCA);
      });
    }
  }
});

describe("modo de simulação — o portão da variante (FIXTURE_VARIANT)", () => {
  // `t2` e `pre` são as variantes que já existiam: ligar a simulação não pode
  // sequestrá-las. Ausente é o `pnpm dev` de todo dia.
  for (const variante of [undefined, "", "t2", "pre", "SIM", "simulacao"]) {
    it(`(g2) NODE_ENV=development + FIXTURE_VARIANT=${String(variante)}: simulação desligada`, async () => {
      // Mutação que deve derrubá-lo: aceitar qualquer valor não-vazio, ou
      // comparar sem diferenciar maiúsculas (`SIM` NÃO liga o modo).
      vi.stubEnv("NODE_ENV", "development");
      if (variante === undefined) vi.stubEnv("FIXTURE_VARIANT", "");
      else vi.stubEnv("FIXTURE_VARIANT", variante);

      expect(simulacao.simulacaoLigada()).toBe(false);
      expect(simulacao.simulacaoNacional("pres")).toBeNull();
      expect(simulacao.simulacaoDeputadoNacional()).toBeNull();
      expect(simulacao.simulacaoSenadorUf("SP")).toBeNull();
      expect(simulacao.simulacaoDeputadoUf("SP")).toBeNull();
      expect(simulacao.simulacaoMunicipiosUf("SP", "pres", 1)).toBeNull();
    });
  }
});

describe("modo de simulação — o controle positivo", () => {
  /**
   * Sem este bloco os testes acima passariam com a simulação QUEBRADA — um
   * getter que devolve `null` sempre satisfaz "não vazou". É o teste que não
   * discrimina, e ele é a falha mais cara desta suíte porque parece verde.
   */
  it("(g3) NODE_ENV=development + FIXTURE_VARIANT=sim: a simulação REALMENTE chega à tela", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FIXTURE_VARIANT", "sim");

    expect(simulacao.simulacaoLigada()).toBe(true);
    expect(await tudoQueChegaNaTela()).toContain(MARCA);
  });

  it("(g4) as sete portas servem a simulação, cada uma pela sua fonte", () => {
    // Mutação que deve derrubá-lo: apontar dois cargos para o mesmo arquivo —
    // o defeito de conversor de cargo que já mandou payload de Senador para a
    // chave de Presidente neste repositório.
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FIXTURE_VARIANT", "sim");

    expect(simulacao.simulacaoNacional("pres")?.national.candidatos[0]?.nome).toBe(MARCA);
    expect(simulacao.simulacaoNacional("gov")?.national.candidatos[0]?.nome).toBe(MARCA);
    expect(simulacao.simulacaoNacional("sen")?.national.candidatos[0]?.nome).toBe(MARCA);
    expect(simulacao.simulacaoNacional("pres")?.cargo).toBe(baseNacional.cargo);
    expect(simulacao.simulacaoNacional("gov")?.cargo).toBe(baseGov.cargo);
    expect(simulacao.simulacaoNacional("sen")?.cargo).toBe(baseSen.cargo);
    expect(simulacao.simulacaoSenadorUf("SP")?.uf).toBe(MARCA);
    expect(simulacao.simulacaoDeputadoUf("SP")?.uf).toBe(MARCA);
    expect(simulacao.simulacaoMunicipiosUf("SP", "pres", 1)?.municipios[0]?.nome).toBe(
      MARCA_MUNICIPIO,
    );
  });

  it("(g5) o arquivo de municípios é endereçado por cargo E turno", () => {
    // Mutação que deve derrubá-lo: ignorar `turno` (ou `cargo`) na composição
    // do nome e servir sempre o mesmo arquivo.
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FIXTURE_VARIANT", "sim");

    expect(simulacao.simulacaoMunicipiosUf("SP", "pres", 1)).not.toBeNull();
    // `gov` não foi registrado: tem de dar `null`, não cair no de `pres`.
    expect(simulacao.simulacaoMunicipiosUf("SP", "gov", 1)).toBeNull();
  });
});

describe("modo de simulação — o relógio", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
  });

  it("(g6) `sim` reescreve `ts` para agora", () => {
    // Mutação que deve derrubá-lo: servir o payload como gravado. Depois de
    // uma hora de revisão o dono veria alarme de dado velho em toda tela.
    vi.stubEnv("FIXTURE_VARIANT", "sim");
    const antes = Date.now();
    const ts = simulacao.simulacaoNacional("pres")?.ts ?? "";
    expect(Date.parse(ts)).toBeGreaterThanOrEqual(antes - 1000);
    expect(ts).not.toBe(baseNacional.ts);
  });

  it("(g7) `sim-velho` NÃO reescreve — é a saída para ver a tarja de dado parado", () => {
    // Mutação que deve derrubá-lo: reescrever o relógio nas duas variantes,
    // o que tornaria a tarja âmbar do ADR-0038 impossível de revisar.
    vi.stubEnv("FIXTURE_VARIANT", "sim-velho");
    expect(simulacao.simulacaoNacional("pres")?.ts).toBe(baseNacional.ts);
  });

  it("(g8) `dado_ts` ausente continua AUSENTE; `null` continua `null`", () => {
    // Mutação que deve derrubá-lo: `saida.dado_ts = agora` incondicional.
    // Os três estados do ADR-0038 são distintos e mudam QUAL tela aparece:
    // criar o campo onde ele não existia trocaria o texto que o leitor vê.
    vi.stubEnv("FIXTURE_VARIANT", "sim");

    registrar("governador.json", { ...comMarca(baseGov), dado_ts: undefined });
    expect("dado_ts" in (simulacao.simulacaoNacional("gov") as object)).toBe(false);

    registrar("senador.json", { ...comMarca(baseSen), dado_ts: null });
    expect(simulacao.simulacaoNacional("sen")?.dado_ts).toBeNull();

    registrar("presidente.json", { ...comMarca(baseNacional), dado_ts: "2020-01-01T00:00:00Z" });
    const reescrito = simulacao.simulacaoNacional("pres")?.dado_ts ?? "";
    expect(Date.parse(reescrito)).toBeGreaterThan(Date.parse("2021-01-01T00:00:00Z"));
  });

  it("(g9) as séries são DESLOCADAS, não achatadas no mesmo instante", () => {
    // Mutação que deve derrubá-lo: carimbar "agora" em todo `ts` recursivamente.
    // Os `ts` de `series_temporais` são pontos no eixo x (RF-040/041/042);
    // colapsá-los transforma o gráfico numa coluna.
    vi.stubEnv("FIXTURE_VARIANT", "sim");
    registrar("presidente.json", {
      ...comMarca(baseNacional),
      ts: "2026-10-04T20:00:00-03:00",
      series_temporais: {
        margem: [
          { ts: "2026-10-04T19:00:00-03:00", margem_pp: 1 },
          { ts: "2026-10-04T20:00:00-03:00", margem_pp: 2 },
        ],
      },
    });

    const series = (simulacao.simulacaoNacional("pres") as unknown as Qualquer)
      .series_temporais as Qualquer;
    const margem = series.margem as Array<{ ts: string; margem_pp: number }>;

    // A hora de cada ponto andou...
    expect(margem[0]?.ts).not.toBe("2026-10-04T19:00:00-03:00");
    // ...mas a distância entre eles (1 h) sobreviveu, e os valores não mudaram.
    expect(Date.parse(margem[1]?.ts ?? "") - Date.parse(margem[0]?.ts ?? "")).toBe(3_600_000);
    expect(margem.map((p) => p.margem_pp)).toEqual([1, 2]);
  });
});

describe("/api/projection sem EDGE_CONFIG — o buraco pré-existente", () => {
  /**
   * `isDevWithoutEdgeConfig()` olhava SÓ a ausência de `EDGE_CONFIG`, e o nome
   * afirmava um "dev" que ela nunca verificou. Uma deployment de PRODUÇÃO sem a
   * credencial servia a fixture como apuração, com `Cache-Control` público de
   * 30 s por cima.
   */
  const NUMEROS_DA_FIXTURE = ["Candidato PT", "15.240.321"];

  it("(g10) NODE_ENV=production sem EDGE_CONFIG: 503, e nenhum número de fixture", async () => {
    // Mutação que deve derrubá-lo: voltar a função a `return !process.env.EDGE_CONFIG`.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EDGE_CONFIG", "");
    vi.stubEnv("FIXTURE_VARIANT", "");

    const res = await getProjection(new Request("http://x/api/projection"));
    const corpo = await res.text();

    expect(res.status).toBe(503);
    for (const numero of NUMEROS_DA_FIXTURE) expect(corpo).not.toContain(numero);
  });

  it("(g11) o mesmo vale para `?cargo=gov` e `?uf=SP`", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EDGE_CONFIG", "");
    vi.stubEnv("FIXTURE_VARIANT", "");

    for (const url of ["http://x/api/projection?cargo=gov", "http://x/api/projection?uf=SP"]) {
      expect((await getProjection(new Request(url))).status).toBe(503);
    }
  });

  it("(g12) /api/projection/municipios: NODE_ENV=test não serve fixture municipal", async () => {
    // Mutação que deve derrubá-lo: voltar o portão a `!== "production"`.
    // O endpoint tem `Cache-Control` público — uma preview servindo municípios
    // de fixture é apuração inventada do lado de fora.
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("FIXTURE_VARIANT", "");

    const corpo = await (
      await getMunicipios(new Request("http://x/api/projection/municipios?uf=SP"))
    ).json();

    expect(corpo.status).toBe("unavailable");
    expect(corpo.municipios).toEqual([]);
  });
});

// ===========================================================================
// Os dois defeitos vistos no navegador em 2026-09-15
// ===========================================================================

describe("simulação ligada: a fonte remota não se intromete (defeito 1)", () => {
  /**
   * Visto ao vivo: `GET /api/projection/municipios?uf=SP&cargo=pres` devolvia
   * `{"status":"ok","municipios":[]}` com 645 municípios de SP gerados no
   * disco. `readUfDetail` roda ANTES do bloco de dev e, com
   * `BLOB_READ_WRITE_TOKEN` no `.env.local`, fala com o Blob de PRODUÇÃO. Ele
   * respondia "ok, não tenho nada", a rota retornava ali, e todo o caminho da
   * simulação virava código morto.
   *
   * É a rede de segurança de mão única outra vez, numa direção que a guarda
   * anterior não cobria: `fonteDeDesenvolvimento` protegia contra misturar
   * simulação com a FIXTURE antiga, mas nada impedia a fonte REMOTA de ganhar
   * respondendo vazio. Uma resposta vazia é uma resposta.
   *
   * A regra que estes testes fixam: em modo simulação, **resultado eleitoral**
   * nunca vem de fonte remota; **identidade de candidato** (`readCandidatosUf`,
   * cadastro real do TSE, é o que faz a foto aparecer) sempre pode.
   */
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FIXTURE_VARIANT", "sim");
  });

  it("(d1) Blob responde `ok` com lista VAZIA: a rota serve os municípios da simulação", async () => {
    // Mutação que deve derrubá-lo: ler o Blob antes de consultar a simulação.
    readUfDetailMock.mockResolvedValue({
      status: "ok",
      detail: { ts: "2026-09-14T02:10:58.486Z", uf: "SP", municipios: [], series_temporais: null },
      url: "https://blob.exemplo/uf/SP.json",
    });

    const corpo = await (
      await getMunicipios(new Request("http://x/api/projection/municipios?uf=SP&cargo=pres"))
    ).json();

    expect(corpo.status).toBe("ok");
    expect(corpo.municipios).toHaveLength(1);
    expect(corpo.municipios[0].nome).toBe(MARCA_MUNICIPIO);
  });

  it("(d2) Blob responde `ok` com dado REAL: a simulação ainda ganha", async () => {
    // O caso mais forte, e o que a regra realmente diz: não é "a simulação
    // cobre o vazio", é "a simulação é a fonte de verdade". Um Blob com dado
    // de verdade ao lado de um placar simulado é a contradição de sempre.
    readUfDetailMock.mockResolvedValue({
      status: "ok",
      detail: {
        ts: "2026-09-14T02:10:58.486Z",
        uf: "SP",
        municipios: [{ nome: "MUNICIPIO-DO-BLOB-REAL" }],
        series_temporais: null,
      },
      url: "https://blob.exemplo/uf/SP.json",
    });

    const corpo = await (
      await getMunicipios(new Request("http://x/api/projection/municipios?uf=SP&cargo=pres"))
    ).json();

    expect(JSON.stringify(corpo)).not.toContain("MUNICIPIO-DO-BLOB-REAL");
    expect(corpo.municipios[0].nome).toBe(MARCA_MUNICIPIO);
  });

  it("(d3) com simulação ligada, `readUfDetail` NEM É CHAMADO", async () => {
    // Mutação que deve derrubá-lo: manter a leitura remota e só ignorar o
    // resultado. Ignorar não basta — a leitura remota custa rede, pode demorar
    // e, no caminho da página, entra num `Promise.all` que atrasa a tela.
    await getMunicipios(new Request("http://x/api/projection/municipios?uf=SP&cargo=pres"));
    expect(readUfDetailMock).not.toHaveBeenCalled();
  });

  it("(d4) simulação DESLIGADA: o Blob continua mandando, como sempre mandou", async () => {
    // O guarda de não-regressão do conserto: nada disto pode mudar o caminho
    // normal, onde o Blob é a fonte legítima.
    vi.stubEnv("FIXTURE_VARIANT", "");
    readUfDetailMock.mockResolvedValue({
      status: "ok",
      detail: {
        ts: "2026-10-04T22:15:00-03:00",
        uf: "SP",
        municipios: [{ nome: "MUNICIPIO-DO-BLOB-REAL" }],
        series_temporais: null,
      },
      url: "https://blob.exemplo/uf/SP.json",
    });

    const corpo = await (
      await getMunicipios(new Request("http://x/api/projection/municipios?uf=SP&cargo=pres"))
    ).json();

    expect(readUfDetailMock).toHaveBeenCalled();
    expect(corpo.municipios[0].nome).toBe("MUNICIPIO-DO-BLOB-REAL");
  });

  it("(d5) simulação ligada SEM arquivo municipal: indisponível, nunca o Blob", async () => {
    // A direção oposta, e ela importa: faltar arquivo não pode reabrir a porta
    // remota. Mapa mudo é revisável; mapa discordando do placar, não.
    arquivos.delete("municipios-pres-t1.json");
    arquivos.delete("municipios-pres-t2.json");
    readUfDetailMock.mockResolvedValue({
      status: "ok",
      detail: {
        ts: "2026-10-04T22:15:00-03:00",
        uf: "SP",
        municipios: [{ nome: "MUNICIPIO-DO-BLOB-REAL" }],
        series_temporais: null,
      },
      url: "https://blob.exemplo/uf/SP.json",
    });

    const corpo = await (
      await getMunicipios(new Request("http://x/api/projection/municipios?uf=SP&cargo=pres"))
    ).json();

    expect(corpo.status).toBe("unavailable");
    expect(corpo.municipios).toEqual([]);
    expect(readUfDetailMock).not.toHaveBeenCalled();
  });
});

describe("/uf/[sigla] presidencial: o estado mostra o estado (defeito 2)", () => {
  /**
   * Visto ao vivo: `/uf/SP` exibia LULA com 10.475.955 votos — exatamente o
   * número NACIONAL da home. O `pct_apurado` vinha certo (a linha de `por_uf`
   * chega), mas a votação por candidato não: sem payload presidencial por UF,
   * a página cai em `synthesizeUfFromNational`, que mapeia os 12 candidatos
   * nacionais com os votos do Brasil inteiro.
   *
   * `presidente-uf.json` (`Record<sigla, EdgePayloadUf>`) resolve, e tem de ter
   * PRIORIDADE sobre a síntese.
   */
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FIXTURE_VARIANT", "sim");
  });

  const MARCA_UF = "CANDIDATO-SO-DESTE-ESTADO";

  function registrarPresidenteUf() {
    const base = (structuredClone(baseSenUf) as Record<string, Qualquer>).SP ?? {};
    const candidatos = (base.candidatos as Qualquer[] | undefined) ?? [];
    if (candidatos[0]) candidatos[0].nome = MARCA_UF;
    registrar("presidente-uf.json", { SP: { ...base, uf: "SP", cargo: 1, turno: 1, candidatos } });
  }

  it("(d6) com `presidente-uf.json`, a tela usa o payload da UF — não a síntese do nacional", async () => {
    // Mutação que deve derrubá-lo: manter a síntese com prioridade, ou ignorar
    // o arquivo por UF. `MARCA` só existe no payload NACIONAL; vê-la aqui é a
    // assinatura exata do defeito relatado.
    registrarPresidenteUf();

    const html = renderToStaticMarkup(
      await UfPresPage({ params: Promise.resolve({ sigla: "SP" }) }),
    );

    expect(html).toContain(MARCA_UF);
    expect(html).not.toContain(MARCA);
  });

  it("(d7) SEM o arquivo, a página continua funcionando como hoje (síntese do nacional)", async () => {
    // Enquanto o outro agente não gera `presidente-uf.json`, a tela não pode
    // ficar em branco — só volta a mostrar o número nacional, que é o estado
    // conhecido de hoje.
    arquivos.delete("presidente-uf.json");

    const html = renderToStaticMarkup(
      await UfPresPage({ params: Promise.resolve({ sigla: "SP" }) }),
    );

    expect(html).toContain(MARCA);
  });

  it("(d8) simulação desligada: a rota não procura arquivo de simulação nenhum", async () => {
    vi.stubEnv("FIXTURE_VARIANT", "");
    registrarPresidenteUf();

    const html = renderToStaticMarkup(
      await UfPresPage({ params: Promise.resolve({ sigla: "SP" }) }),
    );

    expect(html).not.toContain(MARCA_UF);
    expect(html).not.toContain(MARCA);
  });
});
