---
title: Matriz de Rastreabilidade
description: RF ↔ Spec ↔ Componente ↔ Teste — cobertura de todos os 60+ RFs do PRD original
status: stable
---

# Matriz de Rastreabilidade

Atualizada a cada PR. Fonte de verdade para cobertura.

> **Nota S05 — Cobertura de testes e extensões**: a coluna "Teste" reflete o que está
> verde **hoje** (`pnpm test` + `tests/unit/**`). A suíte e2e Playwright
> (diretório `tests/e2e/` é `.gitkeep`) está **deferida para S05**. Specs 003
> e 004 foram promovidas a `shipped` com base em cobertura unit + integration
> para os RFs M (Must) e Should. Marcadores "e2e (deferred S05)" indicam
> validação de interação completa que exige browser real (hover de mapa
> MapLibre, click → router.push, brushing entre componentes).
>
> **Extensões S05 (sem RFs novos formais)**: RF-021..044 foram expandidos para suportar
> multi-candidato em 1T e 2º turno (novos componentes `<TurnoBadge />`, `<TwoRoundIndicator />`,
> `<CandidateRanking />`, `<MinorCandidatesList />`, `<RaceTypeIndicator />`). Cobertura
> desses componentes extensões está em `tests/unit/components/[nova-spec-05-componentes].test.tsx`.

## RFs → Specs → Componentes → Testes

| RF | Descrição (resumo) | Prioridade | Spec | Componentes | Teste |
|---|---|---|---|---|---|
| RF-001 | Consumir feed EA20 TSE | M | [001](../specs/001-ingestao-tse/) | — | unit, integration |
| RF-002 | Polling a cada 15s | M | [001](../specs/001-ingestao-tse/) | — | unit, integration |
| RF-003 | ETag (If-None-Match) | M | [001](../specs/001-ingestao-tse/) | — | unit, integration |
| RF-004 | Snapshots append-only | M | [001](../specs/001-ingestao-tse/) | — | unit, integration |
| RF-005 | Replay completo | M | [001](../specs/001-ingestao-tse/) | — | replay |
| RF-006 | Histórico 2022 zona | M | [001](../specs/001-ingestao-tse/) | — | unit |
| RF-007 | Histórico 2018 zona | S | [001](../specs/001-ingestao-tse/) | — | unit |
| RF-008 | Mapeamento IBGE/TSE | M | [001](../specs/001-ingestao-tse/) | — | unit |
| RF-009 | Eleitorado por zona/seção | M | [001](../specs/001-ingestao-tse/) | — | unit |
| RF-010 | Conformidade com Res. TSE 23.751/2026 (arts. 264–269) | M | [001](../specs/001-ingestao-tse/) | — | — |
| RF-010.1 | Integridade dado oficial (append-only, sem alteração) | M | [001](../specs/001-ingestao-tse/) | — | unit |
| RF-010.2 | Projeção rotulada como conteúdo derivado | M | [001](../specs/001-ingestao-tse/) | — | unit |
| RF-010.3 | Rate limiter saída ≤50 req/s | M | [001](../specs/001-ingestao-tse/) | — | unit |
| RF-010.4 | Requisição condicional (304 conta para cota) | M | [001](../specs/001-ingestao-tse/) | — | unit (`client.test.ts` — `If-None-Match`, 304, e assert de que o 304 consome token do rate limiter) |
| RF-010.5 | Proibição sondar URL adivinhada | M | [001](../specs/001-ingestao-tse/) | — | unit (`no-url-probing.test.ts` — varredura de fonte: o host do TSE só pode aparecer nas 2 constantes de base URL) + `targets.test.ts` (builders) |
| RF-010.6 | Identificação honesta no User-Agent | M | [001](../specs/001-ingestao-tse/) | — | unit |
| RF-011 | Extrapolação do apurado por zona: `k = te/esi`, `V_c = vap_c·k` (ADR-0021) | M | [002](../specs/002-modelo-estatistico/) | — | pytest (`test_extrapolation.py::test_esi_metade_de_te_dobra_votos_projetados`, `::test_reprodutibilidade_bit_a_bit_mesmo_seed_duas_bases`, `test_orchestrator.py::test_do_project_e_invariante_a_historical`) |
| RF-012 | Agregação por UF: razão de somas nas duas bases, rótulo "votáveis" (ADR-0021) | M | [002](../specs/002-modelo-estatistico/) | — | pytest (`test_extrapolation.py::test_razao_de_somas_diferente_de_media_simples`, `::test_soma_estimates_comparecimento_igual_vv_sobre_c_zona_unica`) |
| RF-013 | Zona não apurada imputada pela proporção da própria UF; share inalterado, volume completo (ADR-0021) | M | [002](../specs/002-modelo-estatistico/) | — | pytest (`test_extrapolation.py::test_e3_zona_nao_apurada_nao_altera_share_soma_volume`) |
| RF-014 | Projeção nacional | M | [002](../specs/002-modelo-estatistico/) | — | unit, replay |
| RF-015 | CI95 bootstrap | M | [002](../specs/002-modelo-estatistico/) | — | unit |
| RF-016 | P(vitória) | M | [002](../specs/002-modelo-estatistico/) | — | unit |
| RF-017 | UF sem zona apurada: proporção nacional com IC ±10pp (cargo 1) ou UF omitida (cargo 3) (ADR-0021) | M | [002](../specs/002-modelo-estatistico/) | — | pytest (`test_extrapolation.py::test_impute_uf_from_national_ci_10pp_e_volume`, `::test_impute_uf_from_national_clipa_perto_das_bordas`, `::test_zero_zonas_retorna_none`) |
| RF-018 | UF <5% apurado (penalização IC ×1.5, nas duas bases) | S | [002](../specs/002-modelo-estatistico/) | — | pytest (`test_extrapolation.py::test_rf018_infla_ci_1_5x_nas_duas_bases`, `test_edge_cases.py`) |
| RF-019 | Recálculo por snapshot | M | [002](../specs/002-modelo-estatistico/) | — | integration |
| RF-020 | Persistir cada cálculo | M | [002](../specs/002-modelo-estatistico/) | — | integration |
| RF-020.1 | Projeção de participação e agregado "Outros" com IC | M | [002](../specs/002-modelo-estatistico/) | — | pytest (`test_turnout.py`, `test_outros.py`, `test_orchestrator.py::test_do_project_e_invariante_a_historical`) — requisito **do modelo**; a contraparte de UI é RF-062 |
| RF-020.2 | Duas bases por candidato (votáveis e comparecimento) com resíduo declarado (ADR-0021/0020) | M | [002](../specs/002-modelo-estatistico/) | `<ProjectionThermometers />` | pytest (`test_extrapolation.py::test_pareamento_2_candidatos_soma_1_base_votaveis`, `::test_soma_estimates_comparecimento_igual_vv_sobre_c_zona_unica`) + vitest (`ProjectionThermometers.test.tsx`) |
| RF-020.3 | `votos_projetados` = Σ zona → UF → BR, persistido em `projections` (ADR-0021) | M | [002](../specs/002-modelo-estatistico/) | `<HeadlineScore />` | pytest (`test_extrapolation.py::test_aggregate_national_votos_soma_por_candidato_e_total`, `test_orchestrator.py`) |
| RF-021 | Agulha hero | M | [003](../specs/003-home-nacional/), [006](../specs/006-grid-governadores/) | `<Needle />`, `<NationalNeedle />` | unit |
| RF-022 | Votos absolutos projetados | M | [003](../specs/003-home-nacional/), [006](../specs/006-grid-governadores/) | `<HeadlineScore />`, `<NationalNeedle />` | unit |
| RF-023 | % projetado com CI | M | [003](../specs/003-home-nacional/) | `<HeadlineScore />`, `<ConfidenceBar />`, `<NationalNeedle />` | unit |
| RF-024 | UFs decisivas (top 6) | M | ~~[003](../specs/003-home-nacional/)~~ | ⚠️ **sem cobertura** — removido em 08/09 (ADR-0033, D2) | — |
| RF-025 | Tabela 27 UFs com dot-plot | M | [003](../specs/003-home-nacional/), [006](../specs/006-grid-governadores/) | `<UFForecastTable />`, `<DotPlotRange />` | deferred S05 |
| RF-026 | Timestamp última atualização | M | [003](../specs/003-home-nacional/) | `<LiveBadge />` | unit |
| RF-027 | Atualização sem reload | M | [003](../specs/003-home-nacional/), [006](../specs/006-grid-governadores/) | (SWR) | unit |
| RF-028 | "Ao vivo" pulsante | S | [003](../specs/003-home-nacional/) | `<LiveBadge />` | unit |
| RF-029 | Tabs Pres/Gov | M | [003](../specs/003-home-nacional/), [006](../specs/006-grid-governadores/) | `<Tabs />` | unit |
| RF-030 | Switch 1T/2T | M (no 2T) | [003](../specs/003-home-nacional/) | (Tabs/Switch) | unit |
| RF-005.1 | K-1 disclaimer adaptativo | M | [005](../specs/005-pagina-uf-governador/) | `<K1Banner />` | unit |
| RF-005.2 | Waffle de municípios | M | [005](../specs/005-pagina-uf-governador/) | `<MunicipioWaffleGrid />` | unit |
| RF-005.3 | Apuração por mesorregião | M | [005](../specs/005-pagina-uf-governador/) | (tabela condicional) | unit |
| RF-005.4 | Maiores municípios | M | [005](../specs/005-pagina-uf-governador/) | `<MunicipioTable mode="top-by-eleitorado" />` | unit |
| RF-006.1 | Header com contagem de chamadas | M | [006](../specs/006-grid-governadores/) | `<RaceStatsCards />` | unit |
| RF-006.2 | Filtros por status | M | [006](../specs/006-grid-governadores/) | `<FilterBar />` | unit |
| RF-006.3 | Cartograma hexagonal | M | [006](../specs/006-grid-governadores/) | `<HexCartogramBrasil />` | unit |
| RF-006.4 | Breaking news ticker | M | [006](../specs/006-grid-governadores/) | `<BreakingNewsTicker />` | unit |
| RF-006.5 | Tabs cargo com disabled | M | [006](../specs/006-grid-governadores/) | `<Tabs disabled />` | unit |
| RF-030.1 | Mapa coroplético hero | M | [003](../specs/003-home-nacional/) | `<NationalChoroplethMap />` | unit (SSR shell) + e2e (deferred S05) |
| RF-030.2 | Toggles de visualização | M | [003](../specs/003-home-nacional/) | `<MapViewToggle />` | unit |
| RF-030.3 | Hover/tap em UF + tooltip + click navega | M | [003](../specs/003-home-nacional/), [008](../specs/008-interatividade-brushing/) | `<NationalChoroplethMap />`, `<HoverTooltip />` | unit (contrato semântico) + e2e (deferred S05) |
| RF-030.4 | Hachura UFs que viraram | S | [003](../specs/003-home-nacional/) | `<NationalChoroplethMap />` | deferred S05 |
| RF-030.5 | Scoreboard com gatilho 50%+1 | M | [003](../specs/003-home-nacional/) | `<HeadlineScore />` | unit |
| RF-030.6 | Tabela agrupada por margem | M | [003](../specs/003-home-nacional/) | `<StateGroupedTable />` | unit |
| RF-030.7 | Indicador P(2º turno) | M | [003](../specs/003-home-nacional/) | `<ChancesPanel />` | unit |
| RF-030.8 | Transparência total (sem collapsible) | M | [003](../specs/003-home-nacional/) | `<MinorCandidatesList />`, `<RaceTypeIndicator />` | unit |
| RF-030.9 | Cenários 2º turno | S | ~~[003](../specs/003-home-nacional/)~~ | ⚠️ **sem cobertura** — removido em 08/09 (ADR-0033, D2) | — |
| RF-061 | Hero de seis termômetros no 1º turno | M | [003](../specs/003-home-nacional/), [004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/) | `<ProjectionThermometer />`, `<ProjectionThermometers />` | unit (`ProjectionThermometer.test.tsx`, `ProjectionThermometers.test.tsx`) + integration (`home-page.test.tsx`, `UFPage.test.tsx`, `uf-governador-page.test.tsx`) |
| RF-062 | Participação e "Outros" na interface; rótulo "Projeção a partir do apurado · N zonas · X% apurado" (ADR-0021) | M | [003](../specs/003-home-nacional/), [004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/), [006](../specs/006-grid-governadores/) | `<ProjectionThermometers />`, `<BaseToggle />` (Fase 5) | unit (`participacao.test.ts`, `ProjectionThermometers.test.tsx`, `payload-contract.test.ts`) + integration (`governador-page.test.tsx`) |
| RF-063 | Identidade visual por trilha | M | [003](../specs/003-home-nacional/), [004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/), [006](../specs/006-grid-governadores/) | `<TrilhaKicker />`, `<RaceHeader />`, `<UFBreadcrumb />` | unit (`TrilhaKicker.test.tsx`, `RaceHeader.test.tsx`, `UFBreadcrumb.test.tsx`) + integration (4 smokes SSR) |
| RF-031 | Breadcrumb voltar nacional | M | [004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/) | `<UFBreadcrumb />` | unit |
| RF-032 | Winner banner P>95% | M | [004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/) | `<WinnerBanner />` | unit |
| RF-033 | Tabela de candidatos | M | [004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/) | `<CandidateRow />` | unit |
| RF-034 | Mapa estado choropleth (município) | M | [004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/) | `<ChoroplethMapUF />` | ⚠️ **sem cobertura** — nenhum teste importa o componente (verificado 05/09); e2e deferido |
| RF-035 | Mapa votos reportados (bubbles) | M | ~~[004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/)~~ | ⚠️ **sem cobertura** — removido em 08/09 (ADR-0033, D1); nenhum teste, nenhuma rota | — |
| RF-036 | Mapa estimativa do que falta | M | ~~[004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/)~~ | ⚠️ **sem cobertura** — removido em 08/09 (ADR-0033, D1); nenhum teste, nenhuma rota | — |
| RF-037 | Tabela municípios virtualizada | M | [004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/) | `<MunicipioTable />` | unit |
| RF-038 | Mapa swing vs 2022 | S | ~~[004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/)~~ | ⚠️ **sem cobertura** — removido em 08/09 (ADR-0033, D1); nenhum teste, nenhuma rota | — |
| RF-039 | Agulha estadual + margem | M | ~~[004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/)~~ | ⚠️ **sem cobertura** — removido em 08/09 (ADR-0033, D1); nenhuma rota | — |
| RF-040 | Margem ao longo do tempo | S | ~~[004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/)~~ | ⚠️ **sem cobertura** — removido em 08/09 (ADR-0033, D1); nenhuma rota | — |
| RF-041 | Probabilidade ao longo do tempo | S | ~~[004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/)~~ | ⚠️ **sem cobertura** — removido em 08/09 (ADR-0033, D1); nenhuma rota | — |
| RF-042 | Turnout cumulativo | S | ~~[004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/)~~ | ⚠️ **sem cobertura** — removido em 08/09 (ADR-0033, D1); nenhuma rota | — |
| RF-043 | "O que está movendo o forecast" | M | [004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/), [003](../specs/003-home-nacional/) | `<ForecastTransparency />`, `<ModelComposition />` | unit |
| RF-044 | Insight textual por template | M | ~~[004](../specs/004-pagina-uf-presidencial/), [005](../specs/005-pagina-uf-governador/)~~, [003](../specs/003-home-nacional/) | ⚠️ **sem cobertura em 004/005** — removido em 08/09 (ADR-0033, D1); cobre RF-044 ainda na home | home unit |
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
| RF-055 | Footer fontes + disclaimer | M | [009](../specs/009-compartilhamento-meta/) | `<Footer />` | unit |
| RF-056 | Dashboard saúde pipeline | M | [010](../specs/010-operacao-monitoramento/), [012](../specs/012-dashboard-status/) | `<MetricCard />` | manual |
| RF-057 | Alertas Slack se lag >60s | M | [010](../specs/010-operacao-monitoramento/) | — | manual (forçar) |
| RF-058 | Modo manutenção amigável | M | [010](../specs/010-operacao-monitoramento/), [013](../specs/013-pagina-manutencao/) | — | manual |
| RF-058.1 | Modo transição 1T→2T | M | [013](../specs/013-pagina-manutencao/) | `<TurnoTransitionBanner />` | unit |
| RF-058.2 | Roteamento e redirect manutenção | M | [013](../specs/013-pagina-manutencao/) | (middleware) | unit |
| RF-059 | Rolling release rollback | M | [010](../specs/010-operacao-monitoramento/) | — | manual |
| RF-060 | Cron toggle via env var | M | [010](../specs/010-operacao-monitoramento/) | — | unit |

## RFs adicionados pelas specs (não estavam no PRD)

| RF spec-local | Descrição | Spec |
|---|---|---|
| RF-005.1 | K-1 disclaimer adaptativo | [005](../specs/005-pagina-uf-governador/) |
| RF-005.2 | Waffle de municípios | [005](../specs/005-pagina-uf-governador/) |
| RF-005.3 | Apuração por mesorregião | [005](../specs/005-pagina-uf-governador/) |
| RF-005.4 | Maiores municípios | [005](../specs/005-pagina-uf-governador/) |
| RF-006.1 | Header com contagem de chamadas | [006](../specs/006-grid-governadores/) |
| RF-006.2 | Filtros por status | [006](../specs/006-grid-governadores/) |
| RF-006.3 | Cartograma hexagonal | [006](../specs/006-grid-governadores/) |
| RF-006.4 | Breaking news ticker | [006](../specs/006-grid-governadores/) |
| RF-006.5 | Tabs cargo com disabled | [006](../specs/006-grid-governadores/) |
| RF-012.1 | Botão "Pausar Cron" | [012](../specs/012-dashboard-status/) |
| RF-012.2 | Botão "Forçar refresh" | [012](../specs/012-dashboard-status/) |
| RF-010.1 | Integridade dado oficial | [001](../specs/001-ingestao-tse/) |
| RF-010.2 | Projeção rotulada como derivada | [001](../specs/001-ingestao-tse/) |
| RF-010.3 | Rate limiter saída | [001](../specs/001-ingestao-tse/) |
| RF-010.4 | Requisição condicional (304 conta) | [001](../specs/001-ingestao-tse/) |
| RF-010.5 | Proibição sondar URL | [001](../specs/001-ingestao-tse/) |
| RF-010.6 | User-Agent honesto | [001](../specs/001-ingestao-tse/) |
| RF-030.7 | Indicador P(2º turno) | [003](../specs/003-home-nacional/) |
| RF-030.8 | Transparência total (sem collapsible) | [003](../specs/003-home-nacional/) |
| RF-030.9 | Cenários 2º turno | [003](../specs/003-home-nacional/) |
| RF-061 | Hero seis termômetros 1T | [003](../specs/003-home-nacional/) |
| RF-063 | Identidade visual por trilha | [003](../specs/003-home-nacional/) |

## Cobertura

**60 RFs originais do PRD** + 30 RFs adicionados nas specs (RF-005.1-4, RF-006.1-5, RF-012.1-2, RF-058.1-2, RF-010.1-6, RF-020.1-3, RF-030.7-9, RF-061-63) = **90 RFs no total**. Todos mapeados pra alguma spec.

## RNFs

NFRs cobertos em [../nfr/](../nfr/) — 34 RNFs (RNF-001..RNF-034). Cada spec lista no frontmatter quais NFRs aplicam.

## ADRs

26 ADRs em [../architecture/adrs/](../architecture/adrs/) — 25 `accepted`, 1 `proposed` (ADR-0024). Specs referenciam ADRs aplicáveis no frontmatter.

**Novos em 2026-09-07**:
- ADR-0024 (paleta editorial por partido) — `proposed`, supersede condicional de ADR-0013
- ADR-0025 (design system Atlas Menna restyle-in-place) — `accepted`, afeta specs 003/004/005/006/011
- ADR-0026 (Senador e Deputado Federal) — `accepted`, emenda ADR-0001 (Vercel Blob como exceção ao read path para Deputado)

## Como manter atualizado

A cada PR que altera escopo (novo RF, mudança de prioridade, mudança de componente):

1. Atualizar o frontmatter da spec afetada.
2. Atualizar esta matriz.
3. Atualizar `index.json` se mudou estado de spec.

## Cross-refs

- Convenções: [./conventions.md](./conventions.md)
- Index JSON: [./index.json](./index.json)
