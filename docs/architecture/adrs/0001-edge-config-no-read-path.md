---
id: ADR-0001
title: Edge Config no read path, não Postgres
status: accepted
date: 2026-05-17
---

# ADR-0001 — Edge Config no read path, não Postgres

## Status

Aceito.

## Contexto

A noite eleitoral concentra ~20k acessos simultâneos sustentados. O read path precisa servir o mesmo payload (~30KB) para centenas de milhares de requests por minuto, com latência <100ms p95.

Postgres serverless (Neon) suporta a carga em teoria, mas:

- Cada cliente abrindo conexão TCP adiciona latência de cold start.
- Pool de conexões precisa ser cuidadosamente dimensionado.
- Falhas do DB levariam o site inteiro abaixo.

Vercel Edge Config é replicado em todos os PoPs (latência <15ms global), shape JSON puro, sem conexões.

## Decisão

Estado quente da projeção (`projection:current` + `projection:uf:[sigla]`) vive em **Vercel Edge Config**. Postgres entra apenas no write path (snapshots, histórico, audit).

## Consequências

**Positivas**:
- Read path serve em <15ms + cache CDN absorve 99,8%.
- DB sai do caminho crítico do cliente — site fica de pé mesmo se Neon cair.
- Custos previsíveis (Edge Config é flat-rate até certo volume).

**Negativas**:
- Payload precisa caber em <512KB (limite Edge Config). Atual ~30KB nacional + 5–10KB por UF.
- Latência de propagação ~5–10s entre write e leitura global — aceitável dado o ciclo de 15s.
- Duas fontes de verdade (Edge Config + Postgres) exigem sincronização disciplinada no `/api/ingest`.

> **Nota 2026-05-17**: com o escopo de v1 definido em ADR-0007 (drill-down zonal deferido), o payload por UF deixa de incluir o campo `por_zona[*]`. O envelope cai de ~5–10KB para ~2–4KB por UF, aumentando a folga sob o limite de 512KB e reduzindo risco de overflow durante ingestão de alta frequência.

## Cross-refs

- Schema do payload: [../data-model.md](../data-model.md)
- Constituição § 3 (performance) e § 9 (stack Vercel): [../../constitution.md](../../constitution.md)
- ADR-0007 (granularidade zona vs município — define ausência de `por_zona` no payload): [0007-zona-vs-municipio.md](0007-zona-vs-municipio.md)
