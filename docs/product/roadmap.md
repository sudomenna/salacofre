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
| **F6** — Simulado-ready + Hero 1T | 2.5 sem | **06/09 → 24/09** | Pipeline pronto para dado real, hero de 1º turno nas 4 rotas, **simulados oficiais do TSE 15–17/09 e 22–24/09** |
| **F7** — Estabilização + D-1 | 1.5 sem | **25/09 → 03/10** | Bug bash, checklist pré-prod, load test, alertas, `/manutencao`, OG/share, DNS, env de produção, runbook D-1 |
| **D — Dia D** | **04/10/2026** | — | Produção, monitoramento intensivo |
| **F8** — Análise pós-1T + prep 2T | 3 sem | **05/10 → 24/10** | Recalibração do modelo para o 2T, bug bash 2T |
| **D2 — 2º turno** | **25/10/2026** | — | Produção |

**Total**: ~16 semanas de desenvolvimento + janela de eleição.

> **Nota de calendário (05/09/2026).** F6 e F7 foram re-baselinadas: as janelas originais
> (17–30/ago e 31/ago–06/set) venceram durante um hiato de planejamento e deixavam quase um mês
> vazio antes do dia D. F6 foi redefinida em torno das duas janelas de simulado oficial do TSE
> e absorveu o hero de 1º turno; F7 passou a encostar na véspera do 1º turno. Detalhamento em
> [../sprints/2026-S07-f6-simulado-hero-1t.md](../sprints/2026-S07-f6-simulado-hero-1t.md) e
> [../sprints/README.md](../sprints/README.md) § "Duas formas de sprint". ⚠️ **Emenda de
> 2026-09-18**: a F7 deixou de ser uma sprint com janela e virou **quatro sprints sem data**,
> ordenadas por dependência (decisão do dono): [S08](../sprints/2026-S08-f7-enxergar.md),
> [S09](../sprints/2026-S09-f7-provar.md), [S10](../sprints/2026-S10-f7-verdade.md) e
> [S11](../sprints/2026-S11-f7-resiliencia.md). As pós-eleição foram renumeradas para S12/S13.

---

## Mapeamento fase → specs

| Fase | Specs envolvidas |
|---|---|
| F1 | [011-sobre-o-modelo](../specs/011-sobre-o-modelo/) (base MDX), infra (não tem spec) |
| F2 | [001-ingestao-tse](../specs/001-ingestao-tse/) |
| F3 | [002-modelo-estatistico](../specs/002-modelo-estatistico/) |
| F4 | [003-home-nacional](../specs/003-home-nacional/), [004-pagina-uf-presidencial](../specs/004-pagina-uf-presidencial/), [008-interatividade-brushing](../specs/008-interatividade-brushing/) |
| F5 | [005-pagina-uf-governador](../specs/005-pagina-uf-governador/), [006-grid-governadores](../specs/006-grid-governadores/), [011-sobre-o-modelo](../specs/011-sobre-o-modelo/) |
| F6 | [001-ingestao-tse](../specs/001-ingestao-tse/) (RF-010 + hardening), [002-modelo-estatistico](../specs/002-modelo-estatistico/) (participação), [003-home-nacional](../specs/003-home-nacional/) (hero 1T, RF-046/047/048) |
| F7 | [009-compartilhamento-meta](../specs/009-compartilhamento-meta/), [010-operacao-monitoramento](../specs/010-operacao-monitoramento/), [013-pagina-manutencao](../specs/013-pagina-manutencao/), bug bash, [../testing/](../testing/) completo |
| Pós-D1 | [008-interatividade-brushing](../specs/008-interatividade-brushing/), [012-dashboard-status](../specs/012-dashboard-status/) (ver nota na S08), [014-boca-de-urna](../specs/014-boca-de-urna/), [015-drill-down-municipio](../specs/015-drill-down-municipio/) |

## Cross-refs

- Riscos por fase: [../reference/risks.md](../reference/risks.md)
- Checklist pré-produção: [../operations/pre-prod-checklist.md](../operations/pre-prod-checklist.md)
