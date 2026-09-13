/**
 * lib/blob/paths.ts
 *
 * **Ponto único** de construção de caminho e de URL do Vercel Blob — o
 * equivalente, para o Blob, do que `lib/edge-config/keys.ts` é para o Global
 * Config. Nada no repositório deve montar um pathname de blob por
 * concatenação ad hoc.
 *
 * ## Por que este módulo existe
 *
 * O [ADR-0026](../../docs/architecture/adrs/0026-cargos-senador-deputado-ingestao-e-read-path.md)
 * abriu o Vercel Blob como segundo mecanismo do read path, restrito ao
 * drill-down de UF de Deputado Federal. O
 * [ADR-0032](../../docs/architecture/adrs/0032-detalhe-municipal-vercel-blob.md)
 * generalizou a exceção para o detalhe municipal e as séries temporais de
 * Presidente/Governador, e foi **explícito** quanto a não abrir um segundo
 * padrão:
 *
 *   > "a implementação que materializa este ADR e a que materializa o ADR-0026
 *   > devem compartilhar o mesmo módulo de escrita/leitura Blob — não é
 *   > opcional, é a razão de existir um 'esquema de caminho' único em vez de
 *   > dois ad hoc."
 *
 * Por isso os dois recursos saem daqui: {@link ufDetailBlobPathname} (municípios
 * + séries, ADR-0032) e {@link deputadoUfBlobPathname} (drill-down de Deputado
 * Federal, ADR-0026). Os dois são a MESMA função de base
 * ({@link blobPathname}), com qualificadores diferentes.
 *
 * ## O esquema
 *
 * ```
 *   municipios/uf/<SIGLA>/<cargo>/t<turno>.json   municipios/uf/SP/pres/t1.json
 *   deputado/uf/<SIGLA>.json                      deputado/uf/SP.json
 * ```
 *
 * **Separador `/`, não `:`.** Os dois ADRs escreveram o caminho com
 * dois-pontos (`municipios:uf:SP:pres:t1.json`). Medido contra o store real em
 * 2026-09-08: o `put()` aceita dois-pontos, **mas a URL pública volta
 * percent-encoded** (`municipios%3Auf%3ASP%3Apres%3At1.json`). Como o ADR-0032
 * manda construir a URL a partir do pathname *sem lookup*, dois-pontos exigiria
 * `encodeURIComponent` em todo uso — e uma concatenação ingênua produziria um
 * 404 que só aparece em produção. Com `/` a URL sai limpa e o GET responde 200.
 *
 * Isto **não contraria** a decisão dos ADRs: o *onde* (Blob), o *recurso* e os
 * *qualificadores* (`uf`, `<sigla>`, `<cargo>`, `t<turno>`) seguem idênticos —
 * muda o separador, como já mudou no Global Config quando `keys.ts` trocou `:`
 * por `-` pelo mesmo tipo de motivo (padrão da plataforma, não gosto).
 *
 * ## A URL é determinística, e é derivada — nunca guardada
 *
 * `put()` com pathname fixo e `allowOverwrite: true` devolve sempre a mesma
 * URL (verificado empiricamente contra o store real: escrita, releitura,
 * sobrescrita e remoção). Então o read path **não precisa de índice nem de
 * lookup**: monta a URL a partir do pathname e do host público do store.
 *
 * O host sai do próprio `BLOB_READ_WRITE_TOKEN`, cujo formato é
 * `vercel_blob_rw_<storeId>_<segredo>`; o host público é
 * `https://<storeid em minúsculas>.public.blob.vercel-storage.com`. Nenhum
 * segredo vaza: só o `storeId` é usado, e ele já é público por construção (é o
 * subdomínio que qualquer leitor do site vê). `BLOB_PUBLIC_BASE_URL` existe
 * como override explícito — é o que os testes usam, e é a saída caso a Vercel
 * mude o formato do token.
 */

import type { Cargo, Turno } from "@/lib/config/calendar";

// ---------------------------------------------------------------------------
// Segmentos
// ---------------------------------------------------------------------------

/**
 * Um segmento de caminho de blob. Deliberadamente MAIS restrito do que o que o
 * Blob aceita: só o alfabeto que o Global Config já admite em nome de chave
 * (`^[A-Za-z0-9_-]+$`). Assim o mesmo dado (sigla, cargo, turno) produz um
 * identificador válido nos dois mecanismos, e nenhum caractere precisa de
 * escape na URL.
 */
export const BLOB_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Siglas de UF entram literalmente no caminho — validadas como em `keys.ts`. */
const UF_SIGLA_PATTERN = /^[A-Za-z]{2}$/;

/**
 * Valida um segmento; devolve o próprio para permitir uso inline.
 *
 * A mensagem aponta o caractere ofensor e a origem, pela mesma razão de
 * `assertValidGlobalConfigKey`: um caminho errado só falharia em produção, com
 * um 404 mudo do CDN.
 *
 * @throws Error quando o segmento é vazio ou tem caractere fora do padrão.
 */
export function assertValidBlobSegment(segment: string, context: string): string {
  if (BLOB_PATH_SEGMENT_PATTERN.test(segment)) return segment;

  if (segment.length === 0) {
    throw new Error(`segmento de caminho de Blob inválido (origem: ${context}): string vazia.`);
  }

  const offenders = [...new Set(segment.split("").filter((c) => !/[A-Za-z0-9_-]/.test(c)))];
  const colonHint = offenders.includes(":")
    ? ` O separador ":" produz URL percent-encoded no Blob — o esquema deste repositório usa "/" ` +
      `entre segmentos (ver lib/blob/paths.ts).`
    : "";

  throw new Error(
    `segmento de caminho de Blob inválido (origem: ${context}): "${segment}" contém ` +
      `${offenders.map((c) => `"${c}"`).join(", ")}. ` +
      `O padrão é ${BLOB_PATH_SEGMENT_PATTERN.source}.` +
      colonHint,
  );
}

/** Normaliza e valida a sigla — maiúscula é a forma canônica, como em `keys.ts`. */
function normaliseSigla(sigla: string, context: string): string {
  if (!UF_SIGLA_PATTERN.test(sigla)) {
    throw new Error(
      `sigla de UF inválida (origem: ${context}): "${sigla}". ` +
        `Esperado exatamente 2 letras (ex. "SP"). ` +
        `A sigla entra literalmente no caminho do blob.`,
    );
  }
  return sigla.toUpperCase();
}

// ---------------------------------------------------------------------------
// Construtores de pathname
// ---------------------------------------------------------------------------

/**
 * Junta segmentos validados com `/` e acrescenta `.json`.
 *
 * É a única função que produz um pathname neste repositório — os construtores
 * nomeados abaixo apenas escolhem os segmentos.
 */
export function blobPathname(segments: readonly string[], context: string): string {
  if (segments.length === 0) {
    throw new Error(`caminho de Blob vazio (origem: ${context}).`);
  }
  return `${segments.map((s) => assertValidBlobSegment(s, context)).join("/")}.json`;
}

/**
 * Detalhe por UF de uma corrida majoritária (ADR-0032): municípios + séries
 * temporais de Presidente/Governador.
 *
 * `municipios/uf/<SIGLA>/<cargo>/t<turno>.json` — ex. `municipios/uf/SP/pres/t1.json`.
 *
 * Os qualificadores são os mesmos da chave de Global Config
 * (`projection-uf-SP-pres-t1`, ADR-0012): Presidente e Governador coexistem em
 * cargo e turno simultâneos, então o caminho precisa dos dois.
 */
export function ufDetailBlobPathname(sigla: string, cargo: Cargo, turno: Turno): string {
  const uf = normaliseSigla(sigla, "ufDetailBlobPathname");
  return blobPathname(["municipios", "uf", uf, cargo, `t${turno}`], "ufDetailBlobPathname");
}

/**
 * Drill-down por UF de Deputado Federal (ADR-0026).
 *
 * `deputado/uf/<SIGLA>.json` — sem cargo nem turno: Deputado se decide em turno
 * único e não divide caminho com nenhuma outra corrida.
 *
 * Nasceu antes do consumidor, e de propósito: o ADR-0032 exige que os dois
 * recursos saiam do mesmo esquema, e um construtor que nasce junto do
 * consumidor nasce como segundo padrão. O consumidor chegou em 2026-09-12 —
 * `lib/blob/deputado-uf.ts` (leitura) e `writeDeputadoProjection` em
 * `lib/edge-config/writer.ts` (escrita).
 *
 * ⚠️ O comentário anterior dizia "o cargo 6 não é ingerido hoje". Isso deixou
 * de ser verdade em **2026-09-11**, quando a ingestão do cargo 6 entrou. Desde
 * o **ADR-0036 (2026-09-13)** ela é em granularidade zona (par município×zona,
 * ~6.110 alvos), varrida em 6 fatias a cada 5 min — **volta completa em 30
 * min**, não mais 15.
 */
export function deputadoUfBlobPathname(sigla: string): string {
  const uf = normaliseSigla(sigla, "deputadoUfBlobPathname");
  return blobPathname(["deputado", "uf", uf], "deputadoUfBlobPathname");
}

// ---------------------------------------------------------------------------
// Host público do store
// ---------------------------------------------------------------------------

/** `vercel_blob_rw_<storeId>_<segredo>`. */
const BLOB_TOKEN_PATTERN = /^vercel_blob_rw_([A-Za-z0-9]+)_[A-Za-z0-9]+$/;

/** Sufixo do host público de um store de Vercel Blob. */
const BLOB_PUBLIC_HOST_SUFFIX = ".public.blob.vercel-storage.com";

/**
 * Base pública do store, sem barra final — ex.
 * `https://jbtu251tioj3y57z.public.blob.vercel-storage.com`.
 *
 * Ordem de resolução:
 *   1. `BLOB_PUBLIC_BASE_URL` (override explícito; o que os testes usam).
 *   2. Derivada do `storeId` embutido no `BLOB_READ_WRITE_TOKEN`.
 *   3. `null` — ambiente sem Blob configurado (dev/preview sem credencial).
 *      Caller degrada; não lança.
 */
export function blobPublicBaseUrl(): string | null {
  const override = process.env.BLOB_PUBLIC_BASE_URL;
  if (override) return override.replace(/\/+$/, "");

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;

  const storeId = BLOB_TOKEN_PATTERN.exec(token)?.[1];
  if (!storeId) return null;

  return `https://${storeId.toLowerCase()}${BLOB_PUBLIC_HOST_SUFFIX}`;
}

/**
 * URL pública determinística de um pathname. `null` quando o ambiente não tem
 * Blob configurado — o read path trata isso como "detalhe indisponível", não
 * como erro (ADR-0032 item 3).
 */
export function blobUrlFor(pathname: string): string | null {
  const base = blobPublicBaseUrl();
  return base ? `${base}/${pathname}` : null;
}
