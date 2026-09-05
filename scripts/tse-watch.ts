// scripts/tse-watch.ts
//
// Fase 0, item 0.8 (plano "sim-monte-um-planejamento") — Monitor de mudanças
// nas fontes públicas do TSE: `ele-c.json` (config de eleições/ciclo, no CDN
// resultados.tse.jus.br) e as páginas técnicas dos 9 leiautes de divulgação
// (www.tse.jus.br, listadas em scripts/tse-watch.targets.json).
//
// Por que existe:
//   `resultados.tse.jus.br/oficial/comum/config/ele-c.json` ainda está em
//   `ele2024` (05/09/2026) — os códigos de eleição 2026 não existem. Esse
//   script roda periodicamente (ou --once, manual) pra detectar o momento em
//   que o TSE publica a Eleição Geral 2026 (ou muda um leiaute), sem exigir
//   que um humano fique conferindo manualmente. NUNCA sonda URLs adivinhadas
//   — só os 9 alvos publicados na página técnica do TSE (preenchimento
//   humano em scripts/tse-watch.targets.json).
//
// Uso:
//   pnpm tse:watch --once
//   pnpm tse:watch --once --base-url https://resultados-sim.tse.jus.br/oficial
//   pnpm tse:watch --interval 300 --slack
//   pnpm tse:watch --once --base-url http://localhost:8787/oficial \
//                  --targets /tmp/targets-mock.json --state /tmp/state.json
//
// Contrato:
//   1. GET `${baseUrl}/comum/config/ele-c.json` — hash sha256 do corpo, ETag,
//      Last-Modified; extrai resumo `{ ciclo (campo "c"), dg, hg, eleicoes[] }`
//      onde eleicoes[] = pl[].e[] achatado como { cd, t, nm }.
//   2. HEAD em cada URL de scripts/tse-watch.targets.json — ETag,
//      Last-Modified, Content-Length. Host www.tse.jus.br responde 403 a
//      clientes não-navegador: tratado como "inacessivel" (logado, NÃO conta
//      como mudança).
//   3. Compara com o estado anterior (--state, JSON). Imprime diff legível.
//      Eleição nova com t=1|2 e nome contendo "2026" é destacada em
//      MAIÚSCULAS ("ELEIÇÃO GERAL 2026 DETECTADA") — sinal de ativação da
//      Eleição Geral.
//   4. Exit code: 0 sem mudança, 2 com mudança, 1 erro de execução.
//      --slack envia o diff via lib/tse/alerts.ts (fire-and-forget).
//
// Entre requisições: `await sleep(250)` fixo (≤ 10 requisições no total —
// 1 GET + 9 HEAD — não precisa do rate limiter do pipeline de ingest).
// User-Agent honesto: "SalaCofre-watch/1.0" (RF-010 / conformidade — nenhuma
// alegação de cadastro).

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { notifySlack, type SlackAlertPayload } from "../lib/tse/alerts";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");

const DEFAULT_BASE_URL = "https://resultados.tse.jus.br/oficial";
const DEFAULT_TARGETS_PATH = resolve(REPO_ROOT, "scripts/tse-watch.targets.json");
const DEFAULT_STATE_PATH = resolve(REPO_ROOT, "build/tse-watch/state.json");
const DEFAULT_INTERVAL_SEC = 300;

const USER_AGENT = "SalaCofre-watch/1.0";
const FETCH_TIMEOUT_MS = 8_000;
const SLEEP_BETWEEN_REQUESTS_MS = 250;

/** Regex simples pra reconhecer "2026" em nomes de eleição (case-insensitive
 *  não é necessário — o campo `nm` do TSE já vem em maiúsculas/mistas, mas
 *  comparamos de forma tolerante). */
const ELEICAO_GERAL_ANO = "2026";

// ---------------------------------------------------------------------------
// Tipos — alvos (scripts/tse-watch.targets.json)
// ---------------------------------------------------------------------------

export interface WatchTarget {
  id: string;
  url: string;
}

export interface WatchTargetsFile {
  leiautes: WatchTarget[];
}

// ---------------------------------------------------------------------------
// Tipos — estado persistido
// ---------------------------------------------------------------------------

export interface EleicaoSummary {
  cd: string;
  t: string;
  nm: string;
}

export interface EleCConfigSnapshot {
  sha256: string;
  etag: string | null;
  lastModified: string | null;
  ciclo: string | null;
  dg: string | null;
  hg: string | null;
  eleicoes: EleicaoSummary[];
}

export type LeiauteStatus = "ok" | "inacessivel" | "erro";

export interface LeiauteSnapshot {
  id: string;
  url: string;
  status: LeiauteStatus;
  etag: string | null;
  lastModified: string | null;
  contentLength: string | null;
}

export interface WatchState {
  updatedAt: string;
  eleC: EleCConfigSnapshot | null;
  leiautes: Record<string, LeiauteSnapshot>;
}

// ---------------------------------------------------------------------------
// Tipos — runWatch (função pura, testável)
// ---------------------------------------------------------------------------

export interface RunWatchOptions {
  /** Injeção de fetch — permite stub em teste. Default: global fetch. */
  fetchImpl?: typeof fetch;
  /** Injeção de relógio — usado só pro campo `updatedAt`. Default: () => new Date(). */
  now?: () => Date;
  /** Injeção de sleep — testes usam no-op pra não esperar 250ms × 9. */
  sleepImpl?: (ms: number) => Promise<void>;
  /** Caminho do arquivo de estado (lido e sobrescrito). */
  statePath: string;
  /** Alvos dos 9 leiautes (já carregados — main() lê de disco). */
  targets: WatchTargetsFile;
  /** Base URL do CDN pra ele-c.json (prod, sim, ou mock local). */
  baseUrl: string;
  /** Se true, envia o diff via notifySlack quando houver mudança. */
  slack?: boolean;
  /** Injeção de notifySlack — testes podem espiar sem rede real. */
  notifySlackImpl?: (payload: SlackAlertPayload) => Promise<void>;
  /** Permite ler o estado anterior já carregado (testes) em vez de reler disco. */
  previousState?: WatchState | null;
}

export interface RunWatchResult {
  changed: boolean;
  exitCode: 0 | 1 | 2;
  diffLines: string[];
  state: WatchState;
}

// ---------------------------------------------------------------------------
// ele-c.json — fetch + parse tolerante
// ---------------------------------------------------------------------------

function extractEleicoes(parsed: unknown): EleicaoSummary[] {
  const out: EleicaoSummary[] = [];
  if (typeof parsed !== "object" || parsed === null) return out;
  const pl = (parsed as Record<string, unknown>).pl;
  if (!Array.isArray(pl)) return out;

  for (const pleito of pl) {
    if (typeof pleito !== "object" || pleito === null) continue;
    const eList = (pleito as Record<string, unknown>).e;
    if (!Array.isArray(eList)) continue;
    for (const eleicao of eList) {
      if (typeof eleicao !== "object" || eleicao === null) continue;
      const rec = eleicao as Record<string, unknown>;
      out.push({
        cd: String(rec.cd ?? ""),
        t: String(rec.t ?? ""),
        nm: String(rec.nm ?? ""),
      });
    }
  }
  return out;
}

async function fetchEleC(
  baseUrl: string,
  fetchImpl: typeof fetch,
): Promise<{ snapshot: EleCConfigSnapshot } | { error: string }> {
  const url = `${baseUrl}/comum/config/ele-c.json`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "GET",
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `falha de rede em GET ${url}: ${msg}` };
  }

  if (!res.ok) {
    return { error: `GET ${url} respondeu ${res.status}` };
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `JSON.parse falhou em ${url}: ${msg}` };
  }

  const sha256 = createHash("sha256").update(text, "utf8").digest("hex");
  const rec =
    typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};

  const snapshot: EleCConfigSnapshot = {
    sha256,
    etag: res.headers.get("etag"),
    lastModified: res.headers.get("last-modified"),
    ciclo: typeof rec.c === "string" ? rec.c : null,
    dg: typeof rec.dg === "string" ? rec.dg : null,
    hg: typeof rec.hg === "string" ? rec.hg : null,
    eleicoes: extractEleicoes(parsed),
  };

  return { snapshot };
}

// ---------------------------------------------------------------------------
// Leiautes — HEAD por alvo
// ---------------------------------------------------------------------------

async function headLeiaute(target: WatchTarget, fetchImpl: typeof fetch): Promise<LeiauteSnapshot> {
  try {
    const res = await fetchImpl(target.url, {
      method: "HEAD",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (res.status === 403) {
      return {
        id: target.id,
        url: target.url,
        status: "inacessivel",
        etag: null,
        lastModified: null,
        contentLength: null,
      };
    }

    if (!res.ok) {
      return {
        id: target.id,
        url: target.url,
        status: "erro",
        etag: null,
        lastModified: null,
        contentLength: null,
      };
    }

    return {
      id: target.id,
      url: target.url,
      status: "ok",
      etag: res.headers.get("etag"),
      lastModified: res.headers.get("last-modified"),
      contentLength: res.headers.get("content-length"),
    };
  } catch {
    // Network failure (timeout, DNS, etc.) — não aborta o watch inteiro;
    // este leiaute fica marcado como "erro" e o run segue pros próximos.
    return {
      id: target.id,
      url: target.url,
      status: "erro",
      etag: null,
      lastModified: null,
      contentLength: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Diff — compara estado anterior × atual, gera linhas legíveis
// ---------------------------------------------------------------------------

function diffEleC(
  prev: EleCConfigSnapshot | null,
  cur: EleCConfigSnapshot,
): { changed: boolean; lines: string[] } {
  const lines: string[] = [];
  let changed = false;

  if (prev === null) {
    lines.push(
      `[ele-c.json] estado inicial: ciclo=${cur.ciclo ?? "?"} dg=${cur.dg ?? "?"} hg=${
        cur.hg ?? "?"
      } (${cur.eleicoes.length} eleições)`,
    );
    return { changed: false, lines };
  }

  if (prev.sha256 !== cur.sha256) {
    changed = true;
    lines.push(
      `[ele-c.json] MUDOU (hash ${prev.sha256.slice(0, 12)}… -> ${cur.sha256.slice(0, 12)}…)`,
    );
    if (prev.ciclo !== cur.ciclo) {
      lines.push(`[ele-c.json] ciclo: "${prev.ciclo}" -> "${cur.ciclo}"`);
    }
  } else {
    lines.push("[ele-c.json] sem mudança (hash idêntico)");
  }

  const prevIds = new Set(prev.eleicoes.map((e) => e.cd));
  const curIds = new Set(cur.eleicoes.map((e) => e.cd));

  const added = cur.eleicoes.filter((e) => !prevIds.has(e.cd));
  const removed = prev.eleicoes.filter((e) => !curIds.has(e.cd));

  for (const e of added) {
    changed = true;
    const isGeral2026 = (e.t === "1" || e.t === "2") && e.nm.includes(ELEICAO_GERAL_ANO);
    if (isGeral2026) {
      lines.push(
        `[ele-c.json] + ELEIÇÃO GERAL ${ELEICAO_GERAL_ANO} DETECTADA: cd=${e.cd} t=${e.t} nm="${e.nm}"`,
      );
    } else {
      lines.push(`[ele-c.json] + eleição adicionada: cd=${e.cd} t=${e.t} nm="${e.nm}"`);
    }
  }
  for (const e of removed) {
    changed = true;
    lines.push(`[ele-c.json] - eleição removida: cd=${e.cd} t=${e.t} nm="${e.nm}"`);
  }

  return { changed, lines };
}

function diffLeiaute(
  prev: LeiauteSnapshot | undefined,
  cur: LeiauteSnapshot,
): {
  changed: boolean;
  lines: string[];
} {
  const lines: string[] = [];

  if (cur.status === "inacessivel") {
    lines.push(`[${cur.id}] inacessivel (403 — host bloqueia clientes não-navegador)`);
    return { changed: false, lines };
  }
  if (cur.status === "erro") {
    lines.push(`[${cur.id}] erro ao consultar (rede ou status inesperado)`);
    return { changed: false, lines };
  }

  if (prev === undefined) {
    lines.push(
      `[${cur.id}] estado inicial: etag=${cur.etag ?? "?"} last-modified=${cur.lastModified ?? "?"}`,
    );
    return { changed: false, lines };
  }

  if (prev.status !== "ok") {
    // Estava inacessível/erro antes e agora respondeu — informativo, não é
    // "mudança de conteúdo" propriamente (não temos baseline pra comparar).
    lines.push(`[${cur.id}] voltou a responder (estava "${prev.status}"): etag=${cur.etag ?? "?"}`);
    return { changed: false, lines };
  }

  const fields: Array<[string, string | null, string | null]> = [
    ["etag", prev.etag, cur.etag],
    ["last-modified", prev.lastModified, cur.lastModified],
    ["content-length", prev.contentLength, cur.contentLength],
  ];

  let changed = false;
  for (const [label, oldV, newV] of fields) {
    if (oldV !== newV) {
      changed = true;
      lines.push(`[${cur.id}] ${label}: "${oldV ?? "?"}" -> "${newV ?? "?"}"`);
    }
  }
  if (!changed) {
    lines.push(`[${cur.id}] sem mudança`);
  }

  return { changed, lines };
}

// ---------------------------------------------------------------------------
// runWatch — função pura (sem process.exit, sem console.log direto)
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runWatch(opts: RunWatchOptions): Promise<RunWatchResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => new Date());
  const sleepImpl = opts.sleepImpl ?? sleep;

  // -------------------------------------------------------------------
  // Carrega estado anterior
  // -------------------------------------------------------------------
  let previousState: WatchState | null = opts.previousState ?? null;
  if (opts.previousState === undefined && existsSync(opts.statePath)) {
    try {
      const raw = await readFile(opts.statePath, "utf8");
      previousState = JSON.parse(raw) as WatchState;
    } catch {
      previousState = null; // estado corrompido — trata como primeira execução
    }
  }

  const diffLines: string[] = [];
  let anyChanged = false;

  // -------------------------------------------------------------------
  // 1. ele-c.json
  // -------------------------------------------------------------------
  const eleCResult = await fetchEleC(opts.baseUrl, fetchImpl);
  if ("error" in eleCResult) {
    const state: WatchState = previousState ?? {
      updatedAt: now().toISOString(),
      eleC: null,
      leiautes: {},
    };
    return {
      changed: false,
      exitCode: 1,
      diffLines: [`ERRO: ${eleCResult.error}`],
      state,
    };
  }

  const eleCDiff = diffEleC(previousState?.eleC ?? null, eleCResult.snapshot);
  diffLines.push(...eleCDiff.lines);
  anyChanged = anyChanged || eleCDiff.changed;

  await sleepImpl(SLEEP_BETWEEN_REQUESTS_MS);

  // -------------------------------------------------------------------
  // 2. Leiautes (HEAD sequencial, sleep fixo entre requisições)
  // -------------------------------------------------------------------
  const leiauteSnapshots: Record<string, LeiauteSnapshot> = {};
  for (let i = 0; i < opts.targets.leiautes.length; i++) {
    const target = opts.targets.leiautes[i];
    if (!target) continue;

    const snapshot = await headLeiaute(target, fetchImpl);
    leiauteSnapshots[target.id] = snapshot;

    const prevSnapshot = previousState?.leiautes[target.id];
    const leiauteDiff = diffLeiaute(prevSnapshot, snapshot);
    diffLines.push(...leiauteDiff.lines);
    anyChanged = anyChanged || leiauteDiff.changed;

    if (i < opts.targets.leiautes.length - 1) {
      await sleepImpl(SLEEP_BETWEEN_REQUESTS_MS);
    }
  }

  const state: WatchState = {
    updatedAt: now().toISOString(),
    eleC: eleCResult.snapshot,
    leiautes: leiauteSnapshots,
  };

  // -------------------------------------------------------------------
  // Persiste estado (se não estivermos em modo "previousState injetado
  // sem statePath real" — testes passam um statePath de arquivo temporário
  // real, então sempre gravamos).
  // -------------------------------------------------------------------
  await mkdir(dirname(opts.statePath), { recursive: true });
  await writeFile(opts.statePath, JSON.stringify(state, null, 2), "utf8");

  // -------------------------------------------------------------------
  // Slack (fire-and-forget, só se --slack e houve mudança)
  // -------------------------------------------------------------------
  if (opts.slack && anyChanged) {
    const notify = opts.notifySlackImpl ?? notifySlack;
    void notify({
      severity: "warn",
      msg: "tse-watch detectou mudança nas fontes públicas do TSE",
      ctx: { diff: diffLines },
    });
  }

  return {
    changed: anyChanged,
    exitCode: anyChanged ? 2 : 0,
    diffLines,
    state,
  };
}

// ---------------------------------------------------------------------------
// CLI — parsing de argv + main()
// ---------------------------------------------------------------------------

interface CliArgs {
  once: boolean;
  intervalSec: number;
  baseUrl: string;
  targetsPath: string;
  statePath: string;
  slack: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    once: false,
    intervalSec: DEFAULT_INTERVAL_SEC,
    baseUrl: DEFAULT_BASE_URL,
    targetsPath: DEFAULT_TARGETS_PATH,
    statePath: DEFAULT_STATE_PATH,
    slack: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--once":
        args.once = true;
        break;
      case "--interval":
        args.intervalSec = Number(argv[++i]);
        break;
      case "--base-url":
        args.baseUrl = String(argv[++i]);
        break;
      case "--targets":
        args.targetsPath = resolve(process.cwd(), String(argv[++i]));
        break;
      case "--state":
        args.statePath = resolve(process.cwd(), String(argv[++i]));
        break;
      case "--slack":
        args.slack = true;
        break;
      default:
        console.warn(`[tse-watch] flag desconhecida ignorada: ${a}`);
    }
  }

  return args;
}

async function loadTargets(path: string): Promise<WatchTargetsFile> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as WatchTargetsFile;
  if (!Array.isArray(parsed.leiautes)) {
    throw new Error(`[tse-watch] ${path} não tem array "leiautes"`);
  }
  return parsed;
}

async function runOnce(args: CliArgs): Promise<number> {
  const targets = await loadTargets(args.targetsPath);
  const result = await runWatch({
    statePath: args.statePath,
    targets,
    baseUrl: args.baseUrl,
    slack: args.slack,
  });

  console.log(`[tse-watch] ${new Date().toISOString()} — base: ${args.baseUrl}`);
  for (const line of result.diffLines) {
    console.log(`  ${line}`);
  }
  console.log(
    `[tse-watch] changed=${result.changed} exitCode=${result.exitCode} state=${args.statePath}`,
  );

  return result.exitCode;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.once) {
    const exitCode = await runOnce(args);
    process.exit(exitCode);
  }

  console.log(`[tse-watch] modo contínuo: intervalo de ${args.intervalSec}s. Ctrl+C pra encerrar.`);
  // Modo contínuo: nunca sai sozinho (a não ser erro fatal); cada ciclo loga
  // seu próprio exit code mas o processo continua rodando.
  for (;;) {
    try {
      await runOnce(args);
    } catch (err) {
      console.error("[tse-watch] falha no ciclo:", err);
    }
    await sleep(args.intervalSec * 1000);
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  main().catch((err) => {
    console.error("[tse-watch] falha fatal:", err);
    process.exit(1);
  });
}
