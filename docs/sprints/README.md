# Sprints — SalaCofre

Camada temporal entre o [roadmap macro](../product/roadmap.md) (fases F1–F8) e as [tasks por spec](../specs/) (granularidade fina).

## Princípio

**Sprints variáveis alinhadas às fases**, não cadência fixa. Cada sprint = 1 fase do roadmap (F4 é a única quebrada em 2 sprints porque 4 semanas é longo demais sem checkpoint).

## Cadência

| Item | Regra |
|---|---|
| **Tamanho** | 1–3 semanas, dependendo da fase. Não é fixo. |
| **Objetivo único** | Cada sprint tem **1 frase** de goal. Se cumpriu, sprint foi sucesso. |
| **Definition of Done** | Toda spec listada em `specs_in_flight:` atinge `status: shipped` passando nos 4 gates. |
| **Carry-over** | Tasks não-completadas viram primeira coisa da próxima sprint, sem renomear sprint. |
| **Cerimônias** | Planning = abrir o arquivo da sprint. Retro = preencher seção `## Retrospective` ao fechar. Daily = ad-hoc com o usuário, sem ritual. |
| **Replanejamento mid-sprint** | Permitido, mas registrado no próprio arquivo. |
| **Status válidos** | `planned`, `active`, `done`, `cancelled` |
| **Apenas 1 sprint `active`** por vez. |

## Cronograma — 10 sprints + 2 marcos

| Sprint | Fase | Período | Status | Goal |
|---|---|---|---|---|
| [S01](./2026-S01-f1-fundacao.md) | F1 | 18/mai → 07/jun (3 sem) | done | Infra Vercel + schema + históricos 2018/2022 + PMTiles |
| [S02](./2026-S02-f2-ingestao.md) | F2 | 08/jun → 21/jun (2 sem) | done | Pipeline TSE end-to-end shipped |
| [S03](./2026-S03-f3-modelo.md) | F3 | 22/jun → 05/jul (2 sem) | done | Modelo estatístico (Caminho C) — `implementing` até simulado oficial |
| [S04](./2026-S04-f4a-home-uf.md) | F4a | 06/jul → 19/jul (2 sem) | done | Home + UF + Sobre-o-modelo (T-01, T-03, T-06) |
| [S05](./2026-S05-f4c-multi-candidato.md) | F4c | 20/jul → 02/ago (2 sem) | done | Foundation multi-candidato 1T presidencial |
| [S06](./2026-S06-f4d-2t-governadores.md) | F4d | 03/ago → 16/ago (2 sem) | active | 2º turno presidencial + Governadores 27 corridas |
| [S07](./2026-S07-f6-hardening.md) | F6 | 17/ago → 30/ago (2 sem) | planned | Operação, share, manutenção + load test + simulado TSE |
| [S08](./2026-S08-f7-estabilizacao.md) | F7 | 31/ago → 06/set (1 sem) | planned | Bug bash + checklist pré-prod 100% |
| **[D1](./_D1-04out2026.md)** | — | **04/out** | — | **Produção 1º turno** |
| [S09](./2026-S09-f8a-retro1t.md) | F8a | 05/out → 14/out (1.5 sem) | planned | Análise pós-1T + recalibração modelo |
| [S10](./2026-S10-f8b-prep2t.md) | F8b | 15/out → 24/out (1.5 sem) | planned | Ajustes + bug bash 2T |
| **[D2](./_D2-25out2026.md)** | — | **25/out** | — | **Produção 2º turno** |

## Template de uma sprint

```yaml
---
id: 2026-SNN
title: Sprint NN — <Tema>
status: planned | active | done | cancelled
start: YYYY-MM-DD
end: YYYY-MM-DD
phase: FN
goal: <1 frase>
specs_in_flight: [NNN-slug, ...]
specs_planned_next: [...]
---

## Objetivo único
<1 frase — se cumprir só isso, sprint foi sucesso>

## Specs in-flight
- [ ] NNN-slug — detalhes em `../specs/NNN-slug/tasks.md`

## Chores fora de spec
- [ ] chore 1
- [ ] chore 2

## Definition of Done
- spec NNN-slug `shipped` (4 gates ok)
- chore X concluído
- ...

## Riscos da sprint
- <risco>: <mitigação>

## Replanejamentos mid-sprint
- <data>: <mudança e razão>

## Retrospective (preencher ao fechar)
- O que funcionou:
- O que melhorar:
- Carry-over pra próxima:
```

## Como o orquestrador usa

Antes de despachar `spec-implementer`:

1. Leia a sprint ativa (`grep -l "status: active" docs/sprints/*.md`).
2. Confirme que a spec está em `specs_in_flight:`.
3. Passe ao subagent o objetivo da sprint + capacidade restante (tasks já fechadas vs total).

## Backlog

Chores não priorizadas pra sprint nenhuma ficam em [backlog.md](./backlog.md).

## Cross-refs

- Roadmap macro: [../product/roadmap.md](../product/roadmap.md)
- Specs: [../specs/](../specs/)
- Convenções: [../_meta/conventions.md](../_meta/conventions.md)
