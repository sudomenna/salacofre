---
title: Runbook
description: Procedimentos operacionais para incidentes na noite eleitoral
status: stable
source: PRD.md § 19.5
---

# Runbook

Documento operacional com procedimentos para cenários críticos. Versão completa: `RUNBOOK.md` na raiz do repo (a ser criado em F6).

## Cenários cobertos

- **TSE indisponível** (>60s, >5min, >15min) — diagnóstico, banner, escalada.
- **Modelo retornando NaN** — fallback para último valor, alerta.
- **Cache hit ratio caindo** — investigar invalidação descontrolada.
- **Rollback de release** — Rolling Release reverter via dashboard.
- **Pico de tráfego acima do esperado** — monitorar billing, ativar plano emergencial CF.

## Cross-refs

- Alertas Slack: [./alerts.md](./alerts.md)
- Dashboard `/_status`: [./dashboard-status.md](./dashboard-status.md)
- Disponibilidade: [../nfr/availability.md](../nfr/availability.md)
