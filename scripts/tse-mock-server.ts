// scripts/tse-mock-server.ts
//
// Fase 0, item 0.7 (plano "sim-monte-um-planejamento") — Mock local do CDN
// TSE (resultados.tse.jus.br), pra exercitar lib/tse/client.ts + retry.ts +
// o pipeline de ingest sem NUNCA tocar o host real do TSE em desenvolvimento.
//
// Por que existe:
//   O TSE bloqueia IP em 404 malformado e limita 100 req/s; não dá pra testar
//   contra produção. Este servidor reproduz o layout de URL REAL 2026 (ver
//   lib/tse/targets.ts — buildEA20UrlZona/Municipio/Uf/Br, buildEA14Url,
//   buildEA15Url), servindo fixtures sintéticas + o ele-c.json sintético, com
//   ETag/304 e simulação de 429 + Retry-After (pra testar lib/tse/retry.ts) e
//   de zonas/abrangências ainda-não-publicadas (404).
//
// 2026-09-05 — REESCRITA (hardening pré-simulado, 9 PDFs oficiais TSE): o
// layout anterior tinha subpasta de município, ordem `-c-z` invertida e sem
// sufixo `-u` (Divergência 1 do diagnóstico) — CORRIGIDO E CONFIRMADO CONTRA
// docs/reference/tse-2026-leiautes.md. O layout 2022 (com subpasta de
// município) agora responde 404 deliberadamente — é o comportamento CORRETO
// pós-correção, não uma regressão.
//
// Contrato:
//   GET /oficial/comum/config/ele-c.json
//     → serve tests/fixtures/tse/config/ele-c.json (200, com ETag).
//   GET /oficial/<codEleicao>/dados/<uf>/<uf><munic5>-z<zona4>-c<cargo4>-e<eleicao6>-u.json  (ZONA)
//     → mapeia (uf, zona) pra tests/fixtures/tse/<opts.fixturesDir>/presidente-<uf>-z<zona>.json.
//   GET /oficial/<codEleicao>/dados/<uf>/<uf><munic5>-c<cargo4>-e<eleicao6>-u.json  (MUNICÍPIO)
//     → mapeia (uf, munic) pra tests/fixtures/tse/2026/municipio-presidente-<uf>-<munic>.json.
//   GET /oficial/<codEleicao>/dados/<uf>/<uf>-c<cargo4>-e<eleicao6>-u.json  (UF agregado)
//     → mapeia uf pra tests/fixtures/tse/2026/uf-presidente-<uf>.json.
//   GET /oficial/<codEleicao>/dados/br/br-c<cargo4>-e<eleicao6>-u.json  (BR agregado)
//     → serve tests/fixtures/tse/2026/br-presidente.json.
//   GET /oficial/<codEleicao>/dados/br/br-e<eleicao6>-ab.json  (EA14 acompanhamento BR)
//     → serve tests/fixtures/tse/2026/acompanhamento-br.json.
//   GET /oficial/<codEleicao>/dados/<uf>/<uf>-e<eleicao6>-ab.json  (EA15 acompanhamento UF)
//     → mapeia uf pra tests/fixtures/tse/2026/acompanhamento-<uf>.json.
//   Qualquer rota sem fixture correspondente → 404 {"error":"not_found"}.
//   ETag = `"<sha256-hex-do-corpo>"`; If-None-Match igual → 304.
//   Qualquer outro path (incluindo o layout 2022 com subpasta de município) → 404.
//
// Flags CLI:
//   --port N              (default 8787)
//   --fixtures <dir>      (default tests/fixtures/tse/2022) — usado para o
//                          nível ZONA. Níveis uf/br/município/acompanhamento
//                          são sempre lidos de tests/fixtures/tse/2026/
//                          (fixo — não dependem desta flag).
//   --cod-eleicao <cod>   (default ele2022/544) — documentação apenas; o
//                          matching de fixture é feito por (uf, zona/nível),
//                          então qualquer codEleicao no path funciona.
//   --rate-limit-after N  (default: desligado — Infinity internamente). Após
//                          N requisições TOTAIS (qualquer rota), as
//                          próximas 5 respondem 429 + Retry-After: 1, depois
//                          volta ao normal. N=0 → já a 1ª requisição cai no
//                          bloco de 429.
//   --not-found-ratio F   (default 0.0). Fração determinística de zonas
//                          COM fixture que respondem 404 mesmo assim (hash
//                          estável da URL — não é aleatório por request, pra
//                          não quebrar o teste de ETag/304 na mesma zona).
//   --latency-ms N        (default 0). Atraso artificial antes de responder.
//
// Uso:
//   pnpm tsx scripts/tse-mock-server.ts --port 8787
//   curl http://localhost:8787/oficial/comum/config/ele-c.json
//   curl http://localhost:8787/oficial/ele2022/544/dados/sp/sp71072-z0001-c0001-e000544-u.json
//   curl http://localhost:8787/oficial/ele2022/544/dados/sp/sp-c0001-e000544-u.json
//   curl http://localhost:8787/oficial/ele2022/544/dados/br/br-c0001-e000544-u.json
//
// Encerra com SIGINT (Ctrl+C) — imprime contagem de requisições por status.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Paths / defaults
// ---------------------------------------------------------------------------

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");

const DEFAULT_PORT = 8787;
const DEFAULT_FIXTURES_DIR = resolve(REPO_ROOT, "tests/fixtures/tse/2022");
const DEFAULT_COD_ELEICAO = "ele2022/544";
const ELE_C_FIXTURE_PATH = resolve(REPO_ROOT, "tests/fixtures/tse/config/ele-c.json");

/** Fixtures de nível uf/br/município/acompanhamento — sempre lidas daqui,
 *  independente de `--fixtures` (que só afeta o nível zona). */
const FIXTURES_2026_DIR = resolve(REPO_ROOT, "tests/fixtures/tse/2026");

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

export interface MockServerOptions {
  port: number;
  fixturesDir: string;
  codEleicao: string;
  rateLimitAfter: number;
  notFoundRatio: number;
  latencyMs: number;
  /** Silencia o log por-requisição (usado pelos testes). */
  quiet?: boolean;
}

function parseArgs(argv: string[]): MockServerOptions {
  const opts: MockServerOptions = {
    port: DEFAULT_PORT,
    fixturesDir: DEFAULT_FIXTURES_DIR,
    codEleicao: DEFAULT_COD_ELEICAO,
    rateLimitAfter: Number.POSITIVE_INFINITY,
    notFoundRatio: 0,
    latencyMs: 0,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--port":
        opts.port = Number(argv[++i]);
        break;
      case "--fixtures":
        opts.fixturesDir = resolve(process.cwd(), String(argv[++i]));
        break;
      case "--cod-eleicao":
        opts.codEleicao = String(argv[++i]);
        break;
      case "--rate-limit-after":
        opts.rateLimitAfter = Number(argv[++i]);
        break;
      case "--not-found-ratio":
        opts.notFoundRatio = Number(argv[++i]);
        break;
      case "--latency-ms":
        opts.latencyMs = Number(argv[++i]);
        break;
      default:
        console.warn(`[tse-mock-server] flag desconhecida ignorada: ${arg}`);
    }
  }

  return opts;
}

// ---------------------------------------------------------------------------
// URL matching — espelha lib/tse/targets.ts (layout 2026: pasta folha
// "dados/<uf|br>/", sufixo "-u", ordem "-z-c-e")
// ---------------------------------------------------------------------------

const ELE_C_PATH = "/oficial/comum/config/ele-c.json";

// Ex.: /oficial/ele2026/619/dados/sp/sp71072-z0001-c0001-e000619-u.json
// Captura: (1) codEleicao, (2) uf, (3) município (5 díg.), (4) zona, (5) cargo, (6) eleicao.
const EA20_ZONA_RE =
  /^\/oficial\/(.+?)\/dados\/([a-z]{2})\/[a-z]{2}(\d{5})-z(\d{4})-c(\d{4})-e(\d{6})-u\.json$/;

// Ex.: /oficial/ele2026/619/dados/sp/sp71072-c0001-e000619-u.json
const EA20_MUNICIPIO_RE =
  /^\/oficial\/(.+?)\/dados\/([a-z]{2})\/[a-z]{2}(\d{5})-c(\d{4})-e(\d{6})-u\.json$/;

// Ex.: /oficial/ele2026/619/dados/sp/sp-c0001-e000619-u.json — \2 garante que
// o uf do nome do arquivo bate com o uf da pasta.
const EA20_UF_RE = /^\/oficial\/(.+?)\/dados\/([a-z]{2})\/\2-c(\d{4})-e(\d{6})-u\.json$/;

// Ex.: /oficial/ele2026/619/dados/br/br-c0001-e000619-u.json
const EA20_BR_RE = /^\/oficial\/(.+?)\/dados\/br\/br-c(\d{4})-e(\d{6})-u\.json$/;

// Ex.: /oficial/ele2026/619/dados/br/br-e000619-ab.json (EA14 — sem cargo)
const EA14_RE = /^\/oficial\/(.+?)\/dados\/br\/br-e(\d{6})-ab\.json$/;

// Ex.: /oficial/ele2026/619/dados/sp/sp-e000619-ab.json (EA15 — sem cargo)
const EA15_RE = /^\/oficial\/(.+?)\/dados\/([a-z]{2})\/\2-e(\d{6})-ab\.json$/;

interface Ea20ZonaMatch {
  codEleicao: string;
  uf: string;
  municipio: string;
  zona: string;
  cargo: string;
  eleicao: string;
}

function matchEa20ZonaPath(pathname: string): Ea20ZonaMatch | null {
  const m = EA20_ZONA_RE.exec(pathname);
  if (!m) return null;
  const [, codEleicao, uf, municipio, zona, cargo, eleicao] = m;
  if (!codEleicao || !uf || !municipio || !zona || !cargo || !eleicao) return null;
  return { codEleicao, uf, municipio, zona, cargo, eleicao };
}

interface Ea20MunicipioMatch {
  uf: string;
  municipio: string;
}

function matchEa20MunicipioPath(pathname: string): Ea20MunicipioMatch | null {
  const m = EA20_MUNICIPIO_RE.exec(pathname);
  if (!m) return null;
  const [, , uf, municipio] = m;
  if (!uf || !municipio) return null;
  return { uf, municipio };
}

function matchEa20UfPath(pathname: string): { uf: string } | null {
  const m = EA20_UF_RE.exec(pathname);
  if (!m) return null;
  const uf = m[2];
  if (!uf) return null;
  return { uf };
}

function matchEa20BrPath(pathname: string): boolean {
  return EA20_BR_RE.test(pathname);
}

function matchEa14Path(pathname: string): boolean {
  return EA14_RE.test(pathname);
}

function matchEa15Path(pathname: string): { uf: string } | null {
  const m = EA15_RE.exec(pathname);
  if (!m) return null;
  const uf = m[2];
  if (!uf) return null;
  return { uf };
}

/** Hash estável [0,1) de uma string — usado pro --not-found-ratio determinístico. */
function stableUnitHash(input: string): number {
  const digest = createHash("sha256").update(input).digest();
  // Usa os 4 primeiros bytes como inteiro sem sinal / 2^32.
  const n = digest.readUInt32BE(0);
  return n / 0xffffffff;
}

// ---------------------------------------------------------------------------
// Request counters
// ---------------------------------------------------------------------------

interface Counters {
  total: number;
  byStatus: Record<number, number>;
}

function makeCounters(): Counters {
  return { total: 0, byStatus: {} };
}

function recordStatus(counters: Counters, status: number): void {
  counters.total += 1;
  counters.byStatus[status] = (counters.byStatus[status] ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    ...extraHeaders,
  });
  res.end(text);
}

function sendRawJsonFile(
  res: ServerResponse,
  status: number,
  fileText: string,
  extraHeaders?: Record<string, string>,
): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(fileText),
    ...extraHeaders,
  });
  res.end(fileText);
}

// ---------------------------------------------------------------------------
// Handler factory (usado tanto pelo main() quanto por startMockServer())
// ---------------------------------------------------------------------------

function buildRequestHandler(opts: MockServerOptions, counters: Counters) {
  // Cache leve dos arquivos de fixture já lidos (path -> texto bruto).
  const fileCache = new Map<string, string>();

  function readFixtureFile(absPath: string): string | null {
    const cached = fileCache.get(absPath);
    if (cached !== undefined) return cached;
    if (!existsSync(absPath)) return null;
    const text = readFileSync(absPath, "utf8");
    fileCache.set(absPath, text);
    return text;
  }

  return async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", `http://localhost:${opts.port}`);
    const pathname = url.pathname;

    if (opts.latencyMs > 0) {
      await sleep(opts.latencyMs);
    }

    // ------------------------------------------------------------------
    // Rate limiting global — após N requisições, 5 respondem 429.
    // rateLimitAfter default é Infinity (desligado): a condição abaixo
    // nunca é satisfeita nesse caso. N=0 é um valor válido e ativo (já a
    // 1ª requisição cai na janela de 429).
    // ------------------------------------------------------------------
    const requestIndex = counters.total + 1; // 1-based, contando esta req.
    if (requestIndex > opts.rateLimitAfter && requestIndex <= opts.rateLimitAfter + 5) {
      recordStatus(counters, 429);
      sendJson(res, 429, { error: "rate_limited" }, { "Retry-After": "1" });
      logLine(opts, method, pathname, 429);
      return;
    }

    // ------------------------------------------------------------------
    // GET /oficial/comum/config/ele-c.json
    // ------------------------------------------------------------------
    if (method === "GET" && pathname === ELE_C_PATH) {
      const text = readFixtureFile(ELE_C_FIXTURE_PATH);
      if (text === null) {
        recordStatus(counters, 500);
        sendJson(res, 500, { error: "fixture_missing", path: ELE_C_FIXTURE_PATH });
        logLine(opts, method, pathname, 500);
        return;
      }
      serveWithEtag(req, res, text, opts, counters, method, pathname);
      return;
    }

    // Helper compartilhado: lê `fixturePath`, aplica --not-found-ratio
    // (fração determinística que simula abrangência ainda sem dados
    // publicados mesmo tendo fixture), e serve com ETag/304. 404 se a
    // fixture não existir no disco.
    function serveFixtureOr404(fixturePath: string): void {
      const text = readFixtureFile(fixturePath);

      if (text === null) {
        recordStatus(counters, 404);
        sendJson(res, 404, { error: "not_found" });
        logLine(opts, method, pathname, 404);
        return;
      }

      if (opts.notFoundRatio > 0 && stableUnitHash(pathname) < opts.notFoundRatio) {
        recordStatus(counters, 404);
        sendJson(res, 404, { error: "not_found" });
        logLine(opts, method, pathname, 404);
        return;
      }

      serveWithEtag(req, res, text, opts, counters, method, pathname);
    }

    if (method === "GET") {
      // ------------------------------------------------------------------
      // GET EA20 zona — /oficial/<cod>/dados/<uf>/<uf><munic5>-z<zona4>-c<cargo4>-e<eleicao6>-u.json
      // ------------------------------------------------------------------
      const zonaMatch = matchEa20ZonaPath(pathname);
      if (zonaMatch) {
        serveFixtureOr404(
          resolve(opts.fixturesDir, `presidente-${zonaMatch.uf}-z${zonaMatch.zona}.json`),
        );
        return;
      }

      // ------------------------------------------------------------------
      // GET EA20 município — /oficial/<cod>/dados/<uf>/<uf><munic5>-c<cargo4>-e<eleicao6>-u.json
      // ------------------------------------------------------------------
      const municipioMatch = matchEa20MunicipioPath(pathname);
      if (municipioMatch) {
        serveFixtureOr404(
          resolve(
            FIXTURES_2026_DIR,
            `municipio-presidente-${municipioMatch.uf}-${municipioMatch.municipio}.json`,
          ),
        );
        return;
      }

      // ------------------------------------------------------------------
      // GET EA20 UF agregado — /oficial/<cod>/dados/<uf>/<uf>-c<cargo4>-e<eleicao6>-u.json
      // ------------------------------------------------------------------
      const ufMatch = matchEa20UfPath(pathname);
      if (ufMatch) {
        serveFixtureOr404(resolve(FIXTURES_2026_DIR, `uf-presidente-${ufMatch.uf}.json`));
        return;
      }

      // ------------------------------------------------------------------
      // GET EA20 Brasil agregado — /oficial/<cod>/dados/br/br-c<cargo4>-e<eleicao6>-u.json
      // ------------------------------------------------------------------
      if (matchEa20BrPath(pathname)) {
        serveFixtureOr404(resolve(FIXTURES_2026_DIR, "br-presidente.json"));
        return;
      }

      // ------------------------------------------------------------------
      // GET EA14 acompanhamento Brasil — /oficial/<cod>/dados/br/br-e<eleicao6>-ab.json
      // ------------------------------------------------------------------
      if (matchEa14Path(pathname)) {
        serveFixtureOr404(resolve(FIXTURES_2026_DIR, "acompanhamento-br.json"));
        return;
      }

      // ------------------------------------------------------------------
      // GET EA15 acompanhamento UF — /oficial/<cod>/dados/<uf>/<uf>-e<eleicao6>-ab.json
      // ------------------------------------------------------------------
      const ea15Match = matchEa15Path(pathname);
      if (ea15Match) {
        serveFixtureOr404(resolve(FIXTURES_2026_DIR, `acompanhamento-${ea15Match.uf}.json`));
        return;
      }
    }

    // ------------------------------------------------------------------
    // Fallback — qualquer outro path/método (inclui o layout 2022 com
    // subpasta de município, que agora responde 404 corretamente — ver
    // header do arquivo).
    // ------------------------------------------------------------------
    recordStatus(counters, 404);
    sendJson(res, 404, { error: "not_found" });
    logLine(opts, method, pathname, 404);
  };
}

/** Serve `text` com ETag sha256 + suporte a If-None-Match → 304. */
function serveWithEtag(
  req: IncomingMessage,
  res: ServerResponse,
  text: string,
  opts: MockServerOptions,
  counters: Counters,
  method: string,
  pathname: string,
): void {
  const hash = createHash("sha256").update(text, "utf8").digest("hex");
  const etag = `"${hash}"`;

  const ifNoneMatch = req.headers["if-none-match"];
  if (typeof ifNoneMatch === "string" && ifNoneMatch === etag) {
    recordStatus(counters, 304);
    res.writeHead(304, { ETag: etag });
    res.end();
    logLine(opts, method, pathname, 304);
    return;
  }

  recordStatus(counters, 200);
  sendRawJsonFile(res, 200, text, { ETag: etag });
  logLine(opts, method, pathname, 200);
}

function logLine(opts: MockServerOptions, method: string, pathname: string, status: number): void {
  if (opts.quiet) return;
  console.log(`[tse-mock-server] ${method} ${pathname} -> ${status}`);
}

// ---------------------------------------------------------------------------
// startMockServer — usado pelo main() e pelos testes de integração
// ---------------------------------------------------------------------------

export interface StartedMockServer {
  port: number;
  server: Server;
  counters: Counters;
  close: () => Promise<void>;
}

export async function startMockServer(
  partialOpts: Partial<MockServerOptions> = {},
): Promise<StartedMockServer> {
  const opts: MockServerOptions = {
    port: 0, // 0 = porta efêmera atribuída pelo SO
    fixturesDir: DEFAULT_FIXTURES_DIR,
    codEleicao: DEFAULT_COD_ELEICAO,
    rateLimitAfter: Number.POSITIVE_INFINITY,
    notFoundRatio: 0,
    latencyMs: 0,
    quiet: true,
    ...partialOpts,
  };

  const counters = makeCounters();
  const handler = buildRequestHandler(opts, counters);

  const server = createServer((req, res) => {
    void handler(req, res);
  });

  await new Promise<void>((res, rej) => {
    server.once("error", rej);
    server.listen(opts.port, "127.0.0.1", () => res());
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address !== null ? address.port : opts.port;

  return {
    port: actualPort,
    server,
    counters,
    close: () =>
      new Promise<void>((res, rej) => {
        server.close((err) => (err ? rej(err) : res()));
      }),
  };
}

// ---------------------------------------------------------------------------
// Main — CLI entrypoint
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  if (!existsSync(opts.fixturesDir)) {
    console.error(`[tse-mock-server] diretório de fixtures não existe: ${opts.fixturesDir}`);
    process.exit(1);
  }
  if (!existsSync(ELE_C_FIXTURE_PATH)) {
    console.error(`[tse-mock-server] fixture ele-c.json não existe: ${ELE_C_FIXTURE_PATH}`);
    process.exit(1);
  }

  const started = await startMockServer({ ...opts, quiet: false });

  console.log(
    `[tse-mock-server] ouvindo em http://127.0.0.1:${started.port} ` +
      `(fixtures: ${opts.fixturesDir}, codEleicao: ${opts.codEleicao}, ` +
      `rate-limit-after: ${opts.rateLimitAfter}, not-found-ratio: ${opts.notFoundRatio}, ` +
      `latency-ms: ${opts.latencyMs})`,
  );
  console.log("[tse-mock-server] Ctrl+C para encerrar.");

  process.on("SIGINT", () => {
    console.log("\n[tse-mock-server] encerrando...");
    console.log(
      `[tse-mock-server] total: ${started.counters.total} | por status: ${JSON.stringify(
        started.counters.byStatus,
      )}`,
    );
    void started.close().then(() => process.exit(0));
  });
}

// Só roda main() quando executado diretamente via `tsx scripts/tse-mock-server.ts`,
// não quando importado por testes (`import { startMockServer } from "./tse-mock-server"`).
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  main().catch((err) => {
    console.error("[tse-mock-server] falha:", err);
    process.exit(1);
  });
}
