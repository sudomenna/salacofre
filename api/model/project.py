"""
api/model/project.py

POST /api/model/project — endpoint Python do modelo estatístico (spec 002).

Roda em Vercel Fluid Compute com runtime Python 3.14. Acionado pelo handler
TypeScript `/api/ingest` ao final de cada ciclo de ingestão (T16 da spec
002, Fase 5). Esta é a Fase 3 (T12) — orquestrador completo cola swing
(T06), weighted_average (T07), projection (T08), bootstrap (T09), p_vitoria
(T10) e edge_cases (T11) atrás de um único POST com persistência no Postgres.

Por que NÃO está em `app/api/model/project/...`?
  O Next.js App Router só aceita route handlers TS/JS dentro de `app/`.
  Funções Python no Vercel vivem na pasta `/api/` na raiz do projeto
  (https://vercel.com/docs/functions/runtimes/python). Os dois subtrees
  coexistem na mesma URL surface — Vercel faz o roteamento por path
  prefix.

Imports (decisão T12):
  Usamos imports ABSOLUTOS desde a raiz: `from api.model.swing import ...`.
  Em Vercel, a raiz do projeto é mantida no `sys.path` quando a function
  é importada via `api/model/project.py`, então `api.model.X` resolve.
  Imports relativos (`from .swing import ...`) também funcionariam, mas
  os testes locais já usam absolutos (via conftest que injeta a raiz no
  sys.path) e essa consistência ajuda a debug: o mesmo import string vale
  em test/prod.
  Fallback: se Vercel quebrar com absolutos no Python runtime real,
  trocar para relativos é uma mudança de 6 linhas neste arquivo.

DB driver (decisão kickoff S03):
  psycopg[binary] direto contra `DATABASE_URL` (Neon). Aceita prepared
  statements no Neon serverless quando NÃO via pooler — caller DEVE usar
  a connection string `direct`. Se quebrar (cold start ↔ pgbouncer), criar
  um helper Node `/api/_internal/snapshots` é o plano B.

Auth:
  Header `x-model-secret` === `os.environ["MODEL_SECRET"]`. Mesmo padrão
  do `x-cron-secret` do `/api/ingest`. Ausente/inválido → 401.

Determinismo (constituição § 6):
  Seed do bootstrap = SHA-256 dos 8 primeiros chars hex de
  `f"{cargo}:{turno}:{trigger_ts}"`. Reproduzível bit-a-bit — mesmo trigger_ts
  → mesma `national_p_vitoria_a`. Validado em test_orchestrator::test_determinism.

Append-only (constituição § 10):
  Persistimos via INSERT puro em `projections` (sem ON CONFLICT, sem
  UPDATE, sem DELETE). Re-execuções geram linhas novas com `ts` distinto.
  Replay histórico é literalmente `SELECT ... ORDER BY ts`.

Cobre: RF-019 (persistir cálculos do modelo), RF-020 (replay/auditoria via
append-only), RF-011..RF-018 indiretamente via composição de T06..T11.
Spec: docs/specs/002-modelo-estatistico/ (T12).
"""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler
import hashlib
import json
import logging
import os
import time
import traceback
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from typing import Any

import numpy as np
from pydantic import BaseModel, Field, ValidationError

from api.model.bootstrap import bootstrap_uf
from api.model.edge_cases import inflate_ci_low_apurado, inflate_ci_zero_apurado
from api.model.p_vitoria import p_vitoria
from api.model.projection import project_uf
from api.model.swing import swing_zone
from api.model.weighted_average import swing_uf

# ---------------------------------------------------------------------------
# Logging — JSON-line para alinhar com lib/tse/log.ts (RNF-032)
# ---------------------------------------------------------------------------

_logger = logging.getLogger("api.model.project")
if not _logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(message)s"))
    _logger.addHandler(_h)
    _logger.setLevel(logging.INFO)


def _log(level: str, msg: str, **ctx: Any) -> None:
    """Emite linha JSON com level/msg/ctx — equivalente Python ao logInfo TS."""
    payload = {"level": level, "msg": msg, **ctx}
    _logger.info(json.dumps(payload, default=str))


# ---------------------------------------------------------------------------
# Pydantic schemas — contrato do endpoint
# ---------------------------------------------------------------------------


class ProjectRequest(BaseModel):
    """Body do POST /api/model/project (design.md § Contratos).

    `trigger_ts` é ISO 8601; mantido como string crua para o seed
    determinístico (não convertemos para datetime — qualquer normalização
    mudaria o hash).
    """

    cargo: int = Field(ge=1, le=99, description="1=Presidente, 3=Governador")
    turno: int = Field(ge=1, le=2)
    trigger_ts: str = Field(min_length=1, max_length=64)


class ProjectResponse(BaseModel):
    """Response 200 do endpoint.

    `national_p_vitoria_a` = p_vitoria do candidato A (o primeiro na ordenação
    canônica por candidatoId crescente). Quando só há 1 candidato ou nenhum,
    retorna 1.0 ou 0.0 respectivamente — caller decide se trata como NaN.
    """

    computed: bool
    uf_count: int
    national_p_vitoria_a: float
    computed_duration_ms: int


# ---------------------------------------------------------------------------
# Seed determinístico (constituição § 6)
# ---------------------------------------------------------------------------


def derive_seed(cargo: int, turno: int, trigger_ts: str) -> int:
    """Seed para bootstrap a partir de (cargo, turno, trigger_ts).

    Determinismo: SHA-256 do f-string, primeiros 8 chars hex → int 32-bit.
    Compatível com `numpy.random.default_rng(seed)` (aceita int positivo).
    """
    key = f"{cargo}:{turno}:{trigger_ts}".encode("utf-8")
    return int(hashlib.sha256(key).hexdigest()[:8], 16)


# ---------------------------------------------------------------------------
# DB access — psycopg direto contra Neon (DATABASE_URL)
# ---------------------------------------------------------------------------


# Tipo de fronteira (parecido com LatestSnapshotRow em lib/model/repository.ts).
LatestSnapshot = dict[str, Any]
HistoricalRow = dict[str, Any]
EleitoradoRow = dict[str, int]


def _open_conn():
    """Abre conexão psycopg contra DATABASE_URL.

    Import lazy: `psycopg` só carrega quando o handler vai falar com DB,
    permitindo que os testes que mocam DB monkey-patchem este símbolo sem
    pagar o cold-start de carregar libpq.
    """
    import psycopg

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError(
            "DATABASE_URL não configurada — endpoint /api/model/project requer "
            "conexão direta com Neon. Configure a env var no projeto Vercel."
        )
    # autocommit=True: cada SELECT roda em sua própria transação implícita; os
    # INSERTs em projections vão dentro de uma transação explícita (with conn).
    return psycopg.connect(dsn, autocommit=False)


def fetch_snapshots(conn, cargo: int, turno: int) -> list[LatestSnapshot]:
    """Snapshot mais recente por (uf, cod_zona) para (cargo, turno).

    CTE espelha `getLatestSnapshotsByZone` em lib/model/repository.ts:193.
    Mesmo índice usado (`ix_snap_lookup`); plan deve ser index-only.
    `pct_apurado` volta como Decimal/None → convertemos para float.
    """
    sql = """
        WITH ranked AS (
            SELECT
                uf,
                cod_zona,
                pct_apurado,
                payload,
                ROW_NUMBER() OVER (
                    PARTITION BY uf, cod_zona
                    ORDER BY ts DESC, id DESC
                ) AS rn
            FROM snapshots
            WHERE cargo = %s AND turno = %s
        )
        SELECT uf, cod_zona, pct_apurado, payload
        FROM ranked
        WHERE rn = 1
    """
    with conn.cursor() as cur:
        cur.execute(sql, (cargo, turno))
        rows = cur.fetchall()
    return [
        {
            "uf": r[0],
            "cod_zona": r[1],
            "pct_apurado": float(r[2]) if r[2] is not None else 0.0,
            "payload": r[3],
        }
        for r in rows
    ]


def fetch_historical_2022(conn, cargo: int, turno: int) -> list[HistoricalRow]:
    """Resultados 2022 por (uf, cod_zona, cod_candidato) para o cargo/turno.

    `pct_validos` é o ponto de partida do swing (T06). Pode vir NULL para
    zonas históricas sem apuração efetiva — preservamos como None.
    """
    sql = """
        SELECT uf, cod_zona, cod_candidato, pct_validos, partido
        FROM historical_results
        WHERE ano = 2022 AND cargo = %s AND turno = %s
    """
    with conn.cursor() as cur:
        cur.execute(sql, (cargo, turno))
        rows = cur.fetchall()
    return [
        {
            "uf": r[0],
            "cod_zona": r[1],
            "cod_candidato": r[2],
            "pct_validos": float(r[3]) if r[3] is not None else None,
            "partido": r[4],
        }
        for r in rows
    ]


def fetch_eleitorado(conn, ano: int = 2026) -> dict[tuple[str, int], int]:
    """Eleitores aptos por (uf, cod_zona). Chave tuple para lookup O(1)."""
    sql = "SELECT uf, cod_zona, eleitores_aptos FROM eleitorado WHERE ano = %s"
    with conn.cursor() as cur:
        cur.execute(sql, (ano,))
        rows = cur.fetchall()
    return {(r[0], r[1]): int(r[2]) for r in rows}


def insert_projections(conn, rows: list[dict[str, Any]]) -> int:
    """INSERT em projections (append-only — constituição § 10).

    Zero ON CONFLICT, zero UPDATE — re-execução gera linhas novas com `ts`
    distinto (defaultNow no schema). `executemany` em uma transação única;
    a transação é commitada pelo caller via `with conn:`.

    Retorna número de linhas inseridas (== len(rows)) para o response.
    """
    if not rows:
        return 0
    sql = """
        INSERT INTO projections (
            cargo, turno, uf, candidato_id,
            votos_projetados, pct_projetado,
            pct_projetado_lower, pct_projetado_upper,
            p_vitoria, pct_apurado
        ) VALUES (
            %(cargo)s, %(turno)s, %(uf)s, %(candidato_id)s,
            %(votos_projetados)s, %(pct_projetado)s,
            %(pct_projetado_lower)s, %(pct_projetado_upper)s,
            %(p_vitoria)s, %(pct_apurado)s
        )
    """
    with conn.cursor() as cur:
        cur.executemany(sql, rows)
    return len(rows)


# ---------------------------------------------------------------------------
# Compute pipeline — cola T06..T11 (RF-011..RF-018)
# ---------------------------------------------------------------------------


def _extract_zone_candidate_pcts(payload: Any) -> dict[int, float]:
    """Extrai `{cod_candidato: pct_validos}` do payload EA20 de uma zona.

    Payload EA20 (parseado em lib/tse/ea20-schema.ts) tem `cand[]` com
    `n` (cod_candidato) e `pvap` (% sobre válidos, em string '0,00' BR-format
    ou já normalizado). Tolerante: se o payload vier em outro formato
    inesperado, retorna {} — a zona será excluída do swing.
    """
    if not isinstance(payload, dict):
        return {}
    cand_list = payload.get("cand")
    if not isinstance(cand_list, list):
        return {}

    out: dict[int, float] = {}
    for c in cand_list:
        if not isinstance(c, dict):
            continue
        try:
            cod = int(c.get("n"))
        except (TypeError, ValueError):
            continue
        raw = c.get("pvap")
        if raw is None:
            continue
        # EA20 normalmente entrega como string BR ("12,34"); aceitamos float também.
        try:
            if isinstance(raw, str):
                # Aceita "12,34" (BR) e "12.34" (canônico).
                pct = float(raw.replace(",", "."))
            else:
                pct = float(raw)
        except (TypeError, ValueError):
            continue
        # pvap vem em escala 0-100 — converter para fração [0,1] como T06 espera.
        out[cod] = pct / 100.0
    return out


def build_candidate_to_partido_2022(
    historical: list[HistoricalRow],
) -> dict[int, str | None]:
    """Mapping `cod_candidato_2022 -> partido_2022`.

    Usado para `is_candidate_unmappable` (K-1) — quem não tem partido mapeado
    no histórico recebe modelo desabilitado. Em produção real, o caller
    fornece um mapping CANDIDATO_2026 -> bloco_2022. Aqui usamos o histórico
    direto como aproximação até o mapping cross-edição existir.
    """
    out: dict[int, str | None] = {}
    for h in historical:
        cod = int(h["cod_candidato"])
        if cod not in out:
            out[cod] = h.get("partido")
    return out


def compute_uf_projections(
    cargo: int,
    turno: int,
    seed_base: int,
    snapshots: list[LatestSnapshot],
    historical: list[HistoricalRow],
    eleitorado: dict[tuple[str, int], int],
) -> tuple[list[dict[str, Any]], dict[str, dict[int, np.ndarray]]]:
    """Roda swing → projeção → bootstrap por (UF, candidato).

    Retorna tupla:
        - `rows`: lista pronta para insert_projections (uma linha por
                  uf × candidato com point/CI).
        - `estimates_by_uf`: `{uf: {cod_candidato: ndarray}}` reusado pelo
                              cálculo nacional (evita rebootstrap).

    Estratégia de seed (constituição § 6):
      Cada combinação (uf, candidato) recebe seed = seed_base XOR hash(uf,cand)
      para reprodutibilidade dentro do ciclo SEM correlacionar bootstraps de
      candidatos diferentes (que comparariam idênticos se compartilhassem seed).
    """
    # Index histórico por (uf, cod_zona, cod_candidato) → pct_validos
    hist_idx: dict[tuple[str, int, int], float] = {}
    for h in historical:
        if h["pct_validos"] is None:
            continue
        hist_idx[(h["uf"], h["cod_zona"], h["cod_candidato"])] = h["pct_validos"]

    # Index histórico nacional UF → cod_candidato → pct (média ponderada 2022)
    # Para project_uf precisamos de p_2022(UF) por candidato. Computamos como
    # média ponderada pelos eleitores aptos das zonas com pct_validos != null.
    uf_2022: dict[tuple[str, int], float] = {}  # (uf, cand) -> p_2022_uf
    weight_idx: dict[tuple[str, int], float] = {}  # (uf, cand) -> peso total

    for h in historical:
        if h["pct_validos"] is None:
            continue
        key = (h["uf"], h["cod_candidato"])
        w = eleitorado.get((h["uf"], h["cod_zona"]), 0)
        if w <= 0:
            continue
        uf_2022[key] = uf_2022.get(key, 0.0) + h["pct_validos"] * w
        weight_idx[key] = weight_idx.get(key, 0.0) + w

    p_2022_uf: dict[tuple[str, int], float] = {
        k: v / weight_idx[k] for k, v in uf_2022.items() if weight_idx[k] > 0
    }

    # Agrupa snapshots por UF.
    snaps_by_uf: dict[str, list[LatestSnapshot]] = {}
    for s in snapshots:
        snaps_by_uf.setdefault(s["uf"], []).append(s)

    # Conjunto de candidatos por UF: união dos cod_candidato vistos em
    # snapshots + histórico.
    rows: list[dict[str, Any]] = []
    estimates_by_uf: dict[str, dict[int, np.ndarray]] = {}

    for uf, snaps in snaps_by_uf.items():
        # Candidatos com presença no payload TSE atual desta UF.
        candidates_now: set[int] = set()
        # Por candidato: lista de (cod_zona, p_now)
        per_cand_zones: dict[int, list[tuple[int, float]]] = {}
        # pct_apurado médio ponderado da UF (para RF-018 inflate <5%).
        uf_pct_apurado_num = 0.0
        uf_pct_apurado_den = 0.0
        for s in snaps:
            zone_pcts = _extract_zone_candidate_pcts(s["payload"])
            w = eleitorado.get((uf, s["cod_zona"]), 0)
            if w > 0:
                uf_pct_apurado_num += s["pct_apurado"] * w
                uf_pct_apurado_den += w
            for cand, pct_now in zone_pcts.items():
                candidates_now.add(cand)
                per_cand_zones.setdefault(cand, []).append((s["cod_zona"], pct_now))

        uf_pct_apurado = (
            uf_pct_apurado_num / uf_pct_apurado_den if uf_pct_apurado_den > 0 else 0.0
        )

        # Candidatos do histórico nesta UF também devem entrar — se não
        # apareceram no snapshot, ainda projetamos via p_2022 (UF 0% apurada
        # do ponto de vista desse candidato).
        candidates_hist: set[int] = {
            h["cod_candidato"] for h in historical if h["uf"] == uf
        }
        all_candidates = candidates_now | candidates_hist

        estimates_by_uf[uf] = {}

        for cand in sorted(all_candidates):
            p_2022 = p_2022_uf.get((uf, cand))
            if p_2022 is None:
                # K-1: candidato sem histórico mapeável nessa UF.
                continue

            # Swing por zona para este candidato.
            zones_with_swing: list[dict[str, Any]] = []
            for cod_zona, p_now in per_cand_zones.get(cand, []):
                p_2022_zone = hist_idx.get((uf, cod_zona, cand))
                sw = swing_zone(p_now, p_2022_zone)
                if sw is None:
                    continue
                w = eleitorado.get((uf, cod_zona), 0)
                if w <= 0:
                    continue
                zones_with_swing.append(
                    {"cod_zona": cod_zona, "swing": sw, "weight": w}
                )

            if not zones_with_swing:
                # RF-017: UF 0% apurada para esse candidato → CI ±10pp em torno de p_2022.
                inflated = inflate_ci_zero_apurado(p_2022)
                point = inflated["point"]
                ci_lower = inflated["ci_lower"]
                ci_upper = inflated["ci_upper"]
                # Sem estimates — usamos amostra degenerada constante para
                # comparações pareadas no cálculo nacional.
                estimates_by_uf[uf][cand] = np.full(1000, point, dtype=np.float64)
            else:
                # Seed específico por (uf, candidato) para descorrelacionar
                # bootstraps entre candidatos preservando reprodutibilidade.
                local_seed = (
                    seed_base
                    ^ int(
                        hashlib.sha256(f"{uf}:{cand}".encode("utf-8")).hexdigest()[:8],
                        16,
                    )
                ) & 0xFFFFFFFF

                # T07: swing agregado da UF (média ponderada das zonas).
                swing_value = swing_uf(
                    [{"cod_zona": z["cod_zona"], "swing": z["swing"]} for z in zones_with_swing],
                    {(uf, z["cod_zona"])[1]: z["weight"] for z in zones_with_swing},
                )
                if swing_value is None:
                    inflated = inflate_ci_zero_apurado(p_2022)
                    point = inflated["point"]
                    ci_lower = inflated["ci_lower"]
                    ci_upper = inflated["ci_upper"]
                    estimates_by_uf[uf][cand] = np.full(1000, point, dtype=np.float64)
                else:
                    # T08: projeção pontual.
                    point_proj = project_uf(p_2022, swing_value)

                    # T09: bootstrap para CI95.
                    boot = bootstrap_uf(
                        zones_with_swing, p_2022_uf=p_2022, seed=local_seed
                    )
                    point = boot["point"]
                    ci_lower = boot["ci_lower"]
                    ci_upper = boot["ci_upper"]
                    estimates_by_uf[uf][cand] = boot["estimates"]

                    # T08 dá o point "oficial" via swing aggregado; bootstrap
                    # devolve mean(estimates) que coincide modulo flutuação.
                    # Preferimos point_proj (determinístico) para a coluna
                    # `pct_projetado` e mantemos boot["point"] como centro de CI.
                    point = point_proj

                    # T11: RF-018 — se pct_apurado < 5%, inflar CI 1.5x.
                    inflated = inflate_ci_low_apurado(
                        {"point": point, "ci_lower": ci_lower, "ci_upper": ci_upper},
                        uf_pct_apurado,
                    )
                    point = inflated["point"]
                    ci_lower = inflated["ci_lower"]
                    ci_upper = inflated["ci_upper"]

            # p_vitoria por UF não faz sentido (é métrica nacional); deixamos
            # None na linha UF e o caller agrega no nacional.
            rows.append(
                {
                    "cargo": cargo,
                    "turno": turno,
                    "uf": uf,
                    "candidato_id": cand,
                    "votos_projetados": None,
                    "pct_projetado": float(point),
                    "pct_projetado_lower": float(ci_lower),
                    "pct_projetado_upper": float(ci_upper),
                    "p_vitoria": None,
                    "pct_apurado": float(uf_pct_apurado),
                }
            )

    return rows, estimates_by_uf


def compute_national(
    cargo: int,
    turno: int,
    estimates_by_uf: dict[str, dict[int, np.ndarray]],
    eleitorado_total_by_uf: dict[str, int],
) -> tuple[list[dict[str, Any]], float]:
    """Agrega estimates UF → nacional ponderado pelo eleitorado da UF.

    Para cada candidato `c`:
        national_estimates[c] = Σ_uf (estimates[uf][c] * eleitorado[uf]) / Σ eleitorado
    O array nacional preserva o pareamento por índice de resample (constituição
    § 6), permitindo comparação A vs B em `p_vitoria` (T10).

    Retorna:
        - `rows`: linhas nacionais (uma por candidato).
        - `p_vitoria_a`: probabilidade do candidato com menor cod (A) vencer
                        o segundo (B). Se <2 candidatos → 1.0 ou 0.0.
    """
    # Reúne candidatos vistos.
    all_candidates: set[int] = set()
    for cand_map in estimates_by_uf.values():
        all_candidates.update(cand_map.keys())

    if not all_candidates:
        return [], 0.0

    # Determina shape do array nacional pelo primeiro estimates não vazio.
    sample_arr: np.ndarray | None = None
    for cand_map in estimates_by_uf.values():
        for arr in cand_map.values():
            sample_arr = arr
            break
        if sample_arr is not None:
            break
    if sample_arr is None:
        return [], 0.0

    n_resamples = sample_arr.shape[0]

    national_estimates: dict[int, np.ndarray] = {}
    total_eleitorado = sum(eleitorado_total_by_uf.values())
    if total_eleitorado <= 0:
        return [], 0.0

    for cand in all_candidates:
        agg = np.zeros(n_resamples, dtype=np.float64)
        weight_sum = 0
        for uf, cand_map in estimates_by_uf.items():
            arr = cand_map.get(cand)
            if arr is None:
                continue
            w = eleitorado_total_by_uf.get(uf, 0)
            if w <= 0:
                continue
            agg += arr * w
            weight_sum += w
        if weight_sum > 0:
            national_estimates[cand] = agg / weight_sum

    # Ordenação canônica: A = menor cod, B = segundo menor.
    ordered = sorted(national_estimates.keys())
    cand_a = ordered[0]
    cand_b = ordered[1] if len(ordered) >= 2 else None

    p_a = (
        p_vitoria(national_estimates[cand_a], national_estimates[cand_b])
        if cand_b is not None
        else 1.0
    )

    rows: list[dict[str, Any]] = []
    for cand, arr in national_estimates.items():
        point = float(np.mean(arr))
        ci_lower = float(np.percentile(arr, 2.5))
        ci_upper = float(np.percentile(arr, 97.5))
        # p_vitoria por candidato: vs o melhor adversário (max dos outros).
        if len(ordered) >= 2:
            others_max = np.max(
                np.stack(
                    [national_estimates[c] for c in ordered if c != cand], axis=0
                ),
                axis=0,
            )
            pv = float(np.mean(arr > others_max))
        else:
            pv = 1.0
        rows.append(
            {
                "cargo": cargo,
                "turno": turno,
                "uf": None,  # NULL = nacional
                "candidato_id": cand,
                "votos_projetados": None,
                "pct_projetado": point,
                "pct_projetado_lower": ci_lower,
                "pct_projetado_upper": ci_upper,
                "p_vitoria": pv,
                "pct_apurado": None,
            }
        )

    return rows, p_a


# ---------------------------------------------------------------------------
# Edge Config publication (T16b — Fase 5)
# ---------------------------------------------------------------------------


def _needle_band(position: float) -> str:
    """Mapeia `needle_position` em [-1, 1] para uma das 7 bandas do contrato TS.

    Bordas espelham `api/model/p_vitoria.py` (T10) e `lib/edge-config/types.ts`
    `NeedleBand`. Mantemos um helper local porque `p_vitoria.needle_position`
    devolve `(position, band)` apenas pra um cenário nacional binário; aqui
    cobrimos qualquer entrada com clip + bandas explícitas.
    """
    p = max(-1.0, min(1.0, position))
    if p >= 0.85:
        return "very_likely_a"
    if p >= 0.50:
        return "likely_a"
    if p >= 0.20:
        return "lean_a"
    if p > -0.20:
        return "tossup"
    if p > -0.50:
        return "lean_b"
    if p > -0.85:
        return "likely_b"
    return "very_likely_b"


def _resolve_internal_base_url() -> str:
    """Base URL para o endpoint Node `/api/_internal/edge-write`.

    Mesma estratégia do lado TS: env explícita > VERCEL_URL > localhost.
    """
    explicit = os.environ.get("INTERNAL_BASE_URL")
    if explicit:
        return explicit.rstrip("/")
    vercel_url = os.environ.get("VERCEL_URL")
    if vercel_url:
        return f"https://{vercel_url}"
    port = os.environ.get("PORT", "3000")
    return f"http://localhost:{port}"


def build_edge_payload(
    cargo: int,
    turno: int,
    ts_iso: str,
    uf_rows: list[dict[str, Any]],
    national_rows: list[dict[str, Any]],
    eleitorado_total_by_uf: dict[str, int],
) -> dict[str, Any]:
    """Monta o shape canônico `EdgePayload` (lib/edge-config/types.ts).

    v1 (S03):
      - `national.candidatos[]` — usa `national_rows` com defaults para nome/
        partido/cor (não temos catálogo de candidatos 2026 ingerido ainda).
        T16+ ou spec 011 substitui os defaults por dados reais.
      - `por_uf[]` — uma linha por UF presente em `uf_rows`. `lider`, `margem*`,
        `chamada`, `swing_vs_2022` v1 são heurística simples:
          lider = candidato_id com maior `pct_projetado` na UF;
          margem_atual = margem_projetada = top - 2º top (pp);
          margem_projetada_ci = [margem - 5, margem + 5] (aprox; refinar S04);
          chamada = margem_projetada > 10 (regra placeholder);
          swing_vs_2022 = 0.0 v1.
      - `insights[]` = [] (spec 011 vai preencher templates determinísticos).
      - `composition` = {pre_election: 0, model: 1, actual_results: 0} (v1
        placeholder; spec 008 vai ponderar pelas 3 fontes).
      - `pct_apurado_total` = média ponderada pelo eleitorado UF.
      - `ufs_apuradas` = contagem de UFs com `pct_apurado > 0`.
    """
    # Index UF rows por (uf, candidato).
    uf_by_sigla: dict[str, list[dict[str, Any]]] = {}
    for r in uf_rows:
        if r.get("uf") is None:
            continue
        uf_by_sigla.setdefault(r["uf"], []).append(r)

    # pct_apurado_total ponderado pelo eleitorado.
    pct_total_num = 0.0
    pct_total_den = 0.0
    ufs_apuradas = 0
    for sigla, rows in uf_by_sigla.items():
        # rows são por candidato — pct_apurado vem repetido (é da UF, não do
        # candidato). Usa o primeiro.
        pct_uf = float(rows[0].get("pct_apurado") or 0.0)
        if pct_uf > 0:
            ufs_apuradas += 1
        w = eleitorado_total_by_uf.get(sigla, 0)
        if w > 0:
            pct_total_num += pct_uf * w
            pct_total_den += w
    pct_apurado_total = (
        pct_total_num / pct_total_den if pct_total_den > 0 else 0.0
    )

    # Bloco nacional — candidatos.
    national_candidatos: list[dict[str, Any]] = []
    sorted_national = sorted(national_rows, key=lambda r: r["candidato_id"])
    for r in sorted_national:
        national_candidatos.append(
            {
                "id": int(r["candidato_id"]),
                "nome": f"Candidato {r['candidato_id']}",
                "partido": "—",
                # Token semântico do design system (constituição § 2): NUNCA
                # hex literal — front-end resolve via CSS var (`var(--c-...)`).
                # v1 alterna entre 2 tokens neutros estáveis.
                "cor": "color-candidate-a" if r["candidato_id"] % 2 == 0 else "color-candidate-b",
                "votos_atuais": 0,
                "votos_projetados": int(r.get("votos_projetados") or 0),
                "pct_atual": 0.0,
                "pct_projetado": float(r.get("pct_projetado") or 0.0),
                "pct_projetado_lower": float(r.get("pct_projetado_lower") or 0.0),
                "pct_projetado_upper": float(r.get("pct_projetado_upper") or 0.0),
                "p_vitoria": float(r.get("p_vitoria") or 0.0),
            }
        )

    # Needle nacional — usa p_vitoria do top-1 mapeada para [-1, 1].
    # `position = 2 * p_a - 1`: p=0.5 → 0 (tossup), p=1 → +1, p=0 → -1.
    if national_candidatos:
        p_a = national_candidatos[0]["p_vitoria"]
        needle_position = 2.0 * p_a - 1.0
    else:
        needle_position = 0.0
    needle_band = _needle_band(needle_position)

    # por_uf — agrega por UF.
    por_uf: list[dict[str, Any]] = []
    for sigla in sorted(uf_by_sigla.keys()):
        rows = uf_by_sigla[sigla]
        # Ordena por pct_projetado desc para identificar líder + 2º.
        ordered = sorted(rows, key=lambda r: float(r.get("pct_projetado") or 0.0), reverse=True)
        top = ordered[0]
        second_pct = float(ordered[1].get("pct_projetado") or 0.0) if len(ordered) > 1 else 0.0
        top_pct = float(top.get("pct_projetado") or 0.0)
        margem = top_pct - second_pct
        ci_lower = float(top.get("pct_projetado_lower") or top_pct) - second_pct
        ci_upper = float(top.get("pct_projetado_upper") or top_pct) - second_pct
        por_uf.append(
            {
                "sigla": sigla,
                "pct_apurado": float(top.get("pct_apurado") or 0.0),
                "lider": int(top["candidato_id"]),
                "margem_atual": float(margem),
                "margem_projetada": float(margem),
                "margem_projetada_ci": [float(ci_lower), float(ci_upper)],
                # Placeholder v1: regra simples até spec de "chamada" definitiva.
                "chamada": margem > 10.0,
                "swing_vs_2022": 0.0,
            }
        )

    return {
        "ts": ts_iso,
        "cargo": int(cargo),
        "turno": int(turno),
        "pct_apurado_total": float(pct_apurado_total),
        "ufs_apuradas": int(ufs_apuradas),
        "national": {
            "candidatos": national_candidatos,
            "needle_position": float(needle_position),
            "needle_band": needle_band,
        },
        "por_uf": por_uf,
        "insights": [],
        "composition": {
            "pre_election": 0.0,
            "model": 1.0,
            "actual_results": 0.0,
        },
    }


def post_edge_write(payload: dict[str, Any]) -> None:
    """POST `/api/_internal/edge-write` com `{payload}`.

    Best-effort:
      - Sem `MODEL_SECRET` em ambiente → log warn e retorna (no-op).
      - Erro HTTP / rede → log warn e retorna (não levanta). O Postgres
        (`projections`) já é fonte de verdade; o Edge Config se ressincroniza
        no próximo ciclo de 60s.
    Por que stdlib `urllib.request` em vez de `httpx`?
      - Sem dep nova (mantém `requirements.txt` enxuto: numpy + pydantic).
      - Body é JSON simples, sem necessidade de connection pooling (uma
        chamada por ciclo de modelo).
      - `urllib` em Python 3.14 já tem TLS e timeouts (`timeout` kwarg).
    """
    secret = os.environ.get("MODEL_SECRET")
    if not secret:
        _log("warn", "edge-write skipped — MODEL_SECRET ausente")
        return

    base = _resolve_internal_base_url()
    url = f"{base}/api/_internal/edge-write"

    body = json.dumps({"payload": payload}, default=str).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-model-secret": secret,
        },
    )

    try:
        # 10s timeout: writeProjection escreve ~28 chaves em paralelo (~1-3s
        # típico); 10s deixa margem para cold-start do endpoint Node.
        with urllib.request.urlopen(req, timeout=10) as response:
            status = response.status
            if status < 200 or status >= 300:
                _log(
                    "warn",
                    "edge-write non-2xx",
                    status=status,
                    url=url,
                )
            else:
                _log("info", "edge-write ok", status=status, url=url)
    except urllib.error.HTTPError as exc:
        # Endpoint respondeu HTTP de erro — log estruturado, não propaga.
        _log(
            "warn",
            "edge-write http error",
            status=exc.code,
            reason=str(exc.reason),
            url=url,
        )
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        _log("warn", "edge-write network error", error=str(exc), url=url)


# ---------------------------------------------------------------------------
# HTTP handler — Vercel Python entrypoint
# ---------------------------------------------------------------------------


def _do_project(body_bytes: bytes) -> tuple[int, dict[str, Any]]:
    """Lógica POST sem I/O HTTP — testável diretamente.

    Retorna `(status, payload)`. O handler HTTP serializa.
    """
    t0 = time.perf_counter_ns()

    # 1. Parse + validate body.
    try:
        req = ProjectRequest.model_validate_json(body_bytes)
    except ValidationError as e:
        return 400, {"error": "invalid_body", "detail": e.errors()}
    except json.JSONDecodeError as e:
        return 400, {"error": "invalid_json", "detail": str(e)}

    # 2. Seed determinístico (constituição § 6).
    seed_base = derive_seed(req.cargo, req.turno, req.trigger_ts)

    # 3. DB query + compute + persist (tudo em uma transação).
    try:
        with _open_conn() as conn:
            snapshots = fetch_snapshots(conn, req.cargo, req.turno)
            historical = fetch_historical_2022(conn, req.cargo, req.turno)
            eleitorado = fetch_eleitorado(conn, ano=2026)

            if not snapshots:
                _log(
                    "warn",
                    "sem snapshots para cargo/turno — modelo nao executa",
                    cargo=req.cargo,
                    turno=req.turno,
                )
                duration_ms = (time.perf_counter_ns() - t0) // 1_000_000
                return 200, ProjectResponse(
                    computed=False,
                    uf_count=0,
                    national_p_vitoria_a=0.0,
                    computed_duration_ms=int(duration_ms),
                ).model_dump()

            # Eleitorado total por UF (para a agregação nacional).
            eleitorado_total_by_uf: dict[str, int] = {}
            for (uf, _z), aptos in eleitorado.items():
                eleitorado_total_by_uf[uf] = eleitorado_total_by_uf.get(uf, 0) + aptos

            uf_rows, estimates_by_uf = compute_uf_projections(
                cargo=req.cargo,
                turno=req.turno,
                seed_base=seed_base,
                snapshots=snapshots,
                historical=historical,
                eleitorado=eleitorado,
            )

            national_rows, national_p_a = compute_national(
                cargo=req.cargo,
                turno=req.turno,
                estimates_by_uf=estimates_by_uf,
                eleitorado_total_by_uf=eleitorado_total_by_uf,
            )

            # Persistência append-only (constituição § 10).
            insert_projections(conn, uf_rows + national_rows)
            conn.commit()

            uf_count = len(estimates_by_uf)

        # Publicação no Edge Config — best-effort, fora da transação do DB.
        # Falha aqui não desfaz `projections` (fonte de verdade) — o
        # próximo ciclo do cron ressincroniza em <60s.
        ts_iso = datetime.now(timezone.utc).isoformat()
        try:
            edge_payload = build_edge_payload(
                cargo=req.cargo,
                turno=req.turno,
                ts_iso=ts_iso,
                uf_rows=uf_rows,
                national_rows=national_rows,
                eleitorado_total_by_uf=eleitorado_total_by_uf,
            )
            post_edge_write(edge_payload)
        except Exception as edge_exc:  # noqa: BLE001 — never block the response
            _log(
                "warn",
                "edge-write block failed",
                error=str(edge_exc),
                cargo=req.cargo,
                turno=req.turno,
            )
    except Exception as exc:  # noqa: BLE001 — converter para 500 estruturado
        trace_id = uuid.uuid4().hex[:12]
        _log(
            "error",
            "model_project_failed",
            trace_id=trace_id,
            error=str(exc),
            traceback=traceback.format_exc(),
        )
        return 500, {"error": "internal_error", "trace_id": trace_id}

    duration_ms = (time.perf_counter_ns() - t0) // 1_000_000

    _log(
        "info",
        "model_project_ok",
        cargo=req.cargo,
        turno=req.turno,
        uf_count=uf_count,
        national_p_vitoria_a=national_p_a,
        duration_ms=int(duration_ms),
    )

    return 200, ProjectResponse(
        computed=True,
        uf_count=uf_count,
        national_p_vitoria_a=float(national_p_a),
        computed_duration_ms=int(duration_ms),
    ).model_dump()


class handler(BaseHTTPRequestHandler):
    """Vercel Python serverless handler.

    Convenção Vercel: classe nomeada `handler` herdando de
    `BaseHTTPRequestHandler` é detectada como entrypoint da function.
    """

    def do_GET(self) -> None:
        """Health check — útil pra validar deploy preview com curl."""
        self._send_json(200, {"ok": True, "method": "GET", "service": "model"})

    def do_POST(self) -> None:
        """Orchestrator T12 — projeção end-to-end."""
        # 1. Auth — header x-model-secret == MODEL_SECRET.
        expected = os.environ.get("MODEL_SECRET")
        if not expected:
            self._send_json(500, {"error": "misconfigured"})
            return
        provided = self.headers.get("x-model-secret")
        if provided != expected:
            self._send_json(401, {"error": "unauthorized"})
            return

        # 2. Lê body.
        length = int(self.headers.get("Content-Length") or "0")
        body = self.rfile.read(length) if length > 0 else b""

        # 3. Delega para função pura (testável).
        status, payload = _do_project(body)
        self._send_json(status, payload)

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        """Silencia logs default do BaseHTTPRequestHandler (usamos _log)."""
        return

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
