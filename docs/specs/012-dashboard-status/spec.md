---
id: 012-dashboard-status
title: Dashboard Operacional /_status (T-07)
status: draft
priority: M
personas: []
screens: [T-07]
requirements: [RF-056, RF-057, RF-012.1, RF-012.2]
depends_on: [001-ingestao-tse, 010-operacao-monitoramento]
apis: []
components: []
nfr: [RNF-009, RNF-032, RNF-033, RNF-034]
adrs: []
---

# Spec 012 — Dashboard Operacional `/_status`

**Rota**: `/_status` (protegido por auth básica)

## Objetivo

Painel interno mostrando todas as métricas operacionais em tempo real (atualiza a cada 5s). Usado pela equipe ops durante a noite eleitoral.

## Escopo

**In**:
- Lag de ingestão (tempo desde último snapshot do TSE).
- Cache hit ratio (últimos 5 min).
- Taxa de erro nos endpoints.
- Throughput de invalidações de Edge Config.
- Quantidade de zonas processadas / restantes.
- Botão "Pausar Cron" e "Forçar refresh".

**Out**:
- Alertas externos (escopo [spec 010](../010-operacao-monitoramento/)).

## Requisitos Funcionais (EARS)

**RF-056 (subset)** — Dashboard com métricas em tempo real.

WHEN um operador autenticado acessa `/_status`, the system SHALL exibir as métricas listadas no escopo, atualizadas a cada 5s.

### Ações operacionais

**RF-012.1 — Botão "Pausar Cron"**

WHEN o operador clica em "Pausar Cron", the system SHALL setar env var `CRON_ENABLED=false` via Vercel API e confirmar visualmente.

**RF-012.2 — Botão "Forçar refresh"**

WHEN o operador clica em "Forçar refresh", the system SHALL acionar `/api/ingest` fora do schedule e exibir o resultado.

> RFs 012.1 e 012.2 são adições desta spec (PRD descreve botões mas não como RFs numerados).

## Requisitos Não-Funcionais

- Auth básica (não exposto publicamente).
- Métricas custom: ver [observability NFR](../../nfr/observability.md).

## Open questions

- Auth: Vercel Edge Middleware com username/senha em env, ou auth via SSO (GitHub OAuth)? (atual: básica).

## Cross-refs

- Design: [./design.md](./design.md)
- Spec operação: [../010-operacao-monitoramento/](../010-operacao-monitoramento/)
- Dashboard reference: [../../operations/dashboard-status.md](../../operations/dashboard-status.md)
