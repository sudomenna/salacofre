---
id: ADR-0003
title: PMTiles, não GeoJSON
status: accepted
date: 2026-05-17
---

# ADR-0003 — PMTiles, não GeoJSON

## Status

Aceito.

## Contexto

A malha municipal do IBGE simplificada para 5% pesa ~50MB em GeoJSON. Servir esse arquivo a 20k clientes simultâneos:

- 1TB de banda só em malha — custo proibitivo na Vercel.
- LCP comprometido — parsing JSON de 50MB no cliente é inviável.
- Cache hit não resolve — o arquivo é grande demais para CDN edge cache.

PMTiles é um formato single-file de tiles vetoriais com range-requests: cliente só baixa os tiles do viewport visível.

## Decisão

Malha geográfica é convertida via **tippecanoe** para **PMTiles** e servida do **Vercel Blob**. MapLibre GL consome via `pmtiles://` protocol.

Em v1, apenas dois artefatos são produzidos: `ufs.pmtiles` e `municipios.pmtiles`. O artefato `zonas.pmtiles` (~30MB, ~3.000 polígonos) é latente — a decisão de formato vale, mas o arquivo não será gerado nem publicado em v1 por ausência de consumidor no read path público (drill-down zonal deferido para v2, conforme ADR-0007).

## Consequências

**Positivas**:
- ~100× menos banda no agregado.
- Tiles carregam só conforme zoom/pan — lazy by design.
- Vetorial — estilos aplicados no cliente sem re-fetch.

**Negativas**:
- Pipeline de build a mais (shapefile → GeoJSON → PMTiles) — `data-pipeline/ibge-import.ts`.
- Atualização de malha exige re-geração e re-upload (raro: 1× por ciclo eleitoral).

## Cross-refs

- Pipeline geográfico: [../../mapas/pipeline-geo.md](../../mapas/pipeline-geo.md)
- Setup MapLibre: [../../mapas/maplibre-pmtiles.md](../../mapas/maplibre-pmtiles.md)
