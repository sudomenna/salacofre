"""Mede o custo do ciclo proporcional — spec 017, design D7.

    .venv-model/bin/python3.14 scripts/bench-deputado.py

Existe porque duas perguntas decidem o escopo de RF-127 (intervalo de cadeiras)
e nenhuma das duas se responde no olho:

  **(1) quanto custa um ciclo completo das 27 UFs SEM intervalo** — do envelope
  EA20 ao JSON publicado. É o que o cron de 15 minutos paga hoje.

  **(2) quanto custaria rodar `distribuir_cadeiras` sobre os resamples do
  bootstrap** (n × 27 UFs). É o único caminho honesto para o intervalo: não há
  atalho que produza uma faixa com significado sobre contagem discreta.

## Medição de referência — 2026-09-12, Apple M4, Python 3.14.3

    ciclo completo das 27 UFs ............ 20,5 ms  (+2,1 ms de JSON)
      parse EA20 + extração .............. 10,4 ms
      distribuir_cadeiras ................  8,0 ms
      montar os payloads .................  2,0 ms
    1.000 resamples × 27 UFs ............. 11,1 s   (8,0 s sem reconstruir os votos)
    payload nacional ..................... 13,4 KB
    maior payload de UF (SP) ............. 29,5 KB  · soma das 27: 520,8 KB

A soma dos 27 payloads de UF é o argumento medido a favor do Blob (RF-129): 521
KB não cabem num Global Config de 1 MB dividido por três cargos. O design (D6)
estimava 10–15 KB por UF; o real é o dobro.

O teto da função é 60 s (`vercel.ts`, `api/model/project.py`). Mesmo com o
Python da Vercel 3× mais lento que este M4, o intervalo cabe — e 1.000 resamples
é exagero para uma contagem discreta: 200 custam cerca de um quinto disso.

**O que este número NÃO diz**: o bootstrap da corrida proporcional não existe.
`api/model/extrapolation.py` resampleia candidato-por-zona para cargo
majoritário; o cargo 6 é ingerido por UF e não tem esse caminho. O que está
medido aqui é a **redistribuição de cadeiras** sobre votos já perturbados, que
era a incógnita; gerar os votos perturbados por agremiação é trabalho de
modelagem ainda por fazer.

## Sobre o dado

2022 (`tests/fixtures/model/cadeiras-golden-2022.json`): 27 UFs, 613
agremiações, 9.675 candidatos, 513 cadeiras. É o único dado real de corrida
proporcional no repositório, e aqui o que importa dele é o **tamanho** — em
2026 a ordem de grandeza é a mesma. Os envelopes EA20 são sintetizados a partir
dele com a estrutura do dicionário oficial (`carg[] → agr[] → par[] → cand[]`),
porque nenhuma fixture EA20 de cargo 6 existe até o simulado de 15–17/09.
"""

from __future__ import annotations

import json
import pathlib
import platform
import random
import sys
import time
from typing import Any, Callable

RAIZ = pathlib.Path(__file__).resolve().parents[1]
if str(RAIZ) not in sys.path:
    sys.path.insert(0, str(RAIZ))

from api.model.cadeiras import (  # noqa: E402
    Agremiacao,
    Candidato,
    distribuir_cadeiras,
)
from api.model.deputado import (  # noqa: E402
    combinar_entradas,
    conferir_contra_tse,
    extrair_entrada_proporcional,
)
from api.model.deputado_payload import (  # noqa: E402
    UfProporcional,
    construir_payload_deputado,
)

FIXTURE = RAIZ / "tests" / "fixtures" / "model" / "cadeiras-golden-2022.json"

#: Resamples do bootstrap do modelo (`api/model/extrapolation.py`). É o número
#: a que a extrapolação de custo se refere — não uma escolha deste script.
N_RESAMPLES_DO_MODELO = 1000

#: Quantos resamples medir de fato. O custo é linear no número de resamples
#: (cada um é uma passada independente pelas 27 UFs), então medir 25 e
#: extrapolar custa 40× menos tempo e dá o mesmo número.
N_AMOSTRA = 25


def envelope_da_uf(dados: dict[str, Any]) -> dict[str, Any]:
    """EA20 sintético com o TAMANHO e os VOTOS reais de 2022."""
    agrs = []
    for a in dados["agremiacoes"]:
        cod = a["cod"]
        # A fixture prefixa o código com "F" (federação) ou "P" (partido).
        tipo = "f" if cod.startswith("F") else "i"
        numero = cod[1:]
        agrs.append(
            {
                "n": numero,
                "nm": f"Agremiação {a['rotulo']}",
                "tp": tipo,
                "com": a["rotulo"],
                "tvtl": str(a["legenda"]),
                "par": [
                    {
                        "n": numero,
                        "sg": a["rotulo"],
                        "nm": f"Partido {a['rotulo']}",
                        "tvtl": str(a["legenda"]),
                        "cand": [
                            {
                                "n": f"{numero}00",
                                "sqcand": str(sq),
                                "nm": f"CANDIDATO {sq} NOME COMPLETO DA PESSOA",
                                "nmu": f"CANDIDATO {sq}",
                                "e": "n",
                                "vap": str(votos),
                                "pvap": "0,00",
                                "dt": "01/01/1970",
                            }
                            for sq, votos in a["candidatos"]
                        ],
                    }
                ],
            }
        )
    return {
        "tf": "s",
        "s": {"psa": "100,00"},
        "carg": [{"cd": "6", "nv": str(dados["vagas"]), "agr": agrs}],
    }


def ciclo_completo(envelopes: dict[str, dict[str, Any]]) -> tuple[dict, dict]:
    """Exatamente o que `_do_project_proporcional` faz, menos o I/O de banco."""
    ufs: list[UfProporcional] = []
    divergencias: dict[str, list[dict[str, Any]]] = {}
    for uf, envelope in envelopes.items():
        entrada = combinar_entradas([extrair_entrada_proporcional(envelope)])
        resultado = distribuir_cadeiras(entrada.agremiacoes, entrada.lugares_a_preencher or 1)
        divergencias[uf] = [
            {"o_que": d.o_que, "nosso": d.nosso, "tse": d.tse, "detalhe": d.detalhe}
            for d in conferir_contra_tse(resultado, entrada)
        ]
        ufs.append(
            UfProporcional(uf=uf, pct_apurado=100.0, entrada=entrada, resultado=resultado)
        )
    return construir_payload_deputado(
        ufs=ufs,
        divergencias_por_uf=divergencias,
        ts_iso="2026-10-04T21:00:00+00:00",
        cargo=6,
        turno=1,
        atualizacao_min=15,
        ufs_conhecidas=27,
        pct_apurado_total=100.0,
    )


def cronometrar(f: Callable[[], Any], repeticoes: int = 5) -> float:
    """MELHOR tempo de N repetições, em segundos.

    Melhor, não média: o que interfere numa medição destas (scheduler, outro
    processo, GC) só acrescenta tempo. O mínimo é a estimativa menos
    contaminada do custo real.
    """
    melhor = float("inf")
    for _ in range(repeticoes):
        t0 = time.perf_counter()
        f()
        melhor = min(melhor, time.perf_counter() - t0)
    return melhor


def main() -> int:
    if not FIXTURE.exists():
        print(f"fixture ausente: {FIXTURE}", file=sys.stderr)
        return 1
    golden = json.loads(FIXTURE.read_text(encoding="utf-8"))["ufs"]
    envelopes = {uf: envelope_da_uf(d) for uf, d in golden.items()}

    n_agr = sum(len(d["agremiacoes"]) for d in golden.values())
    n_cand = sum(len(a["candidatos"]) for d in golden.values() for a in d["agremiacoes"])
    print("== ambiente ==")
    print(f"{platform.python_version()} · {platform.machine()} · {platform.platform()}")
    print("\n== dado ==")
    print(f"{len(golden)} UFs · {n_agr} agremiações · {n_cand} candidatos")

    # ---- (1) ciclo completo ------------------------------------------------
    payload, detalhes = ciclo_completo(envelopes)
    cadeiras = payload["bancada"]["cadeiras_atribuidas"]
    t_ciclo = cronometrar(lambda: ciclo_completo(envelopes))

    entradas: dict[str, Any] = {}

    def so_extrair() -> None:
        for uf, env in envelopes.items():
            entradas[uf] = combinar_entradas([extrair_entrada_proporcional(env)])

    t_extrair = cronometrar(so_extrair)

    def so_distribuir() -> None:
        for e in entradas.values():
            distribuir_cadeiras(e.agremiacoes, e.lugares_a_preencher or 1)

    t_distribuir = cronometrar(so_distribuir)

    bruto_nacional = json.dumps(payload, ensure_ascii=False)
    bruto_uf = {uf: json.dumps(d, ensure_ascii=False) for uf, d in detalhes.items()}
    t_json = cronometrar(
        lambda: (
            json.dumps(payload, ensure_ascii=False),
            [json.dumps(d, ensure_ascii=False) for d in detalhes.values()],
        )
    )

    print("\n== (1) ciclo completo das 27 UFs, sem intervalo ==")
    print(f"total .................. {t_ciclo * 1000:8.1f} ms   ({cadeiras} cadeiras)")
    print(f"  parse EA20 + extração  {t_extrair * 1000:8.1f} ms")
    print(f"  distribuir_cadeiras    {t_distribuir * 1000:8.1f} ms")
    print(f"  montar os payloads     {(t_ciclo - t_extrair - t_distribuir) * 1000:8.1f} ms")
    print(f"serializar o JSON ...... {t_json * 1000:8.1f} ms (fora do total acima)")
    print(
        f"payload nacional ....... {len(bruto_nacional.encode()) / 1024:8.1f} KB "
        f"({len(payload['bancada']['por_agremiacao'])} agremiações)"
    )
    maior = max(bruto_uf.items(), key=lambda kv: len(kv[1]))
    soma_uf = sum(len(v.encode()) for v in bruto_uf.values()) / 1024
    print(
        f"maior payload de UF .... {len(maior[1].encode()) / 1024:8.1f} KB ({maior[0]})   "
        f"soma das 27: {soma_uf:.1f} KB"
    )

    # ---- (2) custo incremental de RF-127 -----------------------------------
    rng = random.Random(20261004)

    def um_resample_de_todas_as_ufs(perturbar: bool) -> None:
        for e in entradas.values():
            if perturbar:
                # ±3% por candidato. A distribuição da perturbação não importa
                # para o custo — importa que os objetos sejam reconstruídos,
                # que é o que um bootstrap real paga a cada resample.
                ags = [
                    Agremiacao(
                        cod=a.cod,
                        votos_legenda=a.votos_legenda,
                        candidatos=tuple(
                            Candidato(
                                cod=c.cod,
                                votos_nominais=int(c.votos_nominais * rng.uniform(0.97, 1.03)),
                                nascimento=c.nascimento,
                            )
                            for c in a.candidatos
                        ),
                    )
                    for a in e.agremiacoes
                ]
            else:
                ags = e.agremiacoes
            distribuir_cadeiras(ags, e.lugares_a_preencher or 1)

    t_sem = cronometrar(
        lambda: [um_resample_de_todas_as_ufs(False) for _ in range(N_AMOSTRA)], 3
    )
    t_com = cronometrar(
        lambda: [um_resample_de_todas_as_ufs(True) for _ in range(N_AMOSTRA)], 3
    )
    fator = N_RESAMPLES_DO_MODELO / N_AMOSTRA

    print("\n== (2) custo incremental de RF-127 (intervalo por bootstrap) ==")
    print(f"amostra medida ......... {N_AMOSTRA} resamples × {len(golden)} UFs")
    print(f"  só redistribuir ...... {t_sem / N_AMOSTRA * 1000:7.1f} ms por resample")
    print(f"  perturbar + redistr .. {t_com / N_AMOSTRA * 1000:7.1f} ms por resample")
    print(
        f"extrapolado a {N_RESAMPLES_DO_MODELO} resamples × {len(golden)} UFs "
        f"({N_RESAMPLES_DO_MODELO * len(golden)} distribuições):"
    )
    print(f"  só redistribuir ...... {t_sem * fator:8.1f} s")
    print(f"  perturbar + redistr .. {t_com * fator:8.1f} s")
    print("teto da função: 60 s (`vercel.ts`) · janela do cron: 15 min (RF-128)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
