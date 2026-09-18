"""Fase 5 do plano § A — `brancos_nulos` deixa de sair de `turnout.py`.

Até a Fase 1, `participacao.brancos_nulos` vinha de
`turnout.estimate_uf_participacao` com **seed própria** e **estimador
próprio** (média das frações por zona, ponderada por `weight`), enquanto os
candidatos saíam de `extrapolation.estimate_uf_candidatos` (razão de somas
escaladas por `k = te/esi`). A consequência é que a tela publicava, na base
"comparecimento", partes de um inteiro que não somavam esse inteiro — o
plano registra "fecha em 100 ± 0,3 pp".

A Fase 5 move o número para o MESMO bootstrap dos candidatos. O que estes
testes provam:
  1. `compute_participacao(..., cand_by_uf=...)` devolve o número da
     extrapolação, e ele fecha a identidade com os candidatos;
  2. o número mudou — sem `cand_by_uf` a fonte antiga ainda responde, e
     responde DIFERENTE (se respondesse igual, a troca não teria efeito e
     o teste não discriminaria nada);
  3. UF sem nenhuma zona apurada continua saindo `None` (nunca zero).
"""

from __future__ import annotations

from typing import Any

import numpy as np

from api.model.project import compute_participacao, compute_uf_projections


def _envelope(
    vaps: dict[int, int], *, te: int, esi: int, brancos: int, nulos: int
) -> dict[str, Any]:
    """EA20 mínimo de uma zona, com a identidade do boletim fechada:
    `Σvap + brancos + nulos == comparecimento` (sem anulados)."""
    vvc = sum(vaps.values())
    comparecimento = vvc + brancos + nulos
    return {
        "carg": [
            {
                "cd": "1",
                "agr": [
                    {
                        "tp": "i",
                        "par": [
                            {
                                "n": str(cod),
                                "sg": "PP",
                                "nm": "PARTIDO",
                                "cand": [
                                    {
                                        "n": str(cod),
                                        "sqcand": f"{cod}0000000001",
                                        "nm": f"CANDIDATO {cod}",
                                        "nmu": f"CANDIDATO {cod}",
                                        "e": "n",
                                        "vap": str(vap),
                                    }
                                ],
                            }
                            for cod, vap in vaps.items()
                        ],
                    }
                ],
            }
        ],
        "s": {
            "ts": "1", "st": "1", "pst": "100,00",
            "si": "1", "psi": "100,00", "sa": "1", "psa": "100,00",
        },
        "e": {
            "te": str(te),
            "esi": str(esi),
            "c": str(comparecimento),
            "a": str(esi - comparecimento),
        },
        "v": {
            "tv": str(comparecimento),
            "vvc": str(vvc),
            "vv": str(vvc),
            "vnom": str(vvc),
            "vb": str(brancos),
            "tvn": str(nulos),
            "vn": str(nulos),
            "vnt": "0",
        },
    }


def _cenario() -> tuple[list[dict[str, Any]], dict[tuple[str, int], int]]:
    snapshots = [
        {
            "uf": "SP",
            "cod_municipio_tse": 1,
            "cod_zona": 1,
            "pct_apurado": 80.0,
            "payload": _envelope(
                {13: 3000, 22: 2500}, te=10000, esi=8000, brancos=300, nulos=200
            ),
            "ts": "2026-10-04T18:00:00Z",
        },
        {
            "uf": "SP",
            "cod_municipio_tse": 2,
            "cod_zona": 2,
            "pct_apurado": 100.0,
            "payload": _envelope(
                {13: 1500, 22: 2100}, te=5000, esi=5000, brancos=250, nulos=150
            ),
            "ts": "2026-10-04T18:00:00Z",
        },
    ]
    eleitorado = {("SP", 1): 10000, ("SP", 2): 5000}
    return snapshots, eleitorado


def _projetar() -> tuple[Any, dict[tuple[str, int], int], list[dict[str, Any]]]:
    snapshots, eleitorado = _cenario()
    _rows, _est_v, est_c_by_uf, cand_by_uf = compute_uf_projections(
        cargo=1, turno=1, seed_base=2026, snapshots=snapshots, eleitorado=eleitorado
    )
    return (cand_by_uf, est_c_by_uf), eleitorado, snapshots


def test_brancos_nulos_fecha_identidade_com_os_candidatos_no_payload() -> None:
    """O número que a tela publica soma 100 com os candidatos da MESMA base.

    A tolerância é 1e-4 pp (só o corte de 5 casas de `_frac_to_pct`), não os
    ±0,3 pp da Fase 1 — é essa distância que torna o teste capaz de detectar
    um retorno à fonte antiga.
    """
    (cand_by_uf, _est_c), eleitorado, snapshots = _projetar()
    by_uf, _nacional = compute_participacao(
        cargo=1,
        turno=1,
        seed_base=2026,
        snapshots=snapshots,
        eleitorado=eleitorado,
        cand_by_uf=cand_by_uf,
    )
    bn = by_uf["SP"]["brancos_nulos"]
    assert bn is not None

    soma = bn["pct_projetado"] + sum(
        c["pct_projetado_comparecimento"]
        for c in cand_by_uf["SP"]["por_candidato"].values()
    )
    assert abs(soma - 100.0) < 1e-4, f"soma = {soma!r}"

    # E resample a resample, no array que viaja para a agregação nacional.
    total = bn["estimates"].copy()
    for c in cand_by_uf["SP"]["por_candidato"].values():
        total = total + c["estimates_comparecimento"]
    assert float(np.max(np.abs(total - 1.0))) < 1e-12


def test_fonte_antiga_responderia_um_numero_diferente() -> None:
    """Sem `cand_by_uf`, `turnout.py` ainda responde — e responde OUTRO
    número. Se as duas fontes coincidissem, o teste acima passaria mesmo com
    a troca revertida e não estaria provando nada.
    """
    (cand_by_uf, _est_c), eleitorado, snapshots = _projetar()
    novo, _ = compute_participacao(
        cargo=1, turno=1, seed_base=2026, snapshots=snapshots,
        eleitorado=eleitorado, cand_by_uf=cand_by_uf,
    )
    antigo, _ = compute_participacao(
        cargo=1, turno=1, seed_base=2026, snapshots=snapshots,
        eleitorado=eleitorado,
    )
    bn_novo = novo["SP"]["brancos_nulos"]
    bn_antigo = antigo["SP"]["brancos_nulos"]
    assert bn_novo is not None and bn_antigo is not None
    assert bn_novo["pct_projetado"] != bn_antigo["pct_projetado"]

    # E a fonte antiga NÃO fecha a identidade — é o defeito que a Fase 5
    # conserta, medido aqui em vez de afirmado.
    soma_antiga = bn_antigo["pct_projetado"] + sum(
        c["pct_projetado_comparecimento"]
        for c in cand_by_uf["SP"]["por_candidato"].values()
    )
    assert abs(soma_antiga - 100.0) > 1e-4


def test_contagens_brutas_alimentam_o_pct_atual_nacional() -> None:
    """`num`/`den` são as contagens observadas — `aggregate_national_
    participacao` soma as duas UF a UF para o `pct_atual` nacional."""
    (cand_by_uf, _est_c), eleitorado, snapshots = _projetar()
    by_uf, nacional = compute_participacao(
        cargo=1, turno=1, seed_base=2026, snapshots=snapshots,
        eleitorado=eleitorado, cand_by_uf=cand_by_uf,
    )
    bn = by_uf["SP"]["brancos_nulos"]
    assert bn is not None
    assert bn["num"] == 300 + 200 + 250 + 150
    assert bn["den"] == (5500 + 500) + (3600 + 400)
    assert nacional["brancos_nulos"] is not None
    assert nacional["brancos_nulos"]["num"] == bn["num"]


def test_uf_sem_zona_apurada_sai_none_e_nao_zero() -> None:
    """UF presente nos snapshots mas sem nada apurado: `None`.

    A UI mostra "aguardando projeção". Um `0.0` afirmaria que ninguém votou
    branco nem nulo ali — número inventado com cara de medição.
    """
    snapshots, eleitorado = _cenario()
    snapshots.append(
        {
            "uf": "AC",
            "cod_municipio_tse": 9,
            "cod_zona": 9,
            "pct_apurado": 0.0,
            "payload": _envelope({13: 0, 22: 0}, te=2000, esi=0, brancos=0, nulos=0),
            "ts": "2026-10-04T18:00:00Z",
        }
    )
    eleitorado[("AC", 9)] = 2000
    _rows, _ev, _ec, cand_by_uf = compute_uf_projections(
        cargo=1, turno=1, seed_base=2026, snapshots=snapshots, eleitorado=eleitorado
    )
    by_uf, _nacional = compute_participacao(
        cargo=1, turno=1, seed_base=2026, snapshots=snapshots,
        eleitorado=eleitorado, cand_by_uf=cand_by_uf,
    )
    assert by_uf["AC"]["brancos_nulos"] is None
