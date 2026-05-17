"""
api/model/replay_batch.py

Batch runner do replay 2022 (T20 da spec 002, Fase 7) — alimenta o gate OT-4
(MAE@1h < 2pp, RNF-006 / docs/testing/replay.md).

Por que existe (vs. chamar `/api/model/project` em loop):
  Replay completo = 27 UFs × ~30 timesteps × 2 cargos ≈ ~1.600 invocações ao
  pipeline de modelo. Cada chamada pelo endpoint HTTP custaria:
    - 1 cold start Python (~200ms)
    - 1 round-trip de DB para snapshots/historical/eleitorado (~150ms)
    - 1 INSERT em `projections` (irrelevante pro replay)
    - 1 POST best-effort para edge-write (irrelevante pro replay)
  Total estimado: 4-5s/chamada → ~2h walltime. Inaceitável pro feedback loop
  do OT-4.

Estratégia (Opção B do briefing T20):
  - NÃO refatorar `project.py` (T12 fechado, hands-off).
  - Importar `compute_uf_projections` + `compute_national` direto deste módulo.
    Estas funções JÁ SÃO puras (não tocam DB) — o único I/O em `project.py`
    está dentro de `_do_project` (fetch_* + insert_projections + edge-write).
  - Esta CLI lê via stdin um dataset completo + lista de timesteps, roda o
    pipeline em loop Python puro (sem subprocess por chamada, sem DB), e
    devolve projeções via stdout. Drift zero entre replay e produção: chama
    EXATAMENTE as mesmas funções que o endpoint POST.

Contrato stdin (JSON):
  {
    "ground_truth": { "<uf>": { "<candidato_id>": pct_final_2022, ... } },
    "historical": [  # mesmo schema de fetch_historical_2022
      {"uf": "AC", "cod_zona": 1, "cod_candidato": 13, "pct_validos": 0.48,
       "partido": "PT"}, ...
    ],
    "eleitorado": [  # serializável (tuple não vai por JSON)
      {"uf": "AC", "cod_zona": 1, "eleitores_aptos": 5000}, ...
    ],
    "timesteps": [  # uma entrada por (cargo, turno, ts_iso, bucket)
      {
        "cargo": 1,
        "turno": 1,
        "trigger_ts": "2022-10-02T17:15:00Z",
        "bucket": "15min",
        "snapshots": [  # mesmo schema de fetch_snapshots
          {"uf": "AC", "cod_zona": 1, "pct_apurado": 12.3,
           "payload": {"cand": [{"n": 13, "pvap": "45,2"}, ...]}}, ...
        ]
      }, ...
    ]
  }

Contrato stdout (JSON):
  {
    "results": [
      {
        "cargo": 1, "turno": 1, "trigger_ts": "...", "bucket": "15min",
        "uf_projections": [  # uma linha por (uf, candidato)
          {"uf": "AC", "candidato_id": 13, "pct_projetado": 0.46,
           "pct_projetado_lower": 0.41, "pct_projetado_upper": 0.51}, ...
        ],
        "national": {  # nacional, ordenado por candidato_id
          "candidatos": [{"id": 13, "pct_projetado": 0.47,
                          "p_vitoria": 0.62}, ...],
          "p_vitoria_a": 0.62
        }
      }, ...
    ]
  }

Cálculo de MAE é feito do lado TS (`scripts/replay-2022.ts`) — esta CLI só
expõe as projeções; mantém a CLI focada e o cálculo de métricas auditável
no script principal.

Uso (manual / debug):
  python3 api/model/replay_batch.py < dataset.json > projections.json

Uso (real, via scripts/replay-2022.ts):
  child_process.spawn pipes the JSON via stdin and reads stdout.
"""

from __future__ import annotations

import json
import sys
import time
from typing import Any

from api.model.project import (
    compute_national,
    compute_uf_projections,
    derive_seed,
)


def _build_eleitorado_lookup(
    rows: list[dict[str, Any]],
) -> dict[tuple[str, int], int]:
    """Reconstrói o dict `(uf, cod_zona) -> eleitores_aptos` a partir do JSON.

    Tuples não sobrevivem JSON — recebemos lista de dicts e reconstruímos o
    formato esperado por `compute_uf_projections`.
    """
    out: dict[tuple[str, int], int] = {}
    for r in rows:
        out[(r["uf"], int(r["cod_zona"]))] = int(r["eleitores_aptos"])
    return out


def _total_eleitorado_by_uf(
    eleitorado: dict[tuple[str, int], int],
) -> dict[str, int]:
    """Σ eleitores por UF, usado pelo `compute_national`."""
    out: dict[str, int] = {}
    for (uf, _z), aptos in eleitorado.items():
        out[uf] = out.get(uf, 0) + aptos
    return out


def _run_one_timestep(
    cargo: int,
    turno: int,
    trigger_ts: str,
    snapshots: list[dict[str, Any]],
    historical: list[dict[str, Any]],
    eleitorado: dict[tuple[str, int], int],
) -> dict[str, Any]:
    """Roda swing → bootstrap → p_vitoria para UM (cargo, turno, ts).

    Espelha `_do_project` (sem o I/O de DB / edge-write). Mesmo seed
    determinístico — mesmo `(cargo, turno, trigger_ts)` produz o mesmo
    resultado bit-a-bit em produção e no replay (validação OT-4 vale).
    """
    seed_base = derive_seed(cargo, turno, trigger_ts)
    eleitorado_total = _total_eleitorado_by_uf(eleitorado)

    uf_rows, estimates_by_uf = compute_uf_projections(
        cargo=cargo,
        turno=turno,
        seed_base=seed_base,
        snapshots=snapshots,
        historical=historical,
        eleitorado=eleitorado,
    )

    national_rows, p_vitoria_a = compute_national(
        cargo=cargo,
        turno=turno,
        estimates_by_uf=estimates_by_uf,
        eleitorado_total_by_uf=eleitorado_total,
    )

    # Serializa enxuto — só o que o TS precisa pra calcular MAE/calibração.
    uf_projections = [
        {
            "uf": r["uf"],
            "candidato_id": int(r["candidato_id"]),
            "pct_projetado": float(r["pct_projetado"]),
            "pct_projetado_lower": float(r["pct_projetado_lower"]),
            "pct_projetado_upper": float(r["pct_projetado_upper"]),
            "pct_apurado": float(r["pct_apurado"] or 0.0),
        }
        for r in uf_rows
    ]

    national_candidatos = [
        {
            "id": int(r["candidato_id"]),
            "pct_projetado": float(r["pct_projetado"]),
            "pct_projetado_lower": float(r["pct_projetado_lower"]),
            "pct_projetado_upper": float(r["pct_projetado_upper"]),
            "p_vitoria": float(r["p_vitoria"] or 0.0),
        }
        for r in sorted(national_rows, key=lambda x: int(x["candidato_id"]))
    ]

    return {
        "uf_projections": uf_projections,
        "national": {
            "candidatos": national_candidatos,
            "p_vitoria_a": float(p_vitoria_a),
        },
    }


def run_batch(payload: dict[str, Any]) -> dict[str, Any]:
    """Loop principal — itera por timesteps e devolve projeções.

    Mantido como função pura (não toca stdin/stdout) para ser testável.
    """
    historical = payload.get("historical", [])
    eleitorado = _build_eleitorado_lookup(payload.get("eleitorado", []))
    timesteps = payload.get("timesteps", [])

    results: list[dict[str, Any]] = []
    for ts in timesteps:
        t0 = time.perf_counter_ns()
        out = _run_one_timestep(
            cargo=int(ts["cargo"]),
            turno=int(ts["turno"]),
            trigger_ts=str(ts["trigger_ts"]),
            snapshots=ts.get("snapshots", []),
            historical=historical,
            eleitorado=eleitorado,
        )
        duration_ms = (time.perf_counter_ns() - t0) // 1_000_000
        results.append(
            {
                "cargo": int(ts["cargo"]),
                "turno": int(ts["turno"]),
                "trigger_ts": str(ts["trigger_ts"]),
                "bucket": str(ts.get("bucket", "")),
                "duration_ms": int(duration_ms),
                **out,
            }
        )

    return {"results": results}


def main() -> int:
    """CLI entrypoint — JSON via stdin, JSON via stdout.

    Erro de parsing → exit 1 com mensagem em stderr (TS captura e aborta).
    """
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        sys.stderr.write(f"replay_batch: invalid JSON on stdin: {exc}\n")
        return 1

    try:
        out = run_batch(payload)
    except Exception as exc:  # noqa: BLE001 — CLI converte tudo em erro
        sys.stderr.write(f"replay_batch: failed: {exc}\n")
        import traceback

        traceback.print_exc(file=sys.stderr)
        return 1

    sys.stdout.write(json.dumps(out, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
