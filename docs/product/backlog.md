---
title: Backlog — itens deferidos para pós-v1
description: Funcionalidades fora do escopo de v1 (out 2026), candidatas a v2 ou descarte definitivo
status: living
---

# Backlog pós-v1

Itens removidos do escopo de v1 ou nunca incluídos, agrupados pelo motivo do corte. Cada entrada referencia a decisão (ADR, sprint ou conversa datada) que a removeu, para que a reabertura tenha contexto.

## v2 — drill-down e granularidades adicionais

### Drill-down até zona eleitoral

- **Origem**: era a spec 007 (`007-drill-down-municipio`), removida de v1 em **2026-05-17**.
- **Decisão**: ver [ADR-0007 — Zona vs Município](../architecture/adrs/0007-zona-vs-municipio.md) (amendment 2026-05-17).
- **O que era**: drill-down navegável da página de UF até zona eleitoral dentro de capitais e cidades grandes, com choropleth e tabela por zona.
- **Por que cortou**: persona única (P3 — atlas-junkie, prioridade Should, não Must), payload Edge Config inflava 2–3×, `zonas.pmtiles` (~30MB) sem outros consumidores, sprint S06 (F5) aliviada de 4 para 3 specs.
- **O que continua latente em v1**: schema Postgres mantém tabelas `zonas` e colunas `cod_zona` (modelo precisa); ingestão TSE continua lendo EA20 por zona; modelo continua rodando zona-a-zona internamente. Só a **exposição pública** parou em município.
- **Reabrir quando**: persona P3 ganhar prioridade explícita; ou TSE 2026 obrigar exposição zonal; ou demanda jornalística específica em 1º turno justificar para 2º turno.
- **Custo estimado para reabrir**: M — agregação no payload precisa virar opt-in, `zonas.pmtiles` precisa ser gerado, componentes `<ChoroplethMap>` e `<MunicipioTable>` precisam reaceitar `level: 'zona'` (refatorar para `<EntityTable>` se vierem múltiplas entidades novas).

## Convenções

- Entradas crescem por baixo. Não reordene por prioridade (priorização vive no roadmap).
- Cada item deve responder a 4 perguntas: o que era, por que cortou, o que ficou latente, quando reabrir.
- Quando um item for promovido de volta a v1+1, mova-o para a sprint correspondente e deixe nota com data de promoção.
