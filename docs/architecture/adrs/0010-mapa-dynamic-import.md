---
id: ADR-0010
title: Mapa via next/dynamic sem SSR, fora do bundle above-the-fold
status: accepted
date: 2026-05-17
---

# ADR-0010 — Mapa via `next/dynamic` sem SSR, fora do bundle above-the-fold

## Status

Aceito.

## Contexto

A primeira versão da constituição (§ 3) e do `nfr/performance.md` (RNF-007) exigiam **bundle JS inicial < 150KB gzipped**. Auditoria interna em 2026-05-17 identificou que a meta era **matematicamente inalcançável** com a stack canônica:

| Lib | Tamanho gzipped (aprox.) |
|---|---|
| MapLibre GL | ~200KB |
| Framer Motion (completo) | ~35KB |
| D3 (scale + shape + array) | ~25KB |
| PMTiles client | ~10KB |
| React 19 + Next.js runtime | ~80–100KB |
| Próprio app (sem libs) | ~30KB estimado |
| **Total acumulado** | **~380–400KB** |

Só MapLibre já estoura sozinho a meta original. Manter MapLibre no bundle inicial:

- Atrasa LCP (RNF-002 <2.5s) — script bloqueia paint.
- Quebra CI se houver gate de bundle size.
- Penaliza usuários que entram em rotas sem mapa (`/sobre-o-modelo`, `/_status`, `/manutencao`).

Por outro lado, o produto **precisa do mapa** — é o hero da home (RF-030.1) e elemento central da página de UF (RF-034). RNF-008 manda mapa renderizar em <1.5s.

## Decisão

O componente de mapa (qualquer um sob `components/atoms/maps/` ou `components/blocks/*Map.tsx`) é carregado via **`next/dynamic({ ssr: false })`** após o first paint da página. Em código:

```ts
// app/page.tsx
const NationalChoroplethMap = dynamic(
  () => import('@/components/blocks/NationalChoroplethMap'),
  { ssr: false, loading: () => <MapSkeleton /> }
);
```

O RNF-007 é refinado em três sub-metas:

| Sub-meta | Escopo | Limite |
|---|---|---|
| **RNF-007a** | Bundle above-the-fold (sem chunks lazy) | <150KB gzipped |
| **RNF-007b** | Chunk do mapa (MapLibre + PMTiles client + componente) | <250KB gzipped |
| **RNF-007c** | Total da home (above-the-fold + chunks lazy) | <500KB gzipped |

O **above-the-fold da home** passa a conter:

- Header (`<Header>`, `<LiveBadge>`, `<Tabs>`).
- Headline placar (`<HeadlineScore>`).
- Agulha em SVG estático (skeleton sem spring) — Framer Motion completo só no chunk lazy.
- Skeleton do mapa.

Tudo abaixo (ou que dependa de hover/interação) entra em chunks dinâmicos.

## Consequências

**Positivas**:
- RNF-007a (150KB above-the-fold) volta a ser atingível e enforceável em CI.
- LCP da home melhora — paint inicial não bloqueia em MapLibre.
- Rotas sem mapa (`/sobre-o-modelo`, `/_status`, `/manutencao`, `/governador` no estado de loading) ficam significativamente mais leves.
- Bundle analyzer fica útil — cada chunk tem orçamento próprio.

**Negativas**:
- Mapa aparece ~300–800ms depois do first paint (sentido como flash visual sob conexão lenta).
- Skeleton do mapa precisa ser bem desenhado pra não parecer quebrado.
- Re-medição obrigatória: RNF-008 (mapa <1.5s) passa a ser medido **a partir do first paint**, não from page load — confirmar com Vercel Speed Insights.
- Necessário garantir que `setFeatureState` em massa (5.570 municípios) ainda cabe em <50ms quando o mapa carrega — pode haver pico de CPU concorrente com hidratação React.

**Neutras**:
- Padrão `dynamic + ssr:false` é convenção Next.js — fácil de seguir, mas exige disciplina pra não voltar a importar o mapa estaticamente em algum lugar (vira regressão silenciosa). Mitigação: lint custom ou check de import em CI.

## Cross-refs

- Constituição § 3 (performance): [../../constitution.md](../../constitution.md#3-performance-percebida)
- NFR refinada: [../../nfr/performance.md](../../nfr/performance.md)
- Stack tecnológica: [../tech-stack.md](../tech-stack.md)
- ADR-0003 PMTiles: [./0003-pmtiles-nao-geojson.md](./0003-pmtiles-nao-geojson.md)
- ADR-0004 MapLibre: [./0004-maplibre-nao-mapbox.md](./0004-maplibre-nao-mapbox.md)
- Especificação dos mapas: [../../mapas/](../../mapas/)
- Specs afetadas (devem listar este ADR em `adrs:`): [003](../../specs/003-home-nacional/), [004](../../specs/004-pagina-uf-presidencial/), [005](../../specs/005-pagina-uf-governador/), [006](../../specs/006-grid-governadores/)
- Risco em watch: [../../reference/risks.md](../../reference/risks.md)
