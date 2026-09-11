"""`p_eleito` — probabilidade de terminar entre as N vagas (RF-103, spec 016).

## Por que a função existe

O Senado renova 2/3 em 2026: são **2 vagas por UF**. `p_vitoria` responde "qual a
chance de liderar", que é a pergunta errada para este cargo — o que elege um
senador é estar entre os dois primeiros.

O tamanho do erro não é acadêmico. Com 1º em 40%, 2º em 30% e 3º em 29% (desvio
3pp), `p_vitoria` dá ao terceiro colocado **menos de 1%**; `p_eleito` com 2 vagas
dá **~41%**. Exibir o primeiro número numa tela de Senador é afirmar que a
disputa está resolvida quando ela é um cara ou coroa.

## Dois erros distintos, e qual teste pega cada um

**(a) Não contar por cenário.** Comparar cada candidato contra um limiar derivado
das distribuições marginais dos outros. A soma dos `p_eleito` deixa de fechar em
`vagas` — medido em 2026-09-11 num caso correlacionado: **1,9616** em vez de 2,0.
`test_soma_fecha_no_numero_de_vagas` pega isso.

**(b) Perder o pareamento entre candidatos.** Cada resample é um mundo coerente:
o mesmo `idx` sorteado alimenta todos os candidatos da UF
(`api/model/extrapolation.py`). Se os arrays forem embaralhados independentemente,
a aritmética por coluna continua fechando em `vagas` — **a soma NÃO pega este
erro**. O que pega é a correlação: com um choque comum entre candidatos, o
resultado muda (0,4340 → 0,4238 no terceiro colocado, mesma medição).
`test_pareamento_entre_candidatos_importa` é o que trava isso, e ele só
discrimina porque usa cenários correlacionados — com candidatos independentes,
embaralhar não muda nada e o teste não provaria coisa alguma.
"""

from __future__ import annotations

import numpy as np
import pytest

from api.model.p_vitoria import p_eleito, p_vitoria


def _cenarios(medias: dict[int, float], *, desvio: float = 3.0, n: int = 20_000, seed: int = 7):
    rng = np.random.default_rng(seed)
    return {cod: rng.normal(media, desvio, n) for cod, media in medias.items()}


def test_soma_fecha_no_numero_de_vagas() -> None:
    """A invariante que prova que a contagem é por cenário, não por marginal."""
    est = _cenarios({1: 40.0, 2: 30.0, 3: 29.0, 4: 5.0})

    for vagas in (1, 2, 3):
        soma = sum(p_eleito(est, vagas=vagas).values())
        assert soma == pytest.approx(float(vagas), abs=1e-9), f"vagas={vagas}"


def test_terceiro_colocado_proximo_nao_e_desprezivel() -> None:
    """O caso que motiva a função: 2º e 3º empatados dividem a segunda vaga."""
    est = _cenarios({1: 40.0, 2: 30.0, 3: 29.0})
    dois = p_eleito(est, vagas=2)

    # O líder está praticamente garantido...
    assert dois[1] > 0.98
    # ...e a segunda vaga é um cara ou coroa entre 2º e 3º.
    assert 0.3 < dois[3] < 0.5
    assert dois[2] + dois[3] == pytest.approx(1.0, abs=0.02)

    # Com p_vitoria (1º lugar), o mesmo terceiro colocado sumiria da tela.
    pv_terceiro = p_vitoria(est[3], np.maximum(est[1], est[2]))
    assert pv_terceiro < 0.02
    assert dois[3] > 20 * pv_terceiro


def test_vagas_1_concorda_com_p_vitoria_contra_o_melhor_adversario() -> None:
    est = _cenarios({1: 40.0, 2: 38.0, 3: 10.0})
    uma = p_eleito(est, vagas=1)

    esperado_lider = p_vitoria(est[1], np.maximum(est[2], est[3]))
    assert uma[1] == pytest.approx(esperado_lider, abs=1e-9)


def test_mais_vagas_que_candidatos_elege_todos() -> None:
    est = _cenarios({1: 40.0, 2: 30.0})
    assert p_eleito(est, vagas=5) == {1: 1.0, 2: 1.0}


def test_determinismo_bit_a_bit() -> None:
    """Constituição § 6 — mesma entrada, mesma saída, sem tolerância."""
    est = _cenarios({1: 40.0, 2: 30.0, 3: 29.0})
    assert p_eleito(est, vagas=2) == p_eleito(est, vagas=2)


def test_ordem_das_chaves_nao_muda_o_resultado() -> None:
    """A função não pode depender da ordem de iteração do dict de entrada."""
    est = _cenarios({1: 40.0, 2: 30.0, 3: 29.0})
    invertido = {cod: est[cod] for cod in reversed(list(est))}

    assert p_eleito(est, vagas=2) == p_eleito(invertido, vagas=2)


def test_empate_perfeito_divide_igualmente() -> None:
    """Dois candidatos idênticos disputando uma vaga: metade dos cenários cada.

    Usa arrays literalmente iguais para que o desempate seja o de `argpartition`
    — o teste documenta que a função NÃO inventa um critério de desempate.
    """
    base = _cenarios({1: 30.0})[1]
    est = {1: base, 2: base.copy(), 3: np.full_like(base, 5.0)}
    r = p_eleito(est, vagas=2)

    assert r[1] == 1.0 and r[2] == 1.0
    assert r[3] == 0.0


def test_rejeita_arrays_de_comprimentos_diferentes() -> None:
    """Pareamento é pré-requisito — mesma exigência de `p_vitoria`."""
    with pytest.raises(ValueError, match="comprimentos diferentes"):
        p_eleito({1: np.zeros(10), 2: np.zeros(11)}, vagas=2)


def test_rejeita_vagas_invalidas() -> None:
    est = _cenarios({1: 40.0, 2: 30.0})
    for vagas in (0, -1):
        with pytest.raises(ValueError, match="vagas deve ser"):
            p_eleito(est, vagas=vagas)


def test_entrada_vazia_e_sem_resamples() -> None:
    assert p_eleito({}, vagas=2) == {}
    assert p_eleito({1: np.array([]), 2: np.array([])}, vagas=2) == {1: 0.0, 2: 0.0}


def _cenarios_correlacionados(n: int = 20_000, seed: int = 7):
    """Cenários com choque COMUM, como os reais.

    Num replay verdadeiro os candidatos não se movem de forma independente: se a
    UF apura primeiro as zonas de uma região, todos os candidatos daquela região
    sobem juntos. É essa correlação que torna o pareamento observável — sem ela,
    embaralhar os arrays não mudaria resultado nenhum.
    """
    rng = np.random.default_rng(seed)
    choque = rng.normal(0.0, 4.0, n)
    return {
        1: 40.0 + choque + rng.normal(0.0, 1.0, n),
        2: 30.0 - choque + rng.normal(0.0, 1.0, n),
        3: 29.0 + rng.normal(0.0, 3.0, n),
        4: 5.0 + rng.normal(0.0, 1.0, n),
    }


def test_pareamento_entre_candidatos_importa() -> None:
    """Embaralhar cada array sozinho tem de MUDAR a resposta (erro (b) do topo).

    Este é o teste que a invariante da soma não faz: embaralhado, a soma continua
    fechando em 2,0 — o que muda são as probabilidades individuais, porque a
    correlação entre candidatos deixou de existir.
    """
    est = _cenarios_correlacionados()
    rng = np.random.default_rng(99)
    embaralhado = {cod: rng.permutation(v) for cod, v in est.items()}

    certo = p_eleito(est, vagas=2)
    sem_pareamento = p_eleito(embaralhado, vagas=2)

    # A soma sozinha não denuncia nada — por isso ela não basta.
    assert sum(sem_pareamento.values()) == pytest.approx(2.0, abs=1e-9)

    # Mas as probabilidades mudam: é isso que prova que o pareamento é lido.
    assert certo != sem_pareamento
    assert abs(certo[3] - sem_pareamento[3]) > 0.005


def test_contagem_marginal_nao_fecha_em_vagas() -> None:
    """Documenta a medição que justifica a invariante da soma (erro (a) do topo).

    Reproduz aqui a implementação ERRADA — cada candidato contra um limiar fixo
    das médias dos outros — e mostra que a soma foge de `vagas`. Se um dia
    alguém "simplificar" `p_eleito` nessa direção, é este número que denuncia.
    """
    est = _cenarios_correlacionados()

    def marginal(estimativas: dict[int, np.ndarray], vagas: int) -> dict[int, float]:
        out: dict[int, float] = {}
        for cod, amostras in estimativas.items():
            outros = [v for k, v in estimativas.items() if k != cod]
            limiar = np.sort([float(np.mean(o)) for o in outros])[-vagas]
            out[cod] = float(np.mean(amostras > limiar))
        return out

    soma_errada = sum(marginal(est, 2).values())
    assert abs(soma_errada - 2.0) > 0.01, (
        "a implementação marginal deixou de divergir — o teste da soma perdeu poder"
    )
    assert sum(p_eleito(est, vagas=2).values()) == pytest.approx(2.0, abs=1e-9)
