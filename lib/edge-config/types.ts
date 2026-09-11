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
 *   - Chave canônica nacional: `projection-current` (e.g. presidência turno 1).
 *     Para múltiplos cargos / turnos, sufixar a chave (ex.
 *     `projection-current-gov-uf-sp`). T14 finaliza o esquema definitivo de chaves.
 *   - Chave de drill-down por UF: `projection-uf-<sigla>` (ex. `projection-uf-SP`).
 *     Traz o RESUMO da UF — candidatos, agulha, bucket, mesorregiões. O
 *     detalhe municipal e as séries temporais NÃO vivem mais aqui (ADR-0032,
 *     ver abaixo).
 *   - Determinismo (constituição § 6): todos os números aqui são funções puras
 *     de (snapshots, historical_results, seed). Não há ruído introduzido na
 *     serialização.
 *   - **Fronteira Global Config × Blob (ADR-0032, 2026-09-08)**:
 *     `EdgePayloadUf.municipios` e `EdgePayloadUf.series_temporais` foram
 *     REMOVIDOS deste envelope e passaram a viver no Vercel Blob
 *     (`lib/blob/uf-detail.ts`, `municipios/uf/<SIGLA>/<cargo>/t<turno>.json`).
 *     Motivo medido, não estimado: 5.572 municípios a ~206 B cada = 1,10 MB só
 *     do array `municipios` para UM cargo — acima do limite do store INTEIRO.
 *     O tipo que o orchestrator ENVIA (com os dois campos) é `UfPayloadInput`;
 *     o tipo ARMAZENADO no Global Config é `EdgePayloadUf`. São distintos de
 *     propósito: o tipo armazenado não deve declarar campos que o store não
 *     guarda.
 *   - Tamanho-alvo: <30 KB para `projection-current` binário S04;
 *     **S05/F4c (multi-candidato 11 cands + cenarios_2t)**: <75 KB nacional.
 *     Por UF, o orçamento de 20 KB dos comentários S05 foi escrito quando
 *     `municipios` ainda estava inline; sem ele a UF típica fica na casa de
 *     poucos KB. `writeEdgePayload` warna em 450 KB por chave, e
 *     `guardStoreSize` mede o **store inteiro** contra o limite real de 1 MB
 *     (não os 512 KB que este cabeçalho citava até 2026-09-08 — número errado,
 *     corrigido pelo ADR-0032).
 *   - **S06/F4d (Fase 2 — mesorregião)**: adicionado `EdgePayloadUf.mesorregioes?`
 *     opcional. Footprint estimado por UF: ~80–120 bytes por mesorregião
 *     serializada (8 campos numéricos + nome + cod). SP tem ~15 mesorregiões
 *     → ~1.5–2 KB extras. UFs pequenas (SE = 2 meso) → <0.3 KB. Cabe no
 *     budget de 20 KB por UF sem regressão. Campo OPCIONAL: payload pode
 *     omitir quando `municipios.mesorregiao_cod` ainda não está populado.
 *   - Chaves nomeadas (S05/F4c — ADR-0012): além de `projection-current`,
 *     o orchestrator pode gravar `projection-current-pres-t1`,
 *     `-pres-t2`, `-gov-t1`, `-gov-t2`, e `projection-archive-pres-t1`
 *     (na transição 1T→2T). `projection-current` segue como ALIAS dinâmico
 *     resolvido por `lib/config/calendar.ts` → `(cargo, turno)` ativo.
 *   - **Separador `-`, não `:`** (emenda ao ADR-0012, 2026-09-08): o padrão
 *     documentado de nome de chave do Global Config é `^[A-Za-z0-9_-]+$` e
 *     não admite dois-pontos. Nenhuma chave é montada à mão — todas vêm de
 *     `lib/edge-config/keys.ts`, que também valida.
 */
import type { CargoTse } from "@/lib/config/cargos";

// ---------------------------------------------------------------------------
// Enums / unions (mantêm-se "magic-number-free" no resto do código)
// ---------------------------------------------------------------------------

/** Cargo TSE — só os 2 que o SalaCofre cobre (eleição geral 2026). */
// Reexporta o tipo canônico (`lib/config/cargos.ts`) em vez de redeclará-lo:
// até 2026-09-11 esta linha era `1 | 3` e vivia dessincronizada de
// `lib/tse/targets.ts`, que tinha a mesma união repetida 12 vezes.
export type Cargo = CargoTse; // 1 = Presidente, 3 = Governador, 5 = Senador, 6 = Deputado Federal

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
// Participação — abstenção, brancos/nulos e "Outros" (S07/Fase 1a)
// ---------------------------------------------------------------------------

/**
 * Denominador de uma métrica de participação. **Rotulado explicitamente**
 * porque o hero do 1º turno mistura três bases diferentes na mesma tela
 * (seis termômetros) — sem rótulo, o leitor somaria percentuais que não
 * pertencem ao mesmo universo.
 *
 *   - `"votaveis"` — % sobre os **votos a votáveis concorrentes**
 *     (válidos + anulados + sub judice). É a base do campo `pvap` do TSE,
 *     conforme o dicionário oficial de leiautes
 *     (`docs/reference/tse-2026-leiautes.md`). **Não** é "% dos válidos":
 *     o rótulo na UI deve dizer "% dos votos a votáveis".
 *   - `"comparecimento"` — % sobre quem compareceu (base de brancos/nulos).
 *   - `"eleitores_instalados"` — % sobre os eleitores aptos das seções já
 *     instaladas (base da abstenção). Não é o eleitorado total do país:
 *     enquanto a apuração corre, só as seções instaladas entram no
 *     denominador.
 */
export type ParticipacaoBase = "votaveis" | "comparecimento" | "eleitores_instalados";

/**
 * Segunda base de uma métrica de candidato — % sobre **quem compareceu**
 * (`e.c` do EA20), em contraste com a base default `votaveis` (`v.vvc`).
 *
 * Por que existe (S07/Fase 2 — decisão E2 do plano de extrapolação):
 *   O numerador é o MESMO nos dois casos (votos projetados do candidato);
 *   só o denominador muda. Publicar as duas bases custa uma divisão no
 *   estimador (mesmo `idx` de bootstrap → arrays pareados de verdade) e
 *   evita que o front-end tente derivar uma da outra, o que exigiria
 *   conhecer `vvc/c` e produziria um IC inventado.
 *
 * Identidade da base (EA20: `Σvap + vb + tvn + van + vansj + vscv = c`):
 *   candidatos + Outros + brancos + nulos = 100% de quem compareceu
 *   **menos** anulados e sub judice. O resíduo é pequeno e a legenda da UI
 *   o declara — não arredondamos para "somam 100". A abstenção fica FORA
 *   dessa soma (base própria `eleitores_instalados`).
 *
 * Percentuais em 0–100, como o resto do payload. `pct_atual` é `null`
 * quando ainda não há razão literal (nenhuma zona apurada).
 *
 * **Sempre opcional** onde aparece: payloads pré-S07/Fase 2 (e os três
 * fixtures de `tests/fixtures/edge-config/`) não têm a chave. Consumidor na
 * base `comparecimento` que não encontra o campo deve renderizar
 * "aguardando projeção" (ADR-0017 — permanece no DOM) e **nunca** cair de
 * volta no número de `votaveis`: seria exibir um valor sob o rótulo de
 * outro denominador.
 */
export interface EdgeBaseComparecimento {
  /** % observado agora sobre o comparecimento (0–100), ou null. */
  pct_atual: number | null;
  /** % projetado sobre o comparecimento (0–100). */
  pct_projetado: number;
  /** CI95 inferior (0–100). */
  lower: number;
  /** CI95 superior (0–100). */
  upper: number;
}

/**
 * Uma métrica de participação projetada pelo modelo (regra de três sobre
 * as zonas apuradas + bootstrap para o IC95 — spec 002 / api/model/turnout.py).
 *
 * Todos os percentuais em 0–100 (convenção do payload, ver `EdgeCandidate`).
 *
 * `pct_atual` é `null` quando ainda não há zona apurada suficiente para
 * uma razão literal — UI mostra o termômetro **sem** marcador de apurado
 * e escreve "sem apuração" (nunca esconde a métrica: ADR-0017).
 */
export interface EdgeParticipacaoMetric {
  /** % observado agora (razão literal das zonas apuradas), ou null. */
  pct_atual: number | null;
  /** % projetado ao final da apuração (0–100). */
  pct_projetado: number;
  /** CI95 inferior (0–100). */
  lower: number;
  /** CI95 superior (0–100). */
  upper: number;
  /** Denominador da métrica — dirige o rótulo exibido. */
  base: ParticipacaoBase;
}

/**
 * Bloco de participação do payload — S07/Fase 2 (hero de seis termômetros
 * no 1º turno). Cada métrica é **opcional**: o orchestrator OMITE a chave
 * quando não é calculável (0 zonas com aptos > 0, histórico ausente etc.).
 * Omitir ≠ zero. A UI renderiza o termômetro em estado "aguardando
 * projeção" — sempre no DOM (ADR-0017 proíbe esconder camadas).
 *
 * O bloco inteiro é opcional em `EdgeNational` / `EdgePayloadUf` para não
 * quebrar payloads e fixtures pré-S07.
 */
export interface EdgeParticipacao {
  /** Abstenção — sobre os eleitores das seções instaladas. */
  abstencao?: EdgeParticipacaoMetric & { base: "eleitores_instalados" };
  /** Brancos + nulos agregados — sobre o comparecimento. */
  brancos_nulos?: EdgeParticipacaoMetric & { base: "comparecimento" };
  /**
   * Agregado dos candidatos de rank ≥ 4 ("Outros candidatos"), com IC95
   * derivado do MESMO array de resamples do bootstrap dos candidatos —
   * por isso mora aqui e não é reconstruído no front-end. Quando ausente,
   * a UI cai em `100 − Σtop3` **sem faixa de incerteza** e com nota
   * "IC indisponível".
   */
  outros?: EdgeParticipacaoMetric & {
    base: "votaveis";
    n_candidatos: number;
    /**
     * Mesmo agregado na base `comparecimento` (S07/Fase 2). Opcional pelas
     * mesmas razões de `EdgeCandidate.comparecimento` — ausente ⇒ o
     * termômetro de "Outros" fica em "aguardando" quando a UI está nessa
     * base (nunca reaproveita o número de `votaveis`).
     */
    comparecimento?: EdgeBaseComparecimento;
  };
  /**
   * Metadados do cálculo — alimentam a transparência metodológica
   * (constituição § 8) e o rótulo de origem exigido por RF-062
   * ("projeção a partir do apurado", nunca "valor oficial" nem
   * "baseado em 2022").
   *
   * `tipo` era `string` livre até S07/Fase 2; virou união fechada porque a
   * UI ramifica o rótulo por valor:
   *   - `"extrapolacao_apurado"` — há zona apurada; a projeção é
   *     extrapolada do que já foi apurado (`k = te/esi`, regra de três).
   *   - `"imputado_nacional"` — NENHUMA zona desta UF apurou ainda; a
   *     projeção usa a proporção nacional como âncora provisória, com IC
   *     alargado (RF-017). Só existe para cargo 1: governador não tem
   *     agregado nacional equivalente e fica em "aguardando projeção".
   */
  metodo?: {
    tipo: "extrapolacao_apurado" | "imputado_nacional";
    n_zonas: number;
    pct_apurado: number;
    /**
     * Zonas sem urna apurada que entraram por imputação (proporção da UF,
     * decisão E3). Ausente ≡ 0. Só informativo — o share da UF não muda
     * com a imputação, apenas os votos absolutos.
     */
    n_zonas_imputadas?: number;
  };
}

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
  /**
   * Mesmo candidato na segunda base — % sobre quem compareceu (S07/Fase 2,
   * decisão E2). Os campos `pct_*` acima seguem sendo a base `votaveis`
   * (default da UI). Ver `EdgeBaseComparecimento` para a identidade da soma
   * e a regra de degradação quando o campo está ausente.
   */
  comparecimento?: EdgeBaseComparecimento;
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
  /**
   * Sinal binário "a eleição vai a 2º turno?" no agregado nacional —
   * `true` quando o orchestrator avalia que nenhum candidato fecha o 1T,
   * `false` quando há decisão no 1T (líder ≥ 50%+1), `null` quando
   * indeterminado / 2T (degenera).
   *
   * Adicionado em S06/F4d Fase 5 (carry-over): consumidores do
   * `<NationalWinnerBanner />` precisavam decidir entre "ELEITO" e
   * "vai a 2T" derivando heuristicamente de `p_segundo_turno_overall`
   * (`page.tsx`: `vai_a_2t_nacional = p < 0.01`). Eleva essa decisão para
   * o orchestrator: emite explícito + auditável, espelhando a semântica
   * já presente em `EdgeUfRow.vai_a_2t` (mas no agregado nacional).
   *
   * Pré-S06/F4d ausente — consumidor deve continuar derivando heuristicamente
   * do `p_segundo_turno_overall` (forward-compat). Em 2T, o orchestrator
   * deve emitir `null` (semântica vazia — já estamos no 2T).
   */
  vai_a_2t_nacional?: boolean | null;
  /**
   * Participação nacional (abstenção, brancos/nulos, "Outros") — S07/Fase 1a.
   * Alimenta os termômetros 4–6 do hero de 1º turno (`<ProjectionThermometers />`).
   *
   * **Opcional** para forward/backward-compat: payloads pré-S07 não têm a
   * chave, e o orchestrator omite métricas individuais quando não são
   * calculáveis. Semântica de 2º turno: o hero de 2T (modo `binary`) não
   * consome este bloco — o orchestrator pode omiti-lo inteiro em payloads
   * de turno 2.
   */
  participacao?: EdgeParticipacao;
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
  /**
   * Swing em pp vs. 2022 (positivo = em favor do líder).
   *
   * S07/Fase 2 — o tipo passa a aceitar `null`: com a projeção extrapolada
   * do apurado (não mais swing vs. 2022), este campo deixa de ser insumo do
   * modelo e vira **comparação descritiva** (decisão E1: apurado de agora −
   * 2022, um fato observado). Fica `null` quando o número de 2022 não
   * existe para aquele par (UF, candidato) — consumidores devem exibir "—",
   * nunca 0, que leria como "não mudou nada".
   *
   * Na Fase 2 o orchestrator ainda emite `0.0` fixo (`api/model/project.py`);
   * o valor real chega na Fase 5 junto com `compute_swing_descritivo`.
   * Ampliar o tipo agora evita ter que mexer nos consumidores duas vezes.
   */
  swing_vs_2022: number | null;
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
 * `model` é a contribuição da extrapolação do apurado (S07/Fase 2 — antes
 * era a extrapolação por swing vs. 2022).
 */
export interface EdgeComposition {
  pre_election: number; // [0, 1]
  model: number; // [0, 1]
  actual_results: number; // [0, 1]
}

// ---------------------------------------------------------------------------
// Payload principal (chave `projection-current`)
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
// Payload de drill-down por UF (chave `projection-uf-<sigla>`)
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
  /**
   * Mesmo candidato na segunda base — % sobre quem compareceu NESTA UF
   * (S07/Fase 2, decisão E2). `pct_atual`/`pct_projetado`/`ci95` acima
   * seguem na base `votaveis`. Ver `EdgeBaseComparecimento`.
   */
  comparecimento?: EdgeBaseComparecimento;
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
  /**
   * Eleitorado apto do município — **soma exata** dos pares `(município,
   * zona)` que caem nele (`SUM(eleitores_aptos) GROUP BY uf,
   * cod_municipio_tse` em `fetch_municipio_eleitorado`, api/model/project.py).
   * Sem rateio: o CSV do TSE publica o eleitorado por par, então o total do
   * município é dado, não estimativa (ADR-0035 D2, constituição § 6).
   *
   * OPCIONAL de propósito (decisão D-d): payloads gravados antes da migration
   * 0006 e a fixture `tests/fixtures/blob/uf-municipios-pres-t1.json` seguem
   * válidos sem o campo. Ausente → o consumidor esconde o subtítulo
   * "N eleitores" e ordena a tabela só pelo que tiver.
   */
  eleitores?: number;
  /**
   * `true` quando o município é a capital da UF (`municipios.capital`, seed
   * estático das 27 capitais na migration 0006).
   *
   * OPCIONAL e **emitido só quando verdadeiro** — são 27 em ~5.570
   * municípios, e 644 `"capital": false` por payload de SP não pagariam o
   * próprio peso. Ausente == não é capital. Ordena o painel "Maiores
   * colégios eleitorais" (capital primeiro — decisão E4).
   */
  capital?: boolean;
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
 * total da UF, paginar via chave separada `projection-uf-<sigla>-series`.
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
 * Drill-down de UMA UF. Chave canônica: `projection-uf-<sigla>` (ex.
 * `projection-uf-SP`). ~5–10 KB por UF conforme data-model.md § "Payload do
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
   * `municipios` e `series_temporais` NÃO estão mais aqui — ADR-0032,
   * 2026-09-08. Os dois vivem no Vercel Blob, num objeto por UF/cargo/turno
   * (`lib/blob/uf-detail.ts` → `UfDetailBlob`), lido em paralelo com este
   * payload. Quem monta o payload para gravar usa `UfPayloadInput` (abaixo),
   * que ainda os carrega; quem LÊ do Global Config recebe este tipo, sem eles.
   *
   * A série por candidato que o ADR-0014 reservou como chave dedicada
   * `projection-uf-<sigla>-series-por-cand` fica resolvida antes de existir: o
   * destino dela é o mesmo objeto Blob (ou um irmão no mesmo esquema de
   * caminho), nunca uma chave nova de Global Config — uma série por candidato
   * multiplica o custo de `series_temporais` pelo número de candidatos.
   */
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
  /**
   * @deprecated S07/Fase 2 — o K-1 3-tier (ADR-0015) existia porque a
   * projeção usava 2022 como âncora e precisava de um plano B quando o
   * histórico da zona faltava. Com a projeção extrapolada do apurado
   * (regra de três por zona), o fallback deixa de ter função: UF sem urna
   * usa a proporção nacional e se declara via
   * `participacao.metodo.tipo === "imputado_nacional"`. A coluna
   * `projections.model_fallback_tier` permanece no schema (sem migration) e
   * o campo segue aqui só para não quebrar payloads já gravados — novos
   * consumidores não devem lê-lo. ADR-0021 (em elaboração) formaliza.
   *
   * K-1 3-tier fallback (ADR-0015 / spec 002 K-1) — qual tier do bootstrap
   * histórico foi efetivamente usado para esta UF nesta rodada do modelo:
   *
   *   - `1` ("ouro"): cobertura ≥ 80% de zonas com mapping direto histórico
   *     (cargo + UF + zona) — caminho default. Sem disclaimer extra na UI.
   *   - `2` ("prata"): tier 2 acionado por insuficiência de histórico no nível
   *     zona. Bootstrap usa pre-election polls (api/model/pre_election_polls.py)
   *     ou aproximação no nível UF. UI mostra disclaimer K-1 ("projeção
   *     baseada em pesquisa pré-eleição; precisão menor").
   *   - `3` ("bronze"): tier 3, último recurso — projeção sintetizada de
   *     prior nacional. UI mostra disclaimer reforçado.
   *
   * Adicionado em S06/F4d Fase 5 (carry-over): a Fase 4 casteava como
   * `unknown` (`(payload as { model_fallback_tier?: number })`) porque o
   * campo não estava no tipo formal. Aqui formalizamos: opcional pra
   * forward-compat com payloads pré-S05 que não emitiam o campo (consumidor
   * coalesce para `1` = tier ouro = sem disclaimer, comportamento default).
   *
   * Origem do dado: `projections.model_fallback_tier` (smallint, migration
   * 0004), populado pelo orchestrator em `_do_project` via `compute_uf_projections`.
   * O serializador `build_uf_payloads` em api/model/project.py é responsável
   * por propagar a coluna pro payload UF (S06/F4d Fase 5 — pode requerer
   * complemento Python pra serializar; tracked como carry-over técnico de
   * acompanhamento se ainda ausente no payload de produção).
   */
  model_fallback_tier?: 1 | 2 | 3;
  /**
   * Participação NESTA UF (abstenção, brancos/nulos, "Outros") — S07/Fase 1a.
   * Mesma semântica de `EdgeNational.participacao`, calculada sobre as zonas
   * da UF. Alimenta os termômetros das páginas `/uf/[sigla]` e
   * `/uf/[sigla]/governador` no 1º turno.
   *
   * **Opcional** — payloads pré-S07 não têm a chave; métricas não
   * calculáveis são omitidas individualmente (não emitir 0).
   */
  participacao?: EdgeParticipacao;
}

/**
 * O payload de UF **como o orchestrator o envia** — resumo mais o detalhe que
 * o ADR-0032 tirou do Global Config.
 *
 * Existe porque a fronteira campo a campo é aplicada do lado TypeScript, num
 * ponto só (`splitUfPayload`, `lib/blob/uf-detail.ts`): o Python segue
 * emitindo `municipios` e `series_temporais` no mesmo objeto, e a rota
 * `/api/internal/edge-write` separa o que vai para cada mecanismo. Sem este
 * tipo, `EdgePayloadUf` teria que continuar declarando dois campos que o
 * Global Config não guarda mais — o tipo armazenado mentindo sobre o store.
 *
 * Consumidores de LEITURA nunca veem este tipo: `readUfProjection` devolve
 * `EdgePayloadUf`, e o detalhe vem de `readUfDetail` (Blob), em paralelo.
 */
export interface UfPayloadInput extends EdgePayloadUf {
  /** Municípios para drill-down do mapa + tabela RF-037. Destino: Blob. */
  municipios: EdgeUfMunicipio[];
  /**
   * Séries (margem, p_vitoria, turnout) dos charts RF-040/041/042. Destino:
   * Blob. Opcional — orchestrators pré-S04/F2 não emitem a chave.
   */
  series_temporais?: EdgeUfSeriesTemporais;
}
