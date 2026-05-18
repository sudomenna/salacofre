"""S06/F4d Fase 5 — Regressão pro replay_batch.

Carry-over S05: `api/model/replay_batch.py` agora serializa `p_passa_2t`,
`p_fecha_1t` (por candidato) e `p_segundo_turno_overall`, `cenarios_2t`
(nacional) na saída. Antes da Fase 5 esses campos saíam de `compute_national`
mas eram dropados no serializador enxuto do replay — `scripts/replay-2022.ts`
não conseguia comparar paridade com o payload de produção.

Este teste roda `run_batch` direto (função pura, sem subprocess) com payload
minimal e valida que os campos novos aparecem com tipos corretos.
"""

from __future__ import annotations

from api.model.replay_batch import run_batch


def _minimal_payload() -> dict:
    """Payload mínimo: 1 UF, 1 zona, 2 candidatos, 1 timestep final.

    Suficiente para `compute_national` produzir candidatos + cenarios_2t.
    """
    return {
        "ground_truth": {"SP": {"13": 0.52, "22": 0.48}},
        "historical": [
            {"uf": "SP", "cod_zona": 1, "cod_candidato": 13, "pct_validos": 0.52, "partido": "PT"},
            {"uf": "SP", "cod_zona": 1, "cod_candidato": 22, "pct_validos": 0.48, "partido": "PL"},
        ],
        "eleitorado": [{"uf": "SP", "cod_zona": 1, "eleitores_aptos": 5000}],
        "timesteps": [
            {
                "cargo": 1,
                "turno": 1,
                "trigger_ts": "2022-10-02T23:30:00Z",
                "bucket": "final",
                "snapshots": [
                    {
                        "uf": "SP",
                        "cod_zona": 1,
                        "pct_apurado": 100,
                        "payload": {
                            "cand": [
                                {"n": 13, "pvap": "52,00"},
                                {"n": 22, "pvap": "48,00"},
                            ]
                        },
                    }
                ],
            }
        ],
    }


def test_replay_batch_serializes_multi_candidate_metrics() -> None:
    """S06/F4d Fase 5 — paridade com payload de produção (ADR-0014).

    Pré-Fase 5 esses campos eram dropados; Fase 5 os adiciona.
    """
    out = run_batch(_minimal_payload())

    assert "results" in out
    assert len(out["results"]) == 1
    r = out["results"][0]
    nat = r["national"]

    # Campos antigos preservados (regressão).
    assert "p_vitoria_a" in nat
    assert "candidato_a_id" in nat
    assert "candidato_b_id" in nat

    # Campos novos da Fase 5.
    assert "p_segundo_turno_overall" in nat
    p2t = nat["p_segundo_turno_overall"]
    # turno 1 → float em [0, 1] OU None (degenerado quando 0 candidatos).
    assert p2t is None or (0.0 <= p2t <= 1.0)
    assert "cenarios_2t" in nat
    assert isinstance(nat["cenarios_2t"], list)
    for s in nat["cenarios_2t"]:
        assert "par" in s and "prob" in s
        assert len(s["par"]) == 2
        assert 0.0 <= s["prob"] <= 1.0

    # Por candidato: p_passa_2t e p_fecha_1t presentes.
    for c in nat["candidatos"]:
        assert "p_passa_2t" in c
        assert "p_fecha_1t" in c
        assert 0.0 <= c["p_passa_2t"] <= 1.0
        assert 0.0 <= c["p_fecha_1t"] <= 1.0


def test_replay_batch_turno_2_emits_none_for_p_segundo_turno() -> None:
    """Em 2T, `p_segundo_turno_overall` deve ser None (semântica vazia).

    Paridade com `build_edge_payload` que emite None em 2T.
    """
    payload = _minimal_payload()
    payload["timesteps"][0]["turno"] = 2
    out = run_batch(payload)
    nat = out["results"][0]["national"]
    assert nat["p_segundo_turno_overall"] is None
