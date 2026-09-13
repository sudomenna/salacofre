"""
tests/unit/model/test_zona_merge_sanity.py

`api.model.zona_merge.check_zona_merge_sanity` — a guarda de sanidade que
detecta, em runtime, se a premissa "o EA20 por par (município, zona) traz só
a FATIA do município, não a zona inteira" foi violada. Ver o docstring da
função e o plano `perfeito-monte-um-plano-eventual-candle.md` (2026-09-11).

Se a premissa cair, `merge_pairs_into_zonas` soma N cópias da mesma zona: o
`e.te` somado vira ~N vezes o eleitorado real da zona. Esta suíte cobre os
quatro casos exigidos pelo plano:
  - razão ~= 1 → silencioso (premissa confirmada, comportamento esperado);
  - razão ~= N → erro logado (violação confirmada, `n_violacoes` incrementa);
  - zona de par único → ignorada (não pôde ter sido multiplicada);
  - eleitorado ausente para a zona → ignorada, sem falso positivo.

Mais um caso de calibração (zona cinzenta 1,5–1,8): logada como warn, mas não
conta como violação confirmada no agregado do ciclo.
"""

from __future__ import annotations

from typing import Any

from api.model.zona_merge import check_zona_merge_sanity


def _raw(uf: str, cod_municipio_tse: int, cod_zona: int) -> dict[str, Any]:
    """Linha crua pré-merge — só as chaves que a guarda lê (payload não
    importa para o agrupamento por par)."""
    return {
        "uf": uf,
        "cod_municipio_tse": cod_municipio_tse,
        "cod_zona": cod_zona,
        "payload": {},
    }


def _raw_com_te(uf: str, cod_municipio_tse: int, cod_zona: int, te: float) -> dict[str, Any]:
    """Linha crua COM `e.te` — o modo `merged_rows=None` (cargo proporcional)
    soma este campo dos pares em vez de ler a linha mesclada."""
    return {
        "uf": uf,
        "cod_municipio_tse": cod_municipio_tse,
        "cod_zona": cod_zona,
        "payload": {"e": {"te": str(te)}},
    }


def _merged(uf: str, cod_zona: int, te: float) -> dict[str, Any]:
    """Linha mesclada — só o que a guarda lê (`payload.e.te`)."""
    return {
        "uf": uf,
        "cod_zona": cod_zona,
        "payload": {"e": {"te": str(te)}},
    }


# ---------------------------------------------------------------------------
# Razão ~= 1 — premissa confirmada, silencioso
# ---------------------------------------------------------------------------


def test_razao_proxima_de_um_e_silenciosa(caplog) -> None:
    """Zona com 2 pares cujo `e.te` somado bate com o eleitorado da zona
    (dentro da faixa 0,5–1,5) não gera nenhum log de violação nem de warn."""
    raw = [
        _raw("MG", 41238, 9),
        _raw("MG", 41254, 9),
    ]
    merged = [_merged("MG", 9, te=1_020)]
    eleitorado = {("MG", 9): 1_000}

    with caplog.at_level("INFO", logger="api.model.zona_merge"):
        n_violacoes = check_zona_merge_sanity(raw, merged, eleitorado)

    assert n_violacoes == 0
    assert not any(
        "zona_merge_sanity" in registro.message for registro in caplog.records
    )


def test_razao_no_piso_da_faixa_ok_e_silenciosa() -> None:
    """Razão exatamente 0,5 — o piso da faixa "ok" — não deve disparar nada;
    absorve a inflação conhecida de `eleitorado` (docs/reference/risks.md)."""
    raw = [_raw("SP", 71072, 1), _raw("SP", 67016, 1)]
    merged = [_merged("SP", 1, te=500)]
    eleitorado = {("SP", 1): 1_000}

    n_violacoes = check_zona_merge_sanity(raw, merged, eleitorado)

    assert n_violacoes == 0


# ---------------------------------------------------------------------------
# Razão ~= N — violação confirmada, erro logado
# ---------------------------------------------------------------------------


def test_razao_proxima_de_n_dispara_erro(caplog) -> None:
    """Zona com 2 pares cujo `e.te` somado é ~2x o eleitorado da zona — sinal
    clássico de multiplicação (o arquivo trouxe a zona inteira em cada par).
    Deve logar `error` e contar em `n_violacoes`."""
    raw = [
        _raw("MG", 41238, 9),
        _raw("MG", 41254, 9),
    ]
    merged = [_merged("MG", 9, te=2_000)]
    eleitorado = {("MG", 9): 1_000}

    with caplog.at_level("INFO", logger="api.model.zona_merge"):
        n_violacoes = check_zona_merge_sanity(raw, merged, eleitorado)

    assert n_violacoes == 1
    erros = [r for r in caplog.records if '"level": "error"' in r.message]
    assert len(erros) == 1
    assert "MG" in erros[0].message
    assert '"cod_zona": 9' in erros[0].message
    assert '"n_pares": 2' in erros[0].message


def test_razao_proxima_de_n_com_tres_pares() -> None:
    """Zona com 3 pares e `e.te` somado ~3x o eleitorado — mesma lógica,
    N maior (o CSV tem zonas com até 8 municípios)."""
    raw = [
        _raw("MG", 41238, 9),
        _raw("MG", 41254, 9),
        _raw("MG", 41270, 9),
    ]
    merged = [_merged("MG", 9, te=3_000)]
    eleitorado = {("MG", 9): 1_000}

    n_violacoes = check_zona_merge_sanity(raw, merged, eleitorado)

    assert n_violacoes == 1


def test_razao_na_zona_cinzenta_loga_warn_mas_nao_conta_violacao(caplog) -> None:
    """Razão 1,6 (entre 1,5 e 1,8) é fora da faixa "ok" mas abaixo do
    limiar de violação confirmada — warn, não error; não incrementa
    `n_violacoes`."""
    raw = [_raw("MG", 41238, 9), _raw("MG", 41254, 9)]
    merged = [_merged("MG", 9, te=1_600)]
    eleitorado = {("MG", 9): 1_000}

    with caplog.at_level("INFO", logger="api.model.zona_merge"):
        n_violacoes = check_zona_merge_sanity(raw, merged, eleitorado)

    assert n_violacoes == 0
    avisos = [r for r in caplog.records if '"level": "warn"' in r.message]
    assert len(avisos) == 1
    assert "zona_merge_sanity" in avisos[0].message


# ---------------------------------------------------------------------------
# Zona de par único — ignorada
# ---------------------------------------------------------------------------


def test_zona_de_par_unico_e_ignorada_mesmo_com_razao_absurda(caplog) -> None:
    """Zona com um único par não pode ter sido multiplicada por
    `merge_pairs_into_zonas` (a função devolve identidade) — a guarda não
    examina essas zonas, mesmo que a razão pareça extrema (dado de eleitorado
    ruim, por exemplo)."""
    raw = [_raw("AC", 12345, 3)]
    merged = [_merged("AC", 3, te=10_000)]  # 10x o eleitorado — seria "erro"
    eleitorado = {("AC", 3): 1_000}

    with caplog.at_level("INFO", logger="api.model.zona_merge"):
        n_violacoes = check_zona_merge_sanity(raw, merged, eleitorado)

    assert n_violacoes == 0
    assert not any(
        "zona_merge_sanity" in registro.message for registro in caplog.records
    )


def test_zona_com_sentinela_e_um_par_real_conta_como_par_unico() -> None:
    """Sentinela (`cod_municipio_tse = 0`) descartada quando há par real —
    mesmo critério de `merge_pairs_into_zonas`. Sobra 1 par efetivo, a guarda
    ignora a zona mesmo que a razão bruta (contando a sentinela) fosse alta."""
    raw = [
        _raw("MG", 0, 9),  # sentinela
        _raw("MG", 41238, 9),  # par real
    ]
    merged = [_merged("MG", 9, te=5_000)]
    eleitorado = {("MG", 9): 1_000}

    n_violacoes = check_zona_merge_sanity(raw, merged, eleitorado)

    assert n_violacoes == 0


# ---------------------------------------------------------------------------
# Eleitorado ausente — ignorada, sem falso positivo
# ---------------------------------------------------------------------------


def test_eleitorado_ausente_para_a_zona_e_ignorada(caplog) -> None:
    """Zona multi-par sem entrada em `eleitorado` (DF sem eleitorado 2026 é
    um caso real catalogado em `docs/reference/risks.md`) não gera log
    algum — não há como comparar, e a ausência de dado não é evidência de
    violação."""
    raw = [_raw("DF", 53001, 4), _raw("DF", 53002, 4)]
    merged = [_merged("DF", 4, te=2_000)]
    eleitorado: dict[tuple[str, int], int] = {}  # DF sem eleitorado

    with caplog.at_level("INFO", logger="api.model.zona_merge"):
        n_violacoes = check_zona_merge_sanity(raw, merged, eleitorado)

    assert n_violacoes == 0
    assert not any(
        "zona_merge_sanity" in registro.message for registro in caplog.records
    )


def test_eleitorado_zero_para_a_zona_e_ignorado() -> None:
    """`eleitorado.get(chave)` devolvendo `0` (falsy) tem o mesmo tratamento
    de ausência — evita divisão por zero e um falso positivo trivial."""
    raw = [_raw("MG", 41238, 9), _raw("MG", 41254, 9)]
    merged = [_merged("MG", 9, te=2_000)]
    eleitorado = {("MG", 9): 0}

    n_violacoes = check_zona_merge_sanity(raw, merged, eleitorado)

    assert n_violacoes == 0


# ---------------------------------------------------------------------------
# Múltiplas zonas no mesmo ciclo — agregação correta
# ---------------------------------------------------------------------------


def test_agrega_violacoes_de_varias_zonas_no_mesmo_ciclo() -> None:
    """Duas zonas violadas e uma ok no mesmo lote — `n_violacoes` soma só as
    confirmadas."""
    raw = [
        _raw("MG", 41238, 9),
        _raw("MG", 41254, 9),
        _raw("SP", 71072, 1),
        _raw("SP", 67016, 1),
        _raw("BA", 1, 2),
        _raw("BA", 2, 2),
    ]
    merged = [
        _merged("MG", 9, te=2_000),  # violação (razão 2.0)
        _merged("SP", 1, te=1_050),  # ok (razão 1.05)
        _merged("BA", 2, te=1_900),  # violação (razão 1.9)
    ]
    eleitorado = {("MG", 9): 1_000, ("SP", 1): 1_000, ("BA", 2): 1_000}

    n_violacoes = check_zona_merge_sanity(raw, merged, eleitorado)

    assert n_violacoes == 2


# ---------------------------------------------------------------------------
# Modo `merged_rows=None` — o ramo proporcional (cargo 6), ADR-0036 + correção
# de 2026-09-13. Ver a docstring de `check_zona_merge_sanity`.
# ---------------------------------------------------------------------------


def test_sem_merged_rows_soma_te_dos_pares_e_detecta_multiplicacao(caplog) -> None:
    """O cargo 6 não passa por `merge_pairs_into_zonas` — soma os pares em
    `combinar_entradas`. Sem esta guarda no modo `None`, a multiplicação por
    fatia passaria em SILÊNCIO só nesse cargo, enquanto os outros três gritam.

    Dois pares trazendo a zona inteira (1.000 cada) contra um eleitorado de
    1.000: razão 2,0, acima do limiar de violação confirmada (1,8).
    """
    raw = [
        _raw_com_te("MG", 41238, 9, te=1_000),
        _raw_com_te("MG", 41254, 9, te=1_000),
    ]
    eleitorado = {("MG", 9): 1_000}

    with caplog.at_level("INFO", logger="api.model.zona_merge"):
        n_violacoes = check_zona_merge_sanity(raw, None, eleitorado)

    assert n_violacoes == 1
    erros = [r for r in caplog.records if '"level": "error"' in r.message]
    assert len(erros) == 1
    assert "MG" in erros[0].message
    assert '"cod_zona": 9' in erros[0].message
    assert '"n_pares": 2' in erros[0].message


def test_sem_merged_rows_premissa_da_fatia_confirmada_e_silenciosa(caplog) -> None:
    """O outro lado: pares trazendo cada um a sua FATIA (500 + 520) contra
    eleitorado de 1.000 — razão ~1,02, dentro da faixa ok. Silêncio.

    Sem este caso, um teste que só afirmasse "detecta multiplicação" passaria
    com uma guarda que grita sempre.
    """
    raw = [
        _raw_com_te("MG", 41238, 9, te=500),
        _raw_com_te("MG", 41254, 9, te=520),
    ]
    eleitorado = {("MG", 9): 1_000}

    with caplog.at_level("INFO", logger="api.model.zona_merge"):
        n_violacoes = check_zona_merge_sanity(raw, None, eleitorado)

    assert n_violacoes == 0
    assert not any("zona_merge_sanity" in r.message for r in caplog.records)


def test_os_dois_modos_medem_a_mesma_coisa() -> None:
    """Equivalência: `te` é aditivo (`_E_ADITIVOS`), então somar `e.te` dos
    pares dá o mesmo que ler o `e.te` da linha mesclada. Se os dois modos
    divergirem, um dos cargos passa a ser julgado por régua diferente — e a
    divergência só apareceria na noite em que importa.
    """
    raw = [
        _raw_com_te("SP", 71072, 1, te=1_200),
        _raw_com_te("SP", 67016, 1, te=1_300),
    ]
    eleitorado = {("SP", 1): 1_250}
    merged = [_merged("SP", 1, te=2_500)]  # 1.200 + 1.300

    assert check_zona_merge_sanity(raw, None, eleitorado) == check_zona_merge_sanity(
        raw, merged, eleitorado
    )


def test_sem_merged_rows_zona_de_par_unico_segue_ignorada() -> None:
    """Zona com um par só não pôde ter sido multiplicada por soma — mesmo
    critério do modo com merge, mantido no modo novo."""
    raw = [_raw_com_te("AC", 1120, 3, te=99_999)]
    eleitorado = {("AC", 3): 1_000}

    assert check_zona_merge_sanity(raw, None, eleitorado) == 0
