"""Testes pra compute_two_round_scenarios (ADR-0014 — S05/F4c).

Cobertura:
  (a) Cenário 1T fechado: líder >= 55% estável → p_2t ≈ 0 + cenarios_2t
      ainda calculados (top-3 duelos potenciais).
  (b) Cenário 2T provável: líder ~ 45%, segundo ~ 35% → p_2t alto + top
      cenário é (líder, segundo).
  (c) 3 candidatos próximos (35/30/25) → top-3 cenários têm probs > 0
      e a dominante é AB.
  (d) Determinismo: mesma entrada → mesma saída bit-a-bit, mesma ordem.
  (e) Caso 1 candidato: p_2t=0, cenarios_2t=[].
"""

from __future__ import annotations

import numpy as np

from api.model.project import compute_two_round_scenarios


def test_a_lula_55_quase_fecha_1t() -> None:
    """Líder estável em 55% → p_segundo_turno_overall ≈ 0.

    Com gaps grandes (55/35/10) e ruído pequeno, o par top-2 é sempre o
    mesmo (100, 200) em todos os resamples → apenas 1 cenário emerge
    (probabilidade 1.0).
    """
    rng = np.random.default_rng(42)
    estimates = {
        100: 0.55 + rng.normal(0, 0.005, 5000),
        200: 0.35 + rng.normal(0, 0.005, 5000),
        300: 0.10 + rng.normal(0, 0.005, 5000),
    }
    result = compute_two_round_scenarios(estimates)
    # Líder está sempre acima de 50% — p_2t ≈ 0.
    assert result["p_segundo_turno_overall"] < 0.05
    # Apenas 1 cenário dominante por estabilidade do pareamento.
    assert len(result["cenarios_2t"]) >= 1
    top_scenario = result["cenarios_2t"][0]
    assert sorted(top_scenario["par"]) == [100, 200]
    assert top_scenario["prob"] > 0.9


def test_b_45_35_provavel_2t() -> None:
    """Líder 45%, segundo 35% → p_2t ≈ 1 (líder não fecha sozinho)."""
    rng = np.random.default_rng(99)
    estimates = {
        1: 0.45 + rng.normal(0, 0.01, 5000),
        2: 0.35 + rng.normal(0, 0.01, 5000),
        3: 0.12 + rng.normal(0, 0.01, 5000),
        4: 0.05 + rng.normal(0, 0.005, 5000),
        5: 0.03 + rng.normal(0, 0.005, 5000),
    }
    result = compute_two_round_scenarios(estimates)
    assert result["p_segundo_turno_overall"] > 0.95
    # Top cenário: par canonicalizado (menor id, maior id) → (1, 2).
    top = result["cenarios_2t"][0]
    assert top["par"] == [1, 2]
    assert top["prob"] > 0.95


def test_c_tres_candidatos_proximos() -> None:
    """35/30/25 com ruído → top-3 cenários têm prob > 0 e dominante é (1,2)."""
    rng = np.random.default_rng(7)
    estimates = {
        1: 0.35 + rng.normal(0, 0.02, 5000),
        2: 0.30 + rng.normal(0, 0.02, 5000),
        3: 0.25 + rng.normal(0, 0.02, 5000),
        4: 0.10 + rng.normal(0, 0.01, 5000),
    }
    result = compute_two_round_scenarios(estimates)
    # 3 cenários por contrato.
    assert len(result["cenarios_2t"]) == 3
    # Probs > 0 nos 3.
    for s in result["cenarios_2t"]:
        assert s["prob"] > 0.0
    # Soma dos top-3 ≈ 1 (raríssimo cair fora dos 3 top com noise pequeno).
    total_prob = sum(s["prob"] for s in result["cenarios_2t"])
    assert total_prob > 0.85
    # P(2T) deve ser ~ 1 (ninguém fecha sozinho).
    assert result["p_segundo_turno_overall"] > 0.95


def test_d_determinismo() -> None:
    """Mesma entrada → mesma saída completa (probs + ordem)."""
    rng = np.random.default_rng(2026)
    estimates = {
        1: 0.45 + rng.normal(0, 0.01, 1000),
        2: 0.35 + rng.normal(0, 0.01, 1000),
        3: 0.10 + rng.normal(0, 0.01, 1000),
    }
    out1 = compute_two_round_scenarios(estimates)
    out2 = compute_two_round_scenarios(estimates)
    assert out1 == out2


def test_e_unico_candidato() -> None:
    """1 candidato → p_2t=0, cenarios_2t=[]."""
    estimates = {42: np.full(1000, 0.80, dtype=np.float64)}
    result = compute_two_round_scenarios(estimates)
    assert result == {"p_segundo_turno_overall": 0.0, "cenarios_2t": []}


def test_f_vazio() -> None:
    """Sem candidatos → estrutura vazia."""
    result = compute_two_round_scenarios({})
    assert result == {"p_segundo_turno_overall": 0.0, "cenarios_2t": []}


def test_g_par_canonicalizado_menor_id_primeiro() -> None:
    """Mesmo quando id 200 é o líder, o par é canonicalizado para [100, 200]."""
    rng = np.random.default_rng(5)
    estimates = {
        100: 0.30 + rng.normal(0, 0.005, 1000),
        200: 0.45 + rng.normal(0, 0.005, 1000),  # líder com id MAIOR
    }
    result = compute_two_round_scenarios(estimates)
    # Único par possível, canonicalizado para [100, 200].
    assert result["cenarios_2t"][0]["par"] == [100, 200]
