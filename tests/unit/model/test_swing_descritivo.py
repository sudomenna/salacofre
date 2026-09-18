"""`api/model/project.py::compute_swing_descritivo` — E1 do plano § B, Fase 5.

    swing(U) = pct_atual_votaveis(líder apurado de U, 2026)
               − 100 * votos_2022(número de urna do líder, U) / Σvotos_2022(U)

O que estes testes precisam discriminar (e por quê):

  - **UF com número de 2022 vs UF sem.** A segunda tem que sair `None`, e o
    teste precisa provar que sai `None` e NÃO `0.0`. Essa é a regressão que
    já aconteceu uma vez: o `constitution-guard` pegou, em 2026-09-05, um
    `0.0` emitido em toda UF, que afirma na tela que "nenhuma UF mudou desde
    2022" — falso, e pior que não mostrar nada.
  - **Sinal.** Um teste só com swing positivo passa com a subtração
    invertida. Há caso positivo e caso negativo.
  - **Qual líder.** A E1 diz `pct_atual` — fato observado. Um teste em que o
    líder do apurado e o líder da projeção são candidatos DIFERENTES é o
    único que distingue as duas leituras.
  - **A chave de 2022.** `historical_results.cod_candidato` é um surrogate
    (`data-pipeline/historical-import.ts`) que embute `NR_PARTIDO`. Se um dia
    virar `SQ_CANDIDATO` real, os dois últimos dígitos podem casar por acaso
    com o número de urna de alguém — e o site publicaria um swing contra o
    partido errado, em silêncio. Há teste para a guarda de formato.
"""

from __future__ import annotations

from typing import Any

from api.model.project import compute_swing_descritivo

# Surrogate de 2022 (`surrogateCandidatoId`): cargo*1e6 + ano*1000 + turno*100
# + nr_partido. Para Presidente (cargo 1) e Governador (cargo 3) o número de
# urna É o número do partido — é isso que torna a comparação computável.
def _cod_2022(nr_partido: int, cargo: int = 1, turno: int = 1) -> int:
    return cargo * 1_000_000 + 2022 * 1000 + turno * 100 + nr_partido


def _hist(
    uf: str, nr_partido: int, votos: int, *, cargo: int = 1, turno: int = 1
) -> dict[str, Any]:
    return {
        "uf": uf,
        "cod_zona": 1,
        "cod_candidato": _cod_2022(nr_partido, cargo, turno),
        "pct_validos": None,
        "partido": None,
        "votos": votos,
    }


def _row(
    uf: str,
    candidato_id: int,
    pct_atual: float | None,
    pct_projetado: float,
    *,
    cargo: int = 1,
    turno: int = 1,
) -> dict[str, Any]:
    return {
        "cargo": cargo,
        "turno": turno,
        "uf": uf,
        "candidato_id": candidato_id,
        "pct_atual": pct_atual,
        "pct_projetado": pct_projetado,
    }


# ---------------------------------------------------------------------------
# O número
# ---------------------------------------------------------------------------


def test_swing_positivo_e_negativo_na_mesma_rodada() -> None:
    """Dois sinais no mesmo dataset — a subtração invertida morre aqui.

    SP: líder 13 tem 55,0% hoje e teve 4.000/10.000 = 40% em 2022 → +15 pp.
    RS: líder 13 tem 52,0% hoje e teve 7.000/10.000 = 70% em 2022 → −18 pp.
    """
    uf_rows = [
        _row("SP", 13, 55.0, 55.0),
        _row("SP", 22, 45.0, 45.0),
        _row("RS", 13, 52.0, 52.0),
        _row("RS", 22, 48.0, 48.0),
    ]
    historical = [
        _hist("SP", 13, 4000),
        _hist("SP", 22, 6000),
        _hist("RS", 13, 7000),
        _hist("RS", 22, 3000),
    ]
    out = compute_swing_descritivo(uf_rows, historical)
    assert out["SP"] == 15.0
    assert out["RS"] == -18.0


def test_denominador_e_a_soma_de_todos_os_partidos_de_2022() -> None:
    """Σvotos_2022(U) inclui QUEM NÃO ESTÁ na disputa de 2026.

    Se o denominador fosse só a soma dos números que também aparecem em
    `uf_rows`, o share de 2022 do líder subiria artificialmente e o swing
    ficaria mais negativo do que é. Aqui o partido 12 teve 5.000 votos em
    2022 e não existe em 2026: o denominador é 20.000, não 15.000.
    """
    uf_rows = [_row("BA", 13, 50.0, 50.0), _row("BA", 22, 50.0, 50.0)]
    historical = [
        _hist("BA", 13, 8000),
        _hist("BA", 22, 7000),
        _hist("BA", 12, 5000),
    ]
    out = compute_swing_descritivo(uf_rows, historical)
    # 8000/20000 = 40% → 50 − 40 = +10. Com denominador 15.000 daria
    # 53,33% → −3,33.
    assert out["BA"] == 10.0


def test_soma_zonas_da_mesma_uf() -> None:
    """`historical_results` é por (uf, zona, candidato) — a UF é a soma."""
    uf_rows = [_row("PE", 13, 50.0, 50.0)]
    historical = [
        {**_hist("PE", 13, 1000), "cod_zona": 1},
        {**_hist("PE", 13, 3000), "cod_zona": 2},
        {**_hist("PE", 22, 6000), "cod_zona": 1},
    ]
    out = compute_swing_descritivo(uf_rows, historical)
    # 4000/10000 = 40% → +10.
    assert out["PE"] == 10.0


# ---------------------------------------------------------------------------
# Qual líder — `pct_atual`, não `pct_projetado`
# ---------------------------------------------------------------------------


def test_lider_e_o_do_apurado_nao_o_da_projecao() -> None:
    """O caso em que as duas leituras discordam.

    Em MG o 13 lidera o APURADO (60% contra 40%) e o 22 lidera a PROJEÇÃO
    (60% contra 40%). Os dois tiveram 50% em 2022. O swing certo é o do 13:
    +10. Ler o líder da projeção (e o `pct_atual` dele) daria −10 — mesmo
    módulo, sinal trocado, e é por isso que este teste não pode ser
    substituído por um em que o líder é o mesmo nas duas bases.
    """
    uf_rows = [
        _row("MG", 13, 60.0, 40.0),
        _row("MG", 22, 40.0, 60.0),
    ]
    historical = [_hist("MG", 13, 5000), _hist("MG", 22, 5000)]
    out = compute_swing_descritivo(uf_rows, historical)
    assert out["MG"] == 10.0


def test_usa_pct_atual_e_nao_pct_projetado_como_minuendo() -> None:
    """Mesmo líder nas duas bases, valores diferentes — isola o minuendo."""
    uf_rows = [
        _row("PR", 13, 55.0, 70.0),
        _row("PR", 22, 45.0, 30.0),
    ]
    historical = [_hist("PR", 13, 5000), _hist("PR", 22, 5000)]
    out = compute_swing_descritivo(uf_rows, historical)
    # 55 − 50 = 5 (apurado). Com `pct_projetado` daria 70 − 50 = 20.
    assert out["PR"] == 5.0


# ---------------------------------------------------------------------------
# `None`, nunca `0.0` — a regressão que já aconteceu
# ---------------------------------------------------------------------------


def test_uf_sem_numero_de_2022_sai_none_e_nao_zero() -> None:
    """Achado HIGH do `constitution-guard` (2026-09-05).

    `0.0` afirma "esta UF não mudou desde 2022". A UF que não tem com o que
    comparar precisa sair `None` — a UI renderiza "—". As duas asserções são
    necessárias: `assert out["AC"] is None` sozinho passaria se o código
    devolvesse `None` para TUDO, então a UF vizinha com número real está no
    mesmo dataset.
    """
    uf_rows = [
        _row("SP", 13, 55.0, 55.0),
        _row("AC", 13, 55.0, 55.0),
    ]
    historical = [_hist("SP", 13, 4000), _hist("SP", 22, 6000)]
    out = compute_swing_descritivo(uf_rows, historical)
    assert out["SP"] == 15.0
    assert out["AC"] is None
    assert out["AC"] != 0.0


def test_lider_sem_votos_em_2022_naquela_uf_sai_none() -> None:
    """Partido novo, ou partido que não teve voto nenhum ali em 2022.

    A UF TEM total de 2022 (o 22 teve 5.000 votos) — o que falta é o número
    do líder. Tratar isso como `0%` em 2022 publicaria um swing gigante e
    inventado (+55 pp) em vez de admitir que não há comparação.
    """
    uf_rows = [_row("AP", 13, 55.0, 55.0), _row("AP", 22, 45.0, 45.0)]
    historical = [_hist("AP", 22, 5000)]
    out = compute_swing_descritivo(uf_rows, historical)
    assert out["AP"] is None


def test_uf_sem_nada_apurado_sai_none() -> None:
    """UF imputada do nacional (RF-017) — `pct_atual` é `None` em todas as
    linhas. Sem fato observado de 2026, não há comparação descritiva."""
    uf_rows = [_row("RR", 13, None, 55.0), _row("RR", 22, None, 45.0)]
    historical = [_hist("RR", 13, 4000), _hist("RR", 22, 6000)]
    out = compute_swing_descritivo(uf_rows, historical)
    assert out["RR"] is None


def test_historical_vazio_devolve_none_para_todas_as_ufs_presentes() -> None:
    """A leitura de `historical_results` é não-fatal a montante (`[]` quando
    a query falha). Toda UF de `uf_rows` aparece no dict, com `None`."""
    uf_rows = [_row("SP", 13, 55.0, 55.0), _row("RS", 13, 52.0, 52.0)]
    out = compute_swing_descritivo(uf_rows, [])
    assert out == {"SP": None, "RS": None}


def test_sem_uf_rows_devolve_dict_vazio() -> None:
    assert compute_swing_descritivo([], []) == {}


# ---------------------------------------------------------------------------
# A chave de 2022 — guarda de formato do surrogate
# ---------------------------------------------------------------------------


def test_cod_candidato_fora_do_formato_surrogate_nao_casa() -> None:
    """Um `SQ_CANDIDATO` real terminado em "13" NÃO pode virar o número 13.

    250001613913 % 100 == 13: um `cod % 100` cego casaria com o líder e
    publicaria um swing calculado contra um candidato qualquer. A guarda
    exige que o código inteiro reconstrua o surrogate
    (cargo/ano/turno/partido); não reconstruindo, a linha é ignorada — e
    como ela era a única da UF, o total fica 0 e o swing sai `None`.
    """
    uf_rows = [_row("SE", 13, 55.0, 55.0)]
    historical = [
        {
            "uf": "SE",
            "cod_zona": 1,
            "cod_candidato": 250001613913,
            "pct_validos": None,
            "partido": None,
            "votos": 9000,
        }
    ]
    out = compute_swing_descritivo(uf_rows, historical)
    assert out["SE"] is None


def test_turno_errado_no_surrogate_nao_casa() -> None:
    """Linhas de 2022 do turno 2 não servem para o turno 1 de 2026 (e
    vice-versa) — o surrogate carrega o turno, e a guarda o confere."""
    uf_rows = [_row("GO", 13, 55.0, 55.0, turno=1)]
    historical = [
        _hist("GO", 13, 4000, turno=2),
        _hist("GO", 22, 6000, turno=2),
    ]
    out = compute_swing_descritivo(uf_rows, historical)
    assert out["GO"] is None


def test_cargo_sem_comparacao_possivel_sai_none() -> None:
    """Senador (cargo 5): número de urna tem 3 dígitos e não é o número do
    partido; além disso 2022 renovou 1/3 do Senado e 2026 renova 2/3. Não há
    comparação honesta — sai `None` mesmo que existam linhas de 2022."""
    uf_rows = [_row("SP", 133, 55.0, 55.0, cargo=5)]
    historical = [_hist("SP", 33, 4000, cargo=5), _hist("SP", 22, 6000, cargo=5)]
    out = compute_swing_descritivo(uf_rows, historical)
    assert out["SP"] is None


def test_governador_cargo_3_compara() -> None:
    """Cargo 3 usa o mesmo mecanismo — o número de urna do governador também
    é o número do partido."""
    uf_rows = [
        _row("SC", 13, 55.0, 55.0, cargo=3),
        _row("SC", 22, 45.0, 45.0, cargo=3),
    ]
    historical = [_hist("SC", 13, 4000, cargo=3), _hist("SC", 22, 6000, cargo=3)]
    out = compute_swing_descritivo(uf_rows, historical)
    assert out["SC"] == 15.0
