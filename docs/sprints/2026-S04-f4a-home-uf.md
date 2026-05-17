---
id: 2026-S04
title: Sprint 04 — Frontend MVP (Home + Página de UF, sem brushing)
status: planned
start: 2026-07-06
end: 2026-07-19
phase: F4a
goal: Esqueleto da home e de uma página de UF renderizando dados live do Edge Config, com mapas via dynamic import. Brushing ainda não.
specs_in_flight: [003-home-nacional, 004-pagina-uf-presidencial]
specs_planned_next: [008-interatividade-brushing]
---

# Sprint 04 — Home + Página de UF (MVP)

## Objetivo único

[Spec 003](../specs/003-home-nacional/) e [Spec 004](../specs/004-pagina-uf-presidencial/) atingem `shipped` com componentes principais funcionando. Brushing fica pra S05.

## Specs in-flight

- [ ] **003-home-nacional** — RF-021 a RF-030.6, foco no shipping do esqueleto + mapa hero.
- [ ] **004-pagina-uf-presidencial** — RF-031 a RF-044, foco em winner banner + mapas duo + tabela de municípios.

## Chores fora de spec

- [ ] Setup do design system: `tokens.md` aplicado via `globals.css` + Tailwind 4 config
- [ ] `next/font` configurado (Source Serif Pro + Inter)
- [ ] Componentes layout: `<Header>`, `<Footer>`, `<Tabs>`, `<LiveBadge>`
- [ ] SWR provider + polling client de `/api/projection`
- [ ] `<MapSkeleton>` (placeholder enquanto mapa carrega lazy — [ADR-0010](../architecture/adrs/0010-mapa-dynamic-import.md))

## Despachos sugeridos (paralelizáveis)

- **`spec-implementer`** para spec 003 (orquestra o build da home).
- **`spec-implementer`** para spec 004 (orquestra a página de UF) — **em paralelo** com 003 quando o tronco comum (layout, SWR) estiver pronto.
- **`map-builder`** invocado por ambos para os componentes de mapa (`<NationalChoroplethMap>` + `<UFMapDuo>` + `<BubbleMap>`).
- **`a11y-perf-auditor`** após cada spec — gate antes de shipped.
- **`constitution-guard`** — atenção especial a cores (PT=vermelho, PL=azul; nunca oficiais) e ao bundle above-the-fold.
- **`rf-coverage-checker`** antes de marcar cada spec shipped.
- **`spec-syncer`** ao final.

## Definition of Done

- ✅ Spec 003 com `status: shipped`
- ✅ Spec 004 com `status: shipped`
- ✅ Bundle above-the-fold da home <150KB gzipped (RNF-007a)
- ✅ Chunk do mapa <250KB gzipped (RNF-007b)
- ✅ LCP p95 (Lighthouse local) <2.5s
- ✅ Lighthouse a11y >95 em home e UF
- ✅ Mapas via `next/dynamic({ ssr: false })` (ADR-0010)
- ✅ Footer com "Não oficial. Fonte: TSE." em todas as páginas (constituição § 1)

## Não-objetivos (out of scope desta sprint)

- Brushing & linking (vai pra S05)
- Mobile bottom-sheet (S05)
- Gráficos de série temporal (RF-040/041/042) — Should, podem ficar pra S05

## Riscos da sprint

- **Mapa hero pesar no LCP** mesmo com dynamic import — testar skeleton bem desenhado.
- **Tabela de UFs (27 linhas) + dot-plot inline** pode custar muito CSS — usar `tabular-nums` global ajuda.
- **Duas specs em paralelo** podem competir por tempo do mesmo dev — priorizar 003 (home é mais visível) se conflito.

## Replanejamentos mid-sprint

_(preencher se mudar)_

## Retrospective (preencher ao fechar)

- O que funcionou:
- O que melhorar:
- Carry-over pra S05:

## Cross-refs

- Sprint anterior: [2026-S03-f3-modelo.md](./2026-S03-f3-modelo.md)
- Próxima sprint: [2026-S05-f4b-mapas-brushing.md](./2026-S05-f4b-mapas-brushing.md)
- Specs: [003](../specs/003-home-nacional/), [004](../specs/004-pagina-uf-presidencial/)
