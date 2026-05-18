/**
 * lib/edge-config/writer.ts
 *
 * Escrita no Vercel Edge Config via REST API.
 *
 * Por quê uma camada própria?
 *   - O SDK `@vercel/edge-config` (já em deps) cobre só LEITURA. Para gravar
 *     itens é preciso bater diretamente em
 *     `PATCH https://api.vercel.com/v1/edge-config/<id>/items` com bearer
 *     token. Manter essa chamada num módulo dedicado isola o segredo, dá
 *     um ponto único pra instrumentação (logs, métricas, tamanho), e
 *     centraliza o no-op em ambientes sem credencial.
 *
 * Covers
 *   - RF-020 (persistência da projeção para leitura via Edge Config) — write
 *     side. A leitura vive em código de UI usando o SDK.
 *   - ADR-0001 (Edge Config como único caminho de leitura no read path) —
 *     este writer é o ponto onde Postgres → Edge Config se materializa.
 *
 * Exporta
 *   - `writeEdgePayload(key, value)` — primitivo de baixo nível (T03).
 *   - `writeProjection(payload)` — wrapper de alto nível (T14) que materializa
 *     UM `EdgePayload` em `projection:current` + N chaves `projection:uf:<sigla>`.
 *
 * Behaviour
 *   - Sem `EDGE_CONFIG_TOKEN` ou `EDGE_CONFIG_ID` → no-op + warn estruturado.
 *     Isso é o esperado em preview deploys, CI e dev local quando ainda não
 *     há config Vercel — segue o mesmo padrão do `lib/tse/alerts.ts` quando
 *     `SLACK_WEBHOOK_URL` está ausente.
 *   - HTTP não-2xx → throw com mensagem clara incluindo status e snippet do
 *     corpo. Engolir erros aqui esconderia falhas de gravação que quebram
 *     `RF-019` em produção.
 *   - Erro de rede / DNS → throw com a cause original encadeada.
 *   - Payload >450 KB serializado → warn (margem antes do limite duro 512 KB
 *     do Edge Config; nunca aborta — gravação procede e o limite eventual
 *     será capturado pelo HTTP 413).
 *   - `writeProjection`: best-effort por chave. Falha em UMA chave NÃO aborta
 *     as demais (cron é melhor parcialmente consistente do que totalmente
 *     ausente). Exceção final agrega o que falhou.
 */

import type { Cargo, Turno } from "@/lib/config/calendar";
import type { EdgePayload, EdgePayloadUf } from "@/lib/edge-config/types";
import { logInfo, logWarn } from "@/lib/tse/log";

// ---------------------------------------------------------------------------
// Config / constants
// ---------------------------------------------------------------------------

/** Base URL da API REST da Vercel. Exportado para os testes substituírem se necessário. */
const VERCEL_API_BASE = "https://api.vercel.com";

/**
 * Lê o ID do Edge Config diretamente da connection string que a Vercel
 * injeta como `EDGE_CONFIG`, OU de uma var explícita `EDGE_CONFIG_ID`.
 *
 * Formato `EDGE_CONFIG`:
 *   https://edge-config.vercel.com/ecfg_xxx?token=yyy
 *                                  ^^^^^^^^
 *
 * O SDK de leitura usa essa connection string direto; para o WRITE precisamos
 * só do `ecfg_*`, então parseamos.
 */
function resolveEdgeConfigId(): string | null {
  const explicit = process.env.EDGE_CONFIG_ID;
  if (explicit && explicit.length > 0) return explicit;

  const connection = process.env.EDGE_CONFIG;
  if (!connection) return null;

  // Aceita tanto a URL completa quanto só o ID por defensividade.
  const match = connection.match(/ecfg_[A-Za-z0-9]+/);
  return match ? match[0] : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Faz upsert de UM item no Edge Config.
 *
 * @param key   Nome da chave (ex. `projection:current`).
 * @param value Valor — JSON-serializável. Sem validação de shape aqui;
 *              o caller (orchestrator, T12/T14) deve passar um `EdgePayload`.
 * @returns     `void` em sucesso ou no-op (sem credencial). Throws em falha
 *              HTTP / rede.
 *
 * @throws Error se a Vercel API responder non-2xx ou se o `fetch` falhar
 *               por motivo de rede.
 */
export async function writeEdgePayload(key: string, value: unknown): Promise<void> {
  const token = process.env.EDGE_CONFIG_TOKEN;
  const edgeConfigId = resolveEdgeConfigId();

  // No-op friendly: preview / CI / dev local sem creds não devem quebrar.
  // Logamos uma única linha estruturada pra ficar evidente nos logs por que
  // a gravação foi pulada.
  if (!token || !edgeConfigId) {
    logWarn("edge-config write skipped: missing credentials", {
      key,
      hasToken: Boolean(token),
      hasEdgeConfigId: Boolean(edgeConfigId),
    });
    return;
  }

  const url = `${VERCEL_API_BASE}/v1/edge-config/${edgeConfigId}/items`;
  const body = JSON.stringify({
    items: [{ operation: "upsert", key, value }],
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
    });
  } catch (cause) {
    // Encadeia a causa para preservar stack trace original do fetch (DNS,
    // TLS, abort, etc.). Não logamos aqui — o caller decide se loga ou
    // re-throw silencioso.
    throw new Error(
      `edge-config write failed (network) for key=${key}: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
  }

  if (!response.ok) {
    // Snippet do corpo para diagnosticar 401 (token expirado), 403 (escopo),
    // 404 (id errado), 413 (>512 KB). Trunca para não vazar payloads gigantes
    // em logs.
    const textSnippet = await response.text().catch(() => "<unreadable body>");
    const truncated = textSnippet.length > 500 ? `${textSnippet.slice(0, 500)}...` : textSnippet;
    throw new Error(
      `edge-config write failed (http ${response.status}) for key=${key}: ${truncated}`,
    );
  }

  logInfo("edge-config write ok", {
    key,
    status: response.status,
    bytes: body.length,
  });
}

// ---------------------------------------------------------------------------
// High-level — writeProjection (T14)
// ---------------------------------------------------------------------------

/**
 * Limite de tamanho a partir do qual emitimos warn. 450 KB deixa ~62 KB de
 * margem antes do limite duro de 512 KB do Edge Config (cf. data-model.md
 * § "Payload do Edge Config" + types.ts cabeçalho).
 *
 * Quando o payload nacional sozinho atinge 450 KB, algo está errado:
 *   - candidatos repetidos sem dedup
 *   - `insights` virou log de execução (deveria ser 1-3 frases curtas)
 *   - `por_uf` ganhou municípios (que pertencem ao drill-down, não ao nacional)
 *
 * O warn não aborta a gravação — apenas marca a linha de log para
 * investigação. Se o request chegar a 512 KB de verdade, a Vercel API
 * retorna 413 e o caller do `writeEdgePayload` propaga o erro.
 */
const EDGE_CONFIG_SIZE_WARN_BYTES = 450 * 1024;

/**
 * Limites dedicados S05/F4c multi-candidato (ADR-0014, ADR-0017):
 *   - Nacional com 11 candidatos + `cenarios_2t` + `p_passa_2t`/`p_fecha_1t`
 *     em cada cand: tipicamente 30–55 KB. Warn em 75 KB = sinal de blow-up
 *     (e.g. `cenarios_2t` virou top-50 em vez de top-3).
 *   - UF com 11 candidatos + `top_candidatos` + `bucket` + municípios +
 *     séries: tipicamente 8–15 KB (50 em SP). Warn em 20 KB = sinal de
 *     vazamento (`series_temporais` cresceu além da janela 24h).
 */
const EDGE_CONFIG_NATIONAL_WARN_BYTES = 75 * 1024;
const EDGE_CONFIG_UF_WARN_BYTES = 20 * 1024;

/**
 * Sumário de uma chave que falhou dentro do `writeProjection`. Mantemos o
 * shape pequeno para caber numa mensagem de erro legível (cron logs).
 */
interface WriteFailure {
  key: string;
  message: string;
}

/**
 * Mapeia o cargo numérico do TSE (1=Presidente, 3=Governador) para o
 * literal `Cargo` ("pres" | "gov") usado nas chaves nomeadas (ADR-0012).
 * Cargos fora dos 2 cobertos pelo SalaCofre caem em "pres" por
 * defensividade — não há semântica útil para encerrar com erro aqui,
 * o orchestrator nunca emite outros valores.
 */
function cargoFromTseNumeric(cargoTse: number): Cargo {
  return cargoTse === 3 ? "gov" : "pres";
}

/**
 * Materializa UMA projeção completa no Edge Config:
 *
 *   - 1 chave nacional NOMEADA `projection:current:<cargo>:t<turno>`
 *     (ADR-0012 — S05/F4c).
 *   - 1 alias `projection:current` apontando para o MESMO valor — preserva
 *     o read path S04 dos consumidores que ainda não migraram.
 *   - N chaves de drill-down NOMEADAS `projection:uf:<sigla>:<cargo>:t<turno>`.
 *   - N aliases legacy `projection:uf:<sigla>` (mesmo valor).
 *
 * Total de chaves gravadas: `2 + 2N` (N = número de UFs em `por_uf`).
 *
 * Estratégia de granularidade do erro — **best-effort por chave**:
 *   Cada `writeEdgePayload` é tentado de forma INDEPENDENTE. Se a chave
 *   nacional falhar mas 26/27 UFs gravarem, o read path ainda serve o
 *   drill-down enquanto o nacional fica stale por <60 s (próximo ciclo do
 *   cron repete). O inverso também vale.
 *
 *   Alternativas consideradas e descartadas:
 *     a) Fail-fast: aborta na 1ª falha. Pior para resiliência do cron — uma
 *        UF com problema transitório (DNS hiccup) cancelaria toda a gravação.
 *     b) Transactional via tags: Vercel Edge Config não tem MVCC para
 *        múltiplas chaves; um PATCH com vários items é atômico, mas
 *        somando todas as chaves estouramos o limite por payload. Manter
 *        chaves separadas é o que o data-model.md determina (~30 KB +
 *        5–10 KB × 27 = ~270 KB de drill-down, longe de caber num único PATCH).
 *
 * @param payload     `EdgePayload` nacional canônico. `payload.cargo` e
 *                    `payload.turno` definem a chave nomeada.
 * @param payloadsUf  Opcional (S04/F2): mapa `sigla → EdgePayloadUf` rico
 *                    com candidatos completos, municípios e séries temporais.
 *                    Quando presente, sobrescreve o esqueleto sintetizado
 *                    de `payload.por_uf`. Falta de uma UF cai no fallback
 *                    sintético — garante chave existe.
 * @throws Error agregando as chaves que falharam, com mensagem por chave.
 *               Se TODAS gravaram OK, resolve sem erro.
 */
export async function writeProjection(
  payload: EdgePayload,
  payloadsUf?: Record<string, EdgePayloadUf>,
): Promise<void> {
  // Resolve a chave nomeada via cargo/turno do payload. ADR-0012:
  // orchestrator é a fonte de verdade — payload.cargo/turno reflete a
  // corrida sendo gravada, NÃO a corrida ativa pelo calendário.
  const cargoLit: Cargo = cargoFromTseNumeric(payload.cargo);
  const turnoLit: Turno = payload.turno as Turno;
  const namedNationalKey = `projection:current:${cargoLit}:t${turnoLit}`;

  // Tamanho do payload nacional (apenas — o por-UF é gravado em chaves
  // separadas e cada uma tem seu próprio orçamento). Stringify uma vez
  // para reusar tanto no warn quanto na chamada `writeEdgePayload` que
  // vai re-stringify; o custo é negligível (<1 ms p/ ~30 KB típico).
  const nationalJson = JSON.stringify(payload);

  // Warn dedicado multi-candidato (ADR-0014): 75KB é o sweet spot pro
  // payload nacional cheio (11 cands + cenarios_2t).
  if (nationalJson.length > EDGE_CONFIG_NATIONAL_WARN_BYTES) {
    logWarn("edge-config national payload oversize (S05 budget)", {
      key: namedNationalKey,
      bytes: nationalJson.length,
      threshold: EDGE_CONFIG_NATIONAL_WARN_BYTES,
      hardLimit: 512 * 1024,
    });
  }
  // Warn agregado (S04): fica até chegar perto do hard limit.
  if (nationalJson.length > EDGE_CONFIG_SIZE_WARN_BYTES) {
    logWarn("edge-config projection oversize", {
      key: namedNationalKey,
      bytes: nationalJson.length,
      threshold: EDGE_CONFIG_SIZE_WARN_BYTES,
      hardLimit: 512 * 1024,
    });
  }

  // Build per-UF payloads. Prioridade:
  //   1. `payloadsUf[sigla]` se fornecido (S04/F2 — payload rico do orchestrator).
  //   2. Esqueleto sintetizado de `payload.por_uf` (backward-compat — quando
  //      o orchestrator é antigo OU a UF caiu fora do mapa explícito).
  // Em ambos casos a chave EXISTE no Edge Config — o read path nunca 404.
  //
  // S05/F4c — para cada UF gravamos DUAS chaves:
  //   - Nomeada: `projection:uf:<sigla>:<cargo>:t<turno>` (ADR-0012)
  //   - Alias legacy: `projection:uf:<sigla>` (backward-compat S04)
  // Mesmo valor nas duas chaves — escrita best-effort em paralelo.
  type UfKey = { key: string; payload: EdgePayloadUf };
  const ufKeys: UfKey[] = [];

  for (const row of payload.por_uf) {
    const explicit = payloadsUf?.[row.sigla];
    const ufPayload: EdgePayloadUf = explicit ?? {
      uf: row.sigla,
      ts: payload.ts,
      cargo: payload.cargo,
      turno: payload.turno,
      pct_apurado: row.pct_apurado,
      // Esqueleto: orchestrator antigo sem payloads_uf. Página de UF
      // renderiza com placeholders gentis (constituição § 3).
      candidatos: [],
      needle_position: 0,
      needle_band: "tossup",
      municipios: [],
    };

    // Validação dedicada de tamanho UF (S05): 20KB é o orçamento pra UF
    // típica com 11 cands + top_candidatos + bucket + 645 municípios (SP).
    if (explicit) {
      const ufJson = JSON.stringify(explicit);
      if (ufJson.length > EDGE_CONFIG_UF_WARN_BYTES) {
        logWarn("edge-config uf payload oversize (S05 budget)", {
          key: `projection:uf:${row.sigla}:${cargoLit}:t${turnoLit}`,
          bytes: ufJson.length,
          threshold: EDGE_CONFIG_UF_WARN_BYTES,
          hardLimit: 512 * 1024,
        });
      }
      if (ufJson.length > EDGE_CONFIG_SIZE_WARN_BYTES) {
        logWarn("edge-config uf payload oversize", {
          key: `projection:uf:${row.sigla}:${cargoLit}:t${turnoLit}`,
          bytes: ufJson.length,
          threshold: EDGE_CONFIG_SIZE_WARN_BYTES,
          hardLimit: 512 * 1024,
        });
      }
    }

    // Nomeada (S05+, primária).
    ufKeys.push({
      key: `projection:uf:${row.sigla}:${cargoLit}:t${turnoLit}`,
      payload: ufPayload,
    });
    // Alias legacy (S04 read path).
    ufKeys.push({ key: `projection:uf:${row.sigla}`, payload: ufPayload });
  }

  const failures: WriteFailure[] = [];

  // Nacional — grava em ambas as chaves (nomeada + alias).
  // Sequencial nas 2 nacionais (alias replicado): permite cache do
  // payload stringified intermediário sem complexidade extra.
  try {
    await writeEdgePayload(namedNationalKey, payload);
  } catch (err) {
    failures.push({
      key: namedNationalKey,
      message: err instanceof Error ? err.message : String(err),
    });
  }
  try {
    await writeEdgePayload("projection:current", payload);
  } catch (err) {
    failures.push({
      key: "projection:current",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // Per-UF em paralelo (best-effort). `Promise.allSettled` para coletar
  // sucessos e falhas sem aborto antecipado.
  const ufResults = await Promise.allSettled(
    ufKeys.map(({ key, payload: ufPayload }) => writeEdgePayload(key, ufPayload)),
  );
  ufResults.forEach((result, i) => {
    if (result.status === "rejected") {
      // ufKeys.length === ufResults.length por construção; o `!` é seguro.
      const k = ufKeys[i]?.key ?? `projection:uf:<index-${i}>`;
      failures.push({
        key: k,
        message: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });

  if (failures.length > 0) {
    const summary = failures.map((f) => `${f.key}: ${f.message}`).join("; ");
    throw new Error(
      `writeProjection: ${failures.length}/${ufKeys.length + 2} chave(s) falharam — ${summary}`,
    );
  }

  logInfo("edge-config projection written", {
    namedKey: namedNationalKey,
    nationalBytes: nationalJson.length,
    ufKeysWritten: ufKeys.length,
    totalKeys: ufKeys.length + 2,
  });
}
