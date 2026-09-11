/**
 * lib/tse/rate-limiter.ts
 *
 * Token-bucket rate limiter para chamadas de saída ao CDN TSE.
 *
 * Por que isto existe (2026-09-05): a FAQ técnica do simulado TSE confirmou
 * um limite duro de **100 req/s por IP → bloqueio de 10 minutos**, e que
 * **304 conta no limite** (se-modified-since não é "grátis"). O pipeline
 * anterior não tinha nenhum controle de vazão de saída — só um semáforo de
 * concorrência (`CONCURRENCY`), que limita quantas requisições ficam
 * simultaneamente em voo mas não a taxa por segundo. Em produção (~5.200
 * GETs/ciclo — ver docs/reference/risks.md) isso pode facilmente estourar
 * 100 req/s e derrubar o IP por 10min no meio do dia de apuração.
 *
 * Cobre: RF-001 (consumo do CDN TSE dentro dos limites operacionais).
 *
 * Design:
 *   - `createTokenBucket` é a implementação pura, testável com relógio e
 *     sleep injetados (sem `setTimeout` real nos testes).
 *   - `getTseRateLimiter()` é o singleton usado em produção, lendo
 *     `TSE_MAX_RPS` do ambiente quando definida; senão o `rpsMax` do cargo
 *     (`lib/config/cargos.ts`: 35 para Presidente/Governador, 5 para
 *     Senador/Deputado). Clamp 1..50 — nunca deixamos configurar acima do
 *     limite documentado do TSE por engano.
 *   - Chamadas concorrentes a `acquire()` são serializadas via uma cadeia de
 *     Promises (`chain`), garantindo que a N-ésima chamada simultânea espere
 *     o tempo cumulativo correto em vez de todas computarem a mesma espera
 *     "ingênua" a partir do estado atual do bucket.
 */
import { type CargoTse, cargoInfo } from "@/lib/config/cargos";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TokenBucketStats {
  /** Total de tokens concedidos (acquire bem-sucedido + tryAcquire true). */
  acquired: number;
  /** Soma de todo tempo de espera (ms) gasto dentro de acquire(). */
  waitedMs: number;
  /** Maior número de chamadas a acquire() aguardando concorrentemente. */
  maxQueue: number;
}

export interface TokenBucket {
  /** Resolve quando um token está disponível — pode esperar (sleep). */
  acquire(): Promise<void>;
  /** Consome um token se disponível AGORA, sem esperar. Nunca espera. */
  tryAcquire(): boolean;
  readonly stats: TokenBucketStats;
}

export interface TokenBucketOptions {
  /** Taxa de reposição de tokens por segundo. Deve ser > 0. */
  ratePerSec: number;
  /** Capacidade máxima (burst inicial). Default: igual a ratePerSec. */
  burst?: number;
  /** Relógio injetável (ms epoch). Default: Date.now. */
  now?: () => number;
  /** Sleep injetável. Default: setTimeout real. */
  sleep?: (ms: number) => Promise<void>;
}

// ---------------------------------------------------------------------------
// createTokenBucket
// ---------------------------------------------------------------------------

export function createTokenBucket(opts: TokenBucketOptions): TokenBucket {
  if (!(opts.ratePerSec > 0)) {
    throw new Error(`createTokenBucket: ratePerSec deve ser > 0 (recebido: ${opts.ratePerSec})`);
  }

  const ratePerSec = opts.ratePerSec;
  const capacity = opts.burst ?? ratePerSec;
  const now = opts.now ?? (() => Date.now());
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let tokens = capacity;
  let lastRefill = now();
  let queueLength = 0;

  // Cadeia de serialização: cada acquire() encadeia sua espera atrás da
  // anterior, garantindo que chamadas concorrentes consumam o bucket em
  // ordem FIFO e acumulem espera corretamente (em vez de cada uma computar
  // independentemente "quanto falta a partir do estado atual").
  let chain: Promise<void> = Promise.resolve();

  const stats: TokenBucketStats = { acquired: 0, waitedMs: 0, maxQueue: 0 };

  function refill(): void {
    const t = now();
    const elapsedSec = (t - lastRefill) / 1000;
    if (elapsedSec > 0) {
      tokens = Math.min(capacity, tokens + elapsedSec * ratePerSec);
      lastRefill = t;
    }
  }

  function tryAcquire(): boolean {
    refill();
    if (tokens >= 1) {
      tokens -= 1;
      stats.acquired += 1;
      return true;
    }
    return false;
  }

  function acquire(): Promise<void> {
    queueLength += 1;
    stats.maxQueue = Math.max(stats.maxQueue, queueLength);

    const task = chain.then(async () => {
      refill();
      if (tokens < 1) {
        const deficit = 1 - tokens;
        const waitMs = Math.max(0, Math.ceil((deficit / ratePerSec) * 1000));
        if (waitMs > 0) {
          await sleep(waitMs);
          stats.waitedMs += waitMs;
          refill();
        }
      }
      tokens = Math.max(0, tokens - 1);
      stats.acquired += 1;
      queueLength -= 1;
    });

    chain = task;
    return task;
  }

  return { acquire, tryAcquire, stats };
}

// ---------------------------------------------------------------------------
// Singleton — getTseRateLimiter
// ---------------------------------------------------------------------------

/** Limite documentado pelo TSE é 100 req/s/IP, com bloqueio de 10 min
 *  renovado em caso de violação. Nunca deixamos configurar acima de 50
 *  mesmo via env, para deixar margem de segurança (outros processos no
 *  mesmo IP, retries, HEAD do tse-watch, e o 304 que tratamos como se
 *  consumisse cota). Teto exigido por RF-010.3 da spec 001 — não elevar
 *  sem revisar a spec e o ADR-0020.
 *
 * Default 40 (2026-09-11, ADR-0035 D3 emendado pela auditoria constitucional
 * do mesmo dia): desde o cron por cargo, CADA invocação de
 * `/api/ingest/[cargo]` roda num rate limiter de PROCESSO separado (Fluid
 * Compute isola instâncias por invocação concorrente) — os cargos 1 e 3
 * podem ingerir ao mesmo tempo, e os dois buckets NÃO se coordenam.
 *
 * A primeira versão desta mudança pôs o default em 50, o que dava pior caso
 * de 2 × 50 = exatamente 100 rps: a borda documentada do TSE, sem folga
 * nenhuma para retry, para o HEAD do `tse-watch`, para o 304 (que conta) nem
 * para qualquer outro processo no mesmo IP. A constituição § 1 exige teto
 * "**bem abaixo** do limite documentado" — e "exatamente no limite" não
 * satisfaz esse texto. Default 40 devolve margem real: pior caso agregado 80
 * rps, 20% abaixo do teto. Custo: 6.110 GETs a 40 rps ≈ 153 s por cargo,
 * bem dentro do `maxDuration` de 300 s.
 *
 * O CEILING segue em 50 para que uma janela SUPERVISIONADA (simulado, com
 * alguém lendo `rateLimited` em tempo real) possa subir via `TSE_MAX_RPS`
 * deliberadamente. Produção desassistida usa o default.
 *
 * Pendência registrada: dois buckets independentes garantem a média, não o
 * pico instantâneo. Um limitador coordenado entre invocações (contador
 * compartilhado) é a solução completa — decidir depois do simulado 1, com
 * `rateLimited` medido. Era 30 quando um único ciclo cobria todos os cargos
 * sequencialmente (nunca duas invocações reais em paralelo no mesmo IP). */
const TSE_MAX_RPS_CEILING = 50;
const TSE_MAX_RPS_FLOOR = 1;
/** Default quando o caller não informa cargo — o teto dos cargos leves, que é
 * o valor seguro sem saber quem mais está no ar. Ver `getTseRateLimiter`. */
const TSE_MAX_RPS_DEFAULT = 5;

let singleton: TokenBucket | null = null;

/**
 * getTseRateLimiter — bucket do processo para as chamadas ao CDN do TSE.
 *
 * `cargo` define o teto **padrão** (`lib/config/cargos.ts`, campo `rpsMax`):
 * 35 rps para Presidente e Governador (6.110 alvos cada), 5 rps para Senador e
 * Deputado Federal (27 alvos cada). `TSE_MAX_RPS` no ambiente sobrepõe para
 * todos — é a escotilha de janela supervisionada.
 *
 * ## Por que o teto é por cargo (2026-09-11)
 *
 * Até hoje o default era **40 para todos**, calibrado quando existiam DOIS
 * cargos: pior caso 2 x 40 = 80 rps, 20% abaixo do teto documentado de 100.
 * Com a entrada de Senador e Deputado (ADR-0026), os quatro crons de
 * `vercel.ts` passam a coincidir nos minutos 0, 15, 30 e 45 — as cadências de
 * 5 e 15 minutos caem sobre a de 1 minuto dos majoritários — e o pior caso
 * medido virou **160 rps**, acima do teto, que bloqueia o IP por 10 minutos.
 * A constituição § 1 exige "bem abaixo".
 *
 * Cada invocação tem seu próprio bucket (singleton **de processo**; o Fluid
 * Compute isola instâncias), então o que o TSE vê no IP é a soma. Dar 5 rps
 * aos cargos de granularidade UF entrega os 27 arquivos em 5 s em vez de
 * 0,7 s — custo desprezível ao lado de metade da margem de segurança do dia D.
 *
 * A pendência do limitador **coordenado** entre invocações (contador
 * compartilhado) continua aberta: buckets independentes garantem a média, não
 * o pico instantâneo. Decidir depois do simulado 1, com `rateLimited` medido.
 */
export function getTseRateLimiter(cargo?: CargoTse): TokenBucket {
  if (singleton) return singleton;

  // Ausente/vazio/não-numérico → cai no default do cargo ANTES do clamp. Um
  // valor numérico explícito — mesmo 0 ou negativo — é clampado em vez de
  // ignorado: "TSE_MAX_RPS=0" é uma configuração inválida, não uma ausência
  // de configuração, então o resultado é o floor (1), não o default.
  const raw = process.env.TSE_MAX_RPS;
  // Sem cargo (tse-watch, diagnóstico, chamadas avulsas) fica no teto dos
  // cargos leves: é o valor seguro quando não se sabe quem mais está no ar.
  let ratePerSec = cargo !== undefined ? cargoInfo(cargo).rpsMax : TSE_MAX_RPS_DEFAULT;
  if (raw !== undefined && raw.trim() !== "") {
    const parsed = Number(raw.trim());
    if (Number.isFinite(parsed)) {
      ratePerSec = parsed;
    }
  }

  ratePerSec = Math.min(TSE_MAX_RPS_CEILING, Math.max(TSE_MAX_RPS_FLOOR, ratePerSec));

  singleton = createTokenBucket({ ratePerSec });
  return singleton;
}

/**
 * resetTseRateLimiter — descarta o singleton atual.
 *
 * Uso: testes que precisam de um bucket "limpo" (burst cheio de novo) entre
 * casos, e trocas de `TSE_MAX_RPS` em runtime (ex.: escalonar a taxa entre
 * as janelas do simulado — ver Fase 4 do plano de prontidão TSE).
 */
export function resetTseRateLimiter(): void {
  singleton = null;
}
