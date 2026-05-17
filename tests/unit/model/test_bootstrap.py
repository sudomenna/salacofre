"""T09 / RF-015 — bootstrap_uf.

Cobertura:
  (a) CI bem ordenado (ci_lower < point < ci_upper) com 100 zonas sintéticas.
  (b) Reprodutibilidade (constituição § 6): 2 runs com mesmo seed → arrays
      bit-idênticos.
"""

from __future__ import annotations

import numpy as np
import pytest

from api.model.bootstrap import bootstrap_uf


def _synthetic_zones(n: int, swing_mean: float = 0.05, swing_sd: float = 0.03) -> list:
    """100 zonas sintéticas com swing ~ N(mean, sd), pesos variados."""
    rng = np.random.default_rng(seed=42)
    swings = rng.normal(loc=swing_mean, scale=swing_sd, size=n)
    weights = rng.integers(low=1_000, high=50_000, size=n)
    return [
        {"cod_zona": i + 1, "swing": float(swings[i]), "weight": int(weights[i])}
        for i in range(n)
    ]


def test_rf015_ci_ordered_with_100_zones() -> None:
    """RF-015 acceptance: ci_lower < point < ci_upper."""
    zones = _synthetic_zones(n=100)
    result = bootstrap_uf(zones, p_2022_uf=0.45, seed=12345)
    assert result["ci_lower"] < result["point"] < result["ci_upper"]
    # point deve estar perto de p_2022 + mean(swing) ≈ 0.45 + 0.05 = 0.50
    assert abs(result["point"] - 0.50) < 0.02
    # estimates é ndarray de 1000 amostras (default)
    assert isinstance(result["estimates"], np.ndarray)
    assert result["estimates"].shape == (1000,)


def test_rf015_reproducibility_same_seed() -> None:
    """Constituição § 6: mesmo seed → estimates bit-idênticos."""
    zones = _synthetic_zones(n=50)
    r1 = bootstrap_uf(zones, p_2022_uf=0.40, seed=99)
    r2 = bootstrap_uf(zones, p_2022_uf=0.40, seed=99)
    np.testing.assert_array_equal(r1["estimates"], r2["estimates"])
    assert r1["point"] == r2["point"]
    assert r1["ci_lower"] == r2["ci_lower"]
    assert r1["ci_upper"] == r2["ci_upper"]


def test_rf015_different_seeds_yield_different_arrays() -> None:
    """Sanity: seeds diferentes → arrays diferentes (não bug de seed ignorada)."""
    zones = _synthetic_zones(n=50)
    r1 = bootstrap_uf(zones, p_2022_uf=0.40, seed=1)
    r2 = bootstrap_uf(zones, p_2022_uf=0.40, seed=2)
    assert not np.array_equal(r1["estimates"], r2["estimates"])


def test_rf015_empty_zones_raises() -> None:
    """UF 0% apurada → caller usa T11, não bootstrap."""
    with pytest.raises(ValueError, match="≥1 zona apurada"):
        bootstrap_uf([], p_2022_uf=0.40, seed=1)


def test_rf015_smaller_resamples_still_works() -> None:
    """n_resamples customizável (para perf; RF-015 default=1000)."""
    zones = _synthetic_zones(n=20)
    result = bootstrap_uf(zones, p_2022_uf=0.50, seed=7, n_resamples=200)
    assert result["estimates"].shape == (200,)
