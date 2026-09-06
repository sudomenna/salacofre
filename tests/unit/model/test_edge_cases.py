"""T11 / RF-017, RF-018 — edge_cases."""

from __future__ import annotations

import math

from api.model.edge_cases import (
    inflate_ci_low_apurado,
    inflate_ci_zero_apurado,
)


# RF-017 — UF 0% apurada


def test_rf017_zero_apurado_ci_pm_10pp() -> None:
    """Given p_2022=0.50, when 0% apurada, then CI=[0.40, 0.60]."""
    r = inflate_ci_zero_apurado(0.50)
    assert math.isclose(r["point"], 0.50, rel_tol=1e-9)
    assert math.isclose(r["ci_lower"], 0.40, rel_tol=1e-9)
    assert math.isclose(r["ci_upper"], 0.60, rel_tol=1e-9)


def test_rf017_clip_lower_when_near_zero() -> None:
    """p_2022=0.05 → ci_lower clipado em 0."""
    r = inflate_ci_zero_apurado(0.05)
    assert r["ci_lower"] == 0.0
    assert math.isclose(r["ci_upper"], 0.15, rel_tol=1e-9)


def test_rf017_clip_upper_when_near_one() -> None:
    """p_2022=0.95 → ci_upper clipado em 1."""
    r = inflate_ci_zero_apurado(0.95)
    assert r["ci_upper"] == 1.0
    assert math.isclose(r["ci_lower"], 0.85, rel_tol=1e-9)


# RF-018 — UF <5% apurada


def test_rf018_low_apurado_inflates_15x() -> None:
    """Given CI=[0.40, 0.60] (largura 0.20) e pct=2%, when inflar, then
    nova largura = 0.20 * 1.5 = 0.30 ao redor do point=0.50 → [0.35, 0.65]."""
    result = {"point": 0.50, "ci_lower": 0.40, "ci_upper": 0.60}
    r = inflate_ci_low_apurado(result, pct_apurado=2.0)
    assert math.isclose(r["point"], 0.50, rel_tol=1e-9)
    assert math.isclose(r["ci_lower"], 0.35, rel_tol=1e-9)
    assert math.isclose(r["ci_upper"], 0.65, rel_tol=1e-9)


def test_rf018_no_change_when_pct_geq_5() -> None:
    """pct_apurado >= 5 → result inalterado."""
    result = {"point": 0.50, "ci_lower": 0.40, "ci_upper": 0.60}
    r = inflate_ci_low_apurado(result, pct_apurado=5.0)
    assert r == result

    r2 = inflate_ci_low_apurado(result, pct_apurado=50.0)
    assert r2 == result


def test_rf018_clipped_to_unit() -> None:
    """Inflação que estouraria [0,1] é clipada."""
    result = {"point": 0.95, "ci_lower": 0.90, "ci_upper": 1.00}
    r = inflate_ci_low_apurado(result, pct_apurado=1.0)
    # nova largura = 0.10 * 1.5 = 0.15; half = 0.075
    # ci_upper = clip(0.95 + 0.075) = 1.0
    # ci_lower = clip(0.95 - 0.075) = 0.875
    assert r["ci_upper"] == 1.0
    assert math.isclose(r["ci_lower"], 0.875, rel_tol=1e-9)
