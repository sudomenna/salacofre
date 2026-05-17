---
title: Matriz de Rastreabilidade
description: RF ↔ Spec ↔ Componente ↔ Teste — cobertura de todos os 60+ RFs do PRD original
status: stable
---

# Matriz de Rastreabilidade

Atualizada a cada PR. Fonte de verdade para cobertura.

## RFs → Specs → Componentes → Testes

| RF | Descrição (resumo) | Prioridade | Spec | Componentes | Teste |
|---|---|---|---|---|---|
| RF-001 | Consumir feed EA20 TSE | M | [001](../specs/001-ingestao-tse/) | — | unit, integration |
| RF-002 | Polling a cada 15s | M | [001](../specs/001-ingestao-tse/) | — | unit |
| RF-003 | ETag (If-None-Match) | M | [001](../specs/001-ingestao-tse/) | — | unit |
| RF-004 | Snapshots append-only | M | [001](../specs/001-ingestao-tse/) | — | integration |
| RF-005 | Replay completo | M | [001](../specs/001-ingestao-tse/) | — | replay |
| RF-006 | Histórico 2022 zona | M | [001](../specs/001-ingestao-tse/) | — | unit |
| RF-007 | Histórico 2018 zona | S | [001](../specs/001-ingestao-tse/) | — | — |
| RF-008 | Mapeamento IBGE/TSE | M | [001](../specs/001-ingestao-tse/) | — | unit |
| RF-009 | Eleitorado por zona/seção | M | [001](../specs/001-ingestao-tse/) | — | unit |
| RF-010 | Cadastro como "interessado na divulgação" (res. TSE vigente p/ pleito 2026) | M | [001](../specs/001-ingestao-tse/) | — | manual |
| RF-011 | Swing zona-a-zona | M | [002](../specs/002-modelo-estatistico/) | — | unit |
| RF-012 | Agregação UF | M | [002](../specs/002-modelo-estatistico/) | — | unit |
| RF-013 | Projeção UF | M | [002](../specs/002-modelo-estatistico/) | — | unit, replay |
| RF-014 | Projeção nacional | M | [002](../specs/002-modelo-estatistico/) | — | unit, replay |
| RF-015 | CI95 bootstrap | M | [002](../specs/002-modelo-estatistico/) | — | unit |
| RF-016 | P(vitória) | M | [002](../specs/002-modelo-estatistico/) | — | unit |
| RF-017 | UF 0% apurado | M | [002](../specs/002-modelo-estatistico/) | — | unit |
| RF-018 | UF <5% apurado | S | [002](../specs/002-modelo-estatistico/) | — | unit |
| RF-019 | Recálculo por snapshot | M | [002](../specs/002-modelo-estatistico/) | — | integration |
| RF-020 | Persistir cada cálculo | M | [002](../specs/002-modelo-estatistico/) | — | integration |
| RF-021 | Agulha hero | M | [003](../specs/003-home-nacional/), [006](../specs/006-grid-governadores/) | `<Needle />`, `<NationalNeedle />` | e2e |
| RF-022 | Votos absolutos projetados | M | [003](../specs/003-home-nacional/), [006](../specs/006-grid-governadores/) | `<HeadlineScore />`, `<NationalNeedle />` | e2e |
| RF-023 | % projetado com CI | M | [003](../specs/003-home-nacional/) | `<HeadlineScore />`, `<ConfidenceBar />`, `<NationalNeedle />` | e2e |
| RF-024 | UFs decisivas (top 6) | M | [003](../specs/003-home-nacional/) | `<DecisiveUFsGrid />` | e2e |
| RF-025 | Tabela 27 UFs com dot-plot | M | [003](../specs/003-home-nacional/), [006](../specs/006-grid-governadores/) | `<UFForecastTable />`, `<DotPlotRange />` | e2e |
| RF-026 | Timestamp última atualização | M | [003](../specs/003-home-nacional/) | `<LiveBadge />` | e2e |
| RF-027 | Atualização sem reload | M | [003](../specs/003-home-nacional/), [006](../specs/006-grid-governadores/) | (SWR) | e2e |
| RF-028 | "Ao vivo" pulsante | S | [003](../specs/003-home-nacional/) | `<LiveBadge />` | e2e |
| RF-029 | Tabs Pres/Gov | M | [003](../specs/003-home-nacional/), [006](../specs/006-grid-governadores/) | `<Tabs />` | e2e |
| RF-030 | Switch 1T/2T | M (no 2T) | [003](../specs/003-home-nacional/) | (Tabs/Switch) | e2e |
| RF-030.1 | Mapa coroplético hero | M | [003](../specs/003-home-nacional/) | `<NationalChoroplethMap />` | e2e |
| RF-030.2 | Toggles de visualização | M | [003](../specs/003-home-nacional/) | `<MapViewToggle />` | e2e |
| RF-030.3 | Hover/tap em UF + tooltip + click navega | M | [003](../specs/003-home-nacional/), [008](../specs/008-interatividade-brushing/) | `<NationalChoroplethMap />`, `<HoverTooltip />` | e2e brushing |
| RF-030.4 | Hachura UFs que viraram | S | [003](../specs/003-home-nacional/) | `<NationalChoroplethMap />` | e2e |
| RF-030.5 | Scoreboard com gatilho 50%+1 | M | [003](../specs/003-home-nacional/) | `<HeadlineScore />` | e2e |
| RF-030.6 | Tabela agrupada por margem | M | [003](../specs/003-home-nacional/) | `<StateGroupedTable />` | e2e |
| RF-031 | Breadcrumb voltar nacional | M | [004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/) | — | e2e |
| RF-032 | Winner banner P>95% | M | [004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/) | `<WinnerBanner />` | e2e |
| RF-033 | Tabela de candidatos | M | [004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/) | `<CandidateRow />` | e2e |
| RF-034 | Mapa estado choropleth (município) | M | [004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/) | `<ChoroplethMap />` | e2e |
| RF-035 | Mapa votos reportados (bubbles) | M | [004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/) | `<BubbleMap />`, `<UFMapDuo />` | e2e |
| RF-036 | Mapa estimativa do que falta | M | [004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/) | `<ChoroplethMap />`, `<UFMapDuo />` | e2e |
| RF-037 | Tabela municípios virtualizada | M | [004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/) | `<MunicipioTable />` | e2e |
| RF-038 | Mapa swing vs 2022 | S | [004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/) | `<SwingArrowMap />`, `<ChoroplethMap />` | e2e |
| RF-039 | Agulha estadual + margem | M | [004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/) | `<Needle />`, `<ConfidenceBar />` | e2e |
| RF-040 | Margem ao longo do tempo | S | [004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/) | `<TimeSeriesChart />` | e2e |
| RF-041 | Probabilidade ao longo do tempo | S | [004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/) | `<ProbabilityOverTime />` | e2e |
| RF-042 | Turnout cumulativo | S | [004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/) | `<TurnoutAreaChart />` | e2e |
| RF-043 | "O que está movendo o forecast" | M | [004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/), [003](../specs/003-home-nacional/) | `<ForecastTransparency />`, `<ModelComposition />` | e2e |
| RF-044 | Insight textual por template | M | [004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/), [003](../specs/003-home-nacional/) | `<InsightCard />` | unit, e2e |
| RF-045 | Hover destaca em todas visualizações | M | [008](../specs/008-interatividade-brushing/) | (hover-store + consumers) | e2e brushing |
| RF-046 | Hover em linha tabela destaca mapas | M | [008](../specs/008-interatividade-brushing/) | (hover-store) | e2e brushing |
| RF-047 | Click navega para drill-down | M | [008](../specs/008-interatividade-brushing/) | — | e2e |
| RF-048 | Tooltip flutuante breakdown | M | [008](../specs/008-interatividade-brushing/) | `<HoverTooltip />` | e2e |
| RF-049 | Mobile tap-to-select | M | [008](../specs/008-interatividade-brushing/) | (hover-store + isMobile) | e2e mobile |
| RF-050 | Tooltip vira bottom-sheet mobile | M | [008](../specs/008-interatividade-brushing/) | `<BottomSheet />` | e2e mobile |
| RF-051 | OG image dinâmica | S | [009](../specs/009-compartilhamento-meta/) | `app/opengraph-image.tsx` | manual |
| RF-052 | Botões de share | S | [009](../specs/009-compartilhamento-meta/) | `<ShareBar />` | manual |
| RF-053 | URL com timestamp (snapshot) | C | [009](../specs/009-compartilhamento-meta/) | — | — |
| RF-054 | Página Sobre o Modelo | M | [011](../specs/011-sobre-o-modelo/), [009](../specs/009-compartilhamento-meta/) | (MDX) | manual |
| RF-055 | Footer fontes + disclaimer | M | [009](../specs/009-compartilhamento-meta/) | `<Footer />` | e2e |
| RF-056 | Dashboard saúde pipeline | M | [010](../specs/010-operacao-monitoramento/), [012](../specs/012-dashboard-status/) | `<MetricCard />` | manual |
| RF-057 | Alertas Slack se lag >60s | M | [010](../specs/010-operacao-monitoramento/) | — | manual (forçar) |
| RF-058 | Modo manutenção amigável | M | [010](../specs/010-operacao-monitoramento/), [013](../specs/013-pagina-manutencao/) | — | manual |
| RF-059 | Rolling release rollback | M | [010](../specs/010-operacao-monitoramento/) | — | manual |
| RF-060 | Cron toggle via env var | M | [010](../specs/010-operacao-monitoramento/) | — | unit |

## RFs adicionados pelas specs (não estavam no PRD)

| RF spec-local | Descrição | Spec |
|---|---|---|
| RF-006.1 | Header com contagem de chamadas | [006](../specs/006-grid-governadores/) |
| RF-006.2 | Filtros por status | [006](../specs/006-grid-governadores/) |
| RF-012.1 | Botão "Pausar Cron" | [012](../specs/012-dashboard-status/) |
| RF-012.2 | Botão "Forçar refresh" | [012](../specs/012-dashboard-status/) |

## Cobertura

**60 RFs originais do PRD** + 6 RFs adicionados nas specs = **66 RFs no total**. Todos mapeados pra alguma spec.

## RNFs

NFRs cobertos em [../nfr/](../nfr/) — 34 RNFs (RNF-001..RNF-034). Cada spec lista no frontmatter quais NFRs aplicam.

## ADRs

9 ADRs em [../architecture/adrs/](../architecture/adrs/) — todos `accepted`. Specs referenciam ADRs aplicáveis no frontmatter.

## Como manter atualizado

A cada PR que altera escopo (novo RF, mudança de prioridade, mudança de componente):

1. Atualizar o frontmatter da spec afetada.
2. Atualizar esta matriz.
3. Atualizar `index.json` se mudou estado de spec.

## Cross-refs

- Convenções: [./conventions.md](./conventions.md)
- Index JSON: [./index.json](./index.json)
