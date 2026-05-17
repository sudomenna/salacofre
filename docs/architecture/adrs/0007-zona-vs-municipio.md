---
id: ADR-0007
title: Granularidade do modelo em zona, visualização em município
status: accepted
date: 2026-05-17
---

# ADR-0007 — Granularidade do modelo em zona, visualização em município

## Status

Aceito.

> **Revisão 2026-05-17** — Escopo de v1 estreitado: drill-down zonal deferido para v2. Zona permanece como granularidade interna de ingestão e modelo; apenas UF e município são expostos publicamente.

## Contexto

O TSE entrega resultados em granularidade de **zona eleitoral** (~3.000 no Brasil). Mapas legíveis exigem granularidade de **município** (~5.570).

Renderizar zonas no mapa fica visualmente ruidoso e fonte de confusão (zona ≠ recorte territorial intuitivo). Modelar em município perde precisão estatística (zonas dentro de um município podem variar muito).

## Decisão

- **Ingestão TSE**: continua em zona (EA20 nativo — granularidade nativa do arquivo).
- **Modelo estatístico**: roda em granularidade de **zona** (RF-011), zona-a-zona, para preservar sinal e melhorar MAE.
- **Snapshot publicado no Edge Config**: agregado em **município** — sem campo `por_zona[*]`.
- **Visualização (choropleth, tabela)**: usa granularidade de **município**, agregando zonas via mapeamento `zonas.cod_municipio_tse`. Entidades expostas publicamente: apenas UF e município.

## Consequências

**Positivas**:
- Modelo aproveita o máximo de granularidade disponível do TSE.
- Mapa fica legível, recortes correspondem ao que o usuário conhece (sua cidade).
- Pipeline geo simplificado: `zonas.pmtiles` (~30MB, ~3.000 polígonos) removido de F1 — sem consumidor no read path público.
- Componentes `<MunicipioTable>` e `<ChoroplethMap>` ficam mais coesos: prop `level` só aceita `'uf'` e `'municipio'` em v1.
- Payload Edge Config menor e sem ambiguidade: a ausência de `por_zona` elimina risco de exposição de granularidade interna.

**Negativas**:
- Mapeamento zona ↔ município precisa estar atualizado (RF-008) — mantido em `municipios` + `zonas`.
- Em v1, o drill-down até zona eleitoral está fora de escopo. Apenas UF e município são expostos publicamente. Zona permanece como granularidade interna de ingestão e modelo apenas.
- Caso de uso "minha zona dentro da capital" (persona P3 / atlas-junkie) fica para v2. Spec 007-drill-down-municipio removida de v1.

## Cross-refs

- Schema `municipios` e `zonas`: [../data-model.md](../data-model.md)
- Spec modelo: [../../specs/002-modelo-estatistico/](../../specs/002-modelo-estatistico/)
- Specs afetadas em v1: [004-pagina-uf-presidencial](../../specs/004-pagina-uf-presidencial/), [005-pagina-uf-governador](../../specs/005-pagina-uf-governador/), [008-interatividade-brushing](../../specs/008-interatividade-brushing/)
- Spec 007-drill-down-municipio: removida de v1 — backlog para v2.
