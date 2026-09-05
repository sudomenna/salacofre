"""S07/hardening — EA20 2026 real envelope (schema rewrite 2026-09-05).

Cobre os helpers de `api/model/project.py` reescritos para o leiaute EA20
2026 REAL (`docs/reference/tse-2026-leiautes.md`), que substitui a premissa
anterior (nunca confirmada contra o PDF oficial) de um envelope com array
`abr[]` e candidatos com campos `cc`/`pn`/`pnm`/`sg` direto em `cand`:

  - `_payload_root`: normaliza envelope real 2026 (`carg[]`/`e`/`v`/`s` de
    raiz, SEM `abr[]`) OU payload achatado legado `{cand: [...]}`.
  - `_iter_cands`: lista de candidatos do payload normalizado, enriquecidos
    com `partido_sg`/`partido_n` do nível `par[]` (um nível acima do
    candidato na hierarquia real `carg[].agr[].par[].cand[]`).
  - `_extract_zone_candidate_pcts`: contra a fixture REAL de ingestão
    (`tests/fixtures/tse/2022/presidente-sp-z0001.json`, já migrada para o
    leiaute 2026), não só contra o payload achatado sintético.
  - `_extract_zone_participacao`: extrai comparecimento/abstenção/válidos/
    anulados/sub judice dos objetos de raiz `e`/`v`/`s` (não mais de
    `abr[0].tap/tc/ta/...`, que nunca existiram no documento oficial).
  - `fetch_municipio_aggregates` com `FakeCursor` devolvendo o envelope
    real — soma `vap` corretamente via `carg[].agr[].par[].cand[]`.

Contexto do bug (achado por `docs/reference/tse-2026-leiautes.md` § 2, ao
migrar `lib/tse/ea20-schema.ts` para o leiaute real): o EA20 real não tem
`abr[]` — cada arquivo já é uma única abrangência, com candidatos em
`carg[].agr[].par[].cand[]` e participação em `e`/`v`/`s` de raiz. O fix S07
anterior (`_payload_abr0`) corrigiu um bug real (payload achatado no topo),
mas sobre um schema de envelope que nunca existiu (`abr[]`). Este arquivo
testa a versão corrigida contra o schema real.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

FIXTURES_2022 = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "tse" / "2022"
FIXTURES_2026 = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "tse" / "2026"


def _load(path: Path) -> dict[str, Any]:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _load_sp_z0001_2022() -> dict[str, Any]:
    return _load(FIXTURES_2022 / "presidente-sp-z0001.json")


def _load_sp_z0001_2026() -> dict[str, Any]:
    return _load(FIXTURES_2026 / "zona-presidente-sp-z0001.json")


# ---------------------------------------------------------------------------
# _payload_root
# ---------------------------------------------------------------------------


def test_payload_root_envelope_returns_payload_itself() -> None:
    """EA20 real não tem `abr[]` — o próprio payload já é a zona."""
    from api.model.project import _payload_root

    envelope = _load_sp_z0001_2022()
    root = _payload_root(envelope)
    assert root is envelope
    assert root["cdabr"] == "0001"
    assert root["tpabr"] == "zona"
    assert isinstance(root["carg"], list)
    assert len(root["carg"]) == 1


def test_payload_root_flat_payload_returns_itself() -> None:
    from api.model.project import _payload_root

    flat = {"cand": [{"n": "13", "pvap": "50,00"}]}
    assert _payload_root(flat) is flat


def test_payload_root_recognizes_participacao_only_payload() -> None:
    """Payload sem `carg`/`cand` mas com `e`/`v`/`s` de raiz (ex.: cargo sem
    candidatos ainda cadastrados) ainda é reconhecido — participação não
    depende de `carg` estar presente."""
    from api.model.project import _payload_root

    participacao_only = {"e": {"te": "100"}, "v": {}, "s": {}}
    assert _payload_root(participacao_only) is participacao_only


def test_payload_root_unrecognized_returns_none() -> None:
    from api.model.project import _payload_root

    assert _payload_root({}) is None
    assert _payload_root(None) is None
    assert _payload_root({"carg": []}) is None
    assert _payload_root({"carg": "not-a-list"}) is None
    assert _payload_root("string") is None


# ---------------------------------------------------------------------------
# _iter_cands — inclui enriquecimento de partido (par[].sg / par[].n)
# ---------------------------------------------------------------------------


def test_iter_cands_envelope_returns_both_candidates() -> None:
    from api.model.project import _iter_cands

    envelope = _load_sp_z0001_2022()
    cands = _iter_cands(envelope)
    assert len(cands) == 2
    assert {c["n"] for c in cands} == {"13", "22"}


def test_iter_cands_enriches_candidate_with_partido_from_par_level() -> None:
    """BUG confirmado por docs/reference/tse-2026-leiautes.md § 2: partido
    (`sg`, `nm`) vive em `par[]`, um nível ACIMA do candidato — não em
    `cand.sg`/`cand.pn` (campos que não existem no EA20 real)."""
    from api.model.project import _iter_cands

    envelope = _load_sp_z0001_2022()
    cands = _iter_cands(envelope)
    by_n = {c["n"]: c for c in cands}

    assert by_n["13"]["partido_sg"] == "PT"
    assert by_n["13"]["partido_n"] == "13"
    assert by_n["22"]["partido_sg"] == "PL"
    assert by_n["22"]["partido_n"] == "22"

    # Campos do candidato em si continuam intactos.
    assert by_n["13"]["nmu"] == "LULA"
    assert by_n["13"]["e"] == "s"


def test_iter_cands_flat_payload_partido_is_none() -> None:
    """Payload achatado legado (replay 2022) não tem hierarquia de
    partido — `partido_sg`/`partido_n` degradam para `None`, não quebram."""
    from api.model.project import _iter_cands

    flat = {"cand": [{"n": "13", "pvap": "50,00"}]}
    cands = _iter_cands(flat)
    assert len(cands) == 1
    assert cands[0]["partido_sg"] is None
    assert cands[0]["partido_n"] is None


def test_iter_cands_cargo_filter_matches_by_cd() -> None:
    from api.model.project import _iter_cands

    envelope = _load_sp_z0001_2022()
    # carg[0].cd == "1" (Presidente).
    assert len(_iter_cands(envelope, cargo=1)) == 2
    assert _iter_cands(envelope, cargo=3) == []  # Governador — não presente.


def test_iter_cands_empty_or_none_returns_empty_list() -> None:
    from api.model.project import _iter_cands

    assert _iter_cands({}) == []
    assert _iter_cands(None) == []
    assert _iter_cands({"carg": []}) == []


def test_iter_cands_2026_canonical_fixture_single_candidate_with_vice() -> None:
    """Fixture 2026 canônica (`tests/fixtures/tse/2026/zona-presidente-sp-
    z0001.json`) tem 1 único candidato com `vs[]` (vice) — confirma que
    `_iter_cands` não quebra com elementos extras (`vs`) no dict do
    candidato, e que o enriquecimento de partido funciona igual."""
    from api.model.project import _iter_cands

    envelope = _load_sp_z0001_2026()
    cands = _iter_cands(envelope)
    assert len(cands) == 1
    assert cands[0]["n"] == "13"
    assert cands[0]["partido_sg"] == "PT"
    assert isinstance(cands[0]["vs"], list)


# ---------------------------------------------------------------------------
# _extract_zone_candidate_pcts — contra o payload REAL (não achatado)
# ---------------------------------------------------------------------------


def test_extract_zone_candidate_pcts_reads_real_envelope() -> None:
    """Payload EA20 real (`carg[].agr[].par[].cand[]`) deve devolver os
    dois candidatos com `pvap/100` (fração), lido de `presidente-sp-
    z0001.json` (`pvap`: "63,46" e "36,53")."""
    from api.model.project import _extract_zone_candidate_pcts

    envelope = _load_sp_z0001_2022()
    out = _extract_zone_candidate_pcts(envelope)

    assert out == {
        13: 63.46 / 100.0,
        22: 36.53 / 100.0,
    }


def test_extract_zone_candidate_pcts_flat_payload_still_works() -> None:
    """Regressão: payload achatado legado (replay 2022 / fixtures antigas)
    continua funcionando após a reescrita do envelope."""
    from api.model.project import _extract_zone_candidate_pcts

    flat = {"cand": [{"n": "13", "pvap": "63,46"}, {"n": "22", "pvap": "36,53"}]}
    out = _extract_zone_candidate_pcts(flat)
    assert out == {13: 63.46 / 100.0, 22: 36.53 / 100.0}


def test_extract_zone_candidate_pcts_unrecognized_payload_returns_empty() -> None:
    from api.model.project import _extract_zone_candidate_pcts

    assert _extract_zone_candidate_pcts({}) == {}
    assert _extract_zone_candidate_pcts(None) == {}
    assert _extract_zone_candidate_pcts("garbage") == {}


# ---------------------------------------------------------------------------
# _extract_zone_participacao — objetos de raiz e/v/s (não mais abr[0])
# ---------------------------------------------------------------------------


def test_extract_zone_participacao_reads_real_envelope() -> None:
    """Fixture `presidente-sp-z0001.json` (2022, migrada para leiaute
    real): e.te=350, e.esi=350, e.c=280, e.a=70, v.vb=10, v.tvn=10,
    v.vv=260, s.psa=75,00 — sem `van`/`vansj` (degradam para 0)."""
    from api.model.project import _extract_zone_participacao

    envelope = _load_sp_z0001_2022()
    out = _extract_zone_participacao(envelope)

    assert out is not None
    assert out["eleitores_aptos"] == 350
    assert out["eleitores_instalados"] == 350
    assert out["comparecimento"] == 280
    assert out["abstencao"] == 70
    assert out["brancos"] == 10
    assert out["nulos"] == 10
    assert out["validos"] == 260
    assert out["anulados"] == 0
    assert out["sub_judice"] == 0
    assert out["psa"] == 75.0


def test_extract_zone_participacao_reads_anulados_and_sub_judice_when_present() -> None:
    """RF/regulatório: art. 265 §2º da Res. TSE 23.751/2026 exige exibir
    válidos, sub judice e anulados. Nenhuma fixture disponível tem esses
    campos != 0 — payload literal construído para provar que `v.van`/
    `v.vansj` são lidos quando presentes."""
    from api.model.project import _extract_zone_participacao

    payload = {
        "carg": [],
        "e": {"te": "1000", "esi": "1000", "c": "800", "a": "200"},
        "v": {
            "tv": "800",
            "vvc": "790",
            "vv": "770",
            "vnom": "770",
            "van": "15",
            "vansj": "5",
            "vb": "5",
            "tvn": "5",
            "vn": "5",
            "vnt": "0",
        },
        "s": {"ts": "1", "st": "1", "pst": "100,00", "sa": "1", "psa": "50,00"},
    }
    out = _extract_zone_participacao(payload)
    assert out is not None
    assert out["validos"] == 770
    assert out["anulados"] == 15
    assert out["sub_judice"] == 5
    assert out["psa"] == 50.0


def test_extract_zone_participacao_none_when_no_eleitores_aptos() -> None:
    from api.model.project import _extract_zone_participacao

    assert _extract_zone_participacao({}) is None
    assert _extract_zone_participacao(None) is None
    # `e` ausente.
    assert _extract_zone_participacao({"cand": []}) is None
    # e.te == "0" (zona sem eleitorado — degenerado).
    assert _extract_zone_participacao({"e": {"te": "0"}}) is None
    # e.te ausente do objeto `e`.
    assert _extract_zone_participacao({"e": {"c": "10"}}) is None
    # e.te inválido.
    assert _extract_zone_participacao({"e": {"te": "abc"}}) is None


def test_extract_zone_participacao_missing_optional_fields_degrade_to_zero() -> None:
    """Campos além de `e.te` ausentes/inválidos degradam para 0, não
    invalidam a zona inteira — esperado antes da 1ª totalização parcial
    (`e.esi`/`e.c`/`e.a` só existem "após a totalização da seção
    eleitoral", por definição do dicionário oficial do EA20)."""
    from api.model.project import _extract_zone_participacao

    minimal = {"e": {"te": "500"}}
    out = _extract_zone_participacao(minimal)
    assert out is not None
    assert out["eleitores_aptos"] == 500
    assert out["eleitores_instalados"] == 0
    assert out["comparecimento"] == 0
    assert out["abstencao"] == 0
    assert out["brancos"] == 0
    assert out["nulos"] == 0
    assert out["validos"] == 0
    assert out["anulados"] == 0
    assert out["sub_judice"] == 0
    assert out["psa"] == 0.0


def test_extract_zone_participacao_flat_payload_returns_none() -> None:
    """Payload achatado legado (replay 2022) nunca teve `e`/`v`/`s` — não
    há dado de participação a extrair, `None` é o contrato correto (o
    replay nunca chamou este helper)."""
    from api.model.project import _extract_zone_participacao

    flat = {"cand": [{"n": "13", "pvap": "63,46"}]}
    assert _extract_zone_participacao(flat) is None


# ---------------------------------------------------------------------------
# fetch_municipio_aggregates — envelope real via FakeCursor
# ---------------------------------------------------------------------------


class _FakeCursorMunicipio:
    """Cursor mínimo que devolve 1 linha com o envelope REAL (6 colunas,
    incluindo `cod_municipio_tse` do JOIN com `zonas`)."""

    def __init__(self, rows: list[tuple]) -> None:
        self._rows = rows

    def execute(self, sql: str, params: tuple) -> None:  # noqa: ARG002
        return None

    def fetchall(self) -> list[tuple]:
        return self._rows

    def __enter__(self) -> "_FakeCursorMunicipio":
        return self

    def __exit__(self, *a: Any) -> None:
        return None


class _FakeConnMunicipio:
    def __init__(self, rows: list[tuple]) -> None:
        self._rows = rows

    def cursor(self) -> _FakeCursorMunicipio:
        return _FakeCursorMunicipio(self._rows)


def test_fetch_municipio_aggregates_sums_vap_from_real_envelope() -> None:
    """`fetch_municipio_aggregates` deve somar `vap` (votos absolutos)
    corretamente contra o payload EA20 real (`carg[].agr[].par[].cand[]`),
    não achatado."""
    from api.model.project import fetch_municipio_aggregates

    envelope = _load_sp_z0001_2022()
    # (uf, cod_zona, pct_apurado, votos_total, payload, cod_municipio_tse)
    rows = [("SP", 1, 100.0, 260, envelope, 71072)]
    conn = _FakeConnMunicipio(rows)

    out = fetch_municipio_aggregates(conn, cargo=1, turno=1)

    key = ("SP", 71072)
    assert key in out
    # vap: 13 → 165, 22 → 95 (da fixture).
    assert out[key]["votos_por_candidato"] == {13: 165, 22: 95}
    assert out[key]["total_votos"] == 260
    assert out[key]["pct_apurado"] == 100.0
