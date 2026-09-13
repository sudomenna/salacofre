"""tests/unit/model/test_build_uf_payloads_nome.py — spec 018, RF-144.

Duas direções, e as duas importam:

1. **Com** `identidade_by_cand`, o payload da UF traz o nome real no lugar do
   `f"Candidato {cid}"` literal.
2. **Sem** ele — caller legado, fixture antiga, `model_fallback_tier` — o
   payload traz o placeholder e nada quebra. É por isso que o parâmetro é
   opcional; tornar obrigatório derruba o teste 2.

Um teste só do caminho feliz não discrimina: ele passaria com o parâmetro
obrigatório e com o fallback quebrado.
"""

from typing import Any

from api.model.project import build_uf_payloads

UF_ROWS: list[dict[str, Any]] = [
    {
        "cargo": 3,
        "turno": 1,
        "uf": "SP",
        "candidato_id": 13,
        "pct_projetado": 55.0,
        "pct_projetado_lower": 53.0,
        "pct_projetado_upper": 57.0,
        "pct_apurado": 80.0,
    },
    {
        "cargo": 3,
        "turno": 1,
        "uf": "BA",
        "candidato_id": 13,
        "pct_projetado": 45.0,
        "pct_projetado_lower": 43.0,
        "pct_projetado_upper": 47.0,
        "pct_apurado": 80.0,
    },
]

NATIONAL_ROWS: list[dict[str, Any]] = [
    {"candidato_id": 13, "partido": "PT", "pct_projetado": 50.0}
]


def _build(identidade: dict[tuple[str, int], dict[str, str]] | None) -> dict[str, Any]:
    kwargs: dict[str, Any] = {}
    if identidade is not None:
        kwargs["identidade_by_cand"] = identidade
    return build_uf_payloads(
        cargo=3,
        turno=1,
        ts_iso="2026-10-04T18:23:15Z",
        uf_rows=UF_ROWS,
        national_rows=NATIONAL_ROWS,
        municipio_aggregates={},
        zona_municipio={},
        series_by_uf={},
        **kwargs,
    )


def _nome(out: dict[str, Any], uf: str, cid: int) -> str:
    (cand,) = [c for c in out[uf]["candidatos"] if c["id"] == cid]
    return cand["nome"]


def test_com_identidade_cada_uf_recebe_o_nome_da_propria_corrida():
    """O 13 de SP e o 13 da BA são pessoas diferentes e saem com nomes
    diferentes — é a colisão do ADR-0042 vista do lado do payload."""
    out = _build(
        {
            ("SP", 13): {"nome": "FERNANDO DE SP", "sqcand": "250002553928"},
            ("BA", 13): {"nome": "JAQUELINE DA BA", "sqcand": "50002553927"},
        }
    )

    assert _nome(out, "SP", 13) == "FERNANDO DE SP"
    assert _nome(out, "BA", 13) == "JAQUELINE DA BA"


def test_sem_identidade_o_payload_cai_no_placeholder_e_nao_quebra():
    """Mutação alvo: tornar `identidade_by_cand` obrigatório, ou trocar o
    `or f"Candidato {cid}"` por acesso direto. Os dois derrubam este teste."""
    out = _build(None)

    assert _nome(out, "SP", 13) == "Candidato 13"
    assert _nome(out, "BA", 13) == "Candidato 13"


def test_identidade_parcial_resolve_so_a_uf_que_tem_e_nao_vaza_para_a_outra():
    """Mutação alvo: chavear por número em vez de pelo par. Com um dict plano
    a BA herdaria "FERNANDO DE SP"."""
    out = _build({("SP", 13): {"nome": "FERNANDO DE SP"}})

    assert _nome(out, "SP", 13) == "FERNANDO DE SP"
    assert _nome(out, "BA", 13) == "Candidato 13"


def test_sqcand_entra_no_candidato_da_uf_quando_resolvido():
    out = _build(
        {
            ("SP", 13): {"nome": "FERNANDO DE SP", "sqcand": "250002553928"},
            ("BA", 13): {"nome": "JAQUELINE DA BA"},
        }
    )

    (sp,) = [c for c in out["SP"]["candidatos"] if c["id"] == 13]
    (ba,) = [c for c in out["BA"]["candidatos"] if c["id"] == 13]

    assert sp["sqcand"] == "250002553928"
    # Ausência é ausência — não string vazia, que endereçaria uma foto que não
    # existe (ADR-0041).
    assert "sqcand" not in ba


def test_nome_vazio_na_identidade_nao_sobrepoe_o_placeholder():
    """Defesa de profundidade: mesmo se o extrator um dia deixar passar um
    nome vazio, o payload não pode publicar um rótulo em branco."""
    out = _build({("SP", 13): {"nome": ""}})

    assert _nome(out, "SP", 13) == "Candidato 13"
