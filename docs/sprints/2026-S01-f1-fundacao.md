---
id: 2026-S01
title: Sprint 01 — Fundação (Vercel + Schema + Históricos + PMTiles)
status: done
start: 2026-05-18
end: 2026-06-07
closed: 2026-05-17
phase: F1
goal: Infra Vercel funcionando, schema DB criado, históricos 2018+2022 carregados, PMTiles gerados e em Blob
specs_in_flight: []
specs_planned_next: [001-ingestao-tse]
---

# Sprint 01 — Fundação

## Objetivo único

Toda a infra greenfield levantada e populada de dados estáticos, pronta pro pipeline TSE entrar na S02.

## Specs in-flight

Nenhuma spec do produto entra ainda — toda a sprint é **infra e dados base**. Specs de produto começam em S02.

## Chores

### Setup do repositório

- [ ] `pnpm init` + estrutura conforme [folder-structure.md](../architecture/folder-structure.md)
- [ ] Instalar deps canônicas da [tech-stack.md](../architecture/tech-stack.md): `next`, `react`, `react-dom`, `@vercel/edge-config`, `@vercel/blob`, `drizzle-orm`, `@neondatabase/serverless`, `zustand`, `swr`, `maplibre-gl`, `pmtiles`, `framer-motion`, `d3-scale`, `d3-shape`, `d3-array`, `zod`, `@next/mdx`
- [ ] Dev deps: `typescript`, `@biomejs/biome`, `vitest`, `@playwright/test`, `tailwindcss`
- [ ] `vercel.ts` (typed config, substituindo `vercel.json`)
- [ ] `next.config.ts` + `tailwind.config.ts` + `biome.json`
- [ ] `.gitignore`, `tsconfig.json`, `playwright.config.ts`, `vitest.config.ts`
- [ ] Instalar ferramentas geo locais (macOS): `brew install gdal tippecanoe` — pré-requisito do pipeline PMTiles (Track D)

### Vercel

- [ ] Provisão de projeto Vercel + GitHub integration
- [ ] Provisão de Edge Config store (`projection:current` chave reservada)
- [ ] Provisão de Vercel Blob store (PMTiles + raw archives)
- [ ] Env vars de produção (preview = staging): `DATABASE_URL`, `CRON_SECRET`, `NEXT_PUBLIC_PMTILES_BASE`
- [ ] Rolling Release configurado (canary 10/50/100% — RF-059)
- [ ] BotID habilitado em `/api/*` ([ADR-0009](../architecture/adrs/0009-botid-vercel.md))

### Banco

- [ ] Provisão Neon Postgres (Marketplace) + branch `preview` separada
- [ ] Schema inicial conforme [data-model.md](../architecture/data-model.md): `historical_results`, `eleitorado`, `municipios`, `zonas`, `snapshots`, `projections`, `ingest_log`
- [ ] Drizzle setup + primeira migração
- [ ] Índices conforme schema
- [ ] Migração `0001_postgis.sql` manual: `CREATE EXTENSION IF NOT EXISTS postgis` + `ALTER TABLE municipios ALTER COLUMN geo_centroid TYPE geography(Point, 4326) USING geo_centroid::geography` — Drizzle `pg-core` não tem helper PostGIS, schema TS declara `geo_centroid` como `text` (com comentário); essa migration corrige tipo no banco

### Carga de dados estáticos

- [ ] `data-pipeline/ibge-import.ts` — popula `municipios` a partir do shapefile IBGE 2022
- [ ] `data-pipeline/historical-import.ts` — popula `historical_results` para 2018 e 2022, cargos 1 e 3, 1T e 2T
- [ ] `data-pipeline/eleitorado-import.ts` — popula `eleitorado` para 2026 (estimativa baseada em 2024 enquanto TSE 2026 não publica)
- [ ] Validação cruzada: toda zona em `historical_results` mapeia pra um município em `municipios`

### PMTiles

- [ ] Pipeline shapefile → GeoJSON simplificado → PMTiles ([pipeline-geo.md](../mapas/pipeline-geo.md))
- [ ] Gerar `ufs.pmtiles` (~500KB)
- [ ] Gerar `municipios.pmtiles` (~50MB)
- [ ] Upload pro Vercel Blob com URL pública
- [ ] Validação manual: abrir `municipios.pmtiles` num viewer (tilemaker, pmtiles serve) e confirmar 5.570 features

### CI/CD básico

- [ ] GitHub Actions workflow: typecheck + lint + unit em todo PR
- [ ] Branch protection na `main` (review obrigatório + checks verdes)

### Documentação

- [ ] Criar README.md raiz do código (não confundir com docs/README.md)
- [ ] Atualizar [docs/operations/deployment.md](../operations/deployment.md) com URLs reais (preview + prod)

## Definition of Done

- ✅ `pnpm dev` roda local sem erro
- ✅ `pnpm build` passa (mesmo que página seja só placeholder)
- ✅ Vercel preview deploy funcionando em PR
- ✅ `historical_results` com count >0 para `ano IN (2018, 2022), cargo IN (1, 3)`
- ✅ `municipios` com 5.570 linhas + relacionamento `zonas` populado
- ✅ `municipios.pmtiles` e `ufs.pmtiles` acessíveis via URL pública do Blob
- ✅ CI verde em PR de teste

## Riscos da sprint

- **Cadastro TSE atrasado** — não bloqueia S01 (dev local + dados históricos estáticos). Iniciar processo essa sprint mesmo assim.
- **Shapefile TSE de zonas 2026 indisponível** — usar 2024 como aproximação até o TSE atualizar.
- **Resolução TSE 2026 não publicada** — também não bloqueia infra (User-Agent ainda é provisório).

## Replanejamentos mid-sprint

_(preencher se mudar)_

## Retrospective

Fechada em 2026-05-17, antes do `start: 2026-05-18` do frontmatter — execução em modo bootstrap intensivo no greenfield. Todo o DoD foi atingido em 1 PR (#1, squash-merged em `main` como commit `8dc5cc6`).

**O que funcionou:**
- **4 streams paralelos** (C.a IBGE, C.b Historical+Eleitorado, E CI, V BotID/Rolling Release) convergiram com pouca sobreposição. O subagent paralelo deu ~3x speedup vs sequencial.
- **Idempotência dos scripts ETL** via UPSERT permitiu rodar reconciliação IBGE↔TSE como follow-up sem reset do banco.
- **Background tsx sobreviveu ao freeze da sessão Claude** — o processo de import histórico/eleitorado continuou em background e completou sozinho enquanto a sessão estava trancada. Lição operacional: não matar processos quando Claude freezar.
- **`tse-parser-builder` como subagent especializado** resolveu o blocker IBGE↔TSE com 100% de cobertura usando fallback por nome normalizado (TSE não publica tabela direta).

**O que melhorar:**
- **Verificação insuficiente de saída de subagent**: a Onda 3 reportou "C.b ainda rodando" sem checar contagens reais no banco. Próxima sessão precisou confiar e verificar antes de continuar. Subagents devem retornar contagens DB-side, não só "completou".
- **Reconciliação IBGE↔TSE deveria estar no escopo original da Onda 3**, não como follow-up. `cod_municipio_tse` populado com placeholder IBGE causou 100% de órfãos no join — só detectado por análise posterior.
- **`pnpm typecheck` foi reportado verde sem cobrir `data-pipeline/*.ts`** (faltava `allowImportingTsExtensions`). Reportar escopo do typecheck explicitamente, ou rodar em escopo total.
- **`vercel.ts` com `rollingRelease` quebrou preview** — Vercel valida schema e rejeita propriedades extras. Princípio: declarar configs typed só pra coisas que o Vercel realmente consome.

**Carry-over pra S02:**
- **DF ausente em `eleitorado`** (gap de fonte — TSE 2024 não cobre DF). Resolve quando TSE publicar eleitorado 2026 no ciclo presidencial. Não-bloqueador.
- **`validate-coverage.ts` reporta 25 falsos-positivos** em `historical_results` por causa de `uf='ZZ'` (voto em trânsito federal). Adicionar `AND h.uf <> 'ZZ'` na query `histGaps`. Trivial.
- **Branch protection na `main`** bloqueada por GitHub Free (limitação de plano, não bug). Considerar upgrade ou enforcement via CODEOWNERS + review manual quando time crescer.

## Cross-refs

- Próxima sprint: [2026-S02-f2-ingestao.md](./2026-S02-f2-ingestao.md)
- Roadmap fase F1: [../product/roadmap.md](../product/roadmap.md)
- Backlog (chores não priorizados nesta sprint): [./backlog.md](./backlog.md)
