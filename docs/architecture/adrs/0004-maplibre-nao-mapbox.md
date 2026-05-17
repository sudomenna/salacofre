---
id: ADR-0004
title: MapLibre GL + PMTiles, não Mapbox
status: accepted
date: 2026-05-17
---

# ADR-0004 — MapLibre GL + PMTiles, não Mapbox

## Status

Aceito.

## Contexto

Mapbox cobra por MAU (monthly active user) e por tile load. Em uma noite eleitoral com 500k+ usuários únicos, o custo escala de forma não-linear e imprevisível.

MapLibre GL é fork open-source do Mapbox GL pré-licença restritiva, mantido ativamente, sem custo por uso.

PMTiles dispensa servidor de tiles (Mapbox Tilesets) — single-file no Vercel Blob basta.

## Decisão

Renderização de mapas usa **MapLibre GL JS 5+** com **PMTiles 4+** servidos do **Vercel Blob**.

## Consequências

**Positivas**:
- Zero custo por MAU/tile.
- Sem lock-in de fornecedor.
- API praticamente idêntica ao Mapbox GL — migração de código futura é trivial.

**Negativas**:
- Sem suporte oficial Mapbox (comunidade resolve via GitHub).
- Alguns plugins comerciais do Mapbox não rodam.

## Cross-refs

- ADR-0003 PMTiles: [./0003-pmtiles-nao-geojson.md](./0003-pmtiles-nao-geojson.md)
- Setup MapLibre: [../../mapas/maplibre-pmtiles.md](../../mapas/maplibre-pmtiles.md)
