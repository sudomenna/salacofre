/**
 * lib/edge-config/types.ts
 *
 * Canonical TypeScript shape of the Edge Config payload published by the
 * model orchestrator (spec 002) and consumed by every read-side surface
 * (RSC pages, `<HeadlineScore />`, mapa, drill-down de UF).
 *
 * Fonte de verdade: docs/architecture/data-model.md § "Payload do Edge Config".
 * Quando alterar o shape, atualize o markdown PRIMEIRO e replique aqui.
 *
 * Notes
 *   - Um payload encapsula UMA corrida: 1 cargo (1 = Presidente, 3 = Governador)
 *     × 1 turno. Múltiplas corridas vivem em chaves distintas.
 *   - Chave canônica nacional: `projection:current` (e.g. presidência turno 1).
 *     Para múltiplos cargos / turnos, sufixar a chave (ex.
 *     `projection:current:gov-uf-sp`). T14 finaliza o esquema definitivo de chaves.
 *   - Chave de drill-down por UF: `projection:uf:<sigla>` (ex. `projection:uf:SP`).
 *     Inclui municípios e zonas — definido em `EdgePayloadUf` abaixo.
 *   - Determinismo (constituição § 6): todos os números aqui são funções puras
 *     de (snapshots, historical_results, seed). Não há ruído introduzido na
 *     serialização.
 *   - Tamanho-alvo: <30 KB para `projection:current`, <10 KB por UF.
 *     `writeEdgePayload` warna quando ultrapassar 450 KB (margem para limite
 *     duro de 512 KB do Edge Config).
 */

// ---------------------------------------------------------------------------
// Enums / unions (mantêm-se "magic-number-free" no resto do código)
// ---------------------------------------------------------------------------

/** Cargo TSE — só os 2 que o SalaCofre cobre (eleição geral 2026). */
export type Cargo = 1 | 3; // 1 = Presidente, 3 = Governador

/** Turno eleitoral. */
export type Turno = 1 | 2;

/**
 * Bandas da agulha (needle) — mapeiam `needle_position` em [-1, 1] para
 * uma narrativa. Bordas exatas vivem em `app/api/model/project/p_vitoria.py`
 * (T10) e em `docs/specs/002-modelo-estatistico/design.md § "Posição da
 * agulha"`. A duplicação aqui é intencional: o tipo serve como contrato com
 * o front-end, não como única fonte da regra.
 */
export type NeedleBand =
  | "very_likely_a"
  | "likely_a"
  | "lean_a"
  | "tossup"
  | "lean_b"
  | "likely_b"
  | "very_likely_b";

// ---------------------------------------------------------------------------
// Bloco "nacional" — alimenta <HeadlineScore />, agulha e barras
// ---------------------------------------------------------------------------

/**
 * Um candidato dentro do bloco nacional. Note que `pct_*` são porcentagens
 * (0–100), não frações (0–1) — segue a convenção do `data-model.md` linha
 * 122 (`pct_apurado_total: 0–100`). Probabilidades (`p_vitoria`) ficam em
 * [0, 1] porque é a convenção universal de stats.
 */
export interface EdgeCandidate {
  id: number;
  nome: string;
  partido: string;
  /** Hex (`#RRGGBB`) — token semântico do design system, NUNCA cor partidária oficial (constituição § 2). */
  cor: string;
  votos_atuais: number;
  votos_projetados: number;
  /** % do total apurado no momento (0–100). */
  pct_atual: number;
  /** % projetado pelo modelo (0–100). */
  pct_projetado: number;
  /** CI95 inferior (0–100). */
  pct_projetado_lower: number;
  /** CI95 superior (0–100). */
  pct_projetado_upper: number;
  /** Probabilidade de vitória em [0, 1]. */
  p_vitoria: number;
}

export interface EdgeNational {
  /**
   * Candidatos da corrida. Ordenação canônica (FIX S04 — carry-over #1 da
   * retro S03):
   *   1. Líder semântico (id == `candidato_a_id`)
   *   2. Segundo lugar (id == `candidato_b_id`)
   *   3. Demais por `pct_projetado` desc, tie-breaker por `id` asc.
   *
   * Por que importa: a agulha consome `candidatos[0]` como "A" e
   * `candidatos[1]` como "B". A versão anterior ordenava por `id` asc,
   * o que invertia "A"/"B" quando o líder tinha id maior que o segundo.
   */
  candidatos: EdgeCandidate[];
  /** Posição da agulha em [-1, 1]. -1 = vitória certa de B, +1 = vitória certa de A. */
  needle_position: number;
  needle_band: NeedleBand;
  /**
   * ID do líder ("A") por `pct_projetado` agregado. Pode ser `null` quando
   * a projeção ainda não tem candidatos válidos (pré-apuração / RF-017
   * caso degenerado total). Consumidores devem fazer fallback para
   * `candidatos[0]?.id`.
   */
  candidato_a_id: number | null;
  /** ID do segundo lugar ("B"). `null` quando há ≤1 candidato. */
  candidato_b_id: number | null;
}

// ---------------------------------------------------------------------------
// Bloco "por UF" — alimenta o choropleth e o ranking estadual
// ---------------------------------------------------------------------------

/**
 * Uma linha por UF (27 no total, incluindo DF). O contrato `data-model.md`
 * usa `chamada: boolean` para sinalizar se aquela UF já foi "chamada" para
 * um candidato (cf. design.md § "Chamada de UF").
 *
 * `margem_projetada_ci` é uma tupla [lower, upper] em pontos percentuais
 * (não fração). `swing_vs_2022` é pp também (positivo = swing em favor do
 * `lider`).
 */
export interface EdgeUfRow {
  /** Sigla de 2 letras maiúsculas (ex. "SP", "DF"). */
  sigla: string;
  pct_apurado: number; // 0–100
  /** ID do candidato líder no momento. */
  lider: number;
  /** Margem atual em pontos percentuais. */
  margem_atual: number;
  /** Margem projetada (pp). */
  margem_projetada: number;
  /** CI95 da margem projetada (pp). */
  margem_projetada_ci: [number, number];
  /** UF "chamada" para o líder? (design.md § "Chamada de UF") */
  chamada: boolean;
  /** Swing em pp vs. 2022 (positivo = em favor do líder). */
  swing_vs_2022: number;
}

// ---------------------------------------------------------------------------
// "What's powering the forecast" — composição do modelo
// ---------------------------------------------------------------------------

/**
 * Pesos relativos das 3 fontes que alimentam a projeção. Soma deve ser 1
 * (validar em runtime no orchestrator — T12 — não em tipo).
 *
 * Antes de qualquer apuração: `pre_election` ≈ 1.
 * Durante a apuração: `actual_results` cresce até ≈ 1 no fim.
 * `model` é a contribuição da extrapolação por swing.
 */
export interface EdgeComposition {
  pre_election: number; // [0, 1]
  model: number; // [0, 1]
  actual_results: number; // [0, 1]
}

// ---------------------------------------------------------------------------
// Payload principal (chave `projection:current`)
// ---------------------------------------------------------------------------

export interface EdgePayload {
  /** Timestamp ISO 8601 do momento em que o modelo rodou. */
  ts: string;
  cargo: Cargo;
  turno: Turno;
  /** % total apurado da corrida (0–100). */
  pct_apurado_total: number;
  /** Número de UFs com pelo menos 1 zona apurada (0–27). */
  ufs_apuradas: number;
  national: EdgeNational;
  por_uf: EdgeUfRow[];
  /**
   * Frases curtas (1–3) geradas por template — NUNCA LLM (constituição § 2,
   * ADR-0005). Cada item é uma sentença completa pronta para renderizar.
   */
  insights: string[];
  composition: EdgeComposition;
}

// ---------------------------------------------------------------------------
// Payload de drill-down por UF (chave `projection:uf:<sigla>`)
// ---------------------------------------------------------------------------

/**
 * CI95 inferior/superior em pp (0–100) — usado tanto na agregação UF quanto
 * por candidato individual. Mantemos uma struct nomeada (em vez de tuple
 * `[lower, upper]`) para evitar acesso posicional em consumidores e dar
 * nomes ao que está ambíguo num par numérico.
 */
export interface EdgeCi95 {
  lower: number; // 0–100
  upper: number; // 0–100
}

/**
 * Candidato dentro do drill-down de UF. Subset do `EdgeCandidate` nacional
 * (sem `votos_*` totais e sem `p_vitoria` — esses só fazem sentido no
 * agregado nacional). `ci95` é o intervalo de confiança do `pct_projetado`.
 */
export interface EdgeUfCandidate {
  id: number;
  nome: string;
  partido: string;
  cor: string;
  pct_atual: number;
  pct_projetado: number;
  ci95: EdgeCi95;
}

/**
 * Drill-down de UMA UF. Chave canônica: `projection:uf:<sigla>` (ex.
 * `projection:uf:SP`). ~5–10 KB por UF conforme data-model.md § "Payload do
 * Edge Config" linha 158. Inclui municípios para o mapa zoom-in.
 *
 * `needle_position` / `needle_band` aqui são da CORRIDA NESTA UF (governador
 * num turno; para presidente, refletem a vantagem do líder na UF). Quando a
 * spec for presidente turno 2 numa UF, a agulha vira o "termômetro" da UF
 * para a chamada do vencedor nacional.
 */
export interface EdgePayloadUf {
  /** Sigla de 2 letras maiúsculas (ex. "SP", "DF"). */
  uf: string;
  ts: string;
  cargo: Cargo;
  turno: Turno;
  pct_apurado: number; // 0–100
  candidatos: EdgeUfCandidate[];
  needle_position: number; // [-1, 1]
  needle_band: NeedleBand;
  /** Municípios para drill-down do mapa. Subset; lista zona-a-zona não cabe nesta chave. */
  municipios: Array<{
    cod_ibge: string;
    nome: string;
    pct_apurado: number; // 0–100
    /** ID do candidato líder no município. */
    lider: number;
  }>;
}
