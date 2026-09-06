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

`app/page.tsx` despacha entre dois heróis a partir do payload:

```ts
const mode: "binary" | "multi-1t" =
  turno === 2 || national.candidatos.length === 2 ? "binary" : "multi-1t";
```

```
<page.tsx (SC)>  <main data-trilha="pres">          // RF-063
  <RaceHeader /> (TrilhaKicker, h1, LiveBadge,
                  TurnoBadge, Tabs)                 // RF-029, RF-063

  ── mode === "binary" (2º turno) — inalterado desde S06 ──
  <HeadlineScore />            // RF-022, RF-023, RF-030.5
  <NationalNeedle variant="national-2t" />          // RF-021

  ── mode === "multi-1t" — ADR-0018 ──
  <ProjectionThermometers />   // RF-061, RF-062 (6 × ProjectionThermometer)
  <MinorCandidatesList />      // RF-030.8 — "Composição de Outros" (rank >= 4)
  <TwoRoundIndicator />        // RF-030.7
  <RunoffScenarios />          // RF-030.9 (gate p_segundo_turno_overall >= 0.4)

  ── comuns aos dois modos ──
  <MapViewToggle />            // RF-030.2
  <NationalChoroplethMap />    // RF-030.1, RF-030.3, RF-030.4, RF-045
  <ApuracaoMeta />             // RF-026
  <DecisiveUFsGrid />          // RF-024
  <StateGroupedTable />        // RF-030.6, RF-046
  <UFForecastTable />          // RF-025
  <InsightCard />              // RF-044 (consumido aqui)
  <ForecastTransparency />     // RF-043 (consumido aqui)
  <Footer />
```

O `<h1>` é emitido pelo `<RaceHeader />` **apenas** em `multi-1t`; em `binary` ele continua vindo do `<HeadlineScore />`, para não duplicar heading na página.

Em `multi-1t` a agulha `variant="national-1t"` sai do fluxo: ela media `p_segundo_turno`, a mesma métrica do `<TwoRoundIndicator />` — ADR-0018 removeu a duplicata.

## Contratos

### Consumo: `GET /api/projection`

Recebe `EdgePayload` ([data-model](../../architecture/data-model.md)). Campos usados:

- `national.candidatos[*]` — para `<HeadlineScore />`, `<NationalNeedle />`, `<UFForecastTable />`, `<ProjectionThermometers />`.
- `national.participacao?` — para os termômetros de brancos/nulos, abstenção e "Outros" (RF-062). **Opcional**: ausência degrada para "aguardando projeção", não quebra. Shape em [spec 002 — design](../002-modelo-estatistico/design.md#contrato-do-bloco-participacao-no-payload).
- `national.p_segundo_turno_overall`, `national.cenarios_2t` — para `<TwoRoundIndicator />` (RF-030.7) e `<RunoffScenarios />` (RF-030.9).
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

Componentes S07 (ADR-0018 / ADR-0019):

- `<ProjectionThermometer />` (atom) — `components/atoms/bars/ProjectionThermometer.tsx`. Trilho `role="meter"`, faixa lower→upper, marcador do apurado (decorativo — o número está no `aria-label` e no rodapé), rodapé "IC95 a–b · apurado x · % de \<base\>".
- `<ProjectionThermometers />` (block) — `components/blocks/ProjectionThermometers.tsx`. `variant: "full" | "participacao-only"`. Resolve os dois shapes de candidato do payload (`pct_projetado_lower/upper` no nacional, `ci95` na UF).
- `<TrilhaKicker />` (atom) — `components/atoms/nav/TrilhaKicker.tsx`.
- `<RaceHeader />` (layout) — `components/layout/RaceHeader.tsx`.
- `<UFBreadcrumb />` (atom, refatorado) — ganha `trilha?` e `items?`.

Todos Server Components puros (sem `"use client"`, sem `framer-motion`) — o hero é above-the-fold e RNF-007a limita o bundle.

## ADRs aplicáveis

- [ADR-0001 Edge Config no read path](../../architecture/adrs/0001-edge-config-no-read-path.md)
- [ADR-0002 Polling com CDN cache](../../architecture/adrs/0002-polling-cdn-cache.md)
- [ADR-0003 PMTiles](../../architecture/adrs/0003-pmtiles-nao-geojson.md)
- [ADR-0004 MapLibre](../../architecture/adrs/0004-maplibre-nao-mapbox.md)
- [ADR-0005 Templates de insights](../../architecture/adrs/0005-templates-nao-llm.md)
- [ADR-0017 Transparência total em 3 camadas](../../architecture/adrs/0017-transparencia-total-3-camadas.md)
- [ADR-0018 Seis termômetros no hero do 1T](../../architecture/adrs/0018-termometros-hero-1t.md) — supera parcialmente ADR-0017 (só a Camada 1 em `multi-1t`)
- [ADR-0019 Identidade visual por trilha](../../architecture/adrs/0019-identidade-visual-por-trilha.md)

## Riscos técnicos

- **Mapa hero pesar no LCP** — renderizar com placeholder de baixa resolução até PMTiles carregar; medir Speed Insights.
- **Animação de cores no mapa custar 60fps** — testado: 5.570 `setFeatureState` em <50ms. Sob estresse, throttle.
- **Tabela de 27 UFs com sparkline custar** — virtualizar via window se necessário (atual: 27 linhas não justifica).

## Cross-refs

- Spec: [./spec.md](./spec.md)
- Mapas: [../../mapas/](../../mapas/)
- Animações: [../../design-system/animations.md](../../design-system/animations.md)
- Hover store: [../../design-system/state-global.md](../../design-system/state-global.md)
