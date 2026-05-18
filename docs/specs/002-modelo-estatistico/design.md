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

## Cálculos S05 — 2º turno e K-1 fallback

### `compute_two_round_scenarios`

Função nova S05 (conforme [ADR-0014](../../architecture/adrs/0014-p-segundo-turno-primeira-classe.md)):

```python
def compute_two_round_scenarios(
    p_vitoria: dict,
    indeciso_pct: float,
    margin_threshold: float = 0.05
) -> dict:
    """
    Gera cenários de 2º turno baseado em bootstrap.
    
    Args:
        p_vitoria: dicionário {candidato_id: P(>50% válidos)}
        indeciso_pct: % de indecisos/votos brancos a redistribuir
        margin_threshold: margem mínima para fechamento no 1T
    
    Returns:
        {
            'p_second_round_overall': float,  # P(nenhum fecha no 1T)
            'scenarios': [
                {
                    'top_2': [cand_a, cand_b],
                    'p_this_scenario': 0.35,
                    'cand_a_p_passa': 0.92,
                    'cand_b_p_passa': 0.88
                },
                ...
            ]
        }
    """
    pass
```

### `compute_p_passa_2t`

Probabilidade por candidato de passar para 2º turno:

```python
def compute_p_passa_2t(
    p_vitoria: float,
    p_second_round_overall: float,
    candidate_rank: int
) -> float:
    """
    P(candidato passa para 2T) = P(2T acontece) × P(está no top-2 | 2T ocorre)
    
    Para rank=1,2: = p_second_round_overall (sempre no top-2 se houver 2T).
    Para rank≥3: = 0.0 (não passa para 2T).
    """
    if candidate_rank <= 2:
        return p_second_round_overall
    else:
        return 0.0
```

### `compute_p_fecha_1t`

Probabilidade por candidato de fechar eleição no 1º turno:

```python
def compute_p_fecha_1t(
    p_vitoria: float,
    p_second_round_overall: float
) -> float:
    """
    P(fecha 1T) = P(vitória > 50% | 1T encerrado)
                = p_vitoria × (1 - p_second_round_overall)
    """
    return p_vitoria * (1 - p_second_round_overall)
```

### K-1 Fallback 3-tier (conforme [ADR-0015](../../architecture/adrs/0015-k1-fallback-3-tier.md))

```python
def fallback_k1_mapping(candidate_2026, uf: str) -> dict:
    """
    Quando candidato 2026 não tem mapeamento óbvio em 2022:
    
    Tier 1: Candidatos de mesmo partido em vizinhos geográficos (até 3 UFs próximas).
    Tier 2: Candidatos de mesmo partido em zonas similares dentro da UF (crescimento pop, PIB).
    Tier 3: Média nacional do partido em 2022.
    
    Retorna {'tier': int, 'mapping': historico_2022_ref, 'confidence': float}
    Se todas as tiers falham, retorna {'disabled': True}
    """
    pass
```

Color lock em `pct_apurado ≥ 1%` (conforme [ADR-0013](../../architecture/adrs/0013-tokens-multi-candidato-por-rank.md)): candidatos com < 1% são greyed out, não recebem token de rank visual.

## Persistência

- **`projections`** — append-only, uma linha por (cargo, turno, uf, candidato, ts).
- **Edge Config** — escrita do payload consolidado via chaves nomeadas ([ADR-0012](../../architecture/adrs/0012-edge-config-chaves-nomeadas.md)): `projection:current:pres:t1`, `projection:current:pres:t2`, etc.

## ADRs aplicáveis

- [ADR-0006 Bootstrap, não Bayesiano](../../architecture/adrs/0006-bootstrap-nao-bayesiano.md)
- [ADR-0007 Granularidade zona vs município](../../architecture/adrs/0007-zona-vs-municipio.md)
- [ADR-0001 Edge Config write path](../../architecture/adrs/0001-edge-config-no-read-path.md)
- [ADR-0012 Chaves nomeadas por corrida e turno](../../architecture/adrs/0012-edge-config-chaves-nomeadas.md)
- [ADR-0014 Métricas de 2º turno primeira classe](../../architecture/adrs/0014-p-segundo-turno-primeira-classe.md)
- [ADR-0015 K-1 fallback 3-tier](../../architecture/adrs/0015-k1-fallback-3-tier.md)

## Riscos técnicos

- **Modelo retorna NaN sob input degenerado** — guardrails em `lib/model/project.py` com defaults seguros.
- **Bootstrap lento sob alta carga de UFs** — paralelizar via `numpy.random.Generator` com seeds determinísticas.

## Cross-refs

- Spec: [./spec.md](./spec.md)
- Schema `projections`: [../../architecture/data-model.md](../../architecture/data-model.md)
- Validação: [../../testing/replay.md](../../testing/replay.md)
