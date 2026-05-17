"""T06 / RF-011 — swing_zone."""

from __future__ import annotations

import math

from api.model.swing import swing_zone


def test_rf011_acceptance_55_minus_50_equals_plus_5pp() -> None:
    """RF-011 Given/When/Then: 0.55 - 0.50 → +0.05.

    Tolerância de math.isclose porque a subtração 0.55-0.50 gera ruído IEEE-754
    (0.050000000000000044) — comportamento de ponto flutuante padrão, não bug.
    """
    result = swing_zone(0.55, 0.50)
    assert result is not None
    assert math.isclose(result, 0.05, rel_tol=1e-9, abs_tol=1e-12)


def test_swing_negative() -> None:
    """Swing negativo é válido (candidato perdendo terreno)."""
    result = swing_zone(0.40, 0.50)
    assert result is not None
    assert math.isclose(result, -0.10, rel_tol=1e-9, abs_tol=1e-12)


def test_swing_zero_when_equal() -> None:
    assert swing_zone(0.42, 0.42) == 0.0


def test_returns_none_when_p_2022_missing() -> None:
    """Zona sem mapeamento 2022 → None (caller exclui)."""
    assert swing_zone(0.55, None) is None


def test_extremes() -> None:
    """Bordas [0, 1] permitidas — não clipamos no swing."""
    assert swing_zone(1.0, 0.0) == 1.0
    assert swing_zone(0.0, 1.0) == -1.0
