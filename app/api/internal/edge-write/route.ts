/**
 * app/api/internal/edge-write/route.ts
 *
 * POST /api/internal/edge-write — bridge interna Python → Node para gravação
 * no Vercel Edge Config (spec 002, T15).
 *
 * Por quê existe?
 *   O orchestrator Python (`/api/model/project`, T12) computa a projeção e
 *   precisa publicá-la no Edge Config. O SDK oficial `@vercel/edge-config`
 *   é TypeScript-only — não há equivalente Python maduro, e a REST API
 *   bruta de write exige bearer token + ID parsing que duplicaríamos em
 *   duas linguagens.
 *
 *   Manter UM caller (Node) do Vercel Edge Config write API:
 *     - centraliza o token (`EDGE_CONFIG_TOKEN`) em território TS;
 *     - reusa toda a lógica de serialização, size warn e best-effort por
 *       chave de `writeProjection` (T14);
 *     - dá um ponto único de instrumentação (logs estruturados, métricas);
 *     - desacopla a evolução do Python: futuras chaves no Edge Config
 *       (cache de mapa, feature flags) só precisam mudar TS.
 *
 *   O Python chama este endpoint internamente via `POST` HTTP, com o
 *   mesmo `MODEL_SECRET` do `/api/model/project` (lado-Python sabe esse
 *   segredo porque é o que ele próprio recebe).
 *
 * Por que `internal` e NÃO `_internal` (2026-09-11):
 *   Esta rota morou em `app/api/_internal/` até 2026-09-11, sob a convenção
 *   — escrita no comentário original — de que "rotas começando em `_internal`
 *   nunca são expostas publicamente; Vercel não filtra automaticamente".
 *   A premissa estava invertida: no App Router do Next.js, um diretório com
 *   prefixo `_` é uma **private folder** e fica FORA do roteamento por
 *   completo. A rota respondia 404 em todo ambiente, e o orchestrator Python
 *   registrava `edge-write http error status=404` como warn best-effort, sem
 *   nunca levantar — de modo que NENHUMA gravação no Global Config ou no
 *   Vercel Blob jamais ocorreu, em nenhum ambiente, desde que o endpoint
 *   existe. Medido com duas rotas idênticas, uma com e outra sem o prefixo:
 *   `/api/zzdiag` → 200, `/api/_zzdiag/sub` → 404.
 *
 *   O que de fato protege esta rota é — e sempre foi — o header
 *   `x-model-secret` (401 sem ele), mais o BotID aplicado a `/api/*` por
 *   `proxy.ts`. O prefixo nunca acrescentou proteção; só removia a rota.
 *   **Não renomear de volta para `_internal`.**
 *
 * Cobre
 *   - Ponte Python ↔ Node (T15).
 *   - RF-019/RF-020 (indiretamente — habilita o write side do payload do
 *     modelo).
 *   - ADR-0001 (Edge Config no read path — este é o gatekeeper de gravação).
 *
 * Out of scope desta task (T15)
 *   - Rate limiting (cron interno; sem necessidade).
 *   - Idempotency keys (writeProjection sobrescreve por design — append-only
 *     vive no Postgres, não no Edge Config).
 *   - Chamada Python → este endpoint (T15 entrega só o endpoint;
 *     adaptação do Python fica para T16).
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { CARGOS_TSE, type CargoTse, cargoInfo, isCargoTse } from "@/lib/config/cargos";
import { GLOBAL_CONFIG_KEY_PATTERN } from "@/lib/edge-config/keys";
import { writeDeputadoProjection, writeProjection } from "@/lib/edge-config/writer";
import { logError, logInfo } from "@/lib/tse/log";

// ---------------------------------------------------------------------------
// Vercel runtime config
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

/**
 * maxDuration = 30 s — gravar ~28 chaves em paralelo (1 nacional + 27 UFs)
 * via fetch para api.vercel.com com RTT ~200 ms cada = ~200 ms wall-clock
 * sob `Promise.allSettled`. 30 s deixa margem confortável mesmo com retries
 * implícitos do runtime fetch.
 */
export const maxDuration = 30;

// ---------------------------------------------------------------------------
// Request schema — validação de borda
// ---------------------------------------------------------------------------

/**
 * Validação MÍNIMA do body: garante shape de superfície (`payload` é objeto
 * com os campos top-level esperados). NÃO replicamos `EdgePayload` inteiro
 * em Zod — o orchestrator Python já garante o shape (Pydantic + tipos),
 * e duplicar a estrutura completa aqui produziria divergência silenciosa
 * entre TS e Python ao primeiro campo novo.
 *
 * Cast pra `EdgePayload` é safe-enough: se o Python mandar lixo, o
 * `writeProjection` falha cedo no `JSON.stringify` ou no map sobre `por_uf`.
 * O custo de uma falha downstream é uma resposta 500 com mensagem clara,
 * não um payload corrompido em produção (porque o Edge Config valida tamanho
 * e a Vercel API rejeita JSON inválido).
 *
 * **Exceção deliberada a esse minimalismo: `por_uf[].sigla`.** Cada entrada
 * de `por_uf` vira DUAS chaves do Global Config
 * (`projection-uf-<SIGLA>-<cargo>-t<turno>` e o alias `projection-uf-<SIGLA>`,
 * ver `lib/edge-config/keys.ts`). A sigla é o ÚNICO componente das nossas
 * chaves que não é literal de código — é o caminho por onde uma chave fora do
 * padrão documentado `^[A-Za-z0-9_-]+$` entraria no store vinda de fora. Por
 * isso ela é validada aqui, na borda, com erro 400 explicativo, em vez de
 * estourar lá dentro do `writeProjection` como falha parcial de gravação no
 * meio da apuração.
 */
const SIGLA_UF_PATTERN = /^[A-Za-z]{2}$/;

const porUfRowSchema = z
  .object({
    sigla: z
      .string()
      .regex(
        SIGLA_UF_PATTERN,
        `sigla de UF deve ter exatamente 2 letras — ela entra literalmente no nome da chave ` +
          `do Global Config, que precisa casar com ${GLOBAL_CONFIG_KEY_PATTERN.source} ` +
          `(doc Vercel /docs/global-config/global-config-limits § "Maximum item key name length")`,
      ),
  })
  .passthrough();

const bodySchema = z.object({
  payload: z
    .object({
      ts: z.string(),
      // Derivado da tabela canônica (`lib/config/cargos.ts`): acrescentar um
      // cargo lá passa a bastar. Era `z.union([literal(1), literal(3)])`
      // hardcoded até 2026-09-11.
      cargo: z.union(
        CARGOS_TSE.map((cd) => z.literal(cd)) as unknown as [
          z.ZodLiteral<CargoTse>,
          z.ZodLiteral<CargoTse>,
          ...z.ZodLiteral<CargoTse>[],
        ],
      ),
      turno: z.union([z.literal(1), z.literal(2)]),
      pct_apurado_total: z.number(),
      ufs_apuradas: z.number(),
      national: z.object({
        candidatos: z.array(z.unknown()),
        needle_position: z.number(),
        needle_band: z.string(),
      }),
      por_uf: z.array(porUfRowSchema),
      insights: z.array(z.string()),
      composition: z.object({
        pre_election: z.number(),
        model: z.number(),
        actual_results: z.number(),
      }),
    })
    .passthrough(), // permite campos extras (forward-compat com Python avançando o shape)
  /**
   * Mapa opcional `sigla → UfPayloadInput` rico (S04/F2). Quando presente,
   * `writeProjection` usa esses payloads para as chaves
   * `projection-uf-<SIGLA>-<cargo>-t<turno>` em vez de sintetizar esqueleto do
   * `por_uf` nacional.
   *
   * **ADR-0032 (2026-09-08)**: o Python continua enviando `municipios` e
   * `series_temporais` dentro de cada UF deste mapa — inalterado. Quem separa é
   * o lado TypeScript: `writeProjection` → `splitUfPayload` manda o resumo para
   * o Global Config e o detalhe para o Vercel Blob. O contrato desta rota não
   * mudou; o destino de dois campos, sim.
   *
   * As chaves DESTE mapa não formam nomes de chave do
   * Global Config — são só lookup por `por_uf[].sigla`, que já é validado
   * acima. Forward-compat:
   * orchestrators antigos sem `payloads_uf` continuam funcionando (cai no
   * fallback de síntese).
   *
   * Cada UF é `passthrough` — o shape canônico vive em
   * `lib/edge-config/types.ts § EdgePayloadUf`. Não duplicamos aqui para
   * evitar divergência silenciosa entre TS e Python.
   */
  payloads_uf: z.record(z.string(), z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// Cargo PROPORCIONAL — envelope próprio (spec 017, design 017 § D1)
// ---------------------------------------------------------------------------

/**
 * Deputado Federal não cabe no schema acima, e a diferença não é de campo
 * solto: `national` (`EdgeNational`) é inteiramente majoritário — agulha,
 * duelo A×B, probabilidade de 2º turno. Numa corrida proporcional nenhum
 * desses campos tem referente. O envelope é `EdgePayloadDeputado`, com
 * `bancada` no lugar de `national`, e o destino é `writeDeputadoProjection`.
 *
 * Até 2026-09-12 esta rota aceitava cargo 6 pelo schema majoritário e
 * chamava `writeProjection`. O efeito era duplamente errado: o payload ia
 * para a chave `projection-current-pres-t1` (ver a nota de correção em
 * `cargoFromTseNumeric`, `lib/edge-config/writer.ts`) e, se tivesse ido para
 * a chave certa, iria sem `bancada`.
 *
 * Como no schema majoritário, a validação é de **superfície** — o shape
 * canônico vive em `lib/edge-config/types.ts` e em `lib/blob/deputado-uf.ts`.
 * Duplicar a estrutura inteira aqui produziria divergência silenciosa entre
 * TS e Python ao primeiro campo novo.
 */
const deputadoPorUfRowSchema = z
  .object({
    sigla: z
      .string()
      .regex(SIGLA_UF_PATTERN, "sigla de UF deve ter exatamente 2 letras (linha de por_uf)"),
  })
  .passthrough();

/**
 * Cada valor de `payloads_uf`, no ramo de cargo 6, é um `DeputadoUfDetail`
 * destinado ao **Blob** (`deputado/uf/<SIGLA>.json`, RF-129) — não um
 * `EdgePayloadUf` de Global Config.
 *
 * `uf` é validado aqui, na borda, pelo mesmo motivo que `por_uf[].sigla`: ela
 * entra literalmente no caminho do blob, e é o único componente do caminho que
 * não é literal de código. Barrar com 400 explicativo é melhor que falhar
 * dentro do `Promise.allSettled` do writer como uma UF silenciosamente
 * ausente do CDN.
 */
const deputadoUfDetailSchema = z
  .object({
    uf: z
      .string()
      .regex(
        SIGLA_UF_PATTERN,
        `sigla de UF deve ter exatamente 2 letras — ela entra literalmente no caminho do ` +
          `Vercel Blob (deputado/uf/<SIGLA>.json, ver lib/blob/paths.ts)`,
      ),
  })
  .passthrough();

const deputadoBodySchema = z.object({
  payload: z
    .object({
      ts: z.string(),
      cargo: z.literal(6),
      // Turno único (`temSegundoTurno: false`). Um `2` aqui é payload
      // malformado, não uma corrida que existe.
      turno: z.literal(1),
      pct_apurado_total: z.number(),
      ufs_apuradas: z.number(),
      /** RF-128 — a cadência é declarada pelo produtor; a tela deriva dela. */
      atualizacao_min: z.number(),
      bancada: z
        .object({
          total_cadeiras: z.number(),
          cadeiras_atribuidas: z.number(),
          ufs_calculadas: z.number(),
          ufs_aguardando: z.number(),
          por_agremiacao: z.array(z.unknown()),
        })
        .passthrough(),
      por_uf: z.array(deputadoPorUfRowSchema),
      insights: z.array(z.string()),
      composition: z.object({
        pre_election: z.number(),
        model: z.number(),
        actual_results: z.number(),
      }),
    })
    .passthrough(),
  payloads_uf: z.record(z.string(), deputadoUfDetailSchema).optional(),
});

/**
 * O cargo declarado no body é proporcional?
 *
 * Lido do JSON cru, ANTES de escolher o schema — é ele que decide qual
 * envelope validar. Um cargo ausente, não-numérico ou fora da tabela canônica
 * responde `false` e cai no schema majoritário, que devolve o 400 com a
 * mensagem correta sobre o cargo.
 */
function bodyDeclaresProportionalCargo(raw: unknown): boolean {
  const cargo = (raw as { payload?: { cargo?: unknown } } | null)?.payload?.cargo;
  return typeof cargo === "number" && isCargoTse(cargo) && cargoInfo(cargo).proporcional;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  const t0 = Date.now();

  // --------------------------------------------------------------------------
  // 1. Auth — header x-model-secret (mesmo padrão do /api/model/project)
  // --------------------------------------------------------------------------
  const expected = process.env.MODEL_SECRET;
  if (!expected) {
    logError("MODEL_SECRET não configurada — abortando edge-write", {});
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const provided = req.headers.get("x-model-secret");
  if (provided !== expected) {
    // Não logamos para não revelar se o segredo está configurado
    // (mesma postura de /api/ingest).
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // --------------------------------------------------------------------------
  // 2. Parse + validate body
  // --------------------------------------------------------------------------
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_json",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }

  // --------------------------------------------------------------------------
  // 2b. Ramo PROPORCIONAL — envelope próprio, chave própria, Blob próprio
  // --------------------------------------------------------------------------
  if (bodyDeclaresProportionalCargo(rawBody)) {
    const parsedDep = deputadoBodySchema.safeParse(rawBody);
    if (!parsedDep.success) {
      return NextResponse.json(
        { error: "invalid_body", detail: parsedDep.error.issues.slice(0, 10) },
        { status: 400 },
      );
    }

    // biome-ignore lint/suspicious/noExplicitAny: bridge boundary; shape garantido pelo Python
    const depPayload = parsedDep.data.payload as any;
    // biome-ignore lint/suspicious/noExplicitAny: bridge boundary; shape garantido pelo Python
    const detalhes = parsedDep.data.payloads_uf as Record<string, any> | undefined;

    try {
      await writeDeputadoProjection(depPayload, detalhes);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError("edge-write falhou — payload não publicado", {
        durationMs: Date.now() - t0,
        error: message,
      });
      return NextResponse.json({ error: "edge_write_failed", detail: message }, { status: 500 });
    }

    // UMA chave de Global Config. O detalhe por UF vai para o Blob e falha de
    // forma independente (RF-129, ADR-0032 item 3), então não entra nesta
    // contagem — contá-lo aqui faria a resposta prometer uma publicação que
    // este número não atesta.
    logInfo("edge-write ok", {
      keysWritten: 1,
      blobsEnviados: Object.keys(detalhes ?? {}).length,
      durationMs: Date.now() - t0,
      cargo: depPayload.cargo,
      turno: depPayload.turno,
    });
    return NextResponse.json({ ok: true, keys_written: 1 });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    // Zod 4 expõe issues em `error.issues`. Retornamos com `detail` truncado
    // para não vazar payloads gigantes em logs do caller.
    return NextResponse.json(
      {
        error: "invalid_body",
        detail: parsed.error.issues.slice(0, 10),
      },
      { status: 400 },
    );
  }

  // Cast seguro: o passthrough do Zod preserva todos os campos; o shape
  // canônico vive em `lib/edge-config/types.ts` e `writeProjection` o
  // usa para indexar `por_uf`.
  // biome-ignore lint/suspicious/noExplicitAny: bridge boundary; shape garantido pelo Python
  const payload = parsed.data.payload as any;
  // biome-ignore lint/suspicious/noExplicitAny: bridge boundary; shape garantido pelo Python
  const payloadsUf = parsed.data.payloads_uf as Record<string, any> | undefined;

  // --------------------------------------------------------------------------
  // 3. Materializa no Edge Config (writeProjection — T14)
  // --------------------------------------------------------------------------
  let keysWritten: number;
  try {
    await writeProjection(payload, payloadsUf);
    // N+1 chaves: 1 nacional + len(por_uf) UFs.
    keysWritten = 1 + payload.por_uf.length;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError("edge-write falhou — payload não publicado", {
      durationMs: Date.now() - t0,
      error: message,
    });
    return NextResponse.json({ error: "edge_write_failed", detail: message }, { status: 500 });
  }

  // --------------------------------------------------------------------------
  // 4. Sucesso
  // --------------------------------------------------------------------------
  const durationMs = Date.now() - t0;
  logInfo("edge-write ok", {
    keysWritten,
    durationMs,
    cargo: payload.cargo,
    turno: payload.turno,
  });

  return NextResponse.json({ ok: true, keys_written: keysWritten });
}
