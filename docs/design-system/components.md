---
title: Catálogo de Componentes
description: Catálogo de componentes com referência cruzada a RFs e arquivos
status: stable
source: PRD.md § 14.3
---

# Catálogo de Componentes

| Componente | Tipo | RFs atendidos | Arquivo |
|---|---|---|---|
| `<Needle />` | atom | RF-021, RF-039 | `components/atoms/needle/Needle.tsx` |
| `<ConfidenceBar />` | atom | RF-023, RF-039 | `components/atoms/bars/ConfidenceBar.tsx` |
| `<DotPlotRange />` | atom | RF-025 | `components/atoms/charts/DotPlotRange.tsx` |
| `<TimeSeriesChart />` | atom | RF-040 | `components/atoms/charts/TimeSeriesChart.tsx` |
| `<ProbabilityOverTime />` | atom | RF-041 | `components/atoms/charts/ProbabilityOverTime.tsx` |
| `<TurnoutAreaChart />` | atom | RF-042 | `components/atoms/charts/TurnoutAreaChart.tsx` |
| `<ChoroplethMap />` | atom | RF-034, RF-036, RF-038 | `components/atoms/maps/ChoroplethMap.tsx` |
| `<BubbleMap />` | atom | RF-035 | `components/atoms/maps/BubbleMap.tsx` |
| `<SwingArrowMap />` | atom | RF-038 | `components/atoms/maps/SwingArrowMap.tsx` |
| `<CandidateRow />` | atom | RF-033 | `components/atoms/tables/CandidateRow.tsx` |
| `<WinnerBanner />` | atom | RF-032 | `components/atoms/banners/WinnerBanner.tsx` |
| `<ModelComposition />` | atom | RF-043 | `components/atoms/charts/ModelComposition.tsx` |
| `<NationalNeedle />` | block | RF-021, RF-022, RF-023 | `components/blocks/NationalNeedle.tsx` |
| `<HeadlineScore />` | block | RF-022, RF-023, RF-030.5 | `components/blocks/HeadlineScore.tsx` |
| `<NationalChoroplethMap />` | block | RF-030.1, RF-030.3, RF-030.4, RF-045 | `components/blocks/NationalChoroplethMap.tsx` |
| `<MapViewToggle />` | atom | RF-030.2 | `components/atoms/controls/MapViewToggle.tsx` |
| `<StateGroupedTable />` | block | RF-030.6, RF-046 | `components/blocks/StateGroupedTable.tsx` |
| `<DecisiveUFsGrid />` | block | RF-024 | `components/blocks/DecisiveUFsGrid.tsx` |
| `<UFForecastTable />` | block | RF-025 | `components/blocks/UFForecastTable.tsx` |
| `<UFMapDuo />` | block | RF-035, RF-036 | `components/blocks/UFMapDuo.tsx` |
| `<MunicipioTable />` | block | RF-037 | `components/blocks/MunicipioTable.tsx` |
| `<ForecastTransparency />` ✅ shipped | block | RF-043 | [`components/blocks/ForecastTransparency.tsx`](../../components/blocks/ForecastTransparency.tsx) — unit tests: [`tests/unit/components/ForecastTransparency.test.tsx`](../../tests/unit/components/ForecastTransparency.test.tsx) |
| `<InsightCard />` ✅ shipped | block | RF-044 | `components/blocks/InsightCard.tsx` |
| `<HoverTooltip />` | shared | RF-045, RF-048 | `components/shared/HoverTooltip.tsx` |
| `<BottomSheet />` | shared | RF-049, RF-050 | `components/shared/BottomSheet.tsx` |
| `<LiveBadge />` ✅ shipped | layout | RF-026, RF-028 | `components/layout/LiveBadge.tsx` |
| `<Tabs />` ✅ shipped | layout | RF-029 | `components/layout/Tabs.tsx` |
| `<WinnerBanner />` ✅ shipped | atom | RF-032 | `components/atoms/banners/WinnerBanner.tsx` |
| `<CandidateRow />` ✅ shipped | atom | RF-033 | `components/atoms/tables/CandidateRow.tsx` |
| `<NewsClippingPlaceholder />` ✅ shipped | atom | (spec 004 slot visual) | `components/atoms/cards/NewsClippingPlaceholder.tsx` |
| `<ChoroplethMapUF />` ✅ shipped | atom | RF-034, RF-036, RF-038 | `components/atoms/maps/ChoroplethMapUF.tsx` |
| `<BubbleMap />` ✅ shipped | atom | RF-035 | `components/atoms/maps/BubbleMap.tsx` |
| `<SwingArrowMap />` ✅ shipped | atom | RF-038 | `components/atoms/maps/SwingArrowMap.tsx` |
| `<MunicipioTable />` ✅ shipped | block | RF-037 | `components/blocks/MunicipioTable.tsx` |
| `<UFMapDuo />` ✅ shipped | block | RF-035, RF-036 | `components/blocks/UFMapDuo.tsx` |
| `<UfMapsLazy />` ✅ shipped | block | (lazy load wrapper) | `components/blocks/UfMapsLazy.tsx` |
| `<UFBreadcrumb />` ✅ shipped | atom | RF-031 | `components/atoms/navigation/UFBreadcrumb.tsx` |
| `<Footer />` ✅ shipped | layout | RF-055 | `components/layout/Footer.tsx` |
| `<SwingIllustration />` ✅ shipped | atom | (spec 011) | `components/atoms/illustrations/SwingIllustration.tsx` |
| `<ConfidenceBandIllustration />` ✅ shipped | atom | (spec 011) | `components/atoms/illustrations/ConfidenceBandIllustration.tsx` |
| `<NeedleIllustration />` ✅ shipped | atom | (spec 011) | `components/atoms/illustrations/NeedleIllustration.tsx` |

## Cross-refs

- Estrutura de pastas: [../architecture/folder-structure.md](../architecture/folder-structure.md)
- Matriz completa RF → spec → componente → teste: [../_meta/traceability.md](../_meta/traceability.md)
