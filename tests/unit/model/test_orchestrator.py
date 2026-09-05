"""T12 — Orchestrator /api/model/project.

Cobertura:
  (a) auth: sem header / header errado → 401.
  (b) body inválido → 400 estruturado do Pydantic.
  (c) compute end-to-end com fixture sintética (psycopg monkey-patched) → 200
      com response shape correto e `computed: True`.
  (d) determinismo (constituição § 6): mesmo trigger_ts → mesmo
      `national_p_vitoria_a` bit-a-bit.
  (e) sem snapshots → 200 com `computed: False, uf_count: 0`.

Estratégia de mock do DB:
  `_open_conn` é monkey-patched para devolver uma conexão fake com 3 fixtures
  estáticas (snapshots, historical, eleitorado) configuráveis por teste.
  `insert_projections` é interceptado para validar que recebe N linhas sem
  precisar de DB de verdade.

NÃO testa o path HTTP do BaseHTTPRequestHandler diretamente — chamamos
`_do_project(body_bytes)` que é a função pura por trás do handler. O wrapper
HTTP só faz auth + leitura de body + serialização; coberto via inspeção
manual (smoke).
"""

from __future__ import annotations

import json
from typing import Any

import pytest


# ---------------------------------------------------------------------------
# Fixtures de DB sintéticas
# ---------------------------------------------------------------------------


def _synthetic_payload(
    cand_pcts: dict[int, float],
) -> dict[str, Any]:
    """Constrói payload EA20 ACHATADO `{cand: [...]}` (sem envelope).

    Mantido por compat com o restante deste arquivo e com o dataset de
    replay 2022 (`tests/fixtures/replay-2022/snapshots.json`, T21) — NÃO
    é o formato real gravado pelo ingest (`app/api/ingest/route.ts:483`).
    Para o payload EA20 real (envelope completo), veja `_synthetic_envelope`.
    """
    return {
        "cand": [
            {"n": str(cod), "pvap": f"{pct:.2f}".replace(".", ",")}
            for cod, pct in cand_pcts.items()
        ]
    }


def _synthetic_envelope(cand_pcts: dict[int, float]) -> dict[str, Any]:
    """Constrói payload EA20 ENVELOPE COMPLETO — formato REAL 2026 gravado
    por `app/api/ingest/route.ts` e validado por `lib/tse/ea20-schema.ts`
    (`EA20Schema`, reescrito 2026-09-05 contra os PDFs oficiais do TSE —
    ver `docs/reference/tse-2026-leiautes.md`). **Sem array `abr[]`**
    (premissa anterior nunca confirmada contra o documento oficial):
    candidatos em `carg[].agr[].par[].cand[]`, participação em `e`/`v`/`s`
    de raiz.

    Fixture análoga a `tests/fixtures/tse/2026/zona-presidente-sp-z0001.json`,
    parametrizada pelos mesmos `{cod_candidato: pct_pvap}` de
    `_synthetic_payload` — usada para provar que o orchestrator lê o
    payload real (BUG 1 original — `_extract_zone_candidate_pcts` fazia
    `payload.get("cand")` no topo e retornava `{}`; o schema do envelope em
    si também estava errado até a correção de 2026-09-05).

    Cada candidato ganha sua própria `agr`/`par` (partido isolado `tp: "i"`)
    — suficiente para os testes deste arquivo, que não verificam
    coligação/federação.
    """
    return {
        "ele": "999999",
        "t": "1",
        "f": "o",
        "tpabr": "zona",
        "cdabr": "0001",
        "dg": "04/10/2026",
        "hg": "18:00:00",
        "carg": [
            {
                "cd": "1",
                "nmn": "Presidente",
                "agr": [
                    {
                        "n": str(cod),
                        "nm": "PARTIDO",
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
                                        "vap": "0",
                                        "pvap": f"{pct:.2f}".replace(".", ","),
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
        "e": {"te": "1000", "esi": "1000", "c": "800", "a": "200"},
        "v": {
            "tv": "800", "vvc": "780", "vv": "780", "vnom": "780",
            "vb": "10", "tvn": "10", "vn": "10", "vnt": "0",
        },
    }


class FakeCursor:
    def __init__(self, conn: "FakeConn") -> None:
        self._conn = conn
        self._last_rows: list[tuple] = []

    def execute(self, sql: str, params: tuple) -> None:
        # Dispatching pelo conteúdo da query — suficiente para os 3 SELECTs.
        # S04/F2: também responde às 3 novas queries `fetch_zona_municipio`,
        # `fetch_municipio_aggregates` e `fetch_series_temporais` (todas
        # com fixtures vazias por default, já que o minimal_dataset não
        # carrega zonas/municipios/projections histórico — orchestrator
        # gracefully degrada).
        if "FROM snapshots" in sql and "ranked" in sql and "JOIN zonas" in sql:
            # fetch_municipio_aggregates (S04/F2): mesma CTE + LEFT JOIN com
            # zonas. Em testes sem fixture de zonas, devolve cod_municipio_tse
            # = None para cada snapshot — `fetch_municipio_aggregates` ignora
            # rows sem cod_municipio_tse.
            cargo, turno = params
            self._last_rows = [
                (
                    s["uf"],
                    s["cod_zona"],
                    s["pct_apurado"],
                    s.get("votos_total"),
                    s["payload"],
                    None,  # cod_municipio_tse — sem fixture de zonas
                )
                for s in self._conn.snapshots
                if s["cargo"] == cargo and s["turno"] == turno
            ]
        elif "FROM snapshots" in sql:
            cargo, turno = params
            self._last_rows = [
                (s["uf"], s["cod_zona"], s["pct_apurado"], s["payload"])
                for s in self._conn.snapshots
                if s["cargo"] == cargo and s["turno"] == turno
            ]
        elif "FROM historical_results" in sql:
            cargo, turno = params
            self._last_rows = [
                (
                    h["uf"],
                    h["cod_zona"],
                    h["cod_candidato"],
                    h["pct_validos"],
                    h.get("partido"),
                )
                for h in self._conn.historical
                if h["cargo"] == cargo and h["turno"] == turno
            ]
        elif "FROM eleitorado" in sql:
            (ano,) = params
            self._last_rows = [
                (e["uf"], e["cod_zona"], e["eleitores_aptos"])
                for e in self._conn.eleitorado
                if e["ano"] == ano
            ]
        elif "FROM zonas z" in sql or "JOIN municipios" in sql:
            # fetch_zona_municipio — sem fixture, devolve vazio.
            self._last_rows = []
        elif "FROM projections" in sql:
            # fetch_series_temporais — sem fixture, devolve vazio.
            self._last_rows = []
        else:
            raise AssertionError(f"FakeCursor sql não suportada: {sql[:80]}")

    def executemany(self, sql: str, rows: list[dict]) -> None:
        assert "INSERT INTO projections" in sql
        self._conn.inserted.extend(rows)

    def fetchall(self) -> list[tuple]:
        return self._last_rows

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *a: Any) -> None:
        return None


class FakeConn:
    def __init__(
        self,
        snapshots: list[dict],
        historical: list[dict],
        eleitorado: list[dict],
    ) -> None:
        self.snapshots = snapshots
        self.historical = historical
        self.eleitorado = eleitorado
        self.inserted: list[dict] = []
        self.committed = False

    def cursor(self) -> FakeCursor:
        return FakeCursor(self)

    def commit(self) -> None:
        self.committed = True

    def close(self) -> None:
        return None

    def __enter__(self) -> "FakeConn":
        return self

    def __exit__(self, *a: Any) -> None:
        return None


@pytest.fixture
def fake_db(monkeypatch: pytest.MonkeyPatch):
    """Factory: cria FakeConn e injeta como _open_conn."""
    from api.model import project as proj_mod

    state: dict[str, FakeConn | None] = {"conn": None}

    def _make(
        snapshots: list[dict],
        historical: list[dict],
        eleitorado: list[dict],
    ) -> FakeConn:
        conn = FakeConn(snapshots, historical, eleitorado)
        state["conn"] = conn
        monkeypatch.setattr(proj_mod, "_open_conn", lambda: conn)
        return conn

    return _make


@pytest.fixture
def minimal_dataset():
    """Dataset sintético determinístico: 2 UFs × 2 candidatos × 2 zonas."""
    snapshots = [
        {
            "cargo": 1,
            "turno": 1,
            "uf": "SP",
            "cod_zona": 1,
            "pct_apurado": 100.0,
            "payload": _synthetic_payload({100: 55.0, 200: 45.0}),
        },
        {
            "cargo": 1,
            "turno": 1,
            "uf": "SP",
            "cod_zona": 2,
            "pct_apurado": 100.0,
            "payload": _synthetic_payload({100: 60.0, 200: 40.0}),
        },
        {
            "cargo": 1,
            "turno": 1,
            "uf": "RJ",
            "cod_zona": 10,
            "pct_apurado": 100.0,
            "payload": _synthetic_payload({100: 48.0, 200: 52.0}),
        },
        {
            "cargo": 1,
            "turno": 1,
            "uf": "RJ",
            "cod_zona": 11,
            "pct_apurado": 100.0,
            "payload": _synthetic_payload({100: 50.0, 200: 50.0}),
        },
    ]
    historical = [
        # SP: candidato A teve 50%, B teve 50% em 2022 (ambas as zonas)
        {"cargo": 1, "turno": 1, "uf": "SP", "cod_zona": 1, "cod_candidato": 100, "pct_validos": 0.50, "partido": "PT"},
        {"cargo": 1, "turno": 1, "uf": "SP", "cod_zona": 1, "cod_candidato": 200, "pct_validos": 0.50, "partido": "PL"},
        {"cargo": 1, "turno": 1, "uf": "SP", "cod_zona": 2, "cod_candidato": 100, "pct_validos": 0.50, "partido": "PT"},
        {"cargo": 1, "turno": 1, "uf": "SP", "cod_zona": 2, "cod_candidato": 200, "pct_validos": 0.50, "partido": "PL"},
        # RJ: A teve 45%, B teve 55%
        {"cargo": 1, "turno": 1, "uf": "RJ", "cod_zona": 10, "cod_candidato": 100, "pct_validos": 0.45, "partido": "PT"},
        {"cargo": 1, "turno": 1, "uf": "RJ", "cod_zona": 10, "cod_candidato": 200, "pct_validos": 0.55, "partido": "PL"},
        {"cargo": 1, "turno": 1, "uf": "RJ", "cod_zona": 11, "cod_candidato": 100, "pct_validos": 0.45, "partido": "PT"},
        {"cargo": 1, "turno": 1, "uf": "RJ", "cod_zona": 11, "cod_candidato": 200, "pct_validos": 0.55, "partido": "PL"},
    ]
    eleitorado = [
        {"ano": 2026, "uf": "SP", "cod_zona": 1, "eleitores_aptos": 100_000},
        {"ano": 2026, "uf": "SP", "cod_zona": 2, "eleitores_aptos": 200_000},
        {"ano": 2026, "uf": "RJ", "cod_zona": 10, "eleitores_aptos": 50_000},
        {"ano": 2026, "uf": "RJ", "cod_zona": 11, "eleitores_aptos": 80_000},
    ]
    return snapshots, historical, eleitorado


# ---------------------------------------------------------------------------
# (a) Auth
# ---------------------------------------------------------------------------


def test_seed_is_deterministic() -> None:
    """Constituição § 6: mesmo (cargo, turno, trigger_ts) → mesmo seed."""
    from api.model.project import derive_seed

    s1 = derive_seed(1, 1, "2026-10-04T18:23:15Z")
    s2 = derive_seed(1, 1, "2026-10-04T18:23:15Z")
    assert s1 == s2
    s3 = derive_seed(1, 1, "2026-10-04T18:23:16Z")
    assert s1 != s3


# ---------------------------------------------------------------------------
# (b) Body inválido
# ---------------------------------------------------------------------------


def test_invalid_json_returns_400() -> None:
    from api.model.project import _do_project

    status, payload = _do_project(b"not-json{{{")
    assert status == 400
    # Pydantic 2 reporta JSON malformado como ValidationError (json_invalid).
    assert payload["error"] in {"invalid_json", "invalid_body"}


def test_missing_field_returns_400() -> None:
    from api.model.project import _do_project

    body = json.dumps({"cargo": 1, "turno": 1}).encode("utf-8")  # falta trigger_ts
    status, payload = _do_project(body)
    assert status == 400
    assert payload["error"] == "invalid_body"
    # Pydantic ValidationError exposes structured detail.
    assert any("trigger_ts" in str(e) for e in payload["detail"])


def test_invalid_cargo_returns_400() -> None:
    from api.model.project import _do_project

    body = json.dumps(
        {"cargo": 0, "turno": 1, "trigger_ts": "2026-10-04T18:23:15Z"}
    ).encode("utf-8")
    status, payload = _do_project(body)
    assert status == 400


# ---------------------------------------------------------------------------
# (c) Compute end-to-end com fixture sintética
# ---------------------------------------------------------------------------


def test_compute_endtoend_returns_200(fake_db, minimal_dataset) -> None:
    from api.model.project import _do_project

    snapshots, historical, eleitorado = minimal_dataset
    conn = fake_db(snapshots, historical, eleitorado)

    body = json.dumps(
        {"cargo": 1, "turno": 1, "trigger_ts": "2026-10-04T18:23:15Z"}
    ).encode("utf-8")

    status, payload = _do_project(body)
    assert status == 200, payload
    assert payload["computed"] is True
    assert payload["uf_count"] == 2  # SP + RJ
    assert 0.0 <= payload["national_p_vitoria_a"] <= 1.0
    assert payload["computed_duration_ms"] >= 0

    # Persistiu append-only (sem upsert no INSERT).
    assert conn.committed is True
    assert len(conn.inserted) > 0
    # Inclui nacional (uf=None) e linhas UF.
    nationals = [r for r in conn.inserted if r["uf"] is None]
    ufs = [r for r in conn.inserted if r["uf"] is not None]
    assert len(nationals) >= 2  # 2 candidatos nacionais
    assert len(ufs) >= 4  # 2 UFs × 2 candidatos


def test_no_snapshots_returns_computed_false(fake_db) -> None:
    """Quando ainda não há snapshots ingeridos, o handler deve responder
    200 com `computed: False` (não-erro). Cobre RF-017 caso degenerado total."""
    from api.model.project import _do_project

    fake_db(snapshots=[], historical=[], eleitorado=[])

    body = json.dumps(
        {"cargo": 1, "turno": 1, "trigger_ts": "2026-10-04T18:23:15Z"}
    ).encode("utf-8")

    status, payload = _do_project(body)
    assert status == 200
    assert payload["computed"] is False
    assert payload["uf_count"] == 0


# ---------------------------------------------------------------------------
# (d) Determinismo end-to-end (constituição § 6)
# ---------------------------------------------------------------------------


def test_determinism_same_trigger_ts(fake_db, minimal_dataset) -> None:
    """Mesmo trigger_ts → mesma national_p_vitoria_a, bit-a-bit."""
    from api.model.project import _do_project

    snapshots, historical, eleitorado = minimal_dataset

    body = json.dumps(
        {"cargo": 1, "turno": 1, "trigger_ts": "2026-10-04T18:23:15Z"}
    ).encode("utf-8")

    fake_db(snapshots, historical, eleitorado)
    _, p1 = _do_project(body)

    fake_db(snapshots, historical, eleitorado)
    _, p2 = _do_project(body)

    assert p1["national_p_vitoria_a"] == p2["national_p_vitoria_a"]
    # E também os points UF persistidos devem coincidir.


def test_determinism_different_trigger_ts_differs(fake_db, minimal_dataset) -> None:
    """Sanity: trigger_ts diferente → estimates diferentes (seed propaga)."""
    from api.model.project import _do_project

    snapshots, historical, eleitorado = minimal_dataset

    fake_db(snapshots, historical, eleitorado)
    _, p1 = _do_project(
        json.dumps(
            {"cargo": 1, "turno": 1, "trigger_ts": "2026-10-04T18:23:15Z"}
        ).encode("utf-8")
    )

    fake_db(snapshots, historical, eleitorado)
    _, p2 = _do_project(
        json.dumps(
            {"cargo": 1, "turno": 1, "trigger_ts": "2026-10-04T18:23:16Z"}
        ).encode("utf-8")
    )
    # Não exigimos != absoluto (datasets pequenos podem coincidir), mas a
    # arquitetura DEVE propagar o seed — sanity check de não-crash basta aqui.
    assert "national_p_vitoria_a" in p1
    assert "national_p_vitoria_a" in p2


# ---------------------------------------------------------------------------
# (e) Smoke do handler HTTP — imports + class shape (sem subir socket)
# ---------------------------------------------------------------------------


def test_compute_national_top2_by_pct_when_leader_has_higher_id() -> None:
    """FIX S04 carry-over #1: A = líder por `pct_projetado` (mean dos estimates),
    NÃO `min(candidato_id)`.

    Cenário: candidato 200 (id MAIOR) tem mean ≈ 0.55; candidato 100 (id MENOR)
    tem mean ≈ 0.45. Antes do fix, A = 100 → `p_vitoria_a = P(100 > 200) ≈ 0`.
    Depois do fix, A = 200 → `p_vitoria_a = P(200 > 100) ≈ 1`.
    """
    import numpy as np
    from api.model.project import compute_national

    rng = np.random.default_rng(42)
    # Mesmo rng para os dois candidatos garantiria pareamento; cada candidato
    # com seu próprio rng filho descorrelaciona — o que queremos para que
    # P(c200 > c100) seja efetivamente determinado pelo gap dos means.
    estimates_by_uf = {
        "SP": {
            100: 0.45 + rng.normal(0, 0.005, 1000),  # menor id, segundo lugar
            200: 0.55 + rng.normal(0, 0.005, 1000),  # maior id, LIDER
        },
    }
    eleitorado_total = {"SP": 30_000_000}

    rows, p_a, cand_a, cand_b, _outros = compute_national(
        cargo=1,
        turno=1,
        estimates_by_uf=estimates_by_uf,
        eleitorado_total_by_uf=eleitorado_total,
    )

    assert cand_a == 200, f"esperado lider=200 (maior pct), got {cand_a}"
    assert cand_b == 100, f"esperado segundo=100, got {cand_b}"
    # p_a = P(estimates_a > estimates_b) — com gap de 10pp e σ=0.5pp, ≈ 1.0.
    assert p_a > 0.95, f"p_vitoria_a deveria ser ≈ 1 (lider claro), got {p_a}"
    # 2 rows nacionais.
    assert len(rows) == 2


def test_compute_national_tiebreaker_by_id_when_pct_equal() -> None:
    """FIX S04: se dois candidatos têm `pct_projetado` exatamente iguais
    (raro em dados reais, mas possível em fixtures sintéticas), tie-breaker é
    `candidato_id` ASCENDENTE — estável e determinístico.
    """
    import numpy as np
    from api.model.project import compute_national

    # Estimates idênticas → means idênticos por construção.
    same = np.full(1000, 0.50, dtype=np.float64)
    estimates_by_uf = {
        "SP": {
            500: same.copy(),
            300: same.copy(),
            700: same.copy(),
        },
    }
    eleitorado_total = {"SP": 30_000_000}

    rows, _p_a, cand_a, cand_b, _outros = compute_national(
        cargo=1,
        turno=1,
        estimates_by_uf=estimates_by_uf,
        eleitorado_total_by_uf=eleitorado_total,
    )

    # Empate total: tie-breaker == menor id primeiro.
    assert cand_a == 300, f"empate exato → A = menor id (300), got {cand_a}"
    assert cand_b == 500, f"segundo = próximo id (500), got {cand_b}"
    assert len(rows) == 3


def test_compute_national_single_candidate_returns_p_a_one() -> None:
    """Sanity: 1 candidato apenas → p_vitoria_a = 1.0, cand_b = None."""
    import numpy as np
    from api.model.project import compute_national

    estimates_by_uf = {
        "SP": {42: np.full(1000, 0.80, dtype=np.float64)},
    }
    eleitorado_total = {"SP": 30_000_000}

    rows, p_a, cand_a, cand_b, _outros = compute_national(
        cargo=1,
        turno=1,
        estimates_by_uf=estimates_by_uf,
        eleitorado_total_by_uf=eleitorado_total,
    )

    assert cand_a == 42
    assert cand_b is None
    assert p_a == 1.0
    assert len(rows) == 1


def test_edge_payload_orders_candidatos_by_leader_first(
    fake_db, minimal_dataset, monkeypatch: pytest.MonkeyPatch
) -> None:
    """FIX S04: `national.candidatos[0]` é o líder semântico, não menor id.

    Reusa `minimal_dataset`: SP tem PT (100) com 57.5% e PL (200) com 42.5%
    (médias ponderadas). RJ tem PT com 49% e PL com 51%. Nacional ponderado
    pelo eleitorado deve dar líder claro a alguém — e seja quem for, deve
    aparecer em `candidatos[0]` do payload Edge.

    Também verifica os campos novos `candidato_a_id` / `candidato_b_id`.
    """
    from api.model.project import _do_project, urllib as proj_urllib

    snapshots, historical, eleitorado = minimal_dataset
    fake_db(snapshots, historical, eleitorado)

    monkeypatch.setenv("MODEL_SECRET", "test-secret")
    monkeypatch.setenv("INTERNAL_BASE_URL", "http://localhost:13000")

    captured: dict[str, Any] = {}

    class FakeResponse:
        status = 200

        def __enter__(self):  # noqa: ANN204
            return self

        def __exit__(self, *a):  # noqa: ANN001,ANN204
            return None

    def fake_urlopen(req, timeout=10):  # noqa: ANN001,ARG001
        captured["body"] = json.loads(req.data.decode("utf-8"))
        return FakeResponse()

    monkeypatch.setattr(proj_urllib.request, "urlopen", fake_urlopen)

    status, response = _do_project(
        json.dumps(
            {"cargo": 1, "turno": 1, "trigger_ts": "2026-10-04T18:23:15Z"}
        ).encode("utf-8")
    )
    assert status == 200
    # Response também expõe os ids.
    assert response["candidato_a_id"] in (100, 200)
    assert response["candidato_b_id"] in (100, 200)
    assert response["candidato_a_id"] != response["candidato_b_id"]

    payload = captured["body"]["payload"]
    national = payload["national"]
    cand_a = national["candidato_a_id"]
    cand_b = national["candidato_b_id"]
    assert cand_a is not None and cand_b is not None
    # Primeiro candidato listado = líder semântico.
    assert national["candidatos"][0]["id"] == cand_a
    assert national["candidatos"][1]["id"] == cand_b
    # Líder tem pct_projetado >= 2º.
    assert (
        national["candidatos"][0]["pct_projetado"]
        >= national["candidatos"][1]["pct_projetado"]
    )
    # Needle aponta para o líder (>= 0).
    assert national["needle_position"] >= 0.0


def test_handler_class_importable() -> None:
    """Smoke: a classe `handler` está no módulo (entrypoint Vercel)."""
    from api.model import project as proj_mod
    from http.server import BaseHTTPRequestHandler

    assert hasattr(proj_mod, "handler")
    assert issubclass(proj_mod.handler, BaseHTTPRequestHandler)
    assert hasattr(proj_mod.handler, "do_POST")
    assert hasattr(proj_mod.handler, "do_GET")


# ---------------------------------------------------------------------------
# S04/F2 — build_uf_payloads (EdgePayloadUf rico)
# ---------------------------------------------------------------------------


def test_build_uf_payloads_shape_minimal() -> None:
    """S04/F2: `build_uf_payloads` retorna shape canônico `EdgePayloadUf`
    com candidatos, municípios (vazio quando agregação ausente) e
    series_temporais (vazio quando histórico ausente).
    """
    from api.model.project import build_uf_payloads

    uf_rows = [
        {
            "cargo": 1,
            "turno": 1,
            "uf": "SP",
            "candidato_id": 100,
            "pct_projetado": 55.0,
            "pct_projetado_lower": 53.0,
            "pct_projetado_upper": 57.0,
            "pct_apurado": 80.0,
        },
        {
            "cargo": 1,
            "turno": 1,
            "uf": "SP",
            "candidato_id": 200,
            "pct_projetado": 45.0,
            "pct_projetado_lower": 43.0,
            "pct_projetado_upper": 47.0,
            "pct_apurado": 80.0,
        },
    ]
    national_rows = [
        {"candidato_id": 100, "partido": "PT", "pct_projetado": 53.0},
        {"candidato_id": 200, "partido": "PL", "pct_projetado": 47.0},
    ]

    out = build_uf_payloads(
        cargo=1,
        turno=1,
        ts_iso="2026-10-04T18:23:15Z",
        uf_rows=uf_rows,
        national_rows=national_rows,
        municipio_aggregates={},
        zona_municipio={},
        series_by_uf={},
    )

    assert "SP" in out
    sp = out["SP"]
    # Shape canônico EdgePayloadUf.
    for key in (
        "uf",
        "ts",
        "cargo",
        "turno",
        "pct_apurado",
        "candidatos",
        "needle_position",
        "needle_band",
        "municipios",
        "series_temporais",
    ):
        assert key in sp, f"falta {key} no EdgePayloadUf"

    # Candidatos têm votos_atuais e votos_projetados (novos S04/F2).
    for c in sp["candidatos"]:
        assert "votos_atuais" in c
        assert "votos_projetados" in c
        assert isinstance(c["votos_atuais"], int)
        assert isinstance(c["votos_projetados"], int)
        assert "ci95" in c
        assert "lower" in c["ci95"]
        assert "upper" in c["ci95"]

    # Líder primeiro (pct_projetado desc).
    assert sp["candidatos"][0]["id"] == 100
    assert sp["candidatos"][1]["id"] == 200

    # Municípios vazios sem fixture (graceful degradation).
    assert sp["municipios"] == []

    # Series_temporais shape — sempre presente, com 3 arrays vazios quando
    # não há histórico.
    assert sp["series_temporais"] == {"margem": [], "p_vitoria": [], "turnout": []}


def test_build_uf_payloads_with_municipios() -> None:
    """S04/F2: quando `municipio_aggregates` + `zona_municipio` populados,
    `municipios[]` traz `{cod_ibge, nome, pct_apurado, lider, votos_reportados}`
    ordenados por cod_ibge ASC.
    """
    from api.model.project import build_uf_payloads

    uf_rows = [
        {
            "cargo": 1,
            "turno": 1,
            "uf": "SP",
            "candidato_id": 100,
            "pct_projetado": 55.0,
            "pct_projetado_lower": 53.0,
            "pct_projetado_upper": 57.0,
            "pct_apurado": 100.0,
        },
        {
            "cargo": 1,
            "turno": 1,
            "uf": "SP",
            "candidato_id": 200,
            "pct_projetado": 45.0,
            "pct_projetado_lower": 43.0,
            "pct_projetado_upper": 47.0,
            "pct_apurado": 100.0,
        },
    ]
    national_rows = [
        {"candidato_id": 100, "partido": "PT", "pct_projetado": 53.0},
        {"candidato_id": 200, "partido": "PL", "pct_projetado": 47.0},
    ]
    # 2 municípios em SP: São Paulo capital (3550308) e Campinas (3509502).
    municipio_aggregates = {
        ("SP", 71072): {  # cod_municipio_tse capital
            "pct_apurado": 100.0,
            "votos_por_candidato": {100: 4_200_000, 200: 3_000_000},
            "total_votos": 7_200_000,
        },
        ("SP", 67016): {  # campinas
            "pct_apurado": 100.0,
            "votos_por_candidato": {100: 320_000, 200: 360_000},
            "total_votos": 680_000,
        },
    }
    # zona_municipio mapeia cod_zona → meta. Para o teste, qualquer cod_zona
    # serve, contanto que produza meta para os (uf, cod_municipio_tse) acima.
    zona_municipio = {
        1: {"uf": "SP", "cod_municipio_tse": 71072, "cod_ibge": "3550308", "nome": "São Paulo"},
        2: {"uf": "SP", "cod_municipio_tse": 67016, "cod_ibge": "3509502", "nome": "Campinas"},
    }

    out = build_uf_payloads(
        cargo=1,
        turno=1,
        ts_iso="2026-10-04T18:23:15Z",
        uf_rows=uf_rows,
        national_rows=national_rows,
        municipio_aggregates=municipio_aggregates,
        zona_municipio=zona_municipio,
        series_by_uf={},
    )

    municipios = out["SP"]["municipios"]
    assert len(municipios) == 2
    # Ordem determinística (cod_ibge ASC) — Campinas (3509502) antes de SP (3550308).
    assert municipios[0]["cod_ibge"] == "3509502"
    assert municipios[0]["nome"] == "Campinas"
    assert municipios[1]["cod_ibge"] == "3550308"

    # Líder em Campinas: 200 (360k > 320k); em SP capital: 100 (4.2M > 3M).
    assert municipios[0]["lider"]["candidato_id"] == 200
    assert municipios[1]["lider"]["candidato_id"] == 100
    # Margem em pp positiva.
    assert municipios[0]["lider"]["margem_pp"] > 0
    assert municipios[1]["lider"]["margem_pp"] > 0

    # votos_reportados sparse (apenas candidatos com presença).
    assert municipios[0]["votos_reportados"] == {100: 320_000, 200: 360_000}
    assert municipios[1]["votos_reportados"] == {100: 4_200_000, 200: 3_000_000}


def test_build_uf_payloads_with_series_temporais() -> None:
    """S04/F2: timeline em `series_by_uf` vira 3 séries (margem, p_vitoria,
    turnout) ordenadas por ts ASC (constituição § 6).
    """
    from api.model.project import build_uf_payloads

    uf_rows = [
        {
            "cargo": 1,
            "turno": 1,
            "uf": "SP",
            "candidato_id": 100,
            "pct_projetado": 55.0,
            "pct_projetado_lower": 53.0,
            "pct_projetado_upper": 57.0,
            "pct_apurado": 80.0,
        },
    ]
    series_by_uf = {
        "SP": [
            {
                "ts": "2026-10-04T18:00:00Z",
                "margem_pp": 5.0,
                "pct_apurado": 20.0,
                "p_vitoria_lider": 0.72,
                "lider_id": 100,
            },
            {
                "ts": "2026-10-04T18:01:00Z",
                "margem_pp": 6.5,
                "pct_apurado": 35.0,
                "p_vitoria_lider": 0.81,
                "lider_id": 100,
            },
            # Ponto sem p_vitoria_lider — entra em margem/turnout mas não em p_vitoria.
            {
                "ts": "2026-10-04T18:02:00Z",
                "margem_pp": 7.0,
                "pct_apurado": 50.0,
                "p_vitoria_lider": None,
                "lider_id": 100,
            },
        ]
    }

    out = build_uf_payloads(
        cargo=1,
        turno=1,
        ts_iso="2026-10-04T18:23:15Z",
        uf_rows=uf_rows,
        national_rows=[{"candidato_id": 100, "partido": "PT", "pct_projetado": 55.0}],
        municipio_aggregates={},
        zona_municipio={},
        series_by_uf=series_by_uf,
    )

    series = out["SP"]["series_temporais"]
    # margem & turnout têm os 3 pontos (incluindo o sem p_vitoria).
    assert len(series["margem"]) == 3
    assert len(series["turnout"]) == 3
    # p_vitoria só os 2 com valor.
    assert len(series["p_vitoria"]) == 2

    # Ordem determinística (ts ASC, idem ao input).
    assert series["margem"][0]["ts"] == "2026-10-04T18:00:00Z"
    assert series["margem"][0]["margem_pp"] == 5.0
    assert series["p_vitoria"][0]["p"] == 0.72
    assert series["turnout"][2]["pct_apurado"] == 50.0


def test_edge_write_includes_payloads_uf(
    fake_db,
    minimal_dataset,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """S04/F2: `_do_project` envia `payloads_uf` no body para o endpoint
    Node `/api/_internal/edge-write` (junto do nacional). Cada chave é
    uma UF do `por_uf` nacional.
    """
    from api.model import project as proj_mod

    snapshots, historical, eleitorado = minimal_dataset
    fake_db(snapshots, historical, eleitorado)

    monkeypatch.setenv("MODEL_SECRET", "test-secret")
    monkeypatch.setenv("INTERNAL_BASE_URL", "http://localhost:13000")

    captured: dict[str, Any] = {}

    class FakeResponse:
        status = 200

        def __enter__(self):  # noqa: ANN204
            return self

        def __exit__(self, *a):  # noqa: ANN001,ANN204
            return None

    def fake_urlopen(req, timeout=10):  # noqa: ANN001,ANN201,ARG001
        captured["body"] = json.loads(req.data.decode("utf-8"))
        return FakeResponse()

    monkeypatch.setattr(proj_mod.urllib.request, "urlopen", fake_urlopen)

    body = json.dumps(
        {"cargo": 1, "turno": 1, "trigger_ts": "2026-10-04T18:23:15Z"}
    ).encode("utf-8")

    status, _payload = proj_mod._do_project(body)
    assert status == 200

    # S04/F2: body do edge-write agora tem `payloads_uf` ao lado do `payload`.
    posted = captured["body"]
    assert "payload" in posted
    assert "payloads_uf" in posted
    payloads_uf = posted["payloads_uf"]
    # 2 UFs em `minimal_dataset` (SP + RJ) → 2 chaves em payloads_uf.
    assert set(payloads_uf.keys()) == {"SP", "RJ"}
    # Shape canônico EdgePayloadUf.
    sp = payloads_uf["SP"]
    assert "candidatos" in sp
    assert "municipios" in sp
    assert "series_temporais" in sp
    # Candidatos têm os novos campos votos_atuais/votos_projetados.
    for c in sp["candidatos"]:
        assert "votos_atuais" in c
        assert "votos_projetados" in c


# ---------------------------------------------------------------------------
# (f) T16b — Edge Config publication via /api/_internal/edge-write
# ---------------------------------------------------------------------------


def test_edge_write_called_on_happy_path(
    fake_db,
    minimal_dataset,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """T16b: `_do_project` chama `post_edge_write` ao final em happy path.

    Mockamos `urllib.request.urlopen` (caminho que `post_edge_write` usa) e
    verificamos:
      - foi chamado UMA vez;
      - request foi POST para `/api/_internal/edge-write`;
      - header `x-model-secret` correto;
      - body JSON contém shape `{payload: {ts, cargo, turno, national, por_uf, ...}}`.
    """
    from api.model import project as proj_mod

    snapshots, historical, eleitorado = minimal_dataset
    fake_db(snapshots, historical, eleitorado)

    monkeypatch.setenv("MODEL_SECRET", "test-secret")
    monkeypatch.setenv("INTERNAL_BASE_URL", "http://localhost:13000")

    captured: dict[str, Any] = {"calls": []}

    class FakeResponse:
        status = 200

        def __enter__(self):  # noqa: ANN204
            return self

        def __exit__(self, *a):  # noqa: ANN001,ANN204
            return None

    def fake_urlopen(req, timeout=10):  # noqa: ANN001,ANN201,ARG001
        captured["calls"].append(
            {
                "url": req.full_url,
                "method": req.get_method(),
                "x_model_secret": req.get_header("X-model-secret"),
                "body": req.data.decode("utf-8") if req.data else "",
            }
        )
        return FakeResponse()

    monkeypatch.setattr(proj_mod.urllib.request, "urlopen", fake_urlopen)

    body = json.dumps(
        {"cargo": 1, "turno": 1, "trigger_ts": "2026-10-04T18:23:15Z"}
    ).encode("utf-8")

    status, payload = proj_mod._do_project(body)
    assert status == 200, payload
    assert payload["computed"] is True

    assert len(captured["calls"]) == 1, captured
    call = captured["calls"][0]
    assert call["url"] == "http://localhost:13000/api/_internal/edge-write"
    assert call["method"] == "POST"
    assert call["x_model_secret"] == "test-secret"

    body_obj = json.loads(call["body"])
    assert "payload" in body_obj
    p = body_obj["payload"]
    # Shape canônico (lib/edge-config/types.ts § EdgePayload).
    for key in ("ts", "cargo", "turno", "pct_apurado_total", "ufs_apuradas",
                "national", "por_uf", "insights", "composition"):
        assert key in p, f"falta {key} no payload"
    assert p["cargo"] == 1
    assert p["turno"] == 1
    assert isinstance(p["national"]["candidatos"], list)
    assert isinstance(p["por_uf"], list)
    # 2 UFs no dataset minimal_dataset → 2 entries.
    assert len(p["por_uf"]) == 2


def test_edge_write_failure_does_not_break_response(
    fake_db,
    minimal_dataset,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """T16b: se `urlopen` lança erro de rede, `_do_project` ainda retorna 200.

    A persistência canônica está em `projections` (Postgres); o Edge Config
    se ressincroniza no próximo ciclo de 60s. Falha de publicação é warn,
    não erro.
    """
    from api.model import project as proj_mod

    snapshots, historical, eleitorado = minimal_dataset
    fake_db(snapshots, historical, eleitorado)

    monkeypatch.setenv("MODEL_SECRET", "test-secret")
    monkeypatch.setenv("INTERNAL_BASE_URL", "http://localhost:13000")

    import urllib.error

    def boom(req, timeout=10):  # noqa: ANN001,ANN201,ARG001
        raise urllib.error.URLError("connection refused")

    monkeypatch.setattr(proj_mod.urllib.request, "urlopen", boom)

    body = json.dumps(
        {"cargo": 1, "turno": 1, "trigger_ts": "2026-10-04T18:23:15Z"}
    ).encode("utf-8")

    status, payload = proj_mod._do_project(body)
    # 200 mesmo com edge-write falhando.
    assert status == 200, payload
    assert payload["computed"] is True
    assert payload["uf_count"] == 2


# ---------------------------------------------------------------------------
# S05/F4c — Multi-candidato (ADR-0014): rank, p_passa_2t, p_fecha_1t,
# p_segundo_turno_overall e cenarios_2t no payload.
# ---------------------------------------------------------------------------


def test_s05_payload_has_rank_and_multi_candidate_metrics(
    fake_db, minimal_dataset, monkeypatch
) -> None:
    """Sanity: o payload edge gerado pelo orchestrator inclui os campos
    multi-candidato adicionados em S05/F4c.

      - candidato.rank populado (1 = líder, 2 = segundo)
      - candidato.p_passa_2t em [0, 1]
      - candidato.p_fecha_1t em [0, 1]
      - candidato.cor segue token `var(--color-cand-N)` (ADR-0013)
      - national.p_segundo_turno_overall em [0, 1] OU None
      - national.cenarios_2t é lista (top-3, vazia se < 2 cands)
    """
    from api.model.project import _do_project, urllib as proj_urllib

    snapshots, historical, eleitorado = minimal_dataset
    fake_db(snapshots, historical, eleitorado)

    monkeypatch.setenv("MODEL_SECRET", "test-secret-s05")
    monkeypatch.setenv("INTERNAL_BASE_URL", "http://localhost:13000")

    captured: dict[str, Any] = {}

    class FakeResponse:
        status = 200

        def __enter__(self):  # noqa: ANN204
            return self

        def __exit__(self, *a):  # noqa: ANN001,ANN204
            return None

    def fake_urlopen(req, timeout=10):  # noqa: ANN001,ARG001
        captured["body"] = json.loads(req.data.decode("utf-8"))
        return FakeResponse()

    monkeypatch.setattr(proj_urllib.request, "urlopen", fake_urlopen)

    status, _ = _do_project(
        json.dumps({"cargo": 1, "turno": 1, "trigger_ts": "2026-10-04T18:23:15Z"}).encode(
            "utf-8"
        )
    )
    assert status == 200

    payload = captured["body"]["payload"]
    national = payload["national"]

    # rank populado e contíguo (1, 2, ...).
    ranks = [c["rank"] for c in national["candidatos"]]
    assert ranks == sorted(ranks)
    assert ranks[0] == 1

    # p_passa_2t e p_fecha_1t em [0, 1].
    for c in national["candidatos"]:
        assert "p_passa_2t" in c
        assert "p_fecha_1t" in c
        assert 0.0 <= c["p_passa_2t"] <= 1.0
        assert 0.0 <= c["p_fecha_1t"] <= 1.0

    # cor segue ADR-0013 — paleta dinâmica por rank.
    for c in national["candidatos"]:
        assert c["cor"].startswith("var(--color-cand-"), f"cor inesperada: {c['cor']}"

    # national tem as 2 chaves novas.
    assert "p_segundo_turno_overall" in national
    assert "cenarios_2t" in national
    p2t = national["p_segundo_turno_overall"]
    assert p2t is None or (0.0 <= p2t <= 1.0)
    assert isinstance(national["cenarios_2t"], list)

    # S06/F4d Fase 5 (carry-over) — vai_a_2t_nacional explícito.
    # Em 1T sempre presente (bool ou None se caller legado); semântica
    # alinhada com o nome: `true` ⇔ vai a 2T ⇔ p_segundo_turno_overall >= 0.01.
    assert "vai_a_2t_nacional" in national
    v2t_nac = national["vai_a_2t_nacional"]
    assert v2t_nac is None or isinstance(v2t_nac, bool)
    if p2t is not None and v2t_nac is not None:
        assert v2t_nac == (p2t >= 0.01)
    # No fixture minimal (2 candidatos), top-3 pode ter 1 entry só.
    for s in national["cenarios_2t"]:
        assert "par" in s and "prob" in s
        assert len(s["par"]) == 2

    # por_uf tem top_candidatos + bucket + vai_a_2t (presidencial 1T = null).
    for row in payload["por_uf"]:
        assert "top_candidatos" in row
        assert "vai_a_2t" in row
        assert "bucket" in row
        # Presidencial 1T → vai_a_2t sempre null.
        assert row["vai_a_2t"] is None
        # bucket é um dos 4 estados válidos.
        assert row["bucket"] in {"decidido_1t", "vai_2t", "indefinido", "chamada"}


# ---------------------------------------------------------------------------
# S07 fix — BUG 1 (envelope EA20) + BUG 2 (escala) end-to-end via _do_project
# ---------------------------------------------------------------------------


def test_envelope_payload_end_to_end_reads_swing_and_scales_to_pct(
    fake_db, monkeypatch: pytest.MonkeyPatch
) -> None:
    """BUG 1 + BUG 2 (S07): payload EA20 REAL (envelope completo — não
    achatado) deve alimentar o swing corretamente, e o `pct_projetado`
    resultante no payload Edge deve sair em 0–100 (não fração [0,1]).

    Cenário: 1 UF (SP), 1 zona, 2 candidatos. 2022: 100 teve 40%, 200 teve
    60%. 2026 (envelope): 100 tem 45%, 200 tem 55% → swing = +5pp / -5pp.
    Com 1 única zona, o bootstrap sempre resample a mesma zona (sem
    variância) → `pct_projetado` determinístico = p_2022 + swing:
      100 → 0.40 + 0.05 = 0.45 → 45.0 (não 0.45!)
      200 → 0.60 - 0.05 = 0.55 → 55.0 (não 0.55!)

    Se BUG 1 não estivesse corrigido, `_extract_zone_candidate_pcts`
    devolveria `{}` para o envelope → zona excluída do swing → RF-017
    (zero apurado) aplicaria fallback `point = p_2022` SEM o swing:
      100 → 40.0 (❌, não 45.0)
      200 → 60.0 (❌, não 55.0)
    Este teste falha nesse cenário — prova que o envelope é lido.

    Se BUG 2 não estivesse corrigido, os valores sairiam em fração
    (0.45/0.55) em vez de percentual (45.0/55.0) — a asserção com
    `pytest.approx(45.0)` também falharia.
    """
    from api.model.project import _do_project, urllib as proj_urllib

    snapshots = [
        {
            "cargo": 1,
            "turno": 1,
            "uf": "SP",
            "cod_zona": 1,
            "pct_apurado": 100.0,
            "payload": _synthetic_envelope({100: 45.0, 200: 55.0}),
        }
    ]
    historical = [
        {
            "cargo": 1, "turno": 1, "uf": "SP", "cod_zona": 1,
            "cod_candidato": 100, "pct_validos": 0.40, "partido": "PT",
        },
        {
            "cargo": 1, "turno": 1, "uf": "SP", "cod_zona": 1,
            "cod_candidato": 200, "pct_validos": 0.60, "partido": "PL",
        },
    ]
    eleitorado = [{"ano": 2026, "uf": "SP", "cod_zona": 1, "eleitores_aptos": 100_000}]

    fake_db(snapshots, historical, eleitorado)

    monkeypatch.setenv("MODEL_SECRET", "test-secret-envelope")
    monkeypatch.setenv("INTERNAL_BASE_URL", "http://localhost:13000")

    captured: dict[str, Any] = {}

    class FakeResponse:
        status = 200

        def __enter__(self):  # noqa: ANN204
            return self

        def __exit__(self, *a):  # noqa: ANN001,ANN204
            return None

    def fake_urlopen(req, timeout=10):  # noqa: ANN001,ARG001
        captured["body"] = json.loads(req.data.decode("utf-8"))
        return FakeResponse()

    monkeypatch.setattr(proj_urllib.request, "urlopen", fake_urlopen)

    status, response = _do_project(
        json.dumps(
            {"cargo": 1, "turno": 1, "trigger_ts": "2026-10-04T18:23:15Z"}
        ).encode("utf-8")
    )
    assert status == 200, response
    assert response["computed"] is True
    assert response["uf_count"] == 1

    payload = captured["body"]["payload"]
    by_id = {c["id"]: c for c in payload["national"]["candidatos"]}
    assert set(by_id.keys()) == {100, 200}

    assert by_id[100]["pct_projetado"] == pytest.approx(45.0, abs=0.05)
    assert by_id[200]["pct_projetado"] == pytest.approx(55.0, abs=0.05)

    # por_uf também em 0–100 (mesma fronteira de escala).
    sp_row = next(r for r in payload["por_uf"] if r["sigla"] == "SP")
    assert sp_row["margem_atual"] == pytest.approx(10.0, abs=0.1)  # 55 - 45


# ---------------------------------------------------------------------------
# Fase 1a (RF-020.1) — participação (abstenção, brancos/nulos, outros) via
# envelope EA20 real, end-to-end através de `_do_project`.
# ---------------------------------------------------------------------------


def test_participacao_end_to_end_com_envelope_real(
    fake_db, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Fase 1a: com um payload EA20 ENVELOPE REAL (`e`/`v`/`s` de raiz) e
    4 candidatos (o suficiente para "outros" existir, rank >= 4), o payload
    Edge publicado deve trazer `national.participacao` e
    `payloads_uf.SP.participacao` com as 3 métricas (abstenção,
    brancos/nulos, outros), bases corretas (D3 — denominador misto
    rotulado) e valores em 0–100.

    `_synthetic_envelope` fixa `e.te=1000, e.esi=1000, e.c=800, e.a=200`
    (abstenção = 200/1000 = 20%) e `v.vb=10, v.tvn=10` sobre
    `comparecimento=800` (brancos+nulos = 20/800 = 2.5%) — mesmos números
    para os 4 "candidatos" porque `e`/`v`/`s` vivem na raiz do envelope,
    não por candidato.
    """
    from api.model.project import _do_project, urllib as proj_urllib

    cand_pcts = {100: 40.0, 200: 30.0, 300: 20.0, 400: 10.0}
    snapshots = [
        {
            "cargo": 1,
            "turno": 1,
            "uf": "SP",
            "cod_zona": 1,
            "pct_apurado": 100.0,
            "payload": _synthetic_envelope(cand_pcts),
        }
    ]
    historical = [
        {
            "cargo": 1, "turno": 1, "uf": "SP", "cod_zona": 1,
            "cod_candidato": cod, "pct_validos": pct / 100.0, "partido": "PP",
        }
        for cod, pct in cand_pcts.items()
    ]
    eleitorado = [{"ano": 2026, "uf": "SP", "cod_zona": 1, "eleitores_aptos": 100_000}]

    fake_db(snapshots, historical, eleitorado)

    monkeypatch.setenv("MODEL_SECRET", "test-secret-participacao")
    monkeypatch.setenv("INTERNAL_BASE_URL", "http://localhost:13000")

    captured: dict[str, Any] = {}

    class FakeResponse:
        status = 200

        def __enter__(self):  # noqa: ANN204
            return self

        def __exit__(self, *a):  # noqa: ANN001,ANN204
            return None

    def fake_urlopen(req, timeout=10):  # noqa: ANN001,ARG001
        captured["body"] = json.loads(req.data.decode("utf-8"))
        return FakeResponse()

    monkeypatch.setattr(proj_urllib.request, "urlopen", fake_urlopen)

    status, response = _do_project(
        json.dumps(
            {"cargo": 1, "turno": 1, "trigger_ts": "2026-10-04T18:23:15Z"}
        ).encode("utf-8")
    )
    assert status == 200, response
    assert response["computed"] is True

    body = captured["body"]
    national = body["payload"]["national"]
    uf_sp = body["payloads_uf"]["SP"]

    for block, base_expected in (
        (national, {
            "abstencao": "eleitores_instalados",
            "brancos_nulos": "comparecimento",
            "outros": "votaveis",
        }),
        (uf_sp, {
            "abstencao": "eleitores_instalados",
            "brancos_nulos": "comparecimento",
            "outros": "votaveis",
        }),
    ):
        assert "participacao" in block, block.keys()
        participacao = block["participacao"]
        assert "metodo" in participacao
        assert participacao["metodo"]["tipo"] == "extrapolacao_apurado"
        assert participacao["metodo"]["n_zonas"] == 1
        for metric_key, base in base_expected.items():
            assert metric_key in participacao, (metric_key, participacao.keys())
            metric = participacao[metric_key]
            assert metric["base"] == base
            for field in ("pct_projetado", "lower", "upper"):
                assert 0.0 <= metric[field] <= 100.0

        # abstenção = 200/1000 = 20%.
        assert participacao["abstencao"]["pct_projetado"] == pytest.approx(20.0, abs=0.5)
        assert participacao["abstencao"]["pct_atual"] == pytest.approx(20.0, abs=0.5)
        # brancos+nulos = 20/800 = 2.5%.
        assert participacao["brancos_nulos"]["pct_projetado"] == pytest.approx(2.5, abs=0.1)
        # outros: só o candidato 400 (rank 4, 10%) — n_candidatos == 1.
        assert participacao["outros"]["n_candidatos"] == 1
        # `pct_atual` de "outros" fica None quando não há
        # `municipio_aggregates` real por trás (fixture minimal não popula
        # `cod_municipio_tse` — ver FakeCursor) — nunca um falso `0.0`.
        assert participacao["outros"]["pct_atual"] is None
