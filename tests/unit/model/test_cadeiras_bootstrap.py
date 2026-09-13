"""Intervalo de cadeiras por bootstrap de zonas — RF-127, spec 017 D7.

**Não existe dado real de cargo 6 por zona em lugar nenhum** — nem no banco (898
linhas em 13/09, todas de cargo 3), nem em fixture. O golden de 2022
(`tests/fixtures/model/cadeiras-golden-2022.json`) é agregado por UF e sem série
temporal, então não há histórico contra o qual conferir uma faixa. Inventar um
valor esperado ("PT entre 68 e 74 cadeiras") seria escrever o gabarito a partir
do código, que é a forma mais eficiente de ter um teste que nunca reprova.

Por isso estes testes são de **propriedade**: afirmam o que o método garante,
não um número que ele produz.

    · as cadeiras de cada réplica somam as vagas da UF;
    · o ponto publicado está dentro da faixa publicada;
    · a faixa estreita quando mais zonas apuram;
    · a mesma seed devolve as mesmas réplicas, seeds diferentes não;
    · o sorteio de zonas é COMPARTILHADO entre agremiações (medido pela
      anticorrelação que só um sorteio compartilhado produz);
    · o voto de legenda se move junto com o nominal.

Cada um foi verificado por mutação — quebrar o código de propósito e conferir
que o teste cai. As mutações e o que caiu estão no relatório da tarefa.
"""

from __future__ import annotations

import numpy as np
import pytest

from api.model.cadeiras import Agremiacao, Candidato, distribuir_cadeiras
from api.model.cadeiras_bootstrap import (
    MIN_ZONAS_PARA_INTERVALO,
    _percentis,
    intervalo_de_cadeiras,
    intervalo_nacional,
    zonas_com_voto,
)
from api.model.deputado import (
    EntradaProporcional,
    combinar_entradas,
    extrair_entrada_proporcional,
)

# ---------------------------------------------------------------------------
# Construtores — uma zona é uma `EntradaProporcional`, como a que
# `project._entradas_por_zona` monta somando os pares (município, zona).
# ---------------------------------------------------------------------------


def _agr(cod: str, legenda: int, votos: list[tuple[int, int]]) -> Agremiacao:
    return Agremiacao(
        cod=cod,
        votos_legenda=legenda,
        candidatos=tuple(Candidato(cod=sq, votos_nominais=v) for sq, v in votos),
    )


def _zona(agremiacoes: list[Agremiacao], vagas: int = 10) -> EntradaProporcional:
    return EntradaProporcional(
        agremiacoes=agremiacoes,
        lugares_a_preencher=vagas,
        quociente_eleitoral_tse=None,
        vagas_tse={},
        totalizacao_final=False,
    )


def _redutos(n_zonas: int, vagas: int = 10) -> list[EntradaProporcional]:
    """Zonas em que a força de cada agremiação alterna — reduto eleitoral.

    Zona par é reduto da agremiação 10, zona ímpar da 20, e a 30 é uniforme.
    É o padrão que faz o bootstrap ter o que medir: com todas as zonas
    idênticas, qualquer sorteio devolve o mesmo total e a faixa fecha no ponto
    — o que seria verdade, e não teste.
    """
    zonas: list[EntradaProporcional] = []
    for j in range(n_zonas):
        forte, fraca = ("10", "20") if j % 2 == 0 else ("20", "10")
        zonas.append(
            _zona(
                [
                    _agr(forte, 100, [(int(forte) * 10 + i, 900 - i * 20) for i in range(6)]),
                    _agr(fraca, 10, [(int(fraca) * 10 + i, 60 - i * 5) for i in range(6)]),
                    _agr("30", 50, [(300 + i, 300 - i * 10) for i in range(6)]),
                ],
                vagas,
            )
        )
    # Ordem estável das agremiações na soma (`combinar_entradas` segue a ordem
    # de primeira aparição) — sem isso a lista da UF alternaria com `n_zonas`.
    for zona in zonas:
        zona.agremiacoes.sort(key=lambda a: a.cod)
    return zonas


def _uf(zonas: list[EntradaProporcional]) -> EntradaProporcional:
    return combinar_entradas(zonas)


def _calcular(
    zonas: list[EntradaProporcional], *, vagas: int = 10, seed: int = 4242, n: int = 1000
):
    uf = _uf(zonas)
    ponto = distribuir_cadeiras(uf.agremiacoes, vagas)
    intervalo = intervalo_de_cadeiras(
        zonas=zonas,
        entrada_uf=uf,
        cadeiras_ponto=ponto.cadeiras,
        lugares_a_preencher=vagas,
        seed=seed,
        n_resamples=n,
    )
    return uf, ponto, intervalo


def _largura(intervalo) -> int:
    return sum(alto - baixo for baixo, alto in intervalo.por_agremiacao.values())


# ---------------------------------------------------------------------------
# As invariantes do método
# ---------------------------------------------------------------------------


def test_cada_replica_distribui_exatamente_as_vagas_da_uf() -> None:
    """A réplica é uma corrida completa, não uma perturbação de números.

    Se as cadeiras de uma réplica não somassem as vagas, o que está sendo
    reamostrado não seria a corrida — seria o resultado dela.
    """
    zonas = _redutos(20)
    _, _, intervalo = _calcular(zonas)

    por_replica = sum(intervalo.resamples.values())
    assert set(np.unique(por_replica).tolist()) == {10}


def test_o_ponto_publicado_cabe_na_faixa_publicada() -> None:
    """Número e faixa saem na mesma linha da tela; contradizerem-se é defeito."""
    zonas = _redutos(20)
    _, ponto, intervalo = _calcular(zonas)

    for cod, (baixo, alto) in intervalo.por_agremiacao.items():
        assert baixo <= ponto.cadeiras[cod] <= alto, cod


def test_a_soma_das_faixas_contem_o_total_de_vagas() -> None:
    """Corolário do anterior, e o que a tela soma: Σbaixo ≤ vagas ≤ Σalto."""
    zonas = _redutos(20)
    _, _, intervalo = _calcular(zonas)

    assert sum(b for b, _ in intervalo.por_agremiacao.values()) <= 10
    assert sum(a for _, a in intervalo.por_agremiacao.values()) >= 10


def test_a_faixa_arredonda_para_fora_e_nunca_para_dentro() -> None:
    """O percentil interpolado devolve 4,9 cadeiras; a faixa precisa cobrir o
    que as réplicas produziram, e arredondar para o mais próximo a encolheria
    em até meia cadeira de cada lado."""
    replicas = np.array([2] * 25 + [5] * 975, dtype=np.int64)
    assert _percentis(replicas, ponto=5) == (4, 5)


def test_a_faixa_se_estende_ate_o_ponto_quando_as_replicas_nao_o_alcancam() -> None:
    """Cinto de segurança contra a contradição na mesma linha da tela.

    Contagem discreta e distribuição assimétrica podem deixar o número apurado
    fora dos percentis das réplicas. Quando isso acontece quem cede é a faixa:
    o ponto é o dado, o intervalo é a inferência sobre ele.

    ⚠️ **Cobertura honesta**: este teste é da função, não de um cenário de UF.
    Não consegui construir um caso realista que exercitasse o caminho — a
    mutação que remove o `min`/`max` não derruba nenhum teste de ponta a ponta
    (registrado no relatório da tarefa). O `min`/`max` fica como defesa, e este
    teste documenta o contrato dele.
    """
    assert _percentis(np.zeros(1000, dtype=np.int64), ponto=3) == (0, 3)
    assert _percentis(np.full(1000, 7, dtype=np.int64), ponto=2) == (2, 7)


def test_a_faixa_estreita_quando_mais_zonas_apuram() -> None:
    """O sinal que o leitor procura a noite toda: a incerteza tem de cair.

    Quatro zonas contra quarenta do MESMO padrão — só muda quantas apuraram.
    """
    _, _, poucas = _calcular(_redutos(4))
    _, _, muitas = _calcular(_redutos(40))

    assert _largura(muitas) < _largura(poucas)


# ---------------------------------------------------------------------------
# Determinismo (constituição § 6)
# ---------------------------------------------------------------------------


def test_a_mesma_seed_devolve_as_mesmas_replicas() -> None:
    zonas = _redutos(20)
    _, _, a = _calcular(zonas, seed=777)
    _, _, b = _calcular(zonas, seed=777)

    assert a.por_agremiacao == b.por_agremiacao
    for cod, replicas in a.resamples.items():
        assert np.array_equal(replicas, b.resamples[cod]), cod


def test_seeds_diferentes_sorteiam_zonas_diferentes() -> None:
    """A asserção é sobre as RÉPLICAS, não sobre o percentil.

    Duas seeds precisam produzir sorteios diferentes — é isso que prova que a
    seed é usada. O percentil de 1.000 réplicas é estável de propósito e pode
    coincidir entre seeds; exigir que ele mude seria exigir instabilidade.
    """
    zonas = _redutos(20)
    _, _, a = _calcular(zonas, seed=777)
    _, _, b = _calcular(zonas, seed=778)

    assert any(
        not np.array_equal(replicas, b.resamples[cod])
        for cod, replicas in a.resamples.items()
    )


# ---------------------------------------------------------------------------
# O `idx` compartilhado — o ponto inteiro do desenho
# ---------------------------------------------------------------------------


def test_toda_replica_e_uma_combinacao_inteira_de_zonas() -> None:
    """Um `idx` por UF, não um por agremiação (`extrapolation.py:264-265`).

    Este é o teste com poder sobre a mutação, e o caminho até ele vale
    registro. A primeira versão media a **anticorrelação** entre duas
    agremiações em redutos opostos — passava, parecia provar o compartilhamento,
    e não provava nada: as cadeiras somam sempre as vagas da UF, então duas
    agremiações são anticorreladas por soma zero, com sorteio compartilhado ou
    sem ele. A mutação "um `idx` por agremiação" passava por cima dela.

    O que discrimina é uma consequência **determinística** do `idx` único: com
    duas zonas existem exatamente três réplicas possíveis — `z0+z0`, `z0+z1`,
    `z1+z1` — e nenhuma outra. Cada réplica é uma **combinação inteira de zonas
    inteiras**, herdada por todas as agremiações ao mesmo tempo.

    Com um sorteio por agremiação, cada uma escolhe a sua combinação: a 10 pode
    vir de `z0+z0` enquanto a 20 vem de `z1+z1`. O resultado é um estado que
    nenhuma noite real produziria — dois estados diferentes somados e chamados
    de um — e ele aparece aqui como um vetor de cadeiras fora dos três
    possíveis (medido: 12 vetores distintos, contra 3).
    """
    forte = {"10": 6, "20": 2, "30": 1}
    fraco = {"10": 1, "20": 3, "30": 6}
    z0 = _zona([_agr(c, 50 * p, [(int(c) * 10 + i, (400 - i * 50) * p) for i in range(6)])
                for c, p in forte.items()])
    z1 = _zona([_agr(c, 50 * p, [(int(c) * 10 + i, (400 - i * 50) * p) for i in range(6)])
                for c, p in fraco.items()])

    uf = _uf([z0, z1])
    cods = [a.cod for a in uf.agremiacoes]

    def vetor(combinacao: list[EntradaProporcional]) -> tuple[int, ...]:
        cadeiras = distribuir_cadeiras(combinar_entradas(combinacao).agremiacoes, 10).cadeiras
        return tuple(cadeiras[cod] for cod in cods)

    possiveis = {vetor([z0, z0]), vetor([z0, z1]), vetor([z1, z1])}
    assert len(possiveis) == 3, "o cenário precisa distinguir as três réplicas"

    _, _, intervalo = _calcular([z0, z1])
    observados = {
        tuple(int(intervalo.resamples[cod][r]) for cod in cods)
        for r in range(intervalo.n_resamples)
    }
    assert observados == possiveis


def test_o_voto_de_legenda_e_reamostrado_junto_com_o_nominal() -> None:
    """`votos_legenda` entra no quociente partidário (`cadeiras.py:79-82`).

    Cenário construído para isolá-lo: o voto NOMINAL é idêntico em todas as
    zonas, então reamostrar zonas não o move nem um voto. Toda a variação
    possível está na legenda — reduto da 10 nas seis primeiras zonas, da 20 nas
    seis últimas. Se a legenda saísse do sorteio (copiada literal, como faz o
    proxy de custo em `scripts/bench-deputado.py:251`), as 1.000 réplicas
    sairiam idênticas e a faixa fecharia no ponto.
    """
    zonas = [
        _zona(
            [
                _agr("10", 4000 if j < 6 else 100, [(100 + i, 500) for i in range(6)]),
                _agr("20", 100 if j < 6 else 4000, [(200 + i, 500) for i in range(6)]),
            ]
        )
        for j in range(12)
    ]
    _, ponto, intervalo = _calcular(zonas)

    assert ponto.cadeiras == {"10": 5, "20": 5}
    assert intervalo.por_agremiacao["10"][0] < 5 < intervalo.por_agremiacao["10"][1]


def test_numero_de_urna_repetido_entre_agremiacoes_nao_funde_candidatos() -> None:
    """A chave é `agr[].n` + `sqcand`, nunca `cand.n` (`deputado.py:101-112`).

    No proporcional o número de urna se repete entre partidos. Este envelope
    dá o MESMO `n` a um candidato da agremiação 10 e a um da 20, com `sqcand`
    distintos. Chaveado por `n`, os dois virariam um só: a matriz perderia uma
    linha, a soma das zonas deixaria de reproduzir a UF e a guarda devolveria
    `None` — sem faixa nenhuma, em vez de uma faixa errada.
    """

    def envelope(votos_a: int, votos_b: int) -> dict:
        def par(numero: str, sigla: str, sq: int, votos: int) -> dict:
            return {
                "n": numero,
                "sg": sigla,
                "tvtl": "100",
                # Mesmo número de urna nas duas agremiações, de propósito.
                "cand": [{"n": "1050", "sqcand": str(sq), "nmu": sigla, "vap": str(votos)}],
            }

        return {
            "tf": "n",
            "carg": [
                {
                    "cd": "6",
                    "nv": "2",
                    "agr": [
                        {"n": "10", "nm": "A", "tp": "i", "tvtl": "100", "par": [par("10", "AA", 501, votos_a)]},
                        {"n": "20", "nm": "B", "tp": "i", "tvtl": "100", "par": [par("20", "BB", 502, votos_b)]},
                    ],
                }
            ],
        }

    zonas = [
        extrair_entrada_proporcional(envelope(900, 100)),
        extrair_entrada_proporcional(envelope(100, 900)),
        extrair_entrada_proporcional(envelope(500, 500)),
    ]
    uf = _uf(zonas)
    ponto = distribuir_cadeiras(uf.agremiacoes, 2)
    intervalo = intervalo_de_cadeiras(
        zonas=zonas,
        entrada_uf=uf,
        cadeiras_ponto=ponto.cadeiras,
        lugares_a_preencher=2,
        seed=1,
    )

    assert intervalo is not None
    assert set(intervalo.por_agremiacao) == {"10", "20"}
    # Os dois candidatos continuam separados: 1.500 votos cada, não 3.000 num só.
    assert {c.cod: c.votos_nominais for a in uf.agremiacoes for c in a.candidatos} == {
        501: 1500,
        502: 1500,
    }


# ---------------------------------------------------------------------------
# Degeneração — o limiar, testado dos dois lados
# ---------------------------------------------------------------------------


def test_uma_zona_so_nao_publica_intervalo() -> None:
    """O interruptor de emergência `TSE_DEPUTADO_GRANULARIDADE=uf` devolve o
    cargo a uma sentinela por UF: `k = 1`, 1.000 réplicas idênticas, faixa de
    largura zero. Isso não é um intervalo estreito, é a ausência dele com cara
    de certeza — e `cadeiras_ci95` é opcional no contrato (D5/D6) para poder
    faltar em vez de mentir."""
    _, _, intervalo = _calcular(_redutos(1))
    assert intervalo is None


def test_duas_zonas_ja_publicam_intervalo() -> None:
    """O outro lado do limiar. Duas unidades dão 3 réplicas distintas — pouco,
    e é por isso que a faixa sai larga; larga e verdadeira é o resultado certo,
    não um defeito a esconder (ADR-0036, Consequências)."""
    _, ponto, intervalo = _calcular(_redutos(2))

    assert MIN_ZONAS_PARA_INTERVALO == 2
    assert intervalo is not None
    assert intervalo.n_zonas == 2
    for cod, (baixo, alto) in intervalo.por_agremiacao.items():
        assert baixo <= ponto.cadeiras[cod] <= alto


def test_uf_pequena_publica_faixa_larga_em_vez_de_nenhuma() -> None:
    """Roraima tem 8 zonas contra as 394 de São Paulo (ADR-0036). O intervalo
    sai mais largo lá, e sai — esconder a faixa da UF pequena trocaria um
    número com incerteza declarada por um número sem ela, que o leitor lê como
    mais firme."""
    _, _, rr = _calcular(_redutos(8))
    _, _, sp = _calcular(_redutos(394))

    assert rr is not None and sp is not None
    assert _largura(rr) > _largura(sp)


def test_zona_sem_voto_nao_entra_no_sorteio() -> None:
    """Uma zona que reportou o envelope e não apurou nada não é informação.

    Incluí-la não moveria a média das réplicas, mas acrescentaria variância
    tirada de urna vazia — faixa mais larga por nada.
    """
    vazias = [_zona([_agr("10", 0, [(100, 0)]), _agr("20", 0, [(200, 0)])]) for _ in range(5)]
    com_voto = _redutos(3)

    assert len(zonas_com_voto(com_voto + vazias)) == 3
    _, _, intervalo = _calcular(com_voto + vazias)
    assert intervalo is not None
    assert intervalo.n_zonas == 3


def test_uma_zona_com_voto_entre_varias_vazias_nao_publica_intervalo() -> None:
    vazias = [_zona([_agr("10", 0, [(100, 0)]), _agr("20", 0, [(200, 0)])]) for _ in range(5)]
    _, _, intervalo = _calcular(_redutos(1) + vazias)
    assert intervalo is None


def test_uf_sem_vagas_publicadas_nao_tem_intervalo() -> None:
    """Sem `carg[].nv` não há quociente nem cadeiras (RF-124) — nem faixa."""
    zonas = _redutos(20)
    uf = _uf(zonas)
    assert (
        intervalo_de_cadeiras(
            zonas=zonas,
            entrada_uf=uf,
            cadeiras_ponto={},
            lugares_a_preencher=0,
            seed=1,
        )
        is None
    )


# ---------------------------------------------------------------------------
# A guarda que mantém ponto e intervalo falando da mesma corrida
# ---------------------------------------------------------------------------


def test_decomposicao_que_nao_soma_a_uf_nao_publica_intervalo(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Perder uma zona no caminho é o modo de falha desta base desde a
    migration 0006: o número sai plausível, menor, e sem erro nenhum.

    Aqui ele sairia como uma faixa em torno de uma corrida que não é a da tela.
    A guarda compara, linha a linha, a soma das zonas com o voto da UF de que o
    ponto saiu — e recusa publicar quando divergem.
    """
    zonas = _redutos(6)
    uf = _uf(zonas)
    ponto = distribuir_cadeiras(uf.agremiacoes, 10)

    with caplog.at_level("INFO"):
        faltando = intervalo_de_cadeiras(
            zonas=zonas[:-1],  # uma zona sumiu entre a soma e o sorteio
            entrada_uf=uf,
            cadeiras_ponto=ponto.cadeiras,
            lugares_a_preencher=10,
            seed=1,
        )

    assert faltando is None
    # O log sai em JSON-line com escape de não-ASCII (mesmo formato de
    # `zona_merge`), então a asserção pega o trecho ASCII da mensagem.
    assert "intervalo omitido" in caplog.text


def test_agremiacao_presente_so_na_zona_nao_publica_intervalo() -> None:
    """Se a soma da UF não conhece uma agremiação que a zona conhece, o voto
    dela sumiria do sorteio em silêncio. Melhor nenhuma faixa."""
    zonas = _redutos(6)
    uf = _uf(zonas)
    ponto = distribuir_cadeiras(uf.agremiacoes, 10)
    zonas[0] = _zona([*zonas[0].agremiacoes, _agr("99", 10, [(990, 100)])])

    assert (
        intervalo_de_cadeiras(
            zonas=zonas,
            entrada_uf=uf,
            cadeiras_ponto=ponto.cadeiras,
            lugares_a_preencher=10,
            seed=1,
        )
        is None
    )


# ---------------------------------------------------------------------------
# Nacional — soma de réplicas, nunca soma de percentis
# ---------------------------------------------------------------------------


def test_a_bancada_soma_replicas_e_nao_percentis() -> None:
    """A soma dos percentis não é o percentil da soma.

    Duas UFs independentes com a mesma incerteza não somam a incerteza: a
    chance de as duas errarem para o mesmo lado é menor que a de uma errar. A
    faixa nacional tem de sair MAIS ESTREITA que a soma das faixas estaduais —
    somar `[baixo, alto]` daria uma faixa larga e errada, e a tela mostraria
    uma Câmara indefinida onde há um resultado.
    """
    _, ponto_a, a = _calcular(_redutos(6), seed=11)
    _, ponto_b, b = _calcular(_redutos(6), seed=22)

    nacional = intervalo_nacional([(a, ponto_a.cadeiras), (b, ponto_b.cadeiras)])

    soma_das_faixas = sum(
        (a.por_agremiacao[cod][1] - a.por_agremiacao[cod][0])
        + (b.por_agremiacao[cod][1] - b.por_agremiacao[cod][0])
        for cod in nacional
    )
    largura_nacional = sum(alto - baixo for baixo, alto in nacional.values())
    assert largura_nacional < soma_das_faixas

    for cod, (baixo, alto) in nacional.items():
        ponto_br = ponto_a.cadeiras[cod] + ponto_b.cadeiras[cod]
        assert baixo <= ponto_br <= alto, cod


def test_uf_sem_faixa_entra_na_bancada_como_constante() -> None:
    """Ela tem ponto publicado; o que falta é variância medida, não o número.

    Entra somando o ponto em todas as réplicas — e a consequência (a faixa
    nacional fica mais estreita do que seria com aquela UF medida) está
    registrada no docstring de `intervalo_nacional`.
    """
    _, ponto_a, a = _calcular(_redutos(6), seed=11)
    constante = {"10": 3, "20": 2, "30": 1}

    so_a = intervalo_nacional([(a, ponto_a.cadeiras)])
    com_constante = intervalo_nacional([(a, ponto_a.cadeiras), (None, constante)])

    for cod, (baixo, alto) in so_a.items():
        assert com_constante[cod] == (baixo + constante[cod], alto + constante[cod])


def test_agremiacao_so_em_uf_sem_faixa_nao_ganha_faixa_nacional() -> None:
    """`[n, n]` para quem não foi medido seria firmeza inventada."""
    _, ponto_a, a = _calcular(_redutos(6), seed=11)
    nacional = intervalo_nacional([(a, ponto_a.cadeiras), (None, {"77": 4})])

    assert "77" not in nacional
    assert set(nacional) == set(a.por_agremiacao)


def test_sem_nenhuma_uf_medida_a_bancada_sai_sem_faixa() -> None:
    assert intervalo_nacional([(None, {"10": 3})]) == {}
    assert intervalo_nacional([]) == {}
