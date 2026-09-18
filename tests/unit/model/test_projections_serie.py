"""Spec 020 Fase 1 — a base "apurado" da série entra em `projections`.

Cobre as três colunas da migration 0009 (`pct_atual`, `votos_atuais`,
`dado_ts`) e a função pura que calcula o `pct_atual` nacional:

  - `linhas_para_projections` — povoa as linhas NACIONAIS, que
    `compute_national` produz sem `pct_atual`/`votos_atuais`, e converte o
    `dado_ts` de string ISO para datetime.
  - `pct_atual_nacional_por_candidato` — razão de somas, a MESMA função que o
    payload nacional usa.
  - `insert_projections` — o SQL com as colunas novas.

## Por que estes testes ligam de verdade os parâmetros

Cada teste que toca o INSERT passa as linhas pelo **binder real do psycopg**
(`PostgresQuery.convert`), o mesmo que `cursor.executemany` usa. Não é um
duplo que finge: uma chave ausente levanta aqui exatamente o
`ProgrammingError: query parameter missing: …` que levantaria contra o Neon.
Sem isso, um fake que só guardasse as linhas numa lista deixaria passar
justamente o defeito que a Fase 1 existe para evitar — e o custo seria
descobri-lo na noite de 04/10.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

import psycopg
import pytest
from psycopg._queries import PostgresQuery
from psycopg.adapt import Transformer

# ---------------------------------------------------------------------------
# Duplo de conexão que LIGA os parâmetros de verdade
# ---------------------------------------------------------------------------


class _CursorQueLiga:
    """Cursor que roda o binder real do psycopg sobre cada linha.

    `executemany` do psycopg converte cada dict de parâmetros contra os
    `%(nome)s` da query antes de mandar qualquer byte ao servidor. É ali que
    uma chave ausente estoura, e é isso que este duplo reproduz — sem banco.
    """

    def __init__(self, capturado: dict[str, Any]) -> None:
        self._capturado = capturado

    def __enter__(self) -> _CursorQueLiga:
        return self

    def __exit__(self, *_exc: object) -> bool:
        return False

    def executemany(self, sql: str, rows: list[dict[str, Any]]) -> None:
        linhas = list(rows)
        self._capturado["sql"] = sql
        self._capturado["rows"] = linhas
        query = PostgresQuery(Transformer())
        for linha in linhas:
            query.convert(sql, linha)


class _ConnQueLiga:
    def __init__(self) -> None:
        self.capturado: dict[str, Any] = {}

    def cursor(self) -> _CursorQueLiga:
        return _CursorQueLiga(self.capturado)


# ---------------------------------------------------------------------------
# Fixtures de linha — UFs de tamanhos MUITO diferentes, de propósito
# ---------------------------------------------------------------------------

#: A hora do boletim, não a do cálculo. Distante do relógio de parede de
#: qualquer máquina que rode esta suíte — é o que permite afirmar, abaixo, que
#: a coluna não foi preenchida com `datetime.now()`.
DADO_TS_BOLETIM = "2026-10-04T23:15:30+00:00"


def _uf_row(uf: str, cid: int, votos_atuais: int | None, pct_atual: float | None) -> dict[str, Any]:
    """Linha de UF no formato de `_uf_projection_row` (só o que importa aqui)."""
    return {
        "cargo": 1,
        "turno": 1,
        "uf": uf,
        "candidato_id": cid,
        "votos_projetados": (votos_atuais or 0) * 2,
        "votos_atuais": votos_atuais,
        "pct_atual": pct_atual,
        "pct_projetado": pct_atual,
        "pct_projetado_lower": pct_atual,
        "pct_projetado_upper": pct_atual,
        "p_vitoria": None,
        "pct_apurado": 50.0,
    }


def _national_row(cid: int, pct_projetado: float, rank: int) -> dict[str, Any]:
    """Linha nacional como `compute_national` a produz.

    ⚠️ **SEM** `pct_atual`, `votos_atuais` e `dado_ts` — a ausência é o ponto.
    Quem acrescentar essas chaves aqui para "consertar" um teste vermelho terá
    apagado exatamente o que ele mede.
    """
    return {
        "cargo": 1,
        "turno": 1,
        "uf": None,
        "candidato_id": cid,
        "votos_projetados": 1_000_000,
        "pct_projetado": pct_projetado,
        "pct_projetado_lower": pct_projetado - 1,
        "pct_projetado_upper": pct_projetado + 1,
        "p_vitoria": 0.5,
        "pct_apurado": None,
        "rank": rank,
        "p_passa_2t": 0.5,
        "p_fecha_1t": 0.1,
    }


def _uf_rows_desiguais() -> list[dict[str, Any]]:
    """Roraima e São Paulo — 500 mil votos contra 30 milhões.

    A desproporção é o instrumento do teste: com UFs de tamanho parecido, a
    média simples dos percentuais e a razão de somas dão quase o mesmo número,
    e o teste não discriminaria a mutação que troca uma pela outra.

      RR: 13 → 300.000 (60%), 22 → 200.000 (40%)
      SP: 13 → 12.000.000 (40%), 22 → 18.000.000 (60%)

    Média simples dos percentuais: 50% para os dois.
    Razão de somas (a resposta certa): 13 → 40,3279%, 22 → 59,6721%.
    """
    return [
        _uf_row("RR", 13, 300_000, 60.0),
        _uf_row("RR", 22, 200_000, 40.0),
        _uf_row("SP", 13, 12_000_000, 40.0),
        _uf_row("SP", 22, 18_000_000, 60.0),
    ]


PCT_13_RAZAO_DE_SOMAS = 100.0 * 12_300_000 / 30_500_000  # 40,327868…
PCT_22_RAZAO_DE_SOMAS = 100.0 * 18_200_000 / 30_500_000  # 59,672131…


# ---------------------------------------------------------------------------
# 1. A armadilha: a linha nacional não pode estourar no INSERT
# ---------------------------------------------------------------------------


def test_linha_nacional_nao_levanta_no_insert() -> None:
    """`uf_rows + national_rows` preparadas passam pelo binder; cruas, não.

    As duas metades importam:

      - A primeira prova que `linhas_para_projections` fecha a armadilha.
      - A segunda prova que o duplo de cursor **discrimina**. Sem ela, um
        cursor que só guardasse as linhas numa lista faria a primeira metade
        passar com o INSERT quebrado, e este arquivo inteiro viraria enfeite.

    Mutação que este teste mata: listar `pct_atual`/`votos_atuais`/`dado_ts`
    no INSERT sem povoar `national_rows` — o ciclo perderia a persistência
    inteira, não só a coluna nova.
    """
    from api.model.project import insert_projections, linhas_para_projections

    uf_rows = _uf_rows_desiguais()
    national_rows = [_national_row(13, 40.3, 1), _national_row(22, 59.7, 2)]

    conn = _ConnQueLiga()
    n = insert_projections(
        conn, linhas_para_projections(uf_rows, national_rows, DADO_TS_BOLETIM)
    )
    assert n == len(uf_rows) + len(national_rows)

    # E o caminho cru continua estourando — é o defeito, e ele precisa doer.
    with pytest.raises(psycopg.ProgrammingError) as exc:
        insert_projections(_ConnQueLiga(), uf_rows + national_rows)
    assert "query parameter missing" in str(exc.value)


def test_preparacao_nao_contamina_as_listas_originais() -> None:
    """`uf_rows`/`national_rows` seguem para o payload DEPOIS do INSERT.

    Se a preparação mutasse as listas no lugar, `build_edge_payload` e
    `build_uf_payloads` passariam a ver campos que apareceram por efeito
    colateral da persistência. Mutação que isto mata: trocar `{**r, ...}` por
    `r.update(...)`.
    """
    from api.model.project import linhas_para_projections

    uf_rows = _uf_rows_desiguais()
    national_rows = [_national_row(13, 40.3, 1)]

    linhas_para_projections(uf_rows, national_rows, DADO_TS_BOLETIM)

    assert "dado_ts" not in uf_rows[0]
    assert "pct_atual" not in national_rows[0]
    assert "votos_atuais" not in national_rows[0]
    assert "dado_ts" not in national_rows[0]


# ---------------------------------------------------------------------------
# 2. Razão de somas — e a MESMA função nos dois destinos
# ---------------------------------------------------------------------------


def test_pct_atual_nacional_e_razao_de_somas_nao_media_das_ufs() -> None:
    """Σ votos da candidatura ÷ Σ votos de todas — nunca a média dos percentuais.

    Mutação que este teste mata: calcular o nacional como média (simples ou
    ponderada por eleitorado) dos `pct_atual` das UFs. A fixture é construída
    para que as duas respostas sejam **muito** diferentes: a média daria 50%
    redondo para as duas candidaturas, invertendo quem lidera.
    """
    from api.model.project import pct_atual_nacional_por_candidato

    pct, votos, total = pct_atual_nacional_por_candidato(_uf_rows_desiguais())

    assert total == 30_500_000
    assert votos == {13: 12_300_000, 22: 18_200_000}
    assert pct[13] == pytest.approx(PCT_13_RAZAO_DE_SOMAS)
    assert pct[22] == pytest.approx(PCT_22_RAZAO_DE_SOMAS)

    # A média simples daria 50/50 e trocaria o líder. Explicitado para que a
    # próxima pessoa veja o que a asserção acima está descartando.
    assert pct[13] != pytest.approx(50.0)
    assert pct[13] < pct[22]


def test_linhas_nacionais_repetem_a_conta_da_funcao() -> None:
    """A coluna gravada é o número da função, não uma segunda conta."""
    from api.model.project import linhas_para_projections

    prontas = linhas_para_projections(
        _uf_rows_desiguais(),
        [_national_row(13, 40.3, 1), _national_row(22, 59.7, 2)],
        DADO_TS_BOLETIM,
    )
    nacionais = {r["candidato_id"]: r for r in prontas if r["uf"] is None}

    assert nacionais[13]["pct_atual"] == pytest.approx(PCT_13_RAZAO_DE_SOMAS)
    assert nacionais[13]["votos_atuais"] == 12_300_000
    assert nacionais[22]["pct_atual"] == pytest.approx(PCT_22_RAZAO_DE_SOMAS)
    assert nacionais[22]["votos_atuais"] == 18_200_000


def test_payload_nacional_chama_a_mesma_funcao_que_a_coluna(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Gráfico e placar da home saem do MESMO cálculo.

    O teste substitui `pct_atual_nacional_por_candidato` por um sentinela com
    números que nenhuma conta sobre a fixture produziria, e exige que **os
    dois** destinos — a coluna `pct_atual` de `projections` e o
    `national.candidatos[].pct_atual` do payload — devolvam o sentinela.

    Mutação que este teste mata: re-inlinear a aritmética em qualquer um dos
    dois lados. Comparar só os dois valores entre si não bastaria — duas
    cópias idênticas da mesma fórmula continuariam concordando, e a divergência
    só apareceria quando alguém editasse uma delas.
    """
    import api.model.project as proj

    # ⚠️ Os percentuais do sentinela são INCOERENTES com os votos de
    # propósito: 1 de 10 votos "vale" 77,5%. Só quem LÊ o dicionário de
    # percentuais devolve 77,5 — quem recalcular `100 * votos / total` no
    # lugar devolve 10,0 e o teste fica vermelho. Com um sentinela coerente
    # (775 de 1.000 → 77,5%) as duas implementações concordariam e este teste
    # não discriminaria nada. Medido: com o sentinela coerente, a mutação
    # "re-inlinear no payload" passava.
    sentinela_pct = {13: 77.5, 22: 22.5}
    sentinela_votos = {13: 1, 22: 9}

    def _sentinela(_uf_rows: list[dict[str, Any]]) -> tuple[dict[int, float], dict[int, int], int]:
        return sentinela_pct, sentinela_votos, 10

    monkeypatch.setattr(proj, "pct_atual_nacional_por_candidato", _sentinela)

    uf_rows = _uf_rows_desiguais()
    national_rows = [_national_row(13, 40.3, 1), _national_row(22, 59.7, 2)]

    prontas = proj.linhas_para_projections(uf_rows, national_rows, DADO_TS_BOLETIM)
    nacionais = {r["candidato_id"]: r for r in prontas if r["uf"] is None}
    assert nacionais[13]["pct_atual"] == 77.5
    assert nacionais[13]["votos_atuais"] == 1

    payload = proj.build_edge_payload(
        cargo=1,
        turno=1,
        ts_iso="2026-10-04T23:16:00+00:00",
        uf_rows=uf_rows,
        national_rows=national_rows,
        eleitorado_total_by_uf={"RR": 400_000, "SP": 34_000_000},
        cand_a_id=22,
        cand_b_id=13,
    )
    por_id = {c["id"]: c for c in payload["national"]["candidatos"]}
    assert por_id[13]["pct_atual"] == 77.5
    assert por_id[22]["pct_atual"] == 22.5
    assert por_id[13]["votos_atuais"] == 1


def test_payload_nacional_sem_sentinela_bate_com_a_coluna() -> None:
    """Sem monkeypatch: os dois destinos dão o mesmo número, dígito a dígito."""
    from api.model.project import build_edge_payload, linhas_para_projections

    uf_rows = _uf_rows_desiguais()
    national_rows = [_national_row(13, 40.3, 1), _national_row(22, 59.7, 2)]

    nacionais = {
        r["candidato_id"]: r
        for r in linhas_para_projections(uf_rows, national_rows, DADO_TS_BOLETIM)
        if r["uf"] is None
    }
    payload = build_edge_payload(
        cargo=1,
        turno=1,
        ts_iso="2026-10-04T23:16:00+00:00",
        uf_rows=uf_rows,
        national_rows=national_rows,
        eleitorado_total_by_uf={"RR": 400_000, "SP": 34_000_000},
        cand_a_id=22,
        cand_b_id=13,
    )
    por_id = {c["id"]: c for c in payload["national"]["candidatos"]}

    assert nacionais[13]["pct_atual"] == por_id[13]["pct_atual"]
    assert nacionais[22]["pct_atual"] == por_id[22]["pct_atual"]
    assert nacionais[13]["votos_atuais"] == por_id[13]["votos_atuais"]


# ---------------------------------------------------------------------------
# 3. `NULL` nunca vira `0`
# ---------------------------------------------------------------------------


def test_null_nunca_vira_zero_em_linha_sem_medicao() -> None:
    """Não medido é `None`. `0` seria a afirmação "teve zero voto".

    Três buracos distintos, cada um com a mesma resposta:

      1. Nenhuma UF trouxe `votos_atuais` (ciclo antes do primeiro boletim).
      2. Uma candidatura existe no nacional mas não aparece em UF nenhuma.
      3. A linha de UF já chegou com `pct_atual`/`votos_atuais` nulos.

    Mutação que este teste mata: qualquer `or 0`, `?? 0` ou
    `.get(cid, 0.0)` na preparação das linhas. O gráfico desenharia o zero
    como um mergulho ao chão, e a regra dos três estados proíbe fabricá-lo.
    """
    from api.model.project import linhas_para_projections

    # (1) e (3) — UFs sem medição nenhuma.
    sem_medicao = [
        _uf_row("RR", 13, None, None),
        _uf_row("SP", 13, None, None),
    ]
    prontas = linhas_para_projections(
        sem_medicao, [_national_row(13, 40.3, 1)], DADO_TS_BOLETIM
    )
    nacional = next(r for r in prontas if r["uf"] is None)
    assert nacional["pct_atual"] is None
    assert nacional["votos_atuais"] is None
    uf = next(r for r in prontas if r["uf"] == "RR")
    assert uf["pct_atual"] is None
    assert uf["votos_atuais"] is None

    # (2) — candidatura nacional ausente das UFs, com as outras medidas.
    prontas2 = linhas_para_projections(
        _uf_rows_desiguais(),
        [_national_row(13, 40.3, 1), _national_row(99, 0.4, 3)],
        DADO_TS_BOLETIM,
    )
    orfa = next(r for r in prontas2 if r["uf"] is None and r["candidato_id"] == 99)
    assert orfa["pct_atual"] is None
    assert orfa["votos_atuais"] is None


def test_linha_sem_medicao_ainda_liga_no_insert() -> None:
    """`None` é valor ligável — a coluna anulável da 0009 aceita, e o binder também."""
    from api.model.project import insert_projections, linhas_para_projections

    conn = _ConnQueLiga()
    n = insert_projections(
        conn,
        linhas_para_projections(
            [_uf_row("RR", 13, None, None)], [_national_row(13, 40.3, 1)], None
        ),
    )
    assert n == 2
    assert all(r["pct_atual"] is None for r in conn.capturado["rows"])
    assert all(r["dado_ts"] is None for r in conn.capturado["rows"])


# ---------------------------------------------------------------------------
# 4. `dado_ts` é a hora do boletim, não a do cálculo
# ---------------------------------------------------------------------------


def test_dado_ts_gravado_e_a_hora_do_boletim() -> None:
    """A coluna carrega o instante do TSE, não `datetime.now()`.

    Mutação que este teste mata: preencher `dado_ts` com o relógio do ciclo
    (`datetime.now(timezone.utc)`, que é o que a coluna `ts` já guarda). O
    boletim da fixture está a semanas do relógio de parede de qualquer máquina
    que rode a suíte, então a distância denuncia a troca.
    """
    from api.model.project import linhas_para_projections

    prontas = linhas_para_projections(
        _uf_rows_desiguais(), [_national_row(13, 40.3, 1)], DADO_TS_BOLETIM
    )

    esperado = datetime(2026, 10, 4, 23, 15, 30, tzinfo=timezone.utc)
    assert all(r["dado_ts"] == esperado for r in prontas)
    assert all(isinstance(r["dado_ts"], datetime) for r in prontas)
    assert all(r["dado_ts"].tzinfo is not None for r in prontas)

    agora = datetime.now(timezone.utc)
    assert abs(agora - prontas[0]["dado_ts"]) > timedelta(hours=1)


def test_dado_ts_ausente_nao_cai_para_outro_relogio() -> None:
    """Sem relógio do dado, a coluna fica `NULL` (ADR-0038 D1).

    Mutação que este teste mata: `dado_ts or datetime.now(timezone.utc)`. Um
    número que parece hora do boletim sem ser é pior que a ausência declarada
    — e no gráfico ele viraria um ponto no lugar errado do eixo.
    """
    from api.model.project import linhas_para_projections

    prontas = linhas_para_projections(
        _uf_rows_desiguais(), [_national_row(13, 40.3, 1)], None
    )
    assert all(r["dado_ts"] is None for r in prontas)


def test_dado_ts_ingenuo_vira_aware_em_utc() -> None:
    """String sem offset é normalizada, não rejeitada nem deixada ingênua.

    Comparar aware com naive levanta `TypeError` em algum ponto distante
    daqui; `api/model/dado_ts.py` já segue a mesma convenção.
    """
    from api.model.project import linhas_para_projections

    prontas = linhas_para_projections(
        [_uf_row("RR", 13, 10, 100.0)], [], "2026-10-04T23:15:30"
    )
    assert prontas[0]["dado_ts"] == datetime(2026, 10, 4, 23, 15, 30, tzinfo=timezone.utc)


def test_dado_ts_ilegivel_vira_null_sem_derrubar_o_ciclo() -> None:
    """String quebrada → `NULL` + warn. `projections` é a fonte de verdade.

    Derrubar o INSERT inteiro por causa de uma coluna de eixo horizontal seria
    a troca errada — e a string só pode vir de um bug nosso, já que nasce de
    `.isoformat()` sobre um datetime aware.
    """
    from api.model.project import linhas_para_projections

    prontas = linhas_para_projections(
        [_uf_row("RR", 13, 10, 100.0)], [], "ontem à noite"
    )
    assert prontas[0]["dado_ts"] is None
    assert prontas[0]["pct_atual"] == 100.0  # o resto da linha sobrevive


# ---------------------------------------------------------------------------
# 5. O SQL lista as três colunas (e continua append-only)
# ---------------------------------------------------------------------------


def test_insert_lista_as_tres_colunas_novas_e_nao_atualiza_nada() -> None:
    """Constituição § 10: append-only. Zero `ON CONFLICT`, zero `UPDATE`."""
    from api.model.project import insert_projections, linhas_para_projections

    conn = _ConnQueLiga()
    insert_projections(
        conn,
        linhas_para_projections(
            _uf_rows_desiguais(), [_national_row(13, 40.3, 1)], DADO_TS_BOLETIM
        ),
    )
    sql = conn.capturado["sql"]

    # A LISTA DE COLUNAS, não o SQL inteiro: `%(dado_ts)s` no VALUES contém a
    # string "dado_ts" e faria um `in sql` passar com a coluna fora da lista —
    # um INSERT com 13 valores para 12 colunas, que só o Postgres recusaria.
    # Medido: com o `in sql`, a mutação "tirar dado_ts da lista" passava.
    colunas_txt = sql.split("INSERT INTO projections (")[1].split(") VALUES")[0]
    colunas = [c.strip() for c in colunas_txt.split(",") if c.strip()]
    for coluna in ("pct_atual", "votos_atuais", "dado_ts"):
        assert coluna in colunas, f"{coluna} ausente da lista de colunas do INSERT"

    placeholders = re.findall(r"%\((\w+)\)s", sql)
    assert colunas == placeholders, (
        "lista de colunas e lista de placeholders divergiram — o INSERT "
        f"mandaria {len(placeholders)} valores para {len(colunas)} colunas"
    )

    alto = sql.upper()
    assert "ON CONFLICT" not in alto
    assert "UPDATE" not in alto
    assert "DELETE" not in alto


# ---------------------------------------------------------------------------
# Escopo do que é persistido — decisão do dono, 2026-09-17
# ---------------------------------------------------------------------------


def test_deputado_federal_fica_fora_da_serie_persistida() -> None:
    """Cargo 6 NÃO entra em `projections`.

    Decisão do dono em 2026-09-17, com a conta na mesa: 7.791 candidaturas a
    Deputado Federal × 480 ciclos de uma noite = ~3,7 milhões de linhas, nove
    vezes todo o resto somado. Este teste existe para que reverter a decisão
    seja um ato deliberado — acrescentar o 6 ao conjunto fica vermelho aqui.
    """
    from api.model.project import CARGOS_COM_SERIE_PERSISTIDA

    assert 6 not in CARGOS_COM_SERIE_PERSISTIDA


def test_presidente_governador_e_senador_entram() -> None:
    """E os três que entram, incluindo Presidente POR UF.

    Presidente aparece aqui uma vez só (o código do cargo), mas o orchestrator
    grava tanto as linhas de UF quanto a nacional — e é o dado por UF que
    alimenta o gráfico da spec 020 nas 27 telas de estado. Remover o escopo de
    UF do Presidente esvaziaria o gráfico em 27 rotas, deixando-o só na home.
    """
    from api.model.project import CARGOS_COM_SERIE_PERSISTIDA

    assert CARGOS_COM_SERIE_PERSISTIDA == frozenset({1, 3, 5})
