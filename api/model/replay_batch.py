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

Escala (fix S07 — docs/architecture/data-model.md § "Escala de
percentuais"): `compute_uf_projections`/`compute_national` emitem
`pct_projetado*` em percentual 0–100 (mesma convenção de `insert_projections`
e `build_edge_payload`). Este módulo SEMPRE se comunicou com
`scripts/replay-2022.ts` em fração [0,1] (contrato stdout acima, ground_truth
do dataset T21, gate OT-4 `< 0.02`) — `_pct_to_frac` faz essa conversão na
serialização de `uf_projections`/`national.candidatos`. `pct_apurado` NÃO é
convertido (sempre foi 0–100 nos dois lados).

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
    aggregate_national_estimates,
    compute_national,
    compute_two_round_scenarios,
    compute_uf_projections,
    derive_seed,
)
from api.model.zona_merge import merge_pairs_into_zonas


def _pct_to_frac(x: float) -> float:
    """Converte percentual 0–100 (saída de `compute_uf_projections` /
    `compute_national` pós fix de escala) para fração [0,1] — espaço em
    que este módulo sempre se comunicou com `scripts/replay-2022.ts`
    (ground_truth do dataset T21 e o gate OT-4 `< 0.02` são fração).
    """
    return float(x) / 100.0


def _build_eleitorado_lookup(
    rows: list[dict[str, Any]],
) -> dict[tuple[str, int], int]:
    """Reconstrói o dict `(uf, cod_zona) -> eleitores_aptos` a partir do JSON.

    Tuples não sobrevivem JSON — recebemos lista de dicts e reconstruímos o
    formato esperado por `compute_uf_projections`.

    **Soma** quando a mesma zona aparece mais de uma vez (um par `(município,
    zona)` por linha). `scripts/build-replay-fixtures.ts` já emite
    `SUM(...) GROUP BY uf, cod_zona` — uma linha por zona — mas somar aqui
    impede que um dataset por par sobrescreva em silêncio, que é o defeito
    que inflou o MAE@1h de 2,3623 pp para 3,4636 pp em 11/09.
    """
    out: dict[tuple[str, int], int] = {}
    for r in rows:
        chave = (r["uf"], int(r["cod_zona"]))
        out[chave] = out.get(chave, 0) + int(r["eleitores_aptos"])
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
    """Roda a extrapolação por regra de três + bootstrap + p_vitoria para
    UM (cargo, turno, ts).

    Espelha `_do_project` (sem o I/O de DB / edge-write). Mesmo seed
    determinístico — mesmo `(cargo, turno, trigger_ts)` produz o mesmo
    resultado bit-a-bit em produção e no replay (validação OT-4 vale).

    `historical` (plano `tem-um-erro-eu-velvety-sprout.md` § A/B, decisão
    E1, 2026-09-05): RECEBIDO PELO CONTRATO STDIN deste módulo mas
    IGNORADO — `compute_uf_projections` não tem mais parâmetro
    `historical` (2022 saiu da projeção de candidatos). Mantido no
    parâmetro/contrato TS (`scripts/replay-2022.ts` continua enviando
    `historical` no JSON de stdin) para não quebrar o pipe; será
    consumido pela Fase 5 (`compute_swing_descritivo`, comparação visual,
    fora do escopo desta tarefa).
    """
    del historical  # noqa: ARG001 — ignorado nesta fase, ver docstring acima.
    seed_base = derive_seed(cargo, turno, trigger_ts)
    eleitorado_total = _total_eleitorado_by_uf(eleitorado)

    # Espelha `_do_project`: os snapshots chegam por PAR (município × zona)
    # desde a migration 0006 e são somados de volta à ZONA antes do estimador
    # (ADR-0035 D2 / decisão E5). O dataset de replay 2022 tem uma linha por
    # zona (`cod_municipio_tse` ausente == sentinela 0), então o merge é
    # IDENTIDADE ali — mesmas linhas, mesmos payloads, mesmo gate OT-4.
    snapshots = merge_pairs_into_zonas(snapshots)

    uf_rows, estimates_by_uf, _estimates_c_by_uf, _cand_by_uf = compute_uf_projections(
        cargo=cargo,
        turno=turno,
        seed_base=seed_base,
        snapshots=snapshots,
        eleitorado=eleitorado,
    )

    # Fase 1a: `compute_national` ganhou um 5º elemento de retorno
    # ("outros" com IC real, D4) — não usado pelo replay/gate OT-4;
    # `*_` absorve sem quebrar o contrato stdin/stdout deste módulo.
    national_rows, p_vitoria_a, cand_a_id, cand_b_id, *_ = compute_national(
        cargo=cargo,
        turno=turno,
        estimates_by_uf=estimates_by_uf,
        eleitorado_total_by_uf=eleitorado_total,
    )

    # S05/F4c (ADR-0014) — métricas multi-candidato. Espelha o orchestrator
    # de produção (`_do_project`): mesma fonte (`national_estimates`) e mesma
    # função (`compute_two_round_scenarios`) — drift zero entre replay e prod.
    # Em 2T `compute_two_round_scenarios` retorna p=0/cenarios=[] (degenera).
    # `p_passa_2t` e `p_fecha_1t` por candidato já saem de `compute_national`
    # dentro de `national_rows[*]` — só precisamos serializá-los abaixo.
    national_estimates = aggregate_national_estimates(estimates_by_uf, eleitorado_total)
    scenarios = compute_two_round_scenarios(national_estimates)
    p_segundo_turno_overall = scenarios.get("p_segundo_turno_overall")
    if turno == 2:
        # Em 2T `compute_two_round_scenarios` retorna 0.0; o payload
        # canônico (build_edge_payload) emite None. Espelhamos aqui para o
        # report.json refletir a semântica "não aplicável" em vez de "0%
        # chance de 2T" (que seria certo mas ambíguo).
        p_segundo_turno_overall = None
    cenarios_2t = scenarios.get("cenarios_2t", [])

    # Serializa enxuto — só o que o TS precisa pra calcular MAE/calibração.
    #
    # Escala (docs/architecture/data-model.md § "Escala de percentuais"):
    # `uf_rows`/`national_rows` (saída de `compute_uf_projections` /
    # `compute_national`) chegam aqui em percentual 0–100 — mesma
    # convenção de `insert_projections`/`build_edge_payload`. O contrato
    # deste módulo com `scripts/replay-2022.ts` (gate OT-4) SEMPRE foi em
    # fração [0,1] (`ground_truth` do dataset T21 é fração; comparação
    # `computeMae` em replay-2022.ts é direta, sem conversão do lado TS).
    # `_pct_to_frac` faz essa ponte de volta — sem isso, `computeMae`
    # compararia 0–100 contra fração e o gate `< 0.02` falharia sempre
    # (erro artificial de ~50pp).
    uf_projections = [
        {
            "uf": r["uf"],
            "candidato_id": int(r["candidato_id"]),
            "pct_projetado": _pct_to_frac(r["pct_projetado"]),
            "pct_projetado_lower": _pct_to_frac(r["pct_projetado_lower"]),
            "pct_projetado_upper": _pct_to_frac(r["pct_projetado_upper"]),
            "pct_apurado": float(r["pct_apurado"] or 0.0),
        }
        for r in uf_rows
    ]

    national_candidatos = [
        {
            "id": int(r["candidato_id"]),
            "pct_projetado": _pct_to_frac(r["pct_projetado"]),
            "pct_projetado_lower": _pct_to_frac(r["pct_projetado_lower"]),
            "pct_projetado_upper": _pct_to_frac(r["pct_projetado_upper"]),
            "p_vitoria": float(r["p_vitoria"] or 0.0),
            # S05 carry-over → S06/F4d Fase 5: métricas multi-candidato
            # (ADR-0014). Já populadas em `compute_national`; só serializamos.
            # Permite que o report.json gerado pelo replay tenha paridade
            # de campos com o payload de produção emitido por build_edge_payload.
            "p_passa_2t": float(r.get("p_passa_2t") or 0.0),
            "p_fecha_1t": float(r.get("p_fecha_1t") or 0.0),
        }
        for r in sorted(national_rows, key=lambda x: int(x["candidato_id"]))
    ]

    return {
        "uf_projections": uf_projections,
        "national": {
            "candidatos": national_candidatos,
            "p_vitoria_a": float(p_vitoria_a),
            # FIX S04: ids semânticos do líder/segundo (vide compute_national).
            # Permite que o validador TS rotule corretamente quem é "A".
            "candidato_a_id": cand_a_id,
            "candidato_b_id": cand_b_id,
            # S05 carry-over → S06/F4d Fase 5: P(2º turno) agregada nacional
            # (ADR-0014). None em 2T (já passou); [0,1] em 1T. Cenários top-3
            # também serializados pra inspeção offline; cada item é
            # `{par: [id_a, id_b], prob: float}`.
            "p_segundo_turno_overall": p_segundo_turno_overall,
            "cenarios_2t": cenarios_2t,
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
