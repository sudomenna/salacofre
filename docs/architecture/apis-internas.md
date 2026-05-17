---
title: APIs Internas
description: Contratos de GET /api/projection, POST /api/ingest e POST /api/model/project (Python)
status: stable
source: PRD.md § 17
---

# APIs Internas

## `GET /api/projection`

- **Auth**: pública
- **Rate limit**: 60 req/min por IP
- **Cache**: `Cache-Control: public, s-maxage=5, stale-while-revalidate=30`

### Query params

| Param | Valores | Default |
|---|---|---|
| `cargo` | `presidente` \| `governador` | `presidente` |
| `turno` | `1` \| `2` | `1` |
| `uf` | sigla (opcional, retorna drill-down) | — |

### Response 200

```json
{ /* EdgePayload — ver architecture/data-model.md */ }
```

---

## `POST /api/ingest`

- **Auth**: header `x-cron-secret: ${CRON_SECRET}` + Vercel Cron-only (IP allowlist)
- **Rate limit**: N/A

### Response 200

```json
{
  "ok": true,
  "files_fetched": 234,
  "files_changed": 17,
  "duration_ms": 4521,
  "lag_ms": 8200
}
```

### Erros

- `401` — secret ausente ou inválido
- `503` — TSE indisponível após retries

---

## `POST /api/model/project` (Python)

- **Auth**: chamada interna apenas (mesma origem, secret compartilhado)

### Request body

```json
{ "cargo": 1, "turno": 1, "trigger_ts": "2026-10-04T18:23:15Z" }
```

### Response 200

```json
{ "computed": true, "uf_count": 14, "national_p_vitoria_a": 0.78 }
```

## Cross-refs

- Schema do payload: [./data-model.md](./data-model.md)
- Segurança dos endpoints: [../nfr/security.md](../nfr/security.md)
- Especificação de polling TSE: [../specs/001-ingestao-tse/design.md](../specs/001-ingestao-tse/design.md)
- Especificação do modelo: [../specs/002-modelo-estatistico/design.md](../specs/002-modelo-estatistico/design.md)
