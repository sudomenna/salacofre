---
title: Stack Tecnológica
description: Tabela canônica de tecnologias, versões e justificativas; dependências NPM principais
status: stable
source: PRD.md § 10
---

# Stack Tecnológica

## Tabela detalhada

| Componente | Tecnologia | Versão | Justificativa |
|---|---|---|---|
| Framework | Next.js | 16+ | App Router, Cache Components, SSR rápido, integração nativa Vercel |
| UI library | React | 19+ | Server Components estáveis, transições nativas |
| Runtime principal | Node.js (Fluid Compute) | 24 LTS | Padrão Vercel, single-instance multiplexing |
| Runtime modelo | Python (Fluid Compute) | 3.14 | NumPy/SciPy para bootstrap eficiente |
| Linguagem | TypeScript | 5.6+ | Type safety end-to-end |
| Styling | Tailwind CSS | 4.0+ | Design system rápido, JIT |
| Tipografia | next/font (Source Serif Pro + Inter) | latest | NYT-like via Google Fonts |
| Estado cliente | Zustand | 5+ | Mais leve que Redux, ideal para hover store |
| Fetcher cliente | SWR | 2+ | Polling, dedup, revalidação |
| Mapas | MapLibre GL JS | 5+ | Open-source, sem lock-in Mapbox |
| Mapa tiles | PMTiles | 4+ | Single-file vector tiles, range-requests |
| Tile converter | tippecanoe | latest | shapefile → PMTiles |
| Animações | Framer Motion | 12+ | Spring physics, layout animations |
| Charts | D3 (selecionado) + custom SVG | 7+ | Não usamos Recharts/Visx — controle total |
| DB | Neon Postgres (Marketplace) | 16+ | Serverless, branching, ramp gratuito |
| ORM | Drizzle | latest | Type-safe, mais leve que Prisma |
| Estado quente | Vercel Edge Config | latest | Replicado nos PoPs, <15ms |
| Storage objeto | Vercel Blob | latest | PMTiles, raw archives |
| Cron | Vercel Cron | latest | Trigger do ingest |
| Config | `vercel.ts` (`@vercel/config`) | latest | TS-typed, dynamic |
| MDX | `@next/mdx` | latest | Página `/sobre-o-modelo` |
| Validação | Zod | latest | Schema do TSE, payloads de API |
| Testes unit | Vitest | latest | Mais rápido que Jest |
| Testes e2e | Playwright | latest | Browser real |
| Load test | k6 | latest | 20k VUs simulados |
| Lint/Format | Biome | latest | Substitui ESLint + Prettier (mais rápido) |
| CI/CD | Vercel + GitHub Actions | — | Preview deployments por PR |
| Observabilidade | Vercel Analytics + Speed Insights | latest | Core Web Vitals automáticos |
| Logs | Vercel Logs + structured JSON | — | Filtrable por correlation-id |
| Proteção | Vercel BotID | latest | Bot detection no edge |
| Pacote manager | pnpm | 9+ | Workspaces, deduplicação |

## Dependências NPM (principais)

```jsonc
{
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@vercel/edge-config": "^2.0.0",
    "@vercel/blob": "^2.0.0",
    "@vercel/analytics": "^2.0.0",
    "@vercel/speed-insights": "^2.0.0",
    "@vercel/config": "^1.0.0",
    "drizzle-orm": "^0.40.0",
    "@neondatabase/serverless": "^1.0.0",
    "zustand": "^5.0.0",
    "swr": "^2.4.0",
    "maplibre-gl": "^5.0.0",
    "pmtiles": "^4.0.0",
    "framer-motion": "^12.0.0",
    "d3-scale": "^4.0.0",
    "d3-shape": "^3.0.0",
    "d3-array": "^3.2.0",
    "zod": "^4.0.0",
    "@next/mdx": "^16.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@biomejs/biome": "^2.0.0",
    "vitest": "^3.0.0",
    "@playwright/test": "^1.50.0",
    "tailwindcss": "^4.0.0"
  }
}
```

## Notas sobre bundle size

A stack inclui bibliotecas pesadas — em particular **MapLibre GL** (~200KB gzipped), **Framer Motion** (~35KB), **D3 selecionado** (~25KB combinado). Para respeitar [RNF-007a](../nfr/performance.md) (bundle above-the-fold <150KB):

- **MapLibre** carrega via `next/dynamic({ ssr: false })` após first paint — ver [ADR-0010](./adrs/0010-mapa-dynamic-import.md).
- **Framer Motion** pode ser importado seletivamente (`framer-motion` → `framer-motion/m` minimal) para componentes acima da dobra (agulha) e completo só nos chunks lazy.
- **D3** é importado por módulo (`d3-scale`, `d3-shape`, `d3-array`) — nunca `import * from 'd3'` (puxaria 80KB+).
- **PMTiles client** acompanha MapLibre no chunk lazy.

## Notas sobre dependências transitivas

A `@neondatabase/serverless` depende de `ws` para suporte a WebSocket em runtimes sem objeto `WebSocket` global (ex: scripts Node puro em `data-pipeline/`). Esta é uma dependência **transitiva** (não listada explicitamente) mas essencial — não constitui violação da stack (não é dep adicional fora do padrão Vercel).

## Cross-refs

- ADRs que justificam decisões-chave: [./adrs/](./adrs/)
- Princípio "stack 100% Vercel": [../constitution.md](../constitution.md#9-stack-100-vercel)
- Orçamento de bundle refinado: [../nfr/performance.md](../nfr/performance.md)
