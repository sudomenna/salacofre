---
title: Estrutura de Pastas
description: Árvore canônica do repositório atlasmenna/ com responsabilidades por diretório
status: stable
source: PRD.md § 9.4
---

# Estrutura de Pastas

```
atlasmenna/
├── vercel.ts                              # config TS (crons, rewrites, regions)
├── next.config.ts
├── tailwind.config.ts
├── package.json
├── app/
│   ├── layout.tsx                         # shell global
│   ├── page.tsx                           # / (Home Nacional)
│   ├── globals.css
│   ├── governador/page.tsx
│   ├── uf/[sigla]/page.tsx
│   ├── uf/[sigla]/governador/page.tsx
│   ├── uf/[sigla]/municipio/[ibge]/page.tsx
│   ├── sobre-o-modelo/page.mdx
│   ├── _status/page.tsx                   # interno, auth
│   ├── manutencao/page.tsx
│   ├── opengraph-image.tsx                # OG dinâmica
│   └── api/
│       ├── projection/route.ts            # leitura pública
│       ├── ingest/route.ts                # cron-only
│       └── model/project.py               # Python — modelo
├── components/
│   ├── atoms/
│   │   ├── needle/Needle.tsx
│   │   ├── bars/ConfidenceBar.tsx
│   │   ├── charts/{DotPlotRange,TimeSeriesChart,ProbabilityOverTime,TurnoutAreaChart,ModelComposition}.tsx
│   │   ├── maps/{ChoroplethMap,BubbleMap,SwingArrowMap}.tsx
│   │   ├── tables/CandidateRow.tsx
│   │   └── banners/WinnerBanner.tsx
│   ├── blocks/
│   │   ├── NationalNeedle.tsx
│   │   ├── DecisiveUFsGrid.tsx
│   │   ├── UFForecastTable.tsx
│   │   ├── UFMapDuo.tsx
│   │   ├── MunicipioTable.tsx
│   │   ├── ForecastTransparency.tsx
│   │   └── InsightCard.tsx
│   ├── layout/{Header,Footer,LiveBadge,Tabs}.tsx
│   └── shared/{HoverTooltip,BottomSheet}.tsx
├── lib/
│   ├── tse/{client,ea20-parser,cdn-urls,ea-config}.ts
│   ├── model/{swing,bootstrap,project,types}.ts (+ project.py)
│   ├── edge-config/{reader,writer}.ts
│   ├── db/{schema.sql,queries.ts,migrations/}
│   ├── state/hover-store.ts
│   ├── geo/{municipios.pmtiles,ufs.pmtiles,index.ts}
│   ├── insights/{templates.json,generate.ts}
│   └── utils/{format,colors,a11y}.ts
├── middleware.ts                          # rate limit + BotID
├── data-pipeline/
│   ├── historical-import.ts               # importa TSE 2022
│   ├── eleitorado-import.ts
│   ├── ibge-import.ts                     # municípios shapefile → PMTiles
│   └── README.md
├── scripts/
│   ├── replay-2022.ts
│   ├── load-test.k6.js
│   └── tse-simulator.ts                   # testa pipeline offline
├── tests/
│   ├── unit/{tse,model,insights}/
│   ├── integration/{ingest,projection}/
│   └── e2e/{home,uf,brushing}.spec.ts
└── public/
    ├── og-static.png
    └── favicon.ico
```

## Princípios

- **`app/`** segue convenção do Next.js App Router; rotas são pastas.
- **`components/`** dividido em `atoms` (primitivos visuais), `blocks` (composições de domínio), `layout`, `shared`.
- **`lib/`** concentra lógica não-React: TSE client, modelo, Edge Config, DB, state global.
- **`data-pipeline/`** scripts one-shot rodados fora do request path (import histórico, geração PMTiles).
- **`scripts/`** automações (replay, load test, simulador TSE).
- **`tests/`** mirror da estrutura de `lib/` + e2e por rota.

## Cross-refs

- Mapeamento componente → RF: [../design-system/components.md](../design-system/components.md)
- Stack e versões: [./tech-stack.md](./tech-stack.md)
