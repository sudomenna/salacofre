"""`api/model/extrapolation.py` — regra de três por zona (RF-011/012/013),
plano `tem-um-erro-eu-velvety-sprout.md` § A/F.

Cobertura pedida pelo briefing da tarefa:
  - reprodutibilidade bit-a-bit nas duas bases (mesmo seed);
  - seeds distintos divergem;
  - `esi = te/2` dobra `votos_projetados` (share não muda, volume dobra);
  - razão de somas != média simples das zonas;
  - E3 (zona não apurada) não altera o share da UF, soma `te*r_v*s_c`,
    `n_zonas_imputadas == 1`;
  - RF-018 (<5% apurado) infla o CI 1.5x nas DUAS bases;
  - identidade `Σ_c est_comparecimento == vv/c` por resample (van=0);
  - pareamento `est_a + est_b == 1` elementwise com 2 candidatos (base
    votáveis, sem sobra de votos);
  - `None` para 0 zonas / `votaveis = 0` / `weight = 0`;
  - `aggregate_national_votos` soma UF -> Brasil;
  - `impute_uf_from_national` — CI +-10pp (RF-017 2o nível).
"""

from __future__ import annotations

import numpy as np
import pytest

from api.model.extrapolation import (
    ZonaCandidatos,
    aggregate_national_votos,
    estimate_uf_candidatos,
    impute_uf_from_national,
)


def _zona(
    cod_zona: int,
    weight: int,
    votos: dict[int, int],
    *,
    eleitores_aptos: int = 1000,
    eleitores_instalados: int = 1000,
    comparecimento: int = 800,
    votaveis: int | None = None,
    validos: int | None = None,
    brancos: int = 10,
    nulos: int = 10,
) -> ZonaCandidatos:
    """Constrói uma `ZonaCandidatos` sintética.

    `votaveis`/`validos` default para `Σvotos` (nenhum anulado/sub
    judice) — mantém a identidade `Σvap_c == vvc == vv` que vários testes
    abaixo exploram (van=0, RF-020.2).
    """
    total_votos = sum(votos.values())
    return {
        "cod_zona": cod_zona,
        "weight": weight,
        "eleitores_aptos": eleitores_aptos,
        "eleitores_instalados": eleitores_instalados,
        "comparecimento": comparecimento,
        "votaveis": votaveis if votaveis is not None else total_votos,
        "validos": validos if validos is not None else total_votos,
        "brancos": brancos,
        "nulos": nulos,
        "votos": dict(votos),
    }


# ---------------------------------------------------------------------------
# Reprodutibilidade / determinismo (constituição § 6)
# ---------------------------------------------------------------------------


def test_reprodutibilidade_bit_a_bit_mesmo_seed_duas_bases() -> None:
    zonas = [
        _zona(1, 1000, {100: 550, 200: 250}, votaveis=800, comparecimento=800),
        _zona(2, 2000, {100: 300, 200: 500}, votaveis=800, comparecimento=800),
    ]
    r1 = estimate_uf_candidatos(zonas, pct_apurado_uf=100.0, seed=42)
    r2 = estimate_uf_candidatos(zonas, pct_apurado_uf=100.0, seed=42)
    assert r1 is not None and r2 is not None
    for cod in (100, 200):
        assert np.array_equal(
            r1["por_candidato"][cod]["estimates_votaveis"],
            r2["por_candidato"][cod]["estimates_votaveis"],
        )
        assert np.array_equal(
            r1["por_candidato"][cod]["estimates_comparecimento"],
            r2["por_candidato"][cod]["estimates_comparecimento"],
        )


def test_seeds_distintos_divergem() -> None:
    zonas = [
        _zona(1, 1000, {100: 550, 200: 250}, votaveis=800, comparecimento=800),
        _zona(2, 2000, {100: 300, 200: 500}, votaveis=800, comparecimento=800),
        _zona(3, 1500, {100: 400, 200: 400}, votaveis=800, comparecimento=800),
    ]
    r1 = estimate_uf_candidatos(zonas, pct_apurado_uf=100.0, seed=1)
    r2 = estimate_uf_candidatos(zonas, pct_apurado_uf=100.0, seed=2)
    assert r1 is not None and r2 is not None
    assert not np.array_equal(
        r1["por_candidato"][100]["estimates_votaveis"],
        r2["por_candidato"][100]["estimates_votaveis"],
    )


# ---------------------------------------------------------------------------
# Fator de escala k = te/esi (RF-011)
# ---------------------------------------------------------------------------


def test_esi_metade_de_te_dobra_votos_projetados() -> None:
    """`k = te/esi = 2` deve DOBRAR `votos_projetados` (volume absoluto),
    mas manter o `pct_projetado_votaveis` (share não muda com `k`, ver
    docstring do módulo)."""
    votos = {100: 600, 200: 400}
    zona_k1 = _zona(
        1, 1000, votos, eleitores_aptos=1000, eleitores_instalados=1000,
        votaveis=1000, comparecimento=800,
    )
    zona_k2 = _zona(
        1, 1000, votos, eleitores_aptos=1000, eleitores_instalados=500,
        votaveis=1000, comparecimento=800,
    )

    r_k1 = estimate_uf_candidatos([zona_k1], pct_apurado_uf=100.0, seed=7)
    r_k2 = estimate_uf_candidatos([zona_k2], pct_apurado_uf=100.0, seed=7)
    assert r_k1 is not None and r_k2 is not None

    for cod in (100, 200):
        p1 = r_k1["por_candidato"][cod]["pct_projetado_votaveis"]
        p2 = r_k2["por_candidato"][cod]["pct_projetado_votaveis"]
        assert p1 == pytest.approx(p2, abs=1e-6)

        v1 = r_k1["por_candidato"][cod]["votos_projetados"]
        v2 = r_k2["por_candidato"][cod]["votos_projetados"]
        assert v2 == pytest.approx(2 * v1, rel=0.01)


# ---------------------------------------------------------------------------
# Razão de somas != média simples (RF-012)
# ---------------------------------------------------------------------------


def test_razao_de_somas_diferente_de_media_simples() -> None:
    """zona1: 60/100 vvc (60%); zona2: 90/900 vvc (10%). Média simples das
    zonas = 35%; razão de somas (Σvap/Σvvc) = 150/1000 = 15%."""
    zonas = [
        _zona(1, 100, {100: 60, 200: 40}, votaveis=100, comparecimento=100),
        _zona(2, 900, {100: 90, 200: 810}, votaveis=900, comparecimento=900),
    ]
    r = estimate_uf_candidatos(zonas, pct_apurado_uf=100.0, seed=3)
    assert r is not None
    pct_100 = r["por_candidato"][100]["pct_projetado_votaveis"]
    assert pct_100 == pytest.approx(15.0, abs=0.5)
    assert pct_100 != pytest.approx(35.0, abs=1.0)


# ---------------------------------------------------------------------------
# E3 — zona não apurada, imputação hierárquica (RF-013)
# ---------------------------------------------------------------------------


def test_e3_zona_nao_apurada_nao_altera_share_soma_volume() -> None:
    apurada = _zona(1, 1000, {100: 600, 200: 400}, votaveis=1000, comparecimento=800)
    nao_apurada = _zona(
        2, 2000, {}, eleitores_aptos=2000, eleitores_instalados=0,
        votaveis=0, comparecimento=0,
    )

    r_com_imputada = estimate_uf_candidatos(
        [apurada, nao_apurada], pct_apurado_uf=50.0, seed=11
    )
    r_so_apurada = estimate_uf_candidatos([apurada], pct_apurado_uf=100.0, seed=11)
    assert r_com_imputada is not None and r_so_apurada is not None

    assert r_com_imputada["n_zonas"] == 1
    assert r_com_imputada["n_zonas_imputadas"] == 1

    for cod in (100, 200):
        share_com = r_com_imputada["por_candidato"][cod]["pct_projetado_votaveis"]
        share_sem = r_so_apurada["por_candidato"][cod]["pct_projetado_votaveis"]
        assert share_com == pytest.approx(share_sem, abs=1e-6)

    # Volume total projetado cresce (te da zona não apurada entra na soma):
    # scale = (1000 + 2000) / 1000 = 3.
    assert r_com_imputada["base_votaveis_projetada"] == pytest.approx(
        r_so_apurada["base_votaveis_projetada"] * 3, rel=0.02
    )


# ---------------------------------------------------------------------------
# RF-018 — <5% apurado infla CI 1.5x nas duas bases
# ---------------------------------------------------------------------------


def test_rf018_infla_ci_1_5x_nas_duas_bases() -> None:
    zonas = [
        _zona(1, 1000, {100: 550, 200: 250}, votaveis=800, comparecimento=800),
        _zona(2, 2000, {100: 300, 200: 500}, votaveis=800, comparecimento=800),
        _zona(3, 1500, {100: 420, 200: 380}, votaveis=800, comparecimento=800),
    ]
    r_low = estimate_uf_candidatos(zonas, pct_apurado_uf=2.0, seed=99)
    r_high = estimate_uf_candidatos(zonas, pct_apurado_uf=50.0, seed=99)
    assert r_low is not None and r_high is not None

    for cod in (100, 200):
        low = r_low["por_candidato"][cod]
        high = r_high["por_candidato"][cod]
        width_low_v = low["upper_votaveis"] - low["lower_votaveis"]
        width_high_v = high["upper_votaveis"] - high["lower_votaveis"]
        assert width_low_v == pytest.approx(width_high_v * 1.5, rel=0.05)

        width_low_c = low["upper_comparecimento"] - low["lower_comparecimento"]
        width_high_c = high["upper_comparecimento"] - high["lower_comparecimento"]
        assert width_low_c == pytest.approx(width_high_c * 1.5, rel=0.05)


# ---------------------------------------------------------------------------
# Identidade Σ_c est_comparecimento == vv/c (van = 0, zona única)
# ---------------------------------------------------------------------------


def test_soma_estimates_comparecimento_igual_vv_sobre_c_zona_unica() -> None:
    """Com 1 única zona, o bootstrap é degenerado (sempre reamostra a
    mesma zona) — Σ_c est_comparecimento[i] == vv/c EXATAMENTE, em
    qualquer resample, quando Σvotos == vv (van=0, sem candidato
    ausente)."""
    votos = {100: 300, 200: 500}
    zona = _zona(1, 1000, votos, votaveis=800, comparecimento=800)
    r = estimate_uf_candidatos([zona], pct_apurado_uf=100.0, seed=5)
    assert r is not None

    vv = sum(votos.values())
    c = zona["comparecimento"]
    expected = vv / c

    soma = (
        r["por_candidato"][100]["estimates_comparecimento"]
        + r["por_candidato"][200]["estimates_comparecimento"]
    )
    assert np.allclose(soma, expected)


# ---------------------------------------------------------------------------
# Pareamento — 2 candidatos, base votáveis, sem sobra (RF-020.2)
# ---------------------------------------------------------------------------


def test_pareamento_2_candidatos_soma_1_base_votaveis() -> None:
    """2 candidatos cujo Σvap == vvc em TODA zona (sem anulados/sub
    judice) — `est_a + est_b == 1` elementwise, em TODOS os resamples,
    porque o MESMO `idx` reamostra numerador e denominador."""
    zonas = [
        _zona(1, 1000, {100: 550, 200: 450}, votaveis=1000, comparecimento=900),
        _zona(2, 2000, {100: 300, 200: 700}, votaveis=1000, comparecimento=900),
        _zona(3, 1500, {100: 420, 200: 580}, votaveis=1000, comparecimento=900),
    ]
    r = estimate_uf_candidatos(zonas, pct_apurado_uf=100.0, seed=17)
    assert r is not None

    soma = (
        r["por_candidato"][100]["estimates_votaveis"]
        + r["por_candidato"][200]["estimates_votaveis"]
    )
    assert np.allclose(soma, 1.0)


# ---------------------------------------------------------------------------
# Casos de borda — None
# ---------------------------------------------------------------------------


def test_zero_zonas_retorna_none() -> None:
    assert estimate_uf_candidatos([], pct_apurado_uf=0.0, seed=1) is None


def test_todas_zonas_com_votaveis_zero_retorna_none() -> None:
    zonas = [_zona(1, 1000, {}, votaveis=0, comparecimento=0)]
    assert estimate_uf_candidatos(zonas, pct_apurado_uf=0.0, seed=1) is None


def test_todas_zonas_com_weight_zero_retorna_none() -> None:
    zonas = [_zona(1, 0, {100: 600, 200: 400}, votaveis=1000, comparecimento=800)]
    assert estimate_uf_candidatos(zonas, pct_apurado_uf=100.0, seed=1) is None


# ---------------------------------------------------------------------------
# aggregate_national_votos (RF-014)
# ---------------------------------------------------------------------------


def test_aggregate_national_votos_soma_por_candidato_e_total() -> None:
    by_uf = {
        "SP": {
            "por_candidato": {
                100: {"votos_projetados": 1000},
                200: {"votos_projetados": 2000},
            }
        },
        "RJ": {
            "por_candidato": {
                100: {"votos_projetados": 500},
                200: {"votos_projetados": 300},
            }
        },
        "AC": None,
    }
    totals, grand_total = aggregate_national_votos(by_uf)  # type: ignore[arg-type]
    assert totals == {100: 1500, 200: 2300}
    assert grand_total == 3800


# ---------------------------------------------------------------------------
# impute_uf_from_national (RF-017, 2o nível)
# ---------------------------------------------------------------------------


def test_impute_uf_from_national_ci_10pp_e_volume() -> None:
    national_point = {100: 0.55, 200: 0.45}
    national_shares = {
        100: np.full(1000, 0.55, dtype=np.float64),
        200: np.full(1000, 0.45, dtype=np.float64),
    }
    w_uf = 100_000
    r_v_br = 0.6

    est = impute_uf_from_national(national_shares, national_point, w_uf, r_v_br)

    assert est["n_zonas"] == 0
    assert est["n_zonas_imputadas"] == 0
    assert est["base_votaveis_projetada"] == pytest.approx(60_000, rel=1e-6)

    c100 = est["por_candidato"][100]
    assert c100["pct_atual_votaveis"] is None
    assert c100["pct_projetado_votaveis"] == pytest.approx(55.0, abs=1e-6)
    assert c100["lower_votaveis"] == pytest.approx(45.0, abs=1e-6)
    assert c100["upper_votaveis"] == pytest.approx(65.0, abs=1e-6)
    assert c100["votos_projetados"] == pytest.approx(33_000, rel=1e-6)

    c200 = est["por_candidato"][200]
    assert c200["lower_votaveis"] == pytest.approx(35.0, abs=1e-6)
    assert c200["upper_votaveis"] == pytest.approx(55.0, abs=1e-6)


def test_impute_uf_from_national_clipa_perto_das_bordas() -> None:
    national_point = {100: 0.95}
    national_shares = {100: np.full(1000, 0.95, dtype=np.float64)}
    est = impute_uf_from_national(national_shares, national_point, 10_000, 0.5)
    assert est["por_candidato"][100]["upper_votaveis"] == pytest.approx(
        100.0, abs=1e-6
    )


# ---------------------------------------------------------------------------
# RF-015 — o intervalo é o percentil 2,5/97,5, e não qualquer par
# ---------------------------------------------------------------------------
#
# 🔴 Por que estes três testes existem, e por que eles são a coisa mais
# importante deste arquivo.
#
# Medido em 2026-09-18: trocar `np.percentile(est_v, 2.5)` por `10.0` e
# `97.5` por `90.0` em `extrapolation.py:389-398` — o que converte o intervalo
# de confiança de **95% para 80%**, estreitando visivelmente a faixa de
# incerteza em TODAS as projeções que o leitor vê — deixava os **560 testes
# passando**. Zero vermelhos. Nada no repositório prendia esse número.
#
# O que existia antes cobria a *largura relativa* (RF-018 infla 1,5× abaixo de
# 5% apurado) e propriedades de agregação. Largura relativa sobrevive a
# qualquer par simétrico de percentis: 10/90 infla 1,5× tão bem quanto 2,5/97,5.
# Por isso a mutação passava.
#
# A S10 vai mexer exatamente neste número, por decisão D8 do dono (baixar a
# promessa de 95% para o que a medição sustenta). Mexer num número que nenhum
# teste protege é consertar no escuro — por isso o assert entrou na S08, antes.
#
# Os dois ângulos são deliberados e independentes:
#   (1) identidade — o valor emitido É o percentil do array devolvido;
#   (2) massa — ~5% dos resamples ficam fora da faixa.
# O (1) sozinho passaria se alguém trocasse os DOIS lados coerentemente num
# refactor; o (2) sozinho é estatístico e tolerante. Juntos, prendem o número.


def _zonas_para_ci() -> list[ZonaCandidatos]:
    """Trinta zonas com shares espalhados — a densidade é o ponto.

    🔴 **O número de zonas não é decoração, e a primeira versão deste helper
    errou nisso.** Com 4 zonas, reamostrar com reposição produz só **17 valores
    distintos** na distribuição bootstrap: os percentis 2,5 e 2,6 caem
    exatamente no mesmo valor, e uma mutação de um décimo de percentil é
    indetectável *em princípio* — não por frouxidão da asserção, por falta de
    resolução na amostra. Medido em 18/09.

    Com 30 zonas são **214 valores distintos**, a mesma mutação move o limite
    inferior em ~0,06 pp — bem acima da tolerância de 1e-5 — e a fixture ainda
    passa a parecer uma UF de verdade, que tem dezenas de zonas, não quatro.

    Os shares variam de forma determinística (nada de RNG aqui: o bootstrap já
    tem a sua semente e um segundo sorteio só tornaria o teste instável).
    """
    return [
        _zona(
            i + 1,
            1000 + i * 50,
            {100: 200 + i * 15, 200: 800 - (200 + i * 15)},
            votaveis=800,
            comparecimento=800,
        )
        for i in range(30)
    ]


@pytest.mark.parametrize(
    ("base", "chave_lower", "chave_upper", "chave_dist"),
    [
        ("votáveis", "lower_votaveis", "upper_votaveis", "estimates_votaveis"),
        (
            "comparecimento",
            "lower_comparecimento",
            "upper_comparecimento",
            "estimates_comparecimento",
        ),
    ],
)
def test_rf015_ci_emitido_e_o_percentil_2_5_e_97_5_do_proprio_bootstrap(
    base: str,
    chave_lower: str,
    chave_upper: str,
    chave_dist: str,
) -> None:
    """O par emitido é recomputado pelo teste a partir do array devolvido.

    Sem mock: `estimates_*` é a MESMA distribuição de onde o código tirou o
    intervalo, e vem no resultado. O teste calcula 2,5/97,5 por conta própria e
    exige igualdade. Se o código pedir outro par, os números divergem.

    `pct_apurado_uf=50` (≥ 5) mantém `inflate_ci_low_apurado` como identidade
    (RF-018) — sem isso o intervalo emitido seria o percentil JÁ inflado e o
    teste estaria medindo duas coisas ao mesmo tempo.
    """
    r = estimate_uf_candidatos(_zonas_para_ci(), pct_apurado_uf=50.0, seed=42)
    assert r is not None

    for cod in (100, 200):
        est = r["por_candidato"][cod]
        dist = est[chave_dist]  # type: ignore[literal-required]

        esperado_lower = round(100.0 * float(np.percentile(dist, 2.5)), 5)
        esperado_upper = round(100.0 * float(np.percentile(dist, 97.5)), 5)

        assert est[chave_lower] == pytest.approx(  # type: ignore[literal-required]
            esperado_lower, abs=1e-5
        ), f"{base}, candidato {cod}: lower não é o percentil 2,5"
        assert est[chave_upper] == pytest.approx(  # type: ignore[literal-required]
            esperado_upper, abs=1e-5
        ), f"{base}, candidato {cod}: upper não é o percentil 97,5"

        # Anti-vácuo: um intervalo degenerado faria as igualdades acima
        # passarem para qualquer par de percentis.
        assert est[chave_upper] - est[chave_lower] > 0.5, (  # type: ignore[literal-required]
            f"{base}, candidato {cod}: faixa quase nula — a fixture parou de "
            "produzir dispersão e o teste deixou de discriminar"
        )


def test_rf015_cerca_de_5pct_da_massa_fica_fora_da_faixa() -> None:
    """A metade estatística: a faixa deixa ~5% dos resamples de fora.

    É o que "95% de confiança" significa operacionalmente, e é a asserção que
    sobrevive a um refactor que troque a forma de calcular o percentil.

    A tolerância (3%–8%) é folgada de propósito — o alvo é 5% e o ruído de
    reamostragem em 1.000 sorteios é de alguns décimos. Um par 10/90 produziria
    ~20% e um par 0,5/99,5 produziria ~1%: os dois caem fora por larga margem.
    """
    r = estimate_uf_candidatos(_zonas_para_ci(), pct_apurado_uf=50.0, seed=7)
    assert r is not None

    for cod in (100, 200):
        est = r["por_candidato"][cod]
        dist = est["estimates_votaveis"]
        lower_frac = est["lower_votaveis"] / 100.0
        upper_frac = est["upper_votaveis"] / 100.0

        fora = int(np.sum((dist < lower_frac) | (dist > upper_frac)))
        frac_fora = fora / dist.size

        assert 0.03 <= frac_fora <= 0.08, (
            f"candidato {cod}: {frac_fora:.1%} da massa fora da faixa — "
            "um intervalo de 95% deixa ~5% de fora"
        )


# ---------------------------------------------------------------------------
# Fase 5 (plano § A, "Coerência das bases (E2)") — brancos/nulos no MESMO
# `idx`, identidade EXATA por resample.
#
# A promessa da Fase 5 não é "fecha em 100 ± 0,3 pp" (isso é o que a Fase 1
# já fazia, com `brancos_nulos` vindo de `turnout.py` com seed e estimador
# próprios). É identidade exata, resample a resample. Um teste com
# tolerância larga passaria nos DOIS mundos e não discriminaria nada — por
# isso as tolerâncias abaixo são de épsilon de ponto flutuante (1e-12), não
# de décimo de ponto percentual.
# ---------------------------------------------------------------------------


def _zona_fechada(
    cod_zona: int,
    weight: int,
    votos: dict[int, int],
    *,
    eleitores_aptos: int,
    eleitores_instalados: int,
    brancos: int,
    nulos: int,
    anulados: int = 0,
) -> ZonaCandidatos:
    """Zona em que `Σvap + brancos + nulos + anulados == comparecimento`.

    É a identidade do boletim: todo mundo que compareceu votou em alguém,
    em branco, nulo — ou teve o voto anulado/sub judice (art. 265 §2º da
    Res. TSE 23.751/2026), que é o resíduo.
    """
    total_votos = sum(votos.values())
    return {
        "cod_zona": cod_zona,
        "weight": weight,
        "eleitores_aptos": eleitores_aptos,
        "eleitores_instalados": eleitores_instalados,
        "comparecimento": total_votos + brancos + nulos + anulados,
        "votaveis": total_votos,
        "validos": total_votos,
        "brancos": brancos,
        "nulos": nulos,
        "votos": dict(votos),
    }


def _zonas_fechadas() -> list[ZonaCandidatos]:
    return [
        _zona_fechada(
            1, 10000, {13: 3000, 22: 2500, 12: 500},
            eleitores_aptos=10000, eleitores_instalados=8000,
            brancos=300, nulos=200,
        ),
        _zona_fechada(
            2, 5000, {13: 1500, 22: 2100, 12: 90},
            eleitores_aptos=5000, eleitores_instalados=5000,
            brancos=250, nulos=150,
        ),
        _zona_fechada(
            3, 20000, {13: 5000, 22: 3500, 12: 1200},
            eleitores_aptos=20000, eleitores_instalados=12000,
            brancos=300, nulos=200,
        ),
    ]


def test_fase5_identidade_exata_por_resample() -> None:
    """`Σ_c share_comp(c)[r] + share_comp(bn)[r] == 1` para TODO `r`.

    Não `np.allclose` com tolerância de UI: a diferença máxima sobre os
    1.000 resamples tem que ser da ordem do épsilon de float. Se
    brancos/nulos voltar a sair de um bootstrap com seed própria, esta
    diferença sobe para ~1e-3 (os "± 0,3 pp" da Fase 1) e o teste quebra.
    """
    r = estimate_uf_candidatos(_zonas_fechadas(), pct_apurado_uf=60.0, seed=4242)
    assert r is not None
    bn = r["brancos_nulos_comparecimento"]
    assert bn is not None

    total = bn["estimates_comparecimento"].copy()
    for est in r["por_candidato"].values():
        total = total + est["estimates_comparecimento"]

    desvio = float(np.max(np.abs(total - 1.0)))
    assert desvio < 1e-12, (
        f"máximo |Σ − 1| = {desvio:.3e} — a Fase 5 promete identidade EXATA "
        "por resample, não 'fecha em 100 ± 0,3 pp'"
    )


def test_fase5_identidade_exata_tambem_no_ponto_e_no_apurado() -> None:
    """A identidade vale no `pct_projetado` e no `pct_atual`, não só nos
    arrays — é o que a tela mostra."""
    r = estimate_uf_candidatos(_zonas_fechadas(), pct_apurado_uf=60.0, seed=99)
    assert r is not None
    bn = r["brancos_nulos_comparecimento"]
    assert bn is not None

    soma_ponto = bn["pct_projetado_comparecimento"] + sum(
        e["pct_projetado_comparecimento"] for e in r["por_candidato"].values()
    )
    soma_atual = bn["pct_atual_comparecimento"] + sum(
        e["pct_atual_comparecimento"] for e in r["por_candidato"].values()
    )
    # 1e-4 pp, e a folga é SÓ o arredondamento do contrato: `_frac_to_pct`
    # corta em 5 casas (NUMERIC(8,5)), então cada um dos 4 números publicados
    # pode estar até 0,5e-5 pp fora — no pior caso 2e-5 pp na soma. Continua
    # quatro ORDENS DE GRANDEZA abaixo dos ±0,3 pp que a Fase 1 aceitava, que
    # é o que este teste precisa distinguir.
    assert abs(soma_ponto - 100.0) < 1e-4
    assert abs(soma_atual - 100.0) < 1e-4


def test_fase5_identidade_sobrevive_a_pos_estratificacao() -> None:
    """Com estratos, o share da UF vira média ponderada dos shares por
    estrato. A identidade só sobrevive se brancos/nulos percorrer o MESMO
    caminho estratificado — um atalho que calculasse bn sem estratos
    passaria no teste anterior e falharia aqui.
    """
    zonas = _zonas_fechadas()
    estrato_by_cod_zona = {1: 1, 2: 0, 3: 2}
    # Pesos a priori maiores que os observados (há zona não apurada no
    # estrato) — força o caminho de reponderação.
    te_total_by_estrato = {0: 9000.0, 1: 15000.0, 2: 30000.0}
    r = estimate_uf_candidatos(
        zonas,
        pct_apurado_uf=45.0,
        seed=31337,
        estrato_by_cod_zona=estrato_by_cod_zona,
        te_total_by_estrato=te_total_by_estrato,
    )
    assert r is not None
    bn = r["brancos_nulos_comparecimento"]
    assert bn is not None

    total = bn["estimates_comparecimento"].copy()
    for est in r["por_candidato"].values():
        total = total + est["estimates_comparecimento"]
    desvio = float(np.max(np.abs(total - 1.0)))
    assert desvio < 1e-12, f"máximo |Σ − 1| sob estratificação = {desvio:.3e}"


def test_fase5_residuo_de_anulados_aparece_como_residuo() -> None:
    """Quando a zona NÃO fecha (anulados/sub judice), a soma tem que ficar
    ABAIXO de 1 pela fração exata dos anulados — e não ser normalizada para
    1 na marra.

    Este é o teste que impede o conserto errado: forçar `bn = 1 − Σ_c`
    passaria em todos os testes de identidade acima e esconderia o resíduo
    que o art. 265 §2º manda mostrar.
    """
    zonas = [
        _zona_fechada(
            1, 10000, {13: 4000, 22: 3000},
            eleitores_aptos=10000, eleitores_instalados=10000,
            brancos=400, nulos=600, anulados=1000,
        ),
    ]
    r = estimate_uf_candidatos(zonas, pct_apurado_uf=100.0, seed=7)
    assert r is not None
    bn = r["brancos_nulos_comparecimento"]
    assert bn is not None

    total = bn["estimates_comparecimento"].copy()
    for est in r["por_candidato"].values():
        total = total + est["estimates_comparecimento"]
    # comparecimento = 9000; anulados = 1000 → resíduo = 1/9.
    assert np.allclose(total, 1.0 - 1000.0 / 9000.0, atol=1e-12)
    assert float(np.max(total)) < 1.0


def test_fase5_brancos_nulos_nao_consome_sorteio_dos_candidatos() -> None:
    """Calcular brancos/nulos não pode mover nenhum número de candidato.

    Prova por independência: dois datasets com os MESMOS votos e o MESMO
    comparecimento, mas com a divisão brancos/nulos trocada (e anulados
    absorvendo a diferença). Se o cálculo de bn consumisse sorteios do `rng`
    — ou entrasse em qualquer denominador de candidato — os arrays dos
    candidatos divergiriam.
    """
    base = {13: 3000, 22: 2500}
    a = [
        _zona_fechada(
            1, 10000, base,
            eleitores_aptos=10000, eleitores_instalados=8000,
            brancos=300, nulos=200, anulados=0,
        )
    ]
    b = [
        _zona_fechada(
            1, 10000, base,
            eleitores_aptos=10000, eleitores_instalados=8000,
            brancos=50, nulos=50, anulados=400,
        )
    ]
    ra = estimate_uf_candidatos(a, pct_apurado_uf=80.0, seed=555)
    rb = estimate_uf_candidatos(b, pct_apurado_uf=80.0, seed=555)
    assert ra is not None and rb is not None
    for cod in (13, 22):
        assert np.array_equal(
            ra["por_candidato"][cod]["estimates_votaveis"],
            rb["por_candidato"][cod]["estimates_votaveis"],
        )
        assert np.array_equal(
            ra["por_candidato"][cod]["estimates_comparecimento"],
            rb["por_candidato"][cod]["estimates_comparecimento"],
        )
    # ... e mesmo assim os brancos/nulos são DIFERENTES entre os dois (senão
    # o teste acima seria vácuo).
    bna = ra["brancos_nulos_comparecimento"]
    bnb = rb["brancos_nulos_comparecimento"]
    assert bna is not None and bnb is not None
    assert bna["votos_atuais"] == 500
    assert bnb["votos_atuais"] == 100


def test_fase5_contagens_observadas_de_brancos_nulos() -> None:
    """`votos_atuais` = Σ(brancos+nulos) apurados; `comparecimento_observado`
    = Σ comparecimento apurado. São as duas contagens brutas que viram
    `num`/`den` do `pct_atual` nacional em `turnout.aggregate_national_
    participacao` — se saírem erradas, o número nacional sai errado sem que
    nenhuma UF pareça errada."""
    zonas = _zonas_fechadas()
    r = estimate_uf_candidatos(zonas, pct_apurado_uf=60.0, seed=1)
    assert r is not None
    bn = r["brancos_nulos_comparecimento"]
    assert bn is not None
    assert bn["votos_atuais"] == sum(z["brancos"] + z["nulos"] for z in zonas)
    assert r["comparecimento_observado"] == sum(z["comparecimento"] for z in zonas)


def test_fase5_uf_imputada_do_nacional_nao_inventa_brancos_nulos() -> None:
    """UF sem NENHUMA zona apurada: `None`, e `comparecimento_observado` 0.

    A imputação nacional ancora share de CANDIDATO. Estender isso a
    brancos/nulos publicaria uma participação medida numa UF que não
    reportou nada.
    """
    national = {13: np.full(1000, 0.55), 22: np.full(1000, 0.45)}
    est = impute_uf_from_national(national, {13: 0.55, 22: 0.45}, 100_000, 0.7)
    assert est["brancos_nulos_comparecimento"] is None
    assert est["comparecimento_observado"] == 0
