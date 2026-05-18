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
 *   - ADR-0012 (S05/F4c — chaves nomeadas + alias dinâmico).
 *
 * Não-objetivos
 *   - Cache HTTP (delegado ao SDK / CDN).
 *   - Polling SWR no cliente (vive em `app/api/projection/route.ts` consumido
 *     via `useSWR` no front).
 */

import { get } from "@vercel/edge-config";

import { type Cargo, currentRace, type Turno } from "@/lib/config/calendar";
import type { EdgePayload, EdgePayloadUf } from "@/lib/edge-config/types";

/**
 * Monta a chave canônica `projection:current:<cargo>:t<turno>` (ADR-0012,
 * S05/F4c). Estrutura compatível com `projection:archive:<cargo>:t<turno>`
 * (arquivado pós-virada de turno em S07) — só troca o prefixo.
 */
function projectionKeyForRace(cargo: Cargo, turno: Turno): string {
  return `projection:current:${cargo}:t${turno}`;
}

/**
 * Lê o payload nacional do Edge Config. Por default resolve a chave via
 * `lib/config/calendar.currentRace()` — em 2026 antes de 25/10 retorna
 * `pres t1`, depois `pres t2`.
 *
 * Backward-compat (S04 e anterior): se `EDGE_CONFIG_LEGACY_KEY` estiver
 * ativo OU se a chave nomeada vier vazia E `projection:current` (chave
 * antiga, sem cargo/turno) tiver valor, retorna o legado. Isso permite
 * deploys parciais em S05 sem quebrar consumers antigos.
 *
 * Retorna `null` quando:
 *   - `EDGE_CONFIG` ausente (dev/preview sem credencial).
 *   - Chave não publicada ainda (pré-eleição absoluta).
 *
 * Caller decide o que fazer com `null` — `/api/projection` retorna 503
 * com `{ error: "no_payload" }`, e o page faz fallback para "Aguardando
 * dados".
 *
 * @param opts.cargo  Override do cargo ativo (útil pra preview de
 *                    governador / debug). Default: `currentCargo()`.
 * @param opts.turno  Override do turno ativo. Default: `currentTurno()`.
 */
export async function readProjection(opts?: {
  cargo?: Cargo;
  turno?: Turno;
}): Promise<EdgePayload | null> {
  if (!process.env.EDGE_CONFIG) return null;
  const race = currentRace();
  const cargo = opts?.cargo ?? race.cargo;
  const turno = opts?.turno ?? race.turno;

  try {
    // Primary: chave nomeada (S05+).
    const namedKey = projectionKeyForRace(cargo, turno);
    const namedPayload = await get<EdgePayload>(namedKey);
    if (namedPayload) return namedPayload;

    // Fallback: chave legada `projection:current` (S04). Só faz sentido se
    // o cargo/turno coincide com o ativo — caller que passou override
    // explícito não cai aqui.
    if (cargo === race.cargo && turno === race.turno) {
      const legacy = await get<EdgePayload>("projection:current");
      return legacy ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Backward-compat wrapper para consumers S04 que chamavam `readNationalProjection()`
 * sem args. Mantido durante S05–S07 para não quebrar callers existentes
 * (`app/api/projection/route.ts`, page handlers). Em S07 (polish) o objetivo
 * é migrar todos para `readProjection({...})` direto e remover este.
 */
export async function readNationalProjection(): Promise<EdgePayload | null> {
  return readProjection();
}

/**
 * Lê o payload ARQUIVADO de uma corrida — sufixo `:archive` em vez de
 * `:current` (ADR-0012, S06/F1). Usado pra acessar o resultado final do 1T
 * a partir de uma página em mode 2T:
 *
 *   `projection:archive:<cargo>:t<turno>`  →  ex. `projection:archive:pres:t1`
 *
 * O orchestrator grava o archive na transição de turno (S07 — virada 1T→2T)
 * congelando o último `projection:current:pres:t1` antes de mover a chave
 * dinâmica `projection:current` para `pres:t2`. Simetria total com
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
 * @param opts.cargo  Cargo arquivado. Default: cargo ativo (`currentRace`).
 * @param opts.turno  Turno arquivado. Default: turno ativo - 1 não faz
 *                    sentido aqui (caller passa explicitamente). Default
 *                    é turno ativo, que SÓ retornará algo se já houve
 *                    transição passada para o turno corrente.
 */
export async function readArchivedProjection(opts?: {
  cargo?: Cargo;
  turno?: Turno;
}): Promise<EdgePayload | null> {
  if (!process.env.EDGE_CONFIG) return null;
  const race = currentRace();
  const cargo = opts?.cargo ?? race.cargo;
  const turno = opts?.turno ?? race.turno;

  try {
    const key = `projection:archive:${cargo}:t${turno}`;
    const payload = await get<EdgePayload>(key);
    return payload ?? null;
  } catch {
    return null;
  }
}

/**
 * Lê o payload de drill-down de UMA UF do Edge Config.
 *
 * S05/F4c — chave para corridas com cargo/turno explícito:
 *   `projection:uf:<sigla>:<cargo>:t<turno>` (ex: `projection:uf:SP:pres:t1`).
 *
 * Backward-compat: tenta primeiro a chave nomeada; se vier nula, cai na
 * chave antiga `projection:uf:<sigla>` (S04).
 *
 * @param sigla UF de 2 letras maiúsculas. Não validado aqui — o caller
 *   (`/api/projection?uf=`) normaliza e rejeita inválido.
 * @param opts.cargo  Override do cargo. Default: cargo ativo.
 * @param opts.turno  Override do turno. Default: turno ativo.
 */
export async function readUfProjection(
  sigla: string,
  opts?: { cargo?: Cargo; turno?: Turno },
): Promise<EdgePayloadUf | null> {
  if (!process.env.EDGE_CONFIG) return null;
  const race = currentRace();
  const cargo = opts?.cargo ?? race.cargo;
  const turno = opts?.turno ?? race.turno;

  try {
    // Primary: chave nomeada (S05+).
    const namedKey = `projection:uf:${sigla}:${cargo}:t${turno}`;
    const named = await get<EdgePayloadUf>(namedKey);
    if (named) return named;

    // Fallback legacy só para corrida ativa.
    if (cargo === race.cargo && turno === race.turno) {
      const legacy = await get<EdgePayloadUf>(`projection:uf:${sigla}`);
      return legacy ?? null;
    }
    return null;
  } catch {
    return null;
  }
}
