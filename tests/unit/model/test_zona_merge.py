"""
tests/unit/model/test_zona_merge.py

`api.model.zona_merge.merge_pairs_into_zonas` — a soma dos pares
`(município, zona)` de volta à zona, que é a unidade do estimador
(ADR-0021/0023, decisão E5 do plano de 11/09).

O que estes casos fixam:
  - **identidade**: zona com 1 par sai inalterada — é o caso do dataset de
    replay 2022 (1 linha por zona) e a razão de o gate OT-4 não se mover;
  - **soma**: `e.*`, `v.*`, `s.*` e `cand[].vap` somados por número;
  - `psa` = 100 · Σsa / Σsi, com fallback ponderado por `e.te`;
  - sentinela `cod_municipio_tse = 0` descartada quando há par real;
  - determinismo: permutar a ordem de entrada não muda nenhum valor;
  - candidato presente num par e ausente noutro (a zona conhece a união).
"""

from __future__ import annotations

from typing import Any

import pytest

from api.model.zona_merge import merge_pairs_into_zonas


# ---------------------------------------------------------------------------
# Helpers — envelope EA20 no formato real (strings, como o TSE publica)
# ---------------------------------------------------------------------------


def _env(
    *,
    te: int,
    si: int | None,
    sa: int,
    ts: int,
    vvc: int,
    cands: dict[str, int],
    esi: int | None = None,
    c: int | None = None,
    vb: int | None = None,
    psa: str | None = None,
) -> dict[str, Any]:
    """Envelope EA20 mínimo de uma abrangência `zona` (um par)."""
    s: dict[str, Any] = {"ts": str(ts), "sa": str(sa), "psa": psa or "0,00"}
    if si is not None:
        s["si"] = str(si)
    e: dict[str, Any] = {"te": str(te), "c": str(c if c is not None else 0)}
    if esi is not None:
        e["esi"] = str(esi)
    v: dict[str, Any] = {"tv": str(vvc), "vvc": str(vvc)}
    if vb is not None:
        v["vb"] = str(vb)
    return {
        "ele": "619",
        "t": "1",
        "f": "s",
        "tpabr": "zona",
        "cdabr": "0001",
        "dg": "04/10/2026",
        "hg": "20:15:30",
        "s": s,
        "e": e,
        "v": v,
        "carg": [
            {
                "cd": "1",
                "agr": [
                    {
                        "n": "1",
                        "par": [
                            {
                                "n": "13",
                                "sg": "PT",
                                "cand": [
                                    {
                                        "n": numero,
                                        "nm": f"CANDIDATO {numero}",
                                        "vap": str(vap),
                                        "pvap": "0,00",
                                    }
                                    for numero, vap in cands.items()
                                ],
                            }
                        ],
                    }
                ],
            }
        ],
    }


def _row(
    uf: str,
    cod_municipio_tse: int,
    cod_zona: int,
    pct_apurado: float,
    payload: dict[str, Any],
) -> dict[str, Any]:
    return {
        "uf": uf,
        "cod_municipio_tse": cod_municipio_tse,
        "cod_zona": cod_zona,
        "pct_apurado": pct_apurado,
        "payload": payload,
    }


def _cands(payload: dict[str, Any]) -> dict[str, int]:
    """`{numero: vap}` lido de volta do envelope."""
    out: dict[str, int] = {}
    for carg in payload["carg"]:
        for agr in carg["agr"]:
            for par in agr["par"]:
                for cand in par.get("cand") or []:
                    out[str(cand["n"])] = int(cand["vap"])
    return out


# ---------------------------------------------------------------------------
# Identidade — 1 par
# ---------------------------------------------------------------------------


def test_zona_com_um_par_sai_inalterada() -> None:
    """Zona com um único par devolve a MESMA linha e o MESMO payload (sem
    reconstrução de envelope).

    É o caso do dataset de replay 2022 (`tests/fixtures/replay-2022/
    snapshots.json`, uma linha por zona): identidade aqui é o que garante
    que o gate OT-4 não se move ao introduzir o merge.
    """
    payload = _env(te=350, si=2, sa=2, ts=2, vvc=270, cands={"13": 165, "22": 95})
    linha = _row("SP", 71072, 1, 75.0, payload)

    out = merge_pairs_into_zonas([linha])

    assert len(out) == 1
    assert out[0] is linha
    assert out[0]["payload"] is payload


def test_linhas_sem_cod_municipio_sao_identidade() -> None:
    """Dataset legado sem a chave `cod_municipio_tse` (fixtures de replay) —
    cada zona tem uma linha, todas tratadas como sentinela solitária e
    devolvidas intactas."""
    linhas = [
        {
            "uf": "AC",
            "cod_zona": z,
            "pct_apurado": 10.0 * z,
            "payload": _env(te=100 * z, si=1, sa=1, ts=1, vvc=90, cands={"13": 50}),
        }
        for z in (1, 2, 3)
    ]

    out = merge_pairs_into_zonas(linhas)

    assert out == linhas
    assert all(a is b for a, b in zip(out, linhas))


# ---------------------------------------------------------------------------
# Soma — N pares
# ---------------------------------------------------------------------------


def test_dois_pares_somam_contagens_e_votos() -> None:
    """Zona em 2 municípios: `e.*`, `v.*`, `s.*` e `vap` somados."""
    p1 = _env(te=1_000, esi=900, c=800, si=10, sa=10, ts=10, vvc=700, vb=20,
              cands={"13": 400, "22": 300})
    p2 = _env(te=250, esi=200, c=180, si=3, sa=3, ts=3, vvc=150, vb=5,
              cands={"13": 90, "22": 60})

    out = merge_pairs_into_zonas(
        [_row("MG", 41238, 9, 100.0, p1), _row("MG", 41254, 9, 100.0, p2)]
    )

    assert len(out) == 1
    zona = out[0]
    assert zona["uf"] == "MG"
    assert zona["cod_zona"] == 9
    # A linha sintética é da zona inteira — sentinela 0, não um dos municípios.
    assert zona["cod_municipio_tse"] == 0

    envelope = zona["payload"]
    assert envelope["e"]["te"] == "1250"
    assert envelope["e"]["esi"] == "1100"
    assert envelope["e"]["c"] == "980"
    assert envelope["v"]["vvc"] == "850"
    assert envelope["v"]["vb"] == "25"
    assert envelope["s"]["ts"] == "13"
    assert envelope["s"]["si"] == "13"
    assert envelope["s"]["sa"] == "13"
    assert _cands(envelope) == {"13": 490, "22": 360}


def test_tres_pares_somam() -> None:
    """Três pares (o CSV tem zonas com até 8 municípios)."""
    pares = [
        _row("MG", 41238, 9, 100.0,
             _env(te=1_000, si=10, sa=10, ts=10, vvc=700, cands={"13": 400})),
        _row("MG", 41254, 9, 100.0,
             _env(te=250, si=3, sa=3, ts=3, vvc=150, cands={"13": 90})),
        _row("MG", 41270, 9, 100.0,
             _env(te=70, si=1, sa=1, ts=1, vvc=50, cands={"13": 30})),
    ]

    out = merge_pairs_into_zonas(pares)

    assert len(out) == 1
    assert out[0]["payload"]["e"]["te"] == "1320"
    assert _cands(out[0]["payload"]) == {"13": 520}


def test_candidato_presente_em_um_par_e_ausente_no_outro() -> None:
    """Candidato que só aparece num município entra na zona com o total dele;
    quem aparece nos dois soma. Ausência conta 0 — nunca é extrapolada."""
    p1 = _env(te=1_000, si=10, sa=10, ts=10, vvc=700, cands={"13": 400, "22": 300})
    p2 = _env(te=250, si=3, sa=3, ts=3, vvc=150, cands={"13": 90, "30": 60})

    out = merge_pairs_into_zonas(
        [_row("MG", 41238, 9, 100.0, p1), _row("MG", 41254, 9, 100.0, p2)]
    )

    assert _cands(out[0]["payload"]) == {"13": 490, "22": 300, "30": 60}


def test_pvap_recalculado_sobre_vvc_somado() -> None:
    """`pvap` (% sobre `v.vvc`) é recalculado com os totais da zona — se
    ficasse herdado do par dominante seria um percentual de outra base."""
    p1 = _env(te=1_000, si=10, sa=10, ts=10, vvc=600, cands={"13": 300})
    p2 = _env(te=250, si=3, sa=3, ts=3, vvc=400, cands={"13": 200})

    out = merge_pairs_into_zonas(
        [_row("MG", 41238, 9, 100.0, p1), _row("MG", 41254, 9, 100.0, p2)]
    )

    envelope = out[0]["payload"]
    assert envelope["v"]["vvc"] == "1000"
    cand = envelope["carg"][0]["agr"][0]["par"][0]["cand"][0]
    # 500 / 1000 = 50 %
    assert cand["pvap"] == "50,00"


def test_campos_nao_aditivos_vem_do_par_dominante() -> None:
    """Campos que não se somam (metadados de envelope) vêm do par de maior
    `e.te` — escolha documentada no módulo."""
    grande = _env(te=1_000, si=10, sa=10, ts=10, vvc=700, cands={"13": 400})
    grande["cdabr"] = "0009"
    grande["hg"] = "20:15:30"
    pequeno = _env(te=250, si=3, sa=3, ts=3, vvc=150, cands={"13": 90})
    pequeno["cdabr"] = "0009"
    pequeno["hg"] = "19:00:00"

    # Ordem de entrada com o pequeno primeiro — quem manda é o `te`.
    out = merge_pairs_into_zonas(
        [_row("MG", 41254, 9, 100.0, pequeno), _row("MG", 41238, 9, 100.0, grande)]
    )

    assert out[0]["payload"]["hg"] == "20:15:30"


def test_payloads_de_entrada_nao_sao_mutados() -> None:
    """O merge é em memória e não persiste nada (§ 1) — nem sequer altera os
    payloads crus que recebeu."""
    p1 = _env(te=1_000, si=10, sa=10, ts=10, vvc=700, cands={"13": 400})
    p2 = _env(te=250, si=3, sa=3, ts=3, vvc=150, cands={"13": 90})

    merge_pairs_into_zonas(
        [_row("MG", 41238, 9, 100.0, p1), _row("MG", 41254, 9, 100.0, p2)]
    )

    assert p1["e"]["te"] == "1000"
    assert _cands(p1) == {"13": 400}
    assert _cands(p2) == {"13": 90}


# ---------------------------------------------------------------------------
# psa
# ---------------------------------------------------------------------------


def test_psa_e_pct_apurado_sao_soma_de_sa_sobre_soma_de_si() -> None:
    """`psa = 100 · Σsa / Σsi` — e o `pct_apurado` da linha segue a mesma
    regra (o número que o leitor vê e o que o modelo lê são o mesmo)."""
    p1 = _env(te=1_000, si=10, sa=5, ts=10, vvc=700, cands={"13": 400}, psa="50,00")
    p2 = _env(te=250, si=10, sa=10, ts=10, vvc=150, cands={"13": 90}, psa="100,00")

    out = merge_pairs_into_zonas(
        [_row("MG", 41238, 9, 50.0, p1), _row("MG", 41254, 9, 100.0, p2)]
    )

    # (5 + 10) / (10 + 10) = 75 %
    assert out[0]["payload"]["s"]["psa"] == "75,00"
    assert out[0]["pct_apurado"] == pytest.approx(75.0)


def test_psa_cai_para_media_ponderada_quando_si_falta(caplog) -> None:
    """Par sem `s.si` (o campo é opcional no EA20) → média dos `psa` dos
    pares ponderada por `e.te`, com log `warn`."""
    p1 = _env(te=1_000, si=None, sa=5, ts=10, vvc=700, cands={"13": 400}, psa="50,00")
    p2 = _env(te=250, si=10, sa=10, ts=10, vvc=150, cands={"13": 90}, psa="100,00")

    with caplog.at_level("INFO", logger="api.model.zona_merge"):
        out = merge_pairs_into_zonas(
            [_row("MG", 41238, 9, 50.0, p1), _row("MG", 41254, 9, 100.0, p2)]
        )

    esperado = (50.0 * 1_000 + 100.0 * 250) / 1_250  # 60,00
    assert out[0]["pct_apurado"] == pytest.approx(esperado)
    assert out[0]["payload"]["s"]["psa"] == "60,00"
    assert any("s.si ausente" in registro.message for registro in caplog.records)


# ---------------------------------------------------------------------------
# Sentinela
# ---------------------------------------------------------------------------


def test_sentinela_descartada_quando_ha_par_real() -> None:
    """`cod_municipio_tse = 0` (alvo de nível `uf`/`br`) não soma em cima dos
    pares reais — mesmo padrão de
    `_discard_zero_zona_sentinel_when_real_zonas_exist` para `cod_zona = 0`."""
    sentinela = _env(te=99_999, si=99, sa=99, ts=99, vvc=9_999, cands={"13": 9_999})
    real = _env(te=1_000, si=10, sa=10, ts=10, vvc=700, cands={"13": 400})

    out = merge_pairs_into_zonas(
        [_row("MG", 0, 9, 80.0, sentinela), _row("MG", 41238, 9, 100.0, real)]
    )

    assert len(out) == 1
    # Só o par real sobrou — e como sobrou um só, é identidade.
    assert out[0]["cod_municipio_tse"] == 41238
    assert out[0]["payload"] is real


def test_sentinela_sozinha_e_mantida() -> None:
    """Zona que só tem a linha sentinela (nenhum par real ingerido ainda)
    mantém a sentinela — é o único dado disponível."""
    sentinela = _env(te=1_000, si=10, sa=10, ts=10, vvc=700, cands={"13": 400})
    linha = _row("MG", 0, 9, 80.0, sentinela)

    out = merge_pairs_into_zonas([linha])

    assert out == [linha]


def test_sentinela_de_uma_zona_nao_afeta_outra() -> None:
    """O descarte é por zona, não por UF: a zona 9 tem par real (descarta a
    sentinela dela), a zona 11 não tem (mantém a sua)."""
    out = merge_pairs_into_zonas(
        [
            _row("MG", 0, 9, 80.0,
                 _env(te=99, si=1, sa=1, ts=1, vvc=9, cands={"13": 9})),
            _row("MG", 41238, 9, 100.0,
                 _env(te=1_000, si=10, sa=10, ts=10, vvc=700, cands={"13": 400})),
            _row("MG", 0, 11, 40.0,
                 _env(te=500, si=5, sa=2, ts=5, vvc=300, cands={"13": 200})),
        ]
    )

    zonas = {linha["cod_zona"]: linha for linha in out}
    assert set(zonas) == {9, 11}
    assert zonas[9]["cod_municipio_tse"] == 41238
    assert zonas[11]["cod_municipio_tse"] == 0


# ---------------------------------------------------------------------------
# Determinismo e ordem (constituição § 6)
# ---------------------------------------------------------------------------


def test_permutar_a_entrada_nao_muda_nenhum_valor() -> None:
    """Soma é comutativa: qualquer permutação dos pares produz os MESMOS
    valores por zona.

    A ordem das LINHAS de saída segue a primeira aparição de cada zona na
    entrada — preservada de propósito (o bootstrap reamostra índices do vetor
    de zonas montado nessa ordem), por isso a comparação é por chave.
    """
    pares = [
        _row("MG", 41238, 9, 100.0,
             _env(te=1_000, si=10, sa=10, ts=10, vvc=700, cands={"13": 400, "22": 300})),
        _row("MG", 41254, 9, 100.0,
             _env(te=250, si=3, sa=3, ts=3, vvc=150, cands={"13": 90})),
        _row("MG", 41270, 9, 100.0,
             _env(te=70, si=1, sa=1, ts=1, vvc=50, cands={"22": 30})),
        _row("SP", 71072, 1, 50.0,
             _env(te=5_000, si=50, sa=25, ts=50, vvc=3_000, cands={"13": 1_500})),
    ]

    def _por_zona(linhas: list[dict[str, Any]]) -> dict[tuple[str, int], Any]:
        return {
            (linha["uf"], linha["cod_zona"]): (
                linha["pct_apurado"],
                linha["payload"]["e"]["te"],
                linha["payload"]["v"]["vvc"],
                linha["payload"]["s"]["psa"],
                tuple(sorted(_cands(linha["payload"]).items())),
            )
            for linha in linhas
        }

    base = _por_zona(merge_pairs_into_zonas(pares))
    for permutacao in (
        [pares[3], pares[2], pares[1], pares[0]],
        [pares[1], pares[3], pares[0], pares[2]],
        [pares[2], pares[0], pares[3], pares[1]],
    ):
        assert _por_zona(merge_pairs_into_zonas(permutacao)) == base


def test_ordem_de_saida_segue_a_primeira_aparicao_da_zona() -> None:
    """Contrato de ordem — `compute_uf_projections` monta o vetor de zonas na
    ordem em que elas chegam e o bootstrap reamostra índices desse vetor.
    Reordenar aqui mudaria os sorteios sem mudar o método."""
    pares = [
        _row("SP", 71072, 5, 100.0,
             _env(te=100, si=1, sa=1, ts=1, vvc=90, cands={"13": 50})),
        _row("MG", 41238, 9, 100.0,
             _env(te=1_000, si=10, sa=10, ts=10, vvc=700, cands={"13": 400})),
        _row("MG", 41254, 9, 100.0,
             _env(te=250, si=3, sa=3, ts=3, vvc=150, cands={"13": 90})),
        _row("SP", 67016, 2, 100.0,
             _env(te=200, si=2, sa=2, ts=2, vvc=180, cands={"13": 100})),
    ]

    out = merge_pairs_into_zonas(pares)

    assert [(linha["uf"], linha["cod_zona"]) for linha in out] == [
        ("SP", 5),
        ("MG", 9),
        ("SP", 2),
    ]


def test_lista_vazia() -> None:
    assert merge_pairs_into_zonas([]) == []


def test_payload_achatado_legado_com_dois_pares_tambem_soma() -> None:
    """Payload achatado `{cand: [...]}` (replay 2022 / fixtures sintéticas)
    não deveria aparecer numa zona multi-par — mas se aparecer, soma em vez de
    devolver em silêncio os votos de um par só."""
    p1 = {"cand": [{"n": "13", "vap": "400"}, {"n": "22", "vap": "300"}]}
    p2 = {"cand": [{"n": "13", "vap": "90"}, {"n": "30", "vap": "60"}]}

    out = merge_pairs_into_zonas(
        [_row("MG", 41238, 9, 100.0, p1), _row("MG", 41254, 9, 100.0, p2)]
    )

    assert len(out) == 1
    por_numero = {
        str(c["n"]): int(c["vap"]) for c in out[0]["payload"]["cand"]
    }
    assert por_numero == {"13": 490, "22": 300, "30": 60}
    # Os originais seguem intactos.
    assert [c["vap"] for c in p1["cand"]] == ["400", "300"]
