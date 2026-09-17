"""tests/unit/model/test_fase_ausente_no_emissor.py — RF-166 (spec 019), M20.

**Asserção negativa sobre o JSON emitido.** A chave ``fase`` não ocorre em
nenhum nível do payload que os dois emissores reais produzem.

## Por que negativa, e por que sobre o JSON

Um emissor que escrevesse ``fase: None`` ou ``fase: "normal"`` passaria em
qualquer teste positivo ("o payload tem os campos esperados") e apagaria em
silêncio a distinção que sustenta a spec inteira: **ausente = fase normal**.
Com ``fase: None`` no store, ``ehSemeado`` (semeador) e ``carregaFaseSemeada``
(fiscal) — que comparam por igualdade exata com o literal — deixariam de
reconhecer a chave, e o fiscal do RF-165 nunca a encontraria.

E a saída da fase depende disto: o primeiro ciclo real de cada cargo grava por
**substituição integral**, e o campo desaparece sozinho. Ninguém precisa
lembrar de desligar nada às 20h de 04/10 — desde que o emissor de fato nunca
escreva o campo.

## O que este arquivo NÃO testa

A substituição integral (o writer nunca faz merge) é do lado TypeScript e está
em ``tests/unit/data-pipeline/projection-seed.test.ts`` e
``tests/unit/edge-config/writer.test.ts``.
"""

from __future__ import annotations

import json
from typing import Any

from api.model.cadeiras import distribuir_cadeiras
from api.model.deputado import extrair_entrada_proporcional
from api.model.deputado_payload import UfProporcional, construir_payload_deputado
from api.model.project import build_edge_payload

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _chaves_em_todo_nivel(valor: Any) -> set[str]:
    """Toda chave de dicionário do payload, em qualquer profundidade.

    Uma busca por substring em ``json.dumps`` casaria com ``"fase"`` dentro de
    um nome de candidato; o que interessa é a chave.
    """
    encontradas: set[str] = set()
    if isinstance(valor, dict):
        for k, v in valor.items():
            encontradas.add(k)
            encontradas |= _chaves_em_todo_nivel(v)
    elif isinstance(valor, list):
        for item in valor:
            encontradas |= _chaves_em_todo_nivel(item)
    return encontradas


# ---------------------------------------------------------------------------
# Cenários mínimos, um por emissor
# ---------------------------------------------------------------------------

UF_ROWS: list[dict[str, Any]] = [
    {
        "cargo": 1,
        "turno": 1,
        "uf": "SP",
        "candidato_id": 13,
        "pct_projetado": 55.0,
        "pct_apurado": 80.0,
    },
    {
        "cargo": 1,
        "turno": 1,
        "uf": "SP",
        "candidato_id": 22,
        "pct_projetado": 45.0,
        "pct_apurado": 80.0,
    },
]

NATIONAL_ROWS: list[dict[str, Any]] = [
    {"candidato_id": 13, "pct_projetado": 55.0, "rank": 1},
    {"candidato_id": 22, "pct_projetado": 45.0, "rank": 2},
]


def _payload_nacional(**over: Any) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "cargo": 1,
        "turno": 1,
        "ts_iso": "2026-10-04T23:01:00Z",
        "uf_rows": UF_ROWS,
        "national_rows": NATIONAL_ROWS,
        "eleitorado_total_by_uf": {"SP": 1000},
    }
    kwargs.update(over)
    return build_edge_payload(**kwargs)


def _envelope_dep() -> dict[str, Any]:
    cand = [{"n": "1300", "nm": "FULANO", "sqcand": "1", "vap": "600"}]
    par = {"n": "13", "sg": "PT", "nm": "Partido PT", "tvtl": "100", "cand": cand}
    agr = {"n": "13", "nm": "Partido PT", "tp": "i", "tvtl": "100", "par": [par]}
    return {"tf": "n", "carg": [{"cd": "6", "nv": "1", "agr": [agr]}]}


def _payload_deputado() -> dict[str, Any]:
    entrada = extrair_entrada_proporcional(_envelope_dep())
    resultado = (
        distribuir_cadeiras(entrada.agremiacoes, entrada.lugares_a_preencher)
        if entrada.lugares_a_preencher is not None
        else None
    )
    payload, _ = construir_payload_deputado(
        ufs=[UfProporcional(uf="SP", pct_apurado=100.0, entrada=entrada, resultado=resultado)],
        divergencias_por_uf={},
        ts_iso="2026-10-04T23:01:00Z",
        cargo=6,
        turno=1,
        atualizacao_min=15,
        ufs_conhecidas=27,
        pct_apurado_total=100.0,
    )
    return payload


# ---------------------------------------------------------------------------
# M20
# ---------------------------------------------------------------------------


def test_project_py_nao_emite_a_chave_fase() -> None:
    payload = _payload_nacional()

    # Controle: o payload precisa ter conteúdo, senão a asserção negativa
    # abaixo passaria sobre um dicionário vazio.
    assert payload["national"]["candidatos"], "cenário vazio — o teste não prova nada"
    assert "composition" in payload

    assert "fase" not in _chaves_em_todo_nivel(payload)
    assert '"fase"' not in json.dumps(payload, ensure_ascii=False)


def test_deputado_payload_py_nao_emite_a_chave_fase() -> None:
    payload = _payload_deputado()

    assert payload["bancada"]["por_agremiacao"], "cenário vazio — o teste não prova nada"
    assert "composition" in payload

    assert "fase" not in _chaves_em_todo_nivel(payload)
    assert '"fase"' not in json.dumps(payload, ensure_ascii=False)


def test_fase_ausente_tambem_com_zero_apurado() -> None:
    """20h00 de 04/10 — o ciclo rodou, ninguém apurou nada ainda.

    É o payload mais parecido com um semeado que o emissor real produz, e é
    justamente aqui que alguém teria a ideia de "marcar a fase".
    """
    payload = _payload_nacional(
        uf_rows=[{**r, "pct_apurado": 0.0, "pct_projetado": 0.0} for r in UF_ROWS],
        national_rows=[{**r, "pct_projetado": 0.0} for r in NATIONAL_ROWS],
    )
    assert payload["pct_apurado_total"] == 0
    assert "fase" not in _chaves_em_todo_nivel(payload)


def test_composition_pre_election_continua_existindo_e_nao_e_fase() -> None:
    """ADR-0043 D2 — o campo tentador continua lá, e continua sem medir fase.

    Se ele sumisse, alguém concluiria que a spec 019 o substituiu; se ele
    passasse a variar com apuração, a UI gateada nele voltaria ao modo
    pré-eleição no meio da noite. Nenhuma das duas coisas acontece aqui.
    """
    com_dado = _payload_nacional()
    sem_dado = _payload_nacional(
        uf_rows=[{**r, "pct_apurado": 0.0} for r in UF_ROWS],
    )
    assert com_dado["composition"]["pre_election"] == 0.0
    assert sem_dado["composition"]["pre_election"] == 0.0

    dep = _payload_deputado()
    assert dep["composition"]["pre_election"] == 0.0
