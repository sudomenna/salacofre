---
id: 002-modelo-estatistico
title: Modelo estatístico (swing, bootstrap, projeção)
status: implementing
priority: M
personas: []
screens: []
requirements: [RF-011, RF-012, RF-013, RF-014, RF-015, RF-016, RF-017, RF-018, RF-019, RF-020, RF-020.1]
depends_on: [001-ingestao-tse]
apis: [POST /api/model/project]
components: []
nfr: [RNF-006]
adrs: [0006, 0007, 0012, 0014, 0015, 0018, 0021]
ship_blocked_on: [simulado-tse-2026]
---

# Spec 002 — Modelo estatístico

## Objetivo

Transformar snapshots de apuração em **projeção do resultado final** com intervalo de confiança e probabilidade de vitória, em <2s por execução, explicável e determinístico.

## Escopo

**In**:
- Cálculo de swing zona-a-zona vs 2022.
- Agregação de swing para UF e nacional.
- Bootstrap não-paramétrico (1000 resamples) para CI95.
- Probabilidade de vitória P(>50%).
- Tratamento de casos de borda (UF 0% apurado, <5% apurado, candidato sem mapeamento 2022).
- Persistência de cada execução em `projections`.
- Projeção de **participação** — abstenção e brancos/nulos — por extrapolação do apurado (RF-020.1).
- Agregado **"Outros"** (candidatos de rank ≥ 4) com IC próprio, derivado dos resamples do bootstrap (RF-020.1).

**Out**:
- Visualização (specs 003+).
- Ingestão do TSE (spec 001).
- **Persistência da participação em `projections`** — deferida por incompatibilidade de schema (`projections.candidato_id NOT NULL` não comporta linhas de participação). O bloco `participacao` viaja **apenas** no payload do Edge Config. Ver RF-020.1.
- Qualquer prior histórico de comparecimento/abstenção 2022 — decisão D5 (2026-09-05): sem tabela nova, sem importar `detalhe_votacao_munzona`.

## Personas e jornadas

Back-end. Atende todas as personas indiretamente. A explicabilidade do modelo serve **P2/P3** via página `/sobre-o-modelo` ([spec 011](../011-sobre-o-modelo/spec.md)).

## Notação

- `Z` = conjunto de zonas eleitorais (~3.000)
- `Z_t ⊂ Z` = zonas apuradas em t
- `c` = candidato (índice)
- `v_c(z, t)` = votos do candidato c na zona z no tempo t
- `V(z, t)` = votos totais válidos na zona z em t
- `p_c(z, t) = v_c(z, t) / V(z, t)` = pct de c em z em t
- `p_c^{2022}(z)` = pct do candidato c (ou bloco político) em z em 2022
- `n(z)` = eleitores aptos em z
- `w(z)` = eleitores aptos 2026 de z segundo a tabela `eleitorado` (peso de agregação de RF-011..RF-018 e de RF-020.1)
- `esi(z)` = eleitorado das seções instaladas em z (campo `e.esi` do EA20)
- `c(z)` = comparecimento em z (`e.c`)
- `a(z)` = abstenção em z (`e.a`)
- `bn(z)` = brancos(z) + nulos(z)
- `vvc(z)` = votos a votáveis concorrentes em z (`v.vvc` — mesmo denominador do campo oficial `pvap`)

## Requisitos Funcionais (EARS)

### Swing

**RF-011 — Cálculo de swing zona-a-zona vs 2022**

WHEN um novo snapshot é ingerido para a zona z, the system SHALL calcular `swing_c(z) = p_c(z, t) - p_c^{2022}(z)` para cada candidato c.

**Aceitação**:
- Given `p_c(z, t) = 0.55` e `p_c^{2022}(z) = 0.50`, when o swing é calculado, then `swing_c(z) = +0.05` (+5pp).

**RF-012 — Agregação para UF via média ponderada por eleitores aptos**

WHEN o swing precisa ser projetado para a UF U, the system SHALL calcular `swing_c(U) = Σ(z ∈ Z_t ∩ U) swing_c(z) · n(z) / Σ(z ∈ Z_t ∩ U) n(z)`.

### Projeção

**RF-013 — Projeção da UF**

WHEN o swing da UF U está disponível, the system SHALL calcular `p_c^{proj}(U) = p_c^{2022}(U) + swing_c(U)`.

**RF-014 — Projeção nacional**

WHEN as projeções por UF estão disponíveis, the system SHALL calcular `votos_c^{proj}(BR) = Σ(U) votos_c^{proj}(U)` e `pct_c^{proj}(BR) = votos_c^{proj}(BR) / Σ(c') votos_{c'}^{proj}(BR)`.

### Incerteza

**RF-015 — Intervalo de confiança via bootstrap (1000 resamples)**

WHEN a projeção da UF é calculada, the system SHALL calcular CI95 via bootstrap não-paramétrico com 1000 resamples das zonas apuradas.

**Aceitação**:
- Given 100 zonas apuradas em SP, when bootstrap roda, then retorna `{point, ci_lower, ci_upper}` com `ci_lower < point < ci_upper`.
- Given seed fixo, when bootstrap roda 2 vezes, then resultados são idênticos (reprodutibilidade).

**RF-016 — Probabilidade de vitória P(>50%)**

WHEN as estimativas bootstrap dos candidatos A e B estão disponíveis, the system SHALL calcular `p_vitoria = mean(estimates_A > estimates_B)`.

### Casos de borda

**RF-017 — UF com 0% apurado**

IF uma UF tem zero zonas apuradas, the system SHALL manter `projeção = resultado_2022` com CI inflado para ±10pp.

**RF-018 — UF com <5% apurado (Should)**

IF uma UF tem menos de 5% apurado, the system SHOULD inflar o CI em 50% adicional.

### Operação

**RF-019 — Recálculo a cada snapshot**

WHEN um novo snapshot é ingerido, the system SHALL acionar `/api/model/project` para recalcular a projeção.

**RF-020 — Persistência de cada cálculo**

WHEN uma projeção é calculada, the system SHALL inserir um novo registro em `projections` com timestamp.

### Participação e agregados (S07 — hero de seis termômetros)

**RF-020.1 — Projeção de participação e do agregado "Outros"**

WHEN uma projeção é calculada para um cargo/turno, the system SHALL emitir, no payload do Edge Config, um bloco `participacao` com três métricas independentes — cada uma com `pct_atual`, `pct_projetado`, `lower`, `upper` (todos em **percentual 0–100**) e o rótulo explícito da sua base de cálculo:

- **(a) `abstencao`** — `base: "eleitores_instalados"`. Projetada por **extrapolação do apurado** (regra de três): a taxa `a(z) / esi(z)` observada nas zonas já apuradas, **ponderada por `w(z)`** (eleitores aptos 2026), extrapolada para o total da UF; agregação nacional ponderada pelo eleitorado total de cada UF.
- **(b) `brancos_nulos`** — `base: "comparecimento"`. Mesmo estimador de (a), com métrica `bn(z) / c(z)`.
- **(c) `outros`** — `base: "votaveis"`, mais `n_candidatos`. Agregado dos candidatos de rank ≥ 4, cujo IC95 é a **soma pareada por resample** dos arrays de bootstrap desses candidatos (RF-015) — nunca `100 − Σtop3`.

WHERE a projeção usa a extrapolação do apurado, the system SHALL derivar o IC95 de (a) e (b) por **bootstrap de zonas apuradas** no mesmo estilo de RF-015 e SHALL aplicar RF-017/RF-018 (inflação de CI em baixa apuração) sem reimplementá-los.

IF nenhuma zona da UF for utilizável para uma métrica (denominador da métrica ≤ 0 **ou** `w(z) ≤ 0` em todas as zonas), the system SHALL **omitir** a chave dessa métrica do payload — nunca emitir `0.0` como se fosse dado apurado. A UI renderiza o termômetro em estado "aguardando projeção" (ADR-0017: a camada nunca sai do DOM).

WHILE o bloco `participacao` é emitido, the system SHALL incluir `metodo: {tipo, n_zonas, pct_apurado}` com `tipo = "extrapolacao_apurado"`, de modo que a UI possa rotular a origem do número (constituição § 8 — transparência metodológica).

**Sem prior histórico** (decisão D5, 2026-09-05): a projeção de participação **não** usa nenhum dado de 2022. Não há tabela de prior, não se importa `detalhe_votacao_munzona`, e o rótulo exibido é "projeção a partir do apurado" — nunca "baseado em 2022". Consequência assumida e documentada em [ADR-0018](../../architecture/adrs/0018-termometros-hero-1t.md): a estimativa é volátil em apuração muito baixa e sujeita a viés de composição das zonas que apuram cedo.

**Denominadores não são intercambiáveis.** As três bases (`v.vvc`, `e.c`, `e.esi`) vêm decompostas no próprio EA20 e não podem ser normalizadas num denominador único: isso produziria percentuais de candidato divergentes dos publicados pelo TSE e alteraria o conteúdo dos dados distribuídos, vedado pelo art. 267 §4º da Res. TSE 23.751/2026 ([ADR-0020](../../architecture/adrs/0020-conformidade-res-23751-2026.md)).

**Persistência deferida — intencional.** O bloco `participacao` **não** é gravado em `projections`: a tabela é modelada por candidato (`candidato_id NOT NULL`) e não comporta linhas de participação. Portanto RF-020 **não** se aplica a RF-020.1, e a participação vive exclusivamente no payload do Edge Config, recalculada a cada ciclo. Isso é uma decisão de escopo (S07/Fase 1a), não uma pendência esquecida; qualquer persistência futura exige migration e ADR próprios.

**Aceitação**:
- Given uma UF com ao menos uma zona cujo denominador da métrica é > 0 e `w(z) > 0`, when a participação é estimada, then `pct_atual = Σ num / Σ den` (razão literal das zonas apuradas) e `pct_projetado` = média de `metric_value(z)` ponderada por `w(z)`, ambos em 0–100.
- Given a mesma entrada e o mesmo seed derivado de `(uf, métrica)`, when o cálculo roda duas vezes, then `pct_projetado`, `lower` e `upper` são **idênticos bit-a-bit** (constituição § 6 — determinismo; seed via `np.random.default_rng`, nunca `np.random.seed()` global).
- Given seeds diferentes para a mesma entrada, when o cálculo roda, then os CIs diferem — comprovando que o bootstrap é de fato semeado e não constante.
- Given uma UF com `pct_apurado < 5`, when o CI é calculado, then ele é inflado 1,5× ao redor do ponto por `inflate_ci_low_apurado` (RF-018), e o resultado é clipado em [0, 100].
- Given uma UF sem nenhuma zona utilizável, when o cálculo roda, then a métrica é omitida do payload e nenhuma chave com valor `0.0` é emitida.
- Given uma corrida com 5 candidatos, when `outros` é calculado, then ele soma os resamples dos ranks 4 e 5 e reporta `n_candidatos = 2`.
- Given uma corrida com 3 candidatos ou menos, when `outros` é calculado, then `n_candidatos = 0` e a chave `outros` é omitida (a UI cai no fallback `100 − Σtop3` **sem faixa**, rotulado "IC indisponível").
- Given um payload emitido pelo orchestrator com envelope EA20 real, when ele é validado, then `national.participacao` e `payloads_uf.<UF>.participacao` trazem `base ∈ {"eleitores_instalados", "comparecimento", "votaveis"}` e `metodo.tipo == "extrapolacao_apurado"`.
- Given qualquer execução, when os registros de `projections` são inspecionados, then **nenhuma** linha de participação foi inserida (persistência deferida).

## Escala de percentuais (fronteira de conversão)

O modelo trabalha internamente em **fração [0, 1]** — é o espaço do bootstrap (RF-015), de RF-017/RF-018 e de `p_vitoria` (RF-016). A **fronteira única de conversão** são `compute_uf_projections` e `compute_national`: ambas convertem para **percentual 0–100** antes de devolver `rows`, via `_frac_to_pct` (arredondamento em 5 casas, a precisão de `projections.pct_projetado NUMERIC(8,5)`).

O que **não** cruza a fronteira: `estimates_by_uf` e `national_estimates` — os arrays de resample — permanecem em fração, porque são o insumo de `aggregate_national_estimates`, `p_vitoria`, `compute_p_passa_2t`, `compute_p_fecha_1t`, `compute_two_round_scenarios` e do agregado "Outros" de RF-020.1. Comparações e somas entre candidatos acontecem **sempre** nesse espaço.

Consequências diretas: `insert_projections` grava 0–100; os consumidores downstream que já assumiam 0–100 (`build_edge_payload`, `build_uf_payloads`, os limiares `top_pct < 50.0` e `margem > 10.0`) passam a receber o valor correto; e `replay_batch.py` converte de volta para fração ao serializar, preservando o gate OT-4 (`MAE@1h < 0.02`). `turnout.py` segue a mesma convenção: `pct_*` em 0–100, `estimates` em fração.

Fonte canônica da convenção: [`data-model.md` § "Escala de percentuais"](../../architecture/data-model.md#escala-de-percentuais).

## Estado dos bloqueadores de ship

`ship_blocked_on:` é mantido integralmente — a spec segue em `implementing`. Estado auditado em 2026-09-05 (Fase 3 da S07):

| Bloqueador | Estado | Evidência |
|---|---|---|
| `simulado-tse-2026` | **Aberto** | Simulados oficiais em 15–17/09 e 22–24/09/2026; nenhum ciclo executado até aqui. O gate OT-4 atual (MAE@1h 0,998pp) roda sobre dataset sintético cujo swing é ~0 (retrospectiva S03) — não exercita o modelo de swing. |
| `fix-p_vitoria-a-by-pct` | **Resolvido em S05, não removido aqui** | "A" passou a ser o líder por `pct_projetado`, não o menor `candidato_id`. Falta apenas a confirmação formal do gate para retirar o item — decisão do orquestrador, não desta passagem de docs. |
| `fix-pct_validos-null-in-historical_results` | **Aberto** | É um problema de **dados**, não de código: nenhuma migration em `lib/db/migrations/` popula `historical_results.pct_validos`. Verificável só contra o banco. |
| `sobre-o-modelo-page` | **Resolvido em S04, não removido aqui** | [Spec 011](../011-sobre-o-modelo/spec.md) está `shipped`. |
| `botid-adr` | **Resolvido, não removido aqui** | [ADR-0009](../../architecture/adrs/0009-botid-vercel.md) está `accepted`. |

Nenhum item foi removido do frontmatter nesta passagem: retirar bloqueador é ato de gate, e os gates (`rf-coverage-checker`, `constitution-guard`, `model-validator`) ainda não rodaram sobre a S07.

## Requisitos Não-Funcionais aplicáveis

- Defasagem total <30s — [RNF-006](../../nfr/performance.md). Componente: `model.compute_duration_ms` p95 <2000ms.

## Open questions

- Como tratar candidato 2026 sem bloco político mapeável em 2022 (ex: novo partido)? Atual: modelo desabilitado, fallback para parcial atual. Pode ser refinado.
- Bootstrap atual usa resample uniforme — vale a pena ponderar por eleitores aptos?

## Cross-refs

- Design técnico: [./design.md](./design.md)
- Spec ingestão: [../001-ingestao-tse/](../001-ingestao-tse/)
- Página sobre o modelo: [../011-sobre-o-modelo/](../011-sobre-o-modelo/)
- Validação por replay: [../../testing/replay.md](../../testing/replay.md)
- ADR-0006 Bootstrap vs Bayesiano: [../../architecture/adrs/0006-bootstrap-nao-bayesiano.md](../../architecture/adrs/0006-bootstrap-nao-bayesiano.md)
- ADR-0007 Granularidade zona vs município: [../../architecture/adrs/0007-zona-vs-municipio.md](../../architecture/adrs/0007-zona-vs-municipio.md)
- ADR-0018 Seis termômetros no hero do 1T (origem de RF-020.1 — denominador misto, "Outros" com IC real, participação por regra de três): [../../architecture/adrs/0018-termometros-hero-1t.md](../../architecture/adrs/0018-termometros-hero-1t.md)
- Consumo de RF-020.1 na UI: [spec 003](../003-home-nacional/spec.md) (RF-062)
- Escala de percentuais: [../../architecture/data-model.md](../../architecture/data-model.md)
