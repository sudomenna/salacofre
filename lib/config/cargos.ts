/**
 * lib/config/cargos.ts
 *
 * **Mapa único dos cargos cobertos pelo SalaCofre.** Antes de 2026-09-11 esse
 * conhecimento estava espalhado por quatro lugares independentes, todos travados
 * em `1 | 3` e sem relação entre si:
 *
 *   - `lib/tse/targets.ts` — `Target.cargo`, `VALID_CARGOS`, `getActiveCargos`,
 *     `formatCargo`, `parseWhitelist` (código numérico do TSE);
 *   - `lib/edge-config/types.ts` — `Cargo = 1 | 3` (código numérico, no payload);
 *   - `lib/config/calendar.ts` — `Cargo = "pres" | "gov"` (token de chave, ADR-0012);
 *   - `app/api/ingest/[cargo]/route.ts` — `parseCargoSegment`, o único lugar que
 *     mapeava slug de URL para código.
 *
 * Estender a cobertura para Senador e Deputado Federal (ADR-0026) exigiria editar
 * os quatro em sincronia, sem nada que forçasse a sincronia. Este módulo é a
 * fonte única; os outros passam a derivar dele.
 *
 * ## O que NÃO muda
 *
 * Os **dois tipos `Cargo`** continuam separados de propósito (ADR-0026 item 2,
 * ADR-0028 item 2): o numérico (`CargoTse`) espelha o TSE e viaja no payload; o
 * de token (`lib/config/calendar.ts`) nomeia chaves do Global Config e caminhos
 * do Blob. Este módulo não os funde — dá o conversor explícito (`cargoToken`,
 * `cargoFromToken`) que antes não existia.
 *
 * Constituição § 9: nenhum I/O aqui. Tabela estática, funções puras.
 */

import type { Cargo as CargoToken } from "@/lib/config/calendar";

/**
 * Código numérico do cargo, como o TSE publica (campo `cd` em `carg[]` do EA20,
 * e o `-c<cargo4>` no nome do arquivo).
 *
 * 1 = Presidente · 3 = Governador · 5 = Senador · 6 = Deputado Federal.
 *
 * Os códigos 2 (Vice-Presidente), 4 (Vice-Governador) e 7/8 (Deputado Estadual /
 * Distrital) existem no TSE e **não** são cobertos: vice não tem votação própria,
 * e as assembleias estaduais estão fora do escopo do produto.
 */
export type CargoTse = 1 | 3 | 5 | 6;

/** Metadados de um cargo coberto. */
export interface CargoInfo {
  /** Código do TSE. */
  readonly cd: CargoTse;
  /** Token de namespacing de chave (Global Config / Blob) — ADR-0012. */
  readonly token: CargoToken;
  /** Segmento de rota aceito por `/api/ingest/[cargo]` e pelas páginas. */
  readonly slug: string;
  /** Rótulo para leitor humano. */
  readonly label: string;
  /**
   * Vagas em disputa por UF. Presidente e Governador elegem 1 por abrangência;
   * o Senado renova **2/3** em 2026, o que são **2 vagas por UF** (54 no total)
   * — não 1, apesar de o kit de UI rotular "1 vaga"
   * (ver `docs/architecture/adrs/0029-home-mobile-first-mapa-primeiro-fiel-ao-kit.md`).
   * Deputado Federal é proporcional: o nº de cadeiras varia por UF (8 a 70), então
   * fica `null` aqui e vem da tabela de bancadas.
   */
  readonly vagasPorUf: number | null;
  /** `true` quando a disputa admite 2º turno. Senador e Deputado são turno único. */
  readonly temSegundoTurno: boolean;
  /**
   * `true` só para Presidente: é o único cargo com arquivo agregado nacional
   * (`br-c0001-...`) no CDN do TSE. Os demais só têm UF/município/zona, e o
   * agregado nacional deles é soma nossa.
   */
  readonly temArquivoBr: boolean;
  /** `true` quando o cargo é proporcional (votos viram cadeiras via quociente). */
  readonly proporcional: boolean;
  /**
   * Granularidade de ingestão **padrão** deste cargo (ADR-0026 item 1).
   *
   * `"zona"` (≈6.110 pares por cargo) é o que o estimador precisa para a regra
   * de três (ADR-0021, RF-011/012) — é o modo de Presidente e Governador.
   *
   * `"uf"` (27 GETs por cargo) é o de Senador e Deputado Federal: com quatro
   * cargos em zona o fan-out passaria de 24 mil GETs por ciclo, inviável sob
   * qualquer `TSE_MAX_RPS` permitido. O custo é que esses dois cargos não
   * alimentam projeção zona a zona — decisão explícita do ADR-0026, revisável
   * depois do simulado 2.
   *
   * `TSE_GRANULARIDADE` no ambiente sobrepõe isto para TODOS os cargos —
   * é escotilha de diagnóstico, não configuração de produção.
   */
  readonly granularidade: "uf" | "zona";
  /**
   * Teto de requisições por segundo **deste cargo**, quando `TSE_MAX_RPS` não
   * está definida no ambiente (constituição § 1).
   *
   * Por que é por cargo, e não um número só: os quatro crons podem disparar no
   * MESMO minuto — as cadências de 5 e 15 minutos coincidem com a de 1 minuto
   * de Presidente e Governador nos minutos 0, 15, 30 e 45. Cada invocação tem
   * seu próprio bucket (o rate limiter é singleton **de processo**, e o Fluid
   * Compute isola instâncias), então o que o TSE vê no IP é a **soma**.
   *
   * Medido em 2026-09-11, com todos em 40: pico de **160 rps** com quatro
   * simultâneos e **120** com três — acima do teto documentado de 100, que
   * bloqueia o IP por 10 minutos. O default de 40 tinha sido calibrado para
   * DOIS cargos (2 x 40 = 80) e não sobreviveu à entrada de Senador e Deputado.
   *
   * Calibragem atual — pior caso agregado **80 rps**, 20% abaixo do teto:
   *
   *   | cargo      | alvos | rps | duração do ciclo |
   *   |------------|-------|-----|------------------|
   *   | Presidente | 6.110 |  35 | ~175 s           |
   *   | Governador | 6.110 |  35 | ~175 s           |
   *   | Senador    |    27 |   5 | ~5 s             |
   *   | Deputado   |    27 |   5 | ~5 s             |
   *
   * Os cargos de granularidade UF pedem 27 arquivos: 5 rps os entrega em 5
   * segundos, e gastar 40 rps neles seria comprar 0,7 s de latência ao preço de
   * metade da margem de segurança do dia D. Os ~175 s dos pesados continuam
   * dentro do `maxDuration` de 300 s.
   */
  readonly rpsMax: number;
}

/**
 * Tabela canônica. A ordem é a de exibição nas abas
 * (`components/layout/CargoTabs.tsx`), não a numérica do TSE.
 */
export const CARGOS: readonly CargoInfo[] = [
  {
    cd: 1,
    token: "pres",
    slug: "presidente",
    label: "Presidente",
    vagasPorUf: 1,
    temSegundoTurno: true,
    temArquivoBr: true,
    proporcional: false,
    granularidade: "zona",
    rpsMax: 35,
  },
  {
    cd: 3,
    token: "gov",
    slug: "governador",
    label: "Governador",
    vagasPorUf: 1,
    temSegundoTurno: true,
    temArquivoBr: false,
    proporcional: false,
    granularidade: "zona",
    rpsMax: 35,
  },
  {
    cd: 5,
    token: "sen",
    slug: "senador",
    label: "Senador",
    vagasPorUf: 2,
    temSegundoTurno: false,
    temArquivoBr: false,
    proporcional: false,
    granularidade: "uf",
    rpsMax: 5,
  },
  {
    cd: 6,
    token: "dep",
    slug: "deputado-federal",
    label: "Deputado Federal",
    vagasPorUf: null,
    temSegundoTurno: false,
    temArquivoBr: false,
    proporcional: true,
    granularidade: "uf",
    rpsMax: 5,
  },
] as const;

/** Todos os códigos cobertos, na ordem da tabela. */
export const CARGOS_TSE: readonly CargoTse[] = CARGOS.map((c) => c.cd);

const POR_CD = new Map<number, CargoInfo>(CARGOS.map((c) => [c.cd, c]));
const POR_TOKEN = new Map<string, CargoInfo>(CARGOS.map((c) => [c.token, c]));
const POR_SLUG = new Map<string, CargoInfo>(CARGOS.map((c) => [c.slug, c]));

/** Type guard — `true` se o número é um cargo coberto. */
export function isCargoTse(n: number): n is CargoTse {
  return POR_CD.has(n);
}

/** Metadados do cargo, ou `undefined` se não for coberto. */
export function cargoInfo(cd: CargoTse): CargoInfo {
  const info = POR_CD.get(cd);
  // Inalcançável pelo tipo; a guarda existe para o caso de um `as CargoTse`
  // indevido em código de borda.
  if (!info) throw new Error(`[cargos] código de cargo não coberto: ${cd}`);
  return info;
}

/** Código numérico do TSE → token de chave (`1` → `"pres"`). */
export function cargoToken(cd: CargoTse): CargoToken {
  return cargoInfo(cd).token;
}

/** Token de chave → código numérico (`"pres"` → `1`). */
export function cargoFromToken(token: CargoToken): CargoTse {
  const info = POR_TOKEN.get(token);
  if (!info) throw new Error(`[cargos] token de cargo desconhecido: ${token}`);
  return info.cd;
}

/**
 * Resolve o segmento de rota de `/api/ingest/[cargo]` e das páginas de cargo.
 *
 * Aceita o **código** (`"1"`, `"5"`) ou o **slug** (`"presidente"`,
 * `"deputado-federal"`), case-insensitive. Devolve `null` para qualquer outra
 * coisa — o caller responde 400, sem revelar quais valores existem.
 */
export function parseCargoSegment(raw: string): CargoTse | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  const porSlug = POR_SLUG.get(s);
  if (porSlug) return porSlug.cd;
  const n = Number(s);
  return Number.isInteger(n) && isCargoTse(n) ? n : null;
}

/**
 * Pior caso agregado de requisições por segundo contra o IP do TSE: todos os
 * cargos cobertos disparando ao mesmo tempo.
 *
 * Não é hipótese — os crons de `vercel.ts` coincidem nos minutos 0, 15, 30 e
 * 45, porque as cadências de 5 e 15 minutos caem sobre a de 1 minuto dos
 * majoritários. O teto documentado do TSE é 100 rps por IP, com bloqueio de
 * 10 minutos, e a constituição § 1 exige margem **bem abaixo** disso, não
 * "exatamente no limite".
 */
export function piorCasoAgregadoRps(): number {
  return CARGOS.reduce((acc, c) => acc + c.rpsMax, 0);
}

/**
 * Teto de rps de um ciclo que cobre VÁRIOS cargos no mesmo processo.
 *
 * O ciclo genérico (`/api/ingest`, sem segmento) percorre os cargos
 * sequencialmente dentro de uma invocação, com **um** bucket. Sua contribuição
 * ao IP é a de um processo só, então ele pode usar o maior teto entre os cargos
 * que cobre — não a soma, e não o menor (que arrastaria o fan-out pesado a
 * 1.222 s, muito além do `maxDuration`).
 */
export function rpsMaxParaCargos(cargos: readonly CargoTse[]): number {
  if (cargos.length === 0) return Math.min(...CARGOS.map((c) => c.rpsMax));
  return Math.max(...cargos.map((c) => cargoInfo(c).rpsMax));
}
