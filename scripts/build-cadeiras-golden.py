"""Gera `tests/fixtures/model/cadeiras-golden-2022.json` (spec 017 RF-126).

Roda offline, sobre dois datasets abertos do TSE que ficam em `build/`
(git-ignored, ~8,3 GB somados). A fixture resultante tem ~0,23 MB e é o que o
teste commitado lê — `tests/unit/model/test_cadeiras_golden_2022.py`.

    .venv-model/bin/python3.14 scripts/build-cadeiras-golden.py

## De onde vem cada campo

| campo | origem |
|---|---|
| votos nominais por candidato | `votacao_candidato_munzona_2022_<UF>.csv`, `QT_VOTOS_NOMINAIS_VALIDOS`, somado sobre (município, zona) e sobre `ST_VOTO_EM_TRANSITO` |
| votos de legenda | `votacao_partido_munzona_2022_<UF>.csv`, `QT_VOTOS_LEGENDA_VALIDOS` |
| agremiação | `NR_FEDERACAO` quando há federação, senão `NR_PARTIDO` — federação é UMA agremiação (Lei 9.096 art. 11-A; Lei 9.504 art. 6º-A) |
| vagas da UF | contagem de `DS_SIT_TOT_TURNO` começando em "ELEITO" |
| **gabarito** | `DS_SIT_TOT_TURNO` — desfecho oficial por candidato, não reconstrução nossa |

## Duas armadilhas que este script já pagou

1. **O cargo 6 NÃO está no arquivo `_BR`** do dataset de partido — só nos de UF.
   Ler a legenda de `_BR` devolve zero para todo mundo, silenciosamente. Custou
   6 cadeiras na primeira medição (505/513 em vez de 511/513), com o padrão
   enganoso de exatamente uma cadeira errada por UF grande.
2. **Baixar o dataset de candidato exige navegador.** O CDN do TSE responde 403
   a cliente automatizado, inclusive com o User-Agent do próprio projeto e com
   `GET` parcial. O caminho é o portal de dados abertos, à mão:
   https://dadosabertos.tse.jus.br/dataset/resultados-2022

## Sobre a data de geração do dataset

O script imprime o `DT_GERACAO` dos CSVs. Ele importa: os embargos da ADI 7228,
julgados em 13/03/2025, derrubaram a modulação e fizeram a decisão **retroagir a
2022**. Um dataset gerado antes disso traria a distribuição proclamada à época,
não a recalculada — e um golden contra ela passaria com um algoritmo errado.
"""

from __future__ import annotations

import collections
import csv
import glob
import json
import pathlib
import sys

CARGO = "6"
TURNO = "1"
NULO = ("-1", "", "#NULO#")
DIR_CAND = pathlib.Path("build/tse-archives/votacao_candidato_munzona_2022")
DIR_PART = pathlib.Path("build/tse-archives/votacao_partido_munzona_2022")
SAIDA = pathlib.Path("tests/fixtures/model/cadeiras-golden-2022.json")


def _legenda_por_partido(uf: str) -> dict[str, int]:
    """Votos de legenda por número de partido. ⚠️ arquivo da UF, nunca `_BR`."""
    fonte = DIR_PART / f"votacao_partido_munzona_2022_{uf}.csv"
    total: dict[str, int] = collections.defaultdict(int)
    with fonte.open(encoding="latin-1", newline="") as fh:
        for r in csv.DictReader(fh, delimiter=";"):
            if r["CD_CARGO"] == CARGO and r["NR_TURNO"] == TURNO:
                total[r["NR_PARTIDO"]] += int(r["QT_VOTOS_LEGENDA_VALIDOS"] or 0)
    return total


def _uf(caminho: pathlib.Path) -> dict | None:
    uf = caminho.stem[-2:]
    legenda = _legenda_por_partido(uf)

    votos: dict[str, int] = collections.defaultdict(int)
    meta: dict[str, dict[str, str]] = {}
    geracao = ""
    with caminho.open(encoding="latin-1", newline="") as fh:
        for r in csv.DictReader(fh, delimiter=";"):
            if r["CD_CARGO"] != CARGO or r["NR_TURNO"] != TURNO:
                continue
            geracao = geracao or r["DT_GERACAO"]
            sq = r["SQ_CANDIDATO"]
            votos[sq] += int(r["QT_VOTOS_NOMINAIS_VALIDOS"] or 0)
            meta.setdefault(sq, r)
    if not meta:
        return None

    grupos: dict[str, list[str]] = collections.defaultdict(list)
    partidos: dict[str, set[str]] = collections.defaultdict(set)
    for sq, r in meta.items():
        cod = f"F{r['NR_FEDERACAO']}" if r["NR_FEDERACAO"] not in NULO else f"P{r['NR_PARTIDO']}"
        grupos[cod].append(sq)
        partidos[cod].add(r["NR_PARTIDO"])

    eleito = lambda m: m["DS_SIT_TOT_TURNO"].startswith("ELEITO")  # noqa: E731
    return {
        "_geracao": geracao,
        "vagas": sum(1 for m in meta.values() if eleito(m)),
        "agremiacoes": [
            {
                "cod": cod,
                "rotulo": (
                    meta[sqs[0]]["SG_FEDERACAO"]
                    if cod.startswith("F")
                    else meta[sqs[0]]["SG_PARTIDO"]
                ),
                "legenda": sum(legenda[p] for p in partidos[cod]),
                "candidatos": sorted(([int(s), votos[s]] for s in sqs), key=lambda x: -x[1]),
            }
            for cod, sqs in grupos.items()
        ],
        "eleitos_tse": sorted(int(s) for s, m in meta.items() if eleito(m)),
        "eleitos_por_qp_tse": sorted(
            int(s) for s, m in meta.items() if m["DS_SIT_TOT_TURNO"] == "ELEITO POR QP"
        ),
    }


def main() -> int:
    if not DIR_CAND.exists() or not DIR_PART.exists():
        print(f"[golden] datasets ausentes em {DIR_CAND} / {DIR_PART}", file=sys.stderr)
        print("[golden] baixe em https://dadosabertos.tse.jus.br/dataset/resultados-2022", file=sys.stderr)
        return 1

    ufs: dict[str, dict] = {}
    geracoes: set[str] = set()
    for caminho in sorted(DIR_CAND.glob("*_2022_??.csv")):
        if caminho.stem.endswith("_BR"):
            continue
        dados = _uf(caminho)
        if dados is None:
            continue
        geracoes.add(dados.pop("_geracao"))
        ufs[caminho.stem[-2:]] = dados

    vagas = sum(u["vagas"] for u in ufs.values())
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(
        json.dumps(
            {
                "_nota": (
                    "Gabarito = DS_SIT_TOT_TURNO do TSE, não reconstrução nossa. "
                    "Gerado por scripts/build-cadeiras-golden.py. "
                    f"DT_GERACAO dos CSVs: {sorted(geracoes)}."
                ),
                "ufs": ufs,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"[golden] {len(ufs)} UFs · {vagas} vagas · {SAIDA.stat().st_size / 1024:.0f} KB")
    print(f"[golden] DT_GERACAO dos CSVs do TSE: {sorted(geracoes)}")
    if vagas != 513:
        print(f"[golden] ⚠️ esperado 513 vagas, veio {vagas}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
