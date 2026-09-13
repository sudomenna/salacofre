"""
api/model/project.py

POST /api/model/project — endpoint Python do modelo estatístico (spec 002).

Roda em Vercel Fluid Compute com runtime Python 3.14. Acionado pelo handler
TypeScript `/api/ingest` ao final de cada ciclo de ingestão (T16 da spec
002, Fase 5). Orquestrador completo cola `extrapolation.py` (regra de
três por zona, RF-011/012/013 — plano `tem-um-erro-eu-velvety-sprout.md`,
2026-09-05, substituiu o pipeline de swing vs. 2022 original de T06-T09),
`turnout.py` (participação, RF-020.1), `p_vitoria` (T10) e `edge_cases`
(T11, RF-017/018) atrás de um único POST com persistência no Postgres.

Por que NÃO está em `app/api/model/project/...`?
  O Next.js App Router só aceita route handlers TS/JS dentro de `app/`.
  Funções Python no Vercel vivem na pasta `/api/` na raiz do projeto
  (https://vercel.com/docs/functions/runtimes/python). Os dois subtrees
  coexistem na mesma URL surface — Vercel faz o roteamento por path
  prefix.

Imports (decisão T12):
  Usamos imports ABSOLUTOS desde a raiz: `from api.model.extrapolation
  import ...`. Em Vercel, a raiz do projeto é mantida no `sys.path`
  quando a function é importada via `api/model/project.py`, então
  `api.model.X` resolve. Imports relativos (`from .extrapolation import
  ...`) também funcionariam, mas os testes locais já usam absolutos (via
  conftest que injeta a raiz no sys.path) e essa consistência ajuda a
  debug: o mesmo import string vale em test/prod.
  Fallback: se Vercel quebrar com absolutos no Python runtime real,
  trocar para relativos é uma mudança de 6 linhas neste arquivo.

DB driver (decisão kickoff S03):
  psycopg[binary] direto contra `DATABASE_URL` (Neon). Aceita prepared
  statements no Neon serverless quando NÃO via pooler — caller DEVE usar
  a connection string `direct`. Se quebrar (cold start ↔ pgbouncer), criar
  um helper Node `/api/internal/snapshots` é o plano B.

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
from typing import Any, TypedDict

import numpy as np
from pydantic import BaseModel, Field, ValidationError

from api.model.cargos import (
    Granularidade,
    cargo_info,
    granularidade as cargo_granularidade,
    total_cadeiras as cargo_total_cadeiras,
    vagas_em_disputa as cargo_vagas_em_disputa,
    vagas_por_uf as cargo_vagas_por_uf,
)
from api.model.cadeiras import distribuir_cadeiras
from api.model.deputado import (
    combinar_entradas,
    conferir_contra_tse,
    extrair_entrada_proporcional,
)
from api.model.deputado_payload import (
    UfProporcional,
    construir_payload_deputado,
    normalizar_divergencia,
)
from api.model.extrapolation import (
    CandidatoEstimate,
    UfCandidatosEstimate,
    ZonaCandidatos,
    aggregate_national_votos,
    estimate_uf_candidatos,
    impute_uf_from_national,
)
from api.model.p_vitoria import p_eleito, p_vitoria
from api.model.turnout import (
    Metric as ParticipacaoMetric,
    ParticipacaoEstimate,
    ZonaParticipacao,
    aggregate_national_participacao,
    estimate_uf_participacao,
)
from api.model.zona_merge import check_zona_merge_sanity, merge_pairs_into_zonas

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

    cargo: int = Field(
        ge=1,
        le=99,
        description=(
            "Código do cargo no TSE: 1=Presidente, 3=Governador, 5=Senador, "
            "6=Deputado Federal (tabela canônica em `lib/config/cargos.ts`, "
            "espelhada em `api/model/cargos.py`). A faixa 1..99 é deliberada: "
            "um cargo fora da tabela não é recusado na borda, degrada para o "
            "comportamento default (1 vaga, granularidade de zona) — o ciclo "
            "de apuração nunca cai por um código inesperado."
        ),
    )
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


def _discard_zero_zona_sentinel_when_real_zonas_exist(
    snapshots: list[LatestSnapshot],
) -> list[LatestSnapshot]:
    """Descarta a linha sentinela `cod_zona = 0` de uma UF quando a MESMA
    UF já tem zonas reais (`cod_zona > 0`) — achado urgente do plano
    `tem-um-erro-eu-velvety-sprout.md`: `lib/tse/targets.ts:410` grava a
    linha de ingestão em nível `uf` com `cod_zona = 0`; se um ciclo
    anterior rodou em modo `uf` e o ciclo atual roda em modo `zona`, os
    dois tipos de linha coexistem em `snapshots` (append-only, nunca
    apagadas) — sem este filtro, a zona-sentinela SOMARIA em cima das
    zonas reais (dupla contagem).

    Quando uma UF só tem a zona-sentinela (nenhuma zona real ainda
    ingerida), ela é MANTIDA — é o único dado disponível daquela UF.
    """
    has_real_zona_by_uf: dict[str, bool] = {}
    for s in snapshots:
        if s["cod_zona"] > 0:
            has_real_zona_by_uf[s["uf"]] = True
    return [
        s
        for s in snapshots
        if not (s["cod_zona"] == 0 and has_real_zona_by_uf.get(s["uf"], False))
    ]


def fetch_snapshots(conn, cargo: int, turno: int) -> list[LatestSnapshot]:
    """Snapshot mais recente por **par** `(uf, cod_municipio_tse, cod_zona)`
    para (cargo, turno).

    Migration 0006 / ADR-0035 D1 (11/09): a unidade de ingestão passou a ser o
    par — o TSE publica um EA20 por `(município, zona)` e 62,5 % das zonas
    cobrem 2 a 8 municípios. Particionar por `(uf, cod_zona)` como antes
    devolveria **uma fatia** da zona (o par mais recente), descartando os
    demais em silêncio. A partição agora é pelo par e o índice usado é
    `ix_snap_lookup_par`.

    A soma dos pares de volta à zona — a unidade do estimador, que **não
    muda** (ADR-0021/0023) — é feita pelo CHAMADOR via
    `api.model.zona_merge.merge_pairs_into_zonas`, em memória e nunca
    persistida (§ 1/§ 6). Ver `_do_project` e `api/model/replay_batch.py`.

    CTE espelha `getLatestSnapshotsByZone` em lib/model/repository.ts:193.
    `pct_apurado` volta como Decimal/None → convertemos para float.

    Achado urgente (plano `tem-um-erro-eu-velvety-sprout.md`): descarta a
    zona-sentinela `cod_zona = 0` quando a UF já tem zonas reais (ver
    `_discard_zero_zona_sentinel_when_real_zonas_exist`) — sem isso, o
    modo `uf` (`TSE_GRANULARIDADE=uf`, default de produção antes desta
    tarefa) conviveria com dupla contagem assim que o modo `zona` fosse
    ativado. O outro lado do fix (usar `eleitorado_total_by_uf[uf]` como
    peso quando só resta a zona-sentinela) vive em `_resolve_zone_weight`
    — quem CHAMA `fetch_snapshots` (`compute_uf_projections`/
    `compute_participacao`) já tem `eleitorado_total_by_uf` disponível.
    """
    sql = """
        WITH ranked AS (
            SELECT
                uf,
                cod_municipio_tse,
                cod_zona,
                pct_apurado,
                payload,
                ROW_NUMBER() OVER (
                    PARTITION BY uf, cod_municipio_tse, cod_zona
                    ORDER BY ts DESC, id DESC
                ) AS rn
            FROM snapshots
            WHERE cargo = %s AND turno = %s
        )
        SELECT uf, cod_municipio_tse, cod_zona, pct_apurado, payload
        FROM ranked
        WHERE rn = 1
    """
    with conn.cursor() as cur:
        cur.execute(sql, (cargo, turno))
        rows = cur.fetchall()
    raw: list[LatestSnapshot] = [
        {
            "uf": r[0],
            "cod_municipio_tse": int(r[1]) if r[1] is not None else 0,
            "cod_zona": r[2],
            "pct_apurado": float(r[3]) if r[3] is not None else 0.0,
            "payload": r[4],
        }
        for r in rows
    ]
    return _discard_zero_zona_sentinel_when_real_zonas_exist(raw)


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
    """Eleitores aptos por (uf, cod_zona). Chave tuple para lookup O(1).

    ⚠️ O `SUM(...) GROUP BY` não é cosmético. Desde a migration 0006 a PK de
    `eleitorado` é o par `(ano, uf, cod_municipio_tse, cod_zona)`: 6.085 linhas
    para 2.619 zonas. Sem o `GROUP BY`, o dict-comprehension ficava com a
    **última fatia de município** de cada zona em vez da soma — o peso da zona
    no modelo virava fragmentário, em silêncio. O mesmo defeito, em
    `scripts/build-replay-fixtures.ts`, inflou o MAE@1h de 2,3623 pp para
    3,4636 pp (medido em 11/09). Ver
    `docs/_meta/diagnostico-colapso-zona-municipio-2026-09-10.md` § "O que o
    conserto custa".

    A **chave de saída não muda** — continua `(uf, cod_zona)`, porque a
    unidade do estimador continua sendo a zona (ADR-0021/0023). Nada a jusante
    precisou mudar.
    """
    sql = """
        SELECT uf, cod_zona, SUM(eleitores_aptos) AS eleitores_aptos
        FROM eleitorado
        WHERE ano = %s
        GROUP BY uf, cod_zona
    """
    with conn.cursor() as cur:
        cur.execute(sql, (ano,))
        rows = cur.fetchall()
    return {(r[0], r[1]): int(r[2]) for r in rows}


def fetch_municipio_eleitorado(conn, ano: int = 2026) -> dict[tuple[str, int], int]:
    """Eleitores aptos por `(uf, cod_municipio_tse)` — soma EXATA dos pares
    `(município, zona)` daquele município (ADR-0035 D2: sem rateio).

    Alimenta `EdgeUfMunicipio.eleitores` (decisão D-d), que por sua vez move o
    painel "Maiores colégios eleitorais" (decisão E4). Antes da migration 0006
    esse número não existia por município: a PK de `eleitorado` creditava a
    zona inteira a um município só, pondo 26,1 % do eleitorado sob rótulo
    errado (Uberaba e Governador Valadares sumiam do top-10 de MG).

    Mapa vazio (com log) quando a tabela ainda não foi importada — o payload
    simplesmente omite `eleitores` (campo opcional em `EdgeUfMunicipio`).
    """
    sql = """
        SELECT uf, cod_municipio_tse, SUM(eleitores_aptos) AS eleitores
        FROM eleitorado
        WHERE ano = %s
        GROUP BY uf, cod_municipio_tse
    """
    try:
        with conn.cursor() as cur:
            cur.execute(sql, (ano,))
            rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001 — sem seed de eleitorado
        _log("warn", "fetch_municipio_eleitorado failed", error=str(exc))
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001 — autocommit ou sem tx
            pass
        return {}
    out: dict[tuple[str, int], int] = {}
    for r in rows:
        if r[1] is None:
            continue
        out[(str(r[0]), int(r[1]))] = int(r[2] or 0)
    return out


def _fetch_eleitorado_por_par(
    conn, ano: int = 2026
) -> dict[tuple[str, int, int], int]:
    """Eleitores aptos por par `(uf, cod_municipio_tse, cod_zona)` — a PK de
    `eleitorado` desde a migration 0006.

    Usado só como PESO do `pct_apurado` municipal em
    `fetch_municipio_aggregates`. Falha ou tabela vazia → `{}`, e o caller
    cai para peso 1 por par (média simples). O `SUM` é redundante com a PK,
    mas mantém a query correta se a chave mudar de novo.
    """
    sql = """
        SELECT uf, cod_municipio_tse, cod_zona, SUM(eleitores_aptos) AS eleitores
        FROM eleitorado
        WHERE ano = %s
        GROUP BY uf, cod_municipio_tse, cod_zona
    """
    try:
        with conn.cursor() as cur:
            cur.execute(sql, (ano,))
            rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001 — sem seed de eleitorado
        _log("info", "_fetch_eleitorado_por_par failed, peso cai para 1", error=str(exc))
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001 — autocommit ou sem tx
            pass
        return {}
    out: dict[tuple[str, int, int], int] = {}
    for r in rows:
        if len(r) != 4 or r[1] is None:
            continue
        out[(str(r[0]), int(r[1]), int(r[2]))] = int(r[3] or 0)
    return out


def fetch_zona_municipio(conn) -> dict[tuple[str, int, int], dict[str, Any]]:
    """Mapa `(uf, cod_municipio_tse, cod_zona) -> {cod_ibge,
    cod_municipio_tse, nome, uf, mesorregiao_cod, mesorregiao_nome, capital,
    eleitores}`.

    ⚠️ A chave é a TRIPLA do **par**, desde a migration 0006 (ADR-0035 D1). Duas
    razões, nesta ordem:

      1. `zonas` virou tabela de pares (PK `(uf, cod_municipio_tse, cod_zona)`,
         6.109 linhas): a mesma zona aparece em até 8 municípios. Chavear por
         `(uf, cod_zona)` manteria só o ÚLTIMO município iterado de cada zona —
         era exatamente o colapso que a migration desfez (3.392 municípios
         invisíveis no mapa, `docs/_meta/diagnostico-colapso-zona-municipio-
         2026-09-10.md`).
      2. O número da zona **repete entre UFs** (bug de 2026-09-05: 2.229 de
         2.651 entradas sobrescritas ao chavear só por `cod_zona`) — a `uf`
         continua obrigatória na chave.

    Junta `zonas` (que tem o par) com `municipios` (`cod_ibge`, `nome`,
    `mesorregiao_cod` desde a migration 0005, `capital` desde a 0006) e
    `mesorregioes` (opcional). `eleitores` vem de `fetch_municipio_eleitorado`
    (soma dos pares do município). Usado pelo build de `EdgeUfMunicipio`
    (S04/F2) e por `aggregate_by_mesorregiao` (S06/F4d).

    Degradação por tiers de schema (dev/DB atrás das migrations):
      - sem `municipios.capital` (0006) → tenta a query só com mesorregião;
      - sem `municipios.mesorregiao_cod` (0005) → cai na query original (S04);
      - `capital` sai `False` e `mesorregiao_*` sai `None` nesses casos.

    Retorna mapa vazio quando ainda não há dados geográficos carregados
    (dev sem seed) — caller graciosamente produz `municipios: []`.
    """
    sql_full = """
        SELECT
            z.cod_zona, m.cod_ibge, m.cod_municipio_tse, m.nome, z.uf,
            m.mesorregiao_cod, meso.nome AS mesorregiao_nome, m.capital
        FROM zonas z
        JOIN municipios m ON m.cod_municipio_tse = z.cod_municipio_tse
        LEFT JOIN mesorregioes meso ON meso.cod = m.mesorregiao_cod
    """
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

    rows: list[Any] | None = None
    for sql in (sql_full, sql_with_meso, sql_fallback):
        try:
            with conn.cursor() as cur:
                cur.execute(sql, ())
                rows = cur.fetchall()
            break
        except Exception as exc:  # noqa: BLE001 — coluna inexistente OU sem seed geo
            _log(
                "info",
                "fetch_zona_municipio query failed, trying next tier",
                error=str(exc),
            )
            # Rollback (se houver tx) — psycopg invalida o cursor após erro.
            try:
                conn.rollback()
            except Exception:  # noqa: BLE001 — autocommit ou sem tx
                pass
    if rows is None:
        _log("warn", "fetch_zona_municipio: nenhuma query funcionou")
        return {}

    eleitorado_munic = fetch_municipio_eleitorado(conn, ano=2026)

    out: dict[tuple[str, int, int], dict[str, Any]] = {}
    for r in rows:
        uf = str(r[4])
        cod_municipio_tse = int(r[2])
        entry: dict[str, Any] = {
            "cod_ibge": str(r[1]),
            "cod_municipio_tse": cod_municipio_tse,
            "nome": str(r[3]),
            "uf": uf,
        }
        if len(r) >= 7:
            entry["mesorregiao_cod"] = str(r[5]).strip() if r[5] is not None else None
            entry["mesorregiao_nome"] = str(r[6]) if r[6] is not None else None
        else:
            entry["mesorregiao_cod"] = None
            entry["mesorregiao_nome"] = None
        entry["capital"] = bool(r[7]) if len(r) >= 8 else False
        eleitores = eleitorado_munic.get((uf, cod_municipio_tse))
        if eleitores is not None:
            entry["eleitores"] = int(eleitores)
        # r[0] = cod_zona, r[2] = cod_municipio_tse, r[4] = uf — chave tripla.
        out[(uf, cod_municipio_tse, int(r[0]))] = entry
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
    """Agrega snapshots por **par** `(município, zona)` em totais por
    município (S04/F2, reescrito na Fase 3 do plano de 11/09).

    Retorna `{(uf, cod_municipio_tse): {pct_apurado, votos_por_candidato,
    total_votos}}` para alimentar `EdgeUfMunicipio`.

    Estratégia: pega o snapshot mais recente de cada PAR (mesma CTE de
    `fetch_snapshots`) + payload EA20 → soma `cand[].vap` (votos absolutos) e
    `votos_total` por município. O total do município é a **soma exata** dos
    pares que caem nele — sem rateio (ADR-0035 D2; § 6 não admite estimativa
    apresentada como apuração).

    ⚠️ O `LEFT JOIN zonas` SAIU. Ele existia para re-derivar o município a
    partir da zona, e era justamente o caminho do colapso: `zonas` tinha um
    município por zona, então 31,2 % dos votos caíam no município errado e
    3.392 municípios ficavam estruturalmente invisíveis no mapa
    (`docs/_meta/diagnostico-colapso-zona-municipio-2026-09-10.md` § Problema
    B). Agora `cod_municipio_tse` vem **do próprio snapshot** — o par é o que
    o TSE publicou, não uma reconstrução.

    Contrato de linha PRESERVADO em aridade e ordem —
    `(uf, cod_zona, pct_apurado, votos_total, payload, cod_municipio_tse)`,
    6 colunas, `cod_municipio_tse` por último. `tests/unit/model/
    test_payload_envelope.py:326-362` monta tuplas nessa ordem.

    `pct_apurado` do município: **média ponderada pelo eleitorado do par**
    (`SUM(eleitores_aptos) GROUP BY uf, cod_municipio_tse, cod_zona`). Era
    média SIMPLES entre zonas até 11/09 — o que dava a uma zona de 2 mil
    eleitores o mesmo peso de uma de 200 mil no percentual exibido do
    município. Sem eleitorado importado (dev sem seed), ou par sem linha em
    `eleitorado`, o peso cai para 1 e o resultado degrada exatamente para a
    média simples anterior.

    Tolerante: payload sem `vap` (formato antigo) → votos = 0 (chart fica
    sem dados mas não quebra). Par sentinela (`cod_municipio_tse = 0`, alvos
    de nível `uf`/`br`) é ignorado — não é município.

    Histórico: até 2026-09-05 o JOIN era `ON z.cod_zona = r.cod_zona` sem
    `uf`, e como o número da zona repete entre UFs isso gerava fan-out de
    2.651 para 35.757 linhas (13,5x, 226 s de query) além de resolver o
    município pela UF errada. O fix da época (casar por `uf`) deixou de ser
    necessário quando o JOIN inteiro saiu.
    """
    sql = """
        WITH ranked AS (
            SELECT
                s.uf,
                s.cod_municipio_tse,
                s.cod_zona,
                s.pct_apurado,
                s.votos_total,
                s.payload,
                ROW_NUMBER() OVER (
                    PARTITION BY s.uf, s.cod_municipio_tse, s.cod_zona
                    ORDER BY s.ts DESC, s.id DESC
                ) AS rn
            FROM snapshots s
            WHERE s.cargo = %s AND s.turno = %s
        )
        SELECT r.uf, r.cod_zona, r.pct_apurado, r.votos_total, r.payload,
               r.cod_municipio_tse
        FROM ranked r
        WHERE r.rn = 1
    """
    try:
        with conn.cursor() as cur:
            cur.execute(sql, (cargo, turno))
            rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001
        _log("warn", "fetch_municipio_aggregates failed", error=str(exc))
        return {}

    # Peso de cada par no `pct_apurado` do município. Query própria, tolerante:
    # sem eleitorado importado o dict fica vazio e todo par pesa 1 (média
    # simples, comportamento anterior a 11/09).
    eleitorado_par = _fetch_eleitorado_por_par(conn, ano=2026)

    # Aggregate per municipio. Envolvemos o loop em try/except porque o
    # FakeCursor em testes pode devolver tuplas com aridade diferente
    # e o `unpacking` levantaria ValueError. Em produção a query sempre
    # devolve 6 colunas — captura é defensiva (degrade graceful para
    # municípios vazios).
    agg: dict[tuple[str, int], dict[str, Any]] = {}
    try:
        _iter_rows = list(rows)
    except Exception:  # noqa: BLE001
        return {}
    for row in _iter_rows:
        if len(row) != 6:
            # Cursor antigo OR fixture de teste — graciosamente ignora.
            continue
        uf, cod_zona, pct_apurado, votos_total, payload, cod_municipio_tse = row
        if cod_municipio_tse is None:
            continue
        cod_municipio_tse = int(cod_municipio_tse)
        if cod_municipio_tse == 0:
            # Sentinela de abrangência `uf`/`br` — não é município.
            continue
        key = (str(uf), cod_municipio_tse)
        bucket = agg.setdefault(
            key,
            {
                "pct_apurado_num": 0.0,
                "pct_apurado_den": 0.0,
                "votos_por_candidato": {},
                "total_votos": 0,
            },
        )
        try:
            peso = float(
                eleitorado_par.get((str(uf), cod_municipio_tse, int(cod_zona)), 0)
            )
        except (TypeError, ValueError):
            peso = 0.0
        if peso <= 0:
            peso = 1.0
        bucket["pct_apurado_num"] += (
            float(pct_apurado) if pct_apurado is not None else 0.0
        ) * peso
        bucket["pct_apurado_den"] += peso
        if votos_total is not None:
            bucket["total_votos"] += int(votos_total)

        # Extrai votos absolutos por candidato do payload EA20. EA20 real:
        # `carg[].agr[].par[].cand[].vap` = votos absolutos (apurado para o
        # candidato) — ver `_iter_cands`. `_iter_cands` normaliza envelope
        # real OU payload achatado (mesmo helper de
        # `_extract_zone_candidate_pcts`). Aceita string BR ou int. Quando
        # ausente, ignora (não quebra).
        for c in _iter_cands(payload):
            try:
                cid = int(c.get("n"))
            except (TypeError, ValueError):
                continue
            votos_f = _parse_br_number(c.get("vap"))
            if votos_f is None:
                continue
            bucket["votos_por_candidato"][cid] = (
                bucket["votos_por_candidato"].get(cid, 0) + int(votos_f)
            )

    # Finaliza `pct_apurado` como média ponderada pelo eleitorado do par
    # (peso 1 quando não há eleitorado → média simples, como antes).
    out: dict[tuple[str, int], dict[str, Any]] = {}
    for key, b in agg.items():
        den = b["pct_apurado_den"]
        out[key] = {
            "pct_apurado": b["pct_apurado_num"] / den if den > 0 else 0.0,
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


def _parse_br_number(raw: Any) -> float | None:
    """Converte string BR ("12,34"), string canônica ("12.34") ou número
    para `float`. `None` se ausente/inválido — nunca levanta.

    Compartilhado por `_extract_zone_candidate_pcts`,
    `_extract_zone_participacao` e `fetch_municipio_aggregates` — único
    ponto de parsing numérico BR do payload EA20 (evita 3 implementações
    ligeiramente diferentes do mesmo parser).
    """
    if raw is None:
        return None
    try:
        if isinstance(raw, str):
            return float(raw.replace(",", "."))
        return float(raw)
    except (TypeError, ValueError):
        return None


def _payload_root(payload: Any) -> dict[str, Any] | None:
    """Normaliza a raiz do payload EA20 de uma zona — envelope real 2026 OU
    achatado legado.

    Payload REAL, gravado por `app/api/ingest/route.ts` e validado por
    `lib/tse/ea20-schema.ts` (`EA20Schema`, reescrito 2026-09-05 contra os
    9 PDFs oficiais do TSE — ver `docs/reference/tse-2026-leiautes.md`), é o
    envelope EA20 completo de UMA ÚNICA abrangência (BR/UF/Município/Zona).
    **Não existe array `abr[]`** no EA20 real (confirmado: 0 ocorrências de
    "abr" como array de abrangências no documento oficial — a única premissa
    anterior, `payload["abr"][0]`, nunca foi validada contra o PDF e estava
    simplesmente errada). O envelope inteiro JÁ é a zona/UF/BR — não há nada
    para "desembrulhar" além de reconhecer o formato:
      - Candidatos vivem em `carg[].agr[].par[].cand[]` (ver `_iter_cands`).
      - Participação/seções/votos vivem nos objetos de raiz `e`, `v`, `s`
        (ver `_extract_zone_participacao`).

    Payload ACHATADO `{cand: [...]}` (sem envelope, sem `e`/`v`/`s`) segue
    aceito — é o formato usado por `tests/fixtures/replay-2022/snapshots.json`
    (replay 2022, T21) e pelos builders sintéticos de
    `tests/unit/model/test_orchestrator.py`/`test_scale.py`. O replay nunca
    passou pelo pipeline de ingestão real (não tem `carg`/`e`/`v`/`s`, só
    `cod_candidato` + `pvap` por zona) — mantido por não haver necessidade
    de portar o dataset de replay para o envelope real só para extrair
    percentuais de candidato.

    Retorna:
      - o próprio `payload` se reconhecido em qualquer um dos formatos
        (`carg` lista não-vazia OU `cand` no topo OU `e`/`v`/`s` de raiz);
      - `None` se nenhum for reconhecido (payload corrompido/inesperado) —
        caller degrada graciosamente.
    """
    if not isinstance(payload, dict):
        return None
    carg_list = payload.get("carg")
    if isinstance(carg_list, list) and carg_list:
        return payload
    if "cand" in payload:
        return payload
    if (
        isinstance(payload.get("e"), dict)
        or isinstance(payload.get("v"), dict)
        or isinstance(payload.get("s"), dict)
    ):
        return payload
    return None


def _iter_cands(payload: Any, cargo: int | None = None) -> list[dict[str, Any]]:
    """Lista de dicts de candidato do payload EA20 real ou achatado,
    enriquecidos com o partido do nível `par[]` (um nível acima do
    candidato — ver `docs/reference/tse-2026-leiautes.md` § 2, "Estrutura
    de candidatos — antes vs. depois").

    Envelope real: percorre `carg[] → agr[] → par[] → cand[]`. Cada dict de
    candidato devolvido ganha duas chaves extras (não presentes no EA20
    original): `partido_sg` (`par.sg`) e `partido_n` (`par.n`) — usadas pelo
    payload (`build_uf_payloads`/`build_edge_payload`, campo `partido`) sem
    precisar re-navegar a hierarquia. `api/model/party_mapping.py`/K-1
    3-tier (ADR-0015) — que também consumia estas chaves — foi removido
    nesta tarefa (plano `tem-um-erro-eu-velvety-sprout.md`: 2022 sai da
    projeção, K-1 deixa de existir). Payload achatado legado não tem essa
    hierarquia — as duas chaves saem como `None`.

    `cargo`: se informado, filtra `carg[]` pelo campo `cd` (comparação
    numérica tolerante a string/int). Hoje um snapshot é sempre de um único
    cargo (o parâmetro é opcional e usado por nenhum caller ainda), mas
    deixa o contrato explícito para consumidores futuros (Fase 1a) que
    eventualmente recebam um payload com mais de um `carg`.

    `[]` se payload não reconhecido, sem `carg`/`cand`, ou `cargo` pedido
    não bate com nenhum elemento de `carg[]`.
    """
    root = _payload_root(payload)
    if root is None:
        return []

    carg_list = root.get("carg")
    if isinstance(carg_list, list) and carg_list:
        out: list[dict[str, Any]] = []
        for carg in carg_list:
            if not isinstance(carg, dict):
                continue
            if cargo is not None:
                cd = carg.get("cd")
                try:
                    if cd is None or int(cd) != int(cargo):
                        continue
                except (TypeError, ValueError):
                    continue
            agr_list = carg.get("agr")
            if not isinstance(agr_list, list):
                continue
            for agr in agr_list:
                if not isinstance(agr, dict):
                    continue
                par_list = agr.get("par")
                if not isinstance(par_list, list):
                    continue
                for par in par_list:
                    if not isinstance(par, dict):
                        continue
                    cand_list = par.get("cand")
                    if not isinstance(cand_list, list):
                        continue
                    partido_sg = par.get("sg")
                    partido_n = par.get("n")
                    for c in cand_list:
                        if not isinstance(c, dict):
                            continue
                        enriched = dict(c)
                        enriched["partido_sg"] = partido_sg
                        enriched["partido_n"] = partido_n
                        out.append(enriched)
        return out

    # Payload achatado legado — sem hierarquia de partido.
    cand_list = root.get("cand")
    if not isinstance(cand_list, list):
        return []
    out = []
    for c in cand_list:
        if not isinstance(c, dict):
            continue
        enriched = dict(c)
        enriched.setdefault("partido_sg", None)
        enriched.setdefault("partido_n", None)
        out.append(enriched)
    return out


class ZonaParticipacaoRaw(TypedDict):
    """Participação/comparecimento/votação crus de uma zona/UF/BR (Fase 1a
    — turnout.py), extraídos dos objetos de raiz `e` (eleitores) e `v`
    (votos) do EA20 real (RENOMEADO 2026-09-05 — o formato anterior lia
    campos `tap/tc/ta/tvb/tvnu/tvv/psa` de `abr[0]` que nunca existiram no
    documento oficial).

    Todos os campos de contagem são `int` (arredondados do BR-string TSE);
    `psa` fica em `float` (0–100, % seções apuradas). Extraído por
    `_extract_zone_participacao` — consumido pela Fase 1a do plano
    aprovado (comparecimento vs 2022), ainda não fiado neste módulo.
    """

    eleitores_aptos: int
    eleitores_instalados: int
    comparecimento: int
    abstencao: int
    brancos: int
    nulos: int
    validos: int
    votaveis: int
    anulados: int
    sub_judice: int
    psa: float


def _extract_zone_participacao(payload: Any) -> ZonaParticipacaoRaw | None:
    """Extrai participação/comparecimento (RF futuro — turnout, Fase 1a) dos
    objetos de raiz `e`, `v`, `s` do EA20 real.

    Mapeamento (confirmado contra o dicionário oficial,
    `tse-ea20-arquivo-de-resultado-unificado.txt:1053-1406`):
      - `eleitores_aptos`      ← `e.te`    (eleitorado total da abrangência).
      - `eleitores_instalados` ← `e.esi`   (eleitorado das seções
         instaladas). **Este, não `te`, é o denominador correto de
         `comparecimento`/`abstencao` abaixo** — o próprio dicionário define
         `e.pc`/`e.pa` como "percentual ... em relação aos eleitores das
         seções instaladas", não em relação a `te` (que inclui eleitores de
         seções ainda não instaladas, inflando artificialmente a abstenção
         aparente durante apuração parcial).
      - `comparecimento`  ← `e.c`.
      - `abstencao`       ← `e.a`.
      - `brancos`         ← `v.vb`.
      - `nulos`           ← `v.tvn` (TOTAL de nulos = `v.vn` + `v.vnt` —
         não confundir com `v.vn`, que é só "nulos" stricto sensu).
      - `validos`         ← `v.vv`.
      - `votaveis`        ← `v.vvc` (votos a votáveis concorrentes — base
         "votáveis" da extrapolação de candidatos, `api/model/
         extrapolation.py`. NUNCA rotular de "válidos": `vvc` != `vv`,
         ver ADR-0018).
      - `anulados`        ← `v.van` — sem uso imediato, mas capturado porque
         o art. 265 §2º da Res. TSE 23.751/2026 exige que painéis informem
         votos válidos, sub judice e anulados.
      - `sub_judice`      ← `v.vansj` — idem.
      - `psa`             ← `s.psa`, lido DIRETO do payload (o TSE já
         calcula e publica o percentual — não precisa ser derivado de
         `s.sa`/`s.si` neste módulo).

    Campo fatal: `eleitores_aptos` (`e.te`) — é o único campo `required`
    (não-opcional) do elemento `e` no schema EA20 (`EleitoresSchema.te`),
    presente mesmo em zonas com 0% apurado. Ausente/inválido/`<= 0` → `None`
    (payload corrompido ou zona sem eleitorado — dado de participação
    não-confiável; caller deve excluir a zona — mesmo contrato usado por
    `_extract_zone_candidatos`/`extrapolation.estimate_uf_candidatos`).

    Demais campos (`eleitores_instalados`, `comparecimento`, `abstencao`,
    `brancos`, `nulos`, `validos`, `anulados`, `sub_judice`, `psa`) degradam
    para `0`/`0.0` quando ausentes — esperado antes da primeira totalização
    parcial (`e.esi`/`e.c`/`e.a` só existem "após a totalização da seção
    eleitoral", por definição do dicionário oficial) — não invalidam a zona
    inteira.
    """
    root = _payload_root(payload)
    if root is None:
        return None

    e = root.get("e")
    if not isinstance(e, dict):
        return None
    v = root.get("v") if isinstance(root.get("v"), dict) else {}
    s = root.get("s") if isinstance(root.get("s"), dict) else {}

    te = _parse_br_number(e.get("te"))
    if te is None or te <= 0:
        return None

    esi = _parse_br_number(e.get("esi")) or 0.0
    comparecimento = _parse_br_number(e.get("c")) or 0.0
    abstencao = _parse_br_number(e.get("a")) or 0.0
    brancos = _parse_br_number(v.get("vb")) or 0.0
    nulos = _parse_br_number(v.get("tvn")) or 0.0
    validos = _parse_br_number(v.get("vv")) or 0.0
    votaveis = _parse_br_number(v.get("vvc")) or 0.0
    anulados = _parse_br_number(v.get("van")) or 0.0
    sub_judice = _parse_br_number(v.get("vansj")) or 0.0
    psa = _parse_br_number(s.get("psa")) or 0.0

    return {
        "eleitores_aptos": int(round(te)),
        "eleitores_instalados": int(round(esi)),
        "comparecimento": int(round(comparecimento)),
        "abstencao": int(round(abstencao)),
        "brancos": int(round(brancos)),
        "nulos": int(round(nulos)),
        "validos": int(round(validos)),
        "votaveis": int(round(votaveis)),
        "anulados": int(round(anulados)),
        "sub_judice": int(round(sub_judice)),
        "psa": psa,
    }


class ZonaCandidatosRaw(ZonaParticipacaoRaw):
    """`ZonaParticipacaoRaw` + votos absolutos por candidato — insumo de
    `api.model.extrapolation.estimate_uf_candidatos` (regra de três,
    plano `tem-um-erro-eu-velvety-sprout.md` § A). Substitui o antigo
    `_extract_zone_candidate_pcts` (que lia `pvap`, um percentual —
    a nova projeção precisa de CONTAGENS ABSOLUTAS para escalar por
    `k = te/esi`, não de um percentual já pronto)."""

    votos: dict[int, int]


def _extract_zone_candidatos(
    payload: Any, cargo: int | None = None
) -> ZonaCandidatosRaw | None:
    """Extrai participação (`_extract_zone_participacao`) + votos absolutos
    por candidato (`cand[].vap`) do payload EA20 de uma zona.

    `vap` — "quantidade de votos computados para o candidato" (dicionário
    oficial) — é a contagem ABSOLUTA, ao contrário de `pvap` (percentual
    sobre `vvc`, usado pelo pipeline de swing pré-Fase-1 e agora
    aposentado). A nova projeção (regra de três, `api/model/
    extrapolation.py`) precisa da contagem bruta para poder escalar por
    `k(z) = te/esi` — um percentual já pronto não pode ser "re-escalado".

    Zona sem participação válida (`_extract_zone_participacao` retornou
    `None` — tipicamente `eleitores_aptos <= 0`, campo fatal do EA20)
    também não tem candidatos: retorna `None` (mesmo contrato de
    `_extract_zone_participacao` — fail-safe, zona inteira é excluída
    pelo caller).

    Payload achatado legado `{cand: [...]}` (replay 2022 / fixtures
    sintéticas antigas) é aceito por `_iter_cands`, mas SEM `e`/`v`/`s`
    de raiz não tem participação — `_extract_zone_participacao` devolve
    `None` e esta função também devolve `None`. Isso é uma mudança de
    comportamento deliberada vs. o pipeline de swing anterior (que só
    precisava de `pvap`): o formato achatado não carrega o suficiente
    para a regra de três (ver plano § "Replay", Fase 5 pendente).
    """
    participacao = _extract_zone_participacao(payload)
    if participacao is None:
        return None

    votos: dict[int, int] = {}
    for c in _iter_cands(payload, cargo=cargo):
        try:
            cod = int(c.get("n"))
        except (TypeError, ValueError):
            continue
        vap = _parse_br_number(c.get("vap"))
        if vap is None:
            continue
        votos[cod] = int(round(vap))

    return {**participacao, "votos": votos}  # type: ignore[typeddict-item]


def _extract_zone_candidate_pcts(
    payload: Any, cargo: int | None = None
) -> dict[int, float]:
    """Extrai `{cod_candidato: pct_vvc}` (fração) do payload EA20 de uma
    zona via `cand[].pvap`.

    MANTIDO (decisão desta tarefa — plano `tem-um-erro-eu-velvety-
    sprout.md` § B pedia a remoção total, mas `tests/unit/model/
    test_payload_envelope.py`, na lista de testes que devem passar SEM
    alteração, importa e fixa o contrato desta função diretamente).
    NENHUM caller do pipeline de projeção usa mais este helper — a
    extrapolação por regra de três (`api/model/extrapolation.py`) lê
    `cand[].vap` (contagem absoluta) via `_extract_zone_candidatos`, não
    `pvap` (percentual). Este helper fica como utilitário standalone,
    sem uso na projeção de candidatos.

    `pvap` — "percentual de votos computados atribuídos ao candidato em
    relação aos votos a votáveis concorrentes" (`v.vvc`), vem como string
    BR-decimal (vírgula) — convertida para fração [0,1].

    Payload achatado legado `{cand: [...]}` (replay 2022 / fixtures
    sintéticas) também é aceito via `_iter_cands`. Tolerante: se o
    payload vier em outro formato inesperado, retorna `{}`.
    """
    out: dict[int, float] = {}
    for c in _iter_cands(payload, cargo=cargo):
        try:
            cod = int(c.get("n"))
        except (TypeError, ValueError):
            continue
        pct = _parse_br_number(c.get("pvap"))
        if pct is None:
            continue
        out[cod] = pct / 100.0
    return out


def _frac_to_pct(x: float) -> float:
    """Converte fração [0,1] (espaço do bootstrap/T06-T11) para percentual
    0–100 (espaço de `rows`/`projections`/payload Edge — `lib/edge-config/
    types.ts`, `docs/architecture/data-model.md` § "Escala de percentuais").

    Arredonda em 5 casas — mesma precisão de `NUMERIC(8,5)` na coluna
    `projections.pct_projetado` (evita ruído de float além da precisão
    persistida).
    """
    return round(100.0 * x, 5)


def _uf_projection_row(
    cargo: int,
    turno: int,
    uf: str,
    cand: int,
    cand_est: CandidatoEstimate,
    pct_apurado_uf: float,
    est: UfCandidatosEstimate,
    metodo_tipo: str = "extrapolacao_apurado",
    granularidade: Granularidade = "zona",
) -> dict[str, Any]:
    """Monta a linha `(uf, candidato)` a partir de `CandidatoEstimate`
    (regra de três, `api/model/extrapolation.py`) — usada tanto pelo
    caminho normal (`estimate_uf_candidatos`) quanto pela imputação
    nacional (`impute_uf_from_national`, RF-017 2o nível).

    `pct_projetado*`/`pct_atual` já chegam em PERCENTUAL 0-100
    (`CandidatoEstimate` segue a convenção de `_frac_to_pct`) — mesma
    fronteira de escala de `insert_projections`/`build_uf_payloads`/
    `build_edge_payload`.
    """
    return {
        "cargo": cargo,
        "turno": turno,
        "uf": uf,
        "candidato_id": cand,
        "votos_projetados": int(cand_est["votos_projetados"]),
        "votos_atuais": int(cand_est["votos_atuais"]),
        "pct_atual": cand_est["pct_atual_votaveis"],
        "pct_projetado": cand_est["pct_projetado_votaveis"],
        "pct_projetado_lower": cand_est["lower_votaveis"],
        "pct_projetado_upper": cand_est["upper_votaveis"],
        "p_vitoria": None,
        "pct_apurado": float(pct_apurado_uf),
        "comparecimento": {
            "pct_atual": cand_est["pct_atual_comparecimento"],
            "pct_projetado": cand_est["pct_projetado_comparecimento"],
            "lower": cand_est["lower_comparecimento"],
            "upper": cand_est["upper_comparecimento"],
        },
        "metodo": {
            "tipo": metodo_tipo,
            "n_zonas": est["n_zonas"],
            "n_zonas_imputadas": est["n_zonas_imputadas"],
            # RF-102 (spec 016) — a unidade em que a regra de três foi
            # aplicada. `"zona"` em Presidente/Governador; `"uf"` em Senador e
            # Deputado Federal, que o ADR-0026 item 1 ingere por UF (27 GETs
            # por ciclo em vez de ~6.110). Não é detalhe interno: é a diferença
            # que a tela precisa declarar ao leitor (RF-108), porque uma
            # projeção feita sobre um único boletim agregado da UF não tem a
            # mesma natureza da que agrega ~200 zonas independentes.
            "granularidade": granularidade,
        },
    }


def _eleitorado_total_by_uf(
    eleitorado: dict[tuple[str, int], int],
) -> dict[str, int]:
    """Σ eleitores aptos por UF a partir do dict `(uf, cod_zona) -> aptos`
    (`fetch_eleitorado`). Reusado por `compute_uf_projections`/
    `compute_participacao`/`_resolve_zone_weight` — um único lugar que
    faz essa soma (evita 3 implementações levemente diferentes)."""
    out: dict[str, int] = {}
    for (uf, _z), aptos in eleitorado.items():
        out[uf] = out.get(uf, 0) + aptos
    return out


def _resolve_zone_weight(
    uf: str,
    cod_zona: int,
    eleitorado: dict[tuple[str, int], int],
    eleitorado_total_by_uf: dict[str, int],
) -> int:
    """Peso (eleitores aptos 2026, RF-008) de uma zona para agregação.

    `cod_zona == 0` é o SENTINELA de ingestão em nível `uf`
    (`lib/tse/targets.ts:410`); a tabela `eleitorado` só tem linhas por
    zona REAL, nunca `(uf, 0)` — sem este fallback, a zona-sentinela
    pesaria sempre 0 e seria descartada em silêncio, quebrando o modo
    `uf` em produção (achado urgente do plano `tem-um-erro-eu-velvety-
    sprout.md`). Quando `cod_zona == 0`, usa o eleitorado TOTAL da UF em
    vez do lookup por zona.
    """
    if cod_zona == 0:
        return eleitorado_total_by_uf.get(uf, 0)
    return eleitorado.get((uf, cod_zona), 0)


# Mínimo de zonas para estratificar uma UF. Abaixo disso, três estratos
# repartiriam pouquíssimas zonas e trocariam viés de composição por
# variância — o remédio pior que a doença. Em 2026-09-06 as UFs abaixo do
# limiar são RR (8 zonas), AC (9), ZT (10) e AP (10); a seguinte, SE, tem 29.
_MIN_ZONAS_PARA_ESTRATIFICAR = 12

# Número de estratos (tercis de `te`). Três é o maior número que ainda deixa
# ≥ 4 zonas por estrato na menor UF elegível.
_N_ESTRATOS = 3


def _compute_estratos_por_uf(
    uf: str,
    eleitorado: dict[tuple[str, int], int],
) -> tuple[dict[int, int] | None, dict[int, float] | None]:
    """Pós-estratificação por porte: tercis de `te` sobre TODAS as zonas da UF.

    O ponto inteiro da estratificação está em usar `eleitorado` — que conhece
    **todas** as zonas — e não os snapshots, que só conhecem as que já
    reportaram. É isso que fixa o peso de cada estrato *a priori* e neutraliza
    o viés de composição: as zonas grandes chegam primeiro, mas o peso do
    estrato "grande" não cresce por causa disso (achado do replay 2022
    regenerado, 2026-09-06 — MAE@1h de 3,2pp concentrado em UFs com apuração
    parcial e composição enviesada).

    Devolve `(None, None)` quando a UF não é elegível — o caller então chama
    `estimate_uf_candidatos` sem os parâmetros e o caminho original roda
    byte-a-byte idêntico (nenhum sorteio extra é consumido do RNG, § 6).
    """
    zonas_da_uf = [
        (cod_zona, aptos)
        for (u, cod_zona), aptos in eleitorado.items()
        if u == uf and cod_zona != 0 and aptos > 0
    ]
    if len(zonas_da_uf) < _MIN_ZONAS_PARA_ESTRATIFICAR:
        return None, None

    # Ordena por porte e corta em tercis por CONTAGEM de zonas (não por soma
    # de eleitores): estratos com número parecido de zonas mantêm o bootstrap
    # por estrato estável. Empate de `te` resolve por `cod_zona` para que a
    # atribuição seja determinística (§ 6).
    zonas_da_uf.sort(key=lambda t: (t[1], t[0]))
    n = len(zonas_da_uf)
    estrato_by_cod_zona: dict[int, int] = {}
    te_total_by_estrato: dict[int, float] = {}
    for pos, (cod_zona, aptos) in enumerate(zonas_da_uf):
        k = min(pos * _N_ESTRATOS // n, _N_ESTRATOS - 1)
        estrato_by_cod_zona[cod_zona] = k
        te_total_by_estrato[k] = te_total_by_estrato.get(k, 0.0) + float(aptos)
    return estrato_by_cod_zona, te_total_by_estrato


def compute_uf_projections(
    cargo: int,
    turno: int,
    seed_base: int,
    snapshots: list[LatestSnapshot],
    eleitorado: dict[tuple[str, int], int],
) -> tuple[
    list[dict[str, Any]],
    dict[str, dict[int, np.ndarray]],
    dict[str, dict[int, np.ndarray]],
    dict[str, UfCandidatosEstimate],
]:
    """Projeta candidatos por UF via regra de três + bootstrap de zonas
    (`api.model.extrapolation`) — RF-011/012/013. SEM 2022 (decisão E1 do
    plano `tem-um-erro-eu-velvety-sprout.md`): a assinatura não recebe
    `historical` — a projeção nasce inteiramente do que a própria zona já
    apurou no ciclo 2026.

    Retorna tupla:
        - `rows`: lista pronta para `insert_projections` (uma linha por
          uf x candidato com votos/pct/CI/metodo).
        - `estimates_by_uf`: `{uf: {cod_candidato: ndarray}}` BASE
          VOTÁVEIS (fração [0,1], pareado) — contrato estável consumido
          por `compute_national`/`p_vitoria`/`compute_p_passa_2t`/
          `compute_p_fecha_1t`/`compute_two_round_scenarios`/
          `compute_outros_estimates` (NENHUMA dessas funções muda).
        - `estimates_c_by_uf`: idem, BASE COMPARECIMENTO — só alimenta o
          payload (E2/E2b), não entra no cálculo de `p_vitoria`.
        - `cand_by_uf`: `{uf: UfCandidatosEstimate}` — resultado bruto
          por UF (inclui `n_zonas`/`n_zonas_imputadas`/bases projetadas),
          reusado por `build_uf_payloads` para "Outros" na 2a base.

    Estratégia de seed (constituição § 6): UM bootstrap por UF (não mais
    um por candidato — ver `extrapolation.estimate_uf_candidatos`), seed
    `seed_base XOR hash(f"{uf}:candidatos")`.

    E3 hierárquico (RF-013/017): UF sem NENHUMA zona apurada —
      - cargo 1 (presidente): 2a passada abaixo usa
        `impute_uf_from_national` (a UF assume a proporção nacional já
        calculada a partir das UFs com dado, CI +-10pp).
      - cargo 3 (governador): não existe "nacional" por corrida estadual
        — a UF fica OMITIDA de `rows`/`estimates_by_uf` ("aguardando
        projeção" na UI).
      - cargo 5 (senador): MESMA omissão do governador, e por um motivo
        adicional e mais forte (RF-102, spec 016): a composição partidária
        do Senado varia demais entre estados para que a proporção nacional
        signifique alguma coisa num estado específico. Imputar ali não
        seria uma estimativa fraca — seria uma afirmação sobre um estado
        feita a partir de dado de outros 26. A UF sai `aguardando`.

    Granularidade (RF-102): o `k = te/esi` é sempre o da UNIDADE INGERIDA.
    Em cargo 1/3 a unidade é a zona (~6.110 pares por ciclo, somados de
    volta a zonas por `merge_pairs_into_zonas`); em cargo 5/6 é a UF
    inteira — o TSE publica um único EA20 por UF e `lib/tse/targets.ts`
    grava a linha com o sentinela `cod_zona = 0`, que
    `_resolve_zone_weight` pesa pelo eleitorado total da UF. Nenhum código
    especial é preciso para isso: a mesma função roda com UMA "zona" que é
    a UF. O que muda é o rótulo — `metodo.granularidade` — e a
    consequência estatística, documentada em `_uf_projection_row`.
    """
    granularidade = cargo_granularidade(int(cargo))
    snaps_by_uf: dict[str, list[LatestSnapshot]] = {}
    for s in snapshots:
        snaps_by_uf.setdefault(s["uf"], []).append(s)

    eleitorado_total_by_uf = _eleitorado_total_by_uf(eleitorado)

    rows: list[dict[str, Any]] = []
    estimates_by_uf: dict[str, dict[int, np.ndarray]] = {}
    estimates_c_by_uf: dict[str, dict[int, np.ndarray]] = {}
    cand_by_uf: dict[str, UfCandidatosEstimate] = {}
    pending_national_fallback: list[str] = []

    for uf, snaps in snaps_by_uf.items():
        zonas: list[ZonaCandidatos] = []
        pct_num = 0.0
        for s in snaps:
            cod_zona = s["cod_zona"]
            w = _resolve_zone_weight(uf, cod_zona, eleitorado, eleitorado_total_by_uf)
            if w > 0:
                pct_num += s["pct_apurado"] * w
            raw = _extract_zone_candidatos(s["payload"])
            if raw is None:
                continue
            zona: ZonaCandidatos = {**raw, "cod_zona": cod_zona, "weight": w}  # type: ignore[typeddict-item]
            zonas.append(zona)
        # Denominador é o eleitorado TOTAL da UF (todas as zonas
        # conhecidas via `eleitorado`), não a soma dos pesos das zonas
        # PRESENTES no snapshot. Zonas ausentes (404 "sem dados ainda",
        # `app/api/ingest/route.ts`) apuraram 0% — contribuem 0 ao
        # numerador e nada ao denominador antigo, o que inflava
        # `uf_pct_apurado` para perto de 100% assim que qualquer zona
        # pequena fechasse (achado: no replay 2022 fixado (t=1h), TO
        # mostrava 100% apurado quando o real era ~52%; PI 93% vs ~37%
        # real — ver model-validator, 2026-09-06). NOTA: essa métrica só
        # alimenta RF-018 (limiar binário <5%) e o rótulo exibido ao
        # leitor — NÃO alimenta o ponto projetado (`estimate_uf_
        # candidatos` usa razão de somas das zonas efetivamente apuradas,
        # independente de `uf_pct_apurado`). Corrigir este denominador
        # não move MAE@1h nem cobertura IC95@1h no replay atual porque
        # nenhuma UF cruza o limiar de 5% nesse timestep mesmo com o
        # valor correto — o driver da falha de OT-4 é viés de composição
        # (zonas maiores apuram primeiro), não este bug.
        pct_den = eleitorado_total_by_uf.get(uf, 0)
        uf_pct_apurado = pct_num / pct_den if pct_den > 0 else 0.0

        local_seed = (
            seed_base
            ^ int(
                hashlib.sha256(f"{uf}:candidatos".encode("utf-8")).hexdigest()[:8],
                16,
            )
        ) & 0xFFFFFFFF

        estrato_by_cod_zona, te_total_by_estrato = _compute_estratos_por_uf(
            uf, eleitorado
        )
        est = estimate_uf_candidatos(
            zonas,
            uf_pct_apurado,
            local_seed,
            estrato_by_cod_zona=estrato_by_cod_zona,
            te_total_by_estrato=te_total_by_estrato,
        )
        if est is None:
            if int(cargo) == 1:
                # RF-017 2o nível — resolvido na 2a passada abaixo, depois
                # que o nacional das UFs COM dado estiver disponível.
                pending_national_fallback.append(uf)
            # Cargo 3 (governador): sem "nacional" para ancorar — a UF
            # fica de fora ("aguardando projeção").
            continue

        cand_by_uf[uf] = est
        estimates_by_uf[uf] = {
            cod: c["estimates_votaveis"] for cod, c in est["por_candidato"].items()
        }
        estimates_c_by_uf[uf] = {
            cod: c["estimates_comparecimento"]
            for cod, c in est["por_candidato"].items()
        }
        for cod, cand_est in est["por_candidato"].items():
            rows.append(
                _uf_projection_row(
                    cargo,
                    turno,
                    uf,
                    cod,
                    cand_est,
                    uf_pct_apurado,
                    est,
                    granularidade=granularidade,
                )
            )

    if pending_national_fallback and int(cargo) == 1 and estimates_by_uf:
        national_estimates = aggregate_national_estimates(
            estimates_by_uf, eleitorado_total_by_uf
        )
        national_point = {
            cod: float(np.mean(arr)) for cod, arr in national_estimates.items()
        }

        total_base_votaveis_br = sum(
            e["base_votaveis_projetada"] for e in cand_by_uf.values()
        )
        total_eleitorado_computed = sum(
            eleitorado_total_by_uf.get(u, 0) for u in cand_by_uf
        )
        r_v_br = (
            total_base_votaveis_br / total_eleitorado_computed
            if total_eleitorado_computed > 0
            else 0.0
        )

        for uf in pending_national_fallback:
            w_uf = eleitorado_total_by_uf.get(uf, 0)
            est = impute_uf_from_national(
                national_estimates, national_point, w_uf, r_v_br
            )
            cand_by_uf[uf] = est
            estimates_by_uf[uf] = {
                cod: c["estimates_votaveis"]
                for cod, c in est["por_candidato"].items()
            }
            estimates_c_by_uf[uf] = {
                cod: c["estimates_comparecimento"]
                for cod, c in est["por_candidato"].items()
            }
            for cod, cand_est in est["por_candidato"].items():
                rows.append(
                    _uf_projection_row(
                        cargo,
                        turno,
                        uf,
                        cod,
                        cand_est,
                        0.0,
                        est,
                        metodo_tipo="imputado_nacional",
                        granularidade=granularidade,
                    )
                )

    return rows, estimates_by_uf, estimates_c_by_uf, cand_by_uf


def compute_p_eleito_by_uf(
    estimates_by_uf: dict[str, dict[int, np.ndarray]],
    vagas: int,
) -> dict[str, dict[int, float]]:
    """RF-103 (spec 016) — `p_eleito` por candidato, por UF.

    Delega a `api.model.p_vitoria.p_eleito`, que já resolve a parte difícil
    (contagem POR CENÁRIO, não por distribuição marginal) e tem cobertura
    própria em `tests/unit/model/test_p_eleito.py`. O que esta função
    acrescenta é só o laço sobre as 27 corridas — e a garantia de que a
    pergunta feita ao bootstrap é a certa para o cargo.

    Por que não reusar `p_vitoria`: em Senador a eleição não é ganha por quem
    lidera, é ganha por quem termina entre os DOIS primeiros. `p_vitoria`
    responderia com precisão a uma pergunta que não decide nada — o 2º
    colocado de um estado é senador exatamente como o 1º.

    A soma dos `p_eleito` de uma UF tende a `min(vagas, nº de candidatos)`,
    não a 1. Isso é a assinatura de que o número certo foi calculado.

    Zero sorteio novo: é função pura dos `estimates_by_uf` que
    `compute_uf_projections` já produziu (mesma filosofia de
    `compute_p_passa_2t` / `compute_p_fecha_1t` / `compute_outros_estimates`),
    então o determinismo da constituição § 6 é herdado, não reconquistado.

    Limitação conhecida, e ela é do DADO, não desta função: quando o cargo é
    ingerido em granularidade UF (ADR-0026 item 1), a UF tem uma única
    unidade de reamostragem — o bootstrap de zonas reamostra sempre a mesma
    linha e as 1.000 réplicas saem idênticas. Com dispersão zero, `p_eleito`
    degenera para 0 ou 1. O número continua correto ("dado o ponto estimado,
    estes dois estão à frente"), mas não carrega incerteza amostral. Quem
    exibe precisa olhar a largura do IC antes de chamar isso de "chance" —
    ver `EdgeUfCandidate.p_eleito` em `lib/edge-config/types.ts`.
    """
    if vagas < 1:
        raise ValueError(f"vagas deve ser >= 1, recebido {vagas}")
    out: dict[str, dict[int, float]] = {}
    for uf in sorted(estimates_by_uf):
        cand_map = estimates_by_uf[uf]
        if not cand_map:
            continue
        out[uf] = p_eleito(cand_map, vagas)
    return out


def extract_partido_by_cand(
    snapshots: list[LatestSnapshot], cargo: int | None = None
) -> dict[int, str]:
    """`{cod_candidato: sigla do partido}` a partir dos snapshots do ciclo.

    O EA20 carrega a sigla um nível ACIMA do candidato (`carg[] → agr[] →
    par[].sg`), e `_iter_cands` já a anexa a cada candidato como
    `partido_sg`. Até aqui ninguém colhia essa chave: `build_edge_payload`
    escrevia `"partido": "—"` literal e `build_uf_payloads` lia o `partido`
    das linhas nacionais, que `compute_national` nunca populou. O resultado
    era um travessão em toda tela, em todos os cargos.

    Isto vira pré-requisito com a spec 016: RF-107 pede a contagem das 54
    vagas **por partido/federação**, e não existe contagem por partido sem
    partido. A correção é do tamanho do problema — uma varredura sobre os
    snapshots que o ciclo já leu, sem query nova.

    Determinismo (§ 6): iteração na ordem dos snapshots (que
    `fetch_snapshots` já ordena) e primeira sigla não-vazia vence. Um
    candidato aparece em muitas zonas com a mesma sigla; divergência entre
    zonas seria dado corrompido do TSE, e neste caso a primeira leitura é
    tão defensável quanto qualquer outra — o que importa é que duas
    execuções sobre o mesmo dado deem o mesmo resultado.
    """
    out: dict[int, str] = {}
    for s in snapshots:
        for c in _iter_cands(s.get("payload"), cargo=cargo):
            try:
                cod = int(c.get("n"))
            except (TypeError, ValueError):
                continue
            if cod in out:
                continue
            sg = c.get("partido_sg")
            if isinstance(sg, str) and sg.strip():
                out[cod] = sg.strip()
    return out


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


def compute_outros_estimates(
    estimates: dict[int, np.ndarray],
    rank_by_cand: dict[int, int],
    min_rank: int = 4,
) -> tuple[np.ndarray, int]:
    """"Outros" com IC real (D4 do plano `sim-monte-um-planejamento-magical-
    key.md`) — soma, resample a resample, dos `estimates` (fração [0,1])
    dos candidatos com `rank >= min_rank`.

    Por que soma de resamples e não `100 - Σ(top3)`: a subtração descarta
    toda a incerteza dos candidatos de cauda (vira um número fixo). Somar
    os arrays PAREADOS por índice de resample preserva a covariância entre
    eles e devolve um IC genuíno para "Outros" — mesma filosofia de
    `aggregate_national_estimates`/`p_vitoria` (comparação/soma sempre
    pareada por resample, nunca por estatística agregada isolada).

    Determinismo (§ 6): soma elementwise de arrays já sorteados por
    `bootstrap_uf`/`estimate_uf_participacao` — zero `random` novo aqui.

    Args:
        estimates: `{cand_id: ndarray}` em fração [0,1], todos com o MESMO
            shape `(n_resamples,)` — garantido por quem produz `estimates`
            (`aggregate_national_estimates`/`estimates_by_uf[uf]`).
        rank_by_cand: `{cand_id: rank}` 1-based — mesma semântica de
            `compute_national`/`build_uf_payloads` (rank 1 = líder).
            Candidato ausente do dict é tratado como rank `0` (nunca entra
            em "outros" por omissão — fail-safe).
        min_rank: candidatos com `rank >= min_rank` entram na soma
            (default 4 — "Outros" = tudo além do pódio top-3, D2 do plano).

    Returns:
        `(soma, n_candidatos)`. `n_candidatos == 0` (menos de 4 candidatos
        na corrida, ou `estimates` vazio) devolve um array de zeros no
        shape do primeiro `estimates` encontrado (`np.zeros(0)` se
        `estimates` vazio) — caller trata `n_candidatos <= 0` como
        "omitir a chave `outros` inteira".
    """
    if not estimates:
        return np.zeros(0, dtype=np.float64), 0

    sample_shape = next(iter(estimates.values())).shape
    tail = [c for c in estimates if rank_by_cand.get(c, 0) >= min_rank]
    if not tail:
        return np.zeros(sample_shape, dtype=np.float64), 0

    agg = np.zeros(sample_shape, dtype=np.float64)
    for c in tail:
        agg = agg + estimates[c]
    return agg, len(tail)


def _outros_metric_payload(
    estimates: np.ndarray, n_candidatos: int
) -> dict[str, Any] | None:
    """Constrói o bloco `participacao.outros` a partir do resultado de
    `compute_outros_estimates` — `pct_projetado`/`lower`/`upper` em
    percentual 0–100, `base: "votaveis"` (D3 — % sobre votos a candidatos
    votáveis, mesma base semântica de `pvap`).

    `pct_atual` sai sempre `None` aqui — quem povoa é o caller que tem
    acesso a `municipio_aggregates` (`build_edge_payload`/
    `build_uf_payloads`), somando os `pct_atual` reais dos candidatos de
    cauda (rank >= `min_rank`).

    Returns:
        `None` se `n_candidatos <= 0` (menos de 4 candidatos na corrida —
        "outros" não existe; caller omite a chave inteira).
    """
    if n_candidatos <= 0:
        return None
    return {
        "pct_atual": None,
        "pct_projetado": _frac_to_pct(float(np.mean(estimates))),
        "lower": _frac_to_pct(float(np.percentile(estimates, 2.5))),
        "upper": _frac_to_pct(float(np.percentile(estimates, 97.5))),
        "base": "votaveis",
        "n_candidatos": n_candidatos,
    }


def _participacao_metric_payload(
    est: ParticipacaoEstimate, base: str
) -> dict[str, Any]:
    """Converte `ParticipacaoEstimate` (turnout.py) para o shape de payload
    `participacao.<abstencao|brancos_nulos>` (Fase 1a, D3/D5/D6)."""
    return {
        "pct_atual": est["pct_atual"],
        "pct_projetado": est["pct_projetado"],
        "lower": est["lower"],
        "upper": est["upper"],
        "base": base,
    }


def build_participacao_payload(
    abstencao: ParticipacaoEstimate | None,
    brancos_nulos: ParticipacaoEstimate | None,
    outros: dict[str, Any] | None,
    pct_apurado: float,
    metodo_tipo: str = "extrapolacao_apurado",
    n_zonas_imputadas: int = 0,
) -> dict[str, Any] | None:
    """Monta o bloco `participacao` do payload Edge Config (Fase 1a —
    D3 denominador misto rotulado, D4 outros com IC real, D5 regra de
    três, D6 shape `participacao?`).

    Omite a chave inteira de cada métrica (`abstencao`/`brancos_nulos`/
    `outros`) quando o dado subjacente não pôde ser calculado (0 zonas
    úteis para participação, ou <4 candidatos para "outros"). Retorna
    `None` (bloco `participacao` inteiro omitido) se NENHUMA das três
    métricas está disponível — evita emitir `{"metodo": {...}}` órfão,
    sem nenhum dado real por trás.

    `metodo.n_zonas` = MAIOR `n_zonas` entre `abstencao`/`brancos_nulos`
    disponíveis (as duas métricas podem ter conjuntos de zonas úteis
    ligeiramente diferentes — zona com `comparecimento == 0` mas
    `eleitores_instalados > 0`, por exemplo — o maior é o mais
    representativo do "quanto já apuramos" para efeito de rótulo).

    `metodo_tipo`/`n_zonas_imputadas` (plano § B, RF-017 2o nível):
    propagados pelo CALLER a partir do `metodo` já calculado por
    `compute_uf_projections`/`_uf_projection_row` para os CANDIDATOS
    desta mesma UF/nacional — `"imputado_nacional"` quando a UF inteira
    caiu no fallback de `impute_uf_from_national` (nenhuma zona própria
    apurada). Participação (turnout.py) continua com seu próprio cálculo
    zona-a-zona independente; este campo só rotula a UI (RF-062).
    """
    out: dict[str, Any] = {}
    n_zonas = 0
    if abstencao is not None:
        out["abstencao"] = _participacao_metric_payload(
            abstencao, "eleitores_instalados"
        )
        n_zonas = max(n_zonas, abstencao["n_zonas"])
    if brancos_nulos is not None:
        out["brancos_nulos"] = _participacao_metric_payload(
            brancos_nulos, "comparecimento"
        )
        n_zonas = max(n_zonas, brancos_nulos["n_zonas"])
    if outros is not None:
        out["outros"] = outros
    if not out:
        return None
    out["metodo"] = {
        "tipo": metodo_tipo,
        "n_zonas": n_zonas,
        "pct_apurado": pct_apurado,
        "n_zonas_imputadas": n_zonas_imputadas,
    }
    return out


def compute_participacao(
    cargo: int,
    turno: int,
    seed_base: int,
    snapshots: list[LatestSnapshot],
    eleitorado: dict[tuple[str, int], int],
) -> tuple[
    dict[str, dict[str, ParticipacaoEstimate | None]],
    dict[str, ParticipacaoEstimate | None],
]:
    """Fiação da Fase 1a (RF-020.1) — projeta abstenção e brancos/nulos por
    UF (regra de três, D5, `turnout.py`) e agrega nacionalmente.

    Reusa o MESMO snapshot mais recente por zona já lido por
    `fetch_snapshots`/consumido por `compute_uf_projections` — nenhuma
    query adicional ao Postgres. Extrai participação via
    `_extract_zone_participacao` (não `_extract_zone_candidate_pcts` —
    aquele lê candidatos, este lê os objetos de raiz `e`/`v`/`s`).

    Determinismo (§ 6): seed por `(uf, metric)` derivado do MESMO padrão de
    `local_seed` em `compute_uf_projections` (XOR do `seed_base` com os 8
    primeiros hex de `sha256(f"{uf}:{metric}")`) — reprodutível, e
    descorrelacionado entre UFs/métricas diferentes (evita que abstenção e
    brancos/nulos da mesma UF, ou a mesma métrica em UFs diferentes,
    reamostrem exatamente os mesmos índices).

    Returns:
        `(by_uf, nacional)`:
          - `by_uf`: `{uf: {"abstencao": Estimate|None, "brancos_nulos":
            Estimate|None}}`.
          - `nacional`: `{"abstencao": Estimate|None, "brancos_nulos":
            Estimate|None}` agregado via `aggregate_national_participacao`.
    """
    snaps_by_uf: dict[str, list[LatestSnapshot]] = {}
    for s in snapshots:
        snaps_by_uf.setdefault(s["uf"], []).append(s)

    eleitorado_total_by_uf = _eleitorado_total_by_uf(eleitorado)

    metrics: tuple[ParticipacaoMetric, ...] = ("abstencao", "brancos_nulos")
    by_uf: dict[str, dict[str, ParticipacaoEstimate | None]] = {}

    for uf, snaps in snaps_by_uf.items():
        zonas: list[ZonaParticipacao] = []
        pct_num = 0.0
        for s in snaps:
            w = _resolve_zone_weight(
                uf, s["cod_zona"], eleitorado, eleitorado_total_by_uf
            )
            if w > 0:
                pct_num += s["pct_apurado"] * w
            raw = _extract_zone_participacao(s["payload"])
            if raw is None or w <= 0:
                continue
            zona: ZonaParticipacao = {**raw, "cod_zona": s["cod_zona"], "weight": w}  # type: ignore[typeddict-item]
            zonas.append(zona)
        # Mesmo fix de `compute_uf_projections` acima: denominador é o
        # eleitorado TOTAL da UF, não a soma dos pesos das zonas
        # presentes no snapshot (gêmeo do bug — zonas ausentes apuraram
        # 0%, não devem sumir do denominador).
        pct_den = eleitorado_total_by_uf.get(uf, 0)
        pct_apurado_uf = pct_num / pct_den if pct_den > 0 else 0.0

        uf_result: dict[str, ParticipacaoEstimate | None] = {}
        for metric in metrics:
            local_seed = (
                seed_base
                ^ int(
                    hashlib.sha256(f"{uf}:{metric}".encode("utf-8")).hexdigest()[:8],
                    16,
                )
            ) & 0xFFFFFFFF
            uf_result[metric] = estimate_uf_participacao(
                zonas, metric, pct_apurado_uf, local_seed
            )
        by_uf[uf] = uf_result

    nacional: dict[str, ParticipacaoEstimate | None] = {}
    for metric in metrics:
        per_uf_estimates = {uf: r.get(metric) for uf, r in by_uf.items()}
        nacional[metric] = aggregate_national_participacao(
            per_uf_estimates, eleitorado_total_by_uf
        )

    return by_uf, nacional


def _national_votos_por_candidato(
    municipio_aggregates: dict[tuple[str, int], dict[str, Any]],
) -> tuple[dict[int, int], int]:
    """Soma `votos_por_candidato`/`total_votos` de TODOS os municípios
    (todas as UFs) — usado para popular `pct_atual` nacional real
    (Fase 1a §1a.2) a partir do MESMO dado já lido por
    `fetch_municipio_aggregates` (sem query adicional).
    """
    votos: dict[int, int] = {}
    total = 0
    for _key, agg in municipio_aggregates.items():
        total += int(agg.get("total_votos") or 0)
        for cid, v in agg.get("votos_por_candidato", {}).items():
            cid_int = int(cid)
            votos[cid_int] = votos.get(cid_int, 0) + int(v)
    return votos, total


class CargoProporcionalError(ValueError):
    """Cargo proporcional entrou onde só cabe corrida majoritária.

    Não é um erro de digitação de quem chamou: é a barreira que impede um
    agregado nacional inválido de sair publicado com cara de válido (design
    017, D3). Ver `compute_national`.
    """


def _e_proporcional(cargo: int) -> bool:
    """O cargo elege por lista proporcional? (`lib/config/cargos.ts`)."""
    info = cargo_info(cargo)
    return bool(info is not None and info["proporcional"])


def compute_national(
    cargo: int,
    turno: int,
    estimates_by_uf: dict[str, dict[int, np.ndarray]],
    eleitorado_total_by_uf: dict[str, int],
    votos_by_uf: dict[int, int] | None = None,
) -> tuple[
    list[dict[str, Any]],
    float,
    int | None,
    int | None,
    tuple[np.ndarray, int],
]:
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
        - `outros`: `(estimates, n_candidatos)` de `compute_outros_estimates`
          (D4 — "Outros" com IC real, soma de resamples de rank >= 4).
          `n_candidatos == 0` se <4 candidatos na corrida.

    `votos_by_uf` (RF-014, plano § B): `{cod_candidato: total_votos}` já
    somado UF -> Brasil por `extrapolation.aggregate_national_votos` —
    quando fornecido, popula `rows[*]["votos_projetados"]` com o total
    REAL (em vez de `None`). Assinatura estável para callers legados
    (`replay_batch.py`) que não têm esse dado.

    **Cargo proporcional é RECUSADO** (design 017, D3; `CargoProporcionalError`).
    Esta função agrega por `candidato_id`, que na corrida proporcional é o
    número de urna — e ele se repete entre UFs e entre partidos. Agregar por
    ele funde candidatos distintos: as linhas por UF continuam certas e a linha
    nacional sai inválida, sem erro nenhum. A visão nacional do Deputado é a
    **bancada** (`api/model/deputado_payload.py`), que é soma de 27 corridas, e
    não uma estimativa nacional.

    Raises:
        CargoProporcionalError: cargo com `proporcional: true` em
            `lib/config/cargos.ts` (hoje, o 6 — Deputado Federal).
    """
    if _e_proporcional(cargo):
        raise CargoProporcionalError(
            f"cargo {cargo} é proporcional — `compute_national` agrega por número "
            "de urna, que se repete entre UFs e partidos nesta corrida. A visão "
            "nacional do Deputado Federal é a bancada somada das 27 UFs "
            "(`api/model/deputado_payload.py`), não um agregado de candidatos."
        )

    _empty_outros: tuple[np.ndarray, int] = (np.zeros(0, dtype=np.float64), 0)

    # Reúne candidatos vistos.
    all_candidates: set[int] = set()
    for cand_map in estimates_by_uf.values():
        all_candidates.update(cand_map.keys())

    if not all_candidates:
        return [], 0.0, None, None, _empty_outros

    # Determina shape do array nacional pelo primeiro estimates não vazio.
    sample_arr: np.ndarray | None = None
    for cand_map in estimates_by_uf.values():
        for arr in cand_map.values():
            sample_arr = arr
            break
        if sample_arr is not None:
            break
    if sample_arr is None:
        return [], 0.0, None, None, _empty_outros

    n_resamples = sample_arr.shape[0]

    national_estimates: dict[int, np.ndarray] = {}
    total_eleitorado = sum(eleitorado_total_by_uf.values())
    if total_eleitorado <= 0:
        return [], 0.0, None, None, _empty_outros

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
        return [], 0.0, None, None, _empty_outros

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

    # D4 — "Outros" com IC real: soma de resamples de rank >= 4. Zero novo
    # bootstrap, zero random (mesma filosofia de `p_passa_2t`/`p_fecha_1t`
    # acima — pura função dos `national_estimates` já computados).
    outros = compute_outros_estimates(national_estimates, rank_by_cand, min_rank=4)

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
        # Escala (docs/architecture/data-model.md § "Escala de percentuais"):
        # `point`/`ci_lower`/`ci_upper` vêm de `national_estimates` (fração
        # [0,1], mesmo espaço de `estimates_by_uf`). `rows` — consumido por
        # `insert_projections`, `build_uf_payloads`, `build_edge_payload` —
        # espera 0–100. `p_vitoria` continua em [0,1] (é probabilidade, não
        # percentual).
        rows.append(
            {
                "cargo": cargo,
                "turno": turno,
                "uf": None,  # NULL = nacional
                "candidato_id": cand,
                "votos_projetados": (
                    int(votos_by_uf.get(cand, 0)) if votos_by_uf is not None else None
                ),
                "pct_projetado": _frac_to_pct(point),
                "pct_projetado_lower": _frac_to_pct(ci_lower),
                "pct_projetado_upper": _frac_to_pct(ci_upper),
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

    return rows, p_a, cand_a, cand_b, outros


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
    """Base URL para o endpoint Node `/api/internal/edge-write`.

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
    zona_municipio: dict[tuple[str, int, int], dict[str, Any]],
    series_by_uf: dict[str, list[dict[str, Any]]],
    estimates_by_uf: dict[str, dict[int, np.ndarray]] | None = None,
    participacao_by_uf: dict[str, dict[str, ParticipacaoEstimate | None]] | None = None,
    estimates_c_by_uf: dict[str, dict[int, np.ndarray]] | None = None,
    p_eleito_by_uf: dict[str, dict[int, float]] | None = None,
    vagas: int | None = None,
    partido_by_cand: dict[int, str] | None = None,
) -> dict[str, dict[str, Any]]:
    """Constrói payloads canônicos `EdgePayloadUf` por UF (S04/F2).

    Adicionado em S04/F2 para enriquecer o drill-down de UF com:
      - candidatos com `votos_atuais` e `votos_projetados` (rateio do
        total UF pelo pct_atual/pct_projetado de cada candidato);
      - lista `municipios` populada (`cod_ibge`, `nome`, `pct_apurado`,
        `lider {id, partido, votos, margem_pp}`, `votos_reportados`);
      - `series_temporais` (margem, p_vitoria, turnout) lidas de
        `projections` ordenadas por ts ASC.

    Fase 1a (RF-020.1, D3/D4/D5/D6) acrescenta, quando os parâmetros
    opcionais são passados:
      - `estimates_by_uf`: `{uf: {cand_id: ndarray}}` (mesmo output de
        `compute_uf_projections`) — usado para "Outros" com IC real
        (`compute_outros_estimates`, rank LOCAL da UF — top-3 da corrida
        estadual, não o rank nacional usado para cor).
      - `participacao_by_uf`: `{uf: {"abstencao": Estimate|None,
        "brancos_nulos": Estimate|None}}` (output de
        `compute_participacao`) — regra de três por UF.
    Ambos `None` (default, compat retroativa) → `uf_payload` não ganha a
    chave `participacao` (mesmo comportamento anterior à Fase 1a).

    Spec 016 (Senador) acrescenta mais três parâmetros opcionais, todos
    `None` por default e todos emitindo campos OPCIONAIS do contrato TS —
    a mesma disciplina de `eleitores?`/`capital?` no ADR-0035 D2, para que
    um Global Config já gravado e as fixtures existentes sigam válidos:
      - `p_eleito_by_uf` (RF-103): `{uf: {cand: p}}` de
        `compute_p_eleito_by_uf`. Vira `candidatos[].p_eleito`.
      - `vagas` (RF-105/RF-106): quantas cadeiras a UF elege neste cargo.
        Vira `EdgePayloadUf.vagas` — é o que permite a tela marcar DUAS
        linhas de vaga sem hardcodar "2" na UI.
      - `partido_by_cand` (RF-107): `{cand: sigla}` de
        `extract_partido_by_cand`. Tem PRECEDÊNCIA sobre o `partido` das
        linhas nacionais, que em produção nunca foi populado.

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
    # (+ mesorregiao_cod/_nome quando disponíveis — S06/F4d; + eleitores/
    # capital desde a migration 0006 — decisão D-d do plano de 11/09).
    # A chave de `zona_municipio` é a tripla do par, mas só os VALORES
    # importam aqui — várias zonas do mesmo município colapsam na mesma
    # entrada (primeira vence; todas trazem os mesmos dados do município).
    munic_meta: dict[tuple[str, int], dict[str, Any]] = {}
    for _chave, z_meta in zona_municipio.items():
        key = (z_meta["uf"], z_meta["cod_municipio_tse"])
        if key not in munic_meta:
            munic_meta[key] = {
                "cod_ibge": z_meta["cod_ibge"],
                "nome": z_meta["nome"],
                "mesorregiao_cod": z_meta.get("mesorregiao_cod"),
                "mesorregiao_nome": z_meta.get("mesorregiao_nome"),
                "eleitores": z_meta.get("eleitores"),
                "capital": z_meta.get("capital"),
            }

    out: dict[str, dict[str, Any]] = {}
    for sigla in sorted(uf_by_sigla.keys()):
        rows = uf_by_sigla[sigla]
        # pct_apurado é o mesmo em todas as rows da UF.
        pct_apurado_uf = float(rows[0].get("pct_apurado") or 0.0)

        # Top-2 por pct_projetado para identificar líder e segundo (estável).
        ordered = sorted(
            rows, key=lambda r: float(r.get("pct_projetado") or 0.0), reverse=True
        )
        top = ordered[0] if ordered else None
        second = ordered[1] if len(ordered) >= 2 else None

        # Margem usada nas séries / display (não vai pra payload aqui — já vem
        # via candidato.pct_projetado).

        # Constrói candidatos: cada candidato da UF + voto absoluto rateado.
        # `local_rank_by_cand` — rank LOCAL da corrida da UF (1 = líder
        # estadual), distinto de `rank_by_cand` (rank NACIONAL usado só
        # para cor). "Outros" da UF (Fase 1a) usa o rank local — top-3 da
        # disputa estadual, não do ranking nacional.
        candidatos: list[dict[str, Any]] = []
        local_rank_by_cand: dict[int, int] = {}
        comparecimento_by_cid: dict[int, dict[str, Any] | None] = {}
        for idx, r in enumerate(ordered):
            cid = int(r["candidato_id"])
            local_rank_by_cand[cid] = idx + 1
            pct_proj = float(r.get("pct_projetado") or 0.0)
            pct_proj_lower = float(r.get("pct_projetado_lower") or pct_proj)
            pct_proj_upper = float(r.get("pct_projetado_upper") or pct_proj)

            # Fase 1 (plano § A/B): `pct_atual`/`votos_atuais`/
            # `votos_projetados` vêm DIRETO do `row` — resultado real de
            # `compute_uf_projections`/`extrapolation.estimate_uf_
            # candidatos` (regra de três), não mais um rateio aproximado
            # de `municipio_aggregates`. `pct_atual` pode ser `None`
            # (UF/candidato imputado via `impute_uf_from_national`) — o
            # payload degrada para `0.0` (nunca `None` — contrato TS
            # espera `number`).
            pct_atual_raw = r.get("pct_atual")
            pct_atual = float(pct_atual_raw) if pct_atual_raw is not None else 0.0
            votos_cand = int(r.get("votos_atuais") or 0)
            votos_proj = int(r.get("votos_projetados") or 0)
            comparecimento_by_cid[cid] = r.get("comparecimento")

            nat = national_by_id.get(cid, {})
            # S05/F4c (ADR-0013) — paleta visual por rank semântico.
            rank_cand = rank_by_cand.get(cid, len(candidatos) + 1)
            # Spec 016 — a sigla lida do próprio EA20 (`par.sg`) vem primeiro;
            # o `partido` da linha nacional fica como fallback para os callers
            # de teste que o passam à mão.
            partido_cand = (partido_by_cand or {}).get(cid) or str(
                nat.get("partido", "—")
            )
            candidato_payload: dict[str, Any] = {
                "id": cid,
                "nome": f"Candidato {cid}",
                "partido": partido_cand,
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
            # E2/E2b (plano § A/C) — base "comparecimento" alternativa,
            # só presente quando `_uf_projection_row` a calculou (sempre
            # o caso na Fase 1, exceto callers legados de teste que não
            # passam por `compute_uf_projections`).
            comp = comparecimento_by_cid[cid]
            if comp is not None:
                candidato_payload["comparecimento"] = {
                    "pct_atual": comp.get("pct_atual"),
                    "pct_projetado": comp.get("pct_projetado"),
                    "lower": comp.get("lower"),
                    "upper": comp.get("upper"),
                }
            # RF-103 — probabilidade de terminar entre os `vagas` primeiros.
            # Só aparece quando foi de fato calculada: um `0.0` default diria
            # "este candidato não se elege em cenário nenhum", que é uma
            # afirmação, não uma ausência de dado.
            p_el = (p_eleito_by_uf or {}).get(sigla, {}).get(cid)
            if p_el is not None:
                candidato_payload["p_eleito"] = float(p_el)
            candidatos.append(candidato_payload)

        # Fase 1a (RF-020.1, D3/D4/D5/D6) — bloco `participacao` da UF.
        # "Outros" (D4): soma de resamples de rank LOCAL >= 4 via
        # `estimates_by_uf[sigla]` (candidatos ainda não presentes em
        # `estimates_by_uf` — fallback legado sem parâmetro — resultam em
        # `outros_uf = None`, chave omitida, comportamento pré-Fase 1a).
        outros_uf: dict[str, Any] | None = None
        cand_map_uf = (estimates_by_uf or {}).get(sigla)
        if cand_map_uf:
            outros_estimates_uf, n_outros_uf = compute_outros_estimates(
                cand_map_uf, local_rank_by_cand, min_rank=4
            )
            outros_uf = _outros_metric_payload(outros_estimates_uf, n_outros_uf)
            if outros_uf is not None:
                # `pct_atual` real da cauda: soma dos `pct_atual` (base
                # votáveis, LITERAL) dos candidatos com rank local >= 4 —
                # sourced direto do `row` (plano § B), não mais de
                # `municipio_aggregates`. `None` para algum candidato da
                # cauda (UF/candidato imputado) => "sem dado real" fica
                # `None` (nunca um `0.0` falso — mesma semântica de
                # `outros_nacional` em `build_edge_payload`).
                tail_ids = [
                    int(r2["candidato_id"])
                    for r2 in ordered
                    if local_rank_by_cand.get(int(r2["candidato_id"]), 0) >= 4
                ]
                tail_pct_atual = [
                    r2.get("pct_atual")
                    for r2 in ordered
                    if int(r2["candidato_id"]) in tail_ids
                ]
                if tail_pct_atual and all(v is not None for v in tail_pct_atual):
                    outros_uf["pct_atual"] = sum(float(v) for v in tail_pct_atual)

                # Plano § B — "outros" na 2a base (comparecimento), campo
                # aninhado `outros.comparecimento` (`EdgeBaseComparecimento`
                # via `types.ts`), mesma filosofia de `candidato.comparecimento?`.
                cand_map_uf_c = (estimates_c_by_uf or {}).get(sigla)
                if cand_map_uf_c:
                    outros_est_c, n_outros_c = compute_outros_estimates(
                        cand_map_uf_c, local_rank_by_cand, min_rank=4
                    )
                    if n_outros_c > 0:
                        tail_pct_atual_c = [
                            (comparecimento_by_cid.get(cid) or {}).get("pct_atual")
                            for cid in tail_ids
                        ]
                        pct_atual_c = (
                            sum(float(v) for v in tail_pct_atual_c)
                            if tail_pct_atual_c and all(v is not None for v in tail_pct_atual_c)
                            else None
                        )
                        outros_uf["comparecimento"] = {
                            "pct_atual": pct_atual_c,
                            "pct_projetado": _frac_to_pct(float(np.mean(outros_est_c))),
                            "lower": _frac_to_pct(
                                float(np.percentile(outros_est_c, 2.5))
                            ),
                            "upper": _frac_to_pct(
                                float(np.percentile(outros_est_c, 97.5))
                            ),
                        }

        part_est_uf = (participacao_by_uf or {}).get(sigla, {})
        metodo_row = rows[0].get("metodo") if rows else None
        participacao_uf_payload = build_participacao_payload(
            part_est_uf.get("abstencao"),
            part_est_uf.get("brancos_nulos"),
            outros_uf,
            pct_apurado_uf,
            metodo_tipo=(metodo_row or {}).get("tipo", "extrapolacao_apurado"),
            n_zonas_imputadas=(metodo_row or {}).get("n_zonas_imputadas", 0),
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
            # Migration 0006 / decisão D-d — ambos OPCIONAIS no contrato TS
            # (`EdgeUfMunicipio.eleitores?` / `.capital?`): Blobs já gravados e
            # a fixture `tests/fixtures/blob/uf-municipios-pres-t1.json`
            # continuam válidos sem eles. Só emitimos quando o dado existe de
            # fato — `eleitores` é Σ dos pares do município (sem rateio),
            # `capital` é o seed estático das 27 capitais.
            # `capital` só aparece quando é `true` (são 27 em ~5.570
            # municípios): ausência == não-capital para o consumidor, e o
            # payload da UF não paga por 644 `"capital": false`.
            if meta.get("eleitores") is not None:
                payload_row["eleitores"] = int(meta["eleitores"])
            if meta.get("capital"):
                payload_row["capital"] = True
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
        # Spec 016 — quantas cadeiras esta UF elege no cargo (RF-105/RF-106) e
        # em que unidade a regra de três rodou (RF-102/RF-108). Os dois campos
        # são opcionais no contrato TS: sem eles, o consumidor cai no
        # comportamento de 1 vaga e não afirma granularidade nenhuma.
        if vagas is not None:
            uf_payload["vagas"] = int(vagas)
        granularidade_uf = (metodo_row or {}).get("granularidade")
        if granularidade_uf:
            uf_payload["granularidade"] = granularidade_uf

        # S06/F4d — só inclui `mesorregioes` quando há dado real
        # (≥ 1 mesorregião derivada). Campo é opcional em
        # `EdgePayloadUf`; omiti-lo quando vazio sinaliza "indisponível"
        # (consumidor esconde o bloco UI) em vez de "zero mesorregiões".
        if mesorregioes_payload:
            uf_payload["mesorregioes"] = mesorregioes_payload
        # Fase 1a (RF-020.1, D6) — `participacao?` só aparece quando pelo
        # menos uma métrica pôde ser calculada (ver `build_participacao_payload`).
        if participacao_uf_payload is not None:
            uf_payload["participacao"] = participacao_uf_payload

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
    municipio_aggregates: dict[tuple[str, int], dict[str, Any]] | None = None,
    participacao_nacional: dict[str, ParticipacaoEstimate | None] | None = None,
    outros_nacional: dict[str, Any] | None = None,
    national_estimates_comparecimento: dict[int, np.ndarray] | None = None,
    partido_by_cand: dict[int, str] | None = None,
    vagas: int | None = None,
    vagas_em_disputa: int | None = None,
    total_cadeiras: int | None = None,
) -> dict[str, Any]:
    """Monta o shape canônico `EdgePayload` (lib/edge-config/types.ts).

    Spec 016 (Senador) acrescenta três parâmetros opcionais:
      - `partido_by_cand` (RF-107) — `{cand: sigla}` lido do próprio EA20
        por `extract_partido_by_cand`. Substitui o `"—"` literal que este
        método escrevia em `national.candidatos[].partido` desde a S03.
      - `vagas` (RF-105/RF-107) — cadeiras por UF neste cargo. Quando
        `>= 2`, dispara o bloco `composicao_vagas`.
      - `vagas_em_disputa` (RF-107) — quantas cadeiras a eleição renova
        (54 no Senado em 2026). É um fato da eleição, declarado em
        `api/model/cargos.py`, e NÃO uma contagem de UFs presentes no
        ciclo: derivá-lo de `por_uf` faria o denominador encolher quando
        um estado ainda não apurou, e o leitor veria "de 48 vagas" às 18h
        e "de 54" às 22h.
      - `total_cadeiras` (RF-107) — tamanho da casa legislativa inteira
        (81 no Senado), para a tela poder distinguir as vagas EM DISPUTA
        do total. Sem ele o bloco sai sem o denominador maior, nunca com
        um número inventado.

    Fase 1a (RF-020.1, D3/D4/D5/D6) acrescenta 3 parâmetros opcionais,
    todos com default `None` (compat retroativa — sem eles o payload sai
    idêntico ao pré-Fase 1a):
      - `municipio_aggregates`: mesmo dado de `fetch_municipio_aggregates`
        (TODAS as UFs, sem filtro) — usado para popular `pct_atual` REAL
        de cada candidato nacional (antes hardcoded `0.0`) e o `pct_atual`
        de "outros" (soma da cauda rank >= 4).
      - `participacao_nacional`: `{"abstencao": Estimate|None,
        "brancos_nulos": Estimate|None}` (output de
        `compute_participacao`, campo `nacional`).
      - `outros_nacional`: dict já no shape `participacao.outros` (output
        de `_outros_metric_payload` sobre o 5º elemento de
        `compute_national`), com `pct_atual: None` — este método preenche
        o `pct_atual` real usando `municipio_aggregates` antes de anexar.
    `national.participacao` só aparece quando pelo menos uma das 3 chaves
    (`abstencao`/`brancos_nulos`/`outros`) tem dado real
    (`build_participacao_payload` decide).

    Plano § B (regra de três, sem 2022) acrescenta:
      - `pct_atual`/`votos_atuais` por candidato nacional agora vêm de
        `uf_rows` (razão de somas dos `votos_atuais` reais de
        `compute_uf_projections`/`extrapolation.estimate_uf_candidatos`),
        não mais de `municipio_aggregates` — que fica como FALLBACK
        (útil quando `uf_rows` vem de um caller legado sem os campos
        novos, ex.: testes antigos).
      - `votos_projetados` real vem de `national_rows[*]["votos_projetados"]`
        (populado por `compute_national(..., votos_by_uf=...)`,
        `aggregate_national_votos`).
      - `comparecimento?` por candidato nacional — bootstrap agregado de
        `national_estimates_comparecimento` (mesmo formato de
        `aggregate_national_estimates`, mas sobre `estimates_c_by_uf`).
        `pct_atual` desta base fica `None` na Fase 1 (não há um total
        nacional de comparecimento agregado ainda — simplificação
        documentada, ver relatório da tarefa).
      - `participacao.outros.comparecimento?` — mesma filosofia, soma de
        resamples de rank >= 4 sobre `national_estimates_comparecimento`.

    v1 (S03):

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
    #
    # Itera pela UNIÃO de `eleitorado_total_by_uf` (todas as UFs
    # conhecidas, RF-008) e `uf_by_sigla` (UFs com ao menos 1 linha em
    # `uf_rows`) — não só as últimas. Uma UF pode faltar inteiramente de
    # `uf_rows` quando NENHUMA zona sua apareceu em `snapshots` ainda
    # (todas as respostas do TSE foram 404 "sem dados", `app/api/ingest/
    # route.ts`) — nesse caso `compute_uf_projections` nunca a processa
    # (RF-017 hoje só cobre UFs presentes com estimativa `None`, não UFs
    # ausentes de ponta a ponta; achado do model-validator, 2026-09-06,
    # gêmeo do bug do denominador de `uf_pct_apurado`). Sem esta união, a
    # UF ficava fora do numerador E do denominador — inflando
    # artificialmente `pct_apurado_total` bem no início da apuração
    # (exatamente quando ele é mais visível). Trata a UF ausente como 0%
    # apurado (correto: ela não apurou nada), contribuindo com seu peso
    # cheio ao denominador.
    pct_total_num = 0.0
    pct_total_den = 0.0
    ufs_apuradas = 0
    todas_siglas = set(eleitorado_total_by_uf.keys()) | set(uf_by_sigla.keys())
    for sigla in todas_siglas:
        rows = uf_by_sigla.get(sigla)
        # rows são por candidato — pct_apurado vem repetido (é da UF, não do
        # candidato). Usa o primeiro. UF sem nenhuma linha -> 0% (não
        # apurou nada ainda), não "ausente do cálculo".
        pct_uf = float(rows[0].get("pct_apurado") or 0.0) if rows else 0.0
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

    # Plano § B — `votos_atuais`/`pct_atual` nacional REAIS: razão de
    # somas a partir dos `votos_atuais` já calculados por UF (`uf_rows`,
    # `compute_uf_projections`/`extrapolation.estimate_uf_candidatos`).
    # PRIMÁRIO. `municipio_aggregates` fica como FALLBACK para callers
    # legados (testes antigos) que passam `uf_rows` sem os campos novos.
    votos_atuais_nat: dict[int, int] = {}
    total_votos_atuais_nat = 0
    for r in uf_rows:
        if r.get("uf") is None or r.get("votos_atuais") is None:
            continue
        cid_r = int(r["candidato_id"])
        va = int(r["votos_atuais"])
        votos_atuais_nat[cid_r] = votos_atuais_nat.get(cid_r, 0) + va
        total_votos_atuais_nat += va

    votos_por_cand_nat: dict[int, int] = {}
    total_votos_nat = 0
    if total_votos_atuais_nat > 0:
        votos_por_cand_nat, total_votos_nat = votos_atuais_nat, total_votos_atuais_nat
    elif municipio_aggregates:
        votos_por_cand_nat, total_votos_nat = _national_votos_por_candidato(
            municipio_aggregates
        )

    national_candidatos: list[dict[str, Any]] = []
    pct_atual_outros_sum = 0.0
    for r in sorted_national:
        # S05/F4c (ADR-0013): paleta visual por RANK (`var(--color-cand-N)`),
        # não por partido. `rank` vem populado de `compute_national`; se
        # ausente (caller legado), coalesce para a posição+1 no array.
        rank = int(r.get("rank") or (len(national_candidatos) + 1))
        cid = int(r["candidato_id"])
        pct_atual_cand = (
            100.0 * votos_por_cand_nat.get(cid, 0) / total_votos_nat
            if total_votos_nat > 0
            else 0.0
        )
        if rank >= 4:
            pct_atual_outros_sum += pct_atual_cand
        candidato_nat: dict[str, Any] = {
            "id": cid,
            "nome": f"Candidato {r['candidato_id']}",
            # Spec 016 — a sigla vem do próprio EA20 (`par.sg`, colhido por
            # `extract_partido_by_cand`). O `"—"` continua sendo o valor
            # quando o snapshot não carrega a hierarquia de partido (payload
            # achatado legado do replay 2022) ou quando o caller não passou o
            # mapa — nunca um chute.
            "partido": (partido_by_cand or {}).get(cid, "—"),
            # CSS var literal — consumida direto em `style={{ background: c.cor }}`
            # no front-end (sem resolução intermediária). Constituição § 2:
            # nunca hex partidário, sempre token canônico de app/globals.css.
            # ADR-0013: paleta DINÂMICA por rank, --color-cand-{1..11}.
            "cor": f"var(--color-cand-{rank})",
            "votos_atuais": votos_por_cand_nat.get(cid, 0),
            "votos_projetados": int(r.get("votos_projetados") or 0),
            "pct_atual": pct_atual_cand,
            "pct_projetado": float(r.get("pct_projetado") or 0.0),
            "pct_projetado_lower": float(r.get("pct_projetado_lower") or 0.0),
            "pct_projetado_upper": float(r.get("pct_projetado_upper") or 0.0),
            "p_vitoria": float(r.get("p_vitoria") or 0.0),
            # S05/F4c (ADR-0014) — métricas multi-candidato.
            "rank": rank,
            "p_passa_2t": float(r.get("p_passa_2t") or 0.0),
            "p_fecha_1t": float(r.get("p_fecha_1t") or 0.0),
        }
        # Plano § B (E2/E2b) — base "comparecimento" nacional, agregada de
        # `national_estimates_comparecimento` (mesmo bootstrap agregado de
        # `estimates_c_by_uf`, ver `_do_project`). `pct_atual` fica `None`
        # nesta base na Fase 1 (sem total nacional de comparecimento
        # agregado ainda — simplificação documentada).
        if national_estimates_comparecimento is not None:
            arr_c = national_estimates_comparecimento.get(cid)
            if arr_c is not None:
                candidato_nat["comparecimento"] = {
                    "pct_atual": None,
                    "pct_projetado": _frac_to_pct(float(np.mean(arr_c))),
                    "lower": _frac_to_pct(float(np.percentile(arr_c, 2.5))),
                    "upper": _frac_to_pct(float(np.percentile(arr_c, 97.5))),
                }
        national_candidatos.append(candidato_nat)

    # Fase 1a — patch `pct_atual` de "outros" com o dado real recém
    # computado (só quando houve alguma fonte de votos reais; sem ela,
    # `outros_nacional["pct_atual"]` permanece `None`, vindo de
    # `_outros_metric_payload`).
    if outros_nacional is not None and total_votos_nat > 0:
        outros_nacional = {**outros_nacional, "pct_atual": pct_atual_outros_sum}

    # Plano § B — "outros" nacional na 2a base (comparecimento), campo
    # aninhado `outros.comparecimento`, mesma filosofia da UF.
    if outros_nacional is not None and national_estimates_comparecimento:
        rank_by_cand_nat = {
            int(r["candidato_id"]): int(r.get("rank") or 0) for r in national_rows
        }
        outros_est_c, n_outros_c = compute_outros_estimates(
            national_estimates_comparecimento, rank_by_cand_nat, min_rank=4
        )
        if n_outros_c > 0:
            outros_nacional = {
                **outros_nacional,
                "comparecimento": {
                    "pct_atual": None,
                    "pct_projetado": _frac_to_pct(float(np.mean(outros_est_c))),
                    "lower": _frac_to_pct(float(np.percentile(outros_est_c, 2.5))),
                    "upper": _frac_to_pct(float(np.percentile(outros_est_c, 97.5))),
                },
            }

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

    # RF-107 (spec 016) — composição das vagas EM DISPUTA por partido.
    #
    # Isto é **agregação**, não estimativa: é a contagem de quantas UFs têm um
    # candidato daquele partido entre os `vagas` primeiros da projeção. Nenhum
    # modelo novo roda aqui (constituição § 6 — a UI e o agregador não
    # inventam número), e é por isso que o campo pode existir mesmo sem o TSE
    # publicar um arquivo `br-` para o cargo (`temArquivoBr: false` em
    # `lib/config/cargos.ts`; open question 2 da spec 016).
    #
    # `ufs_aguardando` não é decoração: uma UF sem nenhum boletim não aparece
    # em `uf_rows` e portanto não entrega vaga nenhuma. Publicar só a contagem
    # por partido faria a soma não fechar em 54 e o leitor concluir que faltam
    # vagas, quando o que falta é apuração.
    composicao_por_partido: dict[str, int] = {}
    ufs_com_projecao = 0

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

        if vagas is not None and vagas >= 2:
            ufs_com_projecao += 1
            eleitos_da_uf = ordered[: int(vagas)]
            for r_eleito in eleitos_da_uf:
                sigla_partido = (partido_by_cand or {}).get(
                    int(r_eleito["candidato_id"]), "—"
                )
                composicao_por_partido[sigla_partido] = (
                    composicao_por_partido.get(sigla_partido, 0) + 1
                )

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
                # `None`, nunca 0.0. Sob a constituição 1.2 (§ 8) a comparação
                # com 2022 é um FATO OBSERVADO exibido ao leitor, não mais um
                # insumo interno do modelo — e `0.0` em toda UF afirmaria na
                # tela que "nenhuma UF mudou desde 2022", que é falso. O tipo
                # `EdgeUfRow.swing_vs_2022` já é `number | null` e a UI já
                # renderiza "—" para null. O valor real passa a ser calculado
                # por `compute_swing_descritivo` na Fase 5 (ADR-0021), a partir
                # de `historical_results.votos`. Achado HIGH do
                # `constitution-guard` em 2026-09-05.
                "swing_vs_2022": None,
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

    # Fase 1a (RF-020.1, D6) — `national.participacao?`. Omitido inteiro
    # se nenhuma das 3 métricas (abstenção/brancos-nulos/outros) tem dado
    # real (`build_participacao_payload` decide).
    # RF-107 — o bloco só existe para cargo de mais de uma vaga por UF
    # (Senador). `vagas_em_disputa` é 27 × `vagas` sempre, não a contagem do
    # que já apurou: são as vagas que a eleição renova, e esse número não
    # muda ao longo da noite. `total_cadeiras` é a casa inteira (81 no
    # Senado) — omitido quando o caller não o informa, porque um default
    # inventado ali seria um fato falso sobre a composição do Senado.
    composicao_vagas: dict[str, Any] | None = None
    if vagas is not None and vagas >= 2:
        por_partido = sorted(
            (
                {"partido": sg, "vagas": n}
                for sg, n in composicao_por_partido.items()
            ),
            # Ordem determinística (§ 6): mais vagas primeiro, sigla como
            # desempate estável.
            key=lambda d: (-int(d["vagas"]), str(d["partido"])),
        )
        ufs_total = (
            vagas_em_disputa // vagas if vagas_em_disputa else len(uf_by_sigla)
        )
        composicao_vagas = {
            "vagas_por_uf": int(vagas),
            "ufs_projetadas": ufs_com_projecao,
            "ufs_aguardando": max(0, ufs_total - ufs_com_projecao),
            "vagas_projetadas": sum(composicao_por_partido.values()),
            "por_partido": por_partido,
            **(
                {"vagas_em_disputa": int(vagas_em_disputa)}
                if vagas_em_disputa
                else {}
            ),
            **({"total_cadeiras": int(total_cadeiras)} if total_cadeiras else {}),
        }

    _participacao_src = participacao_nacional or {}
    participacao_payload = build_participacao_payload(
        _participacao_src.get("abstencao"),
        _participacao_src.get("brancos_nulos"),
        outros_nacional,
        pct_apurado_total,
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
            # Fase 1a (RF-020.1, D6) — só presente quando há dado real.
            **(
                {"participacao": participacao_payload}
                if participacao_payload is not None
                else {}
            ),
        },
        "por_uf": por_uf,
        "insights": [],
        "composition": {
            "pre_election": 0.0,
            "model": 1.0,
            "actual_results": 0.0,
        },
        # RF-107 — presente só em cargo de 2+ vagas por UF (hoje, Senador).
        **({"composicao_vagas": composicao_vagas} if composicao_vagas else {}),
    }


def _alert_slack(severity: str, msg: str, **ctx: Any) -> None:
    """POST best-effort para o Slack Incoming Webhook — lado Python.

    Não existia equivalente Python a `lib/tse/alerts.ts::notifySlack` antes
    desta função; espelha deliberadamente o mesmo contrato do lado TS (mesma
    env var `SLACK_WEBHOOK_URL`, mesmo formato de mensagem `[SEVERITY] msg` +
    bloco de código com o contexto) para os dois canais renderizarem igual
    no mesmo canal do Slack.

    Best-effort e nunca levanta (constituição § 7 — o alerta não pode
    derrubar o ciclo do modelo): ausência da env var, erro de rede ou 4xx/5xx
    do Slack viram `_log("warn"/"info", ...)`, nunca uma exceção propagada.
    stdlib `urllib.request` pelo mesmo motivo de `post_edge_write` — sem dep
    nova, uma chamada isolada por ciclo, timeout curto.
    """
    webhook_url = os.environ.get("SLACK_WEBHOOK_URL")
    if not webhook_url:
        # `alerta=` e não `msg=`: `_log(level, msg, **ctx)` já tem um parâmetro
        # chamado `msg`, e passá-lo de novo por keyword levanta TypeError. O
        # defeito viveu aqui desde que a função nasceu e só aparecia com
        # `SLACK_WEBHOOK_URL` ausente **e** um alerta disparando — isto é, em
        # todo ambiente sem Slack configurado, exatamente no momento em que
        # algo já tinha dado errado. A função que "nunca levanta" levantava, e
        # o ciclo inteiro virava 500.
        _log(
            "info",
            "slack alert skipped — SLACK_WEBHOOK_URL ausente",
            severity=severity,
            alerta=msg,
        )
        return

    text = f"[{severity.upper()}] {msg}"
    if ctx:
        try:
            text += f"\n```{json.dumps(ctx, default=str, indent=2)}```"
        except Exception:  # noqa: BLE001 — serialização nunca deve derrubar o alerta
            text += "\n[ctx: serialização falhou]"

    body = json.dumps({"text": text}).encode("utf-8")
    req = urllib.request.Request(
        webhook_url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        # 3s: mesmo teto de `lib/tse/alerts.ts` — um Slack lento não pode
        # consumir o orçamento do ciclo do modelo.
        with urllib.request.urlopen(req, timeout=3) as response:
            if response.status < 200 or response.status >= 300:
                _log("warn", "slack alert non-2xx", status=response.status)
    except urllib.error.HTTPError as exc:
        _log("warn", "slack alert http error", status=exc.code, reason=str(exc.reason))
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        _log("warn", "slack alert failed", error=str(exc))


def post_edge_write(
    payload: dict[str, Any],
    payloads_uf: dict[str, dict[str, Any]] | None = None,
) -> None:
    """POST `/api/internal/edge-write` com `{payload, payloads_uf?}`.

    `payloads_uf` (S04/F2): mapa `sigla → EdgePayloadUf` rico (candidatos
    com votos, municípios com margem, séries temporais). Quando presente,
    o endpoint Node grava cada UF na sua chave
    `projection-uf-<SIGLA>-<cargo>-t<turno>` em vez de sintetizar esqueleto
    a partir de `por_uf`. Forward-compat: Zod no endpoint usa `passthrough`,
    então campo extra é aceito.

    **Nomes de chave do Global Config não são construídos deste lado.** O
    Python envia um payload; quem deriva os nomes de chave é o TS, num ponto
    único (`lib/edge-config/keys.ts`), que também os valida contra o padrão
    documentado `^[A-Za-z0-9_-]+$` — dois-pontos NÃO é aceito (emenda ao
    ADR-0012, 2026-09-08). Se um dia for preciso montar chave aqui, a regra
    é espelhar aquele módulo, não reinventar o formato.

    O único componente de chave que sai daqui é `por_uf[].sigla`, que vira
    `projection-uf-<SIGLA>-...`. O endpoint Node valida cada sigla na borda
    (2 letras) e responde 400 se não formar chave válida — falhar no POST é
    melhor que falhar parcialmente na gravação no meio da apuração.

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
    url = f"{base}/api/internal/edge-write"

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


#: Cadência declarada da corrida proporcional, em minutos (RF-128, ADR-0026
#: item 5). Entra no payload para que a tela não a escreva à mão — foi assim
#: que quatro frases do Senador viraram falsas em 11/09.
ATUALIZACAO_MIN_DEPUTADO = 15

#: UFs da eleição. Não é configuração nem contagem do ciclo: é quantas
#: circunscrições a Câmara tem. Derivar de quem já apurou faria
#: `ufs_aguardando` valer zero a noite inteira, e a soma "fecharia" mentindo.
UFS_DA_ELEICAO = 27


def _do_project_proporcional(
    req: ProjectRequest, t0: int
) -> tuple[int, dict[str, Any]]:
    """Ciclo do cargo proporcional — Deputado Federal (spec 017, design D5/D6).

    É um caminho separado do majoritário, e não um `if` dentro dele, porque
    quase nada do outro se aplica: não há líder da corrida, não há duelo, não há
    agulha, e o bootstrap por zona não existe (o cargo 6 é ingerido em
    granularidade **UF**, ADR-0026 item 1 — 27 alvos por ciclo). O que existe é
    a aritmética do ADR-0027 sobre o voto apurado de cada UF, somada em bancada.

    O que este caminho **não** faz, e por quê:

      - **Não chama `compute_national`.** Ela agrega por número de urna, que se
        repete no proporcional (D3) — a guarda de lá recusaria de qualquer
        forma, e recusar é o ponto.
      - **Não grava em `projections`.** A tabela é de linha por candidato com
        `pct_projetado`/`p_vitoria`, grandezas que não existem aqui. A
        persistência append-only da corrida (constituição § 10) é a de
        `snapshots`, que a ingestão já faz — nada se perde.
      - **Não projeta voto ainda.** As cadeiras saem do voto **apurado** até o
        instante do ciclo. O intervalo de RF-127 (`cadeiras_ci95`) é opcional no
        contrato de propósito (D7) e entra quando a medição de custo permitir.
    """
    with _open_conn() as conn:
        # Uma linha por (uf, município, zona). Em granularidade UF isso é uma
        # linha por UF, com os sentinelas `cod_zona = 0` / `cod_municipio_tse
        # = 0` (`lib/tse/targets.ts::buildUfTarget`). Linhas de zona de um
        # ciclo antigo, se existirem, são SOMADAS por `combinar_entradas` —
        # nunca escolhidas uma e descartadas as outras.
        snapshots = fetch_snapshots(conn, req.cargo, req.turno)
        try:
            eleitorado = fetch_eleitorado(conn, ano=2026)
        except Exception as exc:  # noqa: BLE001 — pesa o pct, não decide cadeira
            # O eleitorado só pondera o `pct_apurado_total`. Perdê-lo degrada
            # esse número (cai para média simples); derrubar o ciclo por causa
            # dele apagaria a bancada inteira da tela (constituição § 7).
            _log("warn", "fetch_eleitorado falhou no ciclo proporcional", error=str(exc))
            eleitorado = {}
            try:
                conn.rollback()
            except Exception:  # noqa: BLE001 — autocommit ou sem transação
                pass

    eleitorado_total_by_uf = _eleitorado_total_by_uf(eleitorado)

    por_uf: dict[str, list[LatestSnapshot]] = {}
    for row in snapshots:
        sigla = str(row.get("uf") or "").strip().upper()
        if not sigla or sigla == "BR":
            continue
        por_uf.setdefault(sigla, []).append(row)

    if not por_uf:
        _log(
            "warn",
            "sem snapshots para cargo proporcional — modelo nao executa",
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

    ufs: list[UfProporcional] = []
    divergencias_por_uf: dict[str, list[dict[str, Any]]] = {}
    n_calculadas = 0

    for sigla in sorted(por_uf):
        linhas = por_uf[sigla]
        entrada = combinar_entradas(
            [extrair_entrada_proporcional(linha.get("payload"), cargo=req.cargo) for linha in linhas]
        )
        # Com uma linha por UF (o caso normal) isto é o próprio pct do
        # envelope (`s.psa`, o mesmo que a ingestão gravou na coluna). Com mais
        # de uma, o maior é o menos errado dos números disponíveis — média
        # ponderada exigiria o eleitorado de cada zona, e o caminho é
        # defensivo, não o normal. A ocorrência é logada logo abaixo.
        pct_apurado = max(float(linha.get("pct_apurado") or 0.0) for linha in linhas)
        if len(linhas) > 1:
            _log(
                "warn",
                "UF de cargo proporcional com mais de um snapshot — votos somados",
                cargo=req.cargo,
                turno=req.turno,
                uf=sigla,
                n_linhas=len(linhas),
            )

        resultado = None
        if entrada.tem_coligacao:
            # ADR-0027, caso de borda 7: coligação em proporcional é vedada
            # desde 2020. Achar uma significa que o dado está errado — e
            # distribuir cadeiras a partir dele publicaria uma bancada falsa
            # com aparência normal. A UF sai como "aguardando", ruidosamente.
            _log(
                "error",
                "coligação em cargo proporcional — UF fora do cálculo de cadeiras",
                cargo=req.cargo,
                turno=req.turno,
                uf=sigla,
            )
            _alert_slack(
                "error",
                "coligação em corrida proporcional (vedada desde 2020) — a UF "
                "ficou sem cálculo de cadeiras neste ciclo",
                cargo=req.cargo,
                turno=req.turno,
                uf=sigla,
            )
        elif entrada.lugares_a_preencher is None:
            # RF-124 — sem `carg[].nv` não há denominador do quociente, e
            # inventá-lo corromperia a UF inteira. Fica aguardando.
            _log(
                "warn",
                "UF sem `carg[].nv` publicado — cadeiras não calculadas",
                cargo=req.cargo,
                turno=req.turno,
                uf=sigla,
            )
        else:
            calculado = distribuir_cadeiras(entrada.agremiacoes, entrada.lugares_a_preencher)
            if calculado.quociente_eleitoral < 1:
                # UF sem voto válido ainda (0% apurado). Um quociente eleitoral
                # de zero não é um quociente baixo: é a ausência dele. Publicar
                # `0` faria a tela escrever "quociente eleitoral: 0", e contar a
                # UF como calculada faria `ufs_aguardando` mentir. Ela fica
                # aguardando, com as vagas publicadas entrando no total.
                _log(
                    "info",
                    "UF sem voto válido ainda — sem quociente a publicar",
                    cargo=req.cargo,
                    turno=req.turno,
                    uf=sigla,
                )
                ufs.append(
                    UfProporcional(
                        uf=sigla, pct_apurado=pct_apurado, entrada=entrada, resultado=None
                    )
                )
                continue
            resultado = calculado
            n_calculadas += 1
            divergencias = conferir_contra_tse(resultado, entrada)
            # `o_que` sai num conjunto fechado (`CHAVES_DE_DIVERGENCIA`) — a
            # tela rotula a divergência para o leitor e não pode ficar
            # adivinhando string nossa.
            divergencias_por_uf[sigla] = [normalizar_divergencia(d) for d in divergencias]
            if divergencias and entrada.totalizacao_final:
                # Com totalização final, divergir do TSE é erro — antes dela é
                # esperado, porque o TSE recalcula a cada boletim.
                _log(
                    "error",
                    "divergência contra o TSE com totalização final",
                    cargo=req.cargo,
                    turno=req.turno,
                    uf=sigla,
                    divergencias=divergencias_por_uf[sigla],
                )
                _alert_slack(
                    "error",
                    "cadeiras divergem do TSE com totalização final — "
                    "a conta do ADR-0027 e a publicada não batem",
                    cargo=req.cargo,
                    turno=req.turno,
                    uf=sigla,
                    n_divergencias=len(divergencias),
                )

        ufs.append(
            UfProporcional(
                uf=sigla,
                pct_apurado=pct_apurado,
                entrada=entrada,
                resultado=resultado,
            )
        )

    # pct_apurado nacional ponderado pelo eleitorado, iterando pela UNIÃO das
    # UFs conhecidas e das presentes — uma UF que ainda não apurou nada precisa
    # entrar no DENOMINADOR com peso cheio, senão o número nacional infla
    # justamente no começo da noite (mesma armadilha documentada em
    # `build_edge_payload`).
    pct_num = 0.0
    pct_den = 0.0
    pct_by_uf = {d.uf: d.pct_apurado for d in ufs}
    for sigla in set(eleitorado_total_by_uf) | set(pct_by_uf):
        peso = eleitorado_total_by_uf.get(sigla, 0)
        if peso > 0:
            pct_num += pct_by_uf.get(sigla, 0.0) * peso
            pct_den += peso
    if pct_den > 0:
        pct_apurado_total = pct_num / pct_den
    else:
        # Sem a tabela `eleitorado` (banco sem seed, ambiente de teste) o peso
        # some, mas o número não pode sumir junto: cai para média simples sobre
        # as UFs da eleição, com a UF ausente contando 0. Menos preciso,
        # jamais inflado.
        pct_apurado_total = sum(pct_by_uf.values()) / max(UFS_DA_ELEICAO, len(pct_by_uf))

    ts_iso = datetime.now(timezone.utc).isoformat()
    payload, detalhes_uf = construir_payload_deputado(
        ufs=ufs,
        divergencias_por_uf=divergencias_por_uf,
        ts_iso=ts_iso,
        cargo=req.cargo,
        turno=req.turno,
        atualizacao_min=ATUALIZACAO_MIN_DEPUTADO,
        ufs_conhecidas=max(UFS_DA_ELEICAO, len(ufs)),
        pct_apurado_total=pct_apurado_total,
    )

    try:
        post_edge_write(payload, payloads_uf=detalhes_uf)
    except Exception as edge_exc:  # noqa: BLE001 — publicar nunca derruba o ciclo
        _log(
            "warn",
            "edge-write block failed (cargo proporcional)",
            error=str(edge_exc),
            cargo=req.cargo,
            turno=req.turno,
        )

    duration_ms = (time.perf_counter_ns() - t0) // 1_000_000
    _log(
        "info",
        "model_project_proporcional_ok",
        cargo=req.cargo,
        turno=req.turno,
        uf_count=n_calculadas,
        cadeiras_atribuidas=payload["bancada"]["cadeiras_atribuidas"],
        total_cadeiras=payload["bancada"]["total_cadeiras"],
        duration_ms=int(duration_ms),
    )
    return 200, ProjectResponse(
        computed=n_calculadas > 0,
        uf_count=n_calculadas,
        national_p_vitoria_a=0.0,
        computed_duration_ms=int(duration_ms),
    ).model_dump()


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

    # 1b. Cargo proporcional segue por outro caminho inteiro (spec 017, D3):
    # bancada somada das 27 UFs, sem bootstrap de candidato e sem agulha.
    if _e_proporcional(req.cargo):
        try:
            return _do_project_proporcional(req, t0)
        except Exception as exc:  # noqa: BLE001 — converter para 500 estruturado
            trace_id = uuid.uuid4().hex[:12]
            _log(
                "error",
                "model_project_proporcional_failed",
                trace_id=trace_id,
                cargo=req.cargo,
                turno=req.turno,
                error=str(exc),
                traceback=traceback.format_exc(),
            )
            return 500, {"error": "internal_error", "trace_id": trace_id}

    # 2. Seed determinístico (constituição § 6).
    seed_base = derive_seed(req.cargo, req.turno, req.trigger_ts)

    # 3. DB query + compute + persist (tudo em uma transação).
    try:
        with _open_conn() as conn:
            # `fetch_snapshots` devolve uma linha por PAR (município × zona)
            # desde a migration 0006; `merge_pairs_into_zonas` soma os pares de
            # volta à ZONA, que é e continua sendo a unidade do estimador
            # (ADR-0021/0023, decisão E5). Em memória, nunca persistido (§ 1).
            # Zona com um único par sai inalterada. `raw_snapshots` (pré-merge)
            # é mantido para a guarda de sanidade logo abaixo — comparar o
            # ANTES e o DEPOIS do merge é o que detecta multiplicação.
            raw_snapshots = fetch_snapshots(conn, req.cargo, req.turno)
            snapshots = merge_pairs_into_zonas(raw_snapshots)
            # Plano § B — 2022 SAI da projeção de candidatos (decisão E1);
            # `historical` fica NÃO-FATAL e sem uso no cálculo — só existe
            # aqui para alimentar `compute_swing_descritivo` (Fase 5,
            # comparação visual "mudou X pontos desde 2022", fora do
            # escopo desta tarefa). Falha na query nunca deve derrubar a
            # projeção do ciclo.
            try:
                historical = fetch_historical_2022(conn, req.cargo, req.turno)
            except Exception as hist_exc:  # noqa: BLE001 — não-fatal, Fase 5
                _log(
                    "warn",
                    "fetch_historical_2022 failed (non-fatal — Fase 5 descritivo)",
                    error=str(hist_exc),
                )
                historical = []
                try:
                    conn.rollback()
                except Exception:  # noqa: BLE001 — autocommit ou sem tx
                    pass
            eleitorado = fetch_eleitorado(conn, ano=2026)

            # Guarda de sanidade (plano `perfeito-monte-um-plano-eventual-
            # candle.md`, 2026-09-11): a premissa de que o EA20 por par traz
            # só a FATIA do município, não a zona inteira, nunca foi
            # verificada contra dado real — ver docstring de
            # `check_zona_merge_sanity`. Não aborta o ciclo (§ 7); só torna a
            # violação ruidosa. Resolvida no simulado de 15/09.
            n_zona_merge_violacoes = check_zona_merge_sanity(
                raw_snapshots, snapshots, eleitorado
            )
            if n_zona_merge_violacoes:
                _log(
                    "error",
                    "zona_merge_sanity: ciclo com zonas em violação confirmada "
                    "— possível dupla contagem por multiplicação de fatia",
                    cargo=req.cargo,
                    turno=req.turno,
                    n_violacoes=n_zona_merge_violacoes,
                )
                _alert_slack(
                    "error",
                    "zona_merge_sanity: possível multiplicação de votos por "
                    "zona (premissa da fatia por município pode estar "
                    "violada) — ver logs do ciclo para UF/zona/razão",
                    cargo=req.cargo,
                    turno=req.turno,
                    n_violacoes=n_zona_merge_violacoes,
                )

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
            eleitorado_total_by_uf = _eleitorado_total_by_uf(eleitorado)

            uf_rows, estimates_by_uf, estimates_c_by_uf, cand_by_uf = (
                compute_uf_projections(
                    cargo=req.cargo,
                    turno=req.turno,
                    seed_base=seed_base,
                    snapshots=snapshots,
                    eleitorado=eleitorado,
                )
            )

            # RF-014 — votos absolutos projetados, UF -> Brasil (regra de
            # três, `extrapolation.aggregate_national_votos`). Alimenta
            # `compute_national(..., votos_by_uf=...)` abaixo — sem isso
            # `votos_projetados` nacional voltaria a `None` (comportamento
            # legado pré-Fase-1).
            votos_by_uf, _votos_total_br = aggregate_national_votos(cand_by_uf)

            (
                national_rows,
                national_p_a,
                cand_a_id,
                cand_b_id,
                (outros_estimates_nat, n_outros_nat),
            ) = compute_national(
                cargo=req.cargo,
                turno=req.turno,
                estimates_by_uf=estimates_by_uf,
                eleitorado_total_by_uf=eleitorado_total_by_uf,
                votos_by_uf=votos_by_uf,
            )
            outros_nacional = _outros_metric_payload(outros_estimates_nat, n_outros_nat)

            # S05/F4c (ADR-0014) — métricas multi-candidato pré-computadas
            # uma vez aqui para serem reusadas pelo edge_payload abaixo.
            # `aggregate_national_estimates` é a MESMA lógica usada
            # internamente em `compute_national` — mesma saída bit-a-bit.
            national_estimates = aggregate_national_estimates(
                estimates_by_uf, eleitorado_total_by_uf
            )
            scenarios = compute_two_round_scenarios(national_estimates)

            # Plano § B (E2/E2b) — agregado nacional da BASE COMPARECIMENTO
            # (mesma lógica de `aggregate_national_estimates`, mas sobre
            # `estimates_c_by_uf`). Só alimenta o payload — nunca
            # `p_vitoria`/`compute_two_round_scenarios` (contrato de
            # `estimates_by_uf` permanece votáveis-only).
            national_estimates_comparecimento = aggregate_national_estimates(
                estimates_c_by_uf, eleitorado_total_by_uf
            )

            # Fase 1a (RF-020.1) — participação (abstenção, brancos/nulos)
            # por regra de três (D5, `turnout.py`). Reusa os MESMOS
            # `snapshots`/`eleitorado` já buscados acima — sem query nova.
            participacao_by_uf, participacao_nacional = compute_participacao(
                cargo=req.cargo,
                turno=req.turno,
                seed_base=seed_base,
                snapshots=snapshots,
                eleitorado=eleitorado,
            )

            # Spec 016 (RF-103) — `p_eleito` por candidato, por UF. Pura
            # função dos `estimates_by_uf` já calculados; zero sorteio novo,
            # zero query. Em cargo de 1 vaga (Presidente/Governador) responde
            # à mesma pergunta que `p_vitoria` e não é publicado — só entra no
            # payload de cargo com 2+ vagas, onde a pergunta muda de fato.
            vagas_do_cargo = cargo_vagas_por_uf(req.cargo)
            p_eleito_by_uf = (
                compute_p_eleito_by_uf(estimates_by_uf, vagas_do_cargo)
                if vagas_do_cargo >= 2
                else None
            )

            # RF-107 — a sigla do partido, lida do próprio EA20 do ciclo.
            # Sem ela a contagem "vagas por partido" não existe.
            partido_by_cand = extract_partido_by_cand(snapshots, cargo=req.cargo)

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
                # Fase 1a (RF-020.1, D3/D4/D5/D6) — participação + outros.
                municipio_aggregates=municipio_aggregates,
                participacao_nacional=participacao_nacional,
                outros_nacional=outros_nacional,
                # Plano § B (E2/E2b) — base comparecimento nacional.
                national_estimates_comparecimento=national_estimates_comparecimento,
                # Spec 016 — sigla real do partido (RF-107) e o bloco de
                # composição das vagas, que só nasce em cargo de 2+ vagas.
                partido_by_cand=partido_by_cand,
                vagas=vagas_do_cargo if vagas_do_cargo >= 2 else None,
                vagas_em_disputa=cargo_vagas_em_disputa(req.cargo),
                total_cadeiras=cargo_total_cadeiras(req.cargo),
            )
            # S04/F2 — payloads UF ricos (candidatos com votos, municípios,
            # séries temporais). Envia junto do nacional; endpoint Node
            # grava cada chave `projection-uf-<SIGLA>-<cargo>-t<turno>`
            # quando presente (nome derivado no TS — ver lib/edge-config/keys.ts).
            uf_payloads = build_uf_payloads(
                cargo=req.cargo,
                turno=req.turno,
                ts_iso=ts_iso,
                uf_rows=uf_rows,
                national_rows=national_rows,
                municipio_aggregates=municipio_aggregates,
                zona_municipio=zona_municipio,
                series_by_uf=series_by_uf,
                # Fase 1a (RF-020.1, D3/D4/D5/D6) — participação + outros.
                estimates_by_uf=estimates_by_uf,
                participacao_by_uf=participacao_by_uf,
                # Plano § B (E2/E2b) — base comparecimento por UF.
                estimates_c_by_uf=estimates_c_by_uf,
                # Spec 016 — RF-103 (`p_eleito`), RF-105/RF-106 (`vagas`) e
                # RF-107 (sigla do partido).
                p_eleito_by_uf=p_eleito_by_uf,
                vagas=vagas_do_cargo if vagas_do_cargo >= 2 else None,
                partido_by_cand=partido_by_cand,
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
