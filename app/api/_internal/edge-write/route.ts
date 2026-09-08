/**
 * app/api/_internal/edge-write/route.ts
 *
 * POST /api/_internal/edge-write — bridge interna Python → Node para gravação
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
 * Prefixo `_internal`:
 *   Convenção: rotas com path começando em `_internal` NUNCA são expostas
 *   publicamente. Vercel não filtra automaticamente, mas o auth header
 *   `x-model-secret` garante que só callers com o segredo passam.
 *   proxy.ts (futuro) pode adicionar IP allow-list extra.
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
import { GLOBAL_CONFIG_KEY_PATTERN } from "@/lib/edge-config/keys";
import { writeProjection } from "@/lib/edge-config/writer";
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
      cargo: z.union([z.literal(1), z.literal(3)]),
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
