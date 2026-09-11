"""Do envelope EA20 para o cálculo de cadeiras (spec 017, RF-121 a RF-125.1).

`api/model/cadeiras.py` implementa o algoritmo do ADR-0027 e não sabe nada sobre
o TSE. Este módulo é a ponte: lê um envelope EA20 de cargo proporcional e produz
as `Agremiacao` que aquele algoritmo consome.

## A hierarquia, e por que `fed[]` NÃO é percorrida

A árvore do EA20 (documento oficial,
`tse_docs/txt/tse-ea20-arquivo-de-resultado-unificado.txt:417-434`) é:

    carg[]  ├── nv  (vagas no cargo)
            ├── qe  (quociente eleitoral — só cargo proporcional)
            ├── fed[]  (n, nm, sg, com, npar[])          ← só COMPOSIÇÃO
            └── agr[]  (Coligação | Federação | Partido isolado)
                 ├── tp ('c' | 'f' | 'i'), vag
                 └── par[] ── cand[]

`fed[]` **não tem `par[]` nem `cand[]`**: é um dicionário que diz quais partidos
compõem cada federação. Todo voto e todo candidato chegam por `agr[]`, e a
federação aparece ali como `agr[].tp == "f"` — que é exatamente a unidade de
agregação que o art. 6º-A da Lei 9.504 manda usar. Percorrer `fed[]` atrás de
candidatos devolveria lista vazia.

## Os três números que o TSE publica e que ninguém lia

`carg[].qe`, `carg[].nv` e `agr[].vag` são, respectivamente, o quociente
eleitoral, as vagas da circunscrição e as cadeiras que **o próprio TSE** atribuiu
a cada agremiação. Nenhum tinha consumidor no repositório até 2026-09-11.

Eles valem ouro por dois motivos:

1. **`nv` é a fonte de `lugares_a_preencher`** (RF-124): o número de cadeiras por
   UF sai do dado, nunca de tabela embutida. A Res.-TSE 23.748/2026 art. 7º § 1º
   remete à LC 78/1993, e a redistribuição pelo Censo 2022 (PLP 177/2023) tem
   desfecho não confirmado — errar esse denominador corrompe a projeção inteira.
2. **`qe` e `vag` são um golden AO VIVO.** Depois da totalização final, comparar
   nossa conta com a do TSE responde, com dado real, se o algoritmo do ADR-0027
   está certo — sem depender do dataset histórico de 2022. `conferir_contra_tse`
   faz isso e é o que torna o gate de 19/09 verificável mesmo antes do golden.

Enquanto a apuração é parcial, `vag` reflete o estado parcial e divergir dele é
esperado: a comparação só é conclusiva com `tf == "s"` (totalização final).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from api.model.cadeiras import Agremiacao, Candidato, ResultadoCadeiras

CARGO_DEPUTADO_FEDERAL = 6


# ---------------------------------------------------------------------------
# Leitura de campos — o TSE publica tudo como string, em formato BR
# ---------------------------------------------------------------------------


def _int(raw: Any, default: int = 0) -> int:
    """`"1.234"` → `1234`. Campo ausente ou ilegível vira `default`.

    O separador de milhar do TSE é o ponto; não há decimal nestes campos.
    """
    if raw is None:
        return default
    texto = str(raw).strip().replace(".", "").replace(" ", "")
    if not texto:
        return default
    try:
        return int(texto)
    except ValueError:
        return default


def _nascimento(raw: Any) -> int | None:
    """`"31/12/1970"` → `19701231`, para o desempate do art. 110 (mais idoso).

    Devolve `None` quando ausente ou malformado — `cadeiras.py` trata isso como
    "data desconhecida" e desempata pelo código, de forma declarada.
    """
    if raw is None:
        return None
    partes = str(raw).strip().split("/")
    if len(partes) != 3:
        return None
    dia, mes, ano = partes
    if not (dia.isdigit() and mes.isdigit() and ano.isdigit()):
        return None
    if len(ano) != 4:
        return None
    return int(ano) * 10_000 + int(mes) * 100 + int(dia)


def _cod_candidato(cand: dict[str, Any]) -> int | None:
    """Identificador ÚNICO do candidato: `sqcand`, nunca o número de urna.

    `cand.n` é o número que o eleitor digita — ele se repete entre UFs e entre
    partidos no proporcional. Usá-lo como chave fundiria candidatos distintos.
    `sqcand` é o sequencial único do TSE (`ea20-schema.ts:80`).
    """
    seq = cand.get("sqcand")
    if seq is None:
        return None
    texto = str(seq).strip()
    return int(texto) if texto.isdigit() else None


def _raiz(payload: Any) -> dict[str, Any] | None:
    """Desembrulha o `abr[0]` que alguns níveis do EA20 usam."""
    if not isinstance(payload, dict):
        return None
    abr = payload.get("abr")
    if isinstance(abr, list) and abr and isinstance(abr[0], dict):
        return abr[0]
    return payload


# ---------------------------------------------------------------------------
# Extração
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class EntradaProporcional:
    """Tudo que um envelope EA20 de cargo proporcional oferece ao cálculo."""

    agremiacoes: list[Agremiacao]
    #: `carg[].nv` — vagas da circunscrição. `None` quando o TSE não publicou.
    lugares_a_preencher: int | None
    #: `carg[].qe` — o quociente eleitoral do PRÓPRIO TSE, para conferência.
    quociente_eleitoral_tse: int | None
    #: `agr[].vag` — cadeiras que o TSE atribuiu a cada agremiação.
    vagas_tse: dict[str, int]
    #: `tf == "s"` — só com totalização final a conferência é conclusiva.
    totalizacao_final: bool


def extrair_entrada_proporcional(
    payload: Any, cargo: int = CARGO_DEPUTADO_FEDERAL
) -> EntradaProporcional:
    """Lê um envelope EA20 e monta a entrada de `distribuir_cadeiras`.

    Cada `agr[]` vira **uma** `Agremiacao` — inclusive a federação, que é
    `tp == "f"` e já traz os partidos componentes em `par[]`. Somar os `par[]`
    aqui é o que a Lei 9.096 art. 11-A e a Lei 9.504 art. 6º-A mandam fazer, e é
    o que evita o erro de tratar uma federação como três partidos (medido em
    `tests/unit/model/test_cadeiras.py`: duas cadeiras de diferença).

    Agremiações do tipo `"c"` (coligação) são **descartadas com sinal**: coligação
    em eleição proporcional é vedada desde 2020 (CF art. 17 § 1º, EC 97/2017), e
    encontrá-la aqui é anomalia de dado, não caso a processar (ADR-0027, caso de
    borda 7). Elas saem em `agremiacoes` com `cod` prefixado por `"coligacao:"`
    para que o caller possa logar — nunca silenciosamente somadas.
    """
    raiz = _raiz(payload)
    if raiz is None:
        return EntradaProporcional([], None, None, {}, False)

    cargos = raiz.get("carg")
    if not isinstance(cargos, list):
        return EntradaProporcional([], None, None, {}, False)

    totalizacao_final = str(raiz.get("tf", "")).strip().lower() == "s"

    for carg in cargos:
        if not isinstance(carg, dict):
            continue
        if _int(carg.get("cd"), default=-1) != cargo:
            continue

        nv = carg.get("nv")
        qe = carg.get("qe")
        agremiacoes: list[Agremiacao] = []
        vagas_tse: dict[str, int] = {}

        for agr in carg.get("agr") or []:
            if not isinstance(agr, dict):
                continue
            tipo = str(agr.get("tp", "")).strip().lower()
            numero = str(agr.get("n", "")).strip()
            if not numero:
                continue
            cod = f"coligacao:{numero}" if tipo == "c" else numero

            candidatos: list[Candidato] = []
            legenda_dos_partidos = 0
            for par in agr.get("par") or []:
                if not isinstance(par, dict):
                    continue
                legenda_dos_partidos += _int(par.get("tvtl"))
                for cand in par.get("cand") or []:
                    if not isinstance(cand, dict):
                        continue
                    cod_cand = _cod_candidato(cand)
                    if cod_cand is None:
                        continue
                    candidatos.append(
                        Candidato(
                            cod=cod_cand,
                            votos_nominais=_int(cand.get("vap")),
                            nascimento=_nascimento(cand.get("dt")),
                        )
                    )

            # `agr[].tvtl` é o agregado publicado; a soma dos `par[].tvtl` é o
            # mesmo número por construção. Preferimos o agregado quando existe,
            # e caímos na soma quando o TSE o omite.
            legenda = _int(agr.get("tvtl"), default=legenda_dos_partidos)
            if agr.get("tvtl") is None:
                legenda = legenda_dos_partidos

            agremiacoes.append(
                Agremiacao(cod=cod, votos_legenda=legenda, candidatos=tuple(candidatos))
            )
            if agr.get("vag") is not None:
                vagas_tse[cod] = _int(agr.get("vag"))

        return EntradaProporcional(
            agremiacoes=agremiacoes,
            lugares_a_preencher=_int(nv, default=0) or None,
            quociente_eleitoral_tse=_int(qe, default=0) or None,
            vagas_tse=vagas_tse,
            totalizacao_final=totalizacao_final,
        )

    return EntradaProporcional([], None, None, {}, totalizacao_final)


# ---------------------------------------------------------------------------
# Conferência contra o próprio TSE — o golden ao vivo
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Divergencia:
    """Uma discordância entre a nossa conta e a do TSE."""

    o_que: str
    nosso: int
    tse: int
    detalhe: str = ""


def conferir_contra_tse(
    resultado: ResultadoCadeiras, entrada: EntradaProporcional
) -> list[Divergencia]:
    """Compara nossa distribuição com os números que o TSE publica.

    É o golden que não depende de dataset histórico: o EA20 traz o quociente
    eleitoral (`carg[].qe`) e as cadeiras por agremiação (`agr[].vag`) calculados
    pelo próprio TSE. Se o ADR-0027 estiver implementado certo, os dois batem.

    **Só é conclusivo com totalização final** (`tf == "s"`). Durante a apuração
    parcial o TSE recalcula a cada boletim e divergir dele é esperado — por isso
    o caller deve tratar divergência parcial como observação, e divergência com
    `totalizacao_final=True` como **erro** que bloqueia a exibição de cadeiras.

    Devolve lista vazia quando bate, ou quando o TSE não publicou os campos.
    """
    divergencias: list[Divergencia] = []

    if entrada.quociente_eleitoral_tse is not None:
        if resultado.quociente_eleitoral != entrada.quociente_eleitoral_tse:
            divergencias.append(
                Divergencia(
                    o_que="quociente_eleitoral",
                    nosso=resultado.quociente_eleitoral,
                    tse=entrada.quociente_eleitoral_tse,
                    detalhe=(
                        "arredondamento do art. 106 (0,5 exato desce) ou definição "
                        "de votos válidos (brancos/nulos fora)"
                    ),
                )
            )

    for cod, vag_tse in sorted(entrada.vagas_tse.items()):
        nosso = resultado.cadeiras.get(cod, 0)
        if nosso != vag_tse:
            divergencias.append(
                Divergencia(
                    o_que=f"cadeiras[{cod}]",
                    nosso=nosso,
                    tse=vag_tse,
                    detalhe="distribuição de sobras ou cláusula dos 10%/20%",
                )
            )

    return divergencias
