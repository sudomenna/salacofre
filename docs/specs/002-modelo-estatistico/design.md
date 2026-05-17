---
id: 002-modelo-estatistico
type: design
title: Modelo estatístico — Design Técnico
status: draft
---

# Design — Modelo estatístico

## Arquitetura

Endpoint Python (`/api/model/project`) rodando em Vercel Fluid Compute (Python 3.14 + NumPy). Acionado pelo `/api/ingest` após cada batch de snapshots ingeridos.

## Cálculos

### Bootstrap (Python)

```python
def bootstrap_uf(zones_apuradas, n_resamples=1000):
    estimates = []
    for _ in range(n_resamples):
        sample = np.random.choice(zones_apuradas, size=len(zones_apuradas), replace=True)
        swing_sample = weighted_swing(sample)
        estimate = result_2022_uf + swing_sample
        estimates.append(estimate)
    return {
        'point': np.mean(estimates),
        'ci_lower': np.percentile(estimates, 2.5),
        'ci_upper': np.percentile(estimates, 97.5),
    }
```

### Probabilidade de vitória

```python
def p_vitoria(estimates_a, estimates_b):
    return np.mean(estimates_a > estimates_b)
```

### Posição da agulha

```
position = clip((p_vitoria_A - 0.5) * 2, -1, +1)

band = {
  if |position| < 0.2  → 'tossup'
  elif |position| < 0.5 → 'lean'
  elif |position| < 0.85 → 'likely'
  else                  → 'very_likely'
}
```

## Tratamento de casos de borda

| Caso | Tratamento |
|---|---|
| UF com 0 zonas apuradas | Projeção = resultado 2022, CI = ±10pp (penalização forte) |
| UF com <5% apurado | CI inflado em 50% adicional |
| Zona apurada mas sem dado 2022 (raro, mudança administrativa) | Excluída do cálculo de swing |
| Candidato 2026 com bloco político não-mapeável em 2022 | Modelo desabilitado para essa corrida, fallback para parcial atual |

## Validação por Replay

Script `scripts/replay-2022.ts`:

- Carrega todos os snapshots de 2022 do dataset aberto TSE.
- Replica cronologicamente.
- A cada timestep, computa projeção e compara com resultado final.
- **Métricas**:
  - Erro absoluto médio (MAE) por candidato em t = {15min, 30min, 1h, 2h}.
  - Calibração de probabilidade: dos casos onde modelo disse P=80%, em quantos % candidato realmente venceu?

Critério de aceite: MAE em t=1h < 2pp (OT-4).

## Contratos

### Request `POST /api/model/project`

```json
{ "cargo": 1, "turno": 1, "trigger_ts": "2026-10-04T18:23:15Z" }
```

### Response 200

```json
{ "computed": true, "uf_count": 14, "national_p_vitoria_a": 0.78 }
```

## Persistência

- **`projections`** — append-only, uma linha por (cargo, turno, uf, candidato, ts).
- **Edge Config** — escrita do payload consolidado (`projection:current` e `projection:uf:[sigla]`).

## ADRs aplicáveis

- [ADR-0006 Bootstrap, não Bayesiano](../../architecture/adrs/0006-bootstrap-nao-bayesiano.md)
- [ADR-0007 Granularidade zona vs município](../../architecture/adrs/0007-zona-vs-municipio.md)
- [ADR-0001 Edge Config write path](../../architecture/adrs/0001-edge-config-no-read-path.md)

## Riscos técnicos

- **Modelo retorna NaN sob input degenerado** — guardrails em `lib/model/project.py` com defaults seguros.
- **Bootstrap lento sob alta carga de UFs** — paralelizar via `numpy.random.Generator` com seeds determinísticas.

## Cross-refs

- Spec: [./spec.md](./spec.md)
- Schema `projections`: [../../architecture/data-model.md](../../architecture/data-model.md)
- Validação: [../../testing/replay.md](../../testing/replay.md)
