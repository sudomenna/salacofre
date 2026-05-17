---
title: Pipeline de Dados Geográficos
description: Shapefile IBGE → GeoJSON simplificado → PMTiles via tippecanoe
status: stable
source: PRD.md § 15.1
---

# Pipeline de Dados Geográficos

## Etapa 1 — Aquisição

Shapefile do IBGE (malha municipal 2022) em `BR_Municipios_2022.shp`.

Fonte: [IBGE Malhas](https://www.ibge.gov.br/geociencias/organizacao-do-territorio/malhas-territoriais) (ver [reference/data-sources.md](../reference/data-sources.md)).

## Etapa 2 — Simplificação

```bash
mapshaper BR_Municipios_2022.shp \
  -simplify 5% keep-shapes \
  -filter-fields CD_MUN,NM_MUN,SIGLA_UF \
  -o format=geojson municipios.geojson
```

## Etapa 3 — Conversão PMTiles

```bash
tippecanoe -o municipios.pmtiles \
  --layer=municipios \
  --minimum-zoom=3 \
  --maximum-zoom=10 \
  --no-feature-limit \
  --no-tile-size-limit \
  --include=CD_MUN \
  --include=NM_MUN \
  --include=SIGLA_UF \
  municipios.geojson
```

Resultado: arquivo único de ~50MB hospedado no Vercel Blob com URL pública.

## Etapa 4 — UFs (mesmo processo)

- `ufs.pmtiles` — ~500KB

Obs: `zonas.pmtiles` (shapefile do TSE, ~30MB) deferido para v2 — drill-down até zona eleitoral fora do escopo v1.

## Onde rodam

`data-pipeline/ibge-import.ts` — script one-shot, NÃO está no read path. Re-rodado por ciclo eleitoral.

## Cross-refs

- ADR-0003 PMTiles vs GeoJSON: [../architecture/adrs/0003-pmtiles-nao-geojson.md](../architecture/adrs/0003-pmtiles-nao-geojson.md)
- Setup MapLibre: [./maplibre-pmtiles.md](./maplibre-pmtiles.md)
- Fontes IBGE: [../reference/data-sources.md](../reference/data-sources.md)
