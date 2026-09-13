"""tests/unit/model/test_sqcand_string.py — spec 018 / ADR-0042 item 2 e 5c.

`SQ_CANDIDATO` tem **11 ou 12 dígitos** — 5.569 das 20.939 candidaturas de
2026 têm 11. Ele viaja como **string** do EA20 (`ea20-schema.ts`:
`sqcand: z.string()`, obrigatório dentro de `cand[]`) até o payload.

Mutação alvo: `int(sqcand)`. Ela **sobrevive** ao round-trip numérico e não
quebra nada visível — é justamente por isso que precisa de teste. O estrago
aparece depois, na comparação: em texto, `"99…"` (11 dígitos) vence `"100…"`
(12), e o desempate do ADR-0042 escolhe o registro errado em silêncio.

O teste afirma o **tipo** e o **valor literal** depois de `json.dumps`, porque
é serializado que o campo atravessa a fronteira Python → Edge Config → TS.
"""

import json
from typing import Any

from api.model.project import (
    build_edge_payload,
    build_uf_payloads,
    extract_identidade_by_cand,
)

# 11 dígitos e 12 dígitos — as duas larguras reais da base de 2026.
SQ_ONZE = "50002553927"
SQ_DOZE = "250002553928"


def _ea20(numero: int, sqcand: str) -> dict[str, Any]:
    return {
        "carg": [
            {
                "cd": "3",
                "agr": [
                    {
                        "n": "1",
                        "par": [
                            {
                                "n": "1",
                                "sg": "PT",
                                "cand": [
                                    {
                                        "n": str(numero),
                                        "sqcand": sqcand,
                                        "nmu": f"CAND {numero}",
                                        "vap": "100",
                                        "pvap": "50,00",
                                        "e": "n",
                                    }
                                ],
                            }
                        ],
                    }
                ],
            }
        ]
    }


UF_ROWS: list[dict[str, Any]] = [
    {
        "cargo": 3,
        "turno": 1,
        "uf": "BA",
        "candidato_id": 13,
        "pct_projetado": 55.0,
        "pct_apurado": 80.0,
    },
    {
        "cargo": 3,
        "turno": 1,
        "uf": "SP",
        "candidato_id": 22,
        "pct_projetado": 45.0,
        "pct_apurado": 80.0,
    },
]

NATIONAL_ROWS: list[dict[str, Any]] = [
    {"candidato_id": 13, "pct_projetado": 55.0, "rank": 1},
    {"candidato_id": 22, "pct_projetado": 45.0, "rank": 2},
]


def test_extrator_preserva_as_duas_larguras_como_string():
    snapshots = [
        {"uf": "BA", "payload": _ea20(13, SQ_ONZE)},
        {"uf": "SP", "payload": _ea20(22, SQ_DOZE)},
    ]

    mapa = extract_identidade_by_cand(snapshots, cargo=3)

    onze = mapa[("BA", 13)]["sqcand"]
    doze = mapa[("SP", 22)]["sqcand"]

    assert isinstance(onze, str) and isinstance(doze, str)
    assert onze == SQ_ONZE
    assert len(onze) == 11
    assert doze == SQ_DOZE
    assert len(doze) == 12


def test_sqcand_sobrevive_ao_json_dumps_como_string_nas_duas_larguras():
    """Mutação alvo: `int(sqcand)` em qualquer degrau. O JSON sairia com
    `"sqcand": 50002553927` (sem aspas) e `isinstance(..., str)` reprova."""
    identidade = {
        ("BA", 13): {"nome": "JAQUELINE DA BA", "sqcand": SQ_ONZE},
        ("SP", 22): {"nome": "FERNANDO DE SP", "sqcand": SQ_DOZE},
    }

    payload = build_edge_payload(
        cargo=3,
        turno=1,
        ts_iso="2026-10-04T18:23:15Z",
        uf_rows=UF_ROWS,
        national_rows=NATIONAL_ROWS,
        eleitorado_total_by_uf={"BA": 500, "SP": 1000},
        identidade_by_cand=identidade,
    )

    redondo = json.loads(json.dumps(payload, ensure_ascii=False))
    por_uf = {u["sigla"]: u for u in redondo["por_uf"]}

    ba = por_uf["BA"]["top_candidatos"][0]["sqcand"]
    sp = por_uf["SP"]["top_candidatos"][0]["sqcand"]

    assert isinstance(ba, str) and ba == SQ_ONZE
    assert isinstance(sp, str) and sp == SQ_DOZE
    # E o JSON cru traz aspas — a prova direta de que não virou número.
    assert f'"sqcand": "{SQ_ONZE}"' in json.dumps(redondo)


def test_sqcand_no_payload_de_uf_tambem_e_string():
    identidade = {
        ("BA", 13): {"nome": "JAQUELINE DA BA", "sqcand": SQ_ONZE},
        ("SP", 22): {"nome": "FERNANDO DE SP", "sqcand": SQ_DOZE},
    }

    out = build_uf_payloads(
        cargo=3,
        turno=1,
        ts_iso="2026-10-04T18:23:15Z",
        uf_rows=UF_ROWS,
        national_rows=NATIONAL_ROWS,
        municipio_aggregates={},
        zona_municipio={},
        series_by_uf={},
        identidade_by_cand=identidade,
    )

    redondo = json.loads(json.dumps(out, ensure_ascii=False))

    (ba,) = [c for c in redondo["BA"]["candidatos"] if c["id"] == 13]
    (sp,) = [c for c in redondo["SP"]["candidatos"] if c["id"] == 22]

    assert isinstance(ba["sqcand"], str) and ba["sqcand"] == SQ_ONZE
    assert isinstance(sp["sqcand"], str) and sp["sqcand"] == SQ_DOZE


def test_comparar_as_duas_larguras_como_texto_ordena_errado():
    """Não testa o nosso código — testa a **premissa** que obriga o campo a
    ser string e a ordenação a usar `BigInt`/`int`. Se esta asserção um dia
    falhar, a nota do ADR-0042 item 5c deixou de valer e a regra muda.
    """
    assert SQ_ONZE > SQ_DOZE  # "5…" > "2…" em texto
    assert int(SQ_ONZE) < int(SQ_DOZE)  # e o número diz o contrário
