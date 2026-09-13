"""Conversão de votos em cadeiras — os 9 casos de borda do ADR-0027.

Cada teste aqui corresponde a uma linha da tabela de casos de borda do ADR, e
cada um encoda um dispositivo legal específico. Não são testes de "a função não
quebra": são testes de "a função obedece à lei", e a lei mudou duas vezes desde
2021 (Lei 14.211/2021 e as ADIs 7228/7263/7325).

O que este arquivo **não** cobre: o golden contra 2022 (spec 017 RF-126). Ele
exige votação por CANDIDATO, e o que está no disco é
`build/tse-archives/votacao_partido_munzona_2022/`, que é agregado por partido —
não traz candidato. O dataset irmão `votacao_candidato_munzona` não está na
máquina. Ver a nota no fim deste arquivo.
"""

from __future__ import annotations

import pytest

from api.model.cadeiras import (
    Agremiacao,
    Candidato,
    distribuir_cadeiras,
    quociente_eleitoral,
)


def _ag(cod: str, *votos_dos_candidatos: int, legenda: int = 0) -> Agremiacao:
    """Agremiação com candidatos numerados sequencialmente e globalmente únicos."""
    base = abs(hash(cod)) % 1000 * 100
    return Agremiacao(
        cod=cod,
        votos_legenda=legenda,
        candidatos=tuple(
            Candidato(cod=base + i, votos_nominais=v) for i, v in enumerate(votos_dos_candidatos)
        ),
    )


# ---------------------------------------------------------------------------
# Caso 1 — arredondamento do quociente eleitoral (art. 106)
# ---------------------------------------------------------------------------


def test_caso1_fracao_exatamente_meio_desce() -> None:
    """"desprezada a fração se igual ou inferior a meio" — 0,5 EXATO desce.

    É a classe de erro que passa despercebida: `round()` de Python usa banker's
    rounding e `int(x + 0.5)` arredonda para cima. Os dois erram aqui.
    """
    # 21 votos / 2 lugares = 10,5 exato.
    assert quociente_eleitoral(21, 2) == 10
    # 1050 / 100 = 10,5 exato.
    assert quociente_eleitoral(1050, 100) == 10
    # E round() erraria nos dois:
    assert round(21 / 2) == 10  # banker's: acerta por acaso (10 é par)
    assert round(1050 / 100) == 10
    assert int(21 / 2 + 0.5) == 11  # half-up: ERRA


def test_caso1_fracao_acima_de_meio_sobe() -> None:
    # 22 / 2 = 11,0 → sem fração
    assert quociente_eleitoral(22, 2) == 11
    # 1051 / 100 = 10,51 → sobe
    assert quociente_eleitoral(1051, 100) == 11
    # 1049 / 100 = 10,49 → desce
    assert quociente_eleitoral(1049, 100) == 10


def test_caso1_sem_erro_de_ponto_flutuante() -> None:
    """A comparação é feita em inteiros, então não há fração irrepresentável.

    Em `float`, `votos/lugares` para números grandes perde precisão e uma fração
    matematicamente igual a 0,5 pode virar 0,49999999999999994 — o que mudaria o
    QE em 1 e, com ele, uma cadeira.
    """
    lugares = 3
    votos = 10**15 * 3 + 1  # fração = 1/3, bem abaixo de 1/2
    assert quociente_eleitoral(votos, lugares) == 10**15

    votos_meio = 2 * 10**15 + 1  # /2 → fração exatamente 0,5
    assert quociente_eleitoral(votos_meio, 2) == 10**15


def test_quociente_rejeita_entrada_invalida() -> None:
    with pytest.raises(ValueError, match="lugares_a_preencher"):
        quociente_eleitoral(1000, 0)
    with pytest.raises(ValueError, match="negativo"):
        quociente_eleitoral(-1, 10)


# ---------------------------------------------------------------------------
# Caso 2 e 2b — QP não preenchido, e cadeiras ≠ vagas_obtidas
# ---------------------------------------------------------------------------


def test_caso2_qp_inteiro_permanece_no_denominador_da_media() -> None:
    """Res. 23.677 art. 11 § 5º (ADI 5.420): conta o QP inteiro, ainda que vago.

    Partido A tem quociente para 3 cadeiras mas só 2 candidatos acima dos 10% do
    QE. A 3ª vaga vai às sobras — mas o denominador da média de A continua sendo
    3+1, não 2+1. Se fosse 2+1, A teria vantagem indevida nas sobras.
    """
    a = _ag("A", 2000, 1400, 50, 50)  # 3.500 votos; 2 acima de 110 (10% de 1100)
    b = _ag("B", 3000, 1500, 900, legenda=100)
    c = _ag("C", 1200, 800)

    r = distribuir_cadeiras([a, b, c], 10)

    assert r.quociente_eleitoral == 1100
    assert r.quociente_partidario["A"] == 3
    # Ocupou 2 na fase 1 (só 2 candidatos acima do piso)...
    assert len([x for x in r.eleitos["A"]][:3]) >= 2
    # ...mas o denominador levou o QP inteiro.
    assert r.vagas_obtidas["A"] >= 3


def test_caso2b_soma_de_cadeiras_fecha_no_total_e_a_de_vagas_obtidas_nao() -> None:
    """A invariante que impede cadeira a mais na tela (ADR-0027, caso 2b).

    `Σ cadeiras` == lugares a preencher (menos as que não têm a quem ir).
    `Σ vagas_obtidas` pode exceder — e exceder é CORRETO, porque é bookkeeping.
    Exibir a segunda numa UF de 10 vagas mostraria 11.
    """
    a = _ag("A", 2000, 1400, 50, 50)
    b = _ag("B", 3000, 1500, 900, legenda=100)
    c = _ag("C", 1200, 800)

    r = distribuir_cadeiras([a, b, c], 10)

    candidatos_totais = 4 + 3 + 2
    esperado = min(10, candidatos_totais)
    assert sum(r.cadeiras.values()) == esperado
    assert sum(r.cadeiras.values()) + r.vagas_nao_preenchidas == 10

    # E as duas grandezas de fato divergem neste cenário — senão o teste não
    # estaria provando nada.
    assert sum(r.vagas_obtidas.values()) > sum(r.cadeiras.values())


def test_cadeiras_nunca_excede_o_numero_de_candidatos() -> None:
    a = _ag("A", 5000)  # um só candidato
    b = _ag("B", 100, 90)
    r = distribuir_cadeiras([a, b], 5)

    assert r.cadeiras["A"] == 1
    assert len(r.eleitos["A"]) == 1


# ---------------------------------------------------------------------------
# Caso 3 — partido sem QP disputa sobras
# ---------------------------------------------------------------------------


def test_caso3_partido_sem_quociente_partidario_disputa_sobras() -> None:
    """Art. 109 § 2º + ADI 5.420: não é preciso ter atingido o QP.

    O pequeno tem QP = 0 e, ainda assim, entra na disputa das sobras — na fase 2
    se passar dos 80%, na fase 3 de todo jeito.
    """
    grande = _ag("G", 6000, 500)
    pequeno = _ag("P", 900)  # abaixo do QE
    r = distribuir_cadeiras([grande, pequeno], 3)

    assert r.quociente_partidario["P"] == 0
    assert r.cadeiras["P"] >= 1, "partido sem QP ficou de fora das sobras"


# ---------------------------------------------------------------------------
# Caso 8 — nenhum partido atinge o QE (art. 111 inconstitucional)
# ---------------------------------------------------------------------------


def test_caso8_nenhum_partido_atinge_o_qe_usa_medias_nao_os_mais_votados() -> None:
    """Art. 111 foi declarado inconstitucional (ADI 7228) — não implementá-lo.

    Cenário construído para que as duas regras deem respostas OPOSTAS, senão o
    teste não provaria nada:

      - a agremiação A tem a **maior votação total** do pleito (1.440) distribuída
        em três candidatos medianos (500, 480, 460);
      - B a G têm um candidato cada, todos com votação individual MAIOR que
        qualquer candidato de A (900, 880, 870, 860, 850, 840).

    Pelo art. 111 literal ("os candidatos mais votados"), as 4 vagas iriam para
    B, C, D e E — e **A ficaria com zero**. Pelo algoritmo de médias do art. 12-A,
    A leva 3. Medido em 2026-09-11.
    """
    ags = [
        _ag("A", 500, 480, 460),  # maior total (1.440), candidatos medianos
        _ag("B", 900),
        _ag("C", 880),
        _ag("D", 870),
        _ag("E", 860),
        _ag("F", 850),
        _ag("G", 840),
    ]
    r = distribuir_cadeiras(ags, 4)

    assert all(qp == 0 for qp in r.quociente_partidario.values()), "cenário perdeu o sentido"

    # Os 4 candidatos mais votados individualmente — o que o art. 111 elegeria.
    mais_votados = sorted(
        ((c.votos_nominais, a.cod) for a in ags for c in a.candidatos), reverse=True
    )[:4]
    assert {cod for _, cod in mais_votados} == {"B", "C", "D", "E"}
    assert "A" not in {cod for _, cod in mais_votados}, "cenário perdeu o contraste"

    # E é exatamente A que as médias elegem — prova de que o art. 111 não roda.
    assert r.cadeiras["A"] == 3
    assert sum(r.cadeiras.values()) == 4


# ---------------------------------------------------------------------------
# Fases 2 e 3 — os pisos de 80% / 20% e a abertura pós-ADI
# ---------------------------------------------------------------------------


def test_partido_abaixo_de_80_por_cento_entra_na_fase_3() -> None:
    """ADI 7228: quem não passa dos pisos não fica fora para sempre.

    Antes da decisão, um partido abaixo de 80% do QE nunca disputaria sobras.
    Depois, ele entra quando a fase 2 se esgota.
    """
    # Só o grande passa dos 80% e tem candidato acima de 20% — a fase 2 se
    # esgota quando ele fica sem candidatos não eleitos.
    grande = _ag("G", 4000, 100)
    fraco = _ag("F", 500)
    r = distribuir_cadeiras([grande, fraco], 4)

    assert sum(r.cadeiras.values()) == 3, "só há 3 candidatos ao todo"
    assert r.cadeiras["F"] == 1, "o fraco devia ter entrado na fase 3"


def test_cladusula_dos_10_por_cento_bloqueia_na_fase_1() -> None:
    """Art. 108: candidato abaixo de 10% do QE não ocupa vaga pelo QP."""
    # QE = 2000/2 = 1000 → piso de 10% = 100.
    a = _ag("A", 1900, 50)  # o segundo está abaixo do piso
    b = _ag("B", 50)
    r = distribuir_cadeiras([a, b], 2)

    assert r.quociente_partidario["A"] == 1
    # O candidato de 50 votos não entra pelo QP; se entrar, é por sobra (fase 3,
    # que não tem piso) — o que importa é que a fase 1 o barrou.
    assert r.eleitos["A"][0].votos_nominais == 1900


# ---------------------------------------------------------------------------
# Casos 5 e 6 — desempate por idade e federação
# ---------------------------------------------------------------------------


def test_caso5_empate_de_votos_elege_o_mais_idoso() -> None:
    """Art. 110 — "haver-se-á por eleito o candidato mais idoso"."""
    a = Agremiacao(
        cod="A",
        votos_legenda=0,
        candidatos=(
            Candidato(cod=10, votos_nominais=1000, nascimento=19800101),  # mais novo
            Candidato(cod=11, votos_nominais=1000, nascimento=19600101),  # mais idoso
        ),
    )
    b = _ag("B", 100)
    r = distribuir_cadeiras([a, b], 1)

    assert r.eleitos["A"][0].cod == 11, "elegeu o mais novo"


def test_empate_que_a_norma_nao_resolve_sai_como_dado_e_como_frase() -> None:
    """Duas saídas do mesmo fato, e a de máquina não é extraída da de humano.

    Cenário: duas agremiações idênticas em tudo que a norma usa para desempatar
    — mesma média, mesma votação total, mesma votação nominal do candidato que
    disputa a vaga (Res. 23.677 art. 11 §§ 6º–7º esgotados). A norma não prevê
    sorteio, então o módulo **registra** e a tela marca como indeterminado.

    `empates_agremiacoes` é o dado (a tela marca barras por código);
    `empates_indeterminados` é a frase (o log é lido por gente). Quem precisa
    do código não pode ir buscá-lo dentro do texto: a frase pode ser reescrita
    a qualquer momento, e este é um caso raro o bastante para a quebra passar
    despercebida.
    """
    r = distribuir_cadeiras([_ag("A", 400, 100), _ag("B", 400, 100)], 3)

    assert r.empates_agremiacoes == [["A", "B"]], "o cenário deixou de empatar"
    assert len(r.empates_indeterminados) == 1
    assert "A" in r.empates_indeterminados[0] and "B" in r.empates_indeterminados[0]
    # A vaga continua sendo atribuída — marcar como indeterminado é sobre o que
    # a tela diz, não sobre deixar cadeira no ar.
    assert sum(r.cadeiras.values()) == 3


def test_distribuicao_sem_empate_nao_registra_nada() -> None:
    r = distribuir_cadeiras([_ag("A", 1000), _ag("B", 400)], 2)

    assert r.empates_agremiacoes == []
    assert r.empates_indeterminados == []


def test_caso6_federacao_conta_como_uma_agremiacao() -> None:
    """Lei 9.096 art. 11-A + Lei 9.504 art. 6º-A — federação é UMA agremiação.

    Cenário em que a diferença é máxima, medido em 2026-09-11: três partidos de
    700 votos cada, contra dois rivais de 3.000, em 6 vagas.

      - **Separados**: cada um dos três fica abaixo dos 80% do QE, não entra na
        fase 2, e os rivais esgotam as sobras antes da fase 3. **Zero cadeiras.**
      - **Federados**: os 2.100 somados dão quociente partidário 1 e a maior
        média na sobra. **Duas cadeiras.**

    Modelar a federação como três linhas separadas não é uma simplificação
    inofensiva — apaga duas cadeiras.
    """
    r1 = _ag("R1", 1000, 1000, 1000)
    r2 = _ag("R2", 1000, 1000, 1000)

    separados = distribuir_cadeiras([r1, r2, _ag("F1", 700), _ag("F2", 700), _ag("F3", 700)], 6)
    federados = distribuir_cadeiras([r1, r2, _ag("FED", 700, 700, 700)], 6)

    soma_separados = sum(separados.cadeiras[c] for c in ("F1", "F2", "F3"))
    assert soma_separados == 0
    assert federados.cadeiras["FED"] == 2

    # As duas distribuições continuam fechando no total de vagas.
    assert sum(separados.cadeiras.values()) == 6
    assert sum(federados.cadeiras.values()) == 6


def test_federacao_duplicada_na_entrada_e_rejeitada() -> None:
    """Se a federação entrar como várias linhas com o mesmo código, é erro."""
    with pytest.raises(ValueError, match="repetido"):
        distribuir_cadeiras([_ag("X", 100), _ag("X", 200)], 2)


# ---------------------------------------------------------------------------
# Suplentes, determinismo e bordas
# ---------------------------------------------------------------------------


def test_suplentes_nao_exigem_votacao_minima() -> None:
    """Art. 112 p.ú. — o piso de 10% vale para eleição, não para suplência."""
    a = _ag("A", 5000, 10, 5)  # dois candidatos bem abaixo de 10% do QE
    b = _ag("B", 100)
    r = distribuir_cadeiras([a, b], 2)

    cods_suplentes = {c.cod for c in r.suplentes["A"]}
    nao_eleitos = {c.cod for c in a.candidatos} - {c.cod for c in r.eleitos["A"]}
    assert cods_suplentes == nao_eleitos, "suplente foi filtrado por piso de votos"


def test_suplentes_em_ordem_decrescente_de_votos() -> None:
    a = _ag("A", 5000, 300, 200, 100)
    r = distribuir_cadeiras([a, _ag("B", 50)], 1)

    votos = [c.votos_nominais for c in r.suplentes["A"]]
    assert votos == sorted(votos, reverse=True)


def test_determinismo_bit_a_bit() -> None:
    """Constituição § 6. Aritmética exata (Fraction), sem float em lugar nenhum."""
    ags = [_ag("A", 2000, 1400, 900), _ag("B", 1800, 1100), _ag("C", 1500, 700)]
    r1 = distribuir_cadeiras(ags, 5)
    r2 = distribuir_cadeiras(ags, 5)

    assert r1.cadeiras == r2.cadeiras
    assert [c.cod for c in r1.eleitos["A"]] == [c.cod for c in r2.eleitos["A"]]


def test_ordem_das_agremiacoes_na_entrada_nao_muda_o_resultado() -> None:
    ags = [_ag("A", 2000, 1400, 900), _ag("B", 1800, 1100), _ag("C", 1500, 700)]
    direto = distribuir_cadeiras(ags, 5)
    invertido = distribuir_cadeiras(list(reversed(ags)), 5)

    assert direto.cadeiras == invertido.cadeiras


def test_sem_votos_nao_distribui_nada() -> None:
    r = distribuir_cadeiras([_ag("A", 0), _ag("B", 0)], 3)

    assert r.quociente_eleitoral == 0
    assert sum(r.cadeiras.values()) == 0
    assert r.vagas_nao_preenchidas == 3


def test_votos_de_legenda_entram_no_quociente_partidario() -> None:
    """Art. 107 — "votos válidos dados sob a mesma legenda" inclui a legenda."""
    sem_legenda = distribuir_cadeiras([_ag("A", 900), _ag("B", 1100)], 2)
    com_legenda = distribuir_cadeiras([_ag("A", 900, legenda=400), _ag("B", 1100)], 2)

    assert com_legenda.quociente_partidario["A"] > sem_legenda.quociente_partidario["A"]


def test_rejeita_lugares_invalidos() -> None:
    with pytest.raises(ValueError, match="lugares_a_preencher"):
        distribuir_cadeiras([_ag("A", 100)], 0)


# ---------------------------------------------------------------------------
# Nota sobre o golden de 2022 (spec 017 RF-126) — NÃO coberto aqui
# ---------------------------------------------------------------------------
#
# RF-126 exige reproduzir a distribuição oficial de 2022 nas 27 UFs. Falta o
# dado: o que está na máquina é
# `build/tse-archives/votacao_partido_munzona_2022/`, agregado por PARTIDO, sem
# candidato — e a fase 1 precisa de votação nominal individual para aplicar a
# cláusula dos 10%. O dataset irmão é `votacao_candidato_munzona_2022`, no mesmo
# repositório de dados abertos que `data-pipeline/historical-import.ts:6-7,124-125`
# já baixa (`cdn.tse.jus.br/estatistica/sead/odsele/...`) — caminho sancionado e
# distinto do CDN de resultados, que a constituição § 1 proíbe sondar.
#
# Duas ressalvas antes de construir o golden:
#
#   1. **O gabarito tem de ser o resultado RECALCULADO pós-ADI 7228**, não o
#      proclamado em 2022: os embargos julgados em 13/03/2025 derrubaram a
#      modulação e a decisão retroage àquela eleição. Usar os números da época
#      produziria um golden errado, que passaria com um algoritmo errado —
#      exatamente o defeito que o gate OT-4 já teve quando era tautológico.
#   2. **O disco está a 97%** (~6 GiB livres) e o dataset de candidato é maior
#      que o de partido (174 MB). Medir antes de baixar.
