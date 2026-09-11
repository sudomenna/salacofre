---
title: Catálogo de Componentes
description: Catálogo de componentes com referência cruzada a RFs, arquivo real e teste
status: stable
source: PRD.md § 14.3
last_updated: 2026-09-05
---

# Catálogo de Componentes

> **Regra deste arquivo**: a coluna `Arquivo` só contém caminhos **verificados no disco**.
> Um componente que ainda não existe entra com status `planejada` e caminho *previsto*
> entre parênteses — nunca como se estivesse pronto. Saneado em 2026-09-05 (S07/Fase 3)
> após o catálogo acumular 8 entradas fantasma, 5 caminhos errados e 6 linhas duplicadas.

**Legenda de status**

| Status | Significado |
|---|---|
| ✅ | Arquivo existe no disco |
| 🕐 planejada | Componente ainda não construído; há RF vivo apontando para ele |
| ⛔ substituída | Nome mantido só porque `traceability.md`/specs ainda o citam; a função é cumprida por outro componente |

## Atoms

| Componente | Status | RFs atendidos | Arquivo | Testes |
|---|---|---|---|---|
| `<Needle />` | ✅ | RF-021, RF-039 | `components/atoms/needle/Needle.tsx` | `tests/unit/components/Needle.test.tsx` |
| `<CandidateBar />` | ✅ | RF-022, RF-023 | `components/atoms/bars/CandidateBar.tsx` | `tests/unit/components/CandidateBar.test.tsx` |
| `<ProjectionThermometer />` | ✅ S07 | RF-061, RF-062 | `components/atoms/bars/ProjectionThermometer.tsx` | `tests/unit/components/ProjectionThermometer.test.tsx` |
| `<TimeSeriesChart />` | ⛔ órfão | ~~RF-040~~ | `components/atoms/charts/TimeSeriesChart.tsx` | tests existem mas sem call site em produção |
| `<ProbabilityOverTime />` | ⛔ órfão | ~~RF-041~~ | `components/atoms/charts/ProbabilityOverTime.tsx` | tests existem mas sem call site em produção |
| `<TurnoutAreaChart />` | ⛔ órfão | ~~RF-042~~ | `components/atoms/charts/TurnoutAreaChart.tsx` | tests existem mas sem call site em produção |
| `<ChoroplethMapUF />` | ✅ | RF-034, RF-036 | `components/atoms/maps/ChoroplethMapUF.tsx` | — (sem teste dedicado) |
| `<BubbleMap />` | ⛔ órfão | ~~RF-035~~ | `components/atoms/maps/BubbleMap.tsx` | — (sem teste dedicado) |
| `<SwingArrowMap />` | ⛔ órfão | ~~RF-038~~ | `components/atoms/maps/SwingArrowMap.tsx` | — (sem teste dedicado) |
| `<MapSkeleton />` | ✅ | (ADR-0010 — placeholder de carga do chunk MapLibre) | `components/atoms/maps/MapSkeleton.tsx` | `tests/unit/components/MapSkeleton.test.tsx` |
| `<MapPlaceholder />` | ✅ | (ADR-0010 — fallback client dos wrappers dinâmicos) | `components/atoms/maps/MapPlaceholder.tsx` | — (sem teste dedicado) |
| `<CandidateRow />` | ✅ | RF-033 | `components/atoms/tables/CandidateRow.tsx` | `tests/unit/components/CandidateRow.test.tsx` |
| `<WinnerBanner />` | ✅ | RF-032 | `components/atoms/banners/WinnerBanner.tsx` | `tests/unit/components/WinnerBanner.test.tsx` |
| `<NewsClippingPlaceholder />` | ⛔ órfão | (spec 004 — slot visual, sem RF formal) | `components/atoms/banners/NewsClippingPlaceholder.tsx` | tests não existem; componente órfão desde 08/09 |
| `<TurnoBadge />` | ✅ S05 | RF-030 ext | `components/atoms/badges/TurnoBadge.tsx` | `tests/unit/components/TurnoBadge.test.tsx` |
| `<RaceTypeIndicator />` | ✅ S05 | RF-030 ext | `components/atoms/badges/RaceTypeIndicator.tsx` | `tests/unit/components/RaceTypeIndicator.test.tsx` |
| `<MinorCandidatesList />` | ✅ S05 | RF-030 ext, RF-031..044 ext | `components/atoms/lists/MinorCandidatesList.tsx` | `tests/unit/components/MinorCandidatesList.test.tsx` |
| `<MapViewToggle />` | ✅ | RF-030.2 | `components/atoms/controls/MapViewToggle.tsx` | `tests/unit/components/MapViewToggle.test.tsx` |
| `<BaseToggle />` | ✅ S07 (não integrado) | RF-062 (E2b) | `components/atoms/controls/BaseToggle.tsx` | `tests/unit/components/BaseToggle.test.tsx` |
| `<Tabs />` | ✅ | RF-029, RF-030, RF-006.5 | `components/atoms/controls/Tabs.tsx` | `tests/unit/components/Tabs.test.tsx`, `Tabs.disabled.test.tsx` |
| `<UFBreadcrumb />` | ✅ | RF-031, RF-063 | `components/atoms/nav/UFBreadcrumb.tsx` | `tests/unit/components/UFBreadcrumb.test.tsx` |
| `<TrilhaKicker />` | ✅ S07 | RF-063 | `components/atoms/nav/TrilhaKicker.tsx` | `tests/unit/components/TrilhaKicker.test.tsx` |
| `<ExtrapolationIllustration />` | ✅ | (spec 011) | `app/sobre-o-modelo/page.tsx` (função local, não é arquivo próprio) | — (coberto por SSR da página) |
| `<ConfidenceBandIllustration />` | ✅ | (spec 011) | `app/sobre-o-modelo/page.tsx` (função local) | — |
| `<NeedleIllustration />` | ✅ | (spec 011) | `app/sobre-o-modelo/page.tsx` (função local) | — |
| `<ConfidenceBar />` | 🕐 planejada | RF-023 | *previsto*: `components/atoms/bars/ConfidenceBar.tsx` | — |
| `<DotPlotRange />` | 🕐 planejada | RF-025 | *previsto*: `components/atoms/charts/DotPlotRange.tsx` | — |
| `<ModelComposition />` | 🕐 planejada | RF-043 | *previsto*: `components/atoms/charts/ModelComposition.tsx` | — |
| `<ChoroplethMap />` | ⛔ substituída | RF-034, RF-036, RF-038 | — | — |

Notas dos atoms não construídos:

- `<ConfidenceBar />` — RF-023 é hoje atendido por `<HeadlineScore />` + `<CandidateBar />`
  (`role="meter"` com IC95 no rodapé) e, no 1º turno, por `<ProjectionThermometer />`.
  Mantido como planejado porque RF-023 segue vivo em `traceability.md`.
- `<DotPlotRange />` e `<UFForecastTable />` — RF-025 está **deferido** desde S05
  (`docs/specs/003-home-nacional/spec.md:15`, `tasks.md:94`): a spec 003 entrega dot-plot
  inline via `<StateGroupedTable />`.
- `<ModelComposition />` — RF-043 é hoje atendido por `<ForecastTransparency />` (shipped,
  com teste). Mantido como planejado porque `traceability.md:85` ainda o lista.
- `<ChoroplethMap />` — nunca existiu como arquivo. O mapa de UF em granularidade de
  município é `<ChoroplethMapUF />` (`mode='leader'` → RF-034, `mode='estimate'` → RF-036);
  o swing é `<SwingArrowMap />` (RF-038). Linha mantida só porque `traceability.md:76,78,80`
  e `docs/specs/005-pagina-uf-governador/spec.md:12` ainda a citam.

## Blocks

| Componente | Status | RFs atendidos | Arquivo | Testes |
|---|---|---|---|---|
| `<NationalNeedle />` | ✅ | RF-021, RF-022, RF-023 | `components/blocks/NationalNeedle.tsx` | `tests/unit/components/NationalNeedle.test.tsx` |
| `<HeadlineScore />` | ✅ | RF-022, RF-023, RF-030.5 | `components/blocks/HeadlineScore.tsx` | `tests/unit/components/HeadlineScore.test.tsx` |
| `<ProjectionThermometers />` | ✅ S07 | RF-061, RF-062 | `components/blocks/ProjectionThermometers.tsx` | `tests/unit/components/ProjectionThermometers.test.tsx` (testa `base` prop Fase 5) |
| `<NationalChoroplethMap />` | ✅ | RF-030.1, RF-030.3, RF-030.4 | `components/blocks/NationalChoroplethMap.tsx` | `tests/unit/components/NationalChoroplethMap.test.tsx` |
| `<_NationalChoroplethMapImpl />` | ✅ | RF-030.1..RF-030.4 (interno — só via `next/dynamic`, ADR-0010) | `components/blocks/_NationalChoroplethMapImpl.tsx` | coberto por `NationalChoroplethMap.test.tsx` |
| `<StateGroupedTable />` | ✅ | RF-030.6 | `components/blocks/StateGroupedTable.tsx` | `tests/unit/components/StateGroupedTable.test.tsx` |
| `<DecisiveUFsGrid />` | ⛔ órfão | ~~RF-024~~ | `components/blocks/DecisiveUFsGrid.tsx` | tests existem mas sem call site em produção |
| `<UFMapDuo />` | ⛔ órfão | ~~RF-035, RF-036~~ | `components/blocks/UFMapDuo.tsx` | — (sem teste dedicado) |
| `<UfMapsLazy />` | ⛔ órfão | ~~RF-034, RF-035, RF-036, RF-038~~ | `components/blocks/UfMapsLazy.tsx` | — (sem teste dedicado); exports `UfMapDuoLazy`/`UfSwingArrowMapLazy` órfãos |
| `<MunicipioTable />` | ✅ S07 | RF-005.4, RF-037 | `components/blocks/MunicipioTable.tsx` | `tests/unit/components/MunicipioTable.test.tsx`, `MunicipioTable.topByEleitorado.test.tsx` (modo novo em S07: ordenação capital-primeiro, eleitorado desc, subtítulo `"N eleitores · X% apurado"`) |
| `<MunicipioExplorer />` | ✅ S07 | (painel de folha de município com figura "Eleitores", novo em S07 ADR-0035) | `components/blocks/MunicipioExplorer.tsx` | `tests/unit/components/MunicipioExplorer.test.tsx` |
| `<MunicipioWaffleGrid />` | ✅ S06 | RF-005.2 | `components/blocks/MunicipioWaffleGrid.tsx` | `tests/unit/components/MunicipioWaffleGrid.test.tsx` |
| `<ForecastTransparency />` | ✅ | RF-043 | `components/blocks/ForecastTransparency.tsx` | `tests/unit/components/ForecastTransparency.test.tsx` |
| `<InsightCard />` | ✅ | RF-044 | `components/blocks/InsightCard.tsx` | `tests/unit/components/InsightCard.test.tsx` |
| `<ApuracaoMeta />` | ✅ | RF-026 | `components/blocks/ApuracaoMeta.tsx` | `tests/unit/components/ApuracaoMeta.test.tsx` |
| `<NationalWinnerBanner />` | ✅ | RF-032 (variante nacional) | `components/blocks/NationalWinnerBanner.tsx` | `tests/unit/components/NationalWinnerBanner.test.tsx` |
| `<RunoffScenarios />` | ⛔ órfão | ~~RF-030.9~~ | `components/blocks/RunoffScenarios.tsx` | tests existem mas sem call site em produção |
| `<TurnoOneRecap />` | ✅ S06 | (ADR-0016 — sem RF formal) | `components/blocks/TurnoOneRecap.tsx` | `tests/unit/components/TurnoOneRecap.test.tsx` |
| `<TwoRoundIndicator />` | ⛔ órfão | ~~RF-030.7~~ | `components/blocks/TwoRoundIndicator.tsx` | tests existem mas sem call site em produção (RF-030.7 migrou para `<ChancesPanel />`) |
| `<CandidateRanking />` | ✅ S05 | RF-030 ext, RF-031..044 ext (rank 3–6) | `components/blocks/CandidateRanking.tsx` | `tests/unit/components/CandidateRanking.test.tsx` |
| `<GovernorCard />` | ✅ S06 | RF-006.3 | `components/blocks/GovernorCard.tsx` | `tests/unit/components/GovernorCard.test.tsx` |
| `<HexCartogramBrasil />` | ✅ S06 | RF-006.3 | `components/blocks/HexCartogramBrasil.tsx` | `tests/unit/components/HexCartogramBrasil.test.tsx` |
| `<RaceStatsCards />` | ✅ S06 | RF-006.1 | `components/blocks/RaceStatsCards.tsx` | `tests/unit/components/RaceStatsCards.test.tsx` |
| `<BreakingNewsTicker />` | ✅ S06 | RF-006.4 | `components/blocks/BreakingNewsTicker.tsx` | `tests/unit/components/BreakingNewsTicker.test.tsx` |
| `<ResultPanel />` | ✅ S07 | RF-022, RF-023, RF-030.5, RF-030.6, RF-030.8 | `components/blocks/ResultPanel.tsx` | `tests/unit/components/ResultPanel.test.tsx` |
| `<CandidateListCollapse />` | ✅ S07 | RF-030.8 (colapso visual preservando DOM, ADR-0034 D21) | `components/blocks/CandidateListCollapse.tsx` | coberto por `ResultPanel.test.tsx` |
| `<ChancesPanel />` | ✅ S07 | RF-030.7 (migrado de `TwoRoundIndicator`, ADR-0034 D21) | `components/blocks/ChancesPanel.tsx` | `tests/unit/components/ChancesPanel.test.tsx` |
| `<NationalMapBlock />` | ✅ S07 | RF-030.1-4 (refator layout, ADR-0033) | `components/blocks/NationalMapBlock.tsx` | — (não tem componente separado de teste; coberto pelo smoke de home) |
| `<UFForecastTable />` | 🕐 planejada | RF-025 (deferido desde S05) | *previsto*: `components/blocks/UFForecastTable.tsx` | — |
| `<MaintenancePageMessage />` | 🕐 planejada | RF-058 | *previsto*: `components/blocks/MaintenancePageMessage.tsx` | — |
| `<TurnoTransitionBanner />` | 🕐 planejada | RF-058.1 | *previsto*: `components/blocks/TurnoTransitionBanner.tsx` | — |

`<MaintenancePageMessage />` e `<TurnoTransitionBanner />` pertencem à
[spec 013](../specs/013-pagina-manutencao/) (`status: ready`, não implementada).
`app/manutencao/` existe no disco apenas como diretório vazio com `.gitkeep`.

## Layout

| Componente | Status | RFs atendidos | Arquivo | Testes |
|---|---|---|---|---|
| `<RaceHeader />` | ✅ S07 | RF-063 | `components/layout/RaceHeader.tsx` | `tests/integration/home-page.test.tsx`, `governador-page.test.tsx`, `uf-governador-page.test.tsx`, `tests/unit/components/UFPage.test.tsx` |
| `<LiveBadge />` | ✅ | RF-026, RF-028 | `components/layout/LiveBadge.tsx` | `tests/unit/components/LiveBadge.test.tsx` |
| `<Footer />` | ✅ | RF-055 | `components/layout/Footer.tsx` | `tests/unit/components/Footer.test.tsx` |
| `<AppShellSplit />` | ✅ S07 | (shell de duas colunas, ADR-0033) | `components/layout/AppShellSplit.tsx` | — (coberto por smoke de UF pages) |
| `<PersistentMapFrame />` | ✅ S07 | RF-030.1-4 (moldura persistente, ADR-0033 § 1) | `components/layout/PersistentMapFrame.tsx` | — (coberto por smoke de UF pages) |
| `<UfPicker />` | ✅ S07 | (controle de UF no shell, ADR-0033) | `components/layout/UfPicker.tsx` | — (coberto por smoke de UF navigation) |
| `<ThemeToggle />` | ✅ S07 | (tema claro/escuro no masthead; persistência em `localStorage`, nunca cookie — ADR-0025 § 5) | `components/atoms/controls/ThemeToggle.tsx` | `tests/unit/state/theme.test.ts`, `tests/unit/shell/static-shell.test.ts` |

## Shared

| Componente | Status | RFs atendidos | Arquivo | Testes |
|---|---|---|---|---|
| `<SWRProvider />` / `useProjection()` | ✅ | RF-027 | `components/shared/swr-provider.tsx` | — (sem teste dedicado) |
| `useMunicipioSheetStore` | ✅ S07 | (estado da folha de município entre o mapa e a página) | `components/shared/municipio-sheet-store.ts` | `tests/unit/components/MunicipioExplorer.test.tsx` |
| `<HoverTooltip />` | 🕐 planejada | RF-045, RF-048 | *previsto*: `components/shared/HoverTooltip.tsx` | — |
| `<BottomSheet />` | 🕐 planejada | RF-049, RF-050 | *previsto*: `components/shared/BottomSheet.tsx` | — |

`<HoverTooltip />` e `<BottomSheet />` pertencem à
[spec 008 — Interatividade (Brushing & Linking)](../specs/008-interatividade-brushing/),
que está em `status: draft` e foi **diferida para S08+** (decisão de fechamento da S05).
Continuam catalogadas porque RF-045, RF-048, RF-049 e RF-050 seguem vivos em
`traceability.md:87-92`.

## Componentes novos da S07/Fase 2 (hero 1T + trilhas)

Introduzidos nos commits `978929c` e continuados em Bloco 1, sob ADR-0018 (termômetros) e ADR-0019 (trilhas):

| Componente | Tipo | RF | O que faz |
|---|---|---|---|
| `<ProjectionThermometer />` | atom | RF-061, RF-062 | Trilho com faixa IC95, tick do projetado, marcador do apurado e **denominador rotulado**. `role="meter"`. |
| `<ProjectionThermometers />` | block | RF-061, RF-062 | Hero de seis termômetros no 1T (1º/2º/3º/Outros em % votos a votáveis; brancos-nulos em % comparecimento; abstenção em % eleitores das seções instaladas). `variant="participacao-only"` renderiza só os dois últimos. |
| `<TrilhaKicker />` | atom (nav) | RF-063 | Rótulo `PRESIDÊNCIA · Brasil › SP` / `GOVERNADOR · SP`, colorido por `--trilha-accent`. |
| `<RaceHeader />` | layout | RF-063 | Cabeçalho compartilhado pelas 4 rotas de corrida: breadcrumb + kicker + `<h1>` + LiveBadge/TurnoBadge + Tabs. |

Os denominadores e os tokens `--color-part-*` / `--trilha-accent*` estão em
[tokens.md](./tokens.md#participação-e-trilhas-s07fase-2).

---

## Componentes novos da Bloco 1 — Design system Atlas Menna (ADR-0024, ADR-0025)

Intoduzidos em 2026-09-07 para o redesign Atlas Menna (paleta por partido, tipografia nova, primitivos do kit):

### Atoms — Surfaces

| Componente | Tipo | Status | Papel | Arquivo | Cliente? |
|---|---|---|---|---|---|
| `<Panel />` | atom | ✅ | Superfície com padding padrão (space-4), borda, radius-md, shadow-float. Componente base para card, sidebar, drawer. | `components/atoms/surfaces/Panel.tsx` | RSC |
| `<DetailUnavailable />` | atom | ✅ | Estado "detalhe indisponível" de uma seção cuja fonte (Vercel Blob) não respondeu — texto explícito com o motivo, **sempre no DOM**, nunca escondendo o bloco (ADR-0032 item 3, ADR-0017). | `components/atoms/surfaces/DetailUnavailable.tsx` | RSC |
| `<DetailFreshness />` | atom | ✅ | Idade do detalhe vinda do `ts` próprio do objeto Blob, com a defasagem em minutos contra o `ts` do resumo quando ≥ 2 min (ADR-0032 — a UI não deve silenciar a diferença). | `components/atoms/surfaces/DetailUnavailable.tsx` | RSC |

### Atoms — Data

| Componente | Tipo | Status | Papel | Arquivo | Cliente? |
|---|---|---|---|---|---|
| `<Figure />` | atom | ✅ | Número em display (64px Spectral 600), com rótulo muted abaixo. Usa tabular-nums. | `components/atoms/data/Figure.tsx` | RSC |
| `<PartyTag />` | atom | ✅ | Rótulo de partido/federação com fundo `--party-{sigla}-1` e texto `--party-{sigla}-4`. Badge comprimida, radius-pill. | `components/atoms/data/PartyTag.tsx` | RSC |
| `<ProbabilityMeter />` | atom | ✅ | Barra visual de probabilidade 0–100% com label numerado. Usa `role="meter"`. | `components/atoms/data/ProbabilityMeter.tsx` | RSC |

### Atoms — Controles

| Componente | Tipo | Status | Papel | Arquivo | Cliente? |
|---|---|---|---|---|---|
| `<Button />` | atom | ✅ | Botão semântico com variants: `primary` (accent), `secondary` (outline), `minimal` (text-only). `aria-label` condicional. | `components/atoms/controls/Button.tsx` | RSC |
| `<SegmentedControl />` | atom | ✅ | Grupo de abas horizontal (like Tabs mas sem panel role). Comunica seleção via `onChange`. | `components/atoms/controls/SegmentedControl.tsx` | RSC |
| `<SearchInput />` | atom | ✅ | Campo de busca com ícone de lupa, placeholder colapsável em mobile, clearing rápido (Backspace). | `components/atoms/controls/SearchInput.tsx` | Client (useCallback) |

### Atoms — Barras

| Componente | Tipo | Status | Papel | Arquivo | Cliente? |
|---|---|---|---|---|---|
| `<VoteBar />` | atom | ✅ | Barra horizontal segmentada de votos por candidato/partido. Stack horizontal com cores por `--party-*-3`, labels percentuais. | `components/atoms/bars/VoteBar.tsx` | RSC |

### Atoms — Mapas

| Componente | Tipo | Status | Papel | Arquivo | Cliente? |
|---|---|---|---|---|---|
| `<MapLegend />` | atom | ✅ | Legenda de mapa: título, lista de cores com labels (partido, resultado, status). Posicionável (top-right, bottom-left, etc.). | `components/atoms/maps/MapLegend.tsx` | RSC |

### Atoms — Overlays

| Componente | Tipo | Status | Papel | Arquivo | Cliente? |
|---|---|---|---|---|---|
| `<HoverCard />` | atom | ✅ | Card flutuante que segue mouse ou se ancora a um trigger. Conteúdo renderizado sob demanda (lazy). Sem dependência de `framer-motion`. | `components/atoms/overlays/HoverCard.tsx` | Client (useEffect posicionamento) |
| `<Sheet />` | atom | ✅ | Bottom/side sheet (drawer) com backdrop, animação em CSS puro. Fecha em ESC ou clique no backdrop. | `components/atoms/overlays/Sheet.tsx` | Client (@react-dialog ou sem deps) |

### Layout

| Componente | Tipo | Status | Papel | Arquivo | Cliente? |
|---|---|---|---|---|---|
| `<TopBar />` | layout | ✅ | Barra de topo (height 56px) com wordmark + mínima navegação. Sticky. Parte da shell global em `app/layout.tsx`. | `components/layout/TopBar.tsx` | RSC |
| `<TabBar />` | layout | ✅ | Barra de navegação de cargo (Presidente, Governador, Senador, Deputado) com `data-trilha` para estilo condicional. Sticky abaixo de TopBar. | `components/layout/TabBar.tsx` | RSC |

---

**Notas de implementação — Bloco 1:**

- Todos os 13 componentes são **RSC por padrão** (excepto `<SearchInput>` e `<HoverCard>` que usam hooks mínimos). Zero JS novo no above-the-fold.
- Nenhum depende de `framer-motion` ou `d3-*` — declarações removidas conforme ADR-0025 § 4.
- Cores de partido/federação via `lib/utils/party-color.ts` (sigla → `--party-{sigla}-{nível}`).
- Testes unitários: `tests/unit/components/{nome}.test.tsx` (11 dos 13 têm cobertura dedicada; `<HoverCard>` e `<Sheet>` cobertos por integração).
- Todos constroem com `pnpm typecheck` 0 erros e `pnpm lint` sem warnings novos.
- Dark mode prototipado mas **adiado para Bloco 2** (10 tokens de partido falhariam 3:1 em tema escuro, conforme medição em globals.css).

## Componentes órfãos (removidos de rotas 08/09, ADR-0033)

Os seguintes componentes **existem no disco mas não têm consumidor em produção** desde 2026-09-08:

| Componente | Motivo | Decisão |
|---|---|---|
| `<RunoffScenarios />` | RF-030.9 removido da home (protótipo não o contém) | Arquivo mantido para possível futura reativação |
| `<DecisiveUFsGrid />` | RF-024 removido da home (protótipo não o contém) | Arquivo mantido para possível futura reativação |
| `<TwoRoundIndicator />` | RF-030.7 migrou de `TwoRoundIndicator` para `ChancesPanel` | Arquivo mantido para possível futura reativação |
| `<TimeSeriesChart />` | RF-040 removido de specs 004/005 (protótipo não o contém) | Arquivo mantido para possível futura reativação |
| `<ProbabilityOverTime />` | RF-041 removido de specs 004/005 (protótipo não o contém) | Arquivo mantido para possível futura reativação |
| `<TurnoutAreaChart />` | RF-042 removido de specs 004/005 (protótipo não o contém) | Arquivo mantido para possível futura reativação |
| `<BubbleMap />` | RF-035 removido de specs 004/005 (protótipo não o contém) | Arquivo mantido para possível futura reativação |
| `<SwingArrowMap />` | RF-038 removido de specs 004/005 (protótipo não o contém) | Arquivo mantido para possível futura reativação |
| `<UFMapDuo />` | RF-035/036 removido de specs 004/005 (protótipo não os contém) | Arquivo mantido; exports `UfMapDuoLazy`/`UfSwingArrowMapLazy` órfãos |
| `<UfMapsLazy />` | Wrapper `next/dynamic` sem consumidor (RF-034 usa direto `<UfLeaderMapLazy />`) | Arquivo mantido para possível futura reativação |
| `<NewsClippingPlaceholder />` | Slot visual spec 004 nunca teve RF formal; removido com ADR-0033 | Arquivo mantido para possível futura reativação |

## Lacunas de teste conhecidas

Componentes shipped **sem teste dedicado** (para o `rf-coverage-checker`):
`<ChoroplethMapUF />`, `<BubbleMap />`, `<SwingArrowMap />`, `<UFMapDuo />`,
`<UfMapsLazy />`, `<MapPlaceholder />`, `<SWRProvider />` e as três ilustrações
inline de `/sobre-o-modelo`. `traceability.md:76-80` declara "unit (mock MapLibre)"
para os mapas de UF — não existe tal arquivo de teste hoje.

## Cross-refs

- Estrutura de pastas: [../architecture/folder-structure.md](../architecture/folder-structure.md)
- Tokens de cor e trilha: [./tokens.md](./tokens.md)
- Matriz completa RF → spec → componente → teste: [../_meta/traceability.md](../_meta/traceability.md)
