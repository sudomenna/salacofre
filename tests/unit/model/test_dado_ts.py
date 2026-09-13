"""tests/unit/model/test_dado_ts.py

O relógio do DADO (ADR-0038 D1/D2/D3) — a hora que o TSE carimbou, separada da
hora em que o modelo rodou.

O que estes testes precisam travar, e que um teste de caminho feliz não trava:

  - o parser aceita **os dois** formatos de data do dicionário do TSE e
    **levanta** no resto (nunca devolve um valor de consolo);
  - `dado_ts` é o **máximo**, não o mínimo nem o primeiro;
  - `pares_atrasados` é medido contra o `dado_ts` do **próprio ciclo**, não
    contra `now()` — a diferença entre "um par andou e os outros não" (falha
    nossa) e "o TSE não tem novidade para ninguém" (legítimo);
  - ausência total vira `None`/`None`, **sem cair** para a hora de coleta nem
    para a de cálculo;
  - o limiar de alarme **deriva** da cadência declarada do cargo — e a cadência
    do cargo 6 é a volta completa das 6 fatias (30 min), não o `*/5` de uma
    fatia.

Cada afirmação acima tem um teste que fica VERMELHO se a mutação
correspondente for aplicada ao código — foi assim que foram escritos
(ver o relatório de mutação da tarefa).
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pytest

from api.model.cargos import ATUALIZACAO_MIN_DEPUTADO, CADENCIA_SEGUNDOS, cadencia_segundos
from api.model.dado_ts import (
    CADENCIAS_ATE_ALARME,
    CADENCIAS_ATE_PAR_ATRASADO,
    DgHgInvalido,
    lag_segundos,
    limiar_alarme_segundos,
    parse_dg_hg,
    relogio_do_dado,
    relogio_por_uf,
)

_BRT = timezone(timedelta(hours=-3))
_UTC = timezone.utc


def _dg_hg(momento: datetime, *, com_barras: bool = True) -> tuple[str, str]:
    """`datetime` (qualquer fuso) → o par `(dg, hg)` como o TSE o publica."""
    brt = momento.astimezone(_BRT)
    dg = brt.strftime("%d/%m/%Y") if com_barras else brt.strftime("%d%m%Y")
    return dg, brt.strftime("%H:%M:%S")


def _par(
    momento: datetime | None,
    *,
    uf: str = "SP",
    cod_zona: int = 1,
    cod_municipio_tse: int = 71072,
    com_barras: bool = True,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Uma linha de `fetch_snapshots` — só o que o relógio do dado lê.

    `momento=None` produz o envelope PODADO das fixtures de replay (sem `dg`,
    sem `hg`), que é o caso benigno de ausência.
    """
    envelope: dict[str, Any] = dict(payload or {"carg": [], "e": {}, "v": {}, "s": {}})
    if momento is not None:
        dg, hg = _dg_hg(momento, com_barras=com_barras)
        envelope["dg"] = dg
        envelope["hg"] = hg
    return {
        "uf": uf,
        "cod_municipio_tse": cod_municipio_tse,
        "cod_zona": cod_zona,
        "pct_apurado": 50.0,
        "payload": envelope,
    }


# ---------------------------------------------------------------------------
# 1. Parser — porte de calculateLagSeconds (lib/tse/metrics.ts:74-115)
# ---------------------------------------------------------------------------


def test_parse_formato_oficial_com_barras_converte_brt_para_utc() -> None:
    """O exemplo literal do doc-comment do lado TS, para os dois parsers
    responderem o mesmo à mesma entrada."""
    assert parse_dg_hg("04/10/2026", "20:15:30") == datetime(
        2026, 10, 4, 23, 15, 30, tzinfo=_UTC
    )


def test_parse_formato_legado_sem_barras_da_o_mesmo_instante() -> None:
    """`ddMMyyyy` é o segundo formato que `metrics.ts:82-84` aceita. Um parser
    que só aceitasse o oficial deixaria o legado cair em `pares_atrasados`
    como se o dado estivesse velho."""
    assert parse_dg_hg("04102026", "20:15:30") == parse_dg_hg(
        "04/10/2026", "20:15:30"
    )


def test_parse_devolve_datetime_aware_em_utc() -> None:
    """Naive vazaria para comparações com `now(timezone.utc)` e levantaria
    `TypeError` longe daqui."""
    momento = parse_dg_hg("04/10/2026", "20:15:30")
    assert momento.tzinfo is not None
    assert momento.utcoffset() == timedelta(0)


def test_parse_nao_aplica_horario_de_verao() -> None:
    """BRT é UTC-3 o ano inteiro (DST abolido em 2019). Em janeiro — quando o
    horário de verão existia — o offset tem que continuar sendo 3h."""
    assert parse_dg_hg("15/01/2026", "12:00:00") == datetime(
        2026, 1, 15, 15, 0, 0, tzinfo=_UTC
    )


@pytest.mark.parametrize(
    "dg",
    [
        "2026-10-04",  # ISO, não é formato do TSE
        "4/10/2026",  # dia sem zero à esquerda
        "04/10/26",  # ano de 2 dígitos
        "",
        "31/02/2026",  # data que não existe
        "04/13/2026",  # mês que não existe
    ],
)
def test_parse_levanta_em_dg_fora_do_dicionario(dg: str) -> None:
    """Levantar, nunca devolver valor silencioso: um envelope ilegível é
    anomalia de upstream, e engoli-la publicaria um `dado_ts` calculado sobre
    um subconjunto menor sem que nada acusasse."""
    with pytest.raises(DgHgInvalido):
        parse_dg_hg(dg, "20:15:30")


@pytest.mark.parametrize("hg", ["20:15", "201530", "20:15:30.000", "25:00:00", ""])
def test_parse_levanta_em_hg_fora_do_dicionario(hg: str) -> None:
    with pytest.raises(DgHgInvalido):
        parse_dg_hg("04/10/2026", hg)


@pytest.mark.parametrize("dg,hg", [(None, "20:15:30"), ("04/10/2026", None), (4102026, "20:15:30")])
def test_parse_levanta_quando_falta_metade_do_par(dg: Any, hg: Any) -> None:
    """Os dois campos são obrigatórios no mesmo schema Zod
    (`lib/tse/ea20-schema.ts:337-338`) — um sem o outro já é violação."""
    with pytest.raises(DgHgInvalido):
        parse_dg_hg(dg, hg)


def test_parse_le_o_dg_hg_do_topo_da_fixture_real_do_tse() -> None:
    """A premissa estrutural de D1: `dg`/`hg` ficam no TOPO do envelope, não
    em sub-objeto. Se o TSE mudar isso, este teste cai antes da produção."""
    fixture = (
        Path(__file__).resolve().parents[2]
        / "fixtures"
        / "tse"
        / "2022"
        / "presidente-sp-z0001.json"
    )
    envelope = json.loads(fixture.read_text(encoding="utf-8"))
    assert "dg" in envelope and "hg" in envelope, list(envelope)[:10]
    assert parse_dg_hg(envelope["dg"], envelope["hg"]) == datetime(
        2026, 10, 4, 23, 15, 30, tzinfo=_UTC
    )


# ---------------------------------------------------------------------------
# 2. dado_ts — o MÁXIMO do ciclo (D2)
# ---------------------------------------------------------------------------


def test_dado_ts_e_o_maximo_do_ciclo_nao_o_minimo() -> None:
    """A pergunta do leitor é "quando foi atualizado", e a resposta é o dado
    mais recente que entrou na conta. O mínimo cru foi rejeitado no ADR: zona
    já 100% apurada para de ser regerada e o mínimo ficaria velho a noite
    inteira, por razão legítima."""
    base = datetime(2026, 10, 4, 22, 0, 0, tzinfo=_UTC)
    linhas = [
        _par(base - timedelta(minutes=40)),
        _par(base),  # o mais recente
        _par(base - timedelta(minutes=10)),
    ]

    relogio = relogio_do_dado(linhas, cargo=1)

    assert relogio.dado_ts == base.isoformat()
    assert relogio.n_pares == 3
    assert relogio.n_sem_campos == 0
    assert relogio.n_malformados == 0


def test_dado_ts_ignora_pares_ilegiveis_mas_os_conta() -> None:
    """Um envelope quebrado não pode nem entrar no máximo nem sumir do log."""
    base = datetime(2026, 10, 4, 22, 0, 0, tzinfo=_UTC)
    quebrado = _par(base)
    quebrado["payload"]["dg"] = "04-10-2026"

    relogio = relogio_do_dado([_par(base - timedelta(minutes=5)), quebrado], cargo=1)

    assert relogio.dado_ts == (base - timedelta(minutes=5)).isoformat()
    assert relogio.n_malformados == 1


def test_ausencia_total_vira_null_nos_dois_campos_sem_levantar() -> None:
    """Fixture de replay podada (`tests/fixtures/replay-2022/snapshots.json`:
    só `carg,e,s,v`) — e a regra vale para qualquer ausência: `null`, jamais a
    hora de coleta ou de cálculo (D1)."""
    relogio = relogio_do_dado([_par(None), _par(None), _par(None)], cargo=1)

    assert relogio.dado_ts is None
    assert relogio.pares_atrasados is None
    assert relogio.n_pares == 3
    assert relogio.n_sem_campos == 3


def test_ausencia_nao_cai_para_a_hora_de_agora() -> None:
    """A mutação óbvia — `dado_ts = datetime.now()` quando não há dg/hg —
    publicaria um número que parece hora do dado e não é. Este teste existe
    para ela: qualquer valor não-nulo aqui é falha."""
    antes = datetime.now(_UTC)
    relogio = relogio_do_dado([_par(None)], cargo=1)
    depois = datetime.now(_UTC)

    assert relogio.dado_ts is None, (
        f"caiu para um relógio de parede entre {antes} e {depois}"
    )


def test_lista_vazia_nao_levanta() -> None:
    relogio = relogio_do_dado([], cargo=1)
    assert (relogio.dado_ts, relogio.pares_atrasados, relogio.n_pares) == (None, None, 0)


def test_par_sem_dg_hg_nao_conta_como_atrasado() -> None:
    """Decisão de implementação (o ADR não a fixa): par sem relógio é
    IMENSURÁVEL, não atrasado. Contá-lo como atrasado fundiria "não sei a hora
    deste par" com "este par ficou para trás" — duas causas com respostas
    operacionais diferentes. Ele aparece em `n_sem_campos`, que vai ao log."""
    base = datetime(2026, 10, 4, 22, 0, 0, tzinfo=_UTC)
    relogio = relogio_do_dado([_par(base), _par(None), _par(None)], cargo=1)

    assert relogio.dado_ts == base.isoformat()
    assert relogio.pares_atrasados == 0
    assert relogio.n_sem_campos == 2


# ---------------------------------------------------------------------------
# 3. pares_atrasados — relativo ao ciclo, NUNCA a now() (D2)
# ---------------------------------------------------------------------------


def test_pares_atrasados_conta_quem_ficou_para_tras_do_maximo_do_ciclo() -> None:
    """O cenário de risco nomeado no ADR: a ingestão falha para quase todos os
    alvos enquanto um punhado de retries isolados continua tendo sucesso. O
    máximo fica fresco; este número acende."""
    base = datetime(2026, 10, 4, 22, 0, 0, tzinfo=_UTC)
    # Cargo 1: cadência 60s → janela de 2 cadências = 120s.
    linhas = [
        _par(base),  # o único que andou
        _par(base - timedelta(seconds=121)),  # atrasado (> 120s)
        _par(base - timedelta(minutes=30)),  # atrasado
        _par(base - timedelta(seconds=119)),  # dentro da janela
    ]

    relogio = relogio_do_dado(linhas, cargo=1)

    assert relogio.pares_atrasados == 2


def test_pares_atrasados_e_zero_quando_o_ciclo_inteiro_envelhece_junto() -> None:
    """Discriminante da mutação "medir contra `now()`": todos os pares estão
    HORAS atrás do relógio de parede (datas de 2022), mas agrupados entre si.
    É o TSE sem novidade para ninguém — legítimo, e não pode alarmar. Contra
    `now()`, os quatro contariam como atrasados."""
    base = datetime(2022, 10, 2, 22, 0, 0, tzinfo=_UTC)
    linhas = [
        _par(base),
        _par(base - timedelta(seconds=30)),
        _par(base - timedelta(seconds=60)),
        _par(base - timedelta(seconds=90)),
    ]

    relogio = relogio_do_dado(linhas, cargo=1)

    assert relogio.pares_atrasados == 0
    assert lag_segundos(relogio.dado_ts) > 365 * 24 * 3600, (
        "o ciclo precisa estar realmente velho para o teste discriminar"
    )


def test_pares_atrasados_usa_a_janela_do_cargo_e_nao_uma_constante_unica() -> None:
    """A MESMA lista de pares produz contagens diferentes por cargo, porque a
    janela é 2× a cadência declarada. Com 20 min de dispersão: Presidente
    (60s) acusa tudo; Deputado (30 min) não acusa nada. Uma janela única faria
    um dos dois mentir."""
    base = datetime(2026, 10, 4, 22, 0, 0, tzinfo=_UTC)
    linhas = [
        _par(base),
        _par(base - timedelta(minutes=10)),
        _par(base - timedelta(minutes=20)),
    ]

    assert relogio_do_dado(linhas, cargo=1).pares_atrasados == 2  # janela 120s
    assert relogio_do_dado(linhas, cargo=5).pares_atrasados == 1  # janela 600s
    assert relogio_do_dado(linhas, cargo=6).pares_atrasados == 0  # janela 3.600s


def test_pares_atrasados_e_null_em_cargo_sem_cadencia_declarada() -> None:
    """Sem régua declarada não há "atrasado" honesto — e inventar um default
    alarmaria no ritmo errado. `dado_ts` continua existindo."""
    base = datetime(2026, 10, 4, 22, 0, 0, tzinfo=_UTC)
    relogio = relogio_do_dado([_par(base), _par(base - timedelta(hours=3))], cargo=99)

    assert relogio.dado_ts == base.isoformat()
    assert relogio.pares_atrasados is None


def test_janela_do_par_atrasado_e_de_duas_cadencias() -> None:
    """Trava o `2` de `CADENCIAS_ATE_PAR_ATRASADO` contra alteração acidental:
    a 119s o par ainda é jitter de um ciclo; a 121s ele perdeu dois."""
    assert CADENCIAS_ATE_PAR_ATRASADO == 2
    base = datetime(2026, 10, 4, 22, 0, 0, tzinfo=_UTC)
    janela = CADENCIAS_ATE_PAR_ATRASADO * cadencia_segundos(1)

    no_limite = relogio_do_dado(
        [_par(base), _par(base - timedelta(seconds=janela))], cargo=1
    )
    logo_depois = relogio_do_dado(
        [_par(base), _par(base - timedelta(seconds=janela + 1))], cargo=1
    )

    assert no_limite.pares_atrasados == 0, "a janela é fechada no limite"
    assert logo_depois.pares_atrasados == 1


# ---------------------------------------------------------------------------
# 4. Granularidade por UF (D2)
# ---------------------------------------------------------------------------


def test_relogio_por_uf_mede_cada_uf_contra_os_pares_dela() -> None:
    """A ingestão degrada regionalmente sem que o nacional acuse: SP inteira
    parada às 21h aparece no `dado_ts` DELA, envelhecido, enquanto o nacional
    segue fresco por causa do RJ."""
    base = datetime(2026, 10, 4, 22, 0, 0, tzinfo=_UTC)
    linhas = [
        _par(base, uf="RJ", cod_zona=10),
        _par(base - timedelta(seconds=30), uf="RJ", cod_zona=11),
        _par(base - timedelta(hours=1), uf="SP", cod_zona=1),
        _par(base - timedelta(hours=1, seconds=10), uf="SP", cod_zona=2),
    ]

    por_uf = relogio_por_uf(linhas, cargo=1)
    nacional = relogio_do_dado(linhas, cargo=1)

    assert set(por_uf) == {"RJ", "SP"}
    assert nacional.dado_ts == base.isoformat()
    assert por_uf["RJ"].dado_ts == base.isoformat()
    assert por_uf["SP"].dado_ts == (base - timedelta(hours=1)).isoformat()
    # Dentro de SP ninguém ficou para trás de SP — é a UF inteira que parou, e
    # quem conta essa história é o `dado_ts` dela, não `pares_atrasados`.
    assert por_uf["SP"].pares_atrasados == 0
    # No nacional, os dois pares de SP estão muito além de 2 cadências.
    assert nacional.pares_atrasados == 2


def test_relogio_por_uf_ignora_abrangencia_nacional_e_uf_vazia() -> None:
    """`BR` não é unidade federativa e não tem página de UF para carimbar."""
    base = datetime(2026, 10, 4, 22, 0, 0, tzinfo=_UTC)
    linhas = [_par(base, uf="BR"), _par(base, uf=""), _par(base, uf="sp")]

    por_uf = relogio_por_uf(linhas, cargo=1)

    assert set(por_uf) == {"SP"}, "sigla normalizada para maiúscula"


# ---------------------------------------------------------------------------
# 5. Limiar de alarme — derivado da cadência do cargo (D3)
# ---------------------------------------------------------------------------


def test_limiar_por_cargo_e_tres_vezes_a_cadencia_declarada() -> None:
    """A tabela de D3, em números absolutos — é este teste que fica vermelho se
    alguém trocar a cadência do cargo 6 pelos 5 min de UMA fatia do cron
    (`vercel.ts:192-240`) em vez da volta completa das seis."""
    assert (cadencia_segundos(1), limiar_alarme_segundos(1)) == (60, 180)
    assert (cadencia_segundos(3), limiar_alarme_segundos(3)) == (60, 180)
    assert (cadencia_segundos(5), limiar_alarme_segundos(5)) == (300, 900)
    assert (cadencia_segundos(6), limiar_alarme_segundos(6)) == (1800, 5400)


def test_cadencia_do_deputado_e_a_volta_completa_das_seis_fatias() -> None:
    """30 min, não 5: os seis crons `*/5` de `vercel.ts` são FATIAS
    (`/api/ingest/deputado-federal/1..6`), e uma zona só é revisitada quando a
    volta fecha (ADR-0036)."""
    assert ATUALIZACAO_MIN_DEPUTADO == 30
    assert CADENCIA_SEGUNDOS[6] == ATUALIZACAO_MIN_DEPUTADO * 60 == 1800


def test_limiar_deriva_da_cadencia_em_vez_de_repetir_o_numero(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """O ADR exige derivação, não um segundo número mantido à mão: mudar a
    cadência tem que mover o limiar sozinho. Se `limiar_alarme_segundos`
    guardasse 5.400 como literal, este teste cairia."""
    monkeypatch.setitem(CADENCIA_SEGUNDOS, 6, 120)
    assert limiar_alarme_segundos(6) == 360


def test_multiplicador_do_alarme_e_tres() -> None:
    """×3 = dois ciclos perdidos completos antes de soar. ×1 dispararia em todo
    tick de cron atrasado por infraestrutura, que o ADR-0011 já assume normal."""
    assert CADENCIAS_ATE_ALARME == 3


def test_sem_cadencia_declarada_nao_ha_limiar() -> None:
    assert cadencia_segundos(99) is None
    assert limiar_alarme_segundos(99) is None


def test_lag_segundos_mede_contra_agora_e_aceita_none() -> None:
    momento = datetime(2026, 10, 4, 23, 0, 0, tzinfo=_UTC)
    agora = momento + timedelta(minutes=7)

    assert lag_segundos(momento.isoformat(), agora) == pytest.approx(420.0)
    assert lag_segundos(None) is None


# ---------------------------------------------------------------------------
# 6. `_relogio_do_ciclo` — o alarme de dado parado (D3)
# ---------------------------------------------------------------------------



class _SoDadoParado(list):
    """Visão da captura restrita ao alarme "dado do TSE parado" (ADR-0038 D3).

    Herda de `list` para os testes seguirem escrevendo `alarmes == []`,
    `len(alarmes)` e `alarmes[0]` sem cerimônia — só que sobre o subconjunto
    que interessa. `_todos` fica acessível para quem precisar afirmar sobre o
    ciclo inteiro algum dia.
    """

    def __init__(self, registro: list[dict[str, Any]]) -> None:
        self._todos = registro
        super().__init__()

    def _sync(self) -> None:
        self[:] = [a for a in self._todos if a.get("msg") == "dado do TSE parado"]

    def __eq__(self, outro: object) -> bool:
        self._sync()
        return list.__eq__(self, outro)

    def __len__(self) -> int:
        self._sync()
        return list.__len__(self)

    def __getitem__(self, i):  # type: ignore[no-untyped-def]
        self._sync()
        return list.__getitem__(self, i)

    def __repr__(self) -> str:
        self._sync()
        return f"{list.__repr__(self)} (de {len(self._todos)} alarmes no ciclo)"


@pytest.fixture
def alarmes(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Intercepta `_alert_slack` para afirmar o que TERIA ido ao Slack.

    O canal real é inerte sem `SLACK_WEBHOOK_URL` — que hoje não está
    configurada, por decisão do dono — então sem esta captura o alarme não
    teria como ser testado sem sair para a rede.
    """
    from api.model import project as proj

    registro: list[dict[str, Any]] = []
    monkeypatch.setattr(
        proj,
        "_alert_slack",
        lambda severity, msg, **ctx: registro.append(
            {"severity": severity, "msg": msg, **ctx}
        ),
    )
    # Devolve só os alarmes DESTA guarda, não o silêncio do ciclo inteiro.
    # `assert alarmes == []` sobre a lista completa é confortável de escrever e
    # envelhece mal: no dia em que outro alarme legítimo passar por este ponto,
    # estes testes ficariam vermelhos acusando "o alarme de dado parado
    # disparou quando não devia" — um diagnóstico confiante e falso, que manda
    # consertar o lugar errado. A asserção precisa ser sobre o conteúdo ("não
    # houve ESTE alarme"), não sobre a forma ("não houve alarme").
    return _SoDadoParado(registro)


def _ha(segundos: int) -> datetime:
    return datetime.now(_UTC) - timedelta(seconds=segundos)


def test_ciclo_com_dado_parado_dispara_o_alarme(alarmes) -> None:
    from api.model.project import _relogio_do_ciclo

    nacional, _por_uf = _relogio_do_ciclo(
        [_par(_ha(600)), _par(_ha(900), cod_zona=2)], cargo=1, turno=1
    )

    assert nacional.dado_ts is not None
    assert len(alarmes) == 1, alarmes
    assert alarmes[0]["severity"] == "error"
    assert alarmes[0]["cargo"] == 1
    assert alarmes[0]["lag_seconds"] > 180
    assert alarmes[0]["limiar_seconds"] == 180
    assert alarmes[0]["pares_atrasados"] == 1


def test_ciclo_dentro_do_limiar_nao_alarma(alarmes) -> None:
    from api.model.project import _relogio_do_ciclo

    _relogio_do_ciclo([_par(_ha(30))], cargo=1, turno=1)

    assert alarmes == []


def test_quarenta_minutos_de_atraso_alarmam_presidente_mas_nao_deputado(
    alarmes,
) -> None:
    """O limiar por cargo em ação, e o discriminante da mutação que troca a
    cadência do cargo 6 (1.800s) pelos 300s de uma fatia do cron: com 300s o
    limiar cairia para 15 min e este ciclo SAUDÁVEL de Deputado alarmaria."""
    from api.model.project import _relogio_do_ciclo

    quarenta_min = [_par(_ha(40 * 60))]

    _relogio_do_ciclo(quarenta_min, cargo=6, turno=1)
    assert alarmes == [], "40 min é meia volta do Deputado — não é incidente"

    _relogio_do_ciclo(quarenta_min, cargo=1, turno=1)
    assert len(alarmes) == 1, "40 min sem dado de Presidente é incidente"


def test_ausencia_de_dg_hg_loga_warn_e_nao_alarma(
    alarmes, caplog: pytest.LogCaptureFixture
) -> None:
    """Fixture podada e boletim real sem `dg`/`hg` chegam aqui iguais — o
    payload só sabe `null`. O log nomeia as duas causas; o alarme fica calado,
    porque não há defasagem a medir de um relógio que não existe."""
    from api.model.project import _relogio_do_ciclo

    with caplog.at_level("INFO", logger="api.model.project"):
        nacional, _ = _relogio_do_ciclo([_par(None), _par(None)], cargo=1, turno=1)

    assert (nacional.dado_ts, nacional.pares_atrasados) == (None, None)
    assert alarmes == []
    mensagens = [r.message for r in caplog.records]
    assert any('"level": "warn"' in m and "dg/hg" in m for m in mensagens), mensagens


def test_dg_hg_ilegivel_loga_error_porque_fixture_podada_nao_quebra(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Campo ausente tem versão benigna (envelope podado); campo ILEGÍVEL não
    tem — fixture podada não tem o que estar quebrado. Por isso este sai em
    `error`, e a ausência em `warn`."""
    from api.model.project import _relogio_do_ciclo

    quebrado = _par(_ha(10))
    quebrado["payload"]["hg"] = "20h15"

    with caplog.at_level("INFO", logger="api.model.project"):
        _relogio_do_ciclo([quebrado, _par(_ha(10), cod_zona=2)], cargo=1, turno=1)

    mensagens = [r.message for r in caplog.records]
    assert any('"level": "error"' in m and "ileg" in m for m in mensagens), mensagens


def test_ciclo_saudavel_loga_os_dois_relogios_para_auditoria(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """RNF-006 ("defasagem TSE → tela") só é verificável se a defasagem for
    registrada — até o ADR-0038 o único relógio ponta a ponta era o do
    cálculo, que anda mesmo quando o dado não anda."""
    from api.model.project import _relogio_do_ciclo

    with caplog.at_level("INFO", logger="api.model.project"):
        _relogio_do_ciclo([_par(_ha(20))], cargo=1, turno=1)

    assert any(
        "relogio_do_dado" in r.message and "lag_seconds" in r.message
        for r in caplog.records
    ), [r.message for r in caplog.records]


# ---------------------------------------------------------------------------
# 7. Os dois campos no payload majoritário (D1) — `ts` intocado ao lado deles
# ---------------------------------------------------------------------------


def _uf_rows() -> list[dict[str, Any]]:
    return [
        {"cargo": 1, "turno": 1, "uf": "SP", "candidato_id": 100, "pct_projetado": 55.0,
         "pct_projetado_lower": 50.0, "pct_projetado_upper": 60.0, "pct_apurado": 80.0},
        {"cargo": 1, "turno": 1, "uf": "SP", "candidato_id": 200, "pct_projetado": 45.0,
         "pct_projetado_lower": 40.0, "pct_projetado_upper": 50.0, "pct_apurado": 80.0},
    ]


def _national_rows() -> list[dict[str, Any]]:
    return [
        {"candidato_id": 100, "pct_projetado": 55.0, "pct_projetado_lower": 50.0,
         "pct_projetado_upper": 60.0, "p_vitoria": 0.9, "rank": 1},
        {"candidato_id": 200, "pct_projetado": 45.0, "pct_projetado_lower": 40.0,
         "pct_projetado_upper": 50.0, "p_vitoria": 0.1, "rank": 2},
    ]


def test_edge_payload_carrega_os_dois_relogios_sem_um_virar_o_outro() -> None:
    from api.model.project import build_edge_payload

    payload = build_edge_payload(
        cargo=1,
        turno=1,
        ts_iso="2026-10-04T23:59:00+00:00",
        uf_rows=_uf_rows(),
        national_rows=_national_rows(),
        eleitorado_total_by_uf={"SP": 30_000_000},
        dado_ts="2026-10-04T23:15:30+00:00",
        pares_atrasados=7,
    )

    # `ts` não muda de nome, de valor nem de significado (D1).
    assert payload["ts"] == "2026-10-04T23:59:00+00:00"
    assert payload["dado_ts"] == "2026-10-04T23:15:30+00:00"
    assert payload["pares_atrasados"] == 7


def test_edge_payload_sem_relogio_publica_null_e_nao_repete_o_ts() -> None:
    """Os três estados de leitura do ADR dependem de `null` ≠ ausente ≠ valor.
    Um fallback para `ts_iso` aqui apagaria o segundo estado."""
    from api.model.project import build_edge_payload

    payload = build_edge_payload(
        cargo=1,
        turno=1,
        ts_iso="2026-10-04T23:59:00+00:00",
        uf_rows=_uf_rows(),
        national_rows=_national_rows(),
        eleitorado_total_by_uf={"SP": 30_000_000},
    )

    assert "dado_ts" in payload and payload["dado_ts"] is None
    assert "pares_atrasados" in payload and payload["pares_atrasados"] is None


def test_payload_de_uf_carrega_o_relogio_daquela_uf() -> None:
    from api.model.project import build_uf_payloads

    base = datetime(2026, 10, 4, 22, 0, 0, tzinfo=_UTC)
    relogio_by_uf = relogio_por_uf(
        [
            _par(base, uf="SP", cod_zona=1),
            _par(base - timedelta(hours=2), uf="SP", cod_zona=2),
        ],
        cargo=1,
    )

    out = build_uf_payloads(
        cargo=1,
        turno=1,
        ts_iso="2026-10-04T23:59:00+00:00",
        uf_rows=_uf_rows(),
        national_rows=_national_rows(),
        municipio_aggregates={},
        zona_municipio={},
        series_by_uf={},
        relogio_by_uf=relogio_by_uf,
    )

    assert out["SP"]["ts"] == "2026-10-04T23:59:00+00:00"
    assert out["SP"]["dado_ts"] == base.isoformat()
    assert out["SP"]["pares_atrasados"] == 1


def test_payload_de_uf_sem_relogio_publica_null() -> None:
    """Caller legado (e UF sem nenhum par no ciclo) → `null`, nunca `ts_iso`."""
    from api.model.project import build_uf_payloads

    out = build_uf_payloads(
        cargo=1,
        turno=1,
        ts_iso="2026-10-04T23:59:00+00:00",
        uf_rows=_uf_rows(),
        national_rows=_national_rows(),
        municipio_aggregates={},
        zona_municipio={},
        series_by_uf={},
    )

    assert out["SP"]["dado_ts"] is None
    assert out["SP"]["pares_atrasados"] is None


# ---------------------------------------------------------------------------
# 8. Sincronia Python ↔ TypeScript — duas cópias do mesmo número
# ---------------------------------------------------------------------------


def test_cadencia_e_limiar_nao_divergem_do_lado_typescript() -> None:
    """A mesma guarda que `test_cargos_sync.py` faz por `cargos.py`.

    O limiar de "dado parado" existe em dois lugares por necessidade: o Python
    decide quando ALARMAR (`_relogio_do_ciclo`) e o TypeScript decide quando
    mostrar o BANNER (`lib/config/dado-freshness.ts`, ADR-0038 D3/D4). Não há
    import entre os dois runtimes, então a sincronia é responsabilidade de um
    teste — sem ele, o dia em que a cadência de um cargo mudar, um dos dois
    lados envelhece em silêncio e a tela passa a discordar do alarme.

    Lê o `.ts` como TEXTO (literal estático, regex basta) — mesma técnica e
    mesmo motivo de `test_cargos_sync.py`: não acrescenta dependência ao
    `requirements.txt` do runtime Python.
    """
    import re

    ts_path = (
        Path(__file__).resolve().parents[3] / "lib" / "config" / "dado-freshness.ts"
    )
    if not ts_path.exists():
        pytest.skip(
            "lib/config/dado-freshness.ts ainda não existe — a frente TS do "
            "ADR-0038 (D4/D5) é que o cria; nada a sincronizar até lá"
        )

    fonte = ts_path.read_text(encoding="utf-8")
    bloco = re.search(
        r"CADENCIA_SEGUNDOS[^=]*=\s*\{(.*?)\}", fonte, re.DOTALL
    )
    assert bloco is not None, "tabela CADENCIA_SEGUNDOS não encontrada no .ts"
    do_ts = {
        int(cd): int(seg)
        for cd, seg in re.findall(r"(\d+):\s*(\d+)", bloco.group(1))
    }

    assert do_ts == CADENCIA_SEGUNDOS, (do_ts, CADENCIA_SEGUNDOS)

    multiplicador = re.search(r"LIMIAR_EM_CADENCIAS\s*=\s*(\d+)", fonte)
    assert multiplicador is not None, "LIMIAR_EM_CADENCIAS não encontrado no .ts"
    assert int(multiplicador.group(1)) == CADENCIAS_ATE_ALARME
