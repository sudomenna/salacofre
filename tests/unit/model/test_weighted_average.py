"""T07 / RF-012 — swing_uf (média ponderada)."""

from __future__ import annotations

import math

from api.model.weighted_average import swing_uf


def test_rf012_three_zones_weighted() -> None:
    """3 zonas com pesos sintéticos: média ponderada manual.

    z1: swing=+0.10, peso=100
    z2: swing=-0.05, peso=200
    z3: swing=+0.08, peso=50

    num = 0.10*100 + (-0.05)*200 + 0.08*50 = 10 - 10 + 4 = 4
    den = 350
    expected = 4 / 350 ≈ 0.01142857
    """
    zones = [
        {"cod_zona": 1, "swing": 0.10},
        {"cod_zona": 2, "swing": -0.05},
        {"cod_zona": 3, "swing": 0.08},
    ]
    eleitorado = {1: 100, 2: 200, 3: 50}
    result = swing_uf(zones, eleitorado)
    assert result is not None
    assert math.isclose(result, 4 / 350, rel_tol=1e-9)


def test_empty_zone_list_returns_none() -> None:
    """RF-017 trigger: lista vazia → None."""
    assert swing_uf([], {1: 100}) is None


def test_zones_with_none_swing_excluded() -> None:
    """Zonas sem 2022 (swing=None) não entram no numerador nem denominador."""
    zones = [
        {"cod_zona": 1, "swing": 0.10},
        {"cod_zona": 2, "swing": None},  # excluída
        {"cod_zona": 3, "swing": 0.20},
    ]
    eleitorado = {1: 100, 2: 999_999, 3: 100}
    # Sem exclusão correta, peso de z2 dominaria. Com exclusão:
    # (0.10*100 + 0.20*100) / 200 = 30/200 = 0.15
    result = swing_uf(zones, eleitorado)
    assert result is not None
    assert math.isclose(result, 0.15, rel_tol=1e-9)


def test_all_zones_excluded_returns_none() -> None:
    """Se todas as zonas têm swing=None → None."""
    zones = [
        {"cod_zona": 1, "swing": None},
        {"cod_zona": 2, "swing": None},
    ]
    assert swing_uf(zones, {1: 100, 2: 200}) is None


def test_zone_missing_from_eleitorado_excluded() -> None:
    """Zona sem entrada em `eleitorado` (peso=0 implícito) → excluída."""
    zones = [
        {"cod_zona": 1, "swing": 0.10},
        {"cod_zona": 999, "swing": 0.50},  # peso ausente → excluída
    ]
    eleitorado = {1: 100}
    result = swing_uf(zones, eleitorado)
    assert result is not None
    assert math.isclose(result, 0.10, rel_tol=1e-9)
