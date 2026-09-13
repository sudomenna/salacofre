"""Intervalo de cadeiras por bootstrap de zonas — RF-127, a metade que faltava.

`deputado_payload._marcar_indefinidas` já publica a outra metade de RF-127 (qual
cadeira ainda depende de sobra indefinida). O que faltava é o **intervalo**: a
faixa de cadeiras que cada agremiação ocuparia se o recorte geográfico já
apurado tivesse saído um pouco diferente.

O obstáculo nunca foi custo (design 017 D7: 11 s para 1.000 resamples × 27 UFs,
contra `maxDuration` de 60 s). Era a **unidade de reamostragem**: até o
[ADR-0036](../../docs/architecture/adrs/0036-deputado-federal-granularidade-zona-fatiada.md)
o cargo 6 era ingerido em granularidade UF — um arquivo por UF, `k_a = 1`, mil
réplicas idênticas e um IC de largura zero, que é artefato de amostra única e
não intervalo (constituição § 6). Desde 2026-09-13 o cargo 6 é ingerido no par
(município, zona): 2.644 zonas distintas no país, média de 97,9 por UF.

## O desenho, em uma frase

Um **único** vetor de índices de zona por UF, sorteado uma vez, reamostra
**todas** as agremiações, **todos** os candidatos e o **voto de legenda** de
cada agremiação; cada réplica passa inteira por `distribuir_cadeiras`; o
intervalo é o percentil das contagens resultantes.

### Por que um `idx` só (e não um por agremiação)

É o mesmo padrão de `extrapolation.py:264-265` — "um ÚNICO bootstrap por UF (não
um por candidato, não um por base)", docstring daquele módulo em `:69-75`.
Sorteios independentes por agremiação produziriam réplicas em que as
agremiações não somam o mesmo eleitorado: o quociente eleitoral da réplica
deixaria de ser comparável entre elas, os shares não fechariam em 1, e o
intervalo resultante não descreveria nenhum mundo possível. Com um `idx` só,
cada réplica é **uma amostra coerente de zonas** — o mesmo conjunto de urnas
visto por todas as legendas, que é o que a aleatoriedade real (qual zona já
apurou) de fato produz.

`scripts/bench-deputado.py` perturba cada candidato de forma independente. Era
proxy de **custo** e o próprio script avisa disso (`:246-248`): não é o modelo,
e a forma dele não deve ser copiada.

### Por que `votos_legenda` entra no sorteio

Ele compõe `Agremiacao.votos_totais` (`cadeiras.py:79-82`) e portanto o
quociente partidário. Deixá-lo constante enquanto os nominais oscilam
produziria réplicas em que uma agremiação pequena mantém intacta a parcela que
mais pesa no seu quociente — encolhendo o intervalo exatamente onde ele deveria
ser maior.

### Chave: `agr[].n`, nunca `cand.n`

As linhas da matriz são indexadas por `(cod da agremiação, sqcand)`. O número de
urna se repete entre UFs e entre partidos no proporcional
(`deputado.py:101-112`): usá-lo funde candidatos distintos.

## Onde este intervalo é honesto, e onde não é

Ele mede **uma** fonte de incerteza: qual recorte de zonas já apurou. Ele **não**
mede o voto que ainda não foi contado — não há projeção de voto para o cargo 6
(design 017 D9: "o número central é voto apurado, não voto projetado"). Por isso
ele **não substitui** `cadeiras_indefinidas`, que é a marcação determinística da
cadeira marginal contra a fatia por apurar. Os dois convivem porque respondem a
perguntas diferentes, e a marcação sobrevive ao caso em que o intervalo é
omitido (ver `MIN_ZONAS_PARA_INTERVALO`) — que é justamente quando o dado está
pior. Ver `deputado_payload._marcar_indefinidas`.

Também não captura correlação entre UFs: o ADR-0006 já registra essa limitação
para o bootstrap dos majoritários, e ela vale igual aqui. A agregação nacional
(`intervalo_nacional`) soma réplicas de UFs independentes, que é a consequência
direta dessa premissa — não uma escolha nova.

## Determinismo (constituição § 6)

`np.random.default_rng(seed)` sempre; nunca `np.random.seed()` global. A seed é
responsabilidade do caller e segue a convenção de `project.py:1546-1552`
(`seed_base ^ sha256(f"{uf}:agremiacoes")`).
"""

from __future__ import annotations

import json
import logging
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

from api.model.cadeiras import Agremiacao, Candidato, distribuir_cadeiras
from api.model.deputado import EntradaProporcional

# ---------------------------------------------------------------------------
# Logging — JSON-line, espelha `_log` de project.py (importar de lá seria
# circular: project.py importa este módulo).
# ---------------------------------------------------------------------------

_logger = logging.getLogger("api.model.cadeiras_bootstrap")
if not _logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(message)s"))
    _logger.addHandler(_h)
    _logger.setLevel(logging.INFO)


def _log(level: str, msg: str, **ctx: object) -> None:
    _logger.info(json.dumps({"level": level, "msg": msg, **ctx}, default=str))


# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

#: Réplicas por UF. 1.000 é o número do ADR-0006, usado em todo o resto do
#: modelo (`extrapolation.py`, `turnout.py`, `bootstrap.py`) — não há motivo
#: para o cargo 6 divergir, e divergir sem motivo tornaria os intervalos de
#: cargos diferentes incomparáveis entre si na mesma tela.
N_RESAMPLES_CADEIRAS = 1000

#: Mínimo de zonas **com voto** para que o intervalo seja publicado.
#:
#: **Dois é o limiar, e ele é deliberadamente o menor possível.** Com uma única
#: unidade de reamostragem existe exatamente **uma** réplica possível: as 1.000
#: saem idênticas e o IC fecha num ponto. Isso não é um intervalo estreito, é a
#: ausência de intervalo com aparência de certeza — exatamente o diagnóstico
#: que tirou o Senador de granularidade UF em 11/09 e o Deputado em 13/09
#: (ADR-0036, Contexto). Com duas unidades já há 3 réplicas distintas; com 8
#: (Roraima, a menor UF do país) há 6.435.
#:
#: O que este limiar NÃO é: um piso de representatividade. O ADR-0036 registra
#: em "Consequências — Negativas" que o intervalo sai **mais largo** em RR (8
#: zonas), AC (9), AP (10) e DF (19) que em SP (394) ou MG (304), e que isso é
#: **estatisticamente correto**, não defeito: um estado pequeno tem mesmo mais
#: incerteza residual num bootstrap de zonas. Esconder o intervalo dessas UFs
#: substituiria uma faixa larga e verdadeira por um número sem faixa, que o
#: leitor leria como mais firme. Elevar este limiar é decisão de produto e
#: precisa passar pelo usuário.
#:
#: Na prática o limiar só exclui um caso, e é o caso para o qual ele existe: o
#: interruptor de emergência `TSE_DEPUTADO_GRANULARIDADE=uf`
#: (`lib/tse/targets.ts::getGranularidade`) devolve o cargo a uma linha
#: sentinela `cod_zona = 0` por UF — e, no começo da noite, a UF em que só uma
#: zona reportou até agora.
MIN_ZONAS_PARA_INTERVALO = 2

#: IC95, os mesmos percentis do resto do modelo (`extrapolation.py:390-391`).
PERCENTIL_INFERIOR = 2.5
PERCENTIL_SUPERIOR = 97.5


# ---------------------------------------------------------------------------
# Saída
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class IntervaloCadeiras:
    """Intervalo de cadeiras de uma UF, e as réplicas que o produziram.

    `por_agremiacao` é o que vai ao payload (`cadeiras_ci95`, design D5/D6).
    `resamples` fica para a agregação nacional: somar percentis de UF seria
    errado (a soma dos percentis não é o percentil da soma), então o nacional
    soma as **réplicas** e só depois toma o percentil — ver `intervalo_nacional`.
    """

    por_agremiacao: dict[str, tuple[int, int]]
    resamples: dict[str, np.ndarray]
    n_zonas: int
    n_resamples: int


# ---------------------------------------------------------------------------
# Matriz voto × zona
# ---------------------------------------------------------------------------


#: Uma agremiação achatada para a matriz: `(cod, linha do voto de legenda,
#: ((sqcand, linha do voto nominal, nascimento), ...))`.
_PlanoAgremiacao = tuple[str, int, tuple[tuple[int, int, int | None], ...]]


def zonas_com_voto(zonas: Sequence[EntradaProporcional]) -> list[EntradaProporcional]:
    """As zonas que têm algum voto válido — as únicas que entram no sorteio.

    Uma zona presente no banco com zero voto reportou o envelope mas não apurou
    nada. Incluí-la não muda a média das réplicas (o bootstrap é não-viesado na
    soma), mas acrescenta variância que não vem de informação nenhuma: o
    intervalo ficaria mais largo porque uma urna vazia foi sorteada duas vezes.
    É o espelho de `extrapolation._is_apurada`, que também só reamostra zona
    apurada.
    """
    return [z for z in zonas if any(a.votos_totais > 0 for a in z.agremiacoes)]


def _montar_matriz(
    zonas: Sequence[EntradaProporcional], entrada_uf: EntradaProporcional
) -> tuple[np.ndarray, list[_PlanoAgremiacao]] | None:
    """Matriz `(linha de voto) × (zona)` + o plano para remontar as agremiações.

    A identidade e a ORDEM vêm de `entrada_uf`, não das zonas: é o mesmo objeto
    de que saiu o ponto central publicado, então a réplica "identidade" (cada
    zona sorteada exatamente uma vez) reproduz o ponto por construção, e não por
    coincidência de dois caminhos de cálculo.

    Devolve `None` quando a soma das zonas **não** reproduz os votos da UF — o
    sinal de que a decomposição perdeu (ou duplicou) uma linha. Nesse caso não
    existe intervalo honesto a publicar: ele descreveria uma corrida diferente
    da que está na tela.
    """
    linha_legenda: dict[str, int] = {}
    linha_cand: dict[tuple[str, int], int] = {}
    plano: list[_PlanoAgremiacao] = []

    proxima = 0
    for agremiacao in entrada_uf.agremiacoes:
        linha_legenda[agremiacao.cod] = proxima
        i_legenda = proxima
        proxima += 1
        cands: list[tuple[int, int, int | None]] = []
        for cand in agremiacao.candidatos:
            linha_cand[(agremiacao.cod, cand.cod)] = proxima
            cands.append((cand.cod, proxima, cand.nascimento))
            proxima += 1
        plano.append((agremiacao.cod, i_legenda, tuple(cands)))

    k = len(zonas)
    # float64, não int64: o produto `M @ counts.T` cai no BLAS em float e num
    # laço C ingênuo em int (ordens de grandeza mais lento). A conta é EXATA
    # nesta faixa — voto × contagem de sorteios ≤ ~1e6 × 400 = 4e8, somado
    # sobre ~400 zonas dá ~1,6e11, muito abaixo dos 2^53 ≈ 9e15 em que o
    # float64 deixa de representar inteiro exato. `np.rint` fecha a volta.
    matriz = np.zeros((proxima, k), dtype=np.float64)
    for j, zona in enumerate(zonas):
        for agremiacao in zona.agremiacoes:
            i = linha_legenda.get(agremiacao.cod)
            if i is None:
                # Agremiação vista numa zona e ausente da soma da UF é
                # impossível (a UF É a soma) — mas descartar em silêncio seria
                # perder voto, então sinalizamos e abortamos o intervalo.
                _log(
                    "error",
                    "bootstrap de cadeiras: agremiação da zona ausente na soma da UF",
                    cod=agremiacao.cod,
                )
                return None
            matriz[i, j] += agremiacao.votos_legenda
            for cand in agremiacao.candidatos:
                i_cand = linha_cand.get((agremiacao.cod, cand.cod))
                if i_cand is None:
                    _log(
                        "error",
                        "bootstrap de cadeiras: candidato da zona ausente na soma da UF",
                        cod=agremiacao.cod,
                        sqcand=cand.cod,
                    )
                    return None
                matriz[i_cand, j] += cand.votos_nominais

    # A invariante que mantém ponto e intervalo falando da mesma corrida: a
    # soma das zonas é, linha a linha, o voto da UF já publicado.
    esperado = np.zeros(proxima, dtype=np.float64)
    for agremiacao in entrada_uf.agremiacoes:
        esperado[linha_legenda[agremiacao.cod]] = agremiacao.votos_legenda
        for cand in agremiacao.candidatos:
            esperado[linha_cand[(agremiacao.cod, cand.cod)]] = cand.votos_nominais
    if not np.array_equal(matriz.sum(axis=1), esperado):
        _log(
            "error",
            "bootstrap de cadeiras: decomposição por zona não soma a entrada da UF "
            "— intervalo omitido",
            n_zonas=k,
            n_linhas=int(proxima),
        )
        return None

    return matriz, plano


# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------


def intervalo_de_cadeiras(
    *,
    zonas: Sequence[EntradaProporcional],
    entrada_uf: EntradaProporcional,
    cadeiras_ponto: dict[str, int],
    lugares_a_preencher: int,
    seed: int,
    n_resamples: int = N_RESAMPLES_CADEIRAS,
) -> IntervaloCadeiras | None:
    """IC95 de cadeiras por agremiação numa UF (RF-127).

    Args:
        zonas: a decomposição da UF em zonas — uma `EntradaProporcional` por
            `(uf, cod_zona)`, já somada dos pares `(município, zona)` daquela
            zona. **Não** é a entrada da UF fatiada de novo: é a mesma leitura
            de envelope de que a soma saiu, guardada antes de somar.
        entrada_uf: a soma das zonas, exatamente o objeto de que o ponto central
            publicado foi calculado.
        cadeiras_ponto: `ResultadoCadeiras.cadeiras` da UF — o número já
            publicado. Entra aqui só para garantir que o intervalo o contenha.
        lugares_a_preencher: `carg[].nv`. Propriedade da circunscrição, **não**
            reamostrada: o número de cadeiras da UF não depende de qual zona
            apurou.
        seed: determinística, derivada pelo caller de `(uf, "agremiacoes")` —
            convenção de `project.py:1546-1552`.
        n_resamples: 1.000 (ADR-0006).

    Returns:
        `None` quando não há intervalo honesto a publicar — menos de
        `MIN_ZONAS_PARA_INTERVALO` zonas com voto, `lugares_a_preencher < 1`, ou
        decomposição que não soma a UF. `cadeiras_ci95` é opcional no contrato
        (design D5/D6) exatamente para que a ausência seja dizível: publicar
        `[n, n]` afirmaria uma precisão que a amostra não tem.
    """
    if lugares_a_preencher < 1:
        return None

    apuradas = zonas_com_voto(zonas)
    if len(apuradas) < MIN_ZONAS_PARA_INTERVALO:
        return None

    montado = _montar_matriz(apuradas, entrada_uf)
    if montado is None:
        return None
    matriz, plano = montado

    k = len(apuradas)
    rng = np.random.default_rng(seed)
    # O `idx` do bootstrap: UM sorteio de zonas por UF, compartilhado por todas
    # as agremiações e por todos os candidatos. Mesma forma de
    # `extrapolation.py:264-265`.
    idx = rng.integers(0, k, size=(n_resamples, k))

    # `contagens[r, j]` = quantas vezes a zona `j` saiu na réplica `r`. A soma
    # reamostrada de uma linha é `matriz[linha] · contagens[r]` — montar a
    # matriz de contagens e multiplicar uma vez é o mesmo resultado de indexar
    # `matriz[:, idx[r]].sum(axis=1)` réplica a réplica, sem materializar um
    # tensor (linhas × réplicas × zonas) que não cabe na memória de SP.
    plano_linear = (np.arange(n_resamples)[:, None] * k + idx).ravel()
    contagens = (
        np.bincount(plano_linear, minlength=n_resamples * k)
        .reshape(n_resamples, k)
        .astype(np.float64)
    )
    totais = np.rint(matriz @ contagens.T).astype(np.int64)

    cods = [cod for cod, _, _ in plano]
    saida = np.zeros((len(cods), n_resamples), dtype=np.int64)
    for r in range(n_resamples):
        # `.tolist()` uma vez por réplica: converter escalar numpy a int dentro
        # do laço interno custa mais que a redistribuição em si.
        votos = totais[:, r].tolist()
        replica = [
            Agremiacao(
                cod=cod,
                votos_legenda=votos[i_legenda],
                candidatos=tuple(
                    Candidato(cod=sq, votos_nominais=votos[i], nascimento=nasc)
                    for sq, i, nasc in cands
                ),
            )
            for cod, i_legenda, cands in plano
        ]
        cadeiras = distribuir_cadeiras(replica, lugares_a_preencher).cadeiras
        saida[:, r] = [cadeiras.get(cod, 0) for cod in cods]

    por_agremiacao: dict[str, tuple[int, int]] = {}
    resamples: dict[str, np.ndarray] = {}
    for i, cod in enumerate(cods):
        linha = saida[i]
        resamples[cod] = linha
        por_agremiacao[cod] = _percentis(linha, cadeiras_ponto.get(cod, 0))

    return IntervaloCadeiras(
        por_agremiacao=por_agremiacao,
        resamples=resamples,
        n_zonas=k,
        n_resamples=n_resamples,
    )


def _percentis(replicas: np.ndarray, ponto: int) -> tuple[int, int]:
    """Percentis 2,5 / 97,5 de uma contagem discreta, contendo o ponto.

    Duas correções sobre o percentil cru, e nenhuma das duas estreita a faixa:

    1. **Piso para baixo, teto para cima.** `np.percentile` interpola
       linearmente e devolve 10,4 cadeiras. Arredondar para o mais próximo
       encolheria o intervalo em até meia cadeira de cada lado; `floor`/`ceil`
       o mantêm cobrindo tudo que as réplicas produziram.
    2. **O ponto publicado entra na faixa.** Uma faixa que não contém o número
       que está impresso ao lado dela é uma contradição na mesma tela. Pode
       acontecer com contagem discreta e distribuição assimétrica (a agremiação
       ganha a cadeira no dado real e a perde em mais de 97,5% das réplicas), e
       nesse caso a faixa se estende até o ponto em vez de o ponto se mover: o
       ponto é o dado apurado, o intervalo é a inferência.
    """
    baixo = int(np.floor(np.percentile(replicas, PERCENTIL_INFERIOR)))
    alto = int(np.ceil(np.percentile(replicas, PERCENTIL_SUPERIOR)))
    return min(baixo, ponto), max(alto, ponto)


# ---------------------------------------------------------------------------
# Agregação nacional — soma de réplicas, nunca soma de percentis
# ---------------------------------------------------------------------------


def intervalo_nacional(
    contribuicoes: Sequence[tuple[IntervaloCadeiras | None, dict[str, int]]],
) -> dict[str, tuple[int, int]]:
    """IC95 da **bancada** por agremiação — soma das UFs (design D3/D5).

    Args:
        contribuicoes: uma entrada por UF calculada, `(intervalo, cadeiras)`.
            `intervalo` é `None` quando aquela UF não tem faixa própria (menos
            de `MIN_ZONAS_PARA_INTERVALO` zonas); `cadeiras` é sempre o ponto da
            UF (`ResultadoCadeiras.cadeiras`).

    Somar as faixas das UFs daria a faixa errada — a soma dos percentis não é o
    percentil da soma, e o resultado seria absurdamente largo. O que se soma são
    as **réplicas**: a réplica `r` do Brasil é a soma das réplicas `r` das 27
    UFs. Os sorteios de UFs diferentes são independentes por construção (seeds
    distintas), então essa soma é uma amostra Monte Carlo legítima do total,
    sob a mesma premissa de independência entre UFs que o ADR-0006 já assume
    para os majoritários.

    **UF sem faixa própria entra como constante** — o seu ponto, repetido em
    todas as réplicas. É a leitura honesta do que ela é: uma UF de que não
    medimos variância nenhuma, não uma UF de variância zero. A consequência
    (a faixa nacional é mais estreita do que seria com aquela UF medida) fica
    registrada aqui e vale enquanto ela existir — que é o começo da noite e o
    modo de emergência.

    Uma agremiação que **só** aparece em UFs sem faixa não recebe faixa
    nacional: `[n, n]` ali seria firmeza inventada, não medida.
    """
    n_resamples = 0
    for intervalo, _ in contribuicoes:
        if intervalo is not None:
            n_resamples = intervalo.n_resamples
            break
    if n_resamples < 1:
        return {}

    acumulado: dict[str, np.ndarray] = {}
    ponto_br: dict[str, int] = {}
    medida: set[str] = set()

    for intervalo, cadeiras in contribuicoes:
        for cod, n in cadeiras.items():
            ponto_br[cod] = ponto_br.get(cod, 0) + n
            vetor = acumulado.get(cod)
            if vetor is None:
                vetor = np.zeros(n_resamples, dtype=np.int64)
                acumulado[cod] = vetor
            replicas = intervalo.resamples.get(cod) if intervalo is not None else None
            if replicas is None:
                vetor += n
            else:
                vetor += replicas
                medida.add(cod)

    return {
        cod: _percentis(acumulado[cod], ponto_br[cod])
        for cod in sorted(medida)
    }
