"""Bootstrap não-paramétrico para CI95 da projeção UF (RF-015).

Determinismo (constituição § 6):
  - Seed obrigatório, derivado de `(cargo, turno, trigger_ts)` pelo caller.
  - Usa `numpy.random.default_rng(seed)` — NUNCA `np.random.seed()` global.
  - Mesmo seed + mesma entrada → mesmo array `estimates`. Validado em testes.

Algoritmo (design.md):
  Para n_resamples=1000:
    sample = choice(zones_apuradas, size=k, replace=True)   # k = len(zones)
    swing_sample = weighted_swing(sample)                   # T07 inline
    estimate = p_2022_uf + swing_sample
  Retorna point=mean(estimates), CI=percentile(2.5, 97.5), estimates (array)
  para reuso em p_vitoria sem recomputar (T10).

Edge cases:
  - len(zones_apuradas) == 0 → caller usa T11 `inflate_ci_zero_apurado`.
    Aqui NÃO tratamos: raise ValueError para falhar rápido.
"""

from __future__ import annotations

from typing import TypedDict

import numpy as np


class ZoneApurada(TypedDict):
    """Zona já apurada com seu swing calculado e peso (eleitores aptos)."""

    cod_zona: int
    swing: float  # não-None aqui — caller filtrou (T07 contract)
    weight: int  # eleitores_aptos, sempre > 0 (caller filtrou)


class BootstrapResult(TypedDict):
    point: float
    ci_lower: float
    ci_upper: float
    estimates: np.ndarray  # shape=(n_resamples,), reused by p_vitoria


def bootstrap_uf(
    zones_apuradas: list[ZoneApurada],
    p_2022_uf: float,
    seed: int,
    n_resamples: int = 1000,
) -> BootstrapResult:
    """Bootstrap não-paramétrico de 1000 resamples.

    Args:
        zones_apuradas: zonas com `swing` (float) e `weight` (int>0). Caller
            DEVE ter excluído zonas com swing=None ou weight<=0.
        p_2022_uf: pct do candidato na UF em 2022 (fração [0,1]).
        seed: determinístico, derivado de (cargo, turno, trigger_ts).
        n_resamples: default 1000 (RF-015). Reduzir afeta CI — evitar.

    Returns:
        `{point, ci_lower, ci_upper, estimates}`. `estimates` é ndarray
        shape=(n_resamples,) — reusado por p_vitoria (T10).

    Raises:
        ValueError: se zones_apuradas estiver vazio (caller deve usar T11).
    """
    if not zones_apuradas:
        raise ValueError(
            "bootstrap_uf requer ≥1 zona apurada; "
            "use edge_cases.inflate_ci_zero_apurado para UF 0%."
        )

    rng = np.random.default_rng(seed)
    k = len(zones_apuradas)
    swings = np.array([z["swing"] for z in zones_apuradas], dtype=np.float64)
    weights = np.array([z["weight"] for z in zones_apuradas], dtype=np.float64)

    # Bootstrap vetorizado: sorteia uma matriz (n_resamples, k) de índices
    # com reposição, indexa swings/weights, calcula média ponderada por linha.
    idx = rng.integers(0, k, size=(n_resamples, k))
    sampled_swings = swings[idx]  # (n_resamples, k)
    sampled_weights = weights[idx]  # (n_resamples, k)

    num = (sampled_swings * sampled_weights).sum(axis=1)
    den = sampled_weights.sum(axis=1)
    # den é sempre > 0 porque weights são todos > 0 (caller filtrou).
    swing_estimates = num / den
    estimates = p_2022_uf + swing_estimates

    point = float(np.mean(estimates))
    ci_lower = float(np.percentile(estimates, 2.5))
    ci_upper = float(np.percentile(estimates, 97.5))

    return {
        "point": point,
        "ci_lower": ci_lower,
        "ci_upper": ci_upper,
        "estimates": estimates,
    }
