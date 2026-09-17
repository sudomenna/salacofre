// data-pipeline/_global-config-admin.ts
//
// **Acesso administrativo ao Vercel Global Config** — listar o que está lá e
// apagar uma chave. Duas operações que o produto NÃO faz no caminho normal e
// que dois scripts de operador precisam: o semeador da spec 019
// (`data-pipeline/projection-seed.ts`, RF-164) e o fiscal de limpeza
// (`scripts/edge-config-prune.ts`, RF-165).
//
// ─── Por que um módulo, e não uma função em `lib/edge-config/writer.ts` ─────
//
// O writer é caminho crítico da noite de 04/10 e é compartilhado. Acrescentar
// um `deleteEdgeKey` exportado ali poria uma função destrutiva a um import de
// distância do orchestrator, para servir dois scripts que rodam à mão. A
// escolha aqui é a inversa: a capacidade destrutiva mora no lado dos scripts,
// e o que se importa do writer são só as duas funções **de endereçamento** que
// ele já exporta — `resolveEdgeConfigId` e `vercelApiUrl`. Reimplementá-las
// criaria duas verdades sobre qual store é o nosso e sobre o `?teamId=`, e o
// modo de falha disso é apagar chave no store errado.
//
// ─── Por que ler o store pela API REST, e não pelo SDK de leitura ───────────
//
// `@vercel/edge-config` (`get`) lê pela CDN de leitura, com cache. A pergunta
// que a guarda de reentrância do RF-164 faz — "esta chave já tem dado real por
// baixo?" — não tolera resposta cacheada: um `null` velho autorizaria o
// semeador a passar por cima da apuração ao vivo. `GET /v1/edge-config/<id>/
// items` fala com a origem, devolve o store inteiro (chave + valor) numa
// requisição, e é a mesma fonte contra a qual a Vercel aplica o limite de
// tamanho.
//
// Custo: baixa o store inteiro (≤ 1 MB). É aceitável porque nenhum destes dois
// scripts roda em ciclo — são invocações humanas, uma por vez.

import { resolveEdgeConfigId, vercelApiUrl } from "@/lib/edge-config/writer";

/** Timeout de cada chamada à API da Vercel. Operador esperando no terminal. */
const ADMIN_TIMEOUT_MS = 15_000;

/** Credencial resolvida — token de escrita + id do store. */
export interface GlobalConfigCreds {
  token: string;
  edgeConfigId: string;
}

/**
 * Resolve as credenciais de administração, ou `null` quando faltarem.
 *
 * Devolve `null` em vez de lançar de propósito: os dois callers querem
 * distinguir "não rodou por falta de credencial" (exit 2) de "rodou e
 * reprovou" (exit 1) — a mesma convenção de `scripts/edge-config-smoke.ts`.
 */
export function resolveCreds(): GlobalConfigCreds | null {
  const token = process.env.EDGE_CONFIG_TOKEN;
  const edgeConfigId = resolveEdgeConfigId();
  if (!token || !edgeConfigId) return null;
  return { token, edgeConfigId };
}

/**
 * Snapshot do store inteiro: `chave → valor já parseado`.
 *
 * Aceita as duas formas de resposta que a API pode devolver — lista de
 * `{ key, value }` (endpoint REST) ou objeto `{ chave: valor }` (endpoint de
 * leitura otimizado) —, pela mesma razão que `fetchStoreKeySizes` em
 * `lib/edge-config/writer.ts` aceita: custa seis linhas e evita que a leitura
 * emudeça por uma diferença de shape.
 *
 * @throws Error com o status HTTP quando a API recusa. O caller decide — e
 *         nos dois callers a decisão é **parar**: uma listagem que falhou não
 *         é um store vazio, e tratá-la como vazio é exatamente como o semeador
 *         passaria por cima de dado real.
 */
export async function listarStore(creds: GlobalConfigCreds): Promise<Map<string, unknown>> {
  const response = await fetch(vercelApiUrl(`/v1/edge-config/${creds.edgeConfigId}/items`), {
    method: "GET",
    headers: { Authorization: `Bearer ${creds.token}` },
    signal: AbortSignal.timeout(ADMIN_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "<corpo ilegível>");
    throw new Error(
      `listagem do Global Config falhou (http ${response.status}): ${body.slice(0, 300)}`,
    );
  }

  const parsed: unknown = await response.json();
  const entries: Array<[string, unknown]> = Array.isArray(parsed)
    ? parsed
        .filter((item): item is { key: string; value: unknown } => {
          return typeof (item as { key?: unknown })?.key === "string";
        })
        .map((item) => [item.key, item.value])
    : Object.entries((parsed ?? {}) as Record<string, unknown>);

  return new Map(entries);
}

/**
 * Apaga UMA chave do store.
 *
 * Uma chave por chamada, e não um lote, de propósito: o fiscal do RF-165 tem
 * de dizer ao operador **qual** chave saiu e qual não saiu. Um `PATCH` com
 * várias operações devolve um status só, e um erro parcial viraria "algo deu
 * errado" sem dizer o quê, às 20h05 de 04/10.
 *
 * @throws Error com status e corpo truncado quando a API recusa.
 */
export async function apagarChave(creds: GlobalConfigCreds, key: string): Promise<void> {
  const response = await fetch(vercelApiUrl(`/v1/edge-config/${creds.edgeConfigId}/items`), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ items: [{ operation: "delete", key }] }),
    signal: AbortSignal.timeout(ADMIN_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "<corpo ilegível>");
    throw new Error(`delete de "${key}" falhou (http ${response.status}): ${body.slice(0, 300)}`);
  }
}
