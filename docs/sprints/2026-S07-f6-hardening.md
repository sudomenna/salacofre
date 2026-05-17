---
id: 2026-S07
title: Sprint 07 — Hardening (operação, share, manutenção, load test, simulado TSE)
status: planned
start: 2026-08-17
end: 2026-08-30
phase: F6
goal: Specs 009, 010, 012, 013 shipped + load test 30k aprovado + simulado oficial TSE executado + cadastro TSE aprovado
specs_in_flight: [009-compartilhamento-meta, 010-operacao-monitoramento, 012-dashboard-status, 013-pagina-manutencao]
specs_planned_next: []
---

# Sprint 07 — Hardening

## Objetivo único

Tudo o que separa "feature completa" de "produção pronta": operação, monitoramento, compartilhamento, manutenção, carga validada e simulado oficial.

## Specs in-flight

- [ ] **009-compartilhamento-meta** — OG dinâmica, share buttons, sitemap, footer canônico.
- [ ] **010-operacao-monitoramento** — alertas, cron toggle, rolling release.
- [ ] **012-dashboard-status** — `/_status` com métricas tempo real + botões "Pausar Cron" e "Forçar refresh".
- [ ] **013-pagina-manutencao** — `/manutencao` como fallback.

## Chores fora de spec — CRÍTICOS

- [ ] **Cadastro como interessado na divulgação aprovado pelo TSE** (RF-010) — checklist pré-prod
- [ ] **Simulado oficial TSE executado com sucesso** — diff de schema EA20 vs 2022 se houver mudança ([tse-simulados.md](../testing/tse-simulados.md))
- [ ] **Load test 30k VUs** com p95 <200ms ([load.md](../testing/load.md))
- [ ] **Bundle gates em CI** (`ANALYZE=true pnpm build` falha se RNF-007a > 150KB)
- [ ] **Lighthouse a11y >95** em CI para todas as rotas
- [ ] Alertas Slack testados com falsos positivos forçados
- [ ] Backup Postgres configurado (Neon snapshot diário)
- [ ] DNS preparado (`salacofre.com.br` + `.com` apontando pro Vercel)
- [ ] **Se a resolução TSE 2026 já foi publicada**: rodar diff técnico via `tse-parser-builder` e ajustar pipeline se necessário

## Despachos sugeridos (paralelizáveis)

- **`spec-implementer` × 4** — em paralelo para 009, 010, 012, 013.
- **`tse-parser-builder`** se a resolução 2026 saiu e exige ajustes.
- **`model-validator`** roda o replay 2022 contra o pipeline real + simulado TSE.
- **`a11y-perf-auditor`** roda full audit + bundle analyzer.
- **`constitution-guard`** roda audit completo do código todo (não só do que mudou).
- **`rf-coverage-checker`** × 4.
- **`spec-syncer`** propaga.

## Definition of Done

- ✅ Specs 009, 010, 012, 013 com `status: shipped`
- ✅ **Todas as 13 specs do produto com `status: shipped`** (marco do projeto)
- ✅ Load test 30k VUs aprovado (p95 <200ms, error rate <0.1%)
- ✅ Simulado oficial TSE executado e validado
- ✅ Cadastro TSE aprovado
- ✅ `/manutencao` testado manualmente (forçar via env var)
- ✅ OG image dinâmica testada em WhatsApp/X/Threads
- ✅ Alertas Slack disparando em condições reais

## Riscos da sprint

- **Cadastro TSE pode não estar aprovado a tempo** — se atrasar, escalada com TSE; estado de "preview público restrito" como plano B.
- **Simulado TSE pode revelar mudanças de schema EA20** — corrigir é prioridade absoluta; pode comer tempo da S08.
- **Load test pode revelar gargalo** — se Edge Config ou função estourar, escalar Vercel ou redimensionar payload.

## Replanejamentos mid-sprint

_(preencher se mudar)_

## Retrospective (preencher ao fechar)

- O que funcionou:
- O que melhorar:
- Carry-over pra S08:

## Cross-refs

- Sprint anterior: [2026-S06-f5-completo.md](./2026-S06-f5-completo.md)
- Próxima sprint: [2026-S08-f7-estabilizacao.md](./2026-S08-f7-estabilizacao.md)
- Checklist pré-prod: [../operations/pre-prod-checklist.md](../operations/pre-prod-checklist.md)
