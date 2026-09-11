#!/usr/bin/env python3.14
"""scripts/profile-model.py — T13 baseline de `computed_duration_ms` (RNF-006).

Mede p50/p95/p99/max do orchestrator `api/model/project._do_project()` rodando
contra dataset sintético dimensionado para produção (27 UFs × 100 zonas ×
2 candidatos × 1000 resamples). Não usa Postgres — monkey-patcha `_open_conn`
com uma `FakeConn` equivalente à de `tests/unit/model/test_orchestrator.py`.

Por que sintético?
  Sem deploy preview ainda (kickoff S03). A meta RNF-006 (`p95 < 2000ms`) é de
  ponta a ponta em prod, dominada por (a) cómputo NumPy (bootstrap) e (b) I/O
  DB. Aqui isolamos (a) e damos um teto inferior — em prod, soma-se a latência
  Neon (cold start ~150ms + queries). O número aqui é "computação pura"; o
  reteste em preview confirma a margem real.

Reproduz: `source .venv-model/bin/activate && python scripts/profile-model.py`
Saída: tabela STDOUT + atualização opcional em `docs/operations/runbook.md`.

Cobre: RNF-006 (computed_duration_ms p95 < 2000ms — sub-meta de spec 002).
"""
# ruff: noqa: E402 — sys.path manipulado antes dos imports do projeto.

from __future__ import annotations

import json
import logging
import statistics
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np

# Silencia os JSON-logs emitidos pelo _log() do api/model/project — eles
# poluem stdout (50 linhas por iteração) e mascaram o relatório final.
# Os logs continuam disponíveis se rodar com `LOGLEVEL=info python scripts/...`.
logging.getLogger("api.model.project").setLevel(logging.WARNING)

# Garante `from api.model.project import ...` mesmo rodando fora do venv root.
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api.model import project as proj_mod  # noqa: E402

# ---------------------------------------------------------------------------
# Dataset sintético — dimensão produção
# ---------------------------------------------------------------------------

# Lista canônica das 27 UFs (26 estados + DF). Hardcoded — não há "lista UFs"
# no projeto; estes são os códigos IBGE/TSE de uso direto em snapshots/payload.
UFS_CANONICAS = (
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
    "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
    "RS", "RO", "RR", "SC", "SP", "SE", "TO",
)
assert len(UFS_CANONICAS) == 27

# Dois candidatos principais (Presidente turno 1, finalistas históricos).
COD_CAND_A = 100  # ordem canônica → "A" no compute_national
COD_CAND_B = 200

ZONAS_POR_UF = 100  # 100 zonas/UF × 27 UFs ≈ 2.700 zonas (ordem de grandeza real)
N_ITERATIONS = 50  # iterações pra ter p95/p99 estáveis (com 50, p99 = #49)


def _br_pct(x: float) -> str:
    """Formata float [0,1] em pvap EA20 (BR, '12,34' onde 12.34 == x*100)."""
    return f"{x * 100:.2f}".replace(".", ",")


def build_fixtures(rng: np.random.Generator) -> tuple[list[dict], list[dict], list[dict]]:
    """Gera (snapshots, historical, eleitorado) realistas para 27 UFs × 100 zonas.

    Args:
        rng: gerador NumPy semeado pelo caller (determinismo do dataset entre
            iterações — o que varia entre iterações é apenas `trigger_ts`).

    Realismo:
      - pct_validos_2022 por UF: cand A em [0.40, 0.60], B = 1 - A.
      - pct_apurado por zona: uniforme em [0.30, 0.80] (mistura zonas no início
        e no fim da apuração).
      - eleitorado: 100k–500k por zona (cobre desde interior até capital).
      - votos do candidato: pct_2022_uf + ruído ±5pp por zona — ressonância
        com o swing real visto em 2022 (~3pp típico, ~5pp cauda).
    """
    snapshots: list[dict] = []
    historical: list[dict] = []
    eleitorado: list[dict] = []

    # pct_validos_2022 por (UF, candidato) — uma vez por UF, propagado a todas
    # as zonas com ruído.
    p_a_uf = rng.uniform(0.40, 0.60, size=len(UFS_CANONICAS))

    for uf_idx, uf in enumerate(UFS_CANONICAS):
        p_a_base = float(p_a_uf[uf_idx])

        # Eleitorado por zona — log-normal grosseiro pra não ser uniforme demais.
        eleitorado_zonas = rng.integers(100_000, 500_001, size=ZONAS_POR_UF)
        # pct_apurado e ruído por zona — uma chamada vectorizada.
        pct_apurado_zonas = rng.uniform(0.30, 0.80, size=ZONAS_POR_UF)
        ruido_a = rng.uniform(-0.05, 0.05, size=ZONAS_POR_UF)

        for z in range(1, ZONAS_POR_UF + 1):
            apt = int(eleitorado_zonas[z - 1])
            pct_apurado = float(pct_apurado_zonas[z - 1]) * 100.0  # pct_apurado vem em escala 0-100

            # Snapshot: o candidato A teve p_a_base + ruido nessa zona.
            p_a_zona = max(0.01, min(0.99, p_a_base + float(ruido_a[z - 1])))
            p_b_zona = 1.0 - p_a_zona

            snapshots.append({
                "cargo": 1,
                "turno": 1,
                "uf": uf,
                "cod_zona": z,
                "pct_apurado": pct_apurado,
                "payload": {
                    "cand": [
                        {"n": str(COD_CAND_A), "pvap": _br_pct(p_a_zona)},
                        {"n": str(COD_CAND_B), "pvap": _br_pct(p_b_zona)},
                    ],
                },
            })

            # Historical 2022: pct_validos próximos de p_a_base / p_b_base
            # (ligeiro ruído pra simular swing real). pct_validos é fração [0,1].
            hist_ruido_a = float(rng.uniform(-0.03, 0.03))
            h_a = max(0.05, min(0.95, p_a_base + hist_ruido_a))
            h_b = 1.0 - h_a
            historical.extend([
                {
                    "cargo": 1, "turno": 1, "uf": uf, "cod_zona": z,
                    "cod_candidato": COD_CAND_A, "pct_validos": h_a, "partido": "PT",
                },
                {
                    "cargo": 1, "turno": 1, "uf": uf, "cod_zona": z,
                    "cod_candidato": COD_CAND_B, "pct_validos": h_b, "partido": "PL",
                },
            ])

            eleitorado.append({
                "ano": 2026, "uf": uf, "cod_zona": z, "eleitores_aptos": apt,
            })

    return snapshots, historical, eleitorado


# ---------------------------------------------------------------------------
# FakeConn — clone do conftest de tests/unit/model
# ---------------------------------------------------------------------------


class FakeCursor:
    """Cursor mock: dispatcha pelo conteúdo da SQL.

    Copiado tal-qual do conftest dos testes (mesmo contrato) para garantir
    que o que medimos é o mesmo path que os testes executam.
    """

    def __init__(self, conn: "FakeConn") -> None:
        self._conn = conn
        self._last_rows: list[tuple] = []

    def execute(self, sql: str, params: tuple) -> None:
        if "FROM snapshots" in sql and "votos_total" in sql:
            # fetch_municipio_aggregates — 6 colunas, município do próprio
            # snapshot (sem `JOIN zonas` desde a Fase 3 de 11/09).
            cargo, turno = params
            self._last_rows = [
                (
                    s["uf"],
                    s["cod_zona"],
                    s["pct_apurado"],
                    s.get("votos_total"),
                    s["payload"],
                    int(s.get("cod_municipio_tse") or 0),
                )
                for s in self._conn.snapshots
                if s["cargo"] == cargo and s["turno"] == turno
            ]
        elif "FROM snapshots" in sql:
            # fetch_snapshots — 5 colunas (cod_municipio_tse entre uf e zona).
            cargo, turno = params
            self._last_rows = [
                (
                    s["uf"],
                    int(s.get("cod_municipio_tse") or 0),
                    s["cod_zona"],
                    s["pct_apurado"],
                    s["payload"],
                )
                for s in self._conn.snapshots
                if s["cargo"] == cargo and s["turno"] == turno
            ]
        elif "FROM historical_results" in sql:
            cargo, turno = params
            self._last_rows = [
                (h["uf"], h["cod_zona"], h["cod_candidato"], h["pct_validos"], h.get("partido"))
                for h in self._conn.historical
                if h["cargo"] == cargo and h["turno"] == turno
            ]
        elif "FROM eleitorado" in sql:
            # Três agregações desde a migration 0006 (PK no par) — o `GROUP BY`
            # é o conserto: sem ele o dict fica com a última fatia de município
            # em vez da soma.
            (ano,) = params
            fixtures = [e for e in self._conn.eleitorado if e["ano"] == ano]
            if "GROUP BY uf, cod_municipio_tse, cod_zona" in sql:
                por_par: dict[tuple, int] = {}
                for e in fixtures:
                    k = (e["uf"], int(e.get("cod_municipio_tse") or 0), e["cod_zona"])
                    por_par[k] = por_par.get(k, 0) + int(e["eleitores_aptos"])
                self._last_rows = [(u, m, z, v) for (u, m, z), v in por_par.items()]
            elif "GROUP BY uf, cod_municipio_tse" in sql:
                por_mun: dict[tuple, int] = {}
                for e in fixtures:
                    k = (e["uf"], int(e.get("cod_municipio_tse") or 0))
                    por_mun[k] = por_mun.get(k, 0) + int(e["eleitores_aptos"])
                self._last_rows = [(u, m, v) for (u, m), v in por_mun.items()]
            else:
                por_zona: dict[tuple, int] = {}
                for e in fixtures:
                    k = (e["uf"], e["cod_zona"])
                    por_zona[k] = por_zona.get(k, 0) + int(e["eleitores_aptos"])
                self._last_rows = [(u, z, v) for (u, z), v in por_zona.items()]
        elif "FROM zonas z" in sql or "JOIN municipios" in sql:
            self._last_rows = []
        elif "FROM projections" in sql:
            self._last_rows = []
        else:
            raise AssertionError(f"FakeCursor sql não suportada: {sql[:80]}")

    def executemany(self, sql: str, rows: list[dict]) -> None:
        # Não validamos shape aqui — só consumimos para medir custo do INSERT mock.
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

    def cursor(self) -> FakeCursor:
        return FakeCursor(self)

    def commit(self) -> None:
        return None

    def close(self) -> None:
        return None

    def __enter__(self) -> "FakeConn":
        return self

    def __exit__(self, *a: Any) -> None:
        return None


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------


def run_profiling() -> dict[str, float]:
    """Roda N_ITERATIONS chamadas de `_do_project()` e devolve quantis."""
    # Seed do dataset: fixo, pra reprodutibilidade entre runs do script.
    fixture_rng = np.random.default_rng(seed=0xC0FFEE)
    snapshots, historical, eleitorado = build_fixtures(fixture_rng)

    print(
        f"Dataset gerado: {len(UFS_CANONICAS)} UFs × {ZONAS_POR_UF} zonas = "
        f"{len(snapshots)} snapshots | "
        f"{len(historical)} linhas historical | {len(eleitorado)} eleitorado.",
        file=sys.stderr,
    )

    # Monkey-patch _open_conn de proj_mod para devolver a FakeConn compartilhada.
    # Cada iteração reseta `inserted` no FakeConn (evitamos acumular memória).
    shared_conn: dict[str, FakeConn | None] = {"conn": None}

    def _fake_open_conn():
        conn = FakeConn(snapshots, historical, eleitorado)
        shared_conn["conn"] = conn
        return conn

    proj_mod._open_conn = _fake_open_conn  # type: ignore[assignment]

    # Warm-up: a primeira chamada paga JIT/import lazy de psycopg (não vai
    # ser usado aqui, mas mantém paridade com prod). Não conta no quantil.
    body_warmup = json.dumps({
        "cargo": 1, "turno": 1, "trigger_ts": "2026-10-04T17:59:59Z",
    }).encode("utf-8")
    status_w, payload_w = proj_mod._do_project(body_warmup)
    assert status_w == 200, f"warm-up falhou: {payload_w}"
    assert payload_w["computed"] is True, payload_w
    assert payload_w["uf_count"] == 27, payload_w

    print(
        f"Warm-up OK: uf_count={payload_w['uf_count']}, "
        f"national_p_vitoria_a={payload_w['national_p_vitoria_a']:.4f}, "
        f"computed_duration_ms={payload_w['computed_duration_ms']} (descartado).",
        file=sys.stderr,
    )

    durations_ms: list[int] = []
    wall_t0 = time.perf_counter()

    for i in range(N_ITERATIONS):
        # trigger_ts varia → seeds bootstrap distintos por iteração
        # (mesmo padrão de prod: cada ciclo de ingest gera trigger_ts novo).
        trigger_ts = f"2026-10-04T18:{i // 60:02d}:{i % 60:02d}Z"
        body = json.dumps({
            "cargo": 1, "turno": 1, "trigger_ts": trigger_ts,
        }).encode("utf-8")

        status, payload = proj_mod._do_project(body)
        assert status == 200, f"iter {i} falhou: {payload}"
        durations_ms.append(int(payload["computed_duration_ms"]))

    wall_total_s = time.perf_counter() - wall_t0

    # Quantis — np.percentile com interpolação linear (default). Para N=50,
    # p95 cai entre os índices 46 e 47; aceitável dado n pequeno.
    n = len(durations_ms)
    p50 = float(statistics.median(durations_ms))
    p95 = float(np.percentile(durations_ms, 95))
    p99 = float(np.percentile(durations_ms, 99))
    p_max = float(max(durations_ms))
    p_min = float(min(durations_ms))
    mean = float(np.mean(durations_ms))

    print()
    print("=" * 64)
    print(f"  Profiling _do_project()  ·  N={n} iterações")
    print("=" * 64)
    print(f"  min        : {p_min:>8.1f} ms")
    print(f"  p50        : {p50:>8.1f} ms")
    print(f"  mean       : {mean:>8.1f} ms")
    print(f"  p95        : {p95:>8.1f} ms   <-- meta < 2000 ms (RNF-006)")
    print(f"  p99        : {p99:>8.1f} ms")
    print(f"  max        : {p_max:>8.1f} ms")
    print(f"  wall total : {wall_total_s * 1000:>8.1f} ms")
    print("=" * 64)

    if p95 < 1500:
        print(f"  ✓ PASS — p95 {p95:.0f}ms < 1500ms (margem de 500ms para I/O DB real)")
        verdict = "pass"
    elif p95 < 2000:
        print(f"  ⚠ MARGINAL — p95 {p95:.0f}ms cabe em <2000ms, mas <500ms de folga para I/O DB.")
        print("    Plano B sugerido: paralelizar bootstrap por UF (27 threads NumPy GIL-light)")
        print("    OU pré-agregar `p_2022_uf` em chore S03 (eliminar loop em historical).")
        verdict = "marginal"
    else:
        print(f"  ✗ FAIL — p95 {p95:.0f}ms ≥ 2000ms.")
        print("    Plano B obrigatório (em ordem):")
        print("      1. Vetorizar compute_uf_projections: rodar bootstrap das 27 UFs num")
        print("         único loop NumPy sem agrupar por UF em Python (potencial 5-10x).")
        print("      2. Threading: ThreadPoolExecutor(max_workers=4) sobre as 27 UFs —")
        print("         numpy libera GIL no bootstrap (potencial 2-3x).")
        print("      3. Reduzir n_resamples para 500 — afeta CI (não recomendado).")
        verdict = "fail"

    print()
    return {
        "n_iterations": n,
        "n_ufs": len(UFS_CANONICAS),
        "n_zonas_por_uf": ZONAS_POR_UF,
        "n_candidatos": 2,
        "n_resamples": 1000,
        "min_ms": p_min,
        "p50_ms": p50,
        "mean_ms": mean,
        "p95_ms": p95,
        "p99_ms": p99,
        "max_ms": p_max,
        "wall_total_ms": wall_total_s * 1000,
        "verdict": verdict,
    }


if __name__ == "__main__":
    result = run_profiling()
    # Saída JSON na última linha do stdout para consumo programático (CI).
    print("RESULT_JSON=" + json.dumps(result))
