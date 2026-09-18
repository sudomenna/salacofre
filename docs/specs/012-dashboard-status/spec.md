---
id: 012-dashboard-status
title: Dashboard Operacional /_status (T-07)
status: draft
priority: M
personas: []
screens: [T-07]
requirements: [RF-012.1, RF-012.2]
depends_on: [001-ingestao-tse]
apis: []
components: []
nfr: [RNF-009, RNF-032, RNF-033, RNF-034]
adrs: []
---

# Spec 012 — Dashboard Operacional `/_status`

> ## ⏸️ Cortada pelo dono em 2026-09-18 — e o frontmatter foi reconciliado
>
> `app/_status/` contém um único `.gitkeep`: **zero código**. A spec permanece
> `draft` porque não há status `cancelled` nas
> [convenções](../../_meta/conventions.md); o corte está registrado aqui e na
> [S08](../../sprints/2026-S08-f7-enxergar.md) § 6.
>
> **Duas correções de rastro feitas em 18/09**, ambas porque o gate
> `rf-coverage-checker` lê o `requirements:` do frontmatter e um RF com **duas
> donas** é ambiguidade, não redundância inofensiva:
>
> | RF | Estava | Ficou | Por quê |
> |---|---|---|---|
> | **RF-057** (alertas) | em 010 **e** 012 | só em **010** | A [matriz](../../_meta/traceability.md) já dava o RF-057 à 010 sozinha — o outlier era este frontmatter. E alerta não precisa de painel para mandar mensagem. |
> | **RF-056** (dashboard de saúde) | em 010 **e** 012 | só em **010** | A 010 é o guarda-chuva que sobrevive ao corte; a 012 era a tela dele. Com a tela cortada, o requisito continua vivo sob a 010 e volta na [S11](../../sprints/2026-S11-f7-resiliencia.md). |
>
> **Ciclo de dependência desfeito**: a 010 declarava `depends_on: [012]` e a 012
> declarava `depends_on: [010]`. Duas specs esperando uma pela outra não é
> dependência, é impasse.
>
> O que **continua** pertencendo a esta spec são os seus dois RFs próprios,
> RF-012.1 e RF-012.2 (os botões "Pausar Cron" e "Forçar refresh"), que não
> existem em spec nenhuma além desta. Eles seguem **sem cobertura, por ausência
> de implementação** — não de linha na matriz.

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
