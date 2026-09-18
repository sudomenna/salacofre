"""S08 § 3 — o alarme de "série parada enquanto o placar anda".

Cobre `vigiar_serie_cega` (`api/model/project.py`), a lacuna que o ADR-0047
(`docs/architecture/adrs/0047-serie-cor-legivel-e-ciclo-sem-hora-fora-do-eixo.md`)
nomeia na seção de consequências e explicitamente **não** fecha: o ciclo sem
hora legível do TSE é descartado em dois lugares e os dois são mudos.

## O que precisa ser verdade

1. **Contador de ciclos cegos por cargo**, visível no log estruturado.
2. **Alarme na CONJUNÇÃO** — o contador cresce **e** o placar do mesmo cargo
   andou. É a conjunção que separa a pausa legítima do TSE (nada se move) da
   série cega (o placar anda, a linha não). Hoje 88% dos ciclos são cegos e
   estão todos certos: alarmar por ciclo cego sozinho seria ruído puro.

## A regra desta casa

Teste verde não prova nada. Cada bloco abaixo nomeia a MUTAÇÃO que mata, e as
fixtures são construídas para que a mutação mude o RESULTADO — não para que o
código passe. As três mutações que a S08 exige que morram:

  1. `and` → `or` na conjunção  → morto por `test_ciclo_cego_com_placar_parado…`
  2. remover o incremento do contador → morto por `test_ciclo_cego_incrementa…`
     (o número no log) **e** por `test_alarme_dispara_na_conjuncao` (sem
     incremento, `contador_cresceu` é falso e o alarme não sai)
  3. alarmar em ciclo cego sem o placar andar → mesma fixture da mutação 1

Nenhum teste aqui toca banco nem rede: `vigiar_serie_cega` é pura sobre
estruturas em memória, e o único efeito externo (`_alert_slack`) é capturado.
`ALLOW_DB_WRITE_TESTS` não tem nada a ver com este arquivo.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest

import api.model.project as proj
from api.model.project import (
    SERIE_PLACAR_EPSILON_PP,
    SeriePorCandidatoBruta,
    _balde_epoch,
    vigiar_serie_cega,
)

#: A hora do boletim, longe do relógio de parede de qualquer máquina.
BOLETIM = datetime(2026, 10, 4, 20, 0, 0, tzinfo=timezone.utc)

CADENCIA = 5


# ---------------------------------------------------------------------------
# Fixtures e captura
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _zera_estado_do_processo() -> Any:
    """O contador mora no processo — sem isto os testes se contaminam.

    É também a demonstração honesta do limite do desenho: numa instância fria
    o contador recomeça do zero (subestima, nunca superestima).
    """
    proj._SERIE_CICLOS_CEGOS.clear()
    proj._SERIE_CEGA_ALARMADA.clear()
    yield
    proj._SERIE_CICLOS_CEGOS.clear()
    proj._SERIE_CEGA_ALARMADA.clear()


class _Espiao:
    """Captura `_log` e `_alert_slack` sem tocar em stdout nem em rede."""

    def __init__(self) -> None:
        self.logs: list[tuple[str, str, dict[str, Any]]] = []
        self.alertas: list[tuple[str, str, dict[str, Any]]] = []

    def log(self, level: str, msg: str, **ctx: Any) -> None:
        self.logs.append((level, msg, ctx))

    def alerta(self, severity: str, msg: str, **ctx: Any) -> None:
        self.alertas.append((severity, msg, ctx))

    def descartes(self) -> list[dict[str, Any]]:
        """Contexto de cada log de ciclo descartado, em ordem.

        Filtra pela mensagem de descarte de propósito: a linha do ALARME também
        carrega `ciclos_cegos`, e contar as duas faria a sequência depender de
        o placar ter andado — que é outra pergunta.
        """
        return [ctx for _l, m, ctx in self.logs if "ciclo descartado" in m]

    def contadores(self) -> list[int]:
        return [ctx["ciclos_cegos"] for ctx in self.descartes()]


@pytest.fixture
def espiao(monkeypatch: pytest.MonkeyPatch) -> _Espiao:
    e = _Espiao()
    monkeypatch.setattr(proj, "_log", e.log)
    monkeypatch.setattr(proj, "_alert_slack", e.alerta)
    return e


def _uf_row(uf: str, cid: int, votos_atuais: int | None) -> dict[str, Any]:
    """Linha de UF com o que a razão de somas lê: `uf` e `votos_atuais`."""
    return {
        "cargo": 1,
        "turno": 1,
        "uf": uf,
        "candidato_id": cid,
        "votos_atuais": votos_atuais,
        "pct_projetado": 50.0,
        "pct_apurado": 50.0,
    }


def _placar(votos_13: int, votos_22: int) -> list[dict[str, Any]]:
    """Um placar nacional de duas candidaturas, em votos absolutos.

    🔴 Em VOTOS, não em percentual: `pct_atual_nacional_por_candidato` é uma
    razão de somas sobre `votos_atuais` (o percentual não se re-agrega). Montar
    a fixture em percentual faria o teste passar por cima da função real.
    """
    return [_uf_row("SP", 13, votos_13), _uf_row("SP", 22, votos_22)]


def _serie(
    pontos: dict[str | None, dict[int, list[tuple[datetime, float | None]]]],
) -> SeriePorCandidatoBruta:
    """Série bruta a partir de `(momento, pct_atual)` — balde pelo epoch."""
    por_escopo: dict[str | None, dict[int, dict[int, dict[str, Any]]]] = {}
    for escopo, por_cand in pontos.items():
        for cid, lista in por_cand.items():
            destino = por_escopo.setdefault(escopo, {}).setdefault(cid, {})
            for momento, pct_atual in lista:
                destino[_balde_epoch(momento, CADENCIA)] = {
                    "momento": momento,
                    "pct_atual": pct_atual,
                    "pct_projetado": 50.0,
                }
    return SeriePorCandidatoBruta(CADENCIA, por_escopo)


#: A série parou em 20h55 mostrando 55/45 — o mesmo que o placar de
#: `_placar(550_000, 450_000)`. Nada se moveu: é a pausa legítima do TSE.
def _serie_em(pct_13: float | None, pct_22: float | None) -> SeriePorCandidatoBruta:
    antes = BOLETIM - timedelta(minutes=5)
    return _serie({None: {13: [(antes, pct_13)], 22: [(antes, pct_22)]}})


HORA_LEGIVEL = BOLETIM.isoformat()


# ===========================================================================
# Caixa 1 da S08 § 3 — o contador
# ===========================================================================


def test_ciclo_cego_incrementa_o_contador_por_cargo(espiao: _Espiao) -> None:
    """Mutações que este teste mata, três:

    1. **Remover o `+1`** (`ciclos = anterior`) — o log sairia `0, 0`.
    2. **Não guardar o contador** (`_SERIE_CICLOS_CEGOS[chave] = ciclos`
       apagado) — o segundo ciclo sairia `1` em vez de `2`.
    3. **Contar sem separar por cargo** (um inteiro global em vez do dicionário
       por `(cargo, turno)`) — o ciclo do cargo 3 sairia `3`, não `1`.

    A asserção é sobre a SEQUÊNCIA de valores, não sobre o último: só a
    sequência distingue as três.
    """
    serie = _serie_em(55.0, 45.0)
    placar = _placar(550_000, 450_000)

    for _ in range(2):
        vigiar_serie_cega(serie, uf_rows=placar, dado_ts=None, cargo=1, turno=1)
    vigiar_serie_cega(serie, uf_rows=placar, dado_ts=None, cargo=3, turno=1)

    assert espiao.contadores() == [1, 2, 1], (
        "o contador tem de crescer dentro do cargo e recomeçar em outro cargo"
    )
    assert [c["cargo"] for c in espiao.descartes()] == [1, 1, 3]


def test_ciclo_com_hora_legivel_zera_o_contador(espiao: _Espiao) -> None:
    """Mutação que este teste mata: não zerar no ciclo com hora legível.

    Sem o `pop`, o contador vira um total desde o boot do processo e para de
    responder à pergunta que importa — "há quanto tempo a linha está parada
    AGORA". A asserção exige que o quarto ciclo volte a `1`, não a `3`.
    """
    serie = _serie_em(55.0, 45.0)
    placar = _placar(550_000, 450_000)

    def cego() -> int:
        return vigiar_serie_cega(serie, uf_rows=placar, dado_ts=None, cargo=1, turno=1)

    assert cego() == 1
    assert cego() == 2
    assert (
        vigiar_serie_cega(
            serie, uf_rows=placar, dado_ts=HORA_LEGIVEL, cargo=1, turno=1
        )
        == 0
    )
    assert cego() == 1


def test_hora_ilegivel_conta_como_ciclo_cego(espiao: _Espiao) -> None:
    """`dado_ts` presente mas impossível de ler é cegueira, não visão.

    Mutação que este teste mata: trocar `_dado_ts_para_coluna(dado_ts) is not
    None` por `dado_ts is not None`. É EXATAMENTE o modo de falha que o alarme
    existe para cobrir — o TSE muda o formato da data e o parser não tolera —,
    e a mutação o deixaria invisível justamente aí.
    """
    serie = _serie_em(50.0, 50.0)
    placar = _placar(550_000, 450_000)

    assert (
        vigiar_serie_cega(
            serie, uf_rows=placar, dado_ts="04/10/2026 20:00", cargo=1, turno=1
        )
        == 1
    )
    assert espiao.contadores() == [1]


# ===========================================================================
# Caixa 2 da S08 § 3 — o alarme, e só na conjunção
# ===========================================================================


def test_alarme_dispara_na_conjuncao(espiao: _Espiao) -> None:
    """Ciclo cego E placar adiante do último ponto da série → alarme.

    A série parou em 50/50; o placar deste ciclo está em 55/45. O leitor veria
    a ponta da linha em 50 e o número ao lado dela em 55, na mesma tela.

    Mutações que este teste mata: não existir alarme nenhum; e remover o
    incremento do contador (sem ele `contador_cresceu` é falso e a conjunção
    não fecha, mesmo com o placar andando).
    """
    serie = _serie_em(50.0, 50.0)

    vigiar_serie_cega(
        serie, uf_rows=_placar(550_000, 450_000), dado_ts=None, cargo=1, turno=1
    )

    assert len(espiao.alertas) == 1
    severidade, msg, ctx = espiao.alertas[0]
    assert severidade == "error"
    assert "placar" in msg
    assert ctx["cargo"] == 1
    assert ctx["ciclos_cegos"] == 1
    # +5,00 pp para a candidatura 13 e −5,00 pp para a 22: o alarme carrega o
    # tamanho da discrepância, não só a sua existência.
    assert ctx["delta_pp"] == {13: 5.0, 22: -5.0}


def test_ciclo_cego_com_placar_parado_nao_alarma(espiao: _Espiao) -> None:
    """🔴 O falso positivo que a conjunção existe para evitar.

    Ciclo cego com o placar exatamente onde a série o deixou: é a pausa
    legítima do TSE, e é o que acontece em 22 de cada 25 ciclos hoje. Alarmar
    aqui treinaria o leitor a ignorar o canal antes de 04/10.

    Mutações que este teste mata, duas — e são as duas da lista da S08:

      1. **`and` → `or`** na conjunção: com `or`, o ciclo cego sozinho bastaria.
      2. **Alarmar por ciclo cego**, sem olhar o placar.

    O contador, esse, continua crescendo e aparecendo no log — o silêncio é do
    canal, não da observabilidade.
    """
    serie = _serie_em(55.0, 45.0)

    for _ in range(3):
        vigiar_serie_cega(
            serie, uf_rows=_placar(550_000, 450_000), dado_ts=None, cargo=1, turno=1
        )

    assert espiao.alertas == [], (
        "ciclo cego com o placar parado é pausa legítima do TSE, não série cega"
    )
    assert espiao.contadores() == [1, 2, 3]
    assert [c["placar_andou"] for c in espiao.descartes()] == [False, False, False]


def test_placar_andando_com_hora_legivel_nao_alarma(espiao: _Espiao) -> None:
    """A outra metade da conjunção, pelo outro lado.

    O placar está a 5 pp do último ponto da série — mas o ciclo TEM hora
    legível, então o ponto vai entrar na série logo em seguida
    (`anexar_ponto_corrente`) e a defasagem morre no mesmo ciclo. Não há nada
    para alarmar.

    Mutação que este teste mata: remover a saída antecipada do ciclo com hora
    legível (ou inverter a condição). Aí todo ciclo normal em que a apuração
    avança viraria alarme — e na noite de 04/10 isso é literalmente todo ciclo.
    """
    serie = _serie_em(50.0, 50.0)

    vigiar_serie_cega(
        serie,
        uf_rows=_placar(550_000, 450_000),
        dado_ts=HORA_LEGIVEL,
        cargo=1,
        turno=1,
    )

    assert espiao.alertas == []
    assert espiao.descartes() == []


def test_alarme_nao_se_repete_na_mesma_sequencia_cega(espiao: _Espiao) -> None:
    """Um alarme por sequência cega — e um novo depois que ela termina.

    Sem isto, uma noite com o parser de data quebrado produziria uma mensagem
    por ciclo (60 por hora, por cargo) e o canal viraria ruído — risco nomeado
    na S08. Mas a supressão tem de morrer junto com a sequência: uma segunda
    cegueira, depois de a série voltar a andar, é notícia nova.

    Mutações que este teste mata: remover a deduplicação (sairiam 3 alarmes na
    primeira sequência); e esquecer o `discard` no ciclo com hora legível (a
    segunda sequência ficaria muda para sempre).
    """
    serie = _serie_em(50.0, 50.0)
    placar = _placar(550_000, 450_000)

    for _ in range(3):
        vigiar_serie_cega(serie, uf_rows=placar, dado_ts=None, cargo=1, turno=1)
    assert len(espiao.alertas) == 1

    vigiar_serie_cega(serie, uf_rows=placar, dado_ts=HORA_LEGIVEL, cargo=1, turno=1)
    vigiar_serie_cega(serie, uf_rows=placar, dado_ts=None, cargo=1, turno=1)

    assert len(espiao.alertas) == 2, (
        "a segunda cegueira, depois de a série voltar a andar, é notícia nova"
    )


# ===========================================================================
# As bordas do "andou"
# ===========================================================================


def test_movimento_abaixo_da_precisao_publicada_nao_conta(espiao: _Espiao) -> None:
    """O piso é a precisão em que a série é publicada, não zero.

    550.050 de 1.000.000 = 55,005% contra os 55,00% da série: 0,005 pp, que
    arredonda para o MESMO número na tela. Não existe discrepância visível, e
    portanto não existe o que alarmar. Já 0,02 pp existe.

    Mutação que este teste mata: `SERIE_PLACAR_EPSILON_PP = 0` (ou comparação
    `!=` crua). O ruído de ponto flutuante da razão de somas passaria a
    alarmar sozinho, e o canal morreria na primeira hora.

    O segundo bloco é o contrapeso: sem ele, um piso absurdamente alto
    (digamos 10 pp) também passaria neste teste.
    """
    serie = _serie_em(55.0, 45.0)

    vigiar_serie_cega(
        serie, uf_rows=_placar(550_050, 449_950), dado_ts=None, cargo=1, turno=1
    )
    assert espiao.alertas == []

    vigiar_serie_cega(
        serie, uf_rows=_placar(550_200, 449_800), dado_ts=None, cargo=3, turno=1
    )
    assert len(espiao.alertas) == 1
    assert espiao.alertas[0][2]["delta_pp"] == {13: 0.02, 22: -0.02}


def test_candidatura_sem_baseline_na_serie_nao_sustenta_alarme(
    espiao: _Espiao,
) -> None:
    """Baseline ausente não vira `0.0` — é "não foi medido" (ADR-0046 D1).

    Dois buracos de baseline num só caso: a candidatura 13 só existe no escopo
    de UF (a série NACIONAL não a conhece) e a 22 tem ponto nacional com
    `pct_atual` nulo. Nenhuma das duas pode sustentar a afirmação "o placar
    cresceu", embora o placar deste ciclo traga 55 e 45.

    Mutação que este teste mata: `placar_na_serie.get(cid, 0.0)`. Com o zero
    imputado, todo começo de noite — série ainda vazia, primeiro voto chegando
    — viraria um alarme de série cega. É a regra dos três estados aplicada ao
    alarme: "não sabemos" não é "zero".
    """
    antes = BOLETIM - timedelta(minutes=5)
    serie = _serie({"SP": {13: [(antes, 50.0)]}, None: {22: [(antes, None)]}})

    vigiar_serie_cega(
        serie, uf_rows=_placar(550_000, 450_000), dado_ts=None, cargo=1, turno=1
    )

    assert espiao.alertas == []
    descarte = espiao.descartes()[0]
    assert descarte["candidaturas_na_serie"] == 0
    assert descarte["placar_andou"] is False


def test_serie_nacional_vazia_nao_alarma(espiao: _Espiao) -> None:
    """Primeiro ciclo da noite: nada em `projections` ainda, nada a comparar."""
    vigiar_serie_cega(
        SeriePorCandidatoBruta(CADENCIA, {}),
        uf_rows=_placar(550_000, 450_000),
        dado_ts=None,
        cargo=1,
        turno=1,
    )
    assert espiao.alertas == []
    assert espiao.contadores() == [1]


# ===========================================================================
# O canal nasce mudo — e mudo não é quebrado
# ===========================================================================


def test_alarme_e_mudo_sem_slack_webhook_e_nao_levanta(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """🔴 Sem `SLACK_WEBHOOK_URL` o alarme registra e segue — nunca levanta.

    `SLACK_WEBHOOK_URL` não existe em nenhum ambiente (decisão adiada pelo dono
    em 18/09), e isto é o esperado, não defeito: o contador no log funciona
    desde já e o canal ganha voz quando a variável for colada. Este teste roda
    o `_alert_slack` DE VERDADE (não o espião) para provar as duas coisas na
    mesma passagem — que nada vai para a rede e que nada sobe como exceção.

    Constituição § 7: um alerta não pode derrubar o ciclo do modelo.
    """
    monkeypatch.delenv("SLACK_WEBHOOK_URL", raising=False)
    monkeypatch.setattr(
        proj.urllib.request,
        "urlopen",
        lambda *a, **k: pytest.fail("o alarme mudo não pode tocar a rede"),
    )

    serie = _serie_em(50.0, 50.0)
    with caplog.at_level(logging.INFO, logger="api.model.project"):
        ciclos = vigiar_serie_cega(
            serie,
            uf_rows=_placar(550_000, 450_000),
            dado_ts=None,
            cargo=1,
            turno=1,
        )

    assert ciclos == 1
    mensagens = [json.loads(r.getMessage()) for r in caplog.records]
    assert any(
        m["msg"] == "slack alert skipped — SLACK_WEBHOOK_URL ausente"
        for m in mensagens
    ), "o pulo do alarme tem de ficar registrado, senão o canal some sem rastro"
    assert any(m.get("ciclos_cegos") == 1 for m in mensagens), (
        "o contador no log é a metade que funciona sem o canal"
    )


def test_epsilon_e_a_precisao_publicada() -> None:
    """O piso não é um número solto: é `SERIE_CASAS_DECIMAIS` em pp.

    Mutação que este teste mata: mexer num dos dois sem o outro. Se a série
    passar a publicar 3 casas, o piso do alarme tem de acompanhar — senão ele
    fica cego para uma discrepância que o leitor consegue ver.
    """
    assert SERIE_PLACAR_EPSILON_PP == 10 ** (-proj.SERIE_CASAS_DECIMAIS)
