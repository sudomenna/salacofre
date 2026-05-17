---
title: NFR — Observabilidade
description: Analytics, logs estruturados, métricas custom, alertas Slack
status: stable
source: PRD.md § 6.7
---

# Observabilidade

| ID | Descrição | Meta |
|---|---|---|
| RNF-031 | Vercel Analytics para tráfego e Core Web Vitals | Sim |
| RNF-032 | Logs estruturados de ingest, modelo, erros | Sim |
| RNF-033 | Métricas custom: lag TSE, cache-hit, projection latency | Sim |
| RNF-034 | Alertas em canal Slack para anomalias | Sim |

## Cross-refs

- Métricas custom detalhadas: [../operations/dashboard-status.md](../operations/dashboard-status.md)
- Alertas: [../operations/alerts.md](../operations/alerts.md)
- Spec operacional: [../specs/010-operacao-monitoramento/](../specs/010-operacao-monitoramento/)
- Spec dashboard `/_status`: [../specs/012-dashboard-status/](../specs/012-dashboard-status/)
