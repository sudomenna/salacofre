---
id: 004-pagina-uf-presidencial
type: design
title: Página de UF Presidencial — Design Técnico
status: draft
---

# Design — Página de UF Presidencial

## Arquitetura

- **Server Component** (`app/uf/[sigla]/page.tsx`) — `generateStaticParams` lista as 27 UFs.
- Lê Edge Config `projection:uf:[sigla]` (payload 5–10KB).
- Polling SWR para atualização live (mesmo padrão da home).
- Mapas usam o mesmo `<ChoroplethMap />` da home, mas com `level='uf'` e bbox da UF.

## Composição

```
<page.tsx (SC)>
  <Breadcrumb />               // RF-031
  <WinnerBanner />             // RF-032 (condicional)
  <CandidateTable />           // RF-033 (composto de <CandidateRow />)
  <ChoroplethMap level="uf" /> // RF-034
  <InsightCard />              // RF-044
  <UFMapDuo>                   // RF-035 + RF-036
    <BubbleMap />
    <ChoroplethMap />
  </UFMapDuo>
  <MunicipioTable />           // RF-037 (paginada: 20 + 40)
  <SwingArrowMap />            // RF-038
  <StateNeedle />              // RF-039 (Needle)
  <TimeSeriesChart />          // RF-040
  <ProbabilityOverTime />      // RF-041
  <TurnoutAreaChart />         // RF-042
  <ForecastTransparency />     // RF-043
```

## Contratos

### Consumo: `GET /api/projection?uf=<sigla>`

Recebe payload `projection:uf:[sigla]` (~5–10KB):

- `por_municipio[*]` — para mapas + tabela.
- `por_candidato_uf[*]` — para `<CandidateTable />` e agulha.
- `series_temporais[]` — para gráficos.

## Fluxos

### Brushing & linking

Mesma `useHoverStore` da home, mas com escopo de município. Hover em município no mapa destaca:

- Linha correspondente em `<MunicipioTable />`.
- Município no segundo mapa do duo.

Ver [spec 008](../008-interatividade-brushing/spec.md).

### Drill-down de município (v2)

Drill-down até zona eleitoral deferido para v2 — decisão produto 2026-05-17.

## Performance

- Tabela com até 645 linhas (SP) — usar virtualização (Tanstack Virtual ou custom).
- Mapa carrega PMTiles via range-requests (tiles do viewport apenas).
- Charts D3 + SVG custom, sem libs pesadas (RNF-007).

## ADRs aplicáveis

- [ADR-0001 Edge Config](../../architecture/adrs/0001-edge-config-no-read-path.md)
- [ADR-0003 PMTiles](../../architecture/adrs/0003-pmtiles-nao-geojson.md)
- [ADR-0004 MapLibre](../../architecture/adrs/0004-maplibre-nao-mapbox.md)
- [ADR-0007 Granularidade zona vs município](../../architecture/adrs/0007-zona-vs-municipio.md)

## Riscos técnicos

- **Edge Config size limit** — payload por UF deve caber em <512KB. SP é o maior (~10KB), folga grande.
- **MunicipioTable performance em mobile** — virtualizar agressivamente.

## Cross-refs

- Spec: [./spec.md](./spec.md)
- Mapas: [../../mapas/](../../mapas/)
- Constituição: [../../constitution.md](../../constitution.md)
