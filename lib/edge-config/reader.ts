/**
 * lib/edge-config/reader.ts
 *
 * Reader de baixo nível do Edge Config para o read path.
 *
 * Lê via SDK oficial `@vercel/edge-config` quando a connection string
 * `EDGE_CONFIG` está configurada. Em dev/preview sem credencial, faz
 * fallback determinístico para um payload "vazio" — comportamento espelhado
 * do `writer.ts` (no-op + warn estruturado em vez de throw).
 *
 * Covers
 *   - RF-019, RF-020 (leitura da projeção via Edge Config) — read side.
 *   - ADR-0001 (Edge Config como único caminho de leitura no read path).
 *
 * Não-objetivos
 *   - Cache HTTP (delegado ao SDK / CDN).
 *   - Polling SWR no cliente (vive em `app/api/projection/route.ts` consumido
 *     via `useSWR` no front).
 */

import { get } from "@vercel/edge-config";

import type { EdgePayload, EdgePayloadUf } from "@/lib/edge-config/types";

/**
 * Lê o payload nacional `projection:current` do Edge Config.
 *
 * Retorna `null` quando:
 *   - `EDGE_CONFIG` ausente (dev/preview sem credencial).
 *   - Chave não publicada ainda (pré-eleição absoluta).
 *
 * Caller decide o que fazer com `null` — `/api/projection` retorna 503
 * com `{ error: "no_payload" }`, e o page faz fallback para "Aguardando
 * dados".
 */
export async function readNationalProjection(): Promise<EdgePayload | null> {
  if (!process.env.EDGE_CONFIG) return null;
  try {
    const payload = await get<EdgePayload>("projection:current");
    return payload ?? null;
  } catch {
    return null;
  }
}

/**
 * Lê o payload de drill-down de UMA UF do Edge Config.
 *
 * @param sigla UF de 2 letras maiúsculas. Não validado aqui — o caller
 *   (`/api/projection?uf=`) normaliza e rejeita inválido.
 */
export async function readUfProjection(sigla: string): Promise<EdgePayloadUf | null> {
  if (!process.env.EDGE_CONFIG) return null;
  try {
    const payload = await get<EdgePayloadUf>(`projection:uf:${sigla}`);
    return payload ?? null;
  } catch {
    return null;
  }
}
