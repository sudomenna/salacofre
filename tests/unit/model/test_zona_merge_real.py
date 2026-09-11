"""Merge de pares contra dado REAL do TSE — MG zona 4, 2º turno de 2022.

## Por que este arquivo existe

`tests/unit/model/test_zona_merge.py` tem 16 testes, vários com zona
multi-par — mas **todos** os envelopes saem do helper `_env()` daquele arquivo,
com números inventados (`te=1_000`, `vvc=700`, `cands={"13": 400}`), e cada
assert compara contra a aritmética escrita à mão no próprio teste
(`assert envelope["e"]["te"] == "1250"`). Isso prova que a soma é
internamente consistente; **não** prova que ela reproduz um total de zona real.
O comentário em `test_zona_merge.py:199` já reconhecia a lacuna — "o CSV tem
zonas com até 8 municípios" — com o CSV disponível no disco e não usado.

E as fixtures de `tests/fixtures/tse/2022/` não servem: são sintéticas. O
commit que as criou (`391331c`, 2026-05-17) diz isso na mensagem, o campo `dg`
delas é `04/10/2026` e trazem 2 candidatos num 1º turno que teve 11.

## O que este teste acrescenta

Uma zona real com **6 municípios** — MG zona 4, Presidente, 2º turno de 2022 —
em que o esperado vem de uma **fonte independente da entrada**:

  - entrada  → `votacao_partido_munzona_2022_BR.csv` (dataset aberto do TSE),
               fatiado por (município, zona) na origem;
  - esperado → tabela `historical_results` no Postgres, que guarda a zona já
               agregada: PT (nº 13) 19.152 e PL (nº 22) 9.391.

A fixture está em `tests/fixtures/model/mg-zona-4-pares-2022.json`, com a
procedência de cada campo no seu `_nota`. O `te` de cada par foi conferido
igual à tabela `eleitorado` (soma 39.286) usando a mesma coluna e o mesmo
filtro de turno de `data-pipeline/eleitorado-import.ts:169,178`.

## O limite honesto deste teste

Ele trava a **aritmética do merge** contra totais reais. Ele **não** resolve o
risco de primeira grandeza do ADR-0035 — a premissa de que o arquivo EA20 do
par traz a *fatia* da zona naquele município, e não a zona inteira. A fixture
vem de um CSV que é fatiado por definição, então num mundo em que o EA20 de
2026 trouxesse a zona inteira em cada arquivo, este teste passaria igual. Quem
resolve aquilo é o Passo 0 do simulado (`docs/testing/tse-simulados.md`) e o
`scripts/verify-fatia-premise.ts`.
"""

from __future__ import annotations

import json
import pathlib
from typing import Any

import pytest

from api.model.zona_merge import check_zona_merge_sanity, merge_pairs_into_zonas

FIXTURE = pathlib.Path(__file__).parents[2] / "fixtures" / "model" / "mg-zona-4-pares-2022.json"


@pytest.fixture(scope="module")
def dados() -> dict[str, Any]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def _envelope(par: dict[str, Any], turno: int) -> dict[str, Any]:
    """Envelope EA20 de uma abrangência `zona` — strings, como o TSE publica."""
    return {
        "ele": "546",
        "t": str(turno),
        "f": "o",
        "tpabr": "zona",
        "cdabr": "0004",
        "dg": "30/10/2022",
        "hg": "20:15:30",
        "s": {"ts": str(par["si"]), "si": str(par["si"]), "sa": str(par["si"]), "psa": "100,00"},
        "e": {"te": str(par["te"]), "c": str(par["vvc"]), "esi": str(par["te"])},
        "v": {"tv": str(par["vvc"]), "vvc": str(par["vvc"])},
        "carg": [
            {
                "cd": "1",
                "agr": [
                    {
                        "n": "1",
                        "par": [
                            {
                                "n": numero,
                                "sg": f"P{numero}",
                                "cand": [
                                    {
                                        "n": numero,
                                        "nm": f"CANDIDATO {numero}",
                                        "vap": str(vap),
                                        "pvap": "0,00",
                                    }
                                ],
                            }
                            for numero, vap in sorted(par["votos_por_partido"].items())
                        ],
                    }
                ],
            }
        ],
    }


def _linhas(dados: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "uf": dados["uf"],
            "cod_municipio_tse": par["cod_municipio_tse"],
            "cod_zona": dados["cod_zona"],
            "pct_apurado": 100.0,
            "payload": _envelope(par, dados["turno"]),
        }
        for par in dados["pares"]
    ]


def _cands(payload: dict[str, Any]) -> dict[str, int]:
    out: dict[str, int] = {}
    for carg in payload["carg"]:
        for agr in carg["agr"]:
            for p in agr["par"]:
                for cand in p.get("cand") or []:
                    out[str(cand["n"])] = int(cand["vap"])
    return out


def test_fixture_tem_seis_pares_reais(dados: dict[str, Any]) -> None:
    """Guarda contra um teste que afere o nada se a fixture encolher."""
    assert len(dados["pares"]) == 6
    assert dados["uf"] == "MG" and dados["cod_zona"] == 4


def test_o_esperado_nao_deriva_da_entrada(dados: dict[str, Any]) -> None:
    """Guarda anti-tautologia, e é o ponto inteiro deste arquivo.

    O gate OT-4 já passou uma vez por ser tautológico — o dataset de replay era
    construído a partir do próprio 2022, então a projeção era o gabarito. Aqui o
    risco é o mesmo em miniatura: se o esperado fosse a soma das fatias de
    entrada, o teste principal compararia a soma consigo mesma e passaria com
    `merge_pairs_into_zonas` quebrado de qualquer jeito que preservasse soma.

    Por isso a fixture carrega DOIS campos: `total_zona_historical_results`,
    lido do Postgres (`historical_results`, ano=2022 turno=2 cargo=1 MG zona 4 →
    cod_candidato 3022213 = 19152, 3022222 = 9391), e
    `total_zona_recalculado_da_entrada`, que é a soma das fatias. O teste
    principal asserta contra o PRIMEIRO. Este teste documenta que os dois
    coincidem — que é o achado empírico —, sem que o principal dependa disso.
    """
    assert dados["total_zona_historical_results"] == {"13": 19152, "22": 9391}
    assert {k: int(v) for k, v in dados["total_zona_recalculado_da_entrada"].items()} == dados[
        "total_zona_historical_results"
    ]


def test_merge_reproduz_o_total_da_zona_de_fonte_independente(dados: dict[str, Any]) -> None:
    """O coração: somar as 6 fatias tem de dar o total que o TSE publica para a zona.

    O esperado é `total_zona_historical_results` — lido do banco, nunca
    derivado dos pares de entrada. Ver `test_o_esperado_nao_deriva_da_entrada`.
    """
    saida = merge_pairs_into_zonas(_linhas(dados))

    assert len(saida) == 1, "6 pares da mesma zona têm de virar 1 linha"
    assert _cands(saida[0]["payload"]) == dados["total_zona_historical_results"]


def test_vvc_e_eleitorado_somam_para_os_valores_reais(dados: dict[str, Any]) -> None:
    saida = merge_pairs_into_zonas(_linhas(dados))
    payload = saida[0]["payload"]

    assert int(payload["v"]["vvc"]) == sum(p["vvc"] for p in dados["pares"])
    assert int(payload["e"]["te"]) == dados["eleitorado_zona_esperado"] == 39_286


def test_sanidade_aceita_a_zona_real_sem_alarme(dados: dict[str, Any]) -> None:
    """Σ te dos pares == eleitorado da zona ⇒ razão 1,0, dentro da faixa OK.

    Substitui os 2,0 / 1,6 / 1,0 fabricados de `test_zona_merge_sanity.py` por
    um número medido.
    """
    saida = merge_pairs_into_zonas(_linhas(dados))
    eleitorado = {(dados["uf"], dados["cod_zona"]): dados["eleitorado_zona_esperado"]}

    assert check_zona_merge_sanity(_linhas(dados), saida, eleitorado) == 0


def test_sanidade_pega_a_multiplicacao_no_cenario_em_que_a_premissa_cai(
    dados: dict[str, Any],
) -> None:
    """O cenário catastrófico do ADR-0035, com números reais.

    Se o EA20 do par trouxer a ZONA INTEIRA em vez da fatia, cada um dos 6
    arquivos traz `te` = 39.286 e o merge soma 6 cópias — razão 6,0, muito
    acima do `_RATIO_VIOLACAO` de 1,8. Este teste prova que a rede de segurança
    dispara nesse caso concreto, não só contra fixture construída para cruzar
    o limiar.
    """
    total = dados["eleitorado_zona_esperado"]
    inteiras = []
    for par in dados["pares"]:
        clone = dict(par)
        clone["te"] = total  # cada arquivo traria a zona inteira
        clone["votos_por_partido"] = dict(dados["total_zona_historical_results"])
        clone["vvc"] = sum(int(v) for v in dados["total_zona_historical_results"].values())
        inteiras.append(clone)

    linhas = [
        {
            "uf": dados["uf"],
            "cod_municipio_tse": p["cod_municipio_tse"],
            "cod_zona": dados["cod_zona"],
            "pct_apurado": 100.0,
            "payload": _envelope(p, dados["turno"]),
        }
        for p in inteiras
    ]
    saida = merge_pairs_into_zonas(linhas)
    eleitorado = {(dados["uf"], dados["cod_zona"]): total}

    assert check_zona_merge_sanity(linhas, saida, eleitorado) == 1
    # E a inflação seria de 6× — o número que o alerta veria no dia D.
    assert int(saida[0]["payload"]["e"]["te"]) == total * 6
