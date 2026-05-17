---
id: 002-modelo-estatistico
title: Modelo estatístico (swing, bootstrap, projeção)
status: draft
priority: M
personas: []
screens: []
requirements: [RF-011, RF-012, RF-013, RF-014, RF-015, RF-016, RF-017, RF-018, RF-019, RF-020]
depends_on: [001-ingestao-tse]
apis: [POST /api/model/project]
components: []
nfr: [RNF-006]
adrs: [0006, 0007]
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

**Out**:
- Visualização (specs 003+).
- Ingestão do TSE (spec 001).

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
