"""T10 / RF-016 — p_vitoria, needle_position."""

from __future__ import annotations

import numpy as np
import pytest

from api.model.p_vitoria import needle_position, p_vitoria


def test_rf016_a_wins_78_percent() -> None:
    """1000 estimates sintéticos onde A > B em 78% → p_vitoria ≈ 0.78."""
    rng = np.random.default_rng(seed=42)
    n = 10_000  # mais amostras → tolerância menor
    estimates_a = rng.normal(loc=0.50, scale=0.02, size=n)
    estimates_b = rng.normal(loc=0.48, scale=0.02, size=n)
    p = p_vitoria(estimates_a, estimates_b)
    # Empírico — com loc=0.50/0.48 e sd=0.02, P(A>B) ≈ Φ(0.02/sqrt(0.0008)) ≈ 0.76
    # Tolerância larga porque o teste só precisa confirmar a ordem de grandeza.
    assert 0.70 < p < 0.85


def test_rf016_a_always_wins() -> None:
    """Se A > B em todos os resamples → p_vitoria == 1.0."""
    a = np.array([0.6, 0.7, 0.8, 0.9])
    b = np.array([0.1, 0.2, 0.3, 0.4])
    assert p_vitoria(a, b) == 1.0


def test_rf016_a_always_loses() -> None:
    a = np.array([0.1, 0.2, 0.3])
    b = np.array([0.5, 0.6, 0.7])
    assert p_vitoria(a, b) == 0.0


def test_rf016_shape_mismatch_raises() -> None:
    with pytest.raises(ValueError, match="shapes incompatíveis"):
        p_vitoria(np.array([0.1, 0.2]), np.array([0.1, 0.2, 0.3]))


# Bandas da agulha — testar bordas exatas.


def test_needle_tossup_at_50() -> None:
    """p=0.50 → position=0 → tossup."""
    n = needle_position(0.50)
    assert n["position"] == 0.0
    assert n["band"] == "tossup"


def test_needle_tossup_upper_edge() -> None:
    """|pos| < 0.20 → tossup. p=0.595 → pos=0.19 → tossup."""
    n = needle_position(0.595)
    assert n["band"] == "tossup"


def test_needle_lean_just_above_020() -> None:
    """|pos| ligeiramente acima de 0.20 → 'lean' (banda tossup é `< 0.20`).

    Usamos p_a=0.61 → pos=0.22 (sem ambiguidade float-binary) em vez de
    p_a=0.60 (que gera pos=0.19999... por IEEE-754 e cairia em tossup —
    comportamento determinístico, não testamos a borda exata).
    """
    n = needle_position(0.61)
    assert n["band"] == "lean"


def test_needle_lean_band_negative() -> None:
    """Lado B (p_a baixo) também gera band 'lean'."""
    n = needle_position(0.39)  # pos ≈ -0.22
    assert n["band"] == "lean"
    assert n["position"] < 0


def test_needle_likely_just_above_050() -> None:
    """|pos| ligeiramente acima de 0.50 → 'likely'."""
    n = needle_position(0.76)  # pos ≈ 0.52
    assert n["band"] == "likely"


def test_needle_very_likely_just_above_085() -> None:
    """|pos| ligeiramente acima de 0.85 → 'very_likely'."""
    n = needle_position(0.93)  # pos ≈ 0.86
    assert n["band"] == "very_likely"


def test_needle_clip_extreme() -> None:
    """p=1.0 → pos clipado a +1.0 → very_likely."""
    n = needle_position(1.0)
    assert n["position"] == 1.0
    assert n["band"] == "very_likely"

    n_low = needle_position(0.0)
    assert n_low["position"] == -1.0
    assert n_low["band"] == "very_likely"
