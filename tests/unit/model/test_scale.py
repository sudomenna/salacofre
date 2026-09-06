"""S07 fix — BUG 2 (escala de `pct_projetado`).

Cobre a fronteira: `compute_uf_projections`/`compute_national` emitem
`rows` em percentual 0–100 (não fração), e os consumidores downstream
(`build_edge_payload`, `build_uf_payloads`) — que já assumiam 0–100 desde
antes do fix (ver `margem > 10.0`, `top_pct < 50.0`, `pct_proj / 100.0` em
`build_uf_payloads`) — agora recebem o valor correto.

Referência: docs/architecture/data-model.md § "Escala de percentuais".
"""

from __future__ import annotations

import numpy as np
import pytest


# ---------------------------------------------------------------------------
# compute_uf_projections / compute_national — saída em 0–100
# ---------------------------------------------------------------------------


def test_compute_uf_projections_emits_pct_in_0_100_scale() -> None:
    """`compute_uf_projections` deve devolver `pct_projetado*` em 0–100,
    NÃO em fração [0,1].

    Reescrito nesta tarefa (plano `tem-um-erro-eu-velvety-sprout.md`):
    `compute_uf_projections` não recebe mais `historical` (2022 saiu da
    projeção de candidatos, decisão E1) e lê `e`/`v`/`s` de raiz +
    `cand[].vap` (contagem absoluta) em vez de `pvap` (percentual)."""
    from api.model.project import compute_uf_projections

    snapshots = [
        {
            "cargo": 1,
            "turno": 1,
            "uf": "SP",
            "cod_zona": 1,
            "pct_apurado": 100.0,
            "payload": {
                "e": {"te": "1000", "esi": "1000", "c": "800", "a": "200"},
                "v": {"vvc": "1000", "vv": "1000", "vb": "0", "tvn": "0"},
                "cand": [{"n": "100", "vap": "450"}, {"n": "200", "vap": "550"}],
            },
        },
    ]
    eleitorado = {("SP", 1): 100_000}

    rows, estimates_by_uf, _estimates_c_by_uf, _cand_by_uf = compute_uf_projections(
        cargo=1, turno=1, seed_base=42,
        snapshots=snapshots, eleitorado=eleitorado,
    )

    assert len(rows) == 2
    by_cand = {r["candidato_id"]: r for r in rows}
    # Fração seria ~0.45/0.55; escala correta é 45.0/55.0.
    assert by_cand[100]["pct_projetado"] == pytest.approx(45.0, abs=0.5)
    assert by_cand[200]["pct_projetado"] == pytest.approx(55.0, abs=0.5)
    assert by_cand[100]["pct_projetado_lower"] <= by_cand[100]["pct_projetado_upper"]
    # CI também em 0–100 — largura plausível (com 1 zona, bootstrap é
    # degenerado — sempre a mesma zona — então CI pode colapsar a 0).
    width = by_cand[100]["pct_projetado_upper"] - by_cand[100]["pct_projetado_lower"]
    assert 0.0 <= width < 50.0

    # `estimates_by_uf` permanece em FRAÇÃO — é o espaço do bootstrap /
    # `p_vitoria` / `compute_national`. Não deve ter sido convertido.
    assert estimates_by_uf["SP"][100].mean() == pytest.approx(0.45, abs=0.05)


def test_compute_uf_projections_rf017_imputado_nacional_emits_pct_in_0_100() -> None:
    """RF-017, 2o nível hierárquico (plano § A): UF SEM NENHUMA zona
    apurada usa a proporção NACIONAL calculada a partir de OUTRAS UFs com
    dado, +-10pp — não mais `p_2022` (2022 saiu inteiramente da projeção
    de candidatos, decisão E1). Escala da linha ainda deve sair em
    0–100."""
    from api.model.project import compute_uf_projections

    sp_payload = {
        "e": {"te": "1000", "esi": "1000", "c": "800", "a": "200"},
        "v": {"vvc": "1000", "vv": "1000", "vb": "0", "tvn": "0"},
        "cand": [{"n": "300", "vap": "600"}, {"n": "400", "vap": "400"}],
    }
    snapshots = [
        {
            "cargo": 1, "turno": 1, "uf": "SP", "cod_zona": 1,
            "pct_apurado": 100.0, "payload": sp_payload,
        },
        {
            "cargo": 1, "turno": 1, "uf": "RJ", "cod_zona": 1,
            "pct_apurado": 0.0, "payload": {"cand": []},  # sem e/v/s -> zona inutilizável
        },
    ]
    eleitorado = {("SP", 1): 100_000, ("RJ", 1): 50_000}

    rows, _estimates_by_uf, _estimates_c_by_uf, _cand_by_uf = compute_uf_projections(
        cargo=1, turno=1, seed_base=1,
        snapshots=snapshots, eleitorado=eleitorado,
    )

    rj_rows = {r["candidato_id"]: r for r in rows if r["uf"] == "RJ"}
    assert set(rj_rows.keys()) == {300, 400}
    assert rj_rows[300]["metodo"]["tipo"] == "imputado_nacional"
    # SP é a ÚNICA UF com dado -> "nacional" == SP -> 60%/40%. RJ herda
    # esse ponto +-10pp (RF-017), em 0–100 (não fração).
    assert rj_rows[300]["pct_projetado"] == pytest.approx(60.0, abs=0.5)
    assert rj_rows[300]["pct_projetado_lower"] == pytest.approx(50.0, abs=0.5)
    assert rj_rows[300]["pct_projetado_upper"] == pytest.approx(70.0, abs=0.5)
    assert rj_rows[400]["pct_projetado"] == pytest.approx(40.0, abs=0.5)


def test_compute_national_emits_pct_in_0_100_scale() -> None:
    """`compute_national` — mesma fronteira: `rows[*].pct_projetado*` em
    0–100, `national_estimates`/`p_vitoria` permanecem em fração."""
    from api.model.project import compute_national

    rng = np.random.default_rng(7)
    estimates_by_uf = {
        "SP": {
            100: 0.45 + rng.normal(0, 0.001, 1000),
            200: 0.55 + rng.normal(0, 0.001, 1000),
        },
    }
    eleitorado_total = {"SP": 30_000_000}

    rows, p_a, cand_a, cand_b, _outros = compute_national(
        cargo=1, turno=1,
        estimates_by_uf=estimates_by_uf,
        eleitorado_total_by_uf=eleitorado_total,
    )

    by_cand = {r["candidato_id"]: r for r in rows}
    assert by_cand[100]["pct_projetado"] == pytest.approx(45.0, abs=0.5)
    assert by_cand[200]["pct_projetado"] == pytest.approx(55.0, abs=0.5)
    # p_vitoria continua em [0,1] — NÃO é percentual.
    assert 0.0 <= by_cand[cand_a]["p_vitoria"] <= 1.0
    assert cand_a == 200
    assert cand_b == 100
    assert 0.0 <= p_a <= 1.0


# ---------------------------------------------------------------------------
# build_edge_payload — consumidor já assumia 0–100 (vai_a_2t, chamada)
# ---------------------------------------------------------------------------


def test_build_edge_payload_national_candidatos_pct_projetado_in_0_100() -> None:
    from api.model.project import build_edge_payload

    uf_rows = [
        {"cargo": 3, "turno": 1, "uf": "SP", "candidato_id": 100, "pct_projetado": 45.0, "pct_projetado_lower": 40.0, "pct_projetado_upper": 50.0, "pct_apurado": 80.0},
        {"cargo": 3, "turno": 1, "uf": "SP", "candidato_id": 200, "pct_projetado": 55.0, "pct_projetado_lower": 50.0, "pct_projetado_upper": 60.0, "pct_apurado": 80.0},
    ]
    national_rows = [
        {"candidato_id": 100, "pct_projetado": 45.0, "pct_projetado_lower": 40.0, "pct_projetado_upper": 50.0, "p_vitoria": 0.1, "rank": 2},
        {"candidato_id": 200, "pct_projetado": 55.0, "pct_projetado_lower": 50.0, "pct_projetado_upper": 60.0, "p_vitoria": 0.9, "rank": 1},
    ]

    payload = build_edge_payload(
        cargo=3, turno=1, ts_iso="2026-10-04T18:23:15Z",
        uf_rows=uf_rows, national_rows=national_rows,
        eleitorado_total_by_uf={"SP": 30_000_000},
        cand_a_id=200, cand_b_id=100,
    )

    national = payload["national"]
    # Já em 0–100, não fração — candidato líder primeiro.
    assert national["candidatos"][0]["id"] == 200
    assert national["candidatos"][0]["pct_projetado"] == pytest.approx(55.0)
    assert national["candidatos"][1]["pct_projetado"] == pytest.approx(45.0)


def test_build_edge_payload_vai_a_2t_false_when_leader_has_55_pct_governador() -> None:
    """`vai_a_2t` (cargo=3, turno=1) só funciona corretamente com
    `top_pct` em 0–100 (`top_pct < 50.0`). Antes do fix (fração), o líder
    com 0.55 sempre satisfazia `0.55 < 50.0` → `vai_a_2t` sempre `True`
    (bug). Com 55.0, `55.0 < 50.0` é `False` — decidido no 1T."""
    from api.model.project import build_edge_payload

    uf_rows = [
        {"cargo": 3, "turno": 1, "uf": "SP", "candidato_id": 100, "pct_projetado": 55.0, "pct_projetado_lower": 50.0, "pct_projetado_upper": 60.0, "pct_apurado": 100.0},
        {"cargo": 3, "turno": 1, "uf": "SP", "candidato_id": 200, "pct_projetado": 45.0, "pct_projetado_lower": 40.0, "pct_projetado_upper": 50.0, "pct_apurado": 100.0},
    ]
    national_rows = [
        {"candidato_id": 100, "pct_projetado": 55.0, "pct_projetado_lower": 50.0, "pct_projetado_upper": 60.0, "p_vitoria": 0.9, "rank": 1},
        {"candidato_id": 200, "pct_projetado": 45.0, "pct_projetado_lower": 40.0, "pct_projetado_upper": 50.0, "p_vitoria": 0.1, "rank": 2},
    ]

    payload = build_edge_payload(
        cargo=3, turno=1, ts_iso="2026-10-04T18:23:15Z",
        uf_rows=uf_rows, national_rows=national_rows,
        eleitorado_total_by_uf={"SP": 30_000_000},
        cand_a_id=100, cand_b_id=200,
    )

    sp_row = next(r for r in payload["por_uf"] if r["sigla"] == "SP")
    assert sp_row["vai_a_2t"] is False
    assert sp_row["bucket"] == "decidido_1t"
    # margem = 55 - 45 = 10pp → NÃO dispara "chamada" (regra é > 10, não >=).
    assert sp_row["margem_atual"] == pytest.approx(10.0)
    assert sp_row["chamada"] is False


def test_build_edge_payload_vai_a_2t_true_when_leader_below_50_governador() -> None:
    """Líder com 40% (< 50%) em governador 1T → `vai_a_2t = True`."""
    from api.model.project import build_edge_payload

    uf_rows = [
        {"cargo": 3, "turno": 1, "uf": "SP", "candidato_id": 100, "pct_projetado": 40.0, "pct_projetado_lower": 35.0, "pct_projetado_upper": 45.0, "pct_apurado": 100.0},
        {"cargo": 3, "turno": 1, "uf": "SP", "candidato_id": 200, "pct_projetado": 35.0, "pct_projetado_lower": 30.0, "pct_projetado_upper": 40.0, "pct_apurado": 100.0},
    ]
    national_rows = [
        {"candidato_id": 100, "pct_projetado": 40.0, "pct_projetado_lower": 35.0, "pct_projetado_upper": 45.0, "p_vitoria": 0.6, "rank": 1},
        {"candidato_id": 200, "pct_projetado": 35.0, "pct_projetado_lower": 30.0, "pct_projetado_upper": 40.0, "p_vitoria": 0.4, "rank": 2},
    ]

    payload = build_edge_payload(
        cargo=3, turno=1, ts_iso="2026-10-04T18:23:15Z",
        uf_rows=uf_rows, national_rows=national_rows,
        eleitorado_total_by_uf={"SP": 30_000_000},
        cand_a_id=100, cand_b_id=200,
    )

    sp_row = next(r for r in payload["por_uf"] if r["sigla"] == "SP")
    assert sp_row["vai_a_2t"] is True
    assert sp_row["bucket"] == "vai_2t"


def test_build_edge_payload_chamada_when_margem_above_10pp() -> None:
    """`chamada = margem > 10.0` só faz sentido com margem em pp (0–100)."""
    from api.model.project import build_edge_payload

    uf_rows = [
        {"cargo": 1, "turno": 1, "uf": "SP", "candidato_id": 100, "pct_projetado": 62.0, "pct_projetado_lower": 58.0, "pct_projetado_upper": 66.0, "pct_apurado": 100.0},
        {"cargo": 1, "turno": 1, "uf": "SP", "candidato_id": 200, "pct_projetado": 38.0, "pct_projetado_lower": 34.0, "pct_projetado_upper": 42.0, "pct_apurado": 100.0},
    ]
    national_rows = [
        {"candidato_id": 100, "pct_projetado": 62.0, "pct_projetado_lower": 58.0, "pct_projetado_upper": 66.0, "p_vitoria": 0.99, "rank": 1},
        {"candidato_id": 200, "pct_projetado": 38.0, "pct_projetado_lower": 34.0, "pct_projetado_upper": 42.0, "p_vitoria": 0.01, "rank": 2},
    ]

    payload = build_edge_payload(
        cargo=1, turno=1, ts_iso="2026-10-04T18:23:15Z",
        uf_rows=uf_rows, national_rows=national_rows,
        eleitorado_total_by_uf={"SP": 30_000_000},
        cand_a_id=100, cand_b_id=200,
    )

    sp_row = next(r for r in payload["por_uf"] if r["sigla"] == "SP")
    assert sp_row["margem_atual"] == pytest.approx(24.0)
    assert sp_row["chamada"] is True
    assert sp_row["bucket"] == "chamada"


# ---------------------------------------------------------------------------
# build_uf_payloads — votos_projetados coerente com pct em 0–100
# ---------------------------------------------------------------------------


def test_build_uf_payloads_votos_projetados_uses_pct_over_100() -> None:
    """`votos_projetados`/`votos_atuais`/`pct_atual` em `EdgeCandidate`
    vêm DIRETO do `row` (plano `tem-um-erro-eu-velvety-sprout.md` § B —
    resultado real de `compute_uf_projections`/`extrapolation.
    estimate_uf_candidatos`, regra de três), não mais de um rateio de
    `municipio_aggregates` por `pct_projetado/pct_apurado`. `build_uf_
    payloads` deve repassar os valores do `row` sem reprocessar."""
    from api.model.project import build_uf_payloads

    uf_rows = [
        {
            "cargo": 1, "turno": 1, "uf": "SP", "candidato_id": 100,
            "pct_projetado": 55.0, "pct_projetado_lower": 53.0, "pct_projetado_upper": 57.0,
            "pct_apurado": 100.0, "pct_atual": 55.0,
            "votos_atuais": 550_000, "votos_projetados": 550_000,
        },
        {
            "cargo": 1, "turno": 1, "uf": "SP", "candidato_id": 200,
            "pct_projetado": 45.0, "pct_projetado_lower": 43.0, "pct_projetado_upper": 47.0,
            "pct_apurado": 100.0, "pct_atual": 45.0,
            "votos_atuais": 450_000, "votos_projetados": 450_000,
        },
    ]
    national_rows = [
        {"candidato_id": 100, "partido": "PT", "pct_projetado": 55.0},
        {"candidato_id": 200, "partido": "PL", "pct_projetado": 45.0},
    ]

    out = build_uf_payloads(
        cargo=1, turno=1, ts_iso="2026-10-04T18:23:15Z",
        uf_rows=uf_rows, national_rows=national_rows,
        municipio_aggregates={},
        zona_municipio={},
        series_by_uf={},
    )

    candidatos = {c["id"]: c for c in out["SP"]["candidatos"]}
    assert candidatos[100]["votos_projetados"] == pytest.approx(550_000, abs=1)
    assert candidatos[200]["votos_projetados"] == pytest.approx(450_000, abs=1)
    assert candidatos[100]["votos_atuais"] == pytest.approx(550_000, abs=1)
    assert candidatos[100]["pct_atual"] == pytest.approx(55.0, abs=1e-6)
    # NÃO deve ser ~5_500 (dupla divisão por 100 caso pct estivesse em fração).
    assert candidatos[100]["votos_projetados"] > 100_000
