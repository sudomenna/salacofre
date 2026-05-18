---
id: ADR-0014
title: p_segundo_turno como métrica de primeira classe no payload, não derivada em UI
status: accepted
date: 2026-05-17
---

# ADR-0014 — p_segundo_turno como métrica de primeira classe no payload, não derivada em UI

## Status

Aceito.

## Contexto

O modelo estatístico (spec 002) publica `p_vitoria_a` — a probabilidade de o candidato líder superar o segundo colocado. Para eleições presidenciais com apenas dois candidatos relevantes (cenário 2T), essa métrica é suficiente para a narrativa da agulha. No 1T brasileiro com múltiplos candidatos, a pergunta central do leitor é diferente: "alguém vai ganhar no primeiro turno, ou vai para segundo turno?".

Sem essa probabilidade explícita no payload do Edge Config, a UI teria de derivá-la localmente somando `P(candidato_i >= 50%+1)` sobre todos os candidatos — cálculo que depende de acesso ao array completo de `estimates` e que duplicaria lógica do modelo em componentes React. Isso viola o princípio de que a UI deve ser burra (só renderiza), e o modelo deve ser a fonte única de verdade probabilística (constituição § 6 — determinismo e auditabilidade).

Adicionalmente, a comunicação de cenários de segundo turno ("duelo mais provável Lula vs. Bolsonaro") é jornalisticamente relevante e requer probabilidade por par de candidatos, não apenas a probabilidade agregada.

## Decisão

Quatro campos adicionais são publicados pelo bootstrap como parte do payload `EdgeNational` e `EdgeCandidate`, sem custo computacional extra: reusam o array `estimates` já calculado nas 1000 resamples.

Campos em `EdgeNational`:
- `p_segundo_turno_overall: number | null` — P(nenhum candidato atinge >= 50%+1 dos votos válidos). `null` em contexto de 2T, onde a pergunta não se aplica.
- `cenarios_2t: Array<{ par: [candidateId, candidateId], prob: number }>` — top-3 duelos mais prováveis por contagem de resamples onde ambos os candidatos terminam em top-2. Lista vazia em 2T.

Campos em `EdgeCandidate`:
- `p_passa_2t: number` — P(candidato termina em top-2 do 1T neste resample).
- `p_fecha_1t: number` — P(candidato atinge >= 50%+1 sozinho e encerra no 1T).

Em 2T: `p_passa_2t` e `p_fecha_1t` são semanticamente equivalentes a `p_vitoria_a` e `1 - p_vitoria_a`; o modelo os publica para consistência de schema, não para valor informativo incremental.

## Consequências

**Positivas**:
- UI pode renderizar `<TwoRoundIndicator />` e `<RunoffScenarios />` consumindo campos já calculados, sem derivação local.
- Métricas auditáveis: cada valor publicado é determinístico e rastreável até os 1000 resamples (constituição § 6).
- Payload nacional cresce ~5KB por ciclo — dentro da folga do Edge Config após ADR-0012 e ADR-0007.
- `cenarios_2t` viabiliza cobertura editorial de "quem pode enfrentar quem" sem precisar de LLM (constituição § 5).

**Negativas**:
- Schema `EdgeNational` e `EdgeCandidate` ganham campos que são `null` em contexto de 2T, adicionando condicionais nos consumidores.
- `p_passa_2t` depende de ordenação correta dos candidatos por estimativa — erro no ranking do modelo se propaga para esse campo.
- Em t < 5% apurado, `p_segundo_turno_overall` pode ser artificialmente alto (~1.0) porque nenhum candidato atingiu projeção robusta ainda. Disclaimer de incerteza na UI é obrigatório (constituição § 8 — comunicação honesta de incerteza).

## Cross-refs

- ADR-0006 (bootstrap — define o mecanismo de 1000 resamples reutilizados aqui): [0006-bootstrap-nao-bayesiano.md](0006-bootstrap-nao-bayesiano.md)
- ADR-0005 (sem LLM — `cenarios_2t` é determinístico, não gerado): [0005-templates-nao-llm.md](0005-templates-nao-llm.md)
- Spec afetada: `docs/specs/002-modelo-estatistico/spec.md` (schema de output do bootstrap, RF-011 a RF-020)
- Spec afetada: `docs/specs/003-home-nacional/spec.md` (componente `NationalNeedle` e futura `TwoRoundIndicator`)
- Data model: [../data-model.md](../data-model.md) (tipos `EdgeNational`, `EdgeCandidate`)
- Constituição § 5 (sem LLM), § 6 (determinismo), § 8 (honestidade de incerteza): [../../constitution.md](../../constitution.md)
- NFR: `docs/nfr/performance.md` (payload target <30KB nacional — folga deve ser validada)
