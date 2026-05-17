---
id: 003-home-nacional
type: design
title: Home Nacional — Design Técnico
status: draft
---

# Design — Home Nacional

## Arquitetura

- **Server Component** (`app/page.tsx`) lê Edge Config (`projection:current`) em <15ms, SSR renderiza HTML inicial com payload embutido.
- **Client Components** hidratam e iniciam polling SWR de `/api/projection` a cada 5s.
- Diff fino via Zustand selectors evita re-render em cascata.

## Composição

```
<page.tsx (SC)>
  <Header /> (LiveBadge, Tabs)
  <HeadlineScore />            // RF-022, RF-023, RF-030.5
  <MapViewToggle />            // RF-030.2
  <NationalChoroplethMap />    // RF-030.1, RF-030.3, RF-030.4, RF-045
  <NationalNeedle />           // RF-021
  <ApuracaoMeta />             // RF-026
  <DecisiveUFsGrid />          // RF-024
  <StateGroupedTable />        // RF-030.6, RF-046
  <UFForecastTable />          // RF-025
  <InsightCard />              // RF-044 (consumido aqui)
  <ForecastTransparency />     // RF-043 (consumido aqui)
  <Footer />
```

## Contratos

### Consumo: `GET /api/projection`

Recebe `EdgePayload` ([data-model](../../architecture/data-model.md)). Campos usados:

- `national.candidatos[*]` — para `<HeadlineScore />`, `<NationalNeedle />`, `<UFForecastTable />`.
- `por_uf[*]` — para `<NationalChoroplethMap />`, `<StateGroupedTable />`, `<DecisiveUFsGrid />`.
- `insights` — para `<InsightCard />`.
- `composition` — para `<ForecastTransparency />`.

## Fluxos

### Carregamento inicial

1. SSR lê Edge Config → renderiza HTML com payload embutido.
2. Cliente hidrata com SWR usando payload SSR como `fallbackData`.
3. SWR inicia polling 5s.

### Atualização live

1. SWR recebe novo payload.
2. Zustand selectors avaliam mudança por campo.
3. Componentes afetados re-renderizam com animações Framer Motion (transições suaves de cor no mapa, contadores animados).

### Hover (brushing)

Hover em UF do mapa → `useHoverStore.setHovered({type: 'uf', sigla})` → consumers (tabela agrupada, grid decisivas) reagem destacando.

Ver [spec 008](../008-interatividade-brushing/spec.md).

## Componentes a criar

Ver catálogo completo em [components.md](../../design-system/components.md). Específicos desta spec:

- `<HeadlineScore />` (block) — novo.
- `<NationalChoroplethMap />` (block) — novo.
- `<MapViewToggle />` (atom) — novo.
- `<StateGroupedTable />` (block) — novo.
- `<NationalNeedle />` (block) — reutiliza `<Needle />`.
- `<DecisiveUFsGrid />` (block) — novo.
- `<UFForecastTable />` (block) — novo.
- `<ApuracaoMeta />` (block) — novo.
- `<InsightCard />` (block) — novo.
- `<ForecastTransparency />` (block) — novo.

## ADRs aplicáveis

- [ADR-0001 Edge Config no read path](../../architecture/adrs/0001-edge-config-no-read-path.md)
- [ADR-0002 Polling com CDN cache](../../architecture/adrs/0002-polling-cdn-cache.md)
- [ADR-0003 PMTiles](../../architecture/adrs/0003-pmtiles-nao-geojson.md)
- [ADR-0004 MapLibre](../../architecture/adrs/0004-maplibre-nao-mapbox.md)
- [ADR-0005 Templates de insights](../../architecture/adrs/0005-templates-nao-llm.md)

## Riscos técnicos

- **Mapa hero pesar no LCP** — renderizar com placeholder de baixa resolução até PMTiles carregar; medir Speed Insights.
- **Animação de cores no mapa custar 60fps** — testado: 5.570 `setFeatureState` em <50ms. Sob estresse, throttle.
- **Tabela de 27 UFs com sparkline custar** — virtualizar via window se necessário (atual: 27 linhas não justifica).

## Cross-refs

- Spec: [./spec.md](./spec.md)
- Mapas: [../../mapas/](../../mapas/)
- Animações: [../../design-system/animations.md](../../design-system/animations.md)
- Hover store: [../../design-system/state-global.md](../../design-system/state-global.md)
