---
id: ADR-0015
title: Fallback de modelo em 3 tiers para candidatos sem mapeamento histórico K-1
status: superseded
date: 2026-05-17
superseded_by: ADR-0021
---

# ADR-0015 — Fallback de modelo em 3 tiers para candidatos sem mapeamento histórico K-1

> **Revisão 2026-09-05** — Superado pelo [ADR-0021](0021-extrapolacao-do-apurado-sem-2022.md); o problema que este ADR resolvia (candidato sem bloco político mapeável em 2022) deixa de existir porque a projeção não usa mais 2022.

## Status

Superseded por [ADR-0021](0021-extrapolacao-do-apurado-sem-2022.md).

## Contexto

O modelo de swing (spec 002) usa dados históricos de 2022 para inferir o comportamento de coligações em cada zona eleitoral. A lógica de mapeamento "K-1" associa a coligação atual de um candidato a uma coligação correspondente de 2022 para estimar o swing esperado. Em eleições presidenciais com mais candidatos, coligações novas ou partidos sem equivalente em 2022 resultam em K-1 indefinido.

O comportamento atual da S03 em caso de K-1 ausente é desabilitar o modelo para o candidato afetado — UI exibe "sem projeção" para esse candidato. Em 2022 isso teria excluído Tebet (PSDB — coligação nova) e Ciro (PDT — coligação reconfigurada), candidatos com 4–5% que eram editorialmente relevantes. Excluir candidatos com presença real nas pesquisas degrada a credibilidade da plataforma e penaliza editorialmente candidatos menores sem justificativa metodológica clara.

Ao mesmo tempo, projetar com confiança artificialmente alta quando o modelo não tem base histórica sólida viola a constituição § 8 (comunicação honesta de incerteza).

## Decisão

Implementar 3 tiers de fallback, aplicados em ordem, quando K-1 é indefinido para um candidato:

**Tier 1 — swing por partido principal.** Usa o histórico de swing do partido principal do candidato (não da coligação inteira). Ex: candidato PSDB com coligação MDB+PV+CIDADANIA usa swing histórico PSDB 2022. Cobertura: partidos com representação >= 1 cadeira na Câmara 2022 (estimada ~20 partidos). Intervalo de confiança padrão do bootstrap.

**Tier 2 — prior de pesquisa pré-eleitoral.** Quando Tier 1 não resolve (partido sem histórico em 2022), usa intenção de voto do agregado de pesquisas eleitorais (Datafolha/Quaest, fonte pública citável, licença editorial verificada pelo owner antes de simulado oficial). CI inflado em +50% para refletir a incerteza adicional (ex: bootstrap normal gera ±2pp; Tier 2 gera ±3pp).

**Tier 3 — modelo desabilitado.** Comportamento S03: sem projeção, UI exibe disclaimer "Parcial sem projeção". Aplicado somente quando nem partido principal nem pesquisa pré-eleitoral estão disponíveis.

Cada linha de projeção no Postgres recebe uma coluna `model_fallback_tier: smallint` com valor 1, 2 ou 3. O payload `EdgeCandidate` inclui o campo `fallback_tier: 1 | 2 | 3 | null` (null = modelo completo, sem fallback). O componente `ForecastTransparency` exibe a fonte do prior quando `fallback_tier == 2`.

A adoção do Tier 2 requer fonte de pesquisa com licença editorial confirmada pelo owner antes do simulado oficial (pré-requisito legal, não técnico).

## Consequências

**Positivas**:
- Cobertura editorial maior no 1T: candidatos com partidos históricos (Tier 1) recebem projeção em vez de lacuna.
- Auditabilidade: `fallback_tier` é visível na UI e no Postgres, permitindo que leitores e jornalistas saibam a qualidade do dado.
- Tier 3 preservado: plataforma não inventa projeção quando não há base alguma.
- Alinhamento com § 8 (CI inflado em Tier 2 comunica incerteza honestamente).

**Negativas**:
- Tier 2 requer pré-requisito legal externo ao time técnico: licença da fonte de pesquisa. Sem essa confirmação, Tier 2 não pode ser ativado e Tier 1 é o máximo disponível.
- Swing por partido (Tier 1) pode ser enganoso se o partido mudou de posicionamento entre 2022 e 2026 — erro sistêmico não detectável pelo modelo.
- `model_fallback_tier` adiciona campo em toda linha de projeção no Postgres e no payload Edge Config, aumentando superfície de schema.
- Footer de transparência precisa apresentar a fonte da pesquisa pré-eleitoral (Tier 2) de forma legível — requisito de copy que precisa de validação editorial.

## Cross-refs

- ADR-0006 (bootstrap — mecanismo de CI que Tier 2 infla): [0006-bootstrap-nao-bayesiano.md](0006-bootstrap-nao-bayesiano.md)
- ADR-0007 (granularidade zona vs município): [0007-zona-vs-municipio.md](0007-zona-vs-municipio.md)
- Spec afetada: `docs/specs/002-modelo-estatistico/spec.md` (lógica K-1, RF-011 a RF-015)
- Spec afetada: `docs/specs/003-home-nacional/spec.md` (componente `ForecastTransparency`)
- Spec afetada: `docs/specs/004-pagina-uf-presidencial/spec.md` (componente `ForecastTransparency`)
- Data model: [../data-model.md](../data-model.md) (coluna `model_fallback_tier` em tabela de projeções)
- Constituição § 6 (determinismo e auditabilidade), § 8 (honestidade de incerteza): [../../constitution.md](../../constitution.md)
- Referência: `docs/reference/data-sources.md` (fontes de pesquisa pré-eleitoral e licenciamento)
- Riscos: `docs/reference/risks.md` (risco de cobertura de 1T com K-1 ausente)
