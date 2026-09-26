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
    eleitores_aptos: int | None = None,
    anulados: int = 0,
    sub_judice: int = 0,
) -> ZonaParticipacao:
    """Constrói uma `ZonaParticipacao` sintética com defaults razoáveis
    (abstenção 20%, brancos+nulos 2.5% do comparecimento).

    ⚠️ `eleitores_aptos` default = `eleitores_instalados`, e isso é uma
    COINCIDÊNCIA da fixture, não um fato do TSE. Durante apuração parcial
    `aptos > instalados` (as seções ainda não instaladas contam no `e.te` e
    não no `e.esi`). Medido em 2026-09-26: mutar o denominador de
    `abstencao` de `eleitores_instalados` para `eleitores_aptos` deixava as
    18 asserções deste arquivo **verdes**, porque nenhuma passava os dois
    valores diferentes. Quem for testar base/denominador: passe
    `eleitores_aptos` explicitamente (ver
    `test_metric_value_abstencao_usa_instalados_nao_aptos`).
    """
    return {
        "cod_zona": cod_zona,
        "weight": weight,
        "eleitores_aptos": (
            eleitores_instalados if eleitores_aptos is None else eleitores_aptos
        ),
        "eleitores_instalados": eleitores_instalados,
        "comparecimento": comparecimento,
        "abstencao": abstencao,
        "brancos": brancos,
        "nulos": nulos,
        "validos": comparecimento - brancos - nulos - anulados - sub_judice,
        "votaveis": comparecimento - brancos - nulos,
        "anulados": anulados,
        "sub_judice": sub_judice,
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
# metric_value — as três fatias de voto separadas (spec 021, RF-195)
#
# Números escolhidos para DISCRIMINAR: válidos, brancos e nulos têm três
# valores distintos entre si, distintos do agregado `brancos_nulos`, e
# distintos do que a função devolveria por qualquer troca de base. Uma
# fixture com brancos == nulos deixaria passar um ramo que trocasse os dois.
# ---------------------------------------------------------------------------


def test_metric_value_validos() -> None:
    z = _zona(1, 1000, comparecimento=800, brancos=24, nulos=16)
    # 800 - 24 - 16 = 760 válidos sobre 800 de comparecimento.
    assert metric_value(z, "validos") == pytest.approx(760.0 / 800.0)


def test_metric_value_brancos() -> None:
    z = _zona(1, 1000, comparecimento=800, brancos=24, nulos=16)
    assert metric_value(z, "brancos") == pytest.approx(24.0 / 800.0)


def test_metric_value_nulos() -> None:
    z = _zona(1, 1000, comparecimento=800, brancos=24, nulos=16)
    assert metric_value(z, "nulos") == pytest.approx(16.0 / 800.0)


def test_brancos_e_nulos_separados_somam_o_agregado() -> None:
    """A identidade que faz as fatias novas conviverem com `brancos_nulos`.

    Se um dia alguém trocar a base de uma das duas fatias novas e não da
    outra, esta asserção cai — é o que impede quatro números que não
    dividem o mesmo inteiro.
    """
    z = _zona(1, 1000, comparecimento=800, brancos=24, nulos=16)
    assert metric_value(z, "brancos") + metric_value(z, "nulos") == pytest.approx(
        metric_value(z, "brancos_nulos")
    )


def test_metric_value_abstencao_usa_instalados_nao_aptos() -> None:
    """🔴 O denominador de `abstencao` é `e.esi`, NUNCA `e.te`.

    Este teste existe porque a mutação que troca um pelo outro **sobrevivia**
    a todo o arquivo até 2026-09-26: o helper `_zona` fazia
    `eleitores_aptos = eleitores_instalados`, então os dois denominadores
    davam o mesmo número e nenhuma asserção podia distinguir. Aqui eles são
    deliberadamente diferentes — `aptos > instalados`, que é o estado real de
    toda apuração parcial (seções ainda não instaladas contam em `te` e não
    em `esi`).

    Se a base voltar a ser `aptos`, o valor cai de 0,25 para 0,125 e este
    teste reprova. Ver `turnout.py` § denominador oficial, e o "Fora de
    escopo" da spec 021 (a base de `abstencao` NÃO muda).
    """
    z = _zona(1, 1000, eleitores_instalados=1000, abstencao=250, eleitores_aptos=2000)
    assert metric_value(z, "abstencao") == pytest.approx(0.25)  # 250/1000
    assert metric_value(z, "abstencao") != pytest.approx(0.125)  # 250/2000


def test_metric_value_validos_nao_e_votaveis_quando_ha_anulados() -> None:
    """🔴 `validos` é `v.vv`, não `v.vvc` (votáveis) — ADR-0018.

    A diferença é `anulados + sub_judice`, e ela não é decorativa: medida em
    **14,20% do comparecimento** na captura real do simulado do TSE
    (`tests/fixtures/tse/2026-sim/br-c0001-e021270-u.json`, `psa` 100%):
    `van` 9.218.887 + `vansj` 10.503.573 = 19.722.460 sobre `tv`
    138.863.131.

    Sem `anulados`/`sub_judice` > 0 na fixture, `validos == votaveis` por
    coincidência e um ramo que lesse `votaveis` passaria batido — é o mesmo
    modo de falha do teste de `abstencao` acima.
    """
    z = _zona(1, 1000, comparecimento=800, brancos=24, nulos=16, anulados=60, sub_judice=40)
    assert z["votaveis"] == 760  # 800 - 24 - 16
    assert z["validos"] == 660  # 760 - 60 - 40
    assert metric_value(z, "validos") == pytest.approx(660.0 / 800.0)
    # A leitura errada (votáveis no lugar de válidos) daria 0,95.
    assert metric_value(z, "validos") != pytest.approx(760.0 / 800.0)


def test_as_quatro_fatias_nao_somam_o_comparecimento_quando_ha_anulados() -> None:
    """A aritmética do TSE que a spec 021 nomeia, em forma de asserção.

    `validos + brancos + nulos` fecha o comparecimento **só** quando
    `anulados + sub_judice == 0`. Com eles > 0 sobra exatamente essa soma —
    é o buraco de 14,2% que o círculo 3 da spec não tem fatia para nomear
    (ver relatório da tarefa).
    """
    z = _zona(1, 1000, comparecimento=800, brancos=24, nulos=16, anulados=60, sub_judice=40)
    soma = (
        metric_value(z, "validos")
        + metric_value(z, "brancos")
        + metric_value(z, "nulos")
    )
    assert soma == pytest.approx(700.0 / 800.0)
    falta = 1.0 - soma
    assert falta == pytest.approx((60.0 + 40.0) / 800.0)


def test_metrica_desconhecida_estoura_em_vez_de_adivinhar() -> None:
    """🔴 Sem `raise`, `_metric_num_den` devolvia brancos+nulos para QUALQUER
    métrica não-`abstencao`.

    Medido em 2026-09-26, antes da mudança: `_metric_num_den(z, "validos")`
    devolvia `(20.0, 800.0)` — 2,5% — num contexto em que válidos eram 780 de
    800 (97,5%). Errado por um fator de 39, sem erro, sem log, sem teste
    vermelho. É o padrão "default silencioso em conversor de enum" que esta
    base já pagou três vezes.
    """
    z = _zona(1, 1000)
    with pytest.raises(ValueError, match="desconhecida"):
        metric_value(z, "metrica_que_nao_existe")  # type: ignore[arg-type]


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
