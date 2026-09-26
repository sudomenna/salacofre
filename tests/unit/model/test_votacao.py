"""Spec 021 — o bloco `votacao` do payload (RF-199 contagens, RF-195 projeção).

O que este arquivo protege, em ordem de perigo:

1. **O agregado do TSE não vira zona.** `particionar_por_nivel` é a fronteira
   entre o que alimenta o MODELO e o que alimenta `votacao`. Sem ela, a linha
   de nível `"uf"` (que chega com `cod_zona = 0`) entra na lista de zonas como
   uma "zona" do tamanho do estado — e o descarte por sentinela pode, pior
   ainda, jogar fora TODAS as zonas reais da UF por frescor.
2. **A linha `BR` não vira 28ª UF** no caminho majoritário.
3. **As quatro fatias projetadas NÃO fecham em `aptos`** — e não devem. O vão
   é voto anulado, e fechar exigiria fabricar 13,9 milhões de válidos.
4. Os TRÊS estados do payload: ausente ("não sabemos"), `aptos > 0` com o
   resto zero ("não começou", RF-193b), e apurando.

Números de verdade medida vêm da captura real do simulado do TSE a 100%
apurado (`tests/fixtures/tse/2026-sim/br-c0001-e021270-u.json`).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from api.model.project import (
    NIVEL_BR,
    NIVEL_UF,
    NIVEL_ZONA,
    _snapshots_por_uf,
    build_votacao_payload,
    nivel_do_snapshot,
    particionar_por_nivel,
    projetar_fatias_em_contagens,
    somar_contagens_agregadas,
    zonas_para_o_modelo,
)

FIXTURE_BR = (
    Path(__file__).resolve().parents[2]
    / "fixtures"
    / "tse"
    / "2026-sim"
    / "br-c0001-e021270-u.json"
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ea20(
    *,
    te: int,
    esi: int | None = None,
    c: int = 0,
    a: int = 0,
    vb: int = 0,
    tvn: int = 0,
    vv: int = 0,
    van: int = 0,
    vansj: int = 0,
) -> dict[str, Any]:
    """Envelope EA20 mínimo com os objetos de raiz `e`/`v` que
    `_extract_zone_participacao` lê. `esi` default = `te` (apuração
    completa); passe menor para simular seção não instalada."""
    return {
        "e": {
            "te": str(te),
            "esi": str(te if esi is None else esi),
            "c": str(c),
            "a": str(a),
        },
        "v": {
            "vb": str(vb),
            "tvn": str(tvn),
            "vv": str(vv),
            "vvc": str(vv + van + vansj),
            "van": str(van),
            "vansj": str(vansj),
        },
        "s": {"psa": "0,00"},
    }


def _snap(
    uf: str,
    *,
    nivel: str = NIVEL_ZONA,
    cod_zona: int = 1,
    payload: dict[str, Any] | None = None,
    ts: int = 100,
) -> dict[str, Any]:
    return {
        "uf": uf,
        "cod_municipio_tse": 0 if nivel != NIVEL_ZONA else 1000,
        "cod_zona": 0 if nivel != NIVEL_ZONA else cod_zona,
        "nivel": nivel,
        "pct_apurado": 100.0,
        "payload": payload if payload is not None else _ea20(te=1000),
        "ts": ts,
    }


def _est(pct_projetado: float) -> dict[str, Any]:
    """`ParticipacaoEstimate` mínimo — só `pct_projetado` é lido por
    `projetar_fatias_em_contagens`."""
    return {
        "pct_atual": pct_projetado,
        "pct_projetado": pct_projetado,
        "lower": pct_projetado,
        "upper": pct_projetado,
        "n_zonas": 1,
        "num": 0,
        "den": 1,
        "estimates": np.zeros(1),
    }


def _verdade_br() -> dict[str, int]:
    """As contagens reais da captura do TSE a 100% apurado."""
    d = json.loads(FIXTURE_BR.read_text())
    e, v = d["e"], d["v"]
    num = lambda x: int(round(float(str(x).replace(",", "."))))  # noqa: E731
    return {
        "aptos": num(e["te"]),
        "instalados": num(e["esi"]),
        "comparecimento": num(e["c"]),
        "abstencao": num(e["a"]),
        "validos": num(v["vv"]),
        "brancos": num(v["vb"]),
        "nulos": num(v["tvn"]),
        "anulados": num(v["van"]),
        "sub_judice": num(v["vansj"]),
    }


# ---------------------------------------------------------------------------
# nivel_do_snapshot — o default é "zona", e isso sustenta as fixtures antigas
# ---------------------------------------------------------------------------


def test_nivel_ausente_e_zona() -> None:
    """Linha gravada antes da migration não tem a coluna. Toda ela é de zona."""
    assert nivel_do_snapshot({"uf": "SP"}) == NIVEL_ZONA


def test_nivel_none_e_zona() -> None:
    assert nivel_do_snapshot({"uf": "SP", "nivel": None}) == NIVEL_ZONA


def test_nivel_normaliza_caixa_e_espaco() -> None:
    assert nivel_do_snapshot({"nivel": "  UF  "}) == NIVEL_UF
    assert nivel_do_snapshot({"nivel": "BR"}) == NIVEL_BR


def test_nivel_desconhecido_cai_em_zona() -> None:
    """Valor fora do enum degrada para zona — o lado SEGURO do erro.

    Tratar um nível desconhecido como agregado tiraria a linha do modelo (que
    é o que calcula a eleição); tratá-la como zona no máximo a põe onde ela
    provavelmente já estava.
    """
    assert nivel_do_snapshot({"nivel": "municipio"}) == NIVEL_ZONA


# ---------------------------------------------------------------------------
# particionar_por_nivel / zonas_para_o_modelo — a fronteira perigosa
# ---------------------------------------------------------------------------


def test_particao_separa_agregado_de_zona() -> None:
    zona = _snap("SP", cod_zona=1)
    agregado_uf = _snap("SP", nivel=NIVEL_UF)
    agregado_br = _snap("BR", nivel=NIVEL_BR)
    zonas, agregados = particionar_por_nivel([zona, agregado_uf, agregado_br])
    assert zonas == [zona]
    assert agregados == [agregado_uf, agregado_br]


def test_particao_nao_duplica_o_agregado() -> None:
    """A primeira versão desta função devolvia `(agregados, agregados)` na
    válvula do modo `uf` e o chamador concatenava as duas — o agregado saía
    DUPLICADO de `fetch_snapshots`. A função é pura; a válvula mora fora."""
    agregado = _snap("SP", nivel=NIVEL_UF)
    zonas, agregados = particionar_por_nivel([agregado])
    assert zonas == []
    assert agregados == [agregado]


def test_agregado_mais_fresco_nao_engole_as_zonas_reais() -> None:
    """🔴 O modo de falha mais grave da spec 021.

    `_discard_zero_zona_sentinel_when_real_zonas_exist` escolhe entre a
    família `cod_zona = 0` e a de zonas reais **por frescor**, com o empate
    favorecendo a sentinela. O agregado é buscado no MESMO ciclo que as
    zonas, então seu `ts` é ≥ o delas com facilidade. Se ele entrasse na
    partição de zonas, TODAS as zonas reais de SP seriam descartadas e o
    modelo projetaria o estado a partir de uma linha só — em silêncio.

    A partição por `nivel` roda ANTES do descarte, então isso não acontece.
    """
    z1 = _snap("SP", cod_zona=1, ts=100)
    z2 = _snap("SP", cod_zona=2, ts=100)
    agregado = _snap("SP", nivel=NIVEL_UF, ts=999)  # mais fresco de propósito
    zonas, agregados = particionar_por_nivel([z1, z2, agregado])
    assert zonas == [z1, z2], "as zonas reais têm de sobreviver ao agregado fresco"
    assert agregados == [agregado]
    # E o que vai para o modelo são as zonas, não o agregado.
    assert zonas_para_o_modelo(zonas, agregados) == [z1, z2]


def test_valvula_do_modo_uf_sem_zona_nenhuma() -> None:
    """Modo `TSE_GRANULARIDADE=uf`: não há zona, e o agregado É o insumo do
    modelo. Sem a válvula o modelo ficaria com zero zonas e cegaria."""
    agregado = _snap("SP", nivel=NIVEL_UF)
    assert zonas_para_o_modelo([], [agregado]) == [agregado]


def test_valvula_nao_dispara_quando_ha_zona() -> None:
    zona = _snap("SP", cod_zona=1)
    agregado = _snap("SP", nivel=NIVEL_UF)
    assert zonas_para_o_modelo([zona], [agregado]) == [zona]


def test_sem_zona_e_sem_agregado_continua_vazio() -> None:
    assert zonas_para_o_modelo([], []) == []


# ---------------------------------------------------------------------------
# _snapshots_por_uf — a linha BR não é uma unidade federativa
# ---------------------------------------------------------------------------


def test_br_nao_entra_como_28a_uf() -> None:
    """🔴 O achado latente que a decisão do dono ativou.

    Antes da spec 021, `compute_uf_projections` e `compute_participacao`
    agrupavam com `setdefault(s["uf"], ...)` cru. Uma linha `uf = "BR"`
    entrava como 28ª unidade federativa, com peso de eleitorado inexistente,
    dentro da agregação nacional. Era inofensivo só porque nada produzia
    linha `BR` — e passar a ingerir o agregado nacional é exatamente o que
    produz.
    """
    agrupado = _snapshots_por_uf(
        [_snap("SP", cod_zona=1), _snap("BR", nivel=NIVEL_BR), _snap("RJ", cod_zona=1)]
    )
    assert sorted(agrupado) == ["RJ", "SP"]
    assert "BR" not in agrupado


def test_uf_vazia_ou_nula_tambem_fica_fora() -> None:
    agrupado = _snapshots_por_uf(
        [
            {"uf": "", "cod_zona": 1, "payload": {}},
            {"uf": None, "cod_zona": 1, "payload": {}},
            {"uf": "  sp  ", "cod_zona": 1, "payload": {}},
        ]
    )
    assert sorted(agrupado) == ["SP"], "sigla normalizada, vazia/nula descartada"


# ---------------------------------------------------------------------------
# somar_contagens_agregadas (RF-199)
# ---------------------------------------------------------------------------


def test_sem_agregado_devolve_none_e_nao_zeros() -> None:
    """Ausência é "não sabemos" (RF-198), nunca `aptos: 0`."""
    assert somar_contagens_agregadas([], cargo=1) is None
    assert somar_contagens_agregadas([_snap("SP", cod_zona=1)], cargo=1) is None


def test_cargo_1_usa_a_linha_br_e_nao_a_soma() -> None:
    """Cargo 1 tem arquivo nacional. Usá-lo é usar um número do TSE; somar as
    UFs seria uma conta nossa. Os dois valores são DIFERENTES nesta fixture de
    propósito, para que o teste discrimine qual caminho foi tomado."""
    br = _snap("BR", nivel=NIVEL_BR, payload=_ea20(te=1000, c=800, a=200, vv=700, vb=60, tvn=40))
    uf1 = _snap("SP", nivel=NIVEL_UF, payload=_ea20(te=7, c=7, vv=7))
    uf2 = _snap("RJ", nivel=NIVEL_UF, payload=_ea20(te=11, c=11, vv=11))
    contagens = somar_contagens_agregadas([br, uf1, uf2], cargo=1)
    assert contagens is not None
    assert contagens["aptos"] == 1000, "veio da linha BR"
    assert contagens["aptos"] != 18, "não é a soma das UFs"
    assert contagens["validos"] == 700


def test_cargo_3_soma_as_ufs_porque_nao_ha_arquivo_nacional() -> None:
    """Nível `"br"` só existe no cargo 1 (`temArquivoBr`). Governador, Senador
    e Deputado somam os 27 agregados de UF — soma de inteiros, exata."""
    uf1 = _snap("SP", nivel=NIVEL_UF, payload=_ea20(te=100, c=80, a=20, vv=70, vb=6, tvn=4))
    uf2 = _snap("RJ", nivel=NIVEL_UF, payload=_ea20(te=50, c=40, a=10, vv=35, vb=3, tvn=2))
    contagens = somar_contagens_agregadas([uf1, uf2], cargo=3)
    assert contagens == {
        "aptos": 150,
        "instalados": 150,
        "comparecimento": 120,
        "abstencao": 30,
        "validos": 105,
        "brancos": 9,
        "nulos": 6,
        "anulados": 0,
        "sub_judice": 0,
    }


def test_br_nao_entra_na_soma_das_ufs() -> None:
    """Se o cargo não é 1 mas uma linha `br` existir no banco, ela NÃO pode
    entrar na soma: é o total, não uma parcela. Somá-la dobraria o país."""
    br = _snap("BR", nivel=NIVEL_BR, payload=_ea20(te=150, c=120, vv=120))
    uf1 = _snap("SP", nivel=NIVEL_UF, payload=_ea20(te=100, c=80, vv=80))
    uf2 = _snap("RJ", nivel=NIVEL_UF, payload=_ea20(te=50, c=40, vv=40))
    contagens = somar_contagens_agregadas([br, uf1, uf2], cargo=3)
    assert contagens is not None
    assert contagens["aptos"] == 150, "só as UFs; o BR ficou fora"


def test_br_rotulada_como_nivel_uf_tambem_fica_fora_da_soma() -> None:
    """A guarda `sigla == "BR"` dentro do laço da soma, com a fixture que
    realmente a alcança.

    Descoberto por mutação em 2026-09-26: remover aquela guarda deixava a
    suíte inteira **verde**, porque `test_br_nao_entra_na_soma_das_ufs` usa uma
    linha `nivel="br"` — e o `continue` do nível já a excluía antes de o
    `sigla` ser olhado. A guarda só é alcançável por uma linha MAL ROTULADA:
    `uf = "BR"` com `nivel = "uf"`.

    Isso não é hipótese acadêmica: `nivel` é escrito pela ingestão, e
    `nivel_do_snapshot` degrada qualquer valor desconhecido para `"zona"`.
    Um erro de rótulo que faça o arquivo nacional passar por agregado de UF
    somaria o país às 27 parcelas e **dobraria `aptos`** — o denominador dos
    círculos 1 e 3.
    """
    br_mal_rotulada = _snap(
        "BR", nivel=NIVEL_UF, payload=_ea20(te=150, c=120, vv=120)
    )
    uf1 = _snap("SP", nivel=NIVEL_UF, payload=_ea20(te=100, c=80, vv=80))
    uf2 = _snap("RJ", nivel=NIVEL_UF, payload=_ea20(te=50, c=40, vv=40))
    contagens = somar_contagens_agregadas([br_mal_rotulada, uf1, uf2], cargo=3)
    assert contagens is not None
    assert contagens["aptos"] == 150, "só SP + RJ; a linha BR ficou fora da soma"
    assert contagens["aptos"] != 300, "somar o país às parcelas dobraria os aptos"


def test_cargo_1_sem_linha_br_cai_na_soma_das_ufs() -> None:
    uf1 = _snap("SP", nivel=NIVEL_UF, payload=_ea20(te=100, c=80, vv=80))
    uf2 = _snap("RJ", nivel=NIVEL_UF, payload=_ea20(te=50, c=40, vv=40))
    contagens = somar_contagens_agregadas([uf1, uf2], cargo=1)
    assert contagens is not None
    assert contagens["aptos"] == 150


def test_mesma_uf_duas_vezes_nao_soma_duas_vezes() -> None:
    """Defesa contra `aptos` inflado em silêncio se a query devolver duplicata."""
    a = _snap("SP", nivel=NIVEL_UF, payload=_ea20(te=100, c=80, vv=80))
    b = _snap("SP", nivel=NIVEL_UF, payload=_ea20(te=100, c=80, vv=80))
    contagens = somar_contagens_agregadas([a, b], cargo=3)
    assert contagens is not None
    assert contagens["aptos"] == 100


def test_aptos_maior_que_instalados_sobrevive_a_soma() -> None:
    """🔴 Apuração PARCIAL: seções ainda não instaladas contam em `e.te` e não
    em `e.esi`. As duas contagens têm de chegar ao payload DIFERENTES — é
    delas que o consumidor tira o residual do círculo 1.

    Medido na captura real a 100%: `te` 163.079.139 contra `esi` 163.078.872.
    Durante a noite o vão é todo o país ainda não contado.
    """
    uf1 = _snap("SP", nivel=NIVEL_UF, payload=_ea20(te=1000, esi=600, c=500, a=100, vv=450, vb=30, tvn=20))
    uf2 = _snap("RJ", nivel=NIVEL_UF, payload=_ea20(te=400, esi=100, c=90, a=10, vv=80, vb=6, tvn=4))
    contagens = somar_contagens_agregadas([uf1, uf2], cargo=3)
    assert contagens is not None
    assert contagens["aptos"] == 1400
    assert contagens["instalados"] == 700
    assert contagens["aptos"] > contagens["instalados"]
    # A identidade oficial: comparecimento + abstencao == instalados.
    assert contagens["comparecimento"] + contagens["abstencao"] == contagens["instalados"]


def test_anulados_e_sub_judice_chegam_ao_payload() -> None:
    """🔴 RF-197: eles saem da legenda, NÃO da conta.

    Medidos em 14,20% do comparecimento na captura real. Se o produtor os
    perdesse, o consumidor não teria como declarar a soma na metodologia nem
    como explicar o tamanho do cinza.
    """
    uf = _snap(
        "SP",
        nivel=NIVEL_UF,
        payload=_ea20(te=1000, c=1000, vv=700, vb=60, tvn=40, van=120, vansj=80),
    )
    contagens = somar_contagens_agregadas([uf], cargo=3)
    assert contagens is not None
    assert contagens["anulados"] == 120
    assert contagens["sub_judice"] == 80
    # E a aritmética do TSE fecha: validos + brancos + nulos + anulados +
    # sub_judice == comparecimento.
    assert (
        contagens["validos"]
        + contagens["brancos"]
        + contagens["nulos"]
        + contagens["anulados"]
        + contagens["sub_judice"]
        == contagens["comparecimento"]
    )
    # E as QUATRO fatias nomeadas NÃO fecham o comparecimento — sobram os 200.
    quatro = contagens["validos"] + contagens["brancos"] + contagens["nulos"]
    assert contagens["comparecimento"] - quatro == 200


def test_contagens_batem_a_captura_real_do_tse() -> None:
    """Fio direto com o arquivo real: o produtor lê o agregado do TSE e o
    republica sem alterar um voto."""
    d = json.loads(FIXTURE_BR.read_text())
    br = _snap("BR", nivel=NIVEL_BR, payload=d)
    contagens = somar_contagens_agregadas([br], cargo=1)
    assert contagens == _verdade_br()


# ---------------------------------------------------------------------------
# projetar_fatias_em_contagens (RF-195) — CRUAS, sem normalizar
# ---------------------------------------------------------------------------


def test_projecao_nao_fecha_em_aptos_e_esta_certo_assim() -> None:
    """🔴 O coração da decisão do dono de 2026-09-26.

    As quatro fatias projetadas somam MENOS que `aptos`, e a diferença é
    `anulados + sub_judice`. Normalizar para fechar exigiria fator 1,1376 e
    publicaria 13.892.945 válidos que não existem, ao lado do círculo 2
    exibindo o número verdadeiro na mesma tela (constituição § 6).

    Este teste falha se alguém reintroduzir a normalização.
    """
    verdade = _verdade_br()
    aptos = verdade["aptos"]
    comparecimento = verdade["comparecimento"]
    projetada = projetar_fatias_em_contagens(
        verdade,
        {
            "abstencao": _est(100.0 * verdade["abstencao"] / verdade["instalados"]),
            "validos": _est(100.0 * verdade["validos"] / comparecimento),
            "brancos": _est(100.0 * verdade["brancos"] / comparecimento),
            "nulos": _est(100.0 * verdade["nulos"] / comparecimento),
        },
    )
    assert projetada is not None
    soma = sum(projetada.values())
    assert soma < aptos, "as quatro NÃO fecham em aptos — o vão é voto anulado"
    residual = aptos - soma
    esperado = verdade["anulados"] + verdade["sub_judice"]
    # O residual é o voto anulado, a menos do ruído do bootstrap (dezenas de
    # votos em 163 milhões).
    assert residual == pytest.approx(esperado, abs=500)
    # E o fator que a versão antiga do contrato aplicaria:
    assert aptos / soma == pytest.approx(1.1376, abs=0.001)


def test_projecao_bate_a_verdade_quando_tudo_esta_apurado() -> None:
    """A 100% apurado a projeção tem de reproduzir o número real — é o que
    prova que a aritmética das bases (abstenção sobre instalados, as outras
    sobre comparecimento) está certa.

    Precisão medida: +165, +15, +15 e +40 votos em 163 milhões.
    """
    verdade = _verdade_br()
    comparecimento = verdade["comparecimento"]
    projetada = projetar_fatias_em_contagens(
        verdade,
        {
            "abstencao": _est(100.0 * verdade["abstencao"] / verdade["instalados"]),
            "validos": _est(100.0 * verdade["validos"] / comparecimento),
            "brancos": _est(100.0 * verdade["brancos"] / comparecimento),
            "nulos": _est(100.0 * verdade["nulos"] / comparecimento),
        },
    )
    assert projetada is not None
    for fatia in ("validos", "brancos", "nulos", "abstencao"):
        assert projetada[fatia] == pytest.approx(verdade[fatia], abs=500), fatia
    # E a ordem de grandeza não se perdeu: válidos é a maior fatia.
    assert projetada["validos"] > projetada["abstencao"] > projetada["brancos"]


def test_abstencao_projeta_sobre_aptos_nao_sobre_instalados() -> None:
    """A base da métrica é `instalados`, mas a fatia do círculo 3 é sobre
    `aptos` — ao fim da noite `instalados → aptos`. Com `instalados` bem
    menor que `aptos` (apuração parcial) os dois resultados divergem muito, e
    o teste discrimina."""
    contagens = {"aptos": 1000, "instalados": 200}
    projetada = projetar_fatias_em_contagens(
        contagens,
        {
            "abstencao": _est(20.0),
            "validos": _est(100.0),
            "brancos": _est(0.0),
            "nulos": _est(0.0),
        },
    )
    assert projetada is not None
    assert projetada["abstencao"] == 200, "20% de 1000 aptos"
    assert projetada["abstencao"] != 40, "não é 20% dos 200 instalados"
    # E o comparecimento projetado é o resto dos aptos.
    assert projetada["validos"] == 800


def test_sem_uma_das_quatro_metricas_nao_publica_projecao_parcial() -> None:
    """Três fatias e um buraco onde a quarta deveria estar é pior que
    "aguardando projeção" — o círculo não somaria nada reconhecível."""
    contagens = {"aptos": 1000, "instalados": 1000}
    for faltando in ("abstencao", "validos", "brancos", "nulos"):
        participacao: dict[str, Any] = {
            m: _est(25.0) for m in ("abstencao", "validos", "brancos", "nulos")
        }
        participacao[faltando] = None
        assert (
            projetar_fatias_em_contagens(contagens, participacao) is None
        ), f"faltando {faltando}"


def test_sem_aptos_nao_projeta() -> None:
    assert projetar_fatias_em_contagens({"aptos": 0}, {}) is None


def test_abstencao_acima_de_100_nao_publica_comparecimento_negativo() -> None:
    projetada = projetar_fatias_em_contagens(
        {"aptos": 1000, "instalados": 1000},
        {
            "abstencao": _est(120.0),
            "validos": _est(50.0),
            "brancos": _est(0.0),
            "nulos": _est(0.0),
        },
    )
    assert projetada is None


# ---------------------------------------------------------------------------
# build_votacao_payload — os TRÊS estados (RF-193b / RF-198)
# ---------------------------------------------------------------------------


def test_estado_nao_sabemos_omite_o_bloco() -> None:
    """Sem agregado, o bloco inteiro é ausente ⇒ `<DetailUnavailable>`."""
    assert build_votacao_payload([], cargo=1) is None


def test_estado_nao_comecou_publica_aptos_com_o_resto_zero() -> None:
    """🔴 RF-193b. Este é o caso que NÃO pode ser confundido com o de cima.

    Antes das 17h de 04/10 o TSE já publica `e.te` e nada mais. O produtor tem
    de publicar o bloco assim mesmo: a tela desenha um círculo 100% cinza
    (decisão do dono). Omitir aqui seria dizer "não sabemos" quando sabemos os
    aptos.
    """
    br = _snap("BR", nivel=NIVEL_BR, payload=_ea20(te=163_079_139))
    bloco = build_votacao_payload([br], cargo=1)
    assert bloco is not None, "'não começou' publica o bloco — não é 'não sabemos'"
    contagens = bloco["contagens"]
    assert contagens["aptos"] == 163_079_139
    assert (
        contagens["validos"]
        + contagens["brancos"]
        + contagens["nulos"]
        + contagens["abstencao"]
        == 0
    )
    # Sem base amostral não há projeção: o círculo 3 fica "aguardando".
    assert "projetada" not in bloco


def test_os_tres_estados_sao_distinguiveis_entre_si() -> None:
    """A asserção que um teste de "o bloco existe" não faria.

    Os três estados têm de produzir três resultados DIFERENTES. Um consumidor
    que colapse dois deles publica "não começou" onde devia dizer "não
    sabemos", ou vice-versa — o erro que o dono fixou em 14/09.
    """
    nao_sabemos = build_votacao_payload([], cargo=1)
    nao_comecou = build_votacao_payload(
        [_snap("BR", nivel=NIVEL_BR, payload=_ea20(te=1000))], cargo=1
    )
    apurando = build_votacao_payload(
        [
            _snap(
                "BR",
                nivel=NIVEL_BR,
                payload=_ea20(te=1000, esi=500, c=400, a=100, vv=350, vb=30, tvn=20),
            )
        ],
        cargo=1,
    )

    assert nao_sabemos is None
    assert nao_comecou is not None
    assert apurando is not None

    def _fatias(bloco: dict[str, Any]) -> int:
        c = bloco["contagens"]
        return c["validos"] + c["brancos"] + c["nulos"] + c["abstencao"]

    assert _fatias(nao_comecou) == 0
    assert _fatias(apurando) > 0
    assert nao_comecou["contagens"]["aptos"] > 0, "nunca zero de resgate"
    # E os três são mutuamente distinguíveis por um consumidor:
    assert nao_comecou != apurando


def test_projetada_aparece_quando_ha_as_quatro_metricas() -> None:
    br = _snap(
        "BR",
        nivel=NIVEL_BR,
        payload=_ea20(te=1000, c=800, a=200, vv=700, vb=60, tvn=40),
    )
    bloco = build_votacao_payload(
        [br],
        cargo=1,
        participacao={
            "abstencao": _est(20.0),
            "validos": _est(87.5),
            "brancos": _est(7.5),
            "nulos": _est(5.0),
        },
    )
    assert bloco is not None
    assert bloco["projetada"] == {
        "validos": 700,
        "brancos": 60,
        "nulos": 40,
        "abstencao": 200,
    }
    # Sem `fator_normalizacao`: o campo saiu do contrato em 2026-09-26.
    assert "fator_normalizacao" not in bloco["projetada"]


def test_bloco_so_tem_as_chaves_do_contrato() -> None:
    """Guarda de forma contra `EdgeVotacao`/`EdgeVotacaoContagens`."""
    br = _snap("BR", nivel=NIVEL_BR, payload=_ea20(te=1000, c=800, a=200, vv=700, vb=60, tvn=40))
    bloco = build_votacao_payload(
        [br],
        cargo=1,
        participacao={m: _est(25.0) for m in ("abstencao", "validos", "brancos", "nulos")},
    )
    assert bloco is not None
    assert set(bloco) == {"contagens", "projetada"}
    assert set(bloco["contagens"]) == {
        "aptos",
        "instalados",
        "comparecimento",
        "abstencao",
        "validos",
        "brancos",
        "nulos",
        "anulados",
        "sub_judice",
    }
    assert set(bloco["projetada"]) == {"validos", "brancos", "nulos", "abstencao"}
    assert all(isinstance(v, int) for v in bloco["contagens"].values())
    assert all(isinstance(v, int) for v in bloco["projetada"].values())
