---
id: 2026-S08
title: Sprint 08 — Estabilização final (bug bash, checklist pré-prod)
status: planned
start: 2026-08-31
end: 2026-09-06
phase: F7
goal: Checklist pré-produção 100% verde; bug bash exaustivo em desktop + mobile; zero feature nova
specs_in_flight: []
specs_planned_next: []
---

# Sprint 08 — Estabilização final

## Objetivo único

Levar o sistema ao estado **deployable** para o dia D. **Não entra feature nova.** Só bug fix, ajuste de UX e fechamento do checklist pré-prod.

## Specs in-flight

Nenhuma. Toda spec do produto já está `shipped` no fim da S07.

## Foco da sprint

- **Bug bash exaustivo**:
  - Desktop: Chrome, Firefox, Safari, Edge — última versão.
  - Mobile: iOS Safari (último iPhone), Chrome Android (último Pixel/Samsung).
  - Slow 3G simulado.
  - prefers-reduced-motion ON.
  - VoiceOver + NVDA passada manual.

- **Checklist pré-produção** ([pre-prod-checklist.md](../operations/pre-prod-checklist.md)) — 100% checado:

  - [ ] Cadastro TSE aprovado
  - [ ] Replay 2022 com MAE <2pp em t=1h
  - [ ] Load test 30k VUs com p95 <200ms
  - [ ] Simulado oficial TSE executado com sucesso
  - [ ] Lighthouse a11y >95 em todas as páginas
  - [ ] Bug bash completo em desktop + mobile
  - [ ] Runbook revisado pela equipe ops
  - [ ] Alertas Slack testados (forçar falsos positivos)
  - [ ] Rolling Release configurado com canary 10% inicial
  - [ ] OG images dinâmicas testadas em WhatsApp/X/Threads
  - [ ] Página de manutenção testada
  - [ ] DNS preparado
  - [ ] Backup Postgres configurado
  - [ ] Plano de comunicação pré-D

## Chores

- [ ] Revisão final do runbook por todos os envolvidos
- [ ] Ensaio operacional: simular incidente "TSE down >5min" e responder via runbook
- [ ] Documentar processo de hotfix no dia D (quem aprova, como deploy emergencial)
- [ ] Plano de comunicação pré-D (post LinkedIn/X anunciando)

## Despachos sugeridos

- **`constitution-guard`** roda audit completo final, escopo = repo todo.
- **`a11y-perf-auditor`** roda full audit em todas as rotas, desktop + mobile.
- **`model-validator`** roda replay 2022 mais uma vez (regressão pode ter entrado em S07).
- **`rf-coverage-checker`** confirma 100% de cobertura RF Must.
- **`spec-syncer`** garante traceability + index.json totalmente atualizados.

## Definition of Done

- ✅ Checklist pré-prod 100% verde
- ✅ Zero bug crítico aberto
- ✅ Zero bug `HIGH` aberto sem mitigação aceita
- ✅ Last commit em `main` pelo menos 48h antes do dia D
- ✅ Hotfix process documentado e ensaiado

## Não-objetivos (regra de ferro)

❌ **Não entra feature nova nesta sprint.** Qualquer "podemos só adicionar..." vai pro backlog pra pós-2T.

## Riscos da sprint

- **Bug crítico descoberto tarde** — janela única de 1 semana; se descoberto na sexta antes do dia D, pode bloquear.
- **Resolução TSE 2026 publicada agora** (deadline típico set) — diff pode forçar ajuste de última hora. Mitigação: pipeline modular ([001/design.md](../specs/001-ingestao-tse/design.md)).

## Replanejamentos mid-sprint

_(preencher se mudar)_

## Retrospective (preencher ao fechar)

- O que funcionou:
- O que melhorar:
- Carry-over pra dia D / S09:

## Cross-refs

- Sprint anterior: [2026-S07-f6-hardening.md](./2026-S07-f6-hardening.md)
- Próximo marco: [_D1-04out2026.md](./_D1-04out2026.md)
- Checklist pré-prod: [../operations/pre-prod-checklist.md](../operations/pre-prod-checklist.md)
- Runbook: [../operations/runbook.md](../operations/runbook.md)
