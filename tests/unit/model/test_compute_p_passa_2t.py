"""Testes pra compute_p_passa_2t (ADR-0014 — S05/F4c).

Cobertura:
  (a) Frequência empírica calculada corretamente — soma das top-2 ≈ 2.0
      (cada resample contribui com 2 slots).
  (b) Líder estável (gap >> ruído) → p_passa_2t ≈ 1.0 para top-2.
  (c) Caso degenerado: 1 candidato → p_passa_2t = 1.0.
  (d) Caso degenerado: 2 candidatos → ambos p_passa_2t = 1.0.
  (e) Determinismo: mesma entrada → mesma saída bit-a-bit.
"""

from __future__ import annotations

import numpy as np

from api.model.project import compute_p_passa_2t


def test_a_soma_top2_eh_2() -> None:
    """A soma de p_passa_2t sobre TODOS os candidatos é exatamente 2.0
    (cada resample contribui com 2 slots: top-1 + top-2)."""
    rng = np.random.default_rng(42)
    n = 5
    n_resamples = 1000
    # 5 candidatos com means dispersos (0.40, 0.30, 0.15, 0.10, 0.05).
    estimates = {
        1: 0.40 + rng.normal(0, 0.01, n_resamples),
        2: 0.30 + rng.normal(0, 0.01, n_resamples),
        3: 0.15 + rng.normal(0, 0.01, n_resamples),
        4: 0.10 + rng.normal(0, 0.01, n_resamples),
        5: 0.05 + rng.normal(0, 0.01, n_resamples),
    }
    result = compute_p_passa_2t(estimates)
    total = sum(result.values())
    assert abs(total - 2.0) < 1e-9, f"soma deveria ser 2.0, got {total}"
    # Deve ter exatamente n entries.
    assert len(result) == n


def test_b_lider_estavel_passa_2t_proximo_1() -> None:
    """Líder claro (gap > 10pp) → top-2 quase certamente passam pro 2T."""
    rng = np.random.default_rng(99)
    estimates = {
        100: 0.45 + rng.normal(0, 0.005, 1000),  # top-1
        200: 0.35 + rng.normal(0, 0.005, 1000),  # top-2
        300: 0.10 + rng.normal(0, 0.005, 1000),  # cauda
        400: 0.06 + rng.normal(0, 0.005, 1000),  # cauda
        500: 0.04 + rng.normal(0, 0.005, 1000),  # cauda
    }
    result = compute_p_passa_2t(estimates)
    assert result[100] > 0.99
    assert result[200] > 0.99
    assert result[300] < 0.05
    assert result[400] < 0.01
    assert result[500] < 0.01


def test_c_um_candidato() -> None:
    """Único candidato → vacuamente top-2 → p_passa_2t = 1.0."""
    estimates = {42: np.full(1000, 0.80, dtype=np.float64)}
    result = compute_p_passa_2t(estimates)
    assert result == {42: 1.0}


def test_d_dois_candidatos() -> None:
    """2 candidatos → ambos passam ao 2T por construção."""
    estimates = {
        1: np.full(1000, 0.60, dtype=np.float64),
        2: np.full(1000, 0.40, dtype=np.float64),
    }
    result = compute_p_passa_2t(estimates)
    assert result == {1: 1.0, 2: 1.0}


def test_e_determinismo() -> None:
    """Mesma entrada → mesma saída bit-a-bit (constituição § 6)."""
    rng = np.random.default_rng(123)
    base = {
        1: 0.45 + rng.normal(0, 0.01, 1000),
        2: 0.35 + rng.normal(0, 0.01, 1000),
        3: 0.10 + rng.normal(0, 0.01, 1000),
    }
    out1 = compute_p_passa_2t(base)
    out2 = compute_p_passa_2t(base)
    assert out1 == out2


def test_f_vazio() -> None:
    """Dict vazio → dict vazio."""
    assert compute_p_passa_2t({}) == {}
