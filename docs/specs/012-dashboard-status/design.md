---
id: 012-dashboard-status
type: design
title: Dashboard /_status — Design Técnico
status: draft
---

# Design — Dashboard `/_status`

## Arquitetura

- `app/_status/page.tsx` — Client Component (precisa de polling).
- Auth no middleware: `middleware.ts` exige Basic Auth quando path === `/_status`.
- Fetch a `/api/status` (handler interno que agrega métricas).

## Componentes

- `<MetricCard />` por métrica — mostra valor atual + sparkline (últimos 60 ticks).
- `<ActionsBar />` com "Pausar Cron" e "Forçar refresh".
- Cores: verde (saudável), amarelo (warn), vermelho (alerta).

## Contratos

`GET /api/status` (interno, auth):

```json
{
  "ts": "2026-10-04T18:23:42Z",
  "tse_lag_seconds": 12,
  "cache_hit_ratio_5min": 0.9982,
  "errors_rate_per_min": 0.012,
  "edge_writes_per_min": 8,
  "zones_processed": 1247,
  "zones_total": 3000,
  "cron_enabled": true
}
```

## Cross-refs

- Spec: [./spec.md](./spec.md)
- Métricas detalhadas: [../../operations/dashboard-status.md](../../operations/dashboard-status.md)
