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
 *   - Tamanho-alvo: <30 KB para `projection:current` binário S04;
 *     **S05/F4c (multi-candidato 11 cands + cenarios_2t)**: <75 KB nacional,
 *     <20 KB por UF (top_candidatos + bucket). `writeEdgePayload` warna em
 *     450 KB no agregado (margem para limite duro de 512 KB do Edge Config),
 *     com warns dedicados por chave em 75 KB / 20 KB.
 *   - **S06/F4d (Fase 2 — mesorregião)**: adicionado `EdgePayloadUf.mesorregioes?`
 *     opcional. Footprint estimado por UF: ~80–120 bytes por mesorregião
 *     serializada (8 campos numéricos + nome + cod). SP tem ~15 mesorregiões
 *     → ~1.5–2 KB extras. UFs pequenas (SE = 2 meso) → <0.3 KB. Cabe no
 *     budget de 20 KB por UF sem regressão. Campo OPCIONAL: payload pode
 *     omitir quando `municipios.mesorregiao_cod` ainda não está populado.
 *   - Chaves nomeadas (S05/F4c — ADR-0012): além de `projection:current`,
 *     o orchestrator pode gravar `projection:current:pres:t1`,
 *     `:pres:t2`, `:gov:t1`, `:gov:t2`, e `projection:archive:pres:t1`
 *     (na transição 1T→2T). `projection:current` segue como ALIAS dinâmico
 *     resolvido por `lib/config/calendar.ts` → `(cargo, turno)` ativo.
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
 *
 * Multi-candidato (S05/F4c — ADR-0013, ADR-0014, ADR-0017):
 *   - `rank` substitui a noção binária "candidato A / B". É o ranking
 *     semântico do candidato (1 = líder por pct_projetado, 2 = segundo,
 *     ...), determinado em `compute_national` com tie-breaker estável.
 *   - `p_passa_2t` e `p_fecha_1t` são métricas multi-candidato derivadas
 *     do mesmo array de estimates do bootstrap (zero novo custo).
 */
export interface EdgeCandidate {
  id: number;
  nome: string;
  partido: string;
  /**
   * Token CSS literal — sempre da forma `var(--color-cand-N)` em payloads
   * S05+ (ADR-0013, paleta dinâmica por rank). Consumido direto em
   * `style={{ background: c.cor }}` no front-end (sem resolução
   * intermediária). Constituição § 2: nunca hex partidário, sempre token
   * canônico de app/globals.css. Em payloads antigos pode aparecer
   * `var(--color-pt)` / `var(--color-pl)` (legacy binário) — consumidores
   * S05+ devem aceitar ambos no decode (forward-compat).
   */
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
  /**
   * Rank semântico do candidato no agregado nacional (1 = líder por
   * `pct_projetado`, 2 = segundo, ...). Tie-breaker estável por
   * `candidato_id` ASC. Adicionado em S05/F4c — ADR-0013 (paleta visual
   * por rank) e ADR-0017 (transparência total: rank dirige qual camada
   * do hero/ranking exibe o candidato).
   *
   * Payloads pré-S05 não têm essa chave — consumidores devem coalescer
   * para `index + 1` no array `candidatos[]` (que já é ordenado por
   * pct_projetado desc desde S04).
   */
  rank: number;
  /**
   * Probabilidade em [0, 1] de o candidato terminar TOP-2 do 1º turno
   * — isto é, ir para o segundo turno OU ganhar no 1º (cobre os dois
   * "passa adiante"). Frequência empírica nos resamples do bootstrap
   * onde `pct_proj >= pct_2º_dos_outros`. Adicionado em S05/F4c
   * (ADR-0014) para a coluna "vai pro 2T" do ranking multi-camada
   * (RF-030.8). Em 2T, `p_passa_2t = p_vitoria` (degenera para a
   * mesma métrica). Pré-S05 ausente → consumidor usa fallback null/0.
   */
  p_passa_2t: number;
  /**
   * Probabilidade em [0, 1] de o candidato FECHAR o 1T sozinho
   * (`>= 50%+1` dos votos válidos no agregado nacional). Frequência
   * empírica nos resamples onde `pct_proj >= 50`. Adicionado em S05/F4c
   * (ADR-0014) para o gatilho "decisão no 1T" do HeadlineScore
   * (RF-030.9) e fonte do banner "fecha no 1T se >X". Sempre `0.0`
   * em payloads de 2T (vazio de semântica). Pré-S05 ausente →
   * consumidor coalesce para 0.
   */
  p_fecha_1t: number;
}

export interface EdgeNational {
  /**
   * Candidatos da corrida. Ordenação canônica (FIX S04 — carry-over #1 da
   * retro S03):
   *   1. Líder semântico (id == `candidato_a_id`, rank == 1)
   *   2. Segundo lugar (id == `candidato_b_id`, rank == 2)
   *   3. Demais por `pct_projetado` desc, tie-breaker por `id` asc.
   *
   * S05/F4c — multi-candidato (ADR-0017): array passa a conter TODOS os
   * candidatos com presença no histórico/snapshot, não só top-2. UI usa
   * `rank` para distribuir nas 3 camadas (hero rank 1–2, ranking rank 3–6,
   * lista compacta rank 7+).
   *
   * Por que `candidato_a_id` / `candidato_b_id` continuam: backward-compat
   * com consumidores S04 que liam o "duelo" binário. Em S05 a semântica
   * é "líder e segundo por rank", não "duelo top-2 fechado".
   */
  candidatos: EdgeCandidate[];
  /** Posição da agulha em [-1, 1]. -1 = vitória certa de B, +1 = vitória certa de A. */
  needle_position: number;
  needle_band: NeedleBand;
  /**
   * ID do líder semântico (rank == 1) por `pct_projetado` agregado. Pode ser
   * `null` quando a projeção ainda não tem candidatos válidos (pré-apuração
   * / RF-017 caso degenerado total). Consumidores devem fazer fallback para
   * `candidatos[0]?.id`. S05+: equivale a `candidatos[rank == 1].id`.
   */
  candidato_a_id: number | null;
  /**
   * ID do segundo lugar (rank == 2). `null` quando há ≤1 candidato. Em
   * payloads S05+ multi-candidato a semântica continua "segundo por
   * pct_projetado", não "adversário binário".
   */
  candidato_b_id: number | null;
  /**
   * Probabilidade em [0, 1] de a eleição NÃO terminar no 1º turno (ou seja,
   * P(nenhum candidato fecha 50%+1 sozinho)). Calculado pelo orchestrator
   * a partir dos resamples do bootstrap (S05/F4c — ADR-0014). Frequência
   * empírica `mean(max(estimates_por_cand) < 0.50)`. `null` em payloads
   * de 2T (semântica vazia: o segundo turno JÁ é o cenário).
   *
   * Alimenta o medidor "P(2º turno)" do HeadlineScore (RF-030.7) e o
   * gatilho narrativo do banner "decidido no 1T se >X". Pré-S05 ausente →
   * consumidor coalesce para null e UI esconde o medidor.
   */
  p_segundo_turno_overall: number | null;
  /**
   * Top-3 pares (líder, segundo) mais prováveis no 2º turno — ordenados
   * por `prob` desc. Cada `par` é uma tupla de candidato_ids `[A, B]`.
   * Calculado por contagem de frequência nos resamples do bootstrap:
   * para cada resample, o par `(top1_rank, top2_rank)` é registrado;
   * os 3 pares mais frequentes entram aqui. Adicionado em S05/F4c
   * (ADR-0014).
   *
   * `[]` em payloads de 2T (não faz sentido projetar cenário 2T quando
   * já estamos no 2T). Alimenta o bloco "Cenários para o segundo turno"
   * (RF-030.8) com chips dos top-3 duelos. Pré-S05 ausente → consumidor
   * coalesce para `[]` e UI esconde a seção.
   */
  cenarios_2t: Array<{ par: [number, number]; prob: number }>;
  /**
   * Chamadas recentes (broadcast-style breaking news) emitidas pelo
   * orchestrator quando uma UF muda para `bucket === "chamada"` ou quando
   * a corrida nacional atinge gatilhos narrativos (decisão no 1T, K-1
   * convergência, etc.). Adicionado em S06/F4d (Fase 3) para alimentar
   * `<BreakingNewsTicker />` no topo de `/governador` e `/`.
   *
   * Cada item é uma sentença pronta para renderizar (NUNCA LLM —
   * constituição § 2, ADR-0005). Templates determinísticos por evento.
   *
   * Ordenação canônica: `ts` DESC (mais recente primeiro), top 5 itens
   * (ringbuffer no orchestrator). Pré-S06/F4d ausente — consumidor
   * coalesce para `[]` e UI esconde o ticker quando vazio.
   */
  chamadas_recentes?: Array<{ ts: string; texto: string }>;
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
  /**
   * Top-3 candidatos da UF por `pct_projetado` desc. Adicionado em S05/F4c
   * (ADR-0017 — transparência total): a página de UF mostra TODOS os
   * candidatos visíveis, mas a home / mapa precisa de um resumo compacto
   * com no máximo 3 para chips e tooltips. `pct` é 0–100. Tie-breaker
   * estável por candidato_id ASC.
   *
   * Pré-S05 ausente → consumidor coalesce para `[]` e UI degrada para
   * só `lider` + `margem_*` (comportamento S04).
   */
  top_candidatos: Array<{ id: number; pct: number }>;
  /**
   * Para corridas de GOVERNADOR no 1T (cargo=3): `true` se o líder
   * projetado tem `pct_projetado >= 50%+1` (decide no 1T); `false` se
   * vai para 2º turno. `null` quando não aplicável (cargo presidencial
   * 1T — a decisão de 2T para presidente é NACIONAL, não estadual; ou
   * cargo gov em 2T). Adicionado em S05/F4c para o grid de governadores
   * (RF-040+ em S06).
   *
   * Em payloads presidenciais S05 fica sempre `null`. Pré-S05 ausente
   * → consumidor coalesce para null.
   */
  vai_a_2t: boolean | null;
  /**
   * Estado declarativo da UF para o grid de governadores e indicadores
   * de status no mapa. Adicionado em S05/F4c (ADR-0017):
   *
   *   - `"chamada"`: UF chamada para o líder (margem decisiva, ver
   *     `chamada: true`). Ortogonal ao `vai_a_2t`.
   *   - `"decidido_1t"`: governador eleito no 1T (`vai_a_2t === false`
   *     e `pct_projetado >= 50%+1`).
   *   - `"vai_2t"`: governador disputa 2T (`vai_a_2t === true`).
   *   - `"indefinido"`: ainda tossup, margem dentro do CI ou apuração
   *     baixa demais para chamar.
   *
   * Pré-S05 ausente → consumidor coalesce para `"chamada"` se
   * `chamada === true`, senão `"indefinido"`.
   */
  bucket: "decidido_1t" | "vai_2t" | "indefinido" | "chamada";
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
 * (sem `p_vitoria` — só faz sentido no agregado nacional). `ci95` é o
 * intervalo de confiança do `pct_projetado`.
 *
 * `votos_atuais` e `votos_projetados` são absolutos NA UF — alimentam a
 * coluna "Votos" do `<CandidateRow />` (RF-033) e a métrica "Total: X
 * reportados" do wireframe da spec 004. Adicionados em S04/F2 para que a
 * página de UF deixe de exibir "—" no slot de votos.
 */
export interface EdgeUfCandidate {
  id: number;
  nome: string;
  partido: string;
  cor: string;
  /** Votos absolutos REPORTADOS no momento (TSE). */
  votos_atuais: number;
  /** Votos absolutos PROJETADOS (modelo) ao final da apuração da UF. */
  votos_projetados: number;
  pct_atual: number;
  pct_projetado: number;
  ci95: EdgeCi95;
}

/**
 * Linha de município no drill-down de UF. Suficiente para alimentar
 * `<MunicipioTable />` (RF-037) e os mapas (`UFMapDuo`, `BubbleMap`).
 *
 * S04/F2 — antes só tínhamos `{cod_ibge, nome, pct_apurado, lider}`,
 * o que forçava `<MunicipioTable />` a usar placeholders para margem e
 * votos. Enriquecemos para que a tabela mostre dados reais.
 *
 * `votos_reportados` é um mapa `{candidato_id → votos}` (não um total) —
 * permite o caller calcular margem absoluta para qualquer par de
 * candidatos, e somar para obter o total do município. Pequeno em
 * bytes (até ~4–6 entradas por município = 30–60 bytes/município),
 * dentro do orçamento de payload UF.
 *
 * `cod_ibge` é STRING (char(7) IBGE — preserva zero à esquerda;
 * data-model.md § Municípios usa o mesmo tipo). Manter aqui como
 * string é canônico — `00000NN` não cabe em `number` sem perda.
 */
export interface EdgeUfMunicipio {
  cod_ibge: string;
  nome: string;
  pct_apurado: number; // 0–100
  /** Líder no município com a margem em pp sobre o segundo. */
  lider: {
    candidato_id: number;
    /** Partido do líder, para chip da tabela. */
    partido: string;
    /** Votos absolutos do líder no município. */
    votos: number;
    /** Margem em pp sobre o 2º (sempre ≥ 0). */
    margem_pp: number;
  };
  /**
   * Votos absolutos por candidato no município. Sparse — só candidatos
   * com presença nos snapshots. Chave numérica (candidato_id).
   */
  votos_reportados: Record<number, number>;
}

/**
 * Séries temporais da corrida na UF. Cada array é ordenado por `ts` ASC
 * (constituição § 6 — determinismo). Janela = últimas 24h ou início da
 * apuração, o que for menor (filtro aplicado no orchestrator).
 *
 * Origem: SELECT em `projections` filtrado por (cargo, turno, uf), agrupado
 * por `ts` — cada ciclo do modelo (60s) gera 1 ponto. Em 8h de apuração
 * isso dá até 480 pontos por série × 3 séries = 1440 valores numéricos
 * (~30–40 KB serializado). Dentro do envelope ~5–10 KB declarado em
 * data-model.md? **Não.** Carry-over: se aproximar dos 450KB no payload
 * total da UF, paginar via chave separada `projection:uf:<sigla>:series`.
 */
export interface EdgeUfSeriesTemporais {
  /** Margem do líder ao longo do tempo (RF-040). Em pp. */
  margem: Array<{ ts: string; margem_pp: number }>;
  /** p_vitoria do líder ao longo do tempo (RF-041). p em [0, 1]. */
  p_vitoria: Array<{ ts: string; p: number }>;
  /** % apurado da UF ao longo do tempo (RF-042). Monotônico não-decrescente. */
  turnout: Array<{ ts: string; pct_apurado: number }>;
}

/**
 * Linha agregada por mesorregião IBGE — S06/F4d (Fase 2).
 *
 * Adicionada para alimentar o bloco "Apuração por mesorregião" da página
 * `/uf/[sigla]/governador` (spec 005, print 3 NYT-style). A agregação é
 * feita server-side por `aggregate_by_mesorregiao` (api/model/project.py)
 * sobre `municipios.mesorregiao_cod` (migration 0005).
 *
 * Footprint: ~80–120 bytes por linha JSON. SP (~15 mesorregiões) gera
 * ~1.5–2 KB extras no payload UF — cabe no budget de 20 KB.
 *
 * Origem (agregação backend): cada município contribui com
 * `votos_reportados` agregados na mesorregião; `lider_*` é o candidato
 * com mais votos na mesorregião; `pct_apurado` é a média ponderada pelo
 * total de votos por município (consistência com agregação UF).
 *
 * `delta_vs_2022` é OPCIONAL (null quando não há histórico mapeado para
 * a mesorregião — caso comum em dev/preview enquanto seed histórico de
 * mesorregião não chega).
 *
 * Determinismo (constituição § 6): array ordenado por `cod` ASC.
 */
export interface EdgeMesorregiao {
  /** Código IBGE da mesorregião (4 chars, ex.: "3515" = SP / Metropolitana). */
  cod: string;
  /** Nome IBGE da mesorregião (ex.: "Metropolitana de São Paulo"). */
  nome: string;
  /** % apurado médio (ponderado pelo total de votos por município) na mesorregião. */
  pct_apurado: number; // 0–100
  /** ID do candidato líder agregado na mesorregião. */
  lider_candidato_id: number;
  /** % do líder sobre o total de votos válidos agregados. */
  lider_pct: number; // 0–100
  /** Margem em pp do líder sobre o 2º (≥ 0). */
  margem: number; // 0–100
  /**
   * Swing em pp do `lider_pct` vs 2022 (positivo = ganho do líder atual
   * em relação ao líder de 2022 na mesma mesorregião). `null` quando
   * histórico 2022 não está mapeado para a mesorregião — UI deve
   * mostrar "—".
   */
  delta_vs_2022: number | null;
  /** Quantos municípios compõem a mesorregião (debug/tooltip). */
  num_municipios: number;
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
  /**
   * Municípios para drill-down do mapa + tabela RF-037. Schema completo
   * (margem, votos por candidato) habilitado em S04/F2 — antes era apenas
   * `{cod_ibge, nome, pct_apurado, lider}` e a tabela usava placeholders.
   * Zonas individuais NÃO cabem nesta chave (>512KB no pior caso).
   */
  municipios: EdgeUfMunicipio[];
  /**
   * Séries temporais (margem, p_vitoria, turnout) que alimentam os charts
   * RF-040/041/042. Adicionado em S04/F2. **Optional** porque payloads
   * gravados pré-S04/F2 não têm essa chave — consumidores devem coalescer
   * para `{margem: [], p_vitoria: [], turnout: []}` para manter
   * compatibilidade durante o rollout.
   *
   * S05/F4c (ADR-0014): a série "p_vitoria do líder" (top-2 binário) é
   * insuficiente em corrida multi-candidato. A série por-candidato vai
   * morar numa CHAVE DEDICADA `projection:uf:<sigla>:series-por-cand`
   * (não inline aqui) para não inflar `EdgePayloadUf` além do orçamento
   * de 20 KB. Esta chave dedicada é placeholder até spec de "evolução
   * histórica multi-candidato" (S06+); o tipo correspondente ainda não
   * está definido — apenas reservamos a chave.
   */
  series_temporais?: EdgeUfSeriesTemporais;
  /**
   * Agregação por mesorregião IBGE — S06/F4d (Fase 2). Alimenta o bloco
   * "Apuração por mesorregião" da página `/uf/[sigla]/governador` (print 3
   * NYT-style). Lista ordenada por `cod` ASC (constituição § 6).
   *
   * **Optional** porque:
   *   - Payloads pré-S06/F4d não têm essa chave.
   *   - Em dev/preview o seed de `municipios.mesorregiao_cod` (migration
   *     0005) pode ainda não estar populado — orchestrator omite o campo
   *     em vez de emitir array vazio (semântica: "dado não disponível",
   *     não "zero mesorregiões").
   *
   * Consumidores devem coalescer para `[]` e UI deve esconder o bloco
   * inteiro quando ausente (não mostrar título "Apuração por mesorregião"
   * sem conteúdo).
   *
   * Footprint estimado: 80–120 bytes/linha. SP (~15 meso) ≈ 1.5–2 KB;
   * UFs pequenas (SE = 2 meso) ≈ <0.3 KB. Dentro do budget de 20 KB/UF.
   */
  mesorregioes?: EdgeMesorregiao[];
}
