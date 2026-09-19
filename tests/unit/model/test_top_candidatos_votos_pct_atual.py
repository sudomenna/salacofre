"""tests/unit/model/test_top_candidatos_votos_pct_atual.py

2026-09-18 — pedido do dono: o balão do mapa nacional (estilo NYT) precisa de
"Votos" e "% de votos válidos apurados" por candidato, que `EdgeUfRow.
top_candidatos[]` não carregava. `api/model/project.py` passa a publicar
`votos_atuais`/`pct_atual` ali, com os MESMOS nomes/semântica de
`EdgeUfCandidate` (o payload de drill-down de UF já os tem).

O que este arquivo trava:
  - presentes em `uf_rows`, os dois campos aparecem em `top_candidatos[]`
    com o valor exato;
  - **ausência nunca vira zero**: `pct_atual=None` (o caso real da imputação
    nacional, `impute_uf_from_national`, cargo 1) faz a CHAVE sumir do dict —
    não `"pct_atual": 0.0`. Mutação alvo óbvia: `r.get("pct_atual") or 0.0`
    em vez de `is not None`, que essa suíte pega porque `0.0` E `None` viram
    "ausente" pela mesma regra `or`, e o teste (2) exige que só o segundo
    suma;
  - `votos_atuais=0` é tratado como um FATO (zero boletim chegado) e
    PERMANECE no payload como `0` — não é o mesmo caso de `pct_atual=None`.
"""

from typing import Any

from api.model.project import build_edge_payload

UF_ROWS_COMPLETOS: list[dict[str, Any]] = [
    {
        "cargo": 1,
        "turno": 1,
        "uf": "BA",
        "candidato_id": 13,
        "pct_projetado": 55.0,
        "pct_apurado": 80.0,
        "votos_atuais": 123456,
        "pct_atual": 54.2,
    },
    {
        "cargo": 1,
        "turno": 1,
        "uf": "BA",
        "candidato_id": 22,
        "pct_projetado": 45.0,
        "pct_apurado": 80.0,
        "votos_atuais": 98765,
        "pct_atual": 43.1,
    },
]

NATIONAL_ROWS: list[dict[str, Any]] = [
    {"candidato_id": 13, "pct_projetado": 55.0, "rank": 1},
    {"candidato_id": 22, "pct_projetado": 45.0, "rank": 2},
]


def _top_candidatos_ba(uf_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    payload = build_edge_payload(
        cargo=1,
        turno=1,
        ts_iso="2026-10-04T18:23:15Z",
        uf_rows=uf_rows,
        national_rows=NATIONAL_ROWS,
        eleitorado_total_by_uf={"BA": 500},
    )
    (ba,) = [u for u in payload["por_uf"] if u["sigla"] == "BA"]
    return ba["top_candidatos"]


def test_votos_atuais_e_pct_atual_presentes_entram_no_payload():
    top = _top_candidatos_ba(UF_ROWS_COMPLETOS)
    por_id = {c["id"]: c for c in top}

    assert por_id[13]["votos_atuais"] == 123456
    assert por_id[13]["pct_atual"] == 54.2
    assert por_id[22]["votos_atuais"] == 98765
    assert por_id[22]["pct_atual"] == 43.1


def test_ausencia_de_pct_atual_nao_vira_zero_a_chave_some():
    """Simula `impute_uf_from_national`: `pct_atual` explicitamente `None`
    (não sabemos a fração DESTE candidato), `votos_atuais` explicitamente
    `0` (fato real — zero zona apurada). Os dois têm de sair DIFERENTES:
    `pct_atual` ausente do dict, `votos_atuais` presente e igual a `0`.
    """
    uf_rows_imputados = [
        {**UF_ROWS_COMPLETOS[0], "votos_atuais": 0, "pct_atual": None},
        {**UF_ROWS_COMPLETOS[1], "votos_atuais": 0, "pct_atual": None},
    ]
    top = _top_candidatos_ba(uf_rows_imputados)
    por_id = {c["id"]: c for c in top}

    assert "pct_atual" not in por_id[13], "pct_atual=None vazou como chave presente"
    assert "pct_atual" not in por_id[22]
    assert por_id[13]["votos_atuais"] == 0
    assert por_id[22]["votos_atuais"] == 0


def test_linha_sem_as_chaves_nenhuma_regressao_de_keyerror():
    """`uf_rows` sem `votos_atuais`/`pct_atual` (payload pré-migração, ou
    caller legado/teste antigo, ex. `test_sqcand_string.py::UF_ROWS`) não
    pode quebrar `build_edge_payload` nem inventar as chaves."""
    uf_rows_legados: list[dict[str, Any]] = [
        {
            "cargo": 1,
            "turno": 1,
            "uf": "BA",
            "candidato_id": 13,
            "pct_projetado": 55.0,
            "pct_apurado": 80.0,
        },
        {
            "cargo": 1,
            "turno": 1,
            "uf": "BA",
            "candidato_id": 22,
            "pct_projetado": 45.0,
            "pct_apurado": 80.0,
        },
    ]
    top = _top_candidatos_ba(uf_rows_legados)

    for item in top:
        assert "votos_atuais" not in item
        assert "pct_atual" not in item
