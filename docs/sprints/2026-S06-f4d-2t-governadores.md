---
id: 2026-S06
title: Sprint 06 — F4d 2º turno + Governadores V2 (NYT-style)
status: active
start: 2026-08-03
end: 2026-08-16
opened: 2026-05-18
phase: F4d
goal: 2º turno presidencial binário ativado + Governadores 27 corridas (grid + UF) com componentes NYT-style (HexCartogramBrasil, MunicipioWaffleGrid, mesorregião, RaceStatsCards, BreakingNewsTicker). Specs 005+006 shipped. Print 2 (drill-down município) e Boca de urna explicitamente diferidos → specs 014/015.
specs_in_flight: [005-pagina-uf-governador, 006-grid-governadores]
specs_planned_next: [009-compartilhamento-meta, 010-operacao-monitoramento, 012-dashboard-status, 013-pagina-manutencao]
specs_deferred:
  - 014-boca-de-urna (pós-D1; nova fonte de dados + decisão legal)
  - 015-drill-down-municipio (pós-D1; EdgePayloadMunicipio + queries por zona)
kickoff_decisions:
  - escopo-expandido-3-prints-NYT-style-recebidos-2026-05-18
  - GovernorCard-layout-b-lider+P(2T)+top3-compacto
  - hex-cartogram-SVG-inline-paths-hardcoded-sem-D3-hexbin
  - tabs-Senado-Cong-Assembleias-grayed-out-tooltip-disponivel-em-breve
  - print-2-diferido-spec-015-drill-down-municipio
  - boca-de-urna-diferido-spec-014
  - specs-005-006-hidratar-in-place-draft-ready-shipped
  - K-1-tier-2-pesquisa-stub-pre-election-polls-decisao-owner
plan_aprovado: memória s06_kickoff_plan.md (originSessionId 468caab1-9b08-46a8-b2a5-d866b933b0d6)
---

# Sprint 06 — F4d 2º turno + Governadores V2

## Objetivo único

Encerrar as duas frentes que faltam do v1 com qualidade NYT-style:

1. **2º turno presidencial binário** ativado (já tem fundação na S05 — só hidratar `<TurnoOneRecap />`, remover `<TwoRoundIndicator />`, ativar `<NationalWinnerBanner />`).
2. **Governadores 27 corridas** — grid `/governador` com `<HexCartogramBrasil>` + `<GovernorCard>` + `<RaceStatsCards>` + `<BreakingNewsTicker>` e drill-down `/uf/[sigla]/governador` com `<MunicipioWaffleGrid>` + apuração por mesorregião + maiores municípios.

Após esta sprint, **5 das 7 telas v1** estão materializadas (T-01, T-02, T-03, T-04, T-06). Restam T-07 (`/_status`) e T-08 (`/manutencao`) pra S07.

**Print 2 (drill-down município) e boca-de-urna/demographic explicitamente diferidos** — viram specs 014 (boca-de-urna) e 015 (drill-down município), pós-D1.

## Decisões kickoff (registradas via AskUserQuestion 2026-05-18)

Usuário enviou 3 prints NYT-style (The Upshot) como referência visual. Mapeamento e decisões fechadas:

1. **`<GovernorCard />` layout = opção (b)**: líder + P(2T) + lista compacta top-3 abaixo. Fallback mobile: single-line "SP · Tarcísio (REP) líder · ELEITO".
2. **Hex-cartogram = SVG inline** com paths hardcoded em `lib/data/uf-hex-layout.ts` (sem D3-hexbin — preserva bundle).
3. **Senado / Congresso / Assembleias = tabs grayed-out + tooltip "Disponível em breve"** (sinaliza roadmap, não esconde).
4. **Print 2 (drill-down município) DIFERIDO** → cria stub spec 015 reservando slot mental.
5. **Boca de urna / demographic DIFERIDO** → cria stub spec 014. Decisão legal sobre licenciamento Datafolha pós-urna.
6. **Specs 005 e 006**: hidratar in-place (draft → ready → shipped direto, sem ADR formal).
7. **K-1 Tier 2 fonte de pesquisa**: continua stub `api/model/pre_election_polls.py` — owner decide fonte real antes da promoção final.
8. **`<BreakingNewsTicker />` respeita `prefers-reduced-motion`** (sem rotação automática em reduce; empilha verticalmente).

## Specs in-flight

- [ ] **005-pagina-uf-governador** — herda 70% da 004, troca cargo + paleta multi-partido por UF + K-1 disclaimer + `<MunicipioWaffleGrid>` + apuração por mesorregião. Detalhes: [spec.md](../specs/005-pagina-uf-governador/spec.md).
- [ ] **006-grid-governadores** — grid `/governador` com `<HexCartogramBrasil>` + `<GovernorCard>` + `<RaceStatsCards>` + `<BreakingNewsTicker>`. Detalhes: [spec.md](../specs/006-grid-governadores/spec.md).

## Stubs criados (slot reservado)

- [ ] **014-boca-de-urna** (`draft` stub, pós-D1)
- [ ] **015-drill-down-municipio** (`draft` stub, pós-D1)

## Chores fora de spec / ADRs novos

- [ ] **ADR-0016** — `<TurnoOneRecap>` placement no 2º turno (header acima do hero, sem widget de probabilidade 1T).
- [ ] **Migration `data-pipeline/migrations/0005_municipios_mesorregiao.ts`** — adiciona `municipios.mesorregiao_ibge` + popula via IBGE shapefile. Tabela alternativa: `mesorregioes(cod_ibge_meso, nome, uf)` com FK.
- [ ] Conteúdo MDX da página `/sobre-o-modelo` revisado (constituição § 8) — carry-over S05 ainda válido.

## Plano S06 V2 — 6 fases (~85-95h estimado, comprime via subagents)

### Fase 1 — Componentes 2º turno (~17h)

- **`<RunoffScenarios />`** (block) — top-3 cenários 2T (consome `national.cenarios_2t` da S05). Só renderiza em 1T tardio quando `p_segundo_turno_overall >= 0.4`.
- **`<TurnoOneRecap />`** (block) — placar final 1T no topo da home 2T (ADR-0016). Lê `projection:archive:pres:t1`.
- **`<NationalWinnerBanner />`** (block) — análogo a `<WinnerBanner>` UF mas pro nacional. Aparece em `p_vitoria_final >= 0.99` ou apuração >= 99%.
- **Refator `<HeadlineScore mode="binary">`** — `<TurnoOneRecap>` acima do hero, sem `<TwoRoundIndicator>`.

### Fase 2 — Mesorregião (~10h)

- **Migration `0005_municipios_mesorregiao.ts`** — `municipios.mesorregiao_ibge char(40)` populado via join IBGE shapefile (em `docs/ibge-2022/`).
- **`api/model/project.py`** — novo helper `aggregate_by_mesorregiao(ufRow, municipios)` retornando `{nome, pct_apurado, lider, margem, delta_vs_2022}` por mesorregião.
- **`lib/edge-config/types.ts`** — `EdgePayloadUf.mesorregioes?: Array<EdgeMesorregiao>` (opcional pra forward-compat).

### Fase 3 — Componentes Governador (~30h)

**Novos (5)**:
- **`<GovernorCard />`** (`components/blocks/GovernorCard.tsx`) — card individual UF na grid. Layout opção (b): título UF + apurado% no header, top-3 candidatos com barra colorida via `colorForRank()`, badge ● ELEITO/VAI A 2T/EM APURAÇÃO. Props: `{ uf: EdgeUfRow; mode: "compact" | "expanded"; bucket: "decidido_1t" | "vai_2t" | "indefinido" | "chamado" }`.
- **`<HexCartogramBrasil />`** (`components/blocks/HexCartogramBrasil.tsx`) — SVG inline com 27 hexágonos posicionados em layout fixo NYT-like (dataset `lib/data/uf-hex-layout.ts`). Pintado por bucket/líder via `colorForRank()`. Hover/click → drill-down `/uf/[sigla]/governador`. Label inline `SP REP`, `RJ PL` etc.
- **`<RaceStatsCards />`** (`components/blocks/RaceStatsCards.tsx`) — 3 cards lado-a-lado: "Eleitos no 1º turno: N / Em 2º turno: M / Em apuração: K". Agrega `EdgeUfRow.bucket` de todas 27 UFs.
- **`<BreakingNewsTicker />`** (`components/blocks/BreakingNewsTicker.tsx`) — banner rotativo no topo com chamadas (`bucket === "chamado"` recentes). Auto-rotaciona 5s; respeita `prefers-reduced-motion`.
- **`<MunicipioWaffleGrid />`** (`components/blocks/MunicipioWaffleGrid.tsx`) — waffle chart N municípios da UF (Print 3). Cada quadrado = 1 município, colorido por líder via `colorForRank()`. Tooltip on hover. Legend: "Lula · 246 mun." etc. Props: `{ municipios: EdgeUfMunicipio[]; candidatos: EdgeCandidate[] }`.

**Refator (2)**:
- **`<MunicipioTable />`** — adicionar modo `"top-by-eleitorado"` (top-N por eleitorado + coluna delta vs 2022). Inspirado nos "Maiores municípios de SP" do Print 3.
- **`<Tabs />`** — adicionar prop `disabled?: boolean` por `TabOption`. Renderiza grayed-out + tooltip "Disponível em breve" (Senado/Cong/Assembleias).

### Fase 4 — Páginas (~22h)

**Novas**:
- **`app/governador/page.tsx`** — grid 27 cards `<GovernorCard />` + filtros (`Todas | Em disputa | Decididos 1T | Vão a 2T | Chamadas`) + cabeçalho `<RaceStatsCards />` + `<BreakingNewsTicker />` + `<HexCartogramBrasil />` como view alternativa.
- **`app/uf/[sigla]/governador/page.tsx`** — herda `/uf/[sigla]/page.tsx`. K-1 disclaimer quando `model_fallback_tier >= 2`. Inclui `<MunicipioWaffleGrid />` + apuração por mesorregião + maiores municípios.

**Refator existentes**:
- **`app/page.tsx`** — ativa mode 2T (já tem dispatch S05 — só hidratar `<TurnoOneRecap />` e remover `<TwoRoundIndicator />` em 2T).
- **`app/uf/[sigla]/page.tsx`** — idem ativação 2T.

### Fase 5 — Carry-overs S05 + Tests (~15h)

- **aria-describedby map ↔ StateGroupedTable** (constitution P3 MEDIUM S05)
- **`--color-cand-4-strong` variant** (a11y antecipativo)
- **`replay_batch.py`** serializar `p_passa_2t`, `p_fecha_1t`, `p_segundo_turno_overall` no report.json
- **Fix `computeCalibration` em `scripts/replay-2022.ts:329`** (usa `candidatos[0]` por id, deveria usar `candidato_a_id` semântico)
- **Fix `_NationalChoroplethMapImpl.tsx` useRouter SSR regression** (13 tests falhando em `tests/integration/home-page.test.tsx` — `useRouter` chamado em SSR via vitest sem provider de App Router. Solução: mover hook pra Client wrapper OU mockar router em setup do vitest). Descoberto S06 mas pré-existente S05.
- **Spec 013 manutenção** entre 1T e 2T (~3h)
- **Replay 2T 2022 + replay 1T estendido** (~10h, model-validator)
- **CSV mesorregião IBGE 2022** — migration 0005 deixou schema mas não populou (CSV não está no repo). Bloqueante pra exibição real do bloco "Apuração por mesorregião" em `/uf/[sigla]/governador`. UI degrade gracioso (esconde se vazio). Owner: pull `RELATORIO_DTB_BRASIL_MUNICIPIO_2022.xls` do IBGE FTP, converter pra CSV, commitar em `docs/ibge-2022/municipios-mesorregiao.csv`, re-rodar `pnpm tsx data-pipeline/migrations/0005_municipios_mesorregiao.ts`.

### Fase 6 — Gates (~5h paralelos)

- `constitution-guard` — atenção pra grayed-out tabs (sem informação política), paleta multi-partido nos GovernorCards
- `a11y-perf-auditor` — bundle dos componentes novos, contraste, viewport mobile 375px com waffle grid
- `rf-coverage-checker` — 005, 006 + RFs de bucket/mesorregião
- `model-validator` — replay 1T 11 cands ainda OK + replay 2T 2022 PASS
- `spec-syncer` — propaga shipped 005+006

## Despachos sugeridos (paralelizáveis)

- **`spec-implementer` × 2 em paralelo** — Fase 1 (componentes 2T) + Fase 2 (mesorregião Python+migration) simultâneos.
- **`spec-implementer` × 1** — Fase 3 (componentes Gov, depende parcial da Fase 2 pra `<MunicipioWaffleGrid>`).
- **`spec-implementer` × 1** — Fase 4 (pages, depende das Fases 1+3).
- **`adr-author`** — escreve ADR-0016 (`<TurnoOneRecap>` placement).
- **`model-validator`** — replay 2T 2022 + replay 1T estendido.
- **`a11y-perf-auditor`** — atenção viewport 375px com waffle grid (~645 quadrados em SP).
- **`constitution-guard`** — tabs grayed-out + paleta multi-partido + § 2.
- **`rf-coverage-checker`** — antes do shipped final.
- **`spec-syncer`** — propaga shipped 005+006.

## Definition of Done

- ✅ Specs 005 e 006 com `status: shipped`
- ✅ Stubs 014 + 015 criados em `draft` com cross-refs corretas
- ✅ Rotas novas: `/governador`, `/uf/[sigla]/governador`
- ✅ Ativação 2T em `/` e `/uf/[sigla]/` (componentes da Fase 1 hidratados)
- ✅ Componentes novos: `<RunoffScenarios>`, `<TurnoOneRecap>`, `<NationalWinnerBanner>`, `<GovernorCard>`, `<HexCartogramBrasil>`, `<RaceStatsCards>`, `<BreakingNewsTicker>`, `<MunicipioWaffleGrid>`
- ✅ Refators: `<HeadlineScore mode="binary">`, `<MunicipioTable mode="top-by-eleitorado">`, `<Tabs disabled>`
- ✅ Migration 0005 (mesorregião) idempotente aplicada Neon
- ✅ Agregador Python `aggregate_by_mesorregiao` + pytest cobrindo
- ✅ Bundle das novas rotas respeita RNF-007a/b/c (ou regressão documentada em ADR atualizando target)
- ✅ Tabs Senado/Congresso/Assembleias grayed-out + tooltip (visual + a11y aria-disabled)
- ✅ `pnpm typecheck && pnpm lint && pnpm test` verde. pytest cobre `aggregate_by_mesorregiao` + edge cases.
- ✅ Smoke `pnpm dev`:
  - `/governador` exibe `<HexCartogramBrasil>` + 27 cards `<GovernorCard>` + `<RaceStatsCards>` + `<BreakingNewsTicker>` rotativo
  - `/uf/SP/governador` exibe waffle grid 645 municípios + apuração por mesorregião + maiores municípios
  - `/` em mode 2T exibe `<TurnoOneRecap>` no topo + `<NationalWinnerBanner>` quando aplicável
- ✅ Viewport 375px: `<GovernorCard>` vira single-line; waffle grid scroll horizontal ou downsample
- ✅ Replay 2T 2022 PASS + replay 1T 11 cands ainda PASS (model-validator)
- ✅ K-1 disclaimer visível em UFs com candidato gov tier 2/3
- ✅ ADR-0016 escrita

## Não-objetivos

- **Drill-down até zona eleitoral** — diferido pra v2 (decisão produto 2026-05-17, mantida)
- **Print 2 inteiro** (drill-down município) — diferido pra spec 015 (pós-D1)
- **Boca-de-urna / demographic data** — diferido pra spec 014 (pós-D1)
- **Senado / Congresso / Assembleias** — tabs grayed-out na S06; specs dedicadas pós-D1
- **Compartilhamento** (OG image, share buttons) — S07
- **Dashboard `/_status`** — S07
- **Página de manutenção** — S07 (exceto stub spec 013 nesta sprint)
- **Load test** — S07
- **Brushing & linking** (spec 008) — diferido S08+ (decisão S05)

## Riscos da sprint

- **Atribuição partidária 2022→2026 pra governadores** — partidos novos, fusões, candidatos sem histórico. Disclaimer obrigatório (constituição § 2). K-1 3-tier (ADR-0015) cobre.
- **Origem das "chamadas" do `<BreakingNewsTicker />`** — payload Edge atual não tem stream de eventos timestamped. Decisão na Fase 1: adicionar `EdgeNational.chamadas_recentes: Array<{ts, texto}>` populado pelo orchestrator quando UF muda `bucket` para `chamado` (opção (a) — explícito + auditável).
- **Mesorregião — fonte do dado IBGE** — shapefile IBGE 2022 tem `NM_MESO` por município. Decisão Fase 2: job `data-pipeline/import-mesorregioes.ts` + tabela `mesorregioes(cod_ibge_meso, nome, uf)`.
- **Bundle MapLibre 287KB** (carry-over S04) — não regride na S06; ADR pra 300KB ainda S07.
- **Waffle grid 645 quadrados** — performance + scroll mobile. Mitigação: agrupar municípios pequenos (`< 5k eleitorado`) ou downsample.
- **Hex-cartogram SVG inline 27 hexágonos** — manter sob 5KB gz (paths simples).
- **Tabs grayed-out** sinaliza roadmap mas pode confundir usuário — tooltip claro "Disponível em breve" + aria-disabled.

## Replanejamentos mid-sprint

_(preencher se mudar)_

## Retrospective (preencher ao fechar)

- O que funcionou:
- O que melhorar:
- Carry-over pra S07:

## Cross-refs

- Sprint anterior: [2026-S05-f4c-multi-candidato.md](./2026-S05-f4c-multi-candidato.md)
- Próxima sprint: [2026-S07-f6-hardening.md](./2026-S07-f6-hardening.md)
- Plan aprovado: memória `s06_kickoff_plan.md` (originSessionId 468caab1-9b08-46a8-b2a5-d866b933b0d6)
- Specs ativas: [005](../specs/005-pagina-uf-governador/), [006](../specs/006-grid-governadores/)
- Specs stub criados: [014](../specs/014-boca-de-urna/), [015](../specs/015-drill-down-municipio/)
- Specs evolving da S05 (mantém shipped, ativações 2T herdam): [003](../specs/003-home-nacional/), [004](../specs/004-pagina-uf-presidencial/)
