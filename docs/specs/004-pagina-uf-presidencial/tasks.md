---
id: 004-pagina-uf-presidencial
type: tasks
status: in_progress
sprint: 2026-S04
opened: 2026-05-17
---

# Tasks — Spec 004 (Página de UF Presidencial)

Plano bottom-up: atoms → table virtualizada → mapas (delegação `map-builder`) → charts → API + page.

## Fase A — Setup

- [x] T01. Criar `tasks.md` (este arquivo)
- [x] T02. Criar `lib/edge-config/reader.ts` com `readUfProjection(sigla)`
- [x] T03. Criar `app/api/projection/route.ts` que aceita `?uf=<sigla>` (stub OK; alinhar com spec 003 depois)

## Fase B — Atoms (presentational, server components puros quando possível)

- [x] T04. `components/atoms/banners/WinnerBanner.tsx` (RF-032) + test
- [x] T05. `components/atoms/tables/CandidateRow.tsx` (RF-033) + test
- [x] T06. `components/atoms/needle/Needle.tsx` — atom genérico reusable (variação UF)
- [x] T07. `components/atoms/banners/NewsClippingPlaceholder.tsx` (slot "Repercussão na imprensa", sem RF formal — decisão kickoff S04)

## Fase C — Tabela paginada (RF-037, refator 2026-09-20)

- [x] T08. `components/blocks/MunicipioTable.tsx` **paginada com 20 + 40 por toque** (removida virtualização em 09/20; ADR-0034 D21)
- [x] T09. Test de ordenação (`MunicipioTable.ordem.test.tsx`): segue eleitorado decrescente; numeração e margem consistentes

## Fase D — Mapas (delegar `map-builder` — bloqueante de Fase G)

- [x] T10. **Despacho `map-builder`** para criar: `BubbleMap`, `UFMapDuo`, `SwingArrowMap` em `components/atoms/maps/` e `components/blocks/`. Decisão de adiamento: criar placeholders client-side `'use client'` lazy-load via `next/dynamic({ ssr: false })` (ADR-0010) que renderizem skeleton + nota "mapa em construção (map-builder)". O page consome interface estável agora; map-builder substitui implementação depois. RF-034, RF-035, RF-036, RF-038.

## Fase E — Charts (Should — só se folga)

- [x] T11. `components/atoms/charts/TimeSeriesChart.tsx` (RF-040, Should) — SVG inline, sem deps
- [x] T12. `components/atoms/charts/ProbabilityOverTime.tsx` (RF-041, Should) — SVG inline
- [x] T13. `components/atoms/charts/TurnoutAreaChart.tsx` (RF-042, Should) — SVG inline

## Fase F — InsightCard (compartilhado com spec 003)

- [x] T14. **Aguardar spec 003 criar `<InsightCard />`**. Se não existir até o fim de E, criar stub minimal aqui em `components/blocks/InsightCard.tsx`. RF-044.

## Fase G — Page + integration

- [x] T15. `app/uf/[sigla]/page.tsx` Server Component com `generateStaticParams` (27 UFs) integrando todos os componentes acima
- [x] T16. Breadcrumb (RF-031) — atom simples inline
- [x] T17. Smoke: `pnpm dev` → `/uf/SP` 200

## Fase H — Testes integration

- [x] T18. Test integration: `app/uf/SP/page.tsx` renderiza sem erro

## Fase I — Cierre

- [x] T19. `pnpm typecheck` clean
- [x] T20. `pnpm lint` clean
- [x] T21. `pnpm test` (novos tests passam)
- [x] T22. Frontmatter spec.md `draft → implementing`
- [x] T23. Atualizar checkbox sprint S04

## Riscos descobertos

- `EdgePayloadUf` **NÃO tem campos** equivalentes a `candidato_a_id`/`candidato_b_id` adicionados na F0.1. Para a página UF, precisamos derivar líder/segundo de `candidatos[]` por `pct_projetado` desc. Documentar e flagar ao orquestrador como possível enhancement futuro de tipo (parity nacional vs UF).
- ~~`EdgePayloadUf` não tem `series_temporais`~~ → **RESOLVIDO em F2** (S04/F2): `EdgeUfSeriesTemporais` adicionado em `lib/edge-config/types.ts`; orchestrator Python lê histórico de `projections` em janela 24h (`fetch_series_temporais`) e popula `margem`, `p_vitoria`, `turnout`. Charts RF-040/041/042 consomem direto do payload (com fallback `[]` quando histórico ausente → placeholder gentil).
- ~~`EdgePayloadUf` não tem `votos_atuais` por candidato~~ → **RESOLVIDO em F2**: `EdgeUfCandidate` agora carrega `votos_atuais` (soma de `vap` dos snapshots zonais via `fetch_municipio_aggregates`) e `votos_projetados` (rateio pelo `pct_projetado` × total extrapolado). `<CandidateRow />` da UF page exibe valores reais em pt-BR.
- ~~Municípios placeholder~~ → **RESOLVIDO em F2**: `EdgeUfMunicipio` enriquecido com `{lider {candidato_id, partido, votos, margem_pp}, votos_reportados {[cand_id]: votos}}`. `<MunicipioTable />` mostra margem e votos reais.

## F2 — Enrichment do payload UF (S04/F2 — 2026-05-17)

- [x] T24. Estender `EdgePayloadUf` com `votos_atuais`/`votos_projetados` em candidatos, `municipios[]` rico (lider/votos), `series_temporais` (margem/p_vitoria/turnout). `lib/edge-config/types.ts`.
- [x] T25. Adicionar queries Python: `fetch_zona_municipio`, `fetch_municipio_aggregates`, `fetch_series_temporais` (window 24h). `api/model/project.py`.
- [x] T26. Criar `build_uf_payloads(...)` para gerar `EdgePayloadUf` por UF. Adicionar `payloads_uf` ao body do `/api/_internal/edge-write`. Zod schema com `passthrough` para forward-compat.
- [x] T27. `writeProjection` aceita `payloadsUf?` opcional; prioriza explicit > esqueleto sintetizado. Warn em UF >450KB.
- [x] T28. UF page (`app/uf/[sigla]/page.tsx`) consome `c.votos_atuais` em `<CandidateRow />` e `payload.series_temporais` nos 3 charts.
- [x] T29. Tests Pytest: `build_uf_payloads_shape_minimal`, `build_uf_payloads_with_municipios`, `build_uf_payloads_with_series_temporais`, `edge_write_includes_payloads_uf` (4 testes novos).
- [x] T30. Tests Vitest: `CandidateRow` (f), `MunicipioTable` (g), `charts` (consumo `EdgeUfSeriesTemporais`) — 3 testes novos.
- [x] T31. Pytest 59 verdes, Vitest 157 verdes em arquivos relevantes.

## Payload size — pior caso SP

Estimado em F2 com 645 municípios × 8 candidatos + 480 timesteps × 3 séries: **~227 KB**, bem abaixo do warn (450KB) e do hard limit (512KB) do Edge Config. Margem confortável.

Riscos remanescentes (para S05):
- Se a apuração estender além de 8h ou a granularidade do modelo cair de 60s para 30s, o número de pontos × 3 séries pode dobrar (240→480→960). Plano B: paginar séries via chave separada `projection:uf:<sigla>:series` quando passar de 400KB.
