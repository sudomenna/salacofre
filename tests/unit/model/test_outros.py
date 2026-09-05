"""Fase 1a (D4) — `compute_outros_estimates` / `_outros_metric_payload`
(`api/model/project.py`).

D4: "Outros" com IC real — soma, pareada por resample, dos `estimates` de
candidatos com `rank >= min_rank` (default 4). NÃO é `100 - Σtop3`
(descartaria o IC).
"""

from __future__ import annotations

import numpy as np
import pytest

from api.model.project import _outros_metric_payload, compute_outros_estimates


def test_5_candidatos_soma_rank_4_e_5_por_resample() -> None:
    rng = np.random.default_rng(123)
    n_resamples = 1000
    estimates = {
        1: 0.40 + rng.normal(0, 0.01, n_resamples),
        2: 0.30 + rng.normal(0, 0.01, n_resamples),
        3: 0.15 + rng.normal(0, 0.01, n_resamples),
        4: 0.10 + rng.normal(0, 0.01, n_resamples),
        5: 0.05 + rng.normal(0, 0.01, n_resamples),
    }
    rank_by_cand = {1: 1, 2: 2, 3: 3, 4: 4, 5: 5}

    agg, n_candidatos = compute_outros_estimates(estimates, rank_by_cand, min_rank=4)

    assert n_candidatos == 2
    # Soma ELEMENTWISE, não subtração — exatamente arr4 + arr5.
    assert np.array_equal(agg, estimates[4] + estimates[5])

    # "IC contém a soma dos pontos": mean(agg) == mean(arr4) + mean(arr5)
    # (linearidade da soma — sempre verdadeiro, não é uma coincidência
    # estatística), e o ponto está estritamente dentro do intervalo
    # [percentil 2.5, percentil 97.5] do próprio `agg` (é a média de uma
    # distribuição aproximadamente simétrica em torno dela mesma).
    expected_point = float(np.mean(estimates[4])) + float(np.mean(estimates[5]))
    assert float(np.mean(agg)) == pytest.approx(expected_point, abs=1e-9)
    lower = float(np.percentile(agg, 2.5))
    upper = float(np.percentile(agg, 97.5))
    assert lower <= expected_point <= upper


def test_3_candidatos_n_candidatos_zero() -> None:
    rng = np.random.default_rng(1)
    n_resamples = 500
    estimates = {
        1: 0.50 + rng.normal(0, 0.01, n_resamples),
        2: 0.30 + rng.normal(0, 0.01, n_resamples),
        3: 0.20 + rng.normal(0, 0.01, n_resamples),
    }
    rank_by_cand = {1: 1, 2: 2, 3: 3}

    agg, n_candidatos = compute_outros_estimates(estimates, rank_by_cand, min_rank=4)

    assert n_candidatos == 0
    assert agg.shape == (n_resamples,)
    assert np.all(agg == 0.0)


def test_estimates_vazio() -> None:
    agg, n_candidatos = compute_outros_estimates({}, {}, min_rank=4)
    assert n_candidatos == 0
    assert agg.shape == (0,)


def test_candidato_ausente_do_rank_by_cand_nao_entra_em_outros() -> None:
    """Fail-safe: candidato sem entrada em `rank_by_cand` é tratado como
    rank 0 — nunca entra em "outros" por omissão."""
    estimates = {1: np.full(10, 0.5), 2: np.full(10, 0.2)}
    agg, n_candidatos = compute_outros_estimates(estimates, {1: 1}, min_rank=4)
    assert n_candidatos == 0
    assert np.all(agg == 0.0)


# ---------------------------------------------------------------------------
# _outros_metric_payload — shape do bloco `participacao.outros`
# ---------------------------------------------------------------------------


def test_outros_metric_payload_shape() -> None:
    estimates = np.array([0.10, 0.12, 0.11, 0.13, 0.09])
    payload = _outros_metric_payload(estimates, n_candidatos=3)

    assert payload is not None
    assert payload["pct_atual"] is None  # patched pelo caller com dado real
    assert payload["base"] == "votaveis"
    assert payload["n_candidatos"] == 3
    assert payload["pct_projetado"] == pytest.approx(100.0 * float(np.mean(estimates)))
    assert payload["lower"] <= payload["pct_projetado"] <= payload["upper"]


def test_outros_metric_payload_none_quando_n_candidatos_zero() -> None:
    assert _outros_metric_payload(np.zeros(10), n_candidatos=0) is None
