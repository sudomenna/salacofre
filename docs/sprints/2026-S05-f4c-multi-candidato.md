---
id: 2026-S05
title: Sprint 05 — Foundation multi-candidato 1º turno presidencial
status: active
start: 2026-07-20
end: 2026-08-02
opened: 2026-05-17
phase: F4c
goal: Modelo, payload, tokens visuais e UI da home + UF presidencial 1T multi-candidato funcionais. Sem 2º turno e sem governadores ainda — esses entram em S06.
specs_in_flight: [003-home-nacional, 004-pagina-uf-presidencial, 011-sobre-o-modelo, 002-modelo-estatistico]
specs_planned_next: [005-pagina-uf-governador, 006-grid-governadores]
kickoff_decisions:
  - evolve-in-place-specs-003-004-status-evolving-changelog-v2
  - tres-sprints-S05-foundation-S06-2t-gov-S07-polish
  - K-1-fallback-3-tiers-partido-pesquisa-disable
  - governador-incluido-S06-nao-S05
  - transparencia-total-todos-candidatos-visiveis-3-camadas-sem-collapsible
  - brushing-spec-008-diferido-S08+
plan_aprovado: /Users/tiagomenna/.claude/plans/voc-falou-algo-relevante-misty-token.md
---

# Sprint 05 — Foundation multi-candidato 1º turno presidencial

## Objetivo único

Suportar **disputa multi-candidato** (11 candidatos em 2022) no modelo, payload e UI presidencial 1º turno — com **TODOS os candidatos visíveis sempre** (ADR-0017, transparência total em 3 camadas). Cobertura específica de governador e segundo turno **ficam para S06**. Brushing (spec 008) **diferido para S08+**.

Análise comparativa NYT (em sessão de 2026-05-17) expôs que a UI atual é binária top-2. Plan completo em [/Users/tiagomenna/.claude/plans/voc-falou-algo-relevante-misty-token.md](file:///Users/tiagomenna/.claude/plans/voc-falou-algo-relevante-misty-token.md).

## Decisões kickoff (registradas via AskUserQuestion 2026-05-17)

1. **Specs 003 e 004 ganham `## v2 — multi-candidato + 2T`** in-place (sem sub-specs). Status passa de `shipped` para `evolving` (novo status no vocabulário).
2. **3 sprints**: S05 foundation, S06 2T+Gov, S07 polish.
3. **K-1 fallback 3 tiers**: partido principal → pesquisa pré-eleitoral → disable (ADR-0015).
4. **Governador incluído em S06**, não nesta sprint.
5. **Transparência total** (ADR-0017): todos os candidatos com `pct_projetado ≥ 0.1%` visíveis sem clique, em 3 camadas (hero top-2, ranking top-3..6, lista compacta rank 7+).
6. **Brushing (spec 008) diferido para S08+** — sai do escopo F4.

## Specs in-flight

- [ ] **003-home-nacional** — evolução v2 multi-candidato. RFs herdados + novos RF-030.7..030.9 (P(2T), cenários 2T, ranking multi-camada).
- [ ] **004-pagina-uf-presidencial** — evolução v2 multi-candidato em 1T. `<CandidateRow />` lista TODOS visíveis.
- [ ] **011-sobre-o-modelo** — adicionar seção sobre `p_segundo_turno_overall`, `cenarios_2t`, `p_passa_2t` (transparência § 8).
- [ ] **002-modelo-estatistico** — gate OT-4 segue em `implementing` (aguardando simulado oficial), mas ganha 3 funções novas + K-1 3-tier.

## Chores fora de spec / ADRs novos

- [ ] **ADR-0012** — Chaves nomeadas no Edge Config (`projection:current:pres:t1` etc.) + alias dinâmico.
- [ ] **ADR-0013** — Tokens visuais por rank (`--color-cand-1..6`), não por partido. Color lock em 1% apurado.
- [ ] **ADR-0014** — `p_segundo_turno_overall`, `cenarios_2t`, `p_passa_2t`, `p_fecha_1t` como métricas de primeira classe.
- [ ] **ADR-0015** — K-1 fallback 3-tier.
- [ ] **ADR-0017** — Transparência total: TODOS os candidatos visíveis em 3 camadas (sem collapsible).
- [ ] Migration: `projections.model_fallback_tier smallint` + `projections.cenario_2t_json jsonb`.

## Despachos sugeridos

- **`spec-implementer`** — orquestra refator do modelo + tipos TS + componentes UI.
- **`adr-author`** — escreve as 5 ADRs novas.
- **`model-validator`** — replay 1T 2022 estendido para validar `p_passa_2t` contra ground-truth 11 candidatos (gate técnico secundário, não OT-4).
- **`a11y-perf-auditor`** — atenção especial a contraste dos 6 tokens novos + viewport 375px com 11 candidatos visíveis.
- **`constitution-guard`** — paleta NYT-like neutra (§ 2), pesquisa pré-eleitoral OK (§ 5 não é LLM), append-only (§ 10).
- **`rf-coverage-checker`** — antes do shipped final.
- **`spec-syncer`** — propaga `evolving` para specs 003+004.

## Definition of Done

- ✅ `EdgeCandidate`, `EdgeNational`, `EdgePayloadUf` estendidos com campos novos (rank, p_passa_2t, p_fecha_1t, p_segundo_turno_overall, cenarios_2t, top_candidatos, vai_a_2t, bucket).
- ✅ 3 funções novas em `api/model/project.py` (`compute_two_round_scenarios`, `compute_p_passa_2t`, `compute_p_fecha_1t`) + K-1 3-tier em `api/model/swing.py`.
- ✅ Tokens `--color-cand-1..6` + `--color-cand-band-1..6` + `--color-cand-other` em `app/globals.css`. `--color-pt` / `--color-pl` viram aliases.
- ✅ Helper `lib/utils/cand-color.ts` + calendar `lib/config/calendar.ts`.
- ✅ Componentes novos: `<TurnoBadge>`, `<TwoRoundIndicator>`, `<CandidateRanking>` (camada 2), `<MinorCandidatesList>` (camada 3 visível), `<RaceTypeIndicator>`.
- ✅ Refator: `<HeadlineScore mode="multi-1t">`, `<NationalNeedle variant="national-1t">`, `<NationalChoroplethMap>` N-way, `<DecisiveUFsGrid>` paleta dinâmica, `<StateGroupedTable>` N-way em 1T, `<CandidateRow>` em UF lista todos visíveis.
- ✅ `app/page.tsx` + `app/uf/[sigla]/page.tsx` mode-aware via `payload.turno`.
- ✅ `pnpm typecheck && pnpm lint && pnpm test` verde. `pytest tests/unit/model/` cobre 3 funções novas + K-1 3-tier (mínimo 4 testes novos).
- ✅ `pnpm build` ainda 33+ páginas; chunk MapLibre não regrediu (paleta N-way não agrava — 1 cor por UF).
- ✅ Smoke `pnpm dev`: home exibe TODOS os 11 candidatos do fixture sem clicks (camada 1 hero + camada 2 ranking + camada 3 lista compacta); paleta neutra 6 cores; `<TwoRoundIndicator />` renderiza com P(2T); mapa pintado N-way.
- ✅ Viewport 375px: layout multi-candidato continua legível.
- ✅ Specs 003 + 004 com `## v2` documentado; spec 011 com novas métricas; 5 ADRs escritas.
- ✅ Replay 1T 2022 estendido — `model-validator` confirma `p_passa_2t` razoável vs ground-truth.

## Riscos da sprint

- **UI density com 11+ candidatos visíveis sempre** (ADR-0017): mobile pode ficar lista vertical longa. Mitigação: camada 3 em linha única horizontal compacta.
- **`p_segundo_turno_overall` threshold de exibição**: se P=0.51, parece trivial. Sugestão: só renderizar `<TwoRoundIndicator />` quando `|P − 0.5| > 0.1`.
- **K-1 tier 2 (pesquisa)** depende de fonte licenciada/citável — checar com owner antes da implementação.
- **Color lock em 1% apurado** depende de prior — decisão: último Datafolha D-7, documentado em footer.
- **Bundle MapLibre 287KB** (carry-over S04) — paleta N-way não agrava, mas precisa de ADR pra atualizar RNF-007b → 300KB.
- **Replay 2022 11 candidatos** — harness atual só valida top-2; estender ~6h.

## Replanejamentos mid-sprint

_(preencher se mudar)_

## Retrospective (preencher ao fechar)

- O que funcionou:
- O que melhorar:
- Carry-over pra S06:

## Cross-refs

- Sprint anterior: [2026-S04-f4a-home-uf.md](./2026-S04-f4a-home-uf.md)
- Próxima sprint: [2026-S06-f5-completo.md](./2026-S06-f5-completo.md) (a renomear/reorientar pra "F4d 2T + Governadores" quando abrir)
- Plan: [/Users/tiagomenna/.claude/plans/voc-falou-algo-relevante-misty-token.md](file:///Users/tiagomenna/.claude/plans/voc-falou-algo-relevante-misty-token.md)
- Spec 003: [../specs/003-home-nacional/](../specs/003-home-nacional/)
- Spec 004: [../specs/004-pagina-uf-presidencial/](../specs/004-pagina-uf-presidencial/)
- Spec 011: [../specs/011-sobre-o-modelo/](../specs/011-sobre-o-modelo/)
- Brushing (spec 008) — diferido pra S08+
