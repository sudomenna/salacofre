"""tests/unit/model/test_national_sem_nome_em_cargo_3_5.py — spec 018, RF-145.

**Este é o teste que grita** quando alguém decidir "melhorar" o bloco nacional
estendendo o nome real a Governador e Senador.

Em cargo 3 e 5, `national.candidatos` não é uma corrida: é a **união de 27
corridas** sob o mesmo espaço de `id`, com `rank` reiniciando a cada UF. Ali
`id === 13` não identifica uma pessoa — identifica "o número 13 nalguma UF".
Qualquer nome atribuído é ambíguo **por construção**, não apenas impreciso.

Em cargo 1 existe de fato uma corrida nacional única (13 candidaturas, 13
números distintos em 2026), então o nome real entra.

As asserções de cargo 3 e 5 são **negativas** — "o nome do cadastro não está
lá". A positiva ("o placeholder está lá") passaria com nomes reais ao lado,
porque `top_candidatos` legitimamente os carrega no mesmo payload.
"""

import json
from typing import Any

from api.model.project import build_edge_payload

NOMES_REAIS = ("FERNANDO DE SP", "JAQUELINE DA BA")

IDENTIDADE: dict[tuple[str, int], dict[str, str]] = {
    ("SP", 13): {"nome": NOMES_REAIS[0], "sqcand": "250002553928"},
    ("BA", 13): {"nome": NOMES_REAIS[1], "sqcand": "50002553927"},
}

UF_ROWS: list[dict[str, Any]] = [
    {
        "cargo": 3,
        "turno": 1,
        "uf": "SP",
        "candidato_id": 13,
        "pct_projetado": 55.0,
        "pct_apurado": 80.0,
    },
    {
        "cargo": 3,
        "turno": 1,
        "uf": "BA",
        "candidato_id": 13,
        "pct_projetado": 45.0,
        "pct_apurado": 80.0,
    },
]

NATIONAL_ROWS: list[dict[str, Any]] = [
    {"candidato_id": 13, "pct_projetado": 50.0, "rank": 1}
]


def _build(cargo: int) -> dict[str, Any]:
    return build_edge_payload(
        cargo=cargo,
        turno=1,
        ts_iso="2026-10-04T18:23:15Z",
        uf_rows=UF_ROWS,
        national_rows=NATIONAL_ROWS,
        eleitorado_total_by_uf={"SP": 1000, "BA": 500},
        identidade_by_cand=IDENTIDADE,
    )


def test_cargo_3_o_bloco_nacional_nao_contem_nenhum_nome_do_cadastro():
    """Asserção NEGATIVA sobre o bloco nacional serializado."""
    nacional = _build(3)["national"]["candidatos"]
    serializado = json.dumps(nacional, ensure_ascii=False)

    for nome in NOMES_REAIS:
        assert nome not in serializado

    assert nacional[0]["nome"] == "Candidato 13"
    # `sqcand` segue a mesma porta: no nacional de cargo 3 ele apontaria para a
    # foto de um candidato de UF arbitrária.
    assert "sqcand" not in nacional[0]


def test_cargo_5_o_bloco_nacional_nao_contem_nenhum_nome_do_cadastro():
    nacional = _build(5)["national"]["candidatos"]
    serializado = json.dumps(nacional, ensure_ascii=False)

    for nome in NOMES_REAIS:
        assert nome not in serializado

    assert nacional[0]["nome"] == "Candidato 13"


def test_cargo_1_o_bloco_nacional_recebe_o_nome_real():
    """A contraprova. Sem ela, "nunca preencher nome no nacional" passaria os
    dois testes acima e seria igualmente errado."""
    nacional = _build(1)["national"]["candidatos"]

    assert nacional[0]["nome"] in NOMES_REAIS
    assert nacional[0]["sqcand"] in ("250002553928", "50002553927")


def test_cargo_1_colapsa_por_numero_de_forma_deterministica():
    """Na corrida presidencial o mesmo número traz o mesmo nome em qualquer
    UF, então colapsar por número não perde informação — mas a escolha tem de
    ser a MESMA em toda execução (constituição § 6). A varredura é por chave
    ordenada, então "BA" vence "SP"."""
    primeira = _build(1)["national"]["candidatos"][0]["nome"]
    segunda = _build(1)["national"]["candidatos"][0]["nome"]

    assert primeira == segunda == NOMES_REAIS[1]  # BA < SP


def test_top_candidatos_recebe_nome_em_cargo_3_mesmo_com_o_nacional_mudo():
    """A assimetria é o ponto: o nacional cala, a linha da UF fala. É onde a
    tela vai ler (spec 018, RF-144), e ali a UF é conhecida."""
    por_uf = {u["sigla"]: u for u in _build(3)["por_uf"]}

    assert por_uf["SP"]["top_candidatos"][0]["nome"] == NOMES_REAIS[0]
    assert por_uf["BA"]["top_candidatos"][0]["nome"] == NOMES_REAIS[1]
    assert por_uf["SP"]["top_candidatos"][0]["sqcand"] == "250002553928"


def test_sem_identidade_o_nacional_de_cargo_1_mantem_o_placeholder():
    payload = build_edge_payload(
        cargo=1,
        turno=1,
        ts_iso="2026-10-04T18:23:15Z",
        uf_rows=UF_ROWS,
        national_rows=NATIONAL_ROWS,
        eleitorado_total_by_uf={"SP": 1000, "BA": 500},
    )

    assert payload["national"]["candidatos"][0]["nome"] == "Candidato 13"
    assert "nome" not in payload["por_uf"][0]["top_candidatos"][0]
