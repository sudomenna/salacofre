---
title: Deployment
description: Rolling Release Vercel com canary 10/50/100% — sem big-bang no dia D
status: stable
source: PRD.md (RF-059) + constituição § 7
---

# Deployment

## Estratégia

- **Vercel Rolling Releases** — canary 10% → 50% → 100%.
- Sem big-bang deploy no dia D (princípio constitucional § 7).
- Rollback rápido via dashboard Vercel.

## Janelas de freeze

- A partir de **F6 (Set 2026)**: só hotfix em produção, com aprovação.
- **Dia D (04/10/2026)**: deploy congelado das 16h00 até 05h00 do dia seguinte, exceto hotfix crítico.

## Cron toggle

Cron pode ser habilitado/desabilitado via env var `CRON_ENABLED` (RF-060) — usado em ambientes de preview e durante incidentes.

## Cross-refs

- RF-059, RF-060: [../specs/010-operacao-monitoramento/](../specs/010-operacao-monitoramento/)
- Runbook (rollback): [./runbook.md](./runbook.md)
- Constituição § 7: [../constitution.md](../constitution.md#7-resiliência-operacional)
