"""T08 / RF-013, RF-014 — project_uf, project_national."""

from __future__ import annotations

import math

from api.model.projection import project_national, project_uf


def test_rf013_uf_projection_basic() -> None:
    """p_proj = p_2022 + swing."""
    assert math.isclose(project_uf(0.50, 0.05), 0.55, rel_tol=1e-9)


def test_rf013_uf_projection_negative_swing() -> None:
    assert math.isclose(project_uf(0.50, -0.12), 0.38, rel_tol=1e-9)


def test_rf013_clip_lower_bound() -> None:
    """Swing extremo negativo → clipado em 0."""
    assert project_uf(0.10, -0.50) == 0.0


def test_rf013_clip_upper_bound() -> None:
    """Swing extremo positivo → clipado em 1."""
    assert project_uf(0.95, 0.20) == 1.0


def test_rf014_national_sums_votos_across_ufs() -> None:
    """Σ votos_proj por UF → votos nacionais do candidato."""
    uf_projections = [
        {"uf": "SP", "votos_proj": 12_000_000.0},
        {"uf": "RJ", "votos_proj": 5_000_000.0},
    ]
    nat = project_national(uf_projections)
    assert math.isclose(nat["votos"], 17_000_000.0, rel_tol=1e-9)


def test_rf014_empty_or_zero_returns_zero() -> None:
    nat = project_national([])
    assert nat["votos"] == 0.0
    assert nat["pct"] == 0.0

    nat_zero = project_national([{"uf": "SP", "votos_proj": 0.0}])
    assert nat_zero["votos"] == 0.0
    assert nat_zero["pct"] == 0.0
