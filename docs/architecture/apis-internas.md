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

## `GET /api/ingest` e `POST /api/ingest`

**Dispara ciclo de ingestão para todos os cargos ativos** (uso manual, preview, runbook).

- **Auth**: header `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron padrão) **ou** `x-cron-secret: ${CRON_SECRET}` (runbook manual)
- **Rate limit**: N/A
- **maxDuration**: 300s (Fluid Compute)
- **Alvos**: ~6.110 arquivos por cargo = pares `(UF, município, zona)` (ADR-0035 D1)

### Response 200

```json
{
  "ok": true,
  "files_fetched": 6110,
  "files_changed": 47,
  "duration_ms": 153000,
  "lag_ms": 8200,
  "cargos": ["presidente", "governador", "senador", "deputado_federal", "deputado_estadual"]
}
```

### Erros

- `401` — secret ausente ou inválido
- `503` — TSE indisponível após retries

---

## `GET /api/ingest/[cargo]` e `POST /api/ingest/[cargo]`

**Dispara ciclo de ingestão para um cargo isolado** (cron de produção: Presidente e Governador em rotas separadas).

- **Auth**: header `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron) **ou** `x-cron-secret: ${CRON_SECRET}` (runbook manual)
- **Path param**: `[cargo]` = `presidente` | `governador` | `senador` | `deputado_federal` | `deputado_estadual` (ou código numérico `1`, `3`, etc.)
- **Rate limit**: N/A
- **maxDuration**: 300s (Fluid Compute)
- **Alvos**: ~6.110 arquivos para o cargo especificado
- **Lock anti-overlap**: por cargo, janela 6 min (≥ maxDuration; ADR-0035 D3)

### Response 200

```json
{
  "ok": true,
  "cargo": "presidente",
  "files_fetched": 6110,
  "files_changed": 17,
  "duration_ms": 153000,
  "lag_ms": 8200
}
```

### Erros

- `401` — secret ausente ou inválido
- `503` — TSE indisponível após retries
- `409` — ciclo anterior do mesmo cargo ainda em voo (lock overlap)

---

## `POST /api/model/project` (Python)

- **Auth**: chamada interna apenas (mesma origem, secret compartilhado)
- **Operação**: lê snapshots por par `(uf, cod_municipio_tse, cod_zona)`, executa `api/model/zona_merge.py` (soma pares → zona em memória, sem persistência), alimenta estimador por zona (ADR-0021/0023 intactos), calcula projeção, escreve Edge Config

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
