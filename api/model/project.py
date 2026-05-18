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

    `national_p_vitoria_a` = P(líder vence segundo lugar), onde "líder" e
    "segundo lugar" são determinados pelo `pct_projetado` agregado nacional
    (mean dos bootstrap estimates). Sempre ∈ [0.5, 1.0] no caso típico
    (líder por definição tem mais votos esperados; flutuação de resamples
    pode aproximar de 0.5 em tossup). Quando só há 1 candidato → 1.0; zero
    candidatos → 0.0.

    `candidato_a_id` / `candidato_b_id`: ids do líder e do segundo, para o
    consumidor TS resolver nome/cor/partido sem precisar ordenar de novo.
    `None` quando há menos de 2 candidatos com estimates válidas.

    Por que mudou (S04 carry-over #1 da retro S03): a versão anterior
    definia A = menor `candidato_id`, o que invertia a agulha quando o id
    do PT > id do PL (replay 2022 com Ciro=3022112 < Lula=3022113 gerou
    `p_vitoria_a` ≈ 0). Agora "A" é sempre o líder semântico.
    """

    computed: bool
    uf_count: int
    national_p_vitoria_a: float
    candidato_a_id: int | None = None
    candidato_b_id: int | None = None
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


def fetch_zona_municipio(conn) -> dict[int, dict[str, Any]]:
    """Mapa `cod_zona -> {cod_ibge, cod_municipio_tse, nome, uf,
    mesorregiao_cod, mesorregiao_nome}`.

    Junta `zonas` (que tem `cod_municipio_tse`) com `municipios` (que tem
    `cod_ibge`, `nome` e — desde S06/F4d migration 0005 — `mesorregiao_cod`)
    e `mesorregioes` (S06/F4d, opcional). Usado pelo build de
    `EdgeUfMunicipio` para agregar snapshots zonais em totais municipais
    (S04/F2) e por `aggregate_by_mesorregiao` (S06/F4d).

    `mesorregiao_cod` / `mesorregiao_nome` ficam `None` quando:
      - Migration 0005 não foi aplicada (coluna ainda não existe) → query
        cai pro fallback que omite os 2 campos.
      - Coluna existe mas não está populada (CSV pendente) → LEFT JOIN
        retorna NULL.

    Retorna mapa vazio quando ainda não há dados geográficos carregados
    (dev sem seed) — caller graciosamente produz `municipios: []`.
    """
    # Tenta query enriquecida (S06+). Se falhar (coluna `mesorregiao_cod`
    # ainda não existe), faz fallback pra query original (S04).
    sql_with_meso = """
        SELECT
            z.cod_zona, m.cod_ibge, m.cod_municipio_tse, m.nome, z.uf,
            m.mesorregiao_cod, meso.nome AS mesorregiao_nome
        FROM zonas z
        JOIN municipios m ON m.cod_municipio_tse = z.cod_municipio_tse
        LEFT JOIN mesorregioes meso ON meso.cod = m.mesorregiao_cod
    """
    sql_fallback = """
        SELECT z.cod_zona, m.cod_ibge, m.cod_municipio_tse, m.nome, z.uf
        FROM zonas z
        JOIN municipios m ON m.cod_municipio_tse = z.cod_municipio_tse
    """
    rows: list[Any]
    has_meso_columns = True
    try:
        with conn.cursor() as cur:
            cur.execute(sql_with_meso, ())
            rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001 — pode ser coluna inexistente OU sem seed geo
        _log(
            "info",
            "fetch_zona_municipio meso query failed, trying fallback",
            error=str(exc),
        )
        # Rollback transação (se houver) — psycopg invalida o cursor após erro.
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001 — autocommit ou sem tx
            pass
        has_meso_columns = False
        try:
            with conn.cursor() as cur:
                cur.execute(sql_fallback, ())
                rows = cur.fetchall()
        except Exception as exc2:  # noqa: BLE001 — sem seed geo
            _log("warn", "fetch_zona_municipio fallback failed", error=str(exc2))
            return {}

    out: dict[int, dict[str, Any]] = {}
    for r in rows:
        entry: dict[str, Any] = {
            "cod_ibge": str(r[1]),
            "cod_municipio_tse": int(r[2]),
            "nome": str(r[3]),
            "uf": str(r[4]),
        }
        if has_meso_columns and len(r) >= 7:
            entry["mesorregiao_cod"] = (
                str(r[5]).strip() if r[5] is not None else None
            )
            entry["mesorregiao_nome"] = str(r[6]) if r[6] is not None else None
        else:
            entry["mesorregiao_cod"] = None
            entry["mesorregiao_nome"] = None
        out[int(r[0])] = entry
    return out


def fetch_series_temporais(
    conn,
    cargo: int,
    turno: int,
    window_hours: int = 24,
) -> dict[str, list[dict[str, Any]]]:
    """Lê histórico de `projections` agrupado por (uf, ts) para alimentar
    `EdgeUfSeriesTemporais` (S04/F2).

    Estratégia (constituição § 10 — append-only, leitura pura):
      `SELECT ... FROM projections WHERE cargo=? AND turno=? AND
       ts > NOW() - INTERVAL '<window_hours> hours' ORDER BY uf, ts ASC`

    Cada combinação (uf, ts) tem 1 linha por candidato; do lado de cada `ts`
    pegamos:
      - margem_pp: diferença pct_projetado entre top-2 (≥ 0)
      - p_vitoria: max(p_vitoria) entre candidatos da UF nesse ts
      - turnout: pct_apurado da UF (mesmo valor em todas as linhas do ts)

    p_vitoria a nível UF não existe na tabela `projections` (UF rows têm
    `p_vitoria = NULL`); o que retornamos para o chart RF-041 é a
    `p_vitoria` agregada NACIONAL no mesmo ts — equivalente em
    interpretação ao "como o líder está se saindo no agregado" no momento.
    A consulta abaixo lê tanto rows UF quanto nacional (uf IS NULL) e o
    parser separa-os.

    Retorna `{uf_sigla: [{ts, candidatos: [(id, pct, p_vit_nacional)], pct_apurado}, ...]}`
    ordenado por ts ASC dentro de cada UF. O caller transforma em séries
    finais (margem, p_vitoria, turnout) já filtrando pelo líder da UF.

    Tolerante: erro de query (ex.: coluna ausente) → log warn + dict vazio
    (chart vira placeholder gentil).
    """
    sql = """
        SELECT
            ts,
            uf,
            candidato_id,
            pct_projetado,
            pct_apurado,
            p_vitoria
        FROM projections
        WHERE cargo = %s
          AND turno = %s
          AND ts > NOW() - (%s || ' hours')::interval
        ORDER BY uf NULLS FIRST, ts ASC, candidato_id ASC
    """
    try:
        with conn.cursor() as cur:
            cur.execute(sql, (cargo, turno, str(window_hours)))
            rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001 — sem séries é OK em dev/preview
        _log("warn", "fetch_series_temporais failed", error=str(exc))
        return {}

    # Group by (uf, ts) — uf=None significa agregado nacional.
    # First pass: collect rows.
    by_uf: dict[str | None, dict[str, list[dict[str, Any]]]] = {}
    for ts_val, uf, cand, pct_proj, pct_ap, pv in rows:
        ts_iso = ts_val.isoformat() if hasattr(ts_val, "isoformat") else str(ts_val)
        uf_key = uf if uf is not None else None
        ts_map = by_uf.setdefault(uf_key, {})
        ts_map.setdefault(ts_iso, []).append(
            {
                "candidato_id": int(cand),
                "pct_projetado": float(pct_proj) if pct_proj is not None else 0.0,
                "pct_apurado": float(pct_ap) if pct_ap is not None else 0.0,
                "p_vitoria": float(pv) if pv is not None else None,
            }
        )

    # Indexa p_vitoria nacional por ts → cand_id → p (alimenta chart UF
    # RF-041, já que p_vitoria por UF não é calculado).
    national_pv_by_ts: dict[str, dict[int, float]] = {}
    nat_rows = by_uf.get(None, {})
    for ts_iso, candidates in nat_rows.items():
        cand_map: dict[int, float] = {}
        for c in candidates:
            if c["p_vitoria"] is not None:
                cand_map[c["candidato_id"]] = c["p_vitoria"]
        national_pv_by_ts[ts_iso] = cand_map

    # Produz timeline por UF (não nacional).
    out: dict[str, list[dict[str, Any]]] = {}
    for uf_key, ts_map in by_uf.items():
        if uf_key is None:
            continue
        ordered_ts = sorted(ts_map.keys())  # ASC determinístico
        timeline: list[dict[str, Any]] = []
        for ts_iso in ordered_ts:
            candidates = ts_map[ts_iso]
            # Order desc by pct_projetado, take top-2 for margin.
            ordered_c = sorted(
                candidates, key=lambda c: c["pct_projetado"], reverse=True
            )
            top_pct = ordered_c[0]["pct_projetado"] if ordered_c else 0.0
            second_pct = ordered_c[1]["pct_projetado"] if len(ordered_c) >= 2 else 0.0
            top_cand = ordered_c[0]["candidato_id"] if ordered_c else None
            # pct_apurado é o mesmo nas N linhas do (uf, ts) — pega a 1ª válida.
            pct_apurado_uf = next(
                (c["pct_apurado"] for c in candidates if c["pct_apurado"] > 0.0), 0.0
            )
            # p_vitoria do líder UF olhando para o nacional naquele ts (sufficient
            # approximation para o chart RF-041; refinamento em S05+).
            pv_lider = (
                national_pv_by_ts.get(ts_iso, {}).get(top_cand) if top_cand else None
            )
            timeline.append(
                {
                    "ts": ts_iso,
                    "margem_pp": top_pct - second_pct,
                    "pct_apurado": pct_apurado_uf,
                    "p_vitoria_lider": pv_lider,
                    "lider_id": top_cand,
                }
            )
        out[uf_key] = timeline
    return out


def fetch_municipio_aggregates(
    conn,
    cargo: int,
    turno: int,
) -> dict[tuple[str, int], dict[str, Any]]:
    """Agrega snapshots de zonas em totais por município (S04/F2).

    Retorna `{(uf, cod_municipio_tse): {pct_apurado, votos_por_candidato,
    total_votos}}` para alimentar `EdgeUfMunicipio`.

    Estratégia: pega o snapshot mais recente de cada zona (mesma CTE de
    `fetch_snapshots`) + payload EA20 → soma `cand[].vap` (votos absolutos)
    e `votos_total` por município. `pct_apurado` do município é a média
    ponderada pelo eleitorado das zonas.

    Tolerante: payload sem `vap` (formato antigo) → votos = 0 (chart fica
    sem dados mas não quebra).
    """
    sql = """
        WITH ranked AS (
            SELECT
                s.uf,
                s.cod_zona,
                s.pct_apurado,
                s.votos_total,
                s.payload,
                ROW_NUMBER() OVER (
                    PARTITION BY s.uf, s.cod_zona
                    ORDER BY s.ts DESC, s.id DESC
                ) AS rn
            FROM snapshots s
            WHERE s.cargo = %s AND s.turno = %s
        )
        SELECT r.uf, r.cod_zona, r.pct_apurado, r.votos_total, r.payload,
               z.cod_municipio_tse
        FROM ranked r
        LEFT JOIN zonas z ON z.cod_zona = r.cod_zona
        WHERE r.rn = 1
    """
    try:
        with conn.cursor() as cur:
            cur.execute(sql, (cargo, turno))
            rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001
        _log("warn", "fetch_municipio_aggregates failed", error=str(exc))
        return {}

    # Aggregate per municipio. Envolvemos o loop em try/except porque o
    # FakeCursor em testes pode devolver tuplas com aridade diferente
    # (sem o JOIN com `zonas`) e o `unpacking` levantaria ValueError.
    # Em produção real, o JOIN sempre devolve 6 colunas — captura é
    # defensiva (degrade graceful para municípios vazios).
    agg: dict[tuple[str, int], dict[str, Any]] = {}
    try:
        _iter_rows = list(rows)
    except Exception:  # noqa: BLE001
        return {}
    for row in _iter_rows:
        if len(row) != 6:
            # Cursor antigo OR fixture de teste — graciosamente ignora.
            continue
        uf, _cod_zona, pct_apurado, votos_total, payload, cod_municipio_tse = row
        if cod_municipio_tse is None:
            continue
        key = (str(uf), int(cod_municipio_tse))
        bucket = agg.setdefault(
            key,
            {
                "pct_apurado_sum": 0.0,
                "pct_apurado_count": 0,
                "votos_por_candidato": {},
                "total_votos": 0,
            },
        )
        bucket["pct_apurado_sum"] += float(pct_apurado) if pct_apurado is not None else 0.0
        bucket["pct_apurado_count"] += 1
        if votos_total is not None:
            bucket["total_votos"] += int(votos_total)

        # Extrai votos absolutos por candidato do payload EA20. EA20 `cand[].vap`
        # = votos absolutos (apurado para o candidato). Aceitamos string BR ou
        # int. Quando ausente, ignoramos (não quebra).
        if isinstance(payload, dict):
            cand_list = payload.get("cand")
            if isinstance(cand_list, list):
                for c in cand_list:
                    if not isinstance(c, dict):
                        continue
                    try:
                        cid = int(c.get("n"))
                    except (TypeError, ValueError):
                        continue
                    raw = c.get("vap")
                    if raw is None:
                        continue
                    try:
                        if isinstance(raw, str):
                            votos = int(float(raw.replace(",", ".")))
                        else:
                            votos = int(raw)
                    except (TypeError, ValueError):
                        continue
                    bucket["votos_por_candidato"][cid] = (
                        bucket["votos_por_candidato"].get(cid, 0) + votos
                    )

    # Finaliza pct_apurado como média simples (sem peso de eleitorado aqui,
    # suficiente para display — refinamento em S05+).
    out: dict[tuple[str, int], dict[str, Any]] = {}
    for key, b in agg.items():
        count = b["pct_apurado_count"]
        out[key] = {
            "pct_apurado": b["pct_apurado_sum"] / count if count > 0 else 0.0,
            "votos_por_candidato": b["votos_por_candidato"],
            "total_votos": b["total_votos"],
        }
    return out


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


def compute_p_passa_2t(
    national_estimates: dict[int, np.ndarray],
) -> dict[int, float]:
    """P(candidato termina top-2 no 1º turno) — ADR-0014 (S05/F4c).

    Para cada candidato `c`, conta a frequência empírica nos resamples do
    bootstrap em que `c` aparece entre os 2 maiores valores. Soma das
    `p_passa_2t` é exatamente 2.0 (cada resample contribui com 1 slot
    top-1 e 1 slot top-2), modulo arredondamento.

    Determinismo (§ 6): zero novo random. Reusa o array `estimates` já
    calculado pelo bootstrap. Sem custo significativo extra — uma passada
    O(n_resamples × n_cands * log n_cands) pequena.

    Args:
        national_estimates: `{cand_id: ndarray[shape=(n_resamples,)]}`
            como emitido por `compute_national`.

    Returns:
        `{cand_id: prob}` com prob em [0, 1]. Candidatos ausentes do dict
        recebem 0.0 implicitamente (não estão entre as keys retornadas).
    """
    if not national_estimates:
        return {}
    candidates = sorted(national_estimates.keys())  # ordem determinística
    n = len(candidates)
    if n == 0:
        return {}
    if n == 1:
        # Só 1 candidato — está sempre no top-2 (vacuamente).
        return {candidates[0]: 1.0}

    # Stack: shape (n_cands, n_resamples).
    matrix = np.stack([national_estimates[c] for c in candidates], axis=0)
    n_resamples = matrix.shape[1]

    # Para cada resample, encontra os 2 índices com maiores valores.
    # argpartition é O(n) e suficiente (não precisamos do ranking
    # completo dos n-2 restantes).
    if n == 2:
        # Caso degenerado: ambos os candidatos estão sempre no top-2.
        return {c: 1.0 for c in candidates}

    counts = np.zeros(n, dtype=np.int64)
    # Argpartition retorna índices não ordenados, mas garante que os
    # n-2 menores ficam à esquerda — top-2 fica nas últimas 2 posições.
    top2_idx = np.argpartition(matrix, n - 2, axis=0)[n - 2 :, :]  # shape (2, n_resamples)
    for j in range(n_resamples):
        for k in range(2):
            counts[top2_idx[k, j]] += 1

    return {candidates[i]: float(counts[i]) / float(n_resamples) for i in range(n)}


def compute_p_fecha_1t(
    national_estimates: dict[int, np.ndarray],
) -> dict[int, float]:
    """P(candidato fecha 1T sozinho com >= 50%+1) — ADR-0014 (S05/F4c).

    Para cada candidato `c`, conta a frequência empírica de
    `estimates_c[i] >= 0.50` (fração; 0.50 = 50%) nos resamples.

    Em casos saudáveis (líder estável ≥ 55%), `p_fecha_1t[lider]` cresce
    rapidamente — gatilho do banner "Decidido no 1T se >X%" (RF-030.9).

    Determinismo (§ 6): zero novo random.

    Args:
        national_estimates: `{cand_id: ndarray}` (frações [0, 1]).

    Returns:
        `{cand_id: prob}` em [0, 1].
    """
    out: dict[int, float] = {}
    for cand, arr in national_estimates.items():
        # `arr` está em fração (0–1) — comparar com 0.50 = 50%+1 limite.
        out[cand] = float(np.mean(arr >= 0.50))
    return out


def compute_two_round_scenarios(
    national_estimates: dict[int, np.ndarray],
    _cand_ordered: list[int] | None = None,  # noqa: ARG001 — reservado pra logs/testes
) -> dict[str, Any]:
    """Calcula P(2º turno geral) + top-3 cenários de duelo no 2T — ADR-0014.

    Para cada resample do bootstrap:
      1. Identifica os 2 candidatos com maiores valores (top-2 do resample).
      2. Conta `(par[0], par[1])` na frequência — normalizando o par para
         ordenação canônica (id menor primeiro) evita dupla contagem do
         mesmo duelo.
      3. Conta se algum candidato fechou >= 50%+1 sozinho — `goes_to_2t`
         é o complemento ((max(estimates) < 0.50) nos resamples).

    Retorna:
        {
          "p_segundo_turno_overall": float ∈ [0, 1],
          "cenarios_2t": [{"par": [id_a, id_b], "prob": float}, ...]
            (top-3 ordenado desc por prob; vazio se < 2 candidatos)
        }

    Args:
        national_estimates: `{cand_id: ndarray}` (frações [0, 1]).
        cand_ordered: Lista opcional para deterministic ordering nos
            empates (não usada na contagem; útil pra logs/testes).

    Determinismo (§ 6): zero novo random. Pares são canonicalizados
    (menor id primeiro) para dedupar AB == BA. Top-3 ordenado por prob
    desc, tie-breaker pelo par (id_a, id_b) ASC.
    """
    if not national_estimates or len(national_estimates) < 2:
        return {"p_segundo_turno_overall": 0.0, "cenarios_2t": []}

    candidates = sorted(national_estimates.keys())
    n = len(candidates)
    matrix = np.stack([national_estimates[c] for c in candidates], axis=0)
    n_resamples = matrix.shape[1]

    # P(2T) = P(max(estimates) < 0.50) — ninguém fecha sozinho.
    max_per_resample = np.max(matrix, axis=0)  # shape (n_resamples,)
    p_2t = float(np.mean(max_per_resample < 0.50))

    # Top-3 pares (top-1, top-2 do resample) por frequência.
    # Para cada resample, identifica top-1 e top-2 (índices em `candidates`).
    pair_counts: dict[tuple[int, int], int] = {}
    if n == 2:
        # Único par possível.
        pair = (candidates[0], candidates[1])
        pair_counts[pair] = n_resamples
    else:
        # argpartition n-2 → top-2 ficam nas 2 últimas posições, em ordem
        # arbitrária. Sort dos top-2 por valor desc nos resamples seria
        # mais "real" (top-1 vs top-2 no duelo), mas para contagem do
        # PAR, a ordem dentro do par não importa — canonicalizamos.
        top2_idx = np.argpartition(matrix, n - 2, axis=0)[n - 2 :, :]
        for j in range(n_resamples):
            a_idx = int(top2_idx[0, j])
            b_idx = int(top2_idx[1, j])
            a_id = candidates[a_idx]
            b_id = candidates[b_idx]
            # Canonicaliza par: menor id primeiro (deduplica AB == BA).
            pair = (min(a_id, b_id), max(a_id, b_id))
            pair_counts[pair] = pair_counts.get(pair, 0) + 1

    # Top-3 desc por prob; tie-breaker pelo par ASC.
    sorted_pairs = sorted(
        pair_counts.items(),
        key=lambda kv: (-kv[1], kv[0]),
    )
    top3 = [
        {"par": [pair[0], pair[1]], "prob": float(count) / float(n_resamples)}
        for pair, count in sorted_pairs[:3]
    ]

    return {"p_segundo_turno_overall": p_2t, "cenarios_2t": top3}


def aggregate_national_estimates(
    estimates_by_uf: dict[str, dict[int, np.ndarray]],
    eleitorado_total_by_uf: dict[str, int],
) -> dict[int, np.ndarray]:
    """Agrega `estimates_by_uf` para `{cand_id: ndarray}` nacional.

    Mesma lógica usada internamente em `compute_national`. Extraída em S05/F4c
    para que callers externos (orchestrator) possam alimentar funções
    derivadas como `compute_two_round_scenarios`, `compute_p_passa_2t`,
    `compute_p_fecha_1t` sem duplicar código nem rodar bootstrap extra.

    Determinismo (§ 6): mesma lógica determinística (pesos pelo eleitorado UF,
    sem random). Mesma entrada → mesma saída bit-a-bit.

    Args:
        estimates_by_uf: `{uf: {cand_id: ndarray}}` emitido por
            `compute_uf_projections`.
        eleitorado_total_by_uf: `{uf: int}` (soma de aptos por UF).

    Returns:
        `{cand_id: ndarray}` em fração [0, 1] (espaço do bootstrap).
        Vazio se nenhum candidato tem peso útil.
    """
    all_candidates: set[int] = set()
    for cand_map in estimates_by_uf.values():
        all_candidates.update(cand_map.keys())
    if not all_candidates:
        return {}

    sample_arr: np.ndarray | None = None
    for cand_map in estimates_by_uf.values():
        for arr in cand_map.values():
            sample_arr = arr
            break
        if sample_arr is not None:
            break
    if sample_arr is None:
        return {}

    n_resamples = sample_arr.shape[0]
    national_estimates: dict[int, np.ndarray] = {}

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

    return national_estimates


def compute_national(
    cargo: int,
    turno: int,
    estimates_by_uf: dict[str, dict[int, np.ndarray]],
    eleitorado_total_by_uf: dict[str, int],
) -> tuple[list[dict[str, Any]], float, int | None, int | None]:
    """Agrega estimates UF → nacional ponderado pelo eleitorado da UF.

    Para cada candidato `c`:
        national_estimates[c] = Σ_uf (estimates[uf][c] * eleitorado[uf]) / Σ eleitorado
    O array nacional preserva o pareamento por índice de resample (constituição
    § 6), permitindo comparação A vs B em `p_vitoria` (T10).

    Identificação de "A" e "B" (FIX S04 — carry-over #1 da retro S03):
      A = líder por `mean(estimates_c)` (o `pct_projetado` nacional)
      B = segundo lugar pelo mesmo critério
      Tie-breaker (mesmo pct até 1e-9): `candidato_id` ASCENDENTE — estável
      e reprodutível. Empate exato é raro (somas de floats nunca batem
      exatamente em dataset real); o tie-breaker existe para garantir
      determinismo bit-a-bit em fixtures sintéticas.

      A versão anterior usava A = `min(candidato_id)`, o que invertia a
      agulha quando o id do PT > id do PL (replay 2022 detectou o bug:
      A=Ciro 3022112 < Lula 3022113 → `p_vitoria_a` semanticamente errado).

    Retorna:
        - `rows`: linhas nacionais (uma por candidato; com `p_vitoria`
          individual = P(c > max(outros))).
        - `p_vitoria_a`: P(líder > segundo). Se <2 candidatos → 1.0 ou 0.0.
        - `cand_a_id`: id do líder, ou None se 0 candidatos.
        - `cand_b_id`: id do segundo, ou None se ≤1 candidato.
    """
    # Reúne candidatos vistos.
    all_candidates: set[int] = set()
    for cand_map in estimates_by_uf.values():
        all_candidates.update(cand_map.keys())

    if not all_candidates:
        return [], 0.0, None, None

    # Determina shape do array nacional pelo primeiro estimates não vazio.
    sample_arr: np.ndarray | None = None
    for cand_map in estimates_by_uf.values():
        for arr in cand_map.values():
            sample_arr = arr
            break
        if sample_arr is not None:
            break
    if sample_arr is None:
        return [], 0.0, None, None

    n_resamples = sample_arr.shape[0]

    national_estimates: dict[int, np.ndarray] = {}
    total_eleitorado = sum(eleitorado_total_by_uf.values())
    if total_eleitorado <= 0:
        return [], 0.0, None, None

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

    if not national_estimates:
        return [], 0.0, None, None

    # Ordenação SEMÂNTICA: A = líder por pct_projetado (mean), B = segundo.
    # Tie-breaker estável: candidato_id ASCENDENTE (segundo elemento do tuple).
    # Negate o mean para `sorted` ASC nos dois critérios — Python sorts são
    # estáveis, então (-mean, id) reproduz "pct desc, id asc" determinístico.
    point_by_cand: dict[int, float] = {
        cand: float(np.mean(arr)) for cand, arr in national_estimates.items()
    }
    ordered = sorted(
        national_estimates.keys(),
        key=lambda c: (-point_by_cand[c], c),
    )
    cand_a = ordered[0]
    cand_b = ordered[1] if len(ordered) >= 2 else None

    p_a = (
        p_vitoria(national_estimates[cand_a], national_estimates[cand_b])
        if cand_b is not None
        else 1.0
    )

    # S05/F4c (ADR-0014) — métricas multi-candidato pré-computadas a partir
    # do mesmo `national_estimates`. Zero novo bootstrap, zero random.
    p_passa_2t_by_cand = compute_p_passa_2t(national_estimates)
    p_fecha_1t_by_cand = compute_p_fecha_1t(national_estimates)

    # `rank` semântico por (-point, id) — mesma ordenação do `ordered` acima.
    rank_by_cand: dict[int, int] = {cand: i + 1 for i, cand in enumerate(ordered)}

    rows: list[dict[str, Any]] = []
    for cand, arr in national_estimates.items():
        point = point_by_cand[cand]
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
                # S05/F4c — métricas multi-candidato enriquecidas. Persistem
                # apenas na "memória" do orchestrator; o INSERT em
                # `projections` só usa as colunas declaradas em
                # `insert_projections` — campos extras são ignorados.
                "rank": rank_by_cand.get(cand, 0),
                "p_passa_2t": p_passa_2t_by_cand.get(cand, 0.0),
                "p_fecha_1t": p_fecha_1t_by_cand.get(cand, 0.0),
            }
        )

    return rows, p_a, cand_a, cand_b


# ---------------------------------------------------------------------------
# Mesorregião aggregation (S06/F4d — Fase 2)
# ---------------------------------------------------------------------------


def aggregate_by_mesorregiao(
    uf_row: dict[str, Any],
    municipios: list[dict[str, Any]],
    historical_by_meso: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    """Agrega municípios por mesorregião IBGE — S06/F4d.

    Alimenta o bloco "Apuração por mesorregião" da página
    `/uf/[sigla]/governador` (spec 005, print 3 NYT-style). Determinista:
    pure function de (uf_row, municipios) — pode ser unit-tested sem DB.

    Args:
        uf_row: Linha de `EdgeUfRow` da UF (para identificar UF). Usa só
            `sigla` (pra cross-check) — campos não-críticos.
        municipios: Lista de municípios da UF, enriquecidos com
            `mesorregiao_cod` (4-char string) e `mesorregiao_nome` (str).
            Aceita campos faltantes — município sem `mesorregiao_cod` é
            silenciosamente skipped (forward-compat com Postgres pré-S06
            que ainda não tem a coluna populada). Cada município deve ter:
              - `cod_ibge`: str (debug only)
              - `mesorregiao_cod`: str | None
              - `mesorregiao_nome`: str | None
              - `pct_apurado`: float (0–100)
              - `lider` (dict): `{candidato_id, votos, partido, margem_pp}`
              - `votos_reportados` (dict): `{candidato_id: votos}`
        historical_by_meso: Opcional `{cod_meso: pct_lider_2022}` para
            calcular `delta_vs_2022`. Quando ausente ou cod_meso não está
            no mapa, `delta_vs_2022 = None` (UI mostra "—").

    Returns:
        Lista de mesorregiões da UF — uma entrada por `mesorregiao_cod`
        distinto entre os municípios. Cada entrada:

        ```python
        {
            "nome": str,                       # nome IBGE da mesorregião
            "cod": str,                        # 4-char IBGE code
            "pct_apurado": float,              # média ponderada pelo total_votos
            "lider_candidato_id": int,         # candidato com mais votos agregados
            "lider_pct": float,                # % do líder sobre o total da meso
            "margem": float,                   # margem em pp (lider - 2º)
            "delta_vs_2022": float | None,     # swing pp vs 2022 (ou None)
            "num_municipios": int,             # quantos municípios na meso
        }
        ```

        Ordem determinística (constituição § 6): sort por `cod` ASC.

    Edge cases:
        - `municipios` vazio → `[]`
        - Todos sem `mesorregiao_cod` → `[]` (UI omite o bloco; aceitável
          em dev/preview sem CSV de mesorregião populado)
        - Mesorregião com 0 votos reportados → `pct_apurado = 0`,
          `lider_pct = 0`, `margem = 0`. Líder degenerado: primeiro
          candidato lexicográfico nos `votos_reportados` (estabilidade).
        - 1 município com `lider.candidato_id == 0` (placeholder) → entra
          na agregação normalmente; resultado pode ter `lider_id = 0`.
    """
    # Sanity check (defensivo): se `uf_row` tem sigla, garante consistência
    # com os municípios passados. Não falha — apenas loga. Útil pra pegar
    # bug de orchestrator passando municípios da UF errada.
    expected_uf = uf_row.get("sigla") if isinstance(uf_row, dict) else None
    if expected_uf:
        for m in municipios:
            uf_m = m.get("uf")
            if uf_m and uf_m != expected_uf:
                _log(
                    "warn",
                    "aggregate_by_mesorregiao uf mismatch",
                    expected=expected_uf,
                    found=uf_m,
                    cod_ibge=m.get("cod_ibge"),
                )
                break  # 1 warn é suficiente

    # Agrupa por mesorregiao_cod.
    by_meso: dict[str, dict[str, Any]] = {}
    for m in municipios:
        cod = m.get("mesorregiao_cod")
        if not cod:
            continue
        nome = m.get("mesorregiao_nome") or f"Meso {cod}"
        entry = by_meso.setdefault(
            cod,
            {
                "cod": cod,
                "nome": nome,
                "_votos_por_cand": {},  # cand_id -> votos somados
                "_total_votos": 0,
                "_sum_pct_apurado_x_votos": 0.0,
                "_num_municipios": 0,
            },
        )
        # Soma votos por candidato.
        votos_reportados = m.get("votos_reportados") or {}
        munic_total = 0
        for cand_id, votos in votos_reportados.items():
            v = int(votos)
            entry["_votos_por_cand"][int(cand_id)] = (
                entry["_votos_por_cand"].get(int(cand_id), 0) + v
            )
            munic_total += v
        entry["_total_votos"] += munic_total
        # Média ponderada de pct_apurado pelo total_votos do município
        # (consistência com a UF: município pequeno com 0% apurado e
        # município grande com 90% apurado dá um agregado realista).
        pct_ap = float(m.get("pct_apurado") or 0.0)
        entry["_sum_pct_apurado_x_votos"] += pct_ap * munic_total
        entry["_num_municipios"] += 1

    # Materializa saída.
    out: list[dict[str, Any]] = []
    for cod in sorted(by_meso.keys()):
        e = by_meso[cod]
        total = e["_total_votos"]
        votos_cand = e["_votos_por_cand"]

        if total > 0 and votos_cand:
            # Top-2 por votos absolutos. Tie-break por candidato_id ASC.
            sorted_cands = sorted(
                votos_cand.items(), key=lambda kv: (-kv[1], kv[0])
            )
            lider_id, lider_votos = sorted_cands[0]
            second_votos = sorted_cands[1][1] if len(sorted_cands) >= 2 else 0
            lider_pct = 100.0 * lider_votos / total
            margem = 100.0 * (lider_votos - second_votos) / total
        elif votos_cand:
            # Degenerado: tem cand_id mas total=0 (todos zero). Estável.
            lider_id = min(votos_cand.keys())
            lider_pct = 0.0
            margem = 0.0
        else:
            # Sem votos reportados em nenhum município. Líder degenerado: 0.
            lider_id = 0
            lider_pct = 0.0
            margem = 0.0

        # pct_apurado ponderado pelo total_votos da mesorregião. Se total=0,
        # cai pra média simples dos municípios (preferível a NaN/0).
        if total > 0:
            pct_apurado_meso = e["_sum_pct_apurado_x_votos"] / total
        else:
            # Sem votos ainda — divide pelo número de municípios para
            # evitar 0 absoluto quando alguns têm pct_apurado > 0 mas
            # ninguém reportou votos (caso teórico). Em prática vai dar 0.
            n_munic = e["_num_municipios"]
            pct_apurado_meso = (
                e["_sum_pct_apurado_x_votos"] / max(n_munic, 1) if n_munic else 0.0
            )

        # delta_vs_2022 — opcional.
        if historical_by_meso is not None and cod in historical_by_meso:
            delta = lider_pct - float(historical_by_meso[cod])
        else:
            delta = None

        out.append(
            {
                "nome": e["nome"],
                "cod": cod,
                "pct_apurado": float(pct_apurado_meso),
                "lider_candidato_id": int(lider_id),
                "lider_pct": float(lider_pct),
                "margem": float(margem),
                "delta_vs_2022": float(delta) if delta is not None else None,
                "num_municipios": int(e["_num_municipios"]),
            }
        )

    return out


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


def build_uf_payloads(
    cargo: int,
    turno: int,
    ts_iso: str,
    uf_rows: list[dict[str, Any]],
    national_rows: list[dict[str, Any]],
    municipio_aggregates: dict[tuple[str, int], dict[str, Any]],
    zona_municipio: dict[int, dict[str, Any]],
    series_by_uf: dict[str, list[dict[str, Any]]],
) -> dict[str, dict[str, Any]]:
    """Constrói payloads canônicos `EdgePayloadUf` por UF (S04/F2).

    Adicionado em S04/F2 para enriquecer o drill-down de UF com:
      - candidatos com `votos_atuais` e `votos_projetados` (rateio do
        total UF pelo pct_atual/pct_projetado de cada candidato);
      - lista `municipios` populada (`cod_ibge`, `nome`, `pct_apurado`,
        `lider {id, partido, votos, margem_pp}`, `votos_reportados`);
      - `series_temporais` (margem, p_vitoria, turnout) lidas de
        `projections` ordenadas por ts ASC.

    Retorna `{uf_sigla: EdgePayloadUf}`. Cada payload tem ~5–10 KB em
    UF típica, podendo chegar a 30–40 KB em SP (645 municípios + 480
    pontos × 3 séries). Caller (`writeProjection`) emite warn se passar
    de 450 KB.

    Determinismo (§ 6): municípios ordenados por `cod_ibge` ASC; séries
    ordenadas por ts ASC. Sem entradas aleatórias.

    Tolerância: município sem `cod_ibge` (ainda não seedado) → skip. UF
    sem municípios populados → `municipios: []` (mapa fica vazio mas
    page renderiza).
    """
    # Index uf_rows por (uf, candidato) e por uf-only (1ª row = pct_apurado UF).
    uf_by_sigla: dict[str, list[dict[str, Any]]] = {}
    for r in uf_rows:
        if r.get("uf") is None:
            continue
        uf_by_sigla.setdefault(r["uf"], []).append(r)

    # Dict cand_id → row nacional para resolver partido/cor/nome.
    # S05/F4c (ADR-0013): `rank` populado em national_rows define `--color-cand-N`.
    national_by_id: dict[int, dict[str, Any]] = {
        int(r["candidato_id"]): r for r in national_rows
    }
    # Mapping cand_id → rank canônico para cor.
    rank_by_cand: dict[int, int] = {}
    sorted_nat = sorted(
        national_rows,
        key=lambda r: (-float(r.get("pct_projetado") or 0.0), int(r["candidato_id"])),
    )
    for i, r in enumerate(sorted_nat):
        rank_by_cand[int(r["candidato_id"])] = i + 1

    # Inverte zona_municipio: para cada (uf, cod_municipio_tse) coleta dados.
    # Como `fetch_municipio_aggregates` já agrega por município, reuso direto.
    # Precisamos só mapear (uf, cod_municipio_tse) → cod_ibge + nome
    # (+ mesorregiao_cod/_nome quando disponíveis — S06/F4d).
    munic_meta: dict[tuple[str, int], dict[str, Any]] = {}
    for _zona, z_meta in zona_municipio.items():
        key = (z_meta["uf"], z_meta["cod_municipio_tse"])
        if key not in munic_meta:
            munic_meta[key] = {
                "cod_ibge": z_meta["cod_ibge"],
                "nome": z_meta["nome"],
                "mesorregiao_cod": z_meta.get("mesorregiao_cod"),
                "mesorregiao_nome": z_meta.get("mesorregiao_nome"),
            }

    out: dict[str, dict[str, Any]] = {}
    for sigla in sorted(uf_by_sigla.keys()):
        rows = uf_by_sigla[sigla]
        # pct_apurado é o mesmo em todas as rows da UF.
        pct_apurado_uf = float(rows[0].get("pct_apurado") or 0.0)

        # Total de votos REPORTADOS na UF: soma dos `total_votos` de cada município.
        total_votos_uf = sum(
            agg["total_votos"]
            for (uf, _cod), agg in municipio_aggregates.items()
            if uf == sigla
        )

        # Top-2 por pct_projetado para identificar líder e segundo (estável).
        ordered = sorted(
            rows, key=lambda r: float(r.get("pct_projetado") or 0.0), reverse=True
        )
        top = ordered[0] if ordered else None
        second = ordered[1] if len(ordered) >= 2 else None

        # Margem usada nas séries / display (não vai pra payload aqui — já vem
        # via candidato.pct_projetado).

        # Constrói candidatos: cada candidato da UF + voto absoluto rateado.
        candidatos: list[dict[str, Any]] = []
        for r in ordered:
            cid = int(r["candidato_id"])
            pct_proj = float(r.get("pct_projetado") or 0.0)
            pct_proj_lower = float(r.get("pct_projetado_lower") or pct_proj)
            pct_proj_upper = float(r.get("pct_projetado_upper") or pct_proj)
            # `pct_atual` v1: até spec 008 popular pct_atual real, usamos
            # pct_projetado como aproximação (consistent com o pre-S04/F2
            # behavior). Refinamento: somar votos_reportados[cid] /
            # total_votos_uf para o pct_atual real.
            votos_cand = 0
            for (uf, _cod), agg in municipio_aggregates.items():
                if uf != sigla:
                    continue
                votos_cand += int(agg["votos_por_candidato"].get(cid, 0))
            pct_atual = (
                100.0 * votos_cand / total_votos_uf if total_votos_uf > 0 else 0.0
            )

            # Votos projetados: rateio do eleitorado total UF projetado pelo
            # comparecimento médio histórico. v1: aproximação simples
            # `pct_projetado * total_votos_uf_extrapolated`. Sem dado pré-eleição,
            # usa total_votos_uf como floor (vai aumentando com a apuração).
            # Para a v1, `votos_projetados = pct_projetado/100 * max(total_votos_uf
            # / max(pct_apurado/100, 0.01), total_votos_uf)`. Em UF totalmente
            # apurada o termo de extrapolação == total_votos_uf.
            if pct_apurado_uf > 0:
                # Estima total final pela apuração corrente.
                estimated_total = total_votos_uf / (pct_apurado_uf / 100.0)
            else:
                estimated_total = total_votos_uf
            votos_proj = int(round((pct_proj / 100.0) * estimated_total))

            nat = national_by_id.get(cid, {})
            # S05/F4c (ADR-0013) — paleta visual por rank semântico.
            rank_cand = rank_by_cand.get(cid, len(candidatos) + 1)
            candidatos.append(
                {
                    "id": cid,
                    "nome": f"Candidato {cid}",
                    "partido": str(nat.get("partido", "—")),
                    # CSS var literal — consumida direto em `style={{ background: c.cor }}`
                    # no front-end. Sem `var(...)` o browser ignora silenciosamente.
                    # Tokens canônicos definidos em app/globals.css (constituição § 2).
                    # ADR-0013: paleta dinâmica `--color-cand-{1..11}`.
                    "cor": f"var(--color-cand-{rank_cand})",
                    "votos_atuais": votos_cand,
                    "votos_projetados": votos_proj,
                    "pct_atual": pct_atual,
                    "pct_projetado": pct_proj,
                    "ci95": {
                        "lower": pct_proj_lower,
                        "upper": pct_proj_upper,
                    },
                }
            )

        # Constrói municípios — agregação determinística por cod_ibge.
        # `municipios_for_meso` é a lista enriquecida com mesorregiao_cod/uf
        # usada APENAS para `aggregate_by_mesorregiao` (não vai pro payload).
        municipios_payload: list[dict[str, Any]] = []
        municipios_for_meso: list[dict[str, Any]] = []
        for (uf, cod_tse), agg in municipio_aggregates.items():
            if uf != sigla:
                continue
            meta = munic_meta.get((uf, cod_tse))
            if not meta:
                continue
            votos_por_cand = agg["votos_por_candidato"]
            if not votos_por_cand:
                # Município sem votos reportados — ainda emitimos row para o
                # mapa, mas com lider degenerado.
                lider_id = top["candidato_id"] if top else 0
                lider_votos = 0
                margem_pp = 0.0
                lider_partido = "—"
            else:
                # Top-2 por votos absolutos no município.
                sorted_cands = sorted(
                    votos_por_cand.items(), key=lambda kv: kv[1], reverse=True
                )
                lider_id, lider_votos = sorted_cands[0]
                second_votos = sorted_cands[1][1] if len(sorted_cands) >= 2 else 0
                total_munic = sum(votos_por_cand.values())
                if total_munic > 0:
                    margem_pp = 100.0 * (lider_votos - second_votos) / total_munic
                else:
                    margem_pp = 0.0
                lider_partido = str(national_by_id.get(lider_id, {}).get("partido") or "—")

            votos_reportados_payload = {
                int(k): int(v) for k, v in votos_por_cand.items()
            }
            payload_row = {
                "cod_ibge": meta["cod_ibge"],
                "nome": meta["nome"],
                "pct_apurado": float(agg["pct_apurado"]),
                "lider": {
                    "candidato_id": int(lider_id),
                    "partido": lider_partido,
                    "votos": int(lider_votos),
                    "margem_pp": float(margem_pp),
                },
                "votos_reportados": votos_reportados_payload,
            }
            municipios_payload.append(payload_row)
            # S06/F4d — versão enriquecida pra aggregate_by_mesorregiao.
            municipios_for_meso.append(
                {
                    **payload_row,
                    "uf": uf,
                    "mesorregiao_cod": meta.get("mesorregiao_cod"),
                    "mesorregiao_nome": meta.get("mesorregiao_nome"),
                }
            )
        # Ordem determinística por cod_ibge.
        municipios_payload.sort(key=lambda m: m["cod_ibge"])

        # S06/F4d — agregação por mesorregião. Só inclui no payload se
        # alguma mesorregião pôde ser derivada (≥1 município tem
        # `mesorregiao_cod` não-nulo). Caso contrário, omite o campo
        # `mesorregioes` inteiro (EdgePayloadUf.mesorregioes? é opcional).
        mesorregioes_payload = aggregate_by_mesorregiao(
            uf_row={"sigla": sigla},
            municipios=municipios_for_meso,
            historical_by_meso=None,  # spec 005 v2: enriquecer com 2022
        )

        # Séries temporais — converte timeline em 3 séries (margem, p_vitoria, turnout).
        timeline = series_by_uf.get(sigla, [])
        series_margem = [
            {"ts": pt["ts"], "margem_pp": float(pt["margem_pp"])} for pt in timeline
        ]
        series_pv = [
            {"ts": pt["ts"], "p": float(pt["p_vitoria_lider"])}
            for pt in timeline
            if pt.get("p_vitoria_lider") is not None
        ]
        series_turnout = [
            {"ts": pt["ts"], "pct_apurado": float(pt["pct_apurado"])} for pt in timeline
        ]

        # Margem atual UF p/ derivar needle.
        top_pct = float(top.get("pct_projetado") or 0.0) if top else 0.0
        second_pct = float(second.get("pct_projetado") or 0.0) if second else 0.0
        margem = top_pct - second_pct
        needle_position = max(-1.0, min(1.0, margem / 20.0))
        needle_band = _needle_band(needle_position)

        uf_payload: dict[str, Any] = {
            "uf": sigla,
            "ts": ts_iso,
            "cargo": int(cargo),
            "turno": int(turno),
            "pct_apurado": pct_apurado_uf,
            "candidatos": candidatos,
            "needle_position": float(needle_position),
            "needle_band": needle_band,
            "municipios": municipios_payload,
            "series_temporais": {
                "margem": series_margem,
                "p_vitoria": series_pv,
                "turnout": series_turnout,
            },
        }
        # S06/F4d — só inclui `mesorregioes` quando há dado real
        # (≥ 1 mesorregião derivada). Campo é opcional em
        # `EdgePayloadUf`; omiti-lo quando vazio sinaliza "indisponível"
        # (consumidor esconde o bloco UI) em vez de "zero mesorregiões".
        if mesorregioes_payload:
            uf_payload["mesorregioes"] = mesorregioes_payload

        out[sigla] = uf_payload

    return out


def build_edge_payload(
    cargo: int,
    turno: int,
    ts_iso: str,
    uf_rows: list[dict[str, Any]],
    national_rows: list[dict[str, Any]],
    eleitorado_total_by_uf: dict[str, int],
    cand_a_id: int | None = None,
    cand_b_id: int | None = None,
    p_segundo_turno_overall: float | None = None,
    cenarios_2t: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Monta o shape canônico `EdgePayload` (lib/edge-config/types.ts).

    v1 (S03):
      - `national.candidatos[]` — usa `national_rows`; o líder semântico
        (`cand_a_id`, vindo de `compute_national`) é o PRIMEIRO da lista,
        seguido do segundo (`cand_b_id`), depois os demais por `pct_projetado`
        desc. Isso garante que a agulha consome `candidatos[0]` como "A"
        sem precisar de re-ordenação no consumidor TS.
        Defaults nome/partido/cor permanecem até spec 011 ingerir o catálogo.
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

    FIX S04 (carry-over #1 retro S03): antes ordenávamos `national_rows` por
    `candidato_id` ascendente e usávamos `candidatos[0].p_vitoria` na agulha
    — isso invertia a banda quando o líder tinha id maior. Agora a agulha
    usa diretamente a `p_vitoria` do líder (id == `cand_a_id`).
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
    # Ordenação SEMÂNTICA (FIX S04 carry-over #1): líder (cand_a_id) primeiro,
    # segundo lugar (cand_b_id) em seguida, depois os outros por pct_projetado
    # desc. Tie-breaker para a "cauda" é candidato_id asc — estável e
    # determinístico.
    rows_by_id: dict[int, dict[str, Any]] = {
        int(r["candidato_id"]): r for r in national_rows
    }

    def _sort_key(r: dict[str, Any]) -> tuple[int, float, int]:
        rid = int(r["candidato_id"])
        if cand_a_id is not None and rid == cand_a_id:
            tier = 0
        elif cand_b_id is not None and rid == cand_b_id:
            tier = 1
        else:
            tier = 2
        return (tier, -float(r.get("pct_projetado") or 0.0), rid)

    sorted_national = sorted(national_rows, key=_sort_key)

    national_candidatos: list[dict[str, Any]] = []
    for r in sorted_national:
        # S05/F4c (ADR-0013): paleta visual por RANK (`var(--color-cand-N)`),
        # não por partido. `rank` vem populado de `compute_national`; se
        # ausente (caller legado), coalesce para a posição+1 no array.
        rank = int(r.get("rank") or (len(national_candidatos) + 1))
        national_candidatos.append(
            {
                "id": int(r["candidato_id"]),
                "nome": f"Candidato {r['candidato_id']}",
                "partido": "—",
                # CSS var literal — consumida direto em `style={{ background: c.cor }}`
                # no front-end (sem resolução intermediária). Constituição § 2:
                # nunca hex partidário, sempre token canônico de app/globals.css.
                # ADR-0013: paleta DINÂMICA por rank, --color-cand-{1..11}.
                "cor": f"var(--color-cand-{rank})",
                "votos_atuais": 0,
                "votos_projetados": int(r.get("votos_projetados") or 0),
                "pct_atual": 0.0,
                "pct_projetado": float(r.get("pct_projetado") or 0.0),
                "pct_projetado_lower": float(r.get("pct_projetado_lower") or 0.0),
                "pct_projetado_upper": float(r.get("pct_projetado_upper") or 0.0),
                "p_vitoria": float(r.get("p_vitoria") or 0.0),
                # S05/F4c (ADR-0014) — métricas multi-candidato.
                "rank": rank,
                "p_passa_2t": float(r.get("p_passa_2t") or 0.0),
                "p_fecha_1t": float(r.get("p_fecha_1t") or 0.0),
            }
        )

    # Needle nacional — usa p_vitoria do LÍDER (cand_a_id) mapeada para [-1, 1].
    # `position = 2 * p_a - 1`: p=0.5 → 0 (tossup), p=1 → +1.
    # Como `p_vitoria` por candidato é P(c > max(outros)) e o líder é o c com
    # maior pct, p_vitoria_a ≈ P(líder > segundo) ≈ valor retornado em
    # `national_p_vitoria_a`. Lemos do row do líder em vez de candidatos[0]
    # por explicitude (também são equivalentes após a ordenação acima).
    if cand_a_id is not None and cand_a_id in rows_by_id:
        p_a = float(rows_by_id[cand_a_id].get("p_vitoria") or 0.0)
        needle_position = 2.0 * p_a - 1.0
    elif national_candidatos:
        needle_position = 2.0 * national_candidatos[0]["p_vitoria"] - 1.0
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

        # S05/F4c (ADR-0017) — top-3 candidatos da UF, tie-break por id ASC.
        top_candidatos = [
            {
                "id": int(r["candidato_id"]),
                "pct": float(r.get("pct_projetado") or 0.0),
            }
            for r in ordered[:3]
        ]

        # vai_a_2t: aplicável apenas a governador 1T (cargo=3, turno=1).
        # Para presidente, a decisão de 2T é NACIONAL — null por UF.
        if int(cargo) == 3 and int(turno) == 1:
            vai_a_2t: bool | None = top_pct < 50.0
        else:
            vai_a_2t = None

        # bucket — estado declarativo (ADR-0017).
        chamada = margem > 10.0
        if chamada:
            bucket = "chamada"
        elif vai_a_2t is True:
            bucket = "vai_2t"
        elif vai_a_2t is False:
            bucket = "decidido_1t"
        else:
            bucket = "indefinido"

        por_uf.append(
            {
                "sigla": sigla,
                "pct_apurado": float(top.get("pct_apurado") or 0.0),
                "lider": int(top["candidato_id"]),
                "margem_atual": float(margem),
                "margem_projetada": float(margem),
                "margem_projetada_ci": [float(ci_lower), float(ci_upper)],
                # Placeholder v1: regra simples até spec de "chamada" definitiva.
                "chamada": chamada,
                "swing_vs_2022": 0.0,
                # S05/F4c — multi-candidato (ADR-0017).
                "top_candidatos": top_candidatos,
                "vai_a_2t": vai_a_2t,
                "bucket": bucket,
            }
        )

    # S05/F4c (ADR-0014) — em 2T, métricas multi-candidato degeneram:
    #   p_segundo_turno_overall = None (já estamos no 2T)
    #   cenarios_2t = []         (não faz sentido projetar cenário 2T no 2T)
    # Mantemos a semântica explícita aqui mesmo se caller não passou os
    # parâmetros (orchestrator legado).
    if int(turno) == 2:
        p_2t_overall: float | None = None
        cenarios_2t_payload: list[dict[str, Any]] = []
        # S06/F4d Fase 5 — em 2T, `vai_a_2t_nacional` degenera para None
        # (já estamos no 2T, semântica vazia). Consumidor UI esconde o sinal.
        vai_a_2t_nacional: bool | None = None
    else:
        p_2t_overall = p_segundo_turno_overall  # pode ser None se caller legado
        cenarios_2t_payload = cenarios_2t if cenarios_2t is not None else []
        # S06/F4d Fase 5 (carry-over) — derivação centralizada do sinal binário
        # "vai a 2T nacional?" a partir de `p_segundo_turno_overall`. Threshold
        # 0.01 mantém paridade com a heurística que vivia em `app/page.tsx`
        # (`vai_a_2t = p < 0.01`). Quando caller legado não passa
        # `p_segundo_turno_overall`, emite `None` (consumidor coalesce pra
        # derivação local — forward-compat).
        if p_2t_overall is None:
            vai_a_2t_nacional = None
        else:
            vai_a_2t_nacional = p_2t_overall >= 0.01

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
            # FIX S04 carry-over #1 — ids semânticos do líder/segundo.
            # Consumidores TS (spec 003/004) usam para resolver nome/cor sem
            # re-ordenar. None quando ≤1 candidato com estimates válidas.
            "candidato_a_id": cand_a_id,
            "candidato_b_id": cand_b_id,
            # S05/F4c (ADR-0014) — métricas multi-candidato 1T.
            "p_segundo_turno_overall": p_2t_overall,
            "cenarios_2t": cenarios_2t_payload,
            # S06/F4d Fase 5 — sinal binário explícito (paridade com EdgeUfRow.vai_a_2t).
            "vai_a_2t_nacional": vai_a_2t_nacional,
        },
        "por_uf": por_uf,
        "insights": [],
        "composition": {
            "pre_election": 0.0,
            "model": 1.0,
            "actual_results": 0.0,
        },
    }


def post_edge_write(
    payload: dict[str, Any],
    payloads_uf: dict[str, dict[str, Any]] | None = None,
) -> None:
    """POST `/api/_internal/edge-write` com `{payload, payloads_uf?}`.

    `payloads_uf` (S04/F2): mapa `sigla → EdgePayloadUf` rico (candidatos
    com votos, municípios com margem, séries temporais). Quando presente,
    o endpoint Node grava cada UF na sua chave `projection:uf:<sigla>`
    em vez de sintetizar esqueleto a partir de `por_uf`. Forward-compat:
    Zod no endpoint usa `passthrough`, então campo extra é aceito.

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

    body_dict: dict[str, Any] = {"payload": payload}
    if payloads_uf:
        body_dict["payloads_uf"] = payloads_uf
    body = json.dumps(body_dict, default=str).encode("utf-8")
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
            # S04/F2 — dados para enriquecer EdgePayloadUf. Cada um tolera
            # falha (DB sem seed geográfico, projections vazia) com dict
            # vazio + log warn — o payload UF cai pra esqueleto.
            zona_municipio = fetch_zona_municipio(conn)
            municipio_aggregates = fetch_municipio_aggregates(
                conn, req.cargo, req.turno
            )
            series_by_uf = fetch_series_temporais(
                conn, req.cargo, req.turno, window_hours=24
            )

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
                    candidato_a_id=None,
                    candidato_b_id=None,
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

            national_rows, national_p_a, cand_a_id, cand_b_id = compute_national(
                cargo=req.cargo,
                turno=req.turno,
                estimates_by_uf=estimates_by_uf,
                eleitorado_total_by_uf=eleitorado_total_by_uf,
            )

            # S05/F4c (ADR-0014) — métricas multi-candidato pré-computadas
            # uma vez aqui para serem reusadas pelo edge_payload abaixo.
            # `aggregate_national_estimates` é a MESMA lógica usada
            # internamente em `compute_national` — mesma saída bit-a-bit.
            national_estimates = aggregate_national_estimates(
                estimates_by_uf, eleitorado_total_by_uf
            )
            scenarios = compute_two_round_scenarios(national_estimates)

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
                cand_a_id=cand_a_id,
                cand_b_id=cand_b_id,
                # S05/F4c (ADR-0014) — métricas multi-candidato.
                p_segundo_turno_overall=scenarios.get("p_segundo_turno_overall"),
                cenarios_2t=scenarios.get("cenarios_2t", []),
            )
            # S04/F2 — payloads UF ricos (candidatos com votos, municípios,
            # séries temporais). Envia junto do nacional; endpoint Node
            # grava cada chave `projection:uf:<sigla>` quando presente.
            uf_payloads = build_uf_payloads(
                cargo=req.cargo,
                turno=req.turno,
                ts_iso=ts_iso,
                uf_rows=uf_rows,
                national_rows=national_rows,
                municipio_aggregates=municipio_aggregates,
                zona_municipio=zona_municipio,
                series_by_uf=series_by_uf,
            )
            post_edge_write(edge_payload, payloads_uf=uf_payloads)
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
        candidato_a_id=cand_a_id,
        candidato_b_id=cand_b_id,
        duration_ms=int(duration_ms),
    )

    return 200, ProjectResponse(
        computed=True,
        uf_count=uf_count,
        national_p_vitoria_a=float(national_p_a),
        candidato_a_id=cand_a_id,
        candidato_b_id=cand_b_id,
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
