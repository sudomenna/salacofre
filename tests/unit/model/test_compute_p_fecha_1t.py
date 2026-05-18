"""Testes pra compute_p_fecha_1t (ADR-0014 — S05/F4c).

Cobertura:
  (a) Líder >= 55% estável → p_fecha_1t > 0.5 (gatilho banner ativo).
  (b) Líder ~50% bordeline → p_fecha_1t ~0.5.
  (c) Líder < 45% → p_fecha_1t ~0 (nem perto de fechar).
  (d) Determinismo: mesma entrada → mesma saída.
"""

from __future__ import annotations

import numpy as np

from api.model.project import compute_p_fecha_1t


def test_a_lider_estavel_55_fecha() -> None:
    """Líder 55% com σ=0.5pp → p_fecha_1t bem > 0.5."""
    rng = np.random.default_rng(42)
    estimates = {
        100: 0.55 + rng.normal(0, 0.005, 5000),  # 55% ± 0.5pp
        200: 0.35 + rng.normal(0, 0.005, 5000),
        300: 0.10 + rng.normal(0, 0.005, 5000),
    }
    result = compute_p_fecha_1t(estimates)
    # Candidato 100 está claramente acima de 50% — p_fecha_1t deve ser muito alto.
    assert result[100] > 0.95
    # Demais devem ter prob ~ 0 (longe de 50%).
    assert result[200] < 0.01
    assert result[300] < 0.01


def test_b_lider_borderline_50() -> None:
    """Líder ~50% (σ=2pp) → p_fecha_1t ~0.5 (no limiar)."""
    rng = np.random.default_rng(99)
    estimates = {
        1: 0.50 + rng.normal(0, 0.02, 5000),
        2: 0.45 + rng.normal(0, 0.02, 5000),
    }
    result = compute_p_fecha_1t(estimates)
    assert 0.3 < result[1] < 0.7, f"line: result={result}"
    assert result[2] < 0.02


def test_c_lider_baixo_nao_fecha() -> None:
    """Líder 45% → p_fecha_1t ≈ 0."""
    rng = np.random.default_rng(7)
    estimates = {
        100: 0.45 + rng.normal(0, 0.01, 5000),
        200: 0.40 + rng.normal(0, 0.01, 5000),
    }
    result = compute_p_fecha_1t(estimates)
    assert result[100] < 0.001
    assert result[200] < 0.001


def test_d_determinismo() -> None:
    """Mesma entrada → mesma saída bit-a-bit."""
    rng = np.random.default_rng(2026)
    estimates = {
        1: 0.50 + rng.normal(0, 0.02, 1000),
        2: 0.40 + rng.normal(0, 0.01, 1000),
    }
    out1 = compute_p_fecha_1t(estimates)
    out2 = compute_p_fecha_1t(estimates)
    assert out1 == out2


def test_e_unico_candidato() -> None:
    """1 candidato com 80% → p_fecha_1t = 1.0."""
    estimates = {42: np.full(1000, 0.80, dtype=np.float64)}
    result = compute_p_fecha_1t(estimates)
    assert result == {42: 1.0}


def test_f_vazio() -> None:
    assert compute_p_fecha_1t({}) == {}
