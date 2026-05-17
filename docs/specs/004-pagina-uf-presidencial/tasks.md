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

## Fase C — Tabela virtualizada (RF-037)

- [x] T08. `components/blocks/MunicipioTable.tsx` com virtualização DIY (windowing por scroll position; sem @tanstack/react-virtual pra não inflar bundle) + test cobrindo 645 linhas
- [x] T09. Test smoke: virtualizar render apenas slice visível

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
- `EdgePayloadUf` não tem `series_temporais` (gráficos RF-040/041/042 são Should). Para a v1 vou usar fixtures stub dentro do page para os charts até o payload contemplar.
- `EdgePayloadUf` não tem `votos_atuais` por candidato (só `pct_atual`/`pct_projetado`) — RF-033 pede votos. Vou exibir votos via aproximação `pct * (votos_totais_uf)` quando disponível, ou esconder a coluna gracefully (TODO documentado).
