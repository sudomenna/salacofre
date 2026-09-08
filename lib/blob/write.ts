/**
 * lib/blob/write.ts
 *
 * Escrita no Vercel Blob — o primitivo compartilhado pelo detalhe municipal de
 * Presidente/Governador ([ADR-0032](../../docs/architecture/adrs/0032-detalhe-municipal-vercel-blob.md))
 * e, quando existir, pelo drill-down de Deputado Federal
 * ([ADR-0026](../../docs/architecture/adrs/0026-cargos-senador-deputado-ingestao-e-read-path.md)).
 * Um único ponto de escrita, pela mesma razão que `lib/blob/paths.ts` é um
 * único ponto de caminho.
 *
 * ## `cacheControlMaxAge` não é detalhe
 *
 * O default do `@vercel/blob` é **um mês**. Num objeto reescrito a cada 60 s
 * isso significaria o CDN servindo o mesmo detalhe municipal por 30 dias — o
 * `next: { revalidate: 60 }` do lado do leitor revalidaria contra um CDN
 * congelado, e a página mostraria a apuração parada sem nenhum erro em lugar
 * nenhum. Gravamos com **60 s**, o mínimo que o Blob aceita, alinhado à
 * cadência de escrita do ADR-0011.
 *
 * ## Sem credencial é no-op, não erro
 *
 * Espelha `writeEdgePayload` (`lib/edge-config/writer.ts`): preview, CI e dev
 * local sem `BLOB_READ_WRITE_TOKEN` logam uma linha estruturada e seguem. Uma
 * exceção aqui derrubaria o ciclo inteiro do orchestrator por falta de um
 * segredo que esses ambientes não têm por design.
 */

import { put } from "@vercel/blob";

import { logInfo, logWarn } from "@/lib/tse/log";

/**
 * Segundos de cache do objeto no CDN e no browser. 60 é o **mínimo** aceito
 * pelo Blob e a cadência de escrita de Presidente/Governador (ADR-0011).
 */
export const BLOB_CACHE_CONTROL_MAX_AGE_SECONDS = 60;

/** Resultado de uma escrita — `skipped` é o caminho sem credencial. */
export interface BlobWriteResult {
  pathname: string;
  status: "written" | "skipped";
  /** Bytes do JSON serializado. `0` quando pulado. */
  bytes: number;
  /** URL pública devolvida pelo `put()`. `null` quando pulado. */
  url: string | null;
}

/** `true` quando o ambiente tem credencial de escrita no Blob. */
export function hasBlobWriteCredentials(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Faz upsert de UM objeto JSON no Blob, em pathname fixo.
 *
 * `allowOverwrite: true` + `addRandomSuffix: false` são o que tornam a URL
 * determinística — a premissa que permite o read path montar a URL a partir do
 * pathname, sem índice nem lookup (ADR-0026, reafirmado pelo ADR-0032).
 *
 * @param pathname Caminho já construído por `lib/blob/paths.ts`. Não montar à mão.
 * @param value    Valor JSON-serializável.
 * @throws Error quando o `put()` falha (rede, 4xx/5xx) — o caller decide se
 *         agrega a falha ou aborta.
 */
export async function putJson(pathname: string, value: unknown): Promise<BlobWriteResult> {
  // `body.length` é comprimento em unidades UTF-16, não em bytes — a MESMA
  // convenção que `writeEdgePayload` e `itemBytes` usam do lado do Global
  // Config, para os dois números serem comparáveis nos logs. Com nomes
  // acentuados isso fica ~0,1% abaixo da contagem real de bytes (medido: 248.171
  // contra 248.473 no objeto de SP com 645 municípios). Suficiente para
  // instrumentação; não use como base de um limite duro.
  const body = JSON.stringify(value);

  if (!hasBlobWriteCredentials()) {
    logWarn("blob write skipped: missing BLOB_READ_WRITE_TOKEN", { pathname });
    return { pathname, status: "skipped", bytes: 0, url: null };
  }

  const result = await put(pathname, body, {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
    addRandomSuffix: false,
    cacheControlMaxAge: BLOB_CACHE_CONTROL_MAX_AGE_SECONDS,
  });

  logInfo("blob write ok", { pathname, bytes: body.length });

  return { pathname, status: "written", bytes: body.length, url: result.url };
}
