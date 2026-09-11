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
