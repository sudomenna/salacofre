/**
 * lib/config/calendar.ts
 *
 * Calendário canônico das corridas eleitorais 2026. Single source of truth
 * para "qual cargo/turno é o ATIVO hoje" — alimenta:
 *
 *   - O alias dinâmico de `projection:current` no Edge Config (ADR-0012).
 *     Antes de 04/10 → resolve para `(pres, 1)`; entre 04/10 e 25/10
 *     → `(pres, 2)`; antes de cada janela de governador também aliasa
 *     conforme a UF.
 *   - O dia D para o roadmap (`docs/product/roadmap.md`).
 *   - O badge "Próximo turno em X dias" do header (RF-090, S07).
 *
 * Adicionado em S05/F4c (ADR-0012). Substitui a constante implícita
 * `cargo=1, turno=1` espalhada por orchestrator, writer e reader.
 *
 * Constituição § 9 (stack Vercel): nenhum I/O aqui — datas hardcoded da
 * resolução TSE 2026. Se TSE publicar mudança de calendário, atualizar
 * `CALENDAR_2026` (e abrir ADR se for grande). Determinismo § 6: a
 * função `currentRace(now)` é pura, mesmo input → mesmo output.
 */

/** Cargo TSE. 1 = Presidente, 3 = Governador. */
export type Cargo = "pres" | "gov";

/** Turno eleitoral. */
export type Turno = 1 | 2;

/**
 * Uma corrida no calendário. `start` é o instante em que a corrida fica
 * ATIVA — geralmente o "dia da apuração" das 7h BRT. A corrida continua
 * ativa até `start` da próxima corrida.
 *
 * `start` aceita `Date` ou string ISO 8601 — convertido in-place pelo
 * helper `currentRace`. Mantemos string nas constantes pra facilitar
 * grep/diff sem precisar montar `new Date(2026, 9, 4, ...)`.
 */
export interface Race {
  start: Date | string;
  cargo: Cargo;
  turno: Turno;
}

/**
 * Calendário 2026 — datas conhecidas:
 *
 *   - 1º turno: 04/10/2026 (domingo). Janela ativa: 04/10 até 25/10.
 *   - 2º turno: 25/10/2026 (domingo). Janela ativa: 25/10 até fim do ano.
 *
 * Antes de 04/10/2026 a "corrida ativa" é `(pres, 1)` por convenção
 * (preview / pré-apuração / dev local) — não é apuração de verdade, mas
 * o consumer precisa de uma chave determinística pra ler.
 *
 * Governador segue o mesmo calendário do presidente em 2026 (eleição
 * geral). Como o read path SOMA por sigla via `projection:uf:<sigla>`,
 * não há ambiguidade gerencial — UF apurada de governador alimenta a
 * mesma chave de UF, mas o consumidor passa `cargo="gov"` no reader.
 */
export const CALENDAR_2026: Race[] = [
  // Pré-apuração — alias default antes do 1T.
  { start: "2026-01-01T00:00:00-03:00", cargo: "pres", turno: 1 },
  // 1T — 04/10/2026, 17h BRT (fechamento das urnas; antes disso é "warmup").
  // Usamos 00:00 BRT do dia 04 para que devs trabalhando de manhã já vejam
  // o estado "1T ativo".
  { start: "2026-10-04T00:00:00-03:00", cargo: "pres", turno: 1 },
  // 2T — 25/10/2026, 00:00 BRT. A virada do alias deve coincidir com a
  // archival do payload 1T (`projection:archive:pres:t1`). Essa archival é
  // feita por job dedicado em S07 (não nessa sprint).
  { start: "2026-10-25T00:00:00-03:00", cargo: "pres", turno: 2 },
];

/**
 * Resolve a corrida ATIVA no instante `now`. Default: `Date.now()`.
 *
 * Algoritmo: encontra a Race com maior `start` <= `now`. Se nenhuma
 * (now anterior a TODAS as datas — improvável dado o sentinel
 * 2026-01-01), retorna a primeira do calendário (default `pres t1`).
 *
 * @example
 * currentRace(new Date("2026-09-15"))
 * // → { cargo: "pres", turno: 1, start: "2026-01-01T..." }
 *
 * currentRace(new Date("2026-11-01"))
 * // → { cargo: "pres", turno: 2, start: "2026-10-25T..." }
 */
export function currentRace(now: Date = new Date()): Race {
  const t = now.getTime();
  // Ordena por start ASC e pega a última cujo start <= now.
  const sorted = [...CALENDAR_2026].sort((a, b) => {
    const ta = a.start instanceof Date ? a.start.getTime() : new Date(a.start).getTime();
    const tb = b.start instanceof Date ? b.start.getTime() : new Date(b.start).getTime();
    return ta - tb;
  });
  let active: Race | null = null;
  for (const race of sorted) {
    const ts = race.start instanceof Date ? race.start.getTime() : new Date(race.start).getTime();
    if (ts <= t) {
      active = race;
    } else {
      break;
    }
  }
  // `sorted` é construído a partir de `CALENDAR_2026` que tem >=1 entry;
  // fallback seguro pro Race default (`pres t1` 2026-01-01).
  return active ?? sorted[0] ?? { start: "2026-01-01T00:00:00-03:00", cargo: "pres", turno: 1 };
}

/** Shortcut: turno ativo (1 ou 2). */
export function currentTurno(now?: Date): Turno {
  return currentRace(now).turno;
}

/** Shortcut: cargo ativo ("pres" ou "gov"). */
export function currentCargo(now?: Date): Cargo {
  return currentRace(now).cargo;
}
