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
 * Desde o [ADR-0041](../../docs/architecture/adrs/0041-foto-candidato-blob-binario-cache-um-ano.md)
 * o módulo também escreve **binário** ({@link putBinary}, para a foto de
 * candidato) — no mesmo arquivo, e não num `write-binary.ts` paralelo, pela
 * mesma razão que o ADR-0032 rejeitou dois esquemas de caminho para dois
 * recursos parecidos.
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

/**
 * Um ano, para asset **imutável por construção de caminho** — hoje só a foto
 * de candidato ([ADR-0041](../../docs/architecture/adrs/0041-foto-candidato-blob-binario-cache-um-ano.md)
 * item 3).
 *
 * ## Por que isto NÃO contradiz os 60 s acima
 *
 * Os 60 s protegem um objeto **reescrito sob nome fixo**: a apuração muda a
 * cada ciclo, o caminho não, então um cache longo serviria apuração parada sem
 * erro em lugar nenhum. A foto é o oposto — ela é endereçada por
 * `SQ_CANDIDATO` (`candidatos/foto/<UF>/<SQ>.jpg`), então **foto diferente
 * significa candidato diferente, que significa caminho diferente**. Não existe
 * o cenário que os 60 s previnem: o CDN não tem como servir foto velha do
 * candidato certo, porque o candidato certo só tem uma foto sob aquele nome.
 *
 * Com cache de 60 s, cada leitura revalidaria um conteúdo que nunca muda —
 * custo puro, frescor zero. O único caso de reescrita real (o TSE corrige a
 * foto de um candidato) é resolvido por um `--force` explícito no importador,
 * e uma foto defasada por até 24 h nesse caso raro não é erro de apuração: é
 * uma foto.
 *
 * ⚠️ Não "conserte" este número de volta para 60 por consistência com o resto
 * do módulo. O ADR-0041 existe em boa parte para prevenir exatamente isso.
 */
export const BLOB_IMMUTABLE_MAX_AGE_SECONDS = 31_536_000;

/** Resultado de uma escrita — `skipped` é o caminho sem credencial. */
export interface BlobWriteResult {
  pathname: string;
  status: "written" | "skipped";
  /**
   * Tamanho do corpo gravado. `0` quando pulado.
   *
   * ⚠️ A unidade **difere entre os dois produtores**, e os dois números caem no
   * mesmo campo de log. `putJson` reporta `body.length` de uma string — unidades
   * UTF-16, ~0,1% abaixo dos bytes reais com nomes acentuados (ver lá).
   * `putBinary` reporta `body.byteLength` — bytes reais, sem aproximação, porque
   * num binário não existe outra leitura possível. Ao comparar as duas linhas de
   * log, lembre que a do JSON é um piso, não uma medida.
   */
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

/**
 * Faz upsert de UM objeto **binário** no Blob, em pathname fixo (ADR-0041
 * item 1).
 *
 * Mora no mesmo módulo que {@link putJson} por exigência do ADR-0032, reaplicada
 * pelo ADR-0041 a um terceiro recurso: um segundo módulo de escrita duplicaria a
 * lógica de no-op sem credencial, de log estruturado e da tríade
 * `access`/`allowOverwrite`/`addRandomSuffix` que torna a URL determinística.
 *
 * @param pathname Caminho já construído por `lib/blob/paths.ts` — com a extensão
 *                 do conteúdo (`candidatoFotoBlobPathname` devolve `.jpg`). Não
 *                 montar à mão.
 * @param body     Bytes do arquivo. `Buffer` é um `Uint8Array` e serve aqui sem
 *                 conversão.
 * @param opts     `contentType` é obrigatório: sem ele o Blob serviria a foto
 *                 como `application/octet-stream` e o browser a baixaria em vez
 *                 de exibi-la. `cacheControlMaxAge` default é
 *                 {@link BLOB_IMMUTABLE_MAX_AGE_SECONDS} — nunca os 60 s do
 *                 JSON de apuração, que existem para dado que muda a cada ciclo.
 * @throws Error quando o `put()` falha (rede, 4xx/5xx) — o caller decide se
 *         agrega a falha ou aborta. Mesmo contrato de {@link putJson}.
 */
export async function putBinary(
  pathname: string,
  body: Uint8Array,
  opts: { contentType: string; cacheControlMaxAge?: number },
): Promise<BlobWriteResult> {
  // `byteLength` — bytes reais, e não o `body.length` (UTF-16) que `putJson`
  // reporta. Ver o campo `bytes` de `BlobWriteResult`.
  const bytes = body.byteLength;

  if (!hasBlobWriteCredentials()) {
    logWarn("blob write skipped: missing BLOB_READ_WRITE_TOKEN", { pathname });
    return { pathname, status: "skipped", bytes: 0, url: null };
  }

  // O `PutBody` do `@vercel/blob` não lista `Uint8Array` — lista `Buffer` e
  // `ArrayBuffer`. Recortamos a fatia EXATA do buffer subjacente: passar
  // `body.buffer` cru gravaria o buffer inteiro quando o `Uint8Array` é uma
  // view parcial (o que um `subarray` devolve), escrevendo bytes que não são
  // os do arquivo — e um JPEG com cauda estranha ainda abre, então a falha
  // passaria despercebida.
  const arrayBuffer = body.buffer.slice(
    body.byteOffset,
    body.byteOffset + body.byteLength,
  ) as ArrayBuffer;

  const result = await put(pathname, arrayBuffer, {
    access: "public",
    contentType: opts.contentType,
    allowOverwrite: true,
    addRandomSuffix: false,
    cacheControlMaxAge: opts.cacheControlMaxAge ?? BLOB_IMMUTABLE_MAX_AGE_SECONDS,
  });

  logInfo("blob write ok", { pathname, bytes, contentType: opts.contentType });

  return { pathname, status: "written", bytes, url: result.url };
}
