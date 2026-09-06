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
    national_estimates: dict[int, np.ndarray],
    _cand_ordered: list[int] | None = None,
) -> dict:
    """
    Gera P(2º turno) + os 3 duelos mais prováveis, direto dos resamples.

    Para cada resample: identifica o top-2, canonicaliza o par (id menor
    primeiro) para não contar AB e BA em separado, e conta se algum
    candidato fechou sozinho >= 50%.

    Args:
        national_estimates: {candidato_id: ndarray} em fração [0, 1].

    Returns:
        {
            'p_segundo_turno_overall': float,           # P(ninguém fecha no 1T)
            'cenarios_2t': [{'par': [id_a, id_b], 'prob': 0.35}, ...]  # top-3
        }
    """
```

> Não existe parâmetro de "indecisos" no modelo. O universo é sempre o dado
> apurado do TSE decomposto pelo próprio EA20 (`v.vvc`, `e.c`, `e.esi`); o
> que não é voto em candidato entra como brancos/nulos ou abstenção, com
> denominador próprio (RF-020.1), nunca como massa redistribuída.

### `compute_p_passa_2t`

Probabilidade por candidato de passar para 2º turno:

```python
def compute_p_passa_2t(national_estimates: dict[int, np.ndarray]) -> dict[int, float]:
    """
    P(candidato termina no top-2), contada resample a resample — não
    derivada de rank fixo. Devolve {candidato_id: probabilidade}.
    """
```

### `compute_p_fecha_1t`

Probabilidade por candidato de fechar eleição no 1º turno:

```python
def compute_p_fecha_1t(national_estimates: dict[int, np.ndarray]) -> dict[int, float]:
    """
    P(candidato fecha a eleição no 1º turno) = fração dos resamples em que
    ele sozinho passa de 50%. Devolve {candidato_id: probabilidade}.
    """
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

## Cálculos S07 — participação e agregado "Outros" (RF-020.1)

### `api/model/turnout.py`

Módulo isolado (não importa `project.py` — a dependência é de mão única, `project.py` → `turnout.py`).

```python
Metric = Literal["abstencao", "brancos_nulos"]

def metric_value(z: ZonaParticipacao, metric: Metric) -> float:
    """Fração [0,1] da métrica numa zona:
       abstencao     → a(z) / esi(z)     (eleitorado das seções instaladas)
       brancos_nulos → bn(z) / c(z)      (comparecimento)"""

def estimate_uf_participacao(
    zonas: list[ZonaParticipacao],
    metric: Metric,
    pct_apurado_uf: float,      # 0–100
    seed: int,                  # derivado pelo CALLER de (uf, metric)
    n_resamples: int = 1000,
) -> ParticipacaoEstimate | None:
    """Regra de três + bootstrap de zonas. `None` se nenhuma zona é utilizável."""

def aggregate_national_participacao(
    by_uf: dict[str, ParticipacaoEstimate | None],
    eleitorado_total_by_uf: dict[str, int],
) -> ParticipacaoEstimate | None:
    """Soma dos arrays de resample por UF, ponderada por eleitorado total."""
```

Pontos que o código fixa e a spec depende:

- **Ponto projetado é fórmula fechada**, não `mean(bootstrap)` — média de `metric_value(z)` ponderada por `w(z)`. O bootstrap serve só para o CI, como em `compute_uf_projections`.
- **`pct_atual` é razão literal de somas** (`Σ num / Σ den`), não média de frações por zona: cada zona contribui pelo seu denominador bruto real.
- **Exclusão de zonas** acontece dentro de `estimate_uf_participacao` (denominador ≤ 0 **ou** `weight ≤ 0`) — o caller não pré-filtra.
- **Seed** é responsabilidade do caller (`compute_participacao`), derivado de `(uf, metric)` pelo mesmo padrão de `local_seed` em `compute_uf_projections`. Isso mantém `turnout.py` desacoplado e o resultado reprodutível bit-a-bit.
- **RF-018 reusado tal qual** via `edge_cases.inflate_ci_low_apurado` — sem reimplementação.

### Agregado "Outros"

```python
def compute_outros_estimates(
    estimates: dict[int, np.ndarray],   # fração [0,1], mesmo shape
    rank_by_cand: dict[int, int],       # 1-based; ausente ⇒ rank 0 (nunca entra)
    min_rank: int = 4,
) -> tuple[np.ndarray, int]:            # (soma pareada por resample, n_candidatos)
```

A soma é **elementwise entre arrays já sorteados** — preserva a covariância entre os candidatos de cauda e produz um IC genuíno. `100 − Σtop3` descartaria toda essa incerteza e por isso só existe como fallback de apresentação, obrigatoriamente rotulado "IC indisponível" (ADR-0018).

### Contrato do bloco `participacao` no payload

Emitido por `build_participacao_payload` em `EdgeNational` e em `EdgePayloadUf` — ambos opcionais (`participacao?`), tipados em `lib/edge-config/types.ts`:

```json
"participacao": {
  "abstencao":     {"pct_atual": 20.1, "pct_projetado": 21.4, "lower": 19.8, "upper": 23.0, "base": "eleitores_instalados"},
  "brancos_nulos": {"pct_atual": 6.9,  "pct_projetado": 7.3,  "lower": 6.6,  "upper": 8.1,  "base": "comparecimento"},
  "outros":        {"pct_atual": 5.2,  "pct_projetado": 5.0,  "lower": 4.1,  "upper": 6.2,  "base": "votaveis", "n_candidatos": 8},
  "metodo": {"tipo": "extrapolacao_apurado", "n_zonas": 1234, "pct_apurado": 48.2}
}
```

Cada métrica é omitida quando não calculável; o bloco inteiro é omitido quando nenhuma das três existe (evita um `metodo` órfão). `metodo.n_zonas` é o **maior** `n_zonas` entre `abstencao` e `brancos_nulos` — as duas podem ter conjuntos de zonas úteis ligeiramente diferentes.

**Sem persistência**: nada disso entra em `projections` (ver RF-020.1). Sem migration nesta fase.

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
- [ADR-0018 Seis termômetros no hero do 1T](../../architecture/adrs/0018-termometros-hero-1t.md) — origem de RF-020.1
- [ADR-0020 Conformidade Res. TSE 23.751/2026](../../architecture/adrs/0020-conformidade-res-23751-2026.md) — art. 267 §4º veda alterar o conteúdo dos dados (base da regra de denominadores não-intercambiáveis)

## Riscos técnicos

- **Modelo retorna NaN sob input degenerado** — guardrails em `lib/model/project.py` com defaults seguros.
- **Bootstrap lento sob alta carga de UFs** — paralelizar via `numpy.random.Generator` com seeds determinísticas.
- **Participação volátil em baixa apuração** — a regra de três de RF-020.1 não tem prior; em <5% apurado o CI é inflado por RF-018, mas o viés de composição (zonas urbanas apuram antes) permanece. Reavaliar após os simulados TSE de 15–17/09 e 22–24/09/2026 (ADR-0018, seção Consequências).

## Cross-refs

- Spec: [./spec.md](./spec.md)
- Schema `projections`: [../../architecture/data-model.md](../../architecture/data-model.md)
- Validação: [../../testing/replay.md](../../testing/replay.md)
