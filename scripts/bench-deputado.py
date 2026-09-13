"""Mede o custo do ciclo proporcional — spec 017, design D7.

    .venv-model/bin/python3.14 scripts/bench-deputado.py

Existe porque duas perguntas decidem o escopo de RF-127 (intervalo de cadeiras)
e nenhuma das duas se responde no olho:

  **(1) quanto custa um ciclo completo das 27 UFs SEM intervalo** — do envelope
  EA20 ao JSON publicado. É o que a volta completa do cargo paga hoje: desde o
  ADR-0036 (13/09) são 6 fatias intercaladas a cada 5 min, 30 min de volta
  completa — não mais o cron único de 15 min da fase em que o cargo era por UF.

  **(2) quanto custa o intervalo de RF-127** —
  `cadeiras_bootstrap.intervalo_de_cadeiras` nas 27 UFs, incluindo **gerar os
  votos reamostrados** por agremiação, não só redistribuir cadeiras sobre votos
  já perturbados. É o único caminho honesto para a faixa: não há atalho que
  produza um intervalo com significado sobre contagem discreta.

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

⚠️ **Correção de 2026-09-13, em duas frentes.** A versão anterior desta prosa
dizia que "`extrapolation.py` resampleia candidato-por-zona" e que "o cargo 6 é
ingerido por UF". As duas ficaram falsas:

  - `extrapolation.py:264-265` sorteia **zonas** — um único `idx` por UF,
    compartilhado por todos os candidatos e pelas duas bases (docstring daquele
    módulo, `:69-75`);
  - o ADR-0036 moveu o cargo 6 para granularidade de **zona** (par
    município×zona, ~6.110 alvos em 6 fatias, volta completa em 30 min).

A perturbação independente por candidato na seção (2) daquela medição era proxy
de **custo**, e nunca foi modelo — o próprio script avisava disso. O bootstrap de
verdade existe desde 2026-09-13 em `api/model/cadeiras_bootstrap.py`, e a seção
(2) passou a medi-lo diretamente.

## Medição de 2026-09-13, mesmo M4 — agora do código de verdade

    1.000 réplicas × 27 UFs .............. 10,8 s   (2.644 zonas, 9.675 candidatos)
       25 réplicas × 27 UFs ..............  0,5 s

Este número **inclui gerar os votos reamostrados**, que a medição de 12/09 não
incluía — e mesmo assim ficou abaixo dos 11,1 s de lá, porque a geração é uma
multiplicação de matriz (`matriz @ contagens.T`) e não um laço Python.

⚠️ **A seção (2) não extrapola mais de uma amostra.** Boa parte do custo por UF
— montar a matriz voto × zona, sortear o `idx`, a multiplicação — é paga UMA vez
por chamada, não por réplica: extrapolar linearmente de 25 réplicas dava 20 s
para uma conta que leva 11.

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
from api.model.cadeiras_bootstrap import intervalo_de_cadeiras  # noqa: E402
from api.model.deputado import (  # noqa: E402
    EntradaProporcional,
    combinar_entradas,
    conferir_contra_tse,
    extrair_entrada_proporcional,
)
from api.model.deputado_payload import (  # noqa: E402
    UfProporcional,
    construir_payload_deputado,
)

FIXTURE = RAIZ / "tests" / "fixtures" / "model" / "cadeiras-golden-2022.json"

#: Zonas eleitorais por UF — `SELECT uf, COUNT(DISTINCT cod_zona) FROM zonas`,
#: medido em 2026-09-13 (os mesmos 2.644 do ADR-0036). Fica embutido aqui de
#: propósito: este script mede custo e não deve exigir banco. É o eixo em que a
#: matriz voto × zona cresce — de RR (8) a SP (394).
ZONAS_POR_UF = {
    "AC": 9, "AL": 42, "AM": 60, "AP": 10, "BA": 199, "CE": 109, "DF": 19,
    "ES": 50, "GO": 92, "MA": 105, "MG": 304, "MS": 49, "MT": 57, "PA": 101,
    "PB": 68, "PE": 122, "PI": 79, "PR": 186, "RJ": 165, "RN": 60, "RO": 29,
    "RR": 8, "RS": 165, "SC": 100, "SE": 29, "SP": 394, "TO": 33,
}

#: Resamples do bootstrap do modelo (`api/model/extrapolation.py`). É o número
#: a que a extrapolação de custo se refere — não uma escolha deste script.
N_RESAMPLES_DO_MODELO = 1000

#: Amostra pequena, medida ao lado do número real na seção (2) — serve para
#: mostrar o quanto o custo NÃO é linear no número de réplicas (o custo fixo por
#: UF é pago uma vez por chamada). Não é base de extrapolação: ver o aviso no
#: docstring do módulo.
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


def _repartir(total: int, pesos: list[float]) -> list[int]:
    """Divide `total` entre `pesos` com soma EXATA (método do maior resto).

    Exata, e não "aproximadamente exata": `intervalo_de_cadeiras` confere que a
    soma das zonas reproduz o voto da UF antes de publicar qualquer faixa, e
    devolve `None` se não reproduzir. Uma repartição que perdesse um voto no
    arredondamento faria este bench medir o caminho da recusa, não o do cálculo.
    """
    soma = sum(pesos)
    if total <= 0 or soma <= 0 or not pesos:
        return [total if i == 0 else 0 for i in range(len(pesos))] if pesos else []
    brutos = [total * p / soma for p in pesos]
    inteiros = [int(b) for b in brutos]
    sobra = total - sum(inteiros)
    ordem = sorted(range(len(pesos)), key=lambda i: (-(brutos[i] - inteiros[i]), i))
    for i in ordem[:sobra]:
        inteiros[i] += 1
    return inteiros


def fatiar_em_zonas(
    entrada: EntradaProporcional, k: int, seed: int = 20261004
) -> list[EntradaProporcional]:
    """Reparte os votos de uma UF em `k` zonas com força partidária desigual.

    ⚠️ **Isto inventa geografia, e serve só para medir custo.** O golden de 2022
    (`tests/fixtures/model/cadeiras-golden-2022.json`) é agregado por UF, sem
    série temporal e sem repartição por zona, e não existe dado real de cargo 6
    por zona em lugar nenhum do repositório nem do banco (898 linhas, todas de
    cargo 3, medido em 13/09). Não use esta função como fixture de correção: os
    testes de `cadeiras_bootstrap` são de propriedade, não de valor esperado.

    Para o custo, o que importa é o tamanho da matriz (linhas de voto × zonas) e
    o número de réplicas — não como os votos se distribuem. O peso por
    agremiação × zona varia de 0,2 a 2,5 (reduto eleitoral) para que o
    intervalo não saia degenerado e o caminho medido seja o completo.
    """
    rng = random.Random(seed)
    legenda: dict[str, list[int]] = {}
    nominais: dict[str, dict[int, list[int]]] = {}
    for a in entrada.agremiacoes:
        pesos = [rng.uniform(0.2, 2.5) for _ in range(k)]
        legenda[a.cod] = _repartir(a.votos_legenda, pesos)
        nominais[a.cod] = {c.cod: _repartir(c.votos_nominais, pesos) for c in a.candidatos}

    zonas: list[EntradaProporcional] = []
    for j in range(k):
        agremiacoes = [
            Agremiacao(
                cod=a.cod,
                votos_legenda=legenda[a.cod][j],
                # Candidato sem voto nesta zona simplesmente não aparece nela —
                # é o que o EA20 faz, e evita materializar milhões de zeros.
                candidatos=tuple(
                    Candidato(cod=c.cod, votos_nominais=nominais[a.cod][c.cod][j], nascimento=c.nascimento)
                    for c in a.candidatos
                    if nominais[a.cod][c.cod][j] > 0
                ),
            )
            for a in entrada.agremiacoes
        ]
        zonas.append(
            EntradaProporcional(
                agremiacoes=agremiacoes,
                lugares_a_preencher=entrada.lugares_a_preencher,
                quociente_eleitoral_tse=None,
                vagas_tse={},
                totalizacao_final=entrada.totalizacao_final,
            )
        )
    return zonas


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

    # ---- (2) custo real de RF-127 ------------------------------------------
    print("\n== (2) custo de RF-127 (`cadeiras_bootstrap.intervalo_de_cadeiras`) ==")
    print(f"zonas por UF (tabela `zonas`, 13/09): {sum(ZONAS_POR_UF.values())} no país")

    zonas_por_uf = {uf: fatiar_em_zonas(e, ZONAS_POR_UF[uf]) for uf, e in entradas.items()}
    pontos = {
        uf: distribuir_cadeiras(e.agremiacoes, e.lugares_a_preencher or 1).cadeiras
        for uf, e in entradas.items()
    }

    def rodar(n_resamples: int):
        return [
            intervalo_de_cadeiras(
                zonas=zonas_por_uf[uf],
                entrada_uf=e,
                cadeiras_ponto=pontos[uf],
                lugares_a_preencher=e.lugares_a_preencher or 1,
                seed=20261004,
                n_resamples=n_resamples,
            )
            for uf, e in entradas.items()
        ]

    faltando = [uf for uf, iv in zip(entradas, rodar(N_AMOSTRA)) if iv is None]

    # Medido NO NÚMERO REAL, não extrapolado de uma amostra. A extrapolação
    # linear serve ao laço réplica a réplica do bench antigo e MENTE aqui: uma
    # boa parte do custo por UF (montar a matriz voto × zona, sortear o `idx`,
    # a multiplicação) é paga UMA vez por chamada, não por réplica. Extrapolar
    # de 25 réplicas dava 20 s para uma conta que leva 11.
    t_amostra = cronometrar(lambda: rodar(N_AMOSTRA), 3)
    t_real = cronometrar(lambda: rodar(N_RESAMPLES_DO_MODELO), 2)

    print(f"UFs sem intervalo ...... {faltando or 'nenhuma'}")
    print(f"{N_AMOSTRA:>5} réplicas × {len(golden)} UFs .. {t_amostra:8.2f} s")
    print(f"{N_RESAMPLES_DO_MODELO:>5} réplicas × {len(golden)} UFs .. {t_real:8.2f} s   ← o do ADR-0006")
    print("teto da função: 60 s (`vercel.ts`) · janela do cron: 30 min (ADR-0036)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
