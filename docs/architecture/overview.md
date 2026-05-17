---
title: Visão Geral da Arquitetura
description: Diagrama lógico e fluxo de dados ponta-a-ponta — TSE → Ingest → Modelo → Edge Config → Cliente
status: stable
source: PRD.md §§ 9.1, 9.2, 9.3
---

# Visão Geral da Arquitetura

## Diagrama lógico

```
┌──────────────────────────────────────────────────────────────────┐
│                        TSE — CDN Pública                          │
│           resultados.tse.jus.br/oficial/...                       │
└────────────────────────┬─────────────────────────────────────────┘
                         │ ETag-aware GET a cada 15s
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                     INGESTÃO (Vercel)                             │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐    │
│ │ Vercel Cron  │→ │ /api/ingest  │→ │ /api/model/project.py│    │
│ │   */15 sec   │  │ Node 24      │  │ Python 3.14 + NumPy  │    │
│ └──────────────┘  │ Fluid Compute│  │ Fluid Compute        │    │
│                   └──────┬───────┘  └──────────┬───────────┘    │
└──────────────────────────┼─────────────────────┼──────────────────┘
                           │ snapshot raw         │ projeção calc.
                           ▼                      ▼
┌──────────────────────────────────────────────────────────────────┐
│                     PERSISTÊNCIA                                  │
│ ┌───────────────────┐                  ┌────────────────────────┐│
│ │ Neon Postgres     │                  │ Vercel Edge Config     ││
│ │ (snapshots/audit) │                  │ projection:current     ││
│ │ - Histórico 2022  │                  │ Replicado todos PoPs    ││
│ │ - Append-only     │                  │ Read <15ms global       ││
│ │ - NÃO está no     │                  │ <30KB JSON             ││
│ │   read path       │                  └──────────┬─────────────┘│
│ └───────────────────┘                             │              │
│                                                   │              │
│ ┌───────────────────┐                             │              │
│ │ Vercel Blob       │                             │              │
│ │ - JSONs EA20 raw  │                             │              │
│ │ - PMTiles (mapa)  │                             │              │
│ │ - OG images       │                             │              │
│ └───────────────────┘                             │              │
└───────────────────────────────────────────────────┼──────────────┘
                                                    │
                                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                     LEITURA (escala 20k+)                         │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ Vercel CDN (Edge)                                            │ │
│ │ - Cache-Control s-maxage=5, stale-while-revalidate=30        │ │
│ │ - Hit ratio: 99,8% em pico                                   │ │
│ └──────────────────────────────────────────────────────────────┘ │
│           ▲                                ▲                     │
│           │ first req                      │ subsequent          │
│ ┌─────────┴────────┐                                             │
│ │ Next.js          │                                             │
│ │ Server Component │                                             │
│ │ → Edge Config    │                                             │
│ └─────────┬────────┘                                             │
└───────────┼──────────────────────────────────────────────────────┘
            │ SSR HTML + payload inicial
            ▼
┌──────────────────────────────────────────────────────────────────┐
│                       CLIENTE (Browser)                           │
│ ┌─────────────────────────────────────────────────────────────┐  │
│ │ React 19 + Next.js 16                                       │  │
│ │ - Server Components SSR                                     │  │
│ │ - Client Components hidratam                                │  │
│ │ - SWR poll /api/projection a cada 5s                        │  │
│ │ - Zustand para hover store (brushing & linking)             │  │
│ │ - MapLibre GL + PMTiles para mapas                          │  │
│ │ - Framer Motion para animações                              │  │
│ └─────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## Fluxo de dados — Write path (ingest)

1. **Vercel Cron** dispara `/api/ingest` a cada 15s (janela 17h–04h).
2. Endpoint lê `comum/config/ele-c.json` (cacheado em memória da função por 60s).
3. Para cada `(UF × cargo × zona)`, faz GET com `If-None-Match` para `resultados.tse.jus.br/.../EA20.json`.
4. Se 200, persiste novo snapshot em Postgres (`snapshots`) e em Blob (raw archive).
5. Aciona `/api/model/project` (Python).
6. Python recalcula projeção, persiste em Postgres (`projections`) e **escreve em Edge Config**.
7. Edge Config propaga em ~5–10s globalmente.

## Fluxo de dados — Read path (cliente)

1. Usuário acessa `/`.
2. Next.js Server Component lê Edge Config (`projection:current`) — <15ms.
3. SSR renderiza HTML com payload inicial embutido.
4. Cliente hidrata, inicia polling de `/api/projection`.
5. CDN absorve 99,8% — hit serve em <50ms.
6. Em miss raro, função lê Edge Config (<15ms) e responde.

## Componentes da stack — visão geral

| Camada | Tecnologia | Função |
|---|---|---|
| Cliente | Next.js 16 + React 19 | SSR, SC/CC, App Router |
| Estado cliente | Zustand | Hover store coordenado |
| Polling | SWR | Atualização a cada 5s |
| Mapas | MapLibre GL JS + PMTiles | Renderização vetorial |
| Animações | Framer Motion + D3 | Agulha, transições |
| Tipografia | next/font (Source Serif Pro + Inter) | NYT-like |
| CDN | Vercel Edge Network | 99,8% cache hit |
| Compute (Node) | Vercel Fluid Compute (Node 24) | Ingest, API routes |
| Compute (Python) | Vercel Fluid Compute (Python 3.14) | Modelo estatístico |
| Estado quente | Vercel Edge Config | Projeção atual, <15ms global |
| Storage durável | Neon Postgres (Marketplace) | Snapshots, histórico |
| Object storage | Vercel Blob | PMTiles, JSONs raw, OG images |
| Cron | Vercel Cron | Polling agendado |
| Config | `vercel.ts` (TypeScript) | Substitui `vercel.json` |
| Proteção | Vercel BotID + rate limit custom | Mitigação de abuso |
| Observabilidade | Vercel Analytics + Speed Insights | Tráfego e Core Web Vitals |
| Rollout | Vercel Rolling Releases | Canary 10/50/100% |

## Cross-refs

- Stack detalhada: [./tech-stack.md](./tech-stack.md)
- Estrutura de pastas: [./folder-structure.md](./folder-structure.md)
- Modelo de dados: [./data-model.md](./data-model.md)
- APIs internas: [./apis-internas.md](./apis-internas.md)
- ADRs que sustentam essa arquitetura: [./adrs/](./adrs/)
