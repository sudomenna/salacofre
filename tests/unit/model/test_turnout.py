"""Fase 1a (RF-020.1) — `api/model/turnout.py`.

Cobertura pedida pelo briefing da tarefa:
  - reprodutibilidade bit-a-bit (mesmo seed → `np.array_equal`);
  - seeds distintos divergem;
  - `pct_apurado < 5` infla a largura do CI em 1.5x (RF-018);
  - clip em [0, 100];
  - agregação nacional com pesos 1:3;
  - `pct_atual` = razão de somas (não média de razões);
  - zero zonas utilizáveis → `None`.
"""

from __future__ import annotations

import numpy as np
import pytest

from api.model.turnout import (
    ZonaParticipacao,
    aggregate_national_participacao,
    estimate_uf_participacao,
    metric_value,
)


def _zona(
    cod_zona: int,
    weight: int,
    *,
    eleitores_instalados: int = 1000,
    comparecimento: int = 800,
    abstencao: int = 200,
    brancos: int = 10,
    nulos: int = 10,
) -> ZonaParticipacao:
    """Constrói uma `ZonaParticipacao` sintética com defaults razoáveis
    (abstenção 20%, brancos+nulos 2.5% do comparecimento)."""
    return {
        "cod_zona": cod_zona,
        "weight": weight,
        "eleitores_aptos": eleitores_instalados,
        "eleitores_instalados": eleitores_instalados,
        "comparecimento": comparecimento,
        "abstencao": abstencao,
        "brancos": brancos,
        "nulos": nulos,
        "validos": comparecimento - brancos - nulos,
        "anulados": 0,
        "sub_judice": 0,
        "psa": 100.0,
    }


# ---------------------------------------------------------------------------
# metric_value
# ---------------------------------------------------------------------------


def test_metric_value_abstencao() -> None:
    z = _zona(1, 1000, eleitores_instalados=1000, abstencao=250)
    assert metric_value(z, "abstencao") == pytest.approx(0.25)


def test_metric_value_brancos_nulos() -> None:
    z = _zona(1, 1000, comparecimento=800, brancos=10, nulos=10)
    assert metric_value(z, "brancos_nulos") == pytest.approx(20.0 / 800.0)


def test_metric_value_denominador_zero_retorna_zero() -> None:
    z = _zona(1, 1000, eleitores_instalados=0)
    assert metric_value(z, "abstencao") == 0.0


# ---------------------------------------------------------------------------
# estimate_uf_participacao — reprodutibilidade
# ---------------------------------------------------------------------------


def test_reprodutibilidade_bit_a_bit_mesmo_seed() -> None:
    zonas = [
        _zona(1, 100_000, abstencao=180, eleitores_instalados=1000),
        _zona(2, 200_000, abstencao=220, eleitores_instalados=1000),
        _zona(3, 50_000, abstencao=200, eleitores_instalados=1000),
    ]

    r1 = estimate_uf_participacao(zonas, "abstencao", pct_apurado_uf=60.0, seed=42)
    r2 = estimate_uf_participacao(zonas, "abstencao", pct_apurado_uf=60.0, seed=42)

    assert r1 is not None and r2 is not None
    assert np.array_equal(r1["estimates"], r2["estimates"])
    assert r1["pct_projetado"] == r2["pct_projetado"]
    assert r1["lower"] == r2["lower"]
    assert r1["upper"] == r2["upper"]


def test_seeds_distintos_divergem() -> None:
    zonas = [
        _zona(1, 100_000, abstencao=180, eleitores_instalados=1000),
        _zona(2, 200_000, abstencao=220, eleitores_instalados=1000),
        _zona(3, 50_000, abstencao=200, eleitores_instalados=1000),
    ]

    r1 = estimate_uf_participacao(zonas, "abstencao", pct_apurado_uf=60.0, seed=1)
    r2 = estimate_uf_participacao(zonas, "abstencao", pct_apurado_uf=60.0, seed=2)

    assert r1 is not None and r2 is not None
    assert not np.array_equal(r1["estimates"], r2["estimates"])


# ---------------------------------------------------------------------------
# RF-018 — pct_apurado < 5% infla CI em 1.5x
# ---------------------------------------------------------------------------


def test_pct_apurado_menor_5_infla_largura_ci_em_1_5x() -> None:
    # Zonas com valores heterogêneos o bastante para o bootstrap gerar um
    # CI com largura não-trivial, mas longe o bastante de 0/100 para o
    # clip não interferir na comparação de larguras.
    zonas = [
        _zona(1, 100_000, abstencao=100, eleitores_instalados=1000),
        _zona(2, 150_000, abstencao=300, eleitores_instalados=1000),
        _zona(3, 80_000, abstencao=200, eleitores_instalados=1000),
        _zona(4, 120_000, abstencao=250, eleitores_instalados=1000),
    ]

    sem_inflar = estimate_uf_participacao(
        zonas, "abstencao", pct_apurado_uf=50.0, seed=7
    )
    com_inflar = estimate_uf_participacao(
        zonas, "abstencao", pct_apurado_uf=2.0, seed=7
    )
    assert sem_inflar is not None and com_inflar is not None

    largura_sem = sem_inflar["upper"] - sem_inflar["lower"]
    largura_com = com_inflar["upper"] - com_inflar["lower"]

    assert largura_com == pytest.approx(largura_sem * 1.5, rel=1e-6)
    # point mantido como centro (RF-018 preserva a projeção central).
    assert com_inflar["pct_projetado"] == pytest.approx(
        sem_inflar["pct_projetado"], abs=1e-9
    )


# ---------------------------------------------------------------------------
# Clip em [0, 100]
# ---------------------------------------------------------------------------


def test_clip_em_0_100_quando_proximo_do_limite() -> None:
    # Abstenção quase total (98%) + baixo apurado (infla CI 1.5x) — deve
    # permanecer dentro de [0, 100] mesmo no limite superior.
    zonas = [
        _zona(1, 100_000, abstencao=980, eleitores_instalados=1000),
        _zona(2, 100_000, abstencao=990, eleitores_instalados=1000),
    ]
    result = estimate_uf_participacao(zonas, "abstencao", pct_apurado_uf=1.0, seed=3)
    assert result is not None
    assert 0.0 <= result["lower"] <= 100.0
    assert 0.0 <= result["upper"] <= 100.0
    assert 0.0 <= result["pct_projetado"] <= 100.0


# ---------------------------------------------------------------------------
# pct_atual = razão de somas (não média de razões por zona)
# ---------------------------------------------------------------------------


def test_pct_atual_e_razao_de_somas_nao_media_de_razoes() -> None:
    # Zona 1: 10/100 = 10%; zona 2: 90/100 = 90% — médias simples dariam
    # 50%, mas a razão de somas (100/200) também dá 50% neste caso
    # simétrico. Usamos denominadores DIFERENTES para desambiguar:
    # zona 1: 10/100 (den pequeno); zona 2: 400/1000 (den grande).
    # Média das razões: (0.10 + 0.40) / 2 = 0.25.
    # Razão das somas: (10 + 400) / (100 + 1000) = 410/1100 ≈ 0.3727.
    z1 = _zona(1, 50_000, abstencao=10, eleitores_instalados=100)
    z2 = _zona(2, 50_000, abstencao=400, eleitores_instalados=1000)

    result = estimate_uf_participacao([z1, z2], "abstencao", pct_apurado_uf=80.0, seed=9)
    assert result is not None
    assert result["pct_atual"] == pytest.approx(100.0 * 410.0 / 1100.0, abs=1e-3)
    # Não deve ser a média simples das razões (25.0).
    assert result["pct_atual"] != pytest.approx(25.0, abs=0.1)
    assert result["num"] == 410
    assert result["den"] == 1100


# ---------------------------------------------------------------------------
# Zero zonas utilizáveis → None
# ---------------------------------------------------------------------------


def test_zero_zonas_retorna_none() -> None:
    assert estimate_uf_participacao([], "abstencao", pct_apurado_uf=50.0, seed=1) is None


def test_todas_zonas_com_denominador_zero_retorna_none() -> None:
    zonas = [_zona(1, 100_000, eleitores_instalados=0)]
    assert estimate_uf_participacao(zonas, "abstencao", 50.0, seed=1) is None


def test_todas_zonas_com_weight_zero_retorna_none() -> None:
    zonas = [_zona(1, 0, eleitores_instalados=1000)]
    assert estimate_uf_participacao(zonas, "abstencao", 50.0, seed=1) is None


# ---------------------------------------------------------------------------
# aggregate_national_participacao — pesos 1:3
# ---------------------------------------------------------------------------


def test_agregacao_nacional_pesos_1_3() -> None:
    # Zonas com valor CONSTANTE dentro de cada UF — elimina ruído de
    # bootstrap na comparação (mean(estimates) == valor constante,
    # sem depender de quantos resamples caem em cada índice).
    zonas_ac = [_zona(1, 10_000, abstencao=100, eleitores_instalados=1000)]  # 10%
    zonas_sp = [_zona(1, 30_000, abstencao=300, eleitores_instalados=1000)]  # 30%

    est_ac = estimate_uf_participacao(zonas_ac, "abstencao", 100.0, seed=1)
    est_sp = estimate_uf_participacao(zonas_sp, "abstencao", 100.0, seed=2)
    assert est_ac is not None and est_sp is not None

    # Pesos 1:3 (AC:SP) — nacional deve ficar próximo de
    # (10*1 + 30*3) / 4 = 25.0.
    nacional = aggregate_national_participacao(
        {"AC": est_ac, "SP": est_sp},
        {"AC": 10_000_000, "SP": 30_000_000},
    )
    assert nacional is not None
    assert nacional["pct_projetado"] == pytest.approx(25.0, abs=0.05)


def test_agregacao_nacional_pct_atual_e_razao_de_somas() -> None:
    zonas_ac = [_zona(1, 10_000, abstencao=10, eleitores_instalados=100)]
    zonas_sp = [_zona(1, 30_000, abstencao=400, eleitores_instalados=1000)]

    est_ac = estimate_uf_participacao(zonas_ac, "abstencao", 100.0, seed=1)
    est_sp = estimate_uf_participacao(zonas_sp, "abstencao", 100.0, seed=2)
    assert est_ac is not None and est_sp is not None

    nacional = aggregate_national_participacao(
        {"AC": est_ac, "SP": est_sp},
        {"AC": 10_000_000, "SP": 30_000_000},
    )
    assert nacional is not None
    # Σnum/Σden = (10 + 400) / (100 + 1000) — INDEPENDENTE do peso eleitoral
    # usado para o ponto projetado (mesma filosofia do nível UF).
    assert nacional["pct_atual"] == pytest.approx(100.0 * 410.0 / 1100.0, abs=1e-3)


def test_agregacao_nacional_sem_ufs_utilizaveis_retorna_none() -> None:
    assert aggregate_national_participacao({}, {}) is None
    assert aggregate_national_participacao({"SP": None}, {"SP": 1000}) is None
    # UF com estimate válido mas eleitorado_total ausente/zero → não conta.
    zonas = [_zona(1, 1000, abstencao=100, eleitores_instalados=1000)]
    est = estimate_uf_participacao(zonas, "abstencao", 100.0, seed=1)
    assert aggregate_national_participacao({"SP": est}, {"SP": 0}) is None
