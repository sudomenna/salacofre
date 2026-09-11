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
 *   - ADR-0012 (S05/F4c — chaves nomeadas + alias dinâmico), com a nota de
 *     emenda de 2026-09-08: separador `-` no lugar de `:`, porque o padrão
 *     documentado do Global Config (`^[A-Za-z0-9_-]+$`) não admite
 *     dois-pontos. Nenhuma chave é montada aqui — tudo vem de
 *     `lib/edge-config/keys.ts`.
 *
 * Não-objetivos
 *   - Cache HTTP (delegado ao SDK / CDN).
 *   - Polling SWR no cliente (vive em `app/api/projection/route.ts` consumido
 *     via `useSWR` no front).
 */

import { get } from "@vercel/edge-config";

import { type Cargo, currentPresidentialTurno, type Turno } from "@/lib/config/calendar";
import {
  archiveProjectionKey,
  currentProjectionKey,
  DEPRECATED_COLON_CURRENT_ALIAS_KEY,
  deprecatedColonArchiveProjectionKey,
  deprecatedColonCurrentProjectionKey,
  deprecatedColonLegacyUfAliasKey,
  deprecatedColonUfProjectionKey,
  LEGACY_CURRENT_ALIAS_KEY,
  legacyUfAliasKey,
  ufProjectionKey,
} from "@/lib/edge-config/keys";
import type { EdgePayload, EdgePayloadUf } from "@/lib/edge-config/types";

/**
 * Tenta cada chave em ordem e devolve o primeiro valor não-vazio.
 *
 * Custo: uma leitura por chave, e **só no caminho de miss** — a primeira
 * chave que responder encerra a busca. No caminho saudável (chave nova
 * publicada) é exatamente uma leitura, igual a antes.
 *
 * A ordem sempre é: chave nova → chave deprecada com dois-pontos → alias.
 * A chave deprecada existe porque não foi possível verificar se a API da
 * Vercel de fato recusa `:`; se ela sempre aceitou, há dado publicado sob o
 * esquema antigo e o read path não pode ficar cego durante a migração.
 * **Remover essa camada em `DEPRECATED_COLON_KEYS_REMOVAL_DATE`
 * (2026-10-26, dia seguinte ao 2º turno)** — ver `lib/edge-config/keys.ts`.
 */
async function getFirst<T>(keys: readonly string[]): Promise<T | null> {
  for (const key of keys) {
    const value = await get<T>(key);
    if (value) return value;
  }
  return null;
}

/**
 * Lê o payload nacional do Edge Config. Por default resolve a chave via
 * `lib/config/calendar.currentPresidentialRace()` — em 2026 antes de 25/10 retorna
 * `pres t1`, depois `pres t2`.
 *
 * Backward-compat, em duas camadas, ambas só no caminho de miss:
 *   1. `projection-current-<cargo>-t<turno>` — esquema atual.
 *   2. `projection:current:<cargo>:t<turno>` — esquema deprecado com
 *      dois-pontos, caso a API da Vercel o tenha aceitado. **Remover em
 *      2026-10-26** (ver `lib/edge-config/keys.ts`).
 *   3. `projection-current` / `projection:current` — alias dinâmico S04,
 *      sem cargo/turno. Só para a corrida ATIVA: caller que passou override
 *      explícito não cai aqui.
 *
 * Retorna `null` quando:
 *   - `EDGE_CONFIG` ausente (dev/preview sem credencial).
 *   - Chave não publicada ainda (pré-eleição absoluta).
 *
 * Caller decide o que fazer com `null` — `/api/projection` retorna 503
 * com `{ error: "no_payload" }`, e o page faz fallback para "Aguardando
 * dados".
 *
 * @param opts.cargo  **Obrigatório.** O cargo que se quer ler. Não há default:
 *                    o ADR-0028 removeu o default vindo do calendário porque
 *                    um caller distraído recebia o payload presidencial com
 *                    forma válida; substituí-lo por um literal `"pres"` teria
 *                    deixado o mesmo footgun de pé. Apontado pelo
 *                    `constitution-guard` em 2026-09-11 e fechado no mesmo dia:
 *                    todos os call sites já declaravam o cargo, então torná-lo
 *                    obrigatório não custou nada e eliminou o caminho errado.
 * @param opts.turno  Override do turno ativo. Default: `currentPresidentialTurno()`.
 */
export async function readProjection(opts: {
  cargo: Cargo;
  turno?: Turno;
}): Promise<EdgePayload | null> {
  if (!process.env.EDGE_CONFIG) return null;
  // O calendário responde só pelo TURNO presidencial (ADR-0028). O cargo é
  // OBRIGATÓRIO e não tem default: qualquer default — vindo do calendário ou
  // literal — faria um caller distraído receber o payload presidencial com
  // forma válida e conteúdo errado.
  const turnoPresidencial = currentPresidentialTurno();
  const cargo = opts.cargo;
  const turno = opts.turno ?? turnoPresidencial;

  // O alias legado sem cargo (`projection-current`) só existiu para a corrida
  // presidencial — comparar contra o literal, não contra o que o calendário
  // devolve, para que ele nunca seja consultado em nome de outro cargo.
  const isActiveRace = cargo === "pres" && turno === turnoPresidencial;

  try {
    return await getFirst<EdgePayload>([
      currentProjectionKey(cargo, turno),
      // DEPRECADO — remover em 2026-10-26.
      deprecatedColonCurrentProjectionKey(cargo, turno),
      ...(isActiveRace
        ? [
            LEGACY_CURRENT_ALIAS_KEY,
            // DEPRECADO — remover em 2026-10-26.
            DEPRECATED_COLON_CURRENT_ALIAS_KEY,
          ]
        : []),
    ]);
  } catch {
    return null;
  }
}

/**
 * Projeção nacional da corrida **presidencial**.
 *
 * Nasceu como wrapper backward-compat de S04 (`readProjection()` sem args) e,
 * desde o ADR-0028 (2026-09-11), declara o cargo explicitamente em vez de
 * herdar um default. O nome continua sem o cargo por compatibilidade com os
 * callers; o que ele lê está fixado aqui, num lugar só.
 *
 * Presidente é o único cargo com arquivo agregado nacional no TSE
 * (`lib/tse/targets.ts` — só cargo 1 gera alvo `br-`), então "projeção
 * nacional" é, por construção, presidencial. Governador, Senador e Deputado
 * Federal não têm equivalente: seus agregados nacionais são somas de UF.
 */
export async function readNationalProjection(): Promise<EdgePayload | null> {
  return readProjection({ cargo: "pres", turno: currentPresidentialTurno() });
}

/**
 * Lê o payload ARQUIVADO de uma corrida — segmento `archive` em vez de
 * `current` (ADR-0012, S06/F1). Usado pra acessar o resultado final do 1T
 * a partir de uma página em mode 2T:
 *
 *   `projection-archive-<cargo>-t<turno>`  →  ex. `projection-archive-pres-t1`
 *
 * O orchestrator grava o archive na transição de turno (S07 — virada 1T→2T)
 * congelando o último `projection-current-pres-t1` antes de mover a chave
 * dinâmica `projection-current` para `pres-t2`. Simetria total com
 * `readProjection`: mesmo shape `EdgePayload`, mesma serialização.
 *
 * Comportamento de retorno
 *   - `null` quando `EDGE_CONFIG` ausente (dev/preview sem credencial).
 *   - `null` quando a chave archive ainda não foi gravada (caso comum
 *     pré-1T, ou se o orchestrator ainda não rodou a transição). UI deve
 *     degradar graciosamente — `<TurnoOneRecap recap={null} />` retorna
 *     `null` sem placeholder mentiroso (ADR-0016).
 *
 * Caller típico
 *   ```ts
 *   const recap = await readArchivedProjection({ cargo: "pres", turno: 1 });
 *   // ... <TurnoOneRecap recap={recap} />
 *   ```
 *
 * @param opts.cargo  **Obrigatório** — ver `readProjection`.
 * @param opts.turno  Turno arquivado. Default: turno ativo - 1 não faz
 *                    sentido aqui (caller passa explicitamente). Default
 *                    é turno ativo, que SÓ retornará algo se já houve
 *                    transição passada para o turno corrente.
 */
export async function readArchivedProjection(opts: {
  cargo: Cargo;
  turno?: Turno;
}): Promise<EdgePayload | null> {
  if (!process.env.EDGE_CONFIG) return null;
  // Ver a nota em `readProjection`: cargo nunca vem do calendário (ADR-0028).
  const cargo = opts.cargo;
  const turno = opts.turno ?? currentPresidentialTurno();

  try {
    return await getFirst<EdgePayload>([
      archiveProjectionKey(cargo, turno),
      // DEPRECADO — remover em 2026-10-26.
      deprecatedColonArchiveProjectionKey(cargo, turno),
    ]);
  } catch {
    return null;
  }
}

/**
 * Lê o payload de drill-down de UMA UF do Edge Config.
 *
 * S05/F4c — chave para corridas com cargo/turno explícito:
 *   `projection-uf-<SIGLA>-<cargo>-t<turno>` (ex: `projection-uf-SP-pres-t1`).
 *
 * Backward-compat, só no caminho de miss: chave nomeada → chave deprecada
 * com dois-pontos (**remover em 2026-10-26**) → alias legado
 * `projection-uf-<SIGLA>` / `projection:uf:<SIGLA>` (S04).
 *
 * @param sigla UF de 2 letras. `lib/edge-config/keys.ts` valida o formato e
 *   normaliza para maiúscula — sigla malformada lança, e o `catch` desta
 *   função converte em `null` (mesma degradação de qualquer outra falha de
 *   leitura). O caller (`/api/projection?uf=`) já normaliza antes.
 * @param opts.cargo  Override do cargo. Default: cargo ativo.
 * @param opts.turno  Override do turno. Default: turno ativo.
 */
export async function readUfProjection(
  sigla: string,
  opts: { cargo: Cargo; turno?: Turno },
): Promise<EdgePayloadUf | null> {
  if (!process.env.EDGE_CONFIG) return null;
  // O calendário responde só pelo TURNO presidencial (ADR-0028). O cargo é
  // OBRIGATÓRIO e não tem default: qualquer default — vindo do calendário ou
  // literal — faria um caller distraído receber o payload presidencial com
  // forma válida e conteúdo errado.
  const turnoPresidencial = currentPresidentialTurno();
  const cargo = opts.cargo;
  const turno = opts.turno ?? turnoPresidencial;

  // O alias legado sem cargo (`projection-current`) só existiu para a corrida
  // presidencial — comparar contra o literal, não contra o que o calendário
  // devolve, para que ele nunca seja consultado em nome de outro cargo.
  const isActiveRace = cargo === "pres" && turno === turnoPresidencial;

  try {
    return await getFirst<EdgePayloadUf>([
      ufProjectionKey(sigla, cargo, turno),
      // DEPRECADO — remover em 2026-10-26.
      deprecatedColonUfProjectionKey(sigla, cargo, turno),
      ...(isActiveRace
        ? [
            legacyUfAliasKey(sigla),
            // DEPRECADO — remover em 2026-10-26.
            deprecatedColonLegacyUfAliasKey(sigla),
          ]
        : []),
    ]);
  } catch {
    return null;
  }
}
