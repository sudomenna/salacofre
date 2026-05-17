---
title: Roadmap / Cronograma
description: Fases de desenvolvimento até o dia D (04/10/2026) e o 2º turno (25/10/2026)
status: stable
source: PRD.md § 21
---

# Roadmap

| Fase | Duração | Período | Entregáveis |
|---|---|---|---|
| **F1** — Fundação | 3 sem | Mai/Jun 2026 | Setup Vercel, schema DB, import 2022, PMTiles gerados |
| **F2** — Pipeline ingestão | 2 sem | Jun 2026 | TSE client, parser EA20, ingest endpoint, persistência |
| **F3** — Modelo | 2 sem | Jun/Jul 2026 | Swing, bootstrap, projection, validação por replay |
| **F4** — Frontend MVP | 4 sem | Jul/Ago 2026 | Home + página UF, agulha, mapas, brushing |
| **F5** — Frontend completo (v1) | 2 sem | Ago 2026 | Governadores, sobre-modelo |
| **F6** — Hardening | 2 sem | Set 2026 | Cadastro TSE, load tests, simulados oficiais, segurança |
| **F7** — Estabilização | 1 sem | Set/Out 2026 | Bug bash, ajustes finais |
| **D — Dia D** | **04/10/2026** | — | Produção, monitoramento intensivo |
| **F8** — Análise pós-1T | 3 sem | Out 2026 | Recalibração modelo para 2T |
| **D2 — 2º turno** | **25/10/2026** | — | Produção |

**Total**: ~16 semanas de desenvolvimento + janela de eleição.

---

## Mapeamento fase → specs

| Fase | Specs envolvidas |
|---|---|
| F1 | [011-sobre-o-modelo](../specs/011-sobre-o-modelo/) (base MDX), infra (não tem spec) |
| F2 | [001-ingestao-tse](../specs/001-ingestao-tse/) |
| F3 | [002-modelo-estatistico](../specs/002-modelo-estatistico/) |
| F4 | [003-home-nacional](../specs/003-home-nacional/), [004-pagina-uf-presidencial](../specs/004-pagina-uf-presidencial/), [008-interatividade-brushing](../specs/008-interatividade-brushing/) |
| F5 | [005-pagina-uf-governador](../specs/005-pagina-uf-governador/), [006-grid-governadores](../specs/006-grid-governadores/), [011-sobre-o-modelo](../specs/011-sobre-o-modelo/) |
| F6 | [009-compartilhamento-meta](../specs/009-compartilhamento-meta/), [010-operacao-monitoramento](../specs/010-operacao-monitoramento/), [012-dashboard-status](../specs/012-dashboard-status/), [013-pagina-manutencao](../specs/013-pagina-manutencao/) |
| F7 | Bug bash, [../testing/](../testing/) completo |

## Cross-refs

- Riscos por fase: [../reference/risks.md](../reference/risks.md)
- Checklist pré-produção: [../operations/pre-prod-checklist.md](../operations/pre-prod-checklist.md)
