"""
api/model/dado_ts.py

O relógio do **dado** — a hora que o TSE carimbou no boletim, separada da hora
em que o modelo rodou (ADR-0038 D1/D2/D3).

Por que existe
--------------
O campo `ts` dos três envelopes de payload é `datetime.now()` do ciclo do
modelo (`project.py`, `ts_iso`). Ele é honesto no doc-comment do tipo e
continua **intocado** — mas responde "quando o Python calculou", não "quando o
TSE publicou". A diferença só aparece quando a ingestão para: o modelo segue
rodando sobre os últimos snapshots do banco e publicando um `ts` fresco sobre
dado congelado, indefinidamente, sem que nada no payload distinga esse cenário
do saudável.

Todo boletim EA20 traz `dg` (data de geração) e `hg` (hora de geração) no
**topo** do envelope — `payload["dg"]`, `payload["hg"]`, sem sub-objeto
(confirmado em `tests/fixtures/tse/2022/presidente-sp-z0001.json`:
`"04/10/2026"` / `"20:15:30"`) — e os dois são obrigatórios no schema Zod que
valida todo snapshot antes do insert (`lib/tse/ea20-schema.ts:337-338`, sem
`.optional()`). `fetch_snapshots` já seleciona a coluna `payload` inteira, por
par: o relógio do dado já está na memória do Python, sem query nova.

Cuidado com o nome `ts`: no vocabulário do EA20 ele significa **total de
seções** (`payload["s"]["ts"]`, `lib/tse/ea20-schema.ts:197`). Nada aqui lê
esse campo.

O que este módulo NÃO faz
-------------------------
I/O, log e alerta. É tabela estática e funções puras (constituição § 9, mesma
disciplina de `api/model/cargos.py`): devolve os números e a contagem de
diagnóstico, e quem chama (`project.py`) decide o que logar e quando acionar
`_alert_slack`. Sem isso, todo teste deste módulo precisaria de um duplo de
logger para afirmar um número.

Fidelidade ao parser TypeScript
-------------------------------
`parse_dg_hg` é um **porte** de `calculateLagSeconds`
(`lib/tse/metrics.ts:74-115`), não uma segunda interpretação do mesmo formato:
mesmos dois formatos de data aceitos (`dd/mm/aaaa` oficial e `ddMMyyyy`
legado), mesmo `HH:mm:ss`, mesmo offset BRT fixo `-03:00` (o Brasil aboliu o
horário de verão em 2019 — não há DST a tratar) e mesma decisão de **levantar**
em vez de devolver um valor de consolo. Dois parsers da mesma data divergindo
em silêncio num caso de borda é a classe de defeito que esta base já pagou caro
para descobrir tarde.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable

from api.model.cargos import cadencia_segundos

# `dd/mm/aaaa` (formato oficial 2026) e `ddMMyyyy` (legado) — os mesmos dois
# que `lib/tse/metrics.ts:79-85` aceita, nem um a mais.
_RE_DG_BARRAS = re.compile(r"^(\d{2})/(\d{2})/(\d{4})$")
_RE_DG_SEM_BARRAS = re.compile(r"^(\d{2})(\d{2})(\d{4})$")
_RE_HG = re.compile(r"^\d{2}:\d{2}:\d{2}$")

#: BRT é UTC-3 o ano inteiro (horário de verão abolido em 2019). Fixo, como no
#: lado TS — derivar o offset de um fuso do sistema faria o mesmo snapshot
#: produzir horas diferentes em máquinas diferentes (constituição § 6).
_OFFSET_BRT = "-03:00"

#: Quantas cadências do cargo um par pode ficar atrás do `dado_ts` do PRÓPRIO
#: ciclo antes de contar em `pares_atrasados` (ADR-0038 D2). Duas, e não uma:
#: um par que perdeu a volta corrente ainda é jitter; dois ciclos inteiros sem
#: avançar enquanto outros avançaram é o padrão de falha que este número
#: existe para acender.
CADENCIAS_ATE_PAR_ATRASADO = 2

#: Multiplicador do limiar de alarme sobre a cadência do cargo (ADR-0038 D3).
#: ×1 dispararia a cada tick de cron atrasado por infraestrutura — o próprio
#: ADR-0011 assume ciclos ocasionalmente mais lentos como normais. ×3 dá
#: margem para dois ciclos perdidos completos antes de soar.
CADENCIAS_ATE_ALARME = 3


class DgHgInvalido(ValueError):
    """`dg`/`hg` fora dos formatos do dicionário do TSE.

    Levanta em vez de devolver `None` pelo mesmo motivo do lado TS: um envelope
    com data ilegível é anomalia de upstream, e engoli-la aqui publicaria um
    `dado_ts` calculado sobre um subconjunto silenciosamente menor. Quem chama
    captura por par (ver `relogio_do_dado`) e conta a ocorrência.
    """


def parse_dg_hg(dg: Any, hg: Any) -> datetime:
    """`("04/10/2026", "20:15:30")` → `datetime(2026, 10, 4, 23, 15, 30, tzinfo=utc)`.

    Porte de `calculateLagSeconds` (`lib/tse/metrics.ts:74-115`) — ver o
    cabeçalho do módulo. Devolve sempre datetime **aware em UTC**; comparar
    aware com naive levantaria `TypeError` em algum ponto distante daqui.

    Levanta `DgHgInvalido` para formato fora do dicionário e também para data
    ou hora inexistentes ("31/02/2026", "25:00:00") — o lado TS chega ao mesmo
    resultado via `Number.isNaN(tseTimestamp.getTime())`.
    """
    if not isinstance(dg, str) or not isinstance(hg, str):
        raise DgHgInvalido(f"dg/hg não são strings: dg={dg!r} hg={hg!r}")

    m = _RE_DG_BARRAS.match(dg) or _RE_DG_SEM_BARRAS.match(dg)
    if m is None:
        raise DgHgInvalido(
            f'dg "{dg}" não segue nenhum formato esperado (dd/mm/aaaa ou ddMMyyyy)'
        )
    dd, mm, yyyy = m.group(1), m.group(2), m.group(3)

    if not _RE_HG.match(hg):
        raise DgHgInvalido(f'hg "{hg}" não segue formato HH:mm:ss esperado')

    iso = f"{yyyy}-{mm}-{dd}T{hg}{_OFFSET_BRT}"
    try:
        momento = datetime.fromisoformat(iso)
    except ValueError as exc:
        raise DgHgInvalido(
            f'timestamp construído "{iso}" é inválido (data ou hora fora do range)'
        ) from exc
    return momento.astimezone(timezone.utc)


@dataclass(frozen=True)
class RelogioDoDado:
    """O relógio do dado de um escopo (o ciclo inteiro, ou uma UF dele).

    `dado_ts`/`pares_atrasados` são os dois campos que vão ao payload; os três
    contadores existem só para o log do chamador distinguir a fixture podada
    (benigna) do boletim real fora do dicionário (anomalia) — o payload não
    sabe o porquê do `null`, e não deve saber (ADR-0038 D1).
    """

    #: ISO 8601 em UTC do `(dg,hg)` **mais recente** do escopo, ou `None`
    #: quando nenhum par trouxe um par de campos parseável. `None` nunca é
    #: substituído pela hora de coleta nem pela de cálculo: cair para outro
    #: relógio reintroduziria exatamente o problema que o ADR-0038 resolve.
    dado_ts: str | None
    #: Quantos pares do escopo estão a mais de `CADENCIAS_ATE_PAR_ATRASADO`
    #: cadências atrás do `dado_ts` **do próprio escopo**. `None` quando não há
    #: `dado_ts` ou quando o cargo não declara cadência.
    pares_atrasados: int | None
    #: Linhas consideradas no escopo.
    n_pares: int
    #: Linhas sem `dg` **e** sem `hg` — envelope podado. Fixture de replay é
    #: assim por construção.
    n_sem_campos: int
    #: Linhas com `dg`/`hg` presentes mas ilegíveis (ou só metade presente).
    #: Impossível numa fixture podada; em produção é violação do dicionário.
    n_malformados: int


def _dg_hg_do_payload(payload: Any) -> tuple[Any, Any]:
    """`(dg, hg)` do topo do envelope — `(None, None)` se não houver dict."""
    if not isinstance(payload, dict):
        return None, None
    return payload.get("dg"), payload.get("hg")


def relogio_do_dado(
    snapshots: Iterable[dict[str, Any]], *, cargo: int
) -> RelogioDoDado:
    """O relógio do dado de uma lista de linhas em granularidade de **par**.

    `snapshots` são as linhas de `fetch_snapshots` — e precisam ser as
    PRÉ-merge no ramo majoritário: depois de `merge_pairs_into_zonas`,
    `dg`/`hg` sobrevivem só do par dominante de cada zona (`zona_merge.py:52`),
    e o relógio esconderia 100% dos pares não-dominantes.

    `pares_atrasados` é medido contra o máximo **deste mesmo escopo**, nunca
    contra `now()` (ADR-0038 D2). A diferença é o ponto: comparado ao ciclo, o
    número separa "um par avançou e os outros não" (falha nossa, que este
    número acende) de "o TSE não tem novidade para ninguém agora" (legítimo —
    todos envelhecem juntos e a distância ao máximo continua pequena).
    Comparado a `now()`, os dois cenários produziriam o mesmo número.
    """
    momentos: list[datetime] = []
    n_pares = 0
    n_sem_campos = 0
    n_malformados = 0

    for linha in snapshots:
        n_pares += 1
        dg, hg = _dg_hg_do_payload(linha.get("payload"))
        if dg is None and hg is None:
            n_sem_campos += 1
            continue
        try:
            # Metade do par presente cai aqui e conta como malformado: os dois
            # campos são obrigatórios no mesmo schema, então um sem o outro já
            # é violação de dicionário, não envelope podado.
            momentos.append(parse_dg_hg(dg, hg))
        except DgHgInvalido:
            n_malformados += 1

    if not momentos:
        # Ausência total → `None` nos DOIS campos. Sem fallback, por decisão do
        # ADR-0038 D1: um número que parece hora do dado sem ser é pior que a
        # ausência declarada.
        return RelogioDoDado(
            dado_ts=None,
            pares_atrasados=None,
            n_pares=n_pares,
            n_sem_campos=n_sem_campos,
            n_malformados=n_malformados,
        )

    maximo = max(momentos)
    cadencia = cadencia_segundos(cargo)
    if cadencia is None:
        # Cargo sem cadência declarada: há hora do dado, mas não há régua para
        # dizer o que é "atrasado". `None` em vez de contar com uma régua
        # arbitrária.
        pares_atrasados: int | None = None
    else:
        janela = CADENCIAS_ATE_PAR_ATRASADO * cadencia
        pares_atrasados = sum(
            1 for m in momentos if (maximo - m).total_seconds() > janela
        )

    return RelogioDoDado(
        # `.isoformat()` sobre datetime aware em UTC — mesma convenção do
        # `ts_iso` do payload (`+00:00`, não `Z`), para os dois relógios
        # entrarem no JSON no mesmo formato e a UI poder compará-los sem
        # normalizar nada.
        dado_ts=maximo.isoformat(),
        pares_atrasados=pares_atrasados,
        n_pares=n_pares,
        n_sem_campos=n_sem_campos,
        n_malformados=n_malformados,
    )


def relogio_por_uf(
    snapshots: Iterable[dict[str, Any]], *, cargo: int
) -> dict[str, RelogioDoDado]:
    """O mesmo relógio, por UF — cada uma medida só contra os pares dela.

    Duas resoluções, e não uma (ADR-0038 D2): a ingestão degrada regionalmente
    (rede específica, lock preso num fan-out parcial) sem que o agregado
    nacional acuse nada. Uma UF inteira parada aparece no `dado_ts` **dela**,
    envelhecido; uma UF onde um par anda e os outros não aparece no
    `pares_atrasados` **dela**, porque o máximo de comparação também é o dela.

    `BR` e UF vazia ficam de fora: o arquivo de abrangência nacional não é uma
    unidade federativa e não tem página de UF para carimbar.
    """
    por_uf: dict[str, list[dict[str, Any]]] = {}
    for linha in snapshots:
        sigla = str(linha.get("uf") or "").strip().upper()
        if not sigla or sigla == "BR":
            continue
        por_uf.setdefault(sigla, []).append(linha)
    return {
        sigla: relogio_do_dado(linhas, cargo=cargo)
        for sigla, linhas in por_uf.items()
    }


def limiar_alarme_segundos(cargo: int) -> int | None:
    """Quantos segundos de dado parado acendem o alarme do cargo (D3).

    **Derivado** de `CADENCIA_SEGUNDOS` (`api/model/cargos.py`), nunca um
    segundo número mantido à mão: quando o ADR-0036 mudou a cadência de
    Deputado de 15 para 30 min, o limiar acompanhou sem nenhuma edição aqui.
    `None` para cargo sem cadência declarada — sem régua, sem alarme.
    """
    cadencia = cadencia_segundos(cargo)
    return None if cadencia is None else cadencia * CADENCIAS_ATE_ALARME


def lag_segundos(dado_ts: str | None, agora: datetime | None = None) -> float | None:
    """Idade do dado em segundos — `None` quando não há `dado_ts`.

    Este é o ÚNICO ponto do módulo que olha o relógio de parede, e ele serve ao
    alarme/banner (D3/D4), não a `pares_atrasados` (D2), que é relativo ao
    ciclo. `agora` é parâmetro para o teste poder fixá-lo.
    """
    if not dado_ts:
        return None
    momento = datetime.fromisoformat(dado_ts)
    if momento.tzinfo is None:
        momento = momento.replace(tzinfo=timezone.utc)
    referencia = agora or datetime.now(timezone.utc)
    return (referencia - momento).total_seconds()
