---
title: NFR — Performance
description: Metas de performance percebida (LCP, INP, latência API, cache hit, defasagem TSE, bundle size)
status: stable
source: PRD.md § 6.1
---

# Performance

| ID | Descrição | Meta |
|---|---|---|
| RNF-001 | Acessos simultâneos sustentados | 20.000+ |
| RNF-002 | LCP (Largest Contentful Paint) p95 global | <2.5s |
| RNF-003 | INP (Interaction to Next Paint) p95 | <200ms |
| RNF-004 | Latência do endpoint `/api/projection` p95 | <100ms |
| RNF-005 | Cache hit ratio na CDN no pico | >99% |
| RNF-006 | Defasagem TSE → tela do usuário | <30s |
| RNF-007a | Bundle JS above-the-fold (sem chunks lazy) | <150KB gzipped |
| RNF-007b | Bundle JS do chunk do mapa (MapLibre + PMTiles client + componente) | <250KB gzipped |
| RNF-007c | Bundle JS total da home (above-the-fold + chunks lazy) | <500KB gzipped |
| RNF-008 | Tempo de renderização do mapa inicial (após first paint) | <1.5s |

## Como atingir

- Edge Config como read store ([ADR-0001](../architecture/adrs/0001-edge-config-no-read-path.md))
- Polling com CDN cache ([ADR-0002](../architecture/adrs/0002-polling-cdn-cache.md))
- PMTiles para mapas ([ADR-0003](../architecture/adrs/0003-pmtiles-nao-geojson.md))
- **Mapa via `next/dynamic({ ssr: false })`** — carrega após first paint ([ADR-0010](../architecture/adrs/0010-mapa-dynamic-import.md))
- Bundle splitting via App Router server components
- Above-the-fold da home: header, headline (placar), agulha SVG estática (skeleton) — sem MapLibre, sem Framer Motion pesado
- Mapa, animações de spring e charts D3 ficam em chunks separados

## Nota sobre o orçamento de bundle

O RNF-007 foi refinado em 2026-05-17 após audit: a meta original "<150KB total" era matematicamente inalcançável incluindo MapLibre (~200KB gzipped sozinho). A nova estrutura distingue:

- **RNF-007a (above-the-fold)** — bloqueia o LCP. Estrita.
- **RNF-007b (mapa)** — carregado sob demanda, não bloqueia LCP. Mais folgada mas ainda monitorada.
- **RNF-007c (total)** — soma do que o usuário acaba baixando na home completa.

`Lighthouse` mede o above-the-fold; CI lint deve falhar quando RNF-007a > 150KB. Análise por bundle-analyzer cobre RNF-007b/c.

## Validação

- Load test 30k VUs: [../testing/load.md](../testing/load.md)
- Core Web Vitals: Vercel Speed Insights em produção
- Lighthouse CI em cada PR
- Bundle analyzer no CI (`ANALYZE=true pnpm build`) com gate de tamanho por chunk

## Validação

- Load test 30k VUs: [../testing/load.md](../testing/load.md)
- Core Web Vitals: Vercel Speed Insights em produção
- Lighthouse CI em cada PR

## Cross-refs

- Constituição § 3 (performance): [../constitution.md](../constitution.md#3-performance-percebida)
