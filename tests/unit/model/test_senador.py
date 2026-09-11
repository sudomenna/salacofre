"""tests/unit/model/test_senador.py — spec 016 (Senador), lado do modelo.

O que estes testes travam, RF a RF:

  RF-102  a extrapolação do ADR-0021 roda no nível da UF e DIZ que rodou
          (`metodo.granularidade == "zona"` desde 2026-09-11); e uma UF sem boletim sai
          de fora — nunca imputada da proporção nacional, como acontece em
          Presidente (RF-017).
  RF-103  `p_eleito` é publicado por candidato e soma ≈ 2 por UF, não 1.
  RF-105  o payload da UF declara quantas vagas a corrida elege.
  RF-107  a composição nacional conta vagas POR PARTIDO, com o denominador
          das 54 em disputa e o total de 81 cadeiras do Senado explícitos.

Os testes que dependem do orchestrator inteiro montam o EA20 real (envelope
`carg[] → agr[] → par[] → cand[]`), porque é dele que sai a sigla do partido
que a RF-107 conta. Um payload achatado passaria sem sigla e o teste de
composição ficaria verde contando travessões.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest

from api.model.cargos import total_cadeiras, vagas_em_disputa, vagas_por_uf
from api.model.project import (
    build_edge_payload,
    build_uf_payloads,
    compute_p_eleito_by_uf,
    compute_uf_projections,
    extract_partido_by_cand,
)

# ---------------------------------------------------------------------------
# Fixtures — EA20 de cargo 5 em granularidade UF
# ---------------------------------------------------------------------------


def _ea20_senador(
    cand_pcts: dict[int, float],
    partidos: dict[int, str],
    *,
    esi: int = 1000,
    te: int = 1000,
) -> dict[str, Any]:
    """Envelope EA20 de Senador em granularidade UF (`tpabr: "uf"`).

    `te`/`esi` controlam o `k = te/esi` da regra de três — com `te == esi`
    a UF está 100% instalada e `k == 1`.

    Cada candidato ganha sua `agr`/`par` com a sigla REAL em `par.sg`: é de
    lá que `extract_partido_by_cand` lê o partido, e a RF-107 conta por ele.
    """
    vvc = 1000
    vaps = {cod: int(round(pct / 100.0 * vvc)) for cod, pct in cand_pcts.items()}
    vv = sum(vaps.values())
    return {
        "ele": "999999",
        "t": "1",
        "f": "o",
        "tpabr": "uf",
        "cdabr": "SP",
        "dg": "04/10/2026",
        "hg": "18:00:00",
        "carg": [
            {
                "cd": "5",
                "nmn": "Senador",
                "agr": [
                    {
                        "n": str(cod),
                        "nm": partidos[cod],
                        "tp": "i",
                        "par": [
                            {
                                "n": str(cod),
                                "sg": partidos[cod],
                                "nm": partidos[cod],
                                "cand": [
                                    {
                                        "n": str(cod),
                                        "sqcand": f"{cod}0000000001",
                                        "nm": f"CANDIDATO {cod}",
                                        "nmu": f"CANDIDATO {cod}",
                                        "e": "n",
                                        "vap": str(vaps[cod]),
                                        "pvap": f"{pct:.2f}".replace(".", ","),
                                        # RF-101 — suplentes. Senador é o
                                        # único cargo com DOIS.
                                        "vs": [
                                            {
                                                "tp": "s1",
                                                "sqcand": f"{cod}0000000002",
                                                "nm": f"SUPLENTE 1 DE {cod}",
                                                "nmu": f"SUP1 {cod}",
                                                "sgp": partidos[cod],
                                            },
                                            {
                                                "tp": "s2",
                                                "sqcand": f"{cod}0000000003",
                                                "nm": f"SUPLENTE 2 DE {cod}",
                                                "nmu": f"SUP2 {cod}",
                                                "sgp": partidos[cod],
                                            },
                                        ],
                                    }
                                ],
                            }
                        ],
                    }
                    for cod, pct in cand_pcts.items()
                ],
            }
        ],
        "s": {
            "ts": "1", "st": "1", "pst": "100,00",
            "si": "1", "psi": "100,00", "sa": "1", "psa": "100,00",
        },
        "e": {"te": str(te), "esi": str(esi), "c": "800", "a": "200"},
        "v": {
            "tv": "800", "vvc": str(vvc), "vv": str(vv), "vnom": str(vv),
            "vb": "10", "tvn": "10", "vn": "10", "vnt": "0",
        },
    }


def _snapshot_uf(uf: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Linha de snapshot como `fetch_snapshots` a devolve para um alvo de
    nível UF: `cod_zona = 0` é o sentinela de `lib/tse/targets.ts`."""
    return {
        "cargo": 5,
        "turno": 1,
        "uf": uf,
        "cod_municipio_tse": 0,
        "cod_zona": 0,
        "pct_apurado": 100.0,
        "payload": payload,
    }


SIGLAS = {100: "PT", 200: "PL", 300: "MDB", 400: "PSOL"}


@pytest.fixture
def cenario_sp_rj():
    """Duas UFs apuradas + uma terceira que respondeu sem nada apurado.

    SP: PT 40, PL 30, MDB 20, PSOL 10 — as duas vagas vão para PT e PL.
    RJ: PL 45, MDB 35, PT 20         — as duas vagas vão para PL e MDB.
    MG: arquivo chegou com `esi = 0` (nenhuma seção instalada ainda). É o
        caso que o RF-102 endereça: a UF EXISTE no ciclo e mesmo assim não
        pode receber projeção — em Presidente ela seria imputada do
        nacional (RF-017), em Senador não.
    """
    mg = _ea20_senador({100: 0.0, 200: 0.0}, SIGLAS, esi=0)
    snapshots = [
        _snapshot_uf(
            "SP", _ea20_senador({100: 40.0, 200: 30.0, 300: 20.0, 400: 10.0}, SIGLAS)
        ),
        _snapshot_uf("RJ", _ea20_senador({200: 45.0, 300: 35.0, 100: 20.0}, SIGLAS)),
        {**_snapshot_uf("MG", mg), "pct_apurado": 0.0},
    ]
    eleitorado = {("SP", 1): 30_000, ("RJ", 1): 12_000, ("MG", 1): 15_000}
    return snapshots, eleitorado


def _projetar(snapshots, eleitorado, cargo=5):
    return compute_uf_projections(
        cargo=cargo,
        turno=1,
        seed_base=20260911,
        snapshots=snapshots,
        eleitorado=eleitorado,
    )


# ---------------------------------------------------------------------------
# RF-102 — extrapolação no nível da UF
# ---------------------------------------------------------------------------


def test_rf102_metodo_declara_granularidade_zona(cenario_sp_rj):
    snapshots, eleitorado = cenario_sp_rj
    rows, _est, _est_c, _cand = _projetar(snapshots, eleitorado)

    assert rows, "nenhuma linha projetada — o cenário não exercita nada"
    for r in rows:
        assert r["metodo"]["granularidade"] == "zona", (
            "cargo 5 é ingerido por UF (ADR-0026 item 1); o payload precisa "
            "declarar isso, senão a tela afirma a mesma granularidade zonal "
            "de Presidente/Governador"
        )


def test_rf102_presidente_continua_declarando_zona(cenario_sp_rj):
    """Contraprova: o campo novo não é constante. Trocar o cargo troca o
    rótulo — se alguém fixar `"uf"` no código, este teste cai."""
    snapshots, eleitorado = cenario_sp_rj
    presidenciais = [{**s, "cargo": 1} for s in snapshots]
    rows, _e, _ec, _c = _projetar(presidenciais, eleitorado, cargo=1)

    assert rows
    assert {r["metodo"]["granularidade"] for r in rows} == {"zona"}


def test_rf102_uf_sem_apuracao_sai_aguardando_e_nunca_imputada(cenario_sp_rj):
    """A 2ª aceitação do RF-102, e a diferença deliberada em relação ao
    RF-017 de Presidente: MG não apurou nada e NÃO recebe a proporção
    nacional. A composição partidária do Senado varia demais entre estados
    para que o nacional signifique algo em MG."""
    snapshots, eleitorado = cenario_sp_rj
    rows, estimates, _ec, _c = _projetar(snapshots, eleitorado)

    assert "MG" not in estimates
    assert {r["uf"] for r in rows} == {"SP", "RJ"}
    assert all(r["metodo"]["tipo"] != "imputado_nacional" for r in rows)


def test_rf102_presidente_ainda_imputa_mg_do_nacional(cenario_sp_rj):
    """Contraprova do anterior: o caminho de imputação continua existindo —
    ele é só de Presidente (RF-017). Sem este teste, um `continue` mal posto
    passaria por 'comportamento correto de Senador'."""
    snapshots, eleitorado = cenario_sp_rj
    presidenciais = [{**s, "cargo": 1} for s in snapshots]
    rows, estimates, _ec, _c = _projetar(presidenciais, eleitorado, cargo=1)

    assert "MG" in estimates
    imputadas = {r["uf"] for r in rows if r["metodo"]["tipo"] == "imputado_nacional"}
    assert imputadas == {"MG"}


# ---------------------------------------------------------------------------
# RF-103 — p_eleito
# ---------------------------------------------------------------------------


def test_rf103_soma_dos_p_eleito_tende_a_duas_vagas(cenario_sp_rj):
    snapshots, eleitorado = cenario_sp_rj
    _rows, estimates, _ec, _c = _projetar(snapshots, eleitorado)

    p_por_uf = compute_p_eleito_by_uf(estimates, vagas_por_uf(5))

    assert set(p_por_uf) == {"SP", "RJ"}
    for uf, p_map in p_por_uf.items():
        assert sum(p_map.values()) == pytest.approx(2.0, abs=1e-9), (
            f"{uf}: a soma tem que fechar em 2 (duas vagas), não em 1 — é a "
            "diferença entre 'quem lidera' e 'quem se elege'"
        )


def test_rf103_os_dois_primeiros_sao_os_eleitos(cenario_sp_rj):
    snapshots, eleitorado = cenario_sp_rj
    _rows, estimates, _ec, _c = _projetar(snapshots, eleitorado)
    p_por_uf = compute_p_eleito_by_uf(estimates, 2)

    # SP: PT(100) 40 e PL(200) 30 ficam com as vagas; MDB(300) e PSOL(400) não.
    sp = p_por_uf["SP"]
    assert sp[100] > sp[300]
    assert sp[200] > sp[300]
    assert sp[400] <= sp[300]


def test_rf103_terceiro_com_ic_sobreposto_nao_zera():
    """A 2ª aceitação do RF-103, exercitada onde ela pode existir: sobre
    estimativas COM dispersão.

    Não é possível produzi-la pelo pipeline de cargo 5 hoje — com ingestão
    em granularidade UF cada estado tem UMA unidade de reamostragem, o
    bootstrap devolve 1.000 réplicas idênticas e todo `p_eleito` degenera
    para 0 ou 1 (ver a docstring de `compute_p_eleito_by_uf`). O teste
    fixa então o contrato da função sobre estimativas com sobreposição
    real, que é o que o modelo produzirá se/quando o cargo passar a zona.
    """
    rng = np.random.default_rng(7)
    estimates = {
        "SP": {
            100: rng.normal(0.40, 0.02, 4000),
            200: rng.normal(0.30, 0.02, 4000),
            300: rng.normal(0.295, 0.02, 4000),  # cola no 2º
        }
    }
    p = compute_p_eleito_by_uf(estimates, 2)["SP"]

    assert p[300] > 0.0, "3º com IC colado no 2º tem chance de vaga, não zero"
    assert p[300] < 0.5
    assert sum(p.values()) == pytest.approx(2.0, abs=1e-9)


def test_rf103_vagas_invalidas_sao_recusadas():
    with pytest.raises(ValueError):
        compute_p_eleito_by_uf({"SP": {1: np.zeros(3)}}, 0)


def test_rf103_p_eleito_chega_ao_payload_da_uf(cenario_sp_rj):
    snapshots, eleitorado = cenario_sp_rj
    rows, estimates, estimates_c, _c = _projetar(snapshots, eleitorado)
    p_por_uf = compute_p_eleito_by_uf(estimates, 2)

    payloads = build_uf_payloads(
        cargo=5,
        turno=1,
        ts_iso="2026-10-04T21:00:00Z",
        uf_rows=rows,
        national_rows=[],
        municipio_aggregates={},
        zona_municipio={},
        series_by_uf={},
        estimates_by_uf=estimates,
        estimates_c_by_uf=estimates_c,
        p_eleito_by_uf=p_por_uf,
        vagas=2,
        partido_by_cand=extract_partido_by_cand(snapshots, cargo=5),
    )

    sp = payloads["SP"]
    assert all("p_eleito" in c for c in sp["candidatos"])
    assert sum(c["p_eleito"] for c in sp["candidatos"]) == pytest.approx(2.0, abs=1e-9)


def test_p_eleito_ausente_quando_o_caller_nao_calcula(cenario_sp_rj):
    """Compat retroativa: sem o parâmetro, a chave não aparece. Um `0.0`
    default afirmaria 'não se elege em cenário nenhum' — que é dado, não
    ausência de dado."""
    snapshots, eleitorado = cenario_sp_rj
    rows, estimates, estimates_c, _c = _projetar(snapshots, eleitorado)

    payloads = build_uf_payloads(
        cargo=5,
        turno=1,
        ts_iso="2026-10-04T21:00:00Z",
        uf_rows=rows,
        national_rows=[],
        municipio_aggregates={},
        zona_municipio={},
        series_by_uf={},
        estimates_by_uf=estimates,
        estimates_c_by_uf=estimates_c,
    )
    assert all("p_eleito" not in c for c in payloads["SP"]["candidatos"])
    assert "vagas" not in payloads["SP"]


# ---------------------------------------------------------------------------
# RF-105 / RF-106 — a UF declara quantas vagas elege
# ---------------------------------------------------------------------------


def test_rf105_payload_da_uf_declara_duas_vagas(cenario_sp_rj):
    snapshots, eleitorado = cenario_sp_rj
    rows, estimates, estimates_c, _c = _projetar(snapshots, eleitorado)

    payloads = build_uf_payloads(
        cargo=5,
        turno=1,
        ts_iso="2026-10-04T21:00:00Z",
        uf_rows=rows,
        national_rows=[],
        municipio_aggregates={},
        zona_municipio={},
        series_by_uf={},
        estimates_by_uf=estimates,
        estimates_c_by_uf=estimates_c,
        vagas=vagas_por_uf(5),
    )

    assert payloads["SP"]["vagas"] == 2
    assert payloads["SP"]["granularidade"] == "zona"


# ---------------------------------------------------------------------------
# RF-107 — composição das 54 vagas
# ---------------------------------------------------------------------------


def _composicao(cenario) -> dict[str, Any]:
    snapshots, eleitorado = cenario
    rows, _est, _est_c, _cand = _projetar(snapshots, eleitorado)
    eleitorado_total = {"SP": 30_000, "RJ": 12_000, "MG": 15_000}
    payload = build_edge_payload(
        cargo=5,
        turno=1,
        ts_iso="2026-10-04T21:00:00Z",
        uf_rows=rows,
        national_rows=[],
        eleitorado_total_by_uf=eleitorado_total,
        partido_by_cand=extract_partido_by_cand(snapshots, cargo=5),
        vagas=vagas_por_uf(5),
        vagas_em_disputa=vagas_em_disputa(5),
        total_cadeiras=total_cadeiras(5),
    )
    return payload


def test_rf107_denominador_e_54_e_o_senado_tem_81(cenario_sp_rj):
    comp = _composicao(cenario_sp_rj)["composicao_vagas"]

    assert comp["vagas_em_disputa"] == 54
    assert comp["total_cadeiras"] == 81
    assert comp["vagas_por_uf"] == 2


def test_rf107_denominador_nao_encolhe_com_a_apuracao(cenario_sp_rj):
    """Só 2 das 3 UFs apuraram, e ainda assim o denominador é 54.

    Derivá-lo das UFs presentes faria a tela dizer 'de 4 vagas' às 18h e
    'de 54' às 22h — o leitor concluiria que vagas apareceram durante a
    noite."""
    comp = _composicao(cenario_sp_rj)["composicao_vagas"]

    assert comp["vagas_em_disputa"] == 54
    assert comp["vagas_projetadas"] == 4  # 2 UFs × 2 vagas
    assert comp["ufs_projetadas"] == 2
    assert comp["ufs_aguardando"] == 25  # 27 − 2


def test_rf107_conta_vagas_por_partido(cenario_sp_rj):
    comp = _composicao(cenario_sp_rj)["composicao_vagas"]
    por_partido = {d["partido"]: d["vagas"] for d in comp["por_partido"]}

    # SP → PT, PL. RJ → PL, MDB.
    assert por_partido == {"PL": 2, "PT": 1, "MDB": 1}
    assert "—" not in por_partido, (
        "sigla em branco significa que `par.sg` não foi lido do EA20 — a "
        "contagem por partido vira uma contagem de travessões"
    )
    # Ordem determinística: mais vagas primeiro, sigla como desempate.
    assert [d["partido"] for d in comp["por_partido"]] == ["PL", "MDB", "PT"]


def test_rf107_bloco_nao_existe_em_cargo_de_uma_vaga(cenario_sp_rj):
    """Governador não tem composição de vagas para contar — o bloco inteiro
    tem que sumir, não sair zerado."""
    snapshots, eleitorado = cenario_sp_rj
    govs = [{**s, "cargo": 3} for s in snapshots]
    rows, _e, _ec, _c = _projetar(govs, eleitorado, cargo=3)

    payload = build_edge_payload(
        cargo=3,
        turno=1,
        ts_iso="2026-10-04T21:00:00Z",
        uf_rows=rows,
        national_rows=[],
        eleitorado_total_by_uf={"SP": 30_000, "RJ": 12_000, "MG": 15_000},
        vagas=vagas_por_uf(3),
        vagas_em_disputa=vagas_em_disputa(3),
        total_cadeiras=total_cadeiras(3),
    )
    assert "composicao_vagas" not in payload


# ---------------------------------------------------------------------------
# RF-101 — suplentes sobrevivem ao snapshot
# ---------------------------------------------------------------------------


def test_rf101_suplentes_seguem_recuperaveis_do_payload(cenario_sp_rj):
    """Constituição § 6: todo valor exibível tem que ser reproduzível do
    snapshot. O modelo não lê `vs[]` — e é exatamente por isso que o teste
    existe: um "enxugamento" do payload para poupar bytes passaria em toda a
    suíte do modelo e só apareceria no dia em que a tela precisasse do nome
    do suplente."""
    snapshots, _eleitorado = cenario_sp_rj
    payload = snapshots[0]["payload"]

    cands = [
        c
        for carg in payload["carg"]
        for agr in carg["agr"]
        for par in agr["par"]
        for c in par["cand"]
    ]
    assert cands
    for c in cands:
        assert [v["tp"] for v in c["vs"]] == ["s1", "s2"]


def test_extract_partido_ignora_candidato_sem_sigla():
    """Degradação: `par.sg` ausente não pode virar `""` nem derrubar a
    varredura — o candidato simplesmente fica fora do mapa, e o payload cai
    no travessão."""
    payload = _ea20_senador({100: 60.0, 200: 40.0}, {100: "PT", 200: "PL"})
    payload["carg"][0]["agr"][1]["par"][0]["sg"] = "   "

    mapa = extract_partido_by_cand([_snapshot_uf("SP", payload)], cargo=5)
    assert mapa == {100: "PT"}
