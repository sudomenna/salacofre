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

**Setup S04 (originais)**:
- [ ] Setup do design system: `tokens.md` aplicado via `globals.css` + Tailwind 4 config
- [ ] `next/font` configurado (Source Serif Pro + Inter)
- [ ] Componentes layout: `<Header>`, `<Footer>`, `<Tabs>`, `<LiveBadge>`
- [ ] SWR provider + polling client de `/api/projection`
- [ ] `<MapSkeleton>` (placeholder enquanto mapa carrega lazy — [ADR-0010](../architecture/adrs/0010-mapa-dynamic-import.md))

**Carry-overs S03 — bloqueantes da UI (resolver ANTES das specs 003/004)**:
- [ ] **Fix `compute_national` p_vitoria_a** — `api/model/project.py` identifica "A" pelo menor `candidato_id`. UI da agulha precisa de top-2 por `pct_projetado` (líder vs segundo). Sem isso, `p_vitoria_a` do payload Edge Config vem semanticamente errado. Carry-over #1 da retro S03.
- [ ] **Migration: popular `historical_results.pct_validos`** — todos os 28k registros 2022 têm `pct_validos = NULL` (carga S01 inseriu só `votos`). SQL sugerido: `UPDATE historical_results SET pct_validos = votos::float / NULLIF(SUM(votos) OVER (PARTITION BY ano, turno, cargo, uf, cod_zona), 0)`. Carry-over #4.
- [ ] **Spec 011 `app/sobre-o-modelo/` ativada** (`§ 8` da constituição) — hoje só `.gitkeep`. Bloqueia qualquer page de projeção em produção. Materializar spec 011 (mesmo MVP) antes de spec 003/004 chegarem ao usuário. Carry-over #7.
- [ ] **`<ForecastTransparency />` em `components/blocks/`** — bloco "O que está movendo o forecast" exigido por `§ 8` em toda page com projeção. Bloqueia 003 e 004. Carry-over #8.

**Carry-overs S03 — débito técnico (encaixar em paralelo)**:
- [ ] **Regenerar fixtures replay-2022 após fix do `pct_validos`** — `tests/fixtures/replay-2022/snapshots.json` foi corrigido inline pelo `model-validator` em T22 da S03; sha1 documentados em T21 estão stale. Pré-requisito pra re-rodar gate OT-4. Carry-over #2.
- [ ] **Resolver divergência K-1 spec ↔ código** — spec 002 § "Casos de borda" diz `computed=false` quando candidato sem mapping, mas orchestrator trata por-candidato (continue no loop interno, `computed=true`). Decidir: corrigir spec.md ou ajustar `_do_project`. Carry-over #3.
- [ ] **ADR retroativo para `botid`** (`§ 9` constituição — stack canônica) — dep adicionada na S01 sem ADR. Despachar `adr-author` com contexto: caso de uso (BotID proteção em `/api/*`), trade-off vs alternativa Vercel BotID nativo. Carry-over #6.
- [ ] **Marker em `ingest_log.notes`** — `tests/integration/ingest-cycle.test.ts:T19` (spec 001 shipped) espera count absoluto, fica flaky em forks paralelos quando outros integration tests inserem em `ingest_log`. Migrar para JSON com `test_run_id` e contar relativo. Alternativa: `--poolOptions.forks.singleFork=true` em vitest config (workaround mais barato). Carry-over #9.
- [ ] **Next 16 deprecation: `middleware.ts → proxy.ts`** — dev server avisa desde S01; não-crítico, mas vira erro em Next 17. Carry-over #19.

**Owner-action (operacionais, não-código — apenas visibilidade aqui)**:
- [ ] `SLACK_WEBHOOK_URL` configurado em Vercel preview + production (alerting RF-010 da spec 001 depende). Carry-over #15.
- [ ] `TSE_COD_ELEICAO` substituído pelo valor real após Res. 2026 publicar (esperado jul–set/2026). Carry-over #16.
- [ ] Cadastro como "interessado na divulgação" (RF-010, janela típica jun–set/2026). Carry-over #17.
- [ ] Acionar `vercel deploy` preview para validar end-to-end do Python `/api/model/project` (smoke `curl` retornando `{"ok": true}`, depois fluxo completo). Carry-over T02/#12.

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
- **Spec 002 (modelo) ainda em `implementing`, não shipped** — UI da home/UF consome `projection:current` do Edge Config, payload é produzido pelo Python. Risco: payload em produção pode ter bug semântico (`p_vitoria_a` invertido, vide chore #1) ou Edge Config writer não validado em preview real (vide chore owner #4). Mitigação: resolver os 4 chores bloqueantes ANTES de despachar `spec-implementer` pra 003/004.
- **Watch items longos** (concorrência prod, simulado oficial TSE 2026, DF eleitorado): rastreados em [`docs/reference/risks.md`](../reference/risks.md). Não bloqueiam S04, mas vigiar.

## Replanejamentos mid-sprint

_(preencher se mudar)_

## Retrospective (preencher ao fechar)

- O que funcionou:
- O que melhorar:
- Carry-over pra S05:

## Cross-refs

- Sprint anterior: [2026-S03-f3-modelo.md](./2026-S03-f3-modelo.md) — retro tem origem dos carry-overs táticos absorvidos acima
- Próxima sprint: [2026-S05-f4b-mapas-brushing.md](./2026-S05-f4b-mapas-brushing.md)
- Specs: [003](../specs/003-home-nacional/), [004](../specs/004-pagina-uf-presidencial/)
- Riscos persistentes pós-S03: [../reference/risks.md](../reference/risks.md)
- Spec 002 (não-shipped) e seus `ship_blocked_on:`: [../specs/002-modelo-estatistico/spec.md](../specs/002-modelo-estatistico/spec.md)
