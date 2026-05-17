---
title: Dashboard /_status (Métricas Operacionais)
description: Métricas custom e logs estruturados — painel interno em /_status
status: stable
source: PRD.md §§ 19.1, 19.2, 19.3
---

# Dashboard `/_status`

Painel interno (protegido por auth básica) mostrando todas as métricas em tempo real (atualiza a cada 5s).

## Métricas Custom

| Métrica | Coleta | Alerta se |
|---|---|---|
| `tse.lag_seconds` | Tempo entre `dg+hg` do EA20 e ingestão | >60s |
| `tse.fetch_errors_rate` | Taxa de 4xx/5xx no fetch | >5%/min |
| `model.compute_duration_ms` | Tempo de cálculo da projeção | p95 >2000ms |
| `edge_config.write_duration_ms` | Tempo de propagação | p95 >15s |
| `projection.cache_hit_ratio` | Hit ratio na CDN | <95% |
| `projection.requests_per_sec` | RPS no endpoint | usar para capacidade |

## Logs Estruturados

Todos os logs em JSON com `correlation_id`, `cargo`, `turno`, `uf`, `level`, `event`.

## Cross-refs

- Spec dashboard: [../specs/012-dashboard-status/](../specs/012-dashboard-status/)
- Alertas: [./alerts.md](./alerts.md)
