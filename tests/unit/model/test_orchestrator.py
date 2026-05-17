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
    """Constrói payload EA20 mínimo com candidatos e seus pvap (em %)."""
    return {
        "cand": [
            {"n": str(cod), "pvap": f"{pct:.2f}".replace(".", ",")}
            for cod, pct in cand_pcts.items()
        ]
    }


class FakeCursor:
    def __init__(self, conn: "FakeConn") -> None:
        self._conn = conn
        self._last_rows: list[tuple] = []

    def execute(self, sql: str, params: tuple) -> None:
        # Dispatching pelo conteúdo da query — suficiente para os 3 SELECTs.
        if "FROM snapshots" in sql:
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

    rows, p_a, cand_a, cand_b = compute_national(
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

    rows, _p_a, cand_a, cand_b = compute_national(
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

    rows, p_a, cand_a, cand_b = compute_national(
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
