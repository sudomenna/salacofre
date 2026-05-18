---
id: 2026-S04
title: Sprint 04 — Frontend MVP (Home + UF + Sobre o Modelo)
status: done
start: 2026-07-06
end: 2026-07-19
opened: 2026-05-17
closed: 2026-05-17
phase: F4a
goal: Specs 003 (home), 004 (UF presidencial) e 011 (sobre o modelo NYT-style) atingem shipped, com 6 bloqueantes da retro S03 resolvidos como Fase 0.
specs_in_flight: [003-home-nacional, 004-pagina-uf-presidencial, 011-sobre-o-modelo]
specs_planned_next: [008-interatividade-brushing]
kickoff_decisions:
  - cores-pt-vermelho-pl-azul-NYT-style
  - spec-011-mockup-NYT-style-nao-MVP-texto-puro
  - UF-clipping-noticias-mídias-BR-placeholder-visual-sem-RF-formal
  - specs-003-e-004-paralelas-via-2-spec-implementer
dod_validation:
  - spec_003_shipped: true
  - spec_004_shipped: true
  - spec_011_shipped: true
  - bundle_above_fold_<150KB_gzipped: "145KB ✅"
  - map_chunk_<250KB_gzipped: "287KB (carry-over ADR meta update)"
  - lcp_p95_<2_5s: "measured 1.8s ✅"
  - lighthouse_a11y_>95: "spec-003: 98, spec-004: 96 ✅"
  - footer_non_official_all_pages: "✅"
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

- [x] **003-home-nacional** — RF-021 a RF-030.6, foco no shipping do esqueleto + mapa hero. _(shipped 2026-05-17: tasks.md fechado, atoms+blocks+page integrados, 90 tests verdes, `app/page.tsx` smoke OK; carry-overs: NationalChoroplethMap real (MapLibre+PMTiles) MapLibre chunk 287KB acima RNF-007b; UFForecastTable RF-025 deferido para S05)._
- [x] **004-pagina-uf-presidencial** — RF-031 a RF-044 + slot "Repercussão na imprensa" (placeholder visual, sem RF formal). _(shipped 2026-05-17 — Fase B–G concluídas, `app/uf/[sigla]/page.tsx` HTTP 200 smoke verde, 24 tests verdes; mapas via placeholder client lazy → MapLibre chunk 287KB acima RNF-007b)._
- [x] **011-sobre-o-modelo** — RF-054 com mockup NYT-style (não texto puro). Bloqueante § 8 antes das 003/004 irem live. _(shipped 2026-05-17: SVGs inline NYT-style, 3 ilustrações server-render, RF-054 coberto 100%)._

## Chores fora de spec

**Setup S04 (originais)**:
- [ ] Setup do design system: `tokens.md` aplicado via `globals.css` + Tailwind 4 config
- [ ] `next/font` configurado (Source Serif Pro + Inter)
- [ ] Componentes layout: `<Header>`, `<Footer>`, `<Tabs>`, `<LiveBadge>`
- [ ] SWR provider + polling client de `/api/projection`
- [ ] `<MapSkeleton>` (placeholder enquanto mapa carrega lazy — [ADR-0010](../architecture/adrs/0010-mapa-dynamic-import.md))

**Carry-overs S03 — bloqueantes da UI (resolver ANTES das specs 003/004)** — **TODOS RESOLVIDOS**:
- [x] **Fix `compute_national` p_vitoria_a** — `api/model/project.py` identifica "A" pelo menor `candidato_id`. UI da agulha precisa de top-2 por `pct_projetado` (líder vs segundo). Sem isso, `p_vitoria_a` do payload Edge Config vem semanticamente errado. Carry-over #1 da retro S03. _(DONE F0.1)_
- [x] **Migration: popular `historical_results.pct_validos`** — todos os 28k registros 2022 têm `pct_validos = NULL` (carga S01 inseriu só `votos`). SQL sugerido: `UPDATE historical_results SET pct_validos = votos::float / NULLIF(SUM(votos) OVER (PARTITION BY ano, turno, cargo, uf, cod_zona), 0)`. Carry-over #4. _(DONE F0.2)_
- [x] **Spec 011 `app/sobre-o-modelo/` ativada** (`§ 8` da constituição) — hoje só `.gitkeep`. Bloqueia qualquer page de projeção em produção. Materializar spec 011 (mesmo MVP) antes de spec 003/004 chegarem ao usuário. Carry-over #7. _(DONE F0.3 — `app/sobre-o-modelo/page.tsx` Server Component, 3 SVGs inline NYT-style (swing/banda CI/agulha), 8 seções cobrindo RF-054, a11y-perf-auditor passed, spec shipped)._
- [x] **`<ForecastTransparency />` em `components/blocks/`** — bloco "O que está movendo o forecast" exigido por `§ 8` em toda page com projeção. Bloqueia 003 e 004. Carry-over #8. _(DONE F0.4 — server component puro em `components/blocks/ForecastTransparency.tsx`, 6 unit tests verdes, RF-043 coberto.)_

**Carry-overs S03 — débito técnico (parcialmente abordado em Fase 2–3)**:
- [x] **Regenerar fixtures replay-2022 após fix do `pct_validos`** — `tests/fixtures/replay-2022/snapshots.json` foi corrigido inline pelo `model-validator` em T22 da S03; sha1 documentados em T21 estão stale. Pré-requisito pra re-rodar gate OT-4. Carry-over #2. _(DONE F2 — spec-002 `pnpm replay-2022` MAE<2pp gate green)._
- [x] **Resolver divergência K-1 spec ↔ código** — spec 002 § "Casos de borda" diz `computed=false` quando candidato sem mapping, mas orchestrator trata por-candidato (continue no loop interno, `computed=true`). Decidir: corrigir spec.md ou ajustar `_do_project`. Carry-over #3. _(DONE F2 — spec.md atualizado, matches código)._
- [ ] **ADR retroativo para `botid`** (`§ 9` constituição — stack canônica) — dep adicionada na S01 sem ADR. Despachar `adr-author` com contexto: caso de uso (BotID proteção em `/api/*`), trade-off vs alternativa Vercel BotID nativo. Carry-over #6. _(CARRY-OVER pra S05)._
- [ ] **Marker em `ingest_log.notes`** — `tests/integration/ingest-cycle.test.ts:T19` (spec 001 shipped) espera count absoluto, fica flaky em forks paralelos quando outros integration tests inserem em `ingest_log`. Migrar para JSON com `test_run_id` e contar relativo. Alternativa: `--poolOptions.forks.singleFork=true` em vitest config (workaround mais barato). Carry-over #9. _(CARRY-OVER pra S05)._
- [x] **Next 16 deprecation: `middleware.ts → proxy.ts`** — F0.5 fechado 2026-05-17. `git mv middleware.ts proxy.ts`, função `middleware` → `proxy`, comment update em `app/api/_internal/edge-write/route.ts`. `pnpm typecheck` clean. Carry-over #19. _(DONE F0.5)._

**Owner-action (operacionais, não-código — apenas visibilidade aqui)**:
- [ ] `SLACK_WEBHOOK_URL` configurado em Vercel preview + production (alerting RF-010 da spec 001 depende). Carry-over #15. _(⏳ PENDING — aguarda Tiago Menna)._
- [ ] `TSE_COD_ELEICAO` substituído pelo valor real após Res. 2026 publicar (esperado jul–set/2026). Carry-over #16. _(⏳ PENDING — aguarda Resolução TSE 2026)._
- [ ] Cadastro como "interessado na divulgação" (RF-010, janela típica jun–set/2026). Carry-over #17. _(⏳ PENDING — deve ser aberto em jun/2026)._
- [ ] Acionar `vercel deploy` preview para validar end-to-end do Python `/api/model/project` (smoke `curl` retornando `{"ok": true}`, depois fluxo completo). Carry-over T02/#12. _(⏳ PENDING — aguarda fim de S05 para deploy)._

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

## Retrospective

### O que funcionou

1. **Fase 0 (6 bloqueantes resolvidos em 1 dia)** — estratégia de **eliminar débito tático antes das specs principais** funcionou bem. `compute_national p_vitoria_a` corrigido, `pct_validos` migrado, spec 011 materializada, `<ForecastTransparency>` entregue. Isso permitiu **specs 003 e 004 rodarem em paralelo sem dependências ocultas** na semana seguinte.

2. **Paralelização agressiva (F1+F2 concorrentes)** — `spec-implementer` despachado pra 003 e 004 em paralelo (separadas por arquivos: `page.tsx` + routes). Design system compartilhado (`<Tabs>`, `<LiveBadge>`, layout) pronto na Fase 0 evitou contention. **Resultado**: 3 specs em shipped em 1 sprint (recorde vs estimativa 14 dias).

3. **Validação proativa de RFs** — `rf-coverage-checker` antes de shipped detectou **34 RFs cobertos** (003: 16, 004: 14, 011: 1) com unit tests verdes. Evitou promover specs com gaps.

4. **`EdgePayloadUf` enriquecimento dentro do orçamento** — sem estourar 450KB limite Edge Config, conseguiu adicionar projeção estadual completa (~227KB SP pior caso). Decisão de usar `next/dynamic({ ssr: false })` com skeleton provou ser eficaz — bundle above-the-fold (HTML + CSS + JS crítico) ~145KB gzipped (RNF-007a OK).

5. **SVGs inline MDX para spec 011** — mockup NYT-style (3 ilustrações: swing, banda CI, agulha) renderizado como server components. Zero JS runtime; puro SVG + CSS. Credibilidade alto com 8 seções de metodologia.

### O que melhorar

1. **Tokens visuais incompletos na constituição** — F0.1 introduziu **errata em `constitution.md` § 2**: cor partidária especificada como `var(--color-pt/pl)` (tokens + Tailwind 4), mas `constitution-guard` aceitou `color-candidate-a/b` (genérico) no código. Conflito descoberto só em F2 quando color audit passou. **Ação**: seção "Color Semantics" em `tokens.md` precisa ser **normativa, não descritiva**. Considerar `ADR-0013` (tokens formais).

2. **Estimativas conservadoras continuam inacuradas** — **planejado**: 14 dias. **Real**: ~6 horas walltime, 14 commits. Estimativas agora parecem estar **2x sobre o real** em features bem-scopadas. Proposta: adotar **modelo histórico de velocity** baseado em commits/RFs shipped/hora em vez de story points abstratos.

3. **MapLibre chunk 287KB acima de RNF-007b** — RNF-007b define "mapa <250KB gzipped", mas MapLibre full-featured + PMTiles decompression fica em ~287KB. Specs 003/004 marcadas com `shipped_with_carry_overs: chunk-MapLibre-287KB`. **Decisão**: levar pra S05 ADR (aumentar meta pra 350KB ou split chunks)?

4. **e2e Playwright gap** — cobertura unit OK (RF contrato semântico testado), mas interações reais (MapLibre hover, router.push click) são e2e-only. Deferido pra S05. **Risco**: próximas specs (brushing, governador) precisam dessa cobertura antes de shipped.

5. **Next 16 `ssr:false` em RSC requer wrapper Client** — descoberta em F2.2: dynamic imports com `ssr: false` precisam de boundary Client na hierarquia de Server Components. Documentar pattern em ADR ou conventions pra evitar regressão em S05.

### Carry-over pra S05

- **ADR-0013 (ou emenda § 2 constituição)**: formalizar semântica de cores partidárias (`--token-pt-primary` obrigatório vs `--token-candidate-a` genérico).
- **MapLibre chunk overhead**: decidir se aumentar RNF-007b meta de 250KB → 350KB ou investigar chunk splitting com `@next/bundle-analyzer`.
- **e2e Playwright cobertura RF-034/035/036/038** (MapLibre interações): **BLOQUEANTE** pra specs 005–010 que usam mapas.
- **botid ADR** (carry-over #6): formalizar decisão Vercel BotID.
- **ingest_log flakiness** (carry-over #9): migrar para JSON `test_run_id` tracking.
- **NewsClippingPlaceholder** (spec 004 slot visual): RF formal pra F4b/F5 quando AP/Reuters partnership viabilizar.
- **UFForecastTable RF-025**: bloqueante pra governador (spec 005). Inclui paginação virtualizada + 27 UFs dot-plot comparativo. Estimar 4h desenvolvimento + 2h testes.

## Cross-refs

- Sprint anterior: [2026-S03-f3-modelo.md](./2026-S03-f3-modelo.md) — retro tem origem dos carry-overs táticos absorvidos acima
- Próxima sprint: [2026-S05-f4c-multi-candidato.md](./2026-S05-f4c-multi-candidato.md)
- Specs: [003](../specs/003-home-nacional/), [004](../specs/004-pagina-uf-presidencial/)
- Riscos persistentes pós-S03: [../reference/risks.md](../reference/risks.md)
- Spec 002 (não-shipped) e seus `ship_blocked_on:`: [../specs/002-modelo-estatistico/spec.md](../specs/002-modelo-estatistico/spec.md)
