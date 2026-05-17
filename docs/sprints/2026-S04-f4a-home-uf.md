---
id: 2026-S04
title: Sprint 04 — Frontend MVP (Home + UF + Sobre o Modelo)
status: active
start: 2026-07-06
end: 2026-07-19
opened: 2026-05-17
phase: F4a
goal: Specs 003 (home), 004 (UF presidencial) e 011 (sobre o modelo NYT-style) atingem shipped, com 6 bloqueantes da retro S03 resolvidos como Fase 0.
specs_in_flight: [003-home-nacional, 004-pagina-uf-presidencial, 011-sobre-o-modelo]
specs_planned_next: [008-interatividade-brushing]
kickoff_decisions:
  - cores-pt-vermelho-pl-azul-NYT-style
  - spec-011-mockup-NYT-style-nao-MVP-texto-puro
  - UF-clipping-noticias-mídias-BR-placeholder-visual-sem-RF-formal
  - specs-003-e-004-paralelas-via-2-spec-implementer
---

# Sprint 04 — Home + UF + Sobre o Modelo

## Objetivo único

[Spec 003](../specs/003-home-nacional/), [Spec 004](../specs/004-pagina-uf-presidencial/) e [Spec 011](../specs/011-sobre-o-modelo/) atingem `shipped`, com **6 bloqueantes da retro S03 resolvidos como Fase 0**. Brushing (spec 008) fica pra S05.

## Decisões kickoff (registradas em 2026-05-17)

1. **Cores partidárias = NYT-style** — PT vermelho, PL azul, paleta neutra em `docs/design-system/tokens.md` (referencia visual, não cor oficial — constituição § 2).
2. **Spec 011 sobe escopo**: não é MVP texto puro — `app/sobre-o-modelo/page.tsx` recebe **mockup NYT-style** (ilustração de agulha, banda de confiança, exemplos visuais). Aproximação visual à página de metodologia do The Upshot.
3. **"Chamada por AP/Reuters" cortada da v1** — não temos parceria editorial. Em vez disso, página de UF (spec 004) reserva **slot visual "Repercussão na imprensa"** para clipping futuro de mídias BR (decisão sem RF formal — fica como nota no design.md da spec 004 e materializa em F4b/F5).
4. **Specs 003 e 004 em paralelo** — após Fase 0, despacho duplo de `spec-implementer`. `<ForecastTransparency />` e `<InsightCard>` compartilhados (prontos na Fase 0).

## Specs in-flight

- [~] **003-home-nacional** — RF-021 a RF-030.6, foco no shipping do esqueleto + mapa hero. _(implementing 2026-05-17: tasks.md fechado, atoms+blocks+page integrados, 90 tests verdes, `app/page.tsx` smoke OK; carry-overs: NationalChoroplethMap real (MapLibre+PMTiles) deve ser despachado ao `map-builder` antes de shipped; UFForecastTable RF-025 deferido para S05.)_
- [~] **004-pagina-uf-presidencial** — RF-031 a RF-044 + slot "Repercussão na imprensa" (placeholder visual, sem RF formal). _(implementing — Fase B–G concluídas em 2026-05-17, `app/uf/[sigla]/page.tsx` HTTP 200 smoke verde, 24 tests verdes; mapas via placeholder client lazy → aguarda `map-builder`)._
- [ ] **011-sobre-o-modelo** — RF-054 com mockup NYT-style (não texto puro). Bloqueante § 8 antes das 003/004 irem live.

## Chores fora de spec

**Setup S04 (originais)**:
- [ ] Setup do design system: `tokens.md` aplicado via `globals.css` + Tailwind 4 config
- [ ] `next/font` configurado (Source Serif Pro + Inter)
- [ ] Componentes layout: `<Header>`, `<Footer>`, `<Tabs>`, `<LiveBadge>`
- [ ] SWR provider + polling client de `/api/projection`
- [ ] `<MapSkeleton>` (placeholder enquanto mapa carrega lazy — [ADR-0010](../architecture/adrs/0010-mapa-dynamic-import.md))

**Carry-overs S03 — bloqueantes da UI (resolver ANTES das specs 003/004)**:
- [x] **Fix `compute_national` p_vitoria_a** — `api/model/project.py` identifica "A" pelo menor `candidato_id`. UI da agulha precisa de top-2 por `pct_projetado` (líder vs segundo). Sem isso, `p_vitoria_a` do payload Edge Config vem semanticamente errado. Carry-over #1 da retro S03.
- [ ] **Migration: popular `historical_results.pct_validos`** — todos os 28k registros 2022 têm `pct_validos = NULL` (carga S01 inseriu só `votos`). SQL sugerido: `UPDATE historical_results SET pct_validos = votos::float / NULLIF(SUM(votos) OVER (PARTITION BY ano, turno, cargo, uf, cod_zona), 0)`. Carry-over #4.
- [x] **Spec 011 `app/sobre-o-modelo/` ativada** (`§ 8` da constituição) — hoje só `.gitkeep`. Bloqueia qualquer page de projeção em produção. Materializar spec 011 (mesmo MVP) antes de spec 003/004 chegarem ao usuário. Carry-over #7. _(F0.3 done — `app/sobre-o-modelo/page.tsx` Server Component, 3 SVGs inline NYT-style (swing/banda CI/agulha), 8 seções cobrindo RF-054. Spec mantida em `implementing` aguardando a11y-perf-auditor.)_
- [x] **`<ForecastTransparency />` em `components/blocks/`** — bloco "O que está movendo o forecast" exigido por `§ 8` em toda page com projeção. Bloqueia 003 e 004. Carry-over #8. _(F0.4 done — server component puro em `components/blocks/ForecastTransparency.tsx`, 6 unit tests verdes, RF-043 coberto.)_

**Carry-overs S03 — débito técnico (encaixar em paralelo)**:
- [ ] **Regenerar fixtures replay-2022 após fix do `pct_validos`** — `tests/fixtures/replay-2022/snapshots.json` foi corrigido inline pelo `model-validator` em T22 da S03; sha1 documentados em T21 estão stale. Pré-requisito pra re-rodar gate OT-4. Carry-over #2.
- [ ] **Resolver divergência K-1 spec ↔ código** — spec 002 § "Casos de borda" diz `computed=false` quando candidato sem mapping, mas orchestrator trata por-candidato (continue no loop interno, `computed=true`). Decidir: corrigir spec.md ou ajustar `_do_project`. Carry-over #3.
- [ ] **ADR retroativo para `botid`** (`§ 9` constituição — stack canônica) — dep adicionada na S01 sem ADR. Despachar `adr-author` com contexto: caso de uso (BotID proteção em `/api/*`), trade-off vs alternativa Vercel BotID nativo. Carry-over #6.
- [ ] **Marker em `ingest_log.notes`** — `tests/integration/ingest-cycle.test.ts:T19` (spec 001 shipped) espera count absoluto, fica flaky em forks paralelos quando outros integration tests inserem em `ingest_log`. Migrar para JSON com `test_run_id` e contar relativo. Alternativa: `--poolOptions.forks.singleFork=true` em vitest config (workaround mais barato). Carry-over #9.
- [x] **Next 16 deprecation: `middleware.ts → proxy.ts`** — F0.5 fechado 2026-05-17. `git mv middleware.ts proxy.ts`, função `middleware` → `proxy`, comment update em `app/api/_internal/edge-write/route.ts`. `pnpm typecheck` clean. Carry-over #19.

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
