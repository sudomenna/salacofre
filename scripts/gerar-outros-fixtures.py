#!/usr/bin/env python3
"""scripts/gerar-outros-fixtures.py — leva `por_uf[].top_candidatos[]` de 3
para 4 entradas e acrescenta o agregado `por_uf[].outros` nas fixtures de
simulação JÁ GRAVADAS.

Uso:
    .venv-model/bin/python3.14 scripts/gerar-outros-fixtures.py
    .venv-model/bin/python3.14 scripts/gerar-outros-fixtures.py --check   # não escreve

---------------------------------------------------------------------------
Por que este arquivo existe
---------------------------------------------------------------------------
2026-09-19 — pedido do dono: o balão de hover dos mapas passa a mostrar 4
candidaturas + uma linha "Outros" com o quanto todos os demais somados
representam. `api/model/project.py` (`TOP_CANDIDATOS_POR_UF`) e
`data-pipeline/simulacao-gerar.ts` foram corrigidos no mesmo dia para EMITIR
as 4 linhas e o agregado — mas só a partir da PRÓXIMA geração.

As fixtures em `tests/fixtures/simulacao/*.json` foram gravadas ANTES e têm
3 entradas e nenhum `outros`. Sem este remendo, `pnpm dev:sim` continua
mostrando 3 linhas e o dono conclui que o trabalho não foi feito — foi
exatamente o que aconteceu em 18/09 com `votos_atuais`/`pct_atual`, a
história que a docstring de `scripts/gerar-votos-pct-atual-fixtures.py`
(:16-22) registra e que este script é o molde.

Regenerar por `pnpm sim` exige `DATABASE_URL` — e o `.env.local` deste
projeto aponta para **produção**, o banco que vai guardar a apuração de
04/10. Não é uma troca aceitável só para ver um balão. Daí a mesma saída:
um remendo determinístico e idempotente sobre o JSON já gravado, **sem
banco e sem rede**.

---------------------------------------------------------------------------
De onde vem a 4ª candidatura e a cauda — e a guarda que prova a fonte
---------------------------------------------------------------------------
Para montar a 4ª linha e somar a cauda é preciso a lista COMPLETA de
candidaturas de cada UF, que `por_uf[]` não carrega (ela só tem o topo). A
fonte é diferente por cargo:

  - **Presidente** — corrida única nacional, `id` = número de urna, o MESMO
    em toda UF. A lista da UF é `presidente-uf.json[sigla].candidatos[]`
    (`EdgeUfCandidate`). Casar só por `id` aqui daria o número do Brasil
    inteiro no balão de cada estado (o defeito que a 1ª versão do script
    irmão cometeu) — por isso a fonte é o arquivo POR UF.
  - **Governador / Senador** — `idBase = (ordem_da_uf + 1) * 1000` torna o
    `id` único por (UF, candidatura) neste gerador, então
    `national.candidatos` é uma linha por (UF, candidatura) e serve de fonte.
    A partição por UF NÃO é assumida a partir da ordem alfabética: ela é
    **derivada dos próprios dados**, mapeando `id // 1000` → sigla pelas
    entradas que já estão em `top_candidatos` (`_particionar_por_uf`), e o
    script aborta se um bucket aparecer em duas UFs ou uma UF em dois
    buckets. Medido nas fixtures atuais: 27 buckets, 27 UFs, zero órfãos.

**A guarda que importa** (`_ordenar_fonte` + a checagem de prefixo em
`_reescrever_linha`): a lista da fonte é ordenada por `pct_projetado` desc,
`id` asc — o MESMO critério do gerador (ADR-0013) — e o prefixo dessa
ordenação TEM de reproduzir, id a id e na ordem, os `top_candidatos` que já
estão gravados. Se não reproduzir, a fonte não é a lista daquela corrida e a
linha **não é tocada** (fica registrada em `divergentes`). É o que impede
este script de inventar uma 4ª candidatura a partir do arquivo errado.
Medido antes de escrever: 0 divergências em 81 linhas (27 UFs × 3 arquivos).

`deputado.json` não entra: `top_candidatos` é `[]` nas 27 linhas (cargo
proporcional, a tela é o hemiciclo, não o pódio). `municipios-*.json` e
`*-uf.json` não têm `por_uf` — são lidos como fonte, nunca escritos.

---------------------------------------------------------------------------
`sqcand` da 4ª linha: presente em Presidente e Senador, AUSENTE em Governador
---------------------------------------------------------------------------
`sqcand` é o que endereça a foto (ADR-0041) e não é derivável de nada — ou a
fixture tem, ou não tem:

  - Presidente → `presidente-uf.json` traz `sqcand` nas 12 candidaturas.
  - Senador    → `senador-uf.json` traz nas 285.
  - Governador → **não existe `governador-uf.json`**, e o `national.
    candidatos` de cargo 3 não carrega `sqcand` por contrato (ele é a união
    de 27 corridas — ADR-0042). A 4ª linha de Governador sai SEM `sqcand`.

Consequência aceita e honesta: no `pnpm dev:sim`, a 4ª candidatura de
Governador aparece sem foto — que é exatamente o estado de degradação que
`synthesizeGovUfFromFixture` já implementa ("sem a linha da UF, nada é
inventado (...) fica sem foto, que é o estado honesto"). Inventar um
`sqcand` plausível seria endereçar a foto de OUTRA pessoa. Depois do próximo
`pnpm sim` contra o banco, o campo passa a vir de fábrica.

---------------------------------------------------------------------------
Precisão: somamos valores JÁ ARREDONDADOS (e por que isso é aceitável aqui)
---------------------------------------------------------------------------
O gerador calcula `outros.pct` como `r2(Σ shareFinal)` — soma dos floats
crus. Aqui só existem os valores publicados, já passados por `r2`, então o
que sai é `r2(Σ r2(shareFinal))`. A diferença é de até 0,005 pp por
candidatura da cauda (≤ 0,07 pp na maior cauda das fixtures atuais, 14
candidaturas) e some no próximo `pnpm sim`. É um remendo para a tela de
desenvolvimento, não um número publicado — e mesmo assim vale registrar que
os dois caminhos não são bit-a-bit idênticos.

🔴 O que este script **não** faz, nem aqui nem lá: `outros.pct` NUNCA sai de
`100 − Σ(top 4)`. Os pontos não fecham em 100 exatamente (cada um é a média
de um bootstrap próprio, e ainda passou por `r2`), e a subtração jogaria
esse resíduo de fechamento dentro de "Outros", publicando erro de
arredondamento como se fosse voto de alguém. Soma candidato a candidato,
sempre — mesma regra de `api/model/project.py` e de
`tests/unit/model/test_outros.py`.

---------------------------------------------------------------------------
Não destrutivo e idempotente
---------------------------------------------------------------------------
Cada arquivo é lido inteiro, tem `top_candidatos` estendido (as 3 entradas
existentes são REAPROVEITADAS objeto a objeto, não remontadas — nome,
partido, sqcand e os dois campos de apuração chegam intocados) e `outros`
acrescentado, e é regravado inteiro: `serie_por_candidato`, `national` e
qualquer outra chave de topo seguem intactas porque nunca saem da estrutura
em memória.

Rodar duas vezes não produz diff na segunda: uma linha que já tem
`min(4, n_candidaturas)` entradas e o `outros` coerente com a cauda é pulada.

---------------------------------------------------------------------------
🔴 O formato de saída TEM que ser o que o `biome` aceita — achado do dono
---------------------------------------------------------------------------
`json.dumps(..., indent=2)` expande QUALQUER lista para uma linha por
elemento, inclusive `"margem_projetada_ci": [-2.07, 6.47]`, que o formatador
do `biome` mantém numa linha só. A 1ª versão do script irmão gravou assim e
deixou `pnpm lint` e o hook de pre-commit vermelhos sem avisar em lugar
nenhum. A correção não é reimplementar as regras do `biome` aqui — é
delegar ao próprio binário depois de escrever (`_gravar_json`).
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
from pathlib import Path
from typing import Any

RAIZ = Path(__file__).resolve().parent.parent
FIXTURES = RAIZ / "tests" / "fixtures" / "simulacao"
BIOME = RAIZ / "node_modules" / ".bin" / "biome"

#: Espelha `TOP_CANDIDATOS_POR_UF` de `api/model/project.py` e o homônimo de
#: `data-pipeline/simulacao-gerar.ts`. Os três TÊM de concordar: este script
#: existe justamente para que a fixture mostre o que produção mostra.
TOP_CANDIDATOS_POR_UF = 4

#: Ordem das chaves de uma entrada de `top_candidatos[]`, para o diff ficar
#: legível e a 4ª linha nascer com o mesmo formato das três de cima.
CAMPOS_TOP = ("id", "pct", "nome", "partido", "sqcand", "votos_atuais", "pct_atual")


def _r2(x: float) -> float:
    """`Math.round(x * 100) / 100` do TypeScript, não o `round()` do Python.

    A diferença não é acadêmica: `round(2.675, 2)` devolve `2.67` (banqueiro
    sobre o float binário) e o `r2` do gerador devolve `2.68` (meio para
    cima). Um número da fixture que não bata com o do gerador reapareceria
    como diff na próxima geração e pareceria mudança de dado.
    """
    return math.floor(x * 100 + 0.5) / 100


def _gravar_json(caminho: Path, payload: dict[str, Any]) -> None:
    """`write_text` + `biome format --write` no MESMO arquivo — nunca deixa o
    JSON no estilo bruto do `json.dumps` (ver docstring do módulo)."""
    caminho.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    if not BIOME.exists():
        print(
            f"⚠️ {BIOME} não existe (rode `pnpm install`) — {caminho.name} ficou no "
            "formato bruto do json.dumps e vai reprovar `pnpm lint`.",
            file=sys.stderr,
        )
        return
    subprocess.run([str(BIOME), "format", "--write", str(caminho)], check=True)


def _ordenar_fonte(cands: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """`pct_projetado` desc, `id` asc — o MESMO critério de
    `resolverCorridaUf` (ADR-0013) e de `build_edge_payload`."""
    return sorted(cands, key=lambda c: (-float(c["pct_projetado"]), int(c["id"])))


def _particionar_por_uf(payload: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Governador/Senador: parte `national.candidatos` por UF usando
    `id // 1000`, com o mapa bucket→sigla DERIVADO de `top_candidatos`.

    Não assume a ordem alfabética das UFs (que é de onde `idBase` sai no
    gerador): lê a associação dos próprios dados e aborta se ela não for uma
    bijeção. Assim o script não depende de um detalhe interno do gerador que
    pode mudar sem aviso — se mudar, ele levanta em vez de escrever errado.
    """
    bucket_para_sigla: dict[int, str] = {}
    for linha in payload["por_uf"]:
        buckets = {int(t["id"]) // 1000 for t in linha["top_candidatos"]}
        if len(buckets) != 1:
            raise SystemExit(
                f"UF {linha['sigla']}: top_candidatos caem em {len(buckets)} buckets "
                f"de id ({sorted(buckets)}) — a hipótese `idBase = (ordem+1)*1000` "
                "não vale nesta fixture; investigue antes de rodar."
            )
        bucket = buckets.pop()
        if bucket in bucket_para_sigla:
            raise SystemExit(
                f"bucket {bucket} reivindicado por {bucket_para_sigla[bucket]} e por "
                f"{linha['sigla']} — partição por UF ambígua."
            )
        bucket_para_sigla[bucket] = linha["sigla"]

    por_uf: dict[str, list[dict[str, Any]]] = {s: [] for s in bucket_para_sigla.values()}
    orfaos = 0
    for c in payload["national"]["candidatos"]:
        sigla = bucket_para_sigla.get(int(c["id"]) // 1000)
        if sigla is None:
            orfaos += 1
            continue
        por_uf[sigla].append(c)
    if orfaos:
        raise SystemExit(
            f"{orfaos} candidaturas de national.candidatos sem UF — partição incompleta."
        )
    return por_uf


def _nova_entrada_top(
    fonte: dict[str, Any], sqcand: str | None
) -> dict[str, Any]:
    """Monta a entrada de `top_candidatos[]` da 4ª candidatura.

    `sqcand` entra SÓ quando resolvido (Presidente/Senador). Uma chave
    presente valendo `None` seria "tenho, e vale nada" para quem testa
    `"sqcand" in c` — a mesma razão pela qual `synthesizeGovUfFromFixture`
    espalha `...(daUf?.sqcand ? {...} : {})` em vez de atribuir `undefined`.
    """
    bruto: dict[str, Any] = {
        "id": int(fonte["id"]),
        "pct": fonte["pct_projetado"],
        "nome": fonte["nome"],
        "partido": fonte["partido"],
        "sqcand": sqcand,
        "votos_atuais": fonte["votos_atuais"],
        "pct_atual": fonte["pct_atual"],
    }
    return {k: bruto[k] for k in CAMPOS_TOP if bruto.get(k) is not None}


def _outros_da_cauda(cauda: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Agregado "Outros" — `None` (⇒ chave omitida) se a cauda é vazia.

    Soma candidatura a candidatura. Ver o § de precisão na docstring do
    módulo e o 🔴 sobre `100 − Σ(top 4)`.
    """
    if not cauda:
        return None
    return {
        "pct": _r2(sum(float(c["pct_projetado"]) for c in cauda)),
        "pct_atual": _r2(sum(float(c["pct_atual"]) for c in cauda)),
        "votos_atuais": int(sum(int(c["votos_atuais"]) for c in cauda)),
        "n_candidatos": len(cauda),
    }


def _reescrever_linha(
    linha: dict[str, Any],
    fonte_ordenada: list[dict[str, Any]],
    sqcand_por_id: dict[int, str],
) -> str:
    """Estende `top_candidatos` e acrescenta `outros` numa linha de `por_uf`.

    Devolve `"ok"`, `"pulado"` (já estava no formato novo — idempotência) ou
    `"divergente"` (a fonte não reproduz o topo já gravado; NÃO toca a linha).
    """
    top = linha["top_candidatos"]
    prefixo_fonte = [int(c["id"]) for c in fonte_ordenada[: len(top)]]
    if prefixo_fonte != [int(t["id"]) for t in top]:
        return "divergente"

    alvo = min(TOP_CANDIDATOS_POR_UF, len(fonte_ordenada))
    cauda = fonte_ordenada[TOP_CANDIDATOS_POR_UF:]
    outros = _outros_da_cauda(cauda)
    if len(top) == alvo and linha.get("outros") == outros and ("outros" in linha) == (
        outros is not None
    ):
        return "pulado"

    # As entradas que já existem são REAPROVEITADAS, não remontadas: elas já
    # carregam nome/partido/sqcand resolvidos pelo gerador, e remontá-las a
    # partir da fonte perderia `sqcand` em Governador.
    novo_top = list(top)
    for c in fonte_ordenada[len(top) : alvo]:
        novo_top.append(_nova_entrada_top(c, sqcand_por_id.get(int(c["id"]))))
    linha["top_candidatos"] = novo_top

    # Posição da chave: logo DEPOIS de `top_candidatos`, que é onde o gerador
    # a emite (`linhaUf`, `data-pipeline/simulacao-gerar.ts`) e onde o tipo a
    # declara (`EdgeUfRow`, `lib/edge-config/types.ts`). Ordem de chave não
    # muda semântica nenhuma de JSON — muda o DIFF: um `outros` no fim do
    # objeto viraria ruído de ordenação no primeiro `pnpm sim` de verdade, e
    # quem lesse esse diff teria de conferir valor por valor para ver que nada
    # mudou. Por isso o dict é remontado em vez de receber a chave no fim.
    linha.pop("outros", None)
    if outros is not None:
        reordenado = {}
        for chave, valor in linha.items():
            reordenado[chave] = valor
            if chave == "top_candidatos":
                reordenado["outros"] = outros
        if "outros" not in reordenado:  # linha sem `top_candidatos` — impossível aqui
            reordenado["outros"] = outros
        linha.clear()
        linha.update(reordenado)
    return "ok"


def _processar(
    caminho: Path,
    fonte_por_uf: dict[str, list[dict[str, Any]]],
    sqcand_por_uf_id: dict[tuple[str, int], str],
    payload: dict[str, Any],
) -> tuple[dict[str, int], list[str]]:
    contagem = {"ok": 0, "pulado": 0, "divergente": 0, "sem_fonte": 0}
    divergentes: list[str] = []
    for linha in payload["por_uf"]:
        sigla = linha["sigla"]
        cands = fonte_por_uf.get(sigla)
        if not cands:
            contagem["sem_fonte"] += 1
            continue
        sq = {
            cid: v for (s, cid), v in sqcand_por_uf_id.items() if s == sigla
        }
        estado = _reescrever_linha(linha, _ordenar_fonte(cands), sq)
        contagem[estado] += 1
        if estado == "divergente":
            divergentes.append(sigla)
    return contagem, divergentes


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__ and __doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="não escreve; só relata")
    args = ap.parse_args()

    relatorio: list[str] = []
    houve_problema = False

    # ---- Presidente — fonte é presidente-uf.json, casada por (sigla, id).
    presidente = json.loads((FIXTURES / "presidente.json").read_text())
    presidente_uf = json.loads((FIXTURES / "presidente-uf.json").read_text())
    fonte_pres = {
        sigla: list(bloco.get("candidatos") or [])
        for sigla, bloco in presidente_uf.items()
    }
    sq_pres = {
        (sigla, int(c["id"])): c["sqcand"]
        for sigla, cands in fonte_pres.items()
        for c in cands
        if c.get("sqcand")
    }

    # ---- Senador — números de national.candidatos, `sqcand` de senador-uf.json.
    senador = json.loads((FIXTURES / "senador.json").read_text())
    senador_uf = json.loads((FIXTURES / "senador-uf.json").read_text())
    sq_sen = {
        (sigla, int(c["id"])): c["sqcand"]
        for sigla, bloco in senador_uf.items()
        for c in (bloco.get("candidatos") or [])
        if c.get("sqcand")
    }

    # ---- Governador — sem arquivo por UF; a 4ª linha sai sem `sqcand`.
    governador = json.loads((FIXTURES / "governador.json").read_text())

    trabalhos: list[tuple[str, dict[str, Any], dict[str, list[dict[str, Any]]], dict[tuple[str, int], str]]] = [
        ("presidente.json", presidente, fonte_pres, sq_pres),
        ("governador.json", governador, _particionar_por_uf(governador), {}),
        ("senador.json", senador, _particionar_por_uf(senador), sq_sen),
    ]

    for nome, payload, fonte, sq in trabalhos:
        contagem, divergentes = _processar(FIXTURES / nome, fonte, sq, payload)
        relatorio.append(
            f"{nome} → {contagem['ok']} linhas estendidas, {contagem['pulado']} já no "
            f"formato novo, {contagem['divergente']} divergentes, "
            f"{contagem['sem_fonte']} sem fonte"
        )
        if contagem["divergente"] or contagem["sem_fonte"]:
            houve_problema = True
            if divergentes:
                relatorio.append(f"  ⚠️ fonte não reproduz o topo gravado em: {divergentes}")
        if not args.check and contagem["ok"] > 0:
            _gravar_json(FIXTURES / nome, payload)

    print(("[check] " if args.check else "[escrito] ") + "\n          ".join(relatorio))
    if houve_problema:
        print(
            "\n⚠️ Alguma linha não pôde ser estendida com segurança e ficou como estava"
            " (3 linhas, sem 'Outros'). Investigue antes de confiar no balão nessas UFs.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
