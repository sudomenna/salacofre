"""Conversão de votos em cadeiras na eleição proporcional (ADR-0027, spec 017 RF-123 a RF-126).

Implementa o algoritmo do Código Eleitoral (Lei 4.737/1965) arts. 106–112, na
redação da Lei 14.211/2021, tal como regulamentado pela Res.-TSE 23.677/2021
(redação das Res. 23.734/2024 e 23.748/2026) e **tal como o STF o reinterpretou**
nas ADIs 7228/7263/7325 (mérito em 28/02/2024).

## Três decisões deste módulo que não são óbvias

**1. Aritmética exata, nunca ponto flutuante.** O arredondamento do quociente
eleitoral e o desempate de médias são comparações em que um erro de 1e-15 muda
uma cadeira. O quociente usa `divmod` sobre inteiros; as médias usam
`fractions.Fraction`, cuja comparação é exata. A constituição § 6 exige
determinismo, e "determinístico dentro do erro do float" não é determinístico
quando o resultado é discreto.

**2. `cadeiras` e `vagas_obtidas` são grandezas DIFERENTES** (ADR-0027, caso de
borda 2b). `vagas_obtidas` é o denominador da média e conta o quociente
partidário **inteiro**, ainda que não preenchido (Res. art. 11 § 5º, fundamento
ADI 5.420/2015). `cadeiras` é quantos candidatos de fato ocuparam vaga. Divergem
quando o partido tem quociente para mais cadeiras do que candidatos acima dos 10%
do QE — e `Σ cadeiras` fecha em `lugares_a_preencher`, enquanto `Σ vagas_obtidas`
legitimamente pode excedê-lo. Exibir a segunda na tela põe cadeira a mais.

**3. O art. 111 NÃO é implementado.** "Se nenhum partido alcançar o quociente
eleitoral, considerar-se-ão eleitos os candidatos mais votados" foi declarado
inconstitucional. Quando nenhum partido atinge o QE, este módulo simplesmente
segue para a fase de médias com `vagas_obtidas = 0` para todos — que é o que o
art. 12-A da Res. 23.677/2021 manda.

## Fora de escopo

Coligação em proporcional é vedada desde 2020 (CF art. 17 § 1º, EC 97/2017) e
este módulo não a modela. Federação é modelada como **uma** agremiação, porque é
o que ela é para todos os efeitos eleitorais (Lei 9.096 art. 11-A; Lei 9.504
art. 6º-A) — quem monta a entrada é responsável por já ter somado os partidos
que a compõem.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from fractions import Fraction

# ---------------------------------------------------------------------------
# Entrada
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Candidato:
    """Um candidato da lista de uma agremiação.

    `nascimento` entra como inteiro comparável (ex.: `19701231` no formato
    AAAAMMDD) só para o desempate do art. 110 — "haver-se-á por eleito o
    candidato mais idoso". `None` significa data desconhecida: nesse caso o
    desempate cai para o código do candidato, de forma estável e **declarada**,
    nunca arbitrária. Ver `_ordenar_candidatos`.
    """

    cod: int
    votos_nominais: int
    nascimento: int | None = None


@dataclass(frozen=True)
class Agremiacao:
    """Partido isolado ou federação — para o cálculo, a mesma coisa.

    `votos_legenda` são os votos dados à sigla sem nomear candidato (`v.vl` do
    EA20). Eles entram nos votos válidos da agremiação e no quociente partidário,
    mas **não** elegem ninguém diretamente.
    """

    cod: str
    votos_legenda: int
    candidatos: tuple[Candidato, ...]

    @property
    def votos_totais(self) -> int:
        """Votos válidos da agremiação: nominais + legenda (art. 107)."""
        return self.votos_legenda + sum(c.votos_nominais for c in self.candidatos)


# ---------------------------------------------------------------------------
# Saída
# ---------------------------------------------------------------------------


@dataclass
class ResultadoCadeiras:
    """Saída do cálculo.

    Atenção ao par `cadeiras` / `vagas_obtidas` — ver o item 2 do docstring do
    módulo. **A tela usa `cadeiras`.**
    """

    quociente_eleitoral: int
    quociente_partidario: dict[str, int]
    #: Candidatos eleitos por agremiação, na ordem em que ocuparam a vaga.
    eleitos: dict[str, list[Candidato]]
    #: Cadeiras efetivamente ocupadas. Σ == `lugares_a_preencher`. É o que vai à tela.
    cadeiras: dict[str, int]
    #: Denominador da média (QP inteiro + sobras ganhas). Σ pode exceder o total.
    vagas_obtidas: dict[str, int]
    #: Não eleitos da mesma legenda, em ordem de suplência (art. 112).
    suplentes: dict[str, list[Candidato]]
    #: Vagas que sobraram sem ninguém a quem atribuir (listas esgotadas).
    vagas_nao_preenchidas: int = 0
    #: Desempates que a norma não resolve — exibir como indeterminado, nunca escolher.
    empates_indeterminados: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Quociente eleitoral — art. 106
# ---------------------------------------------------------------------------


def quociente_eleitoral(votos_validos: int, lugares_a_preencher: int) -> int:
    """QE = votos válidos ÷ lugares, com o arredondamento LITERAL do art. 106.

    "desprezada a fração se igual ou inferior a meio, equivalente a um, se
    superior" — ou seja, **0,5 exato DESCE**. `round()` de Python arredonda
    0,5 para o par mais próximo (banker's rounding) e `round(x + 0.5)` arredonda
    para cima: os dois erram, em direções diferentes, no mesmo caso.

    A comparação é feita em inteiros (`2 * resto > lugares` ⟺ `fração > 0,5`)
    para que não exista erro de representação: com `float`, uma fração que é
    exatamente 0,5 na matemática pode virar 0,49999999999999994.

    Args:
        votos_validos: nominais + legenda de todas as agremiações. Brancos e
            nulos **não** entram (Lei 9.504 art. 5º; Res. 23.677 art. 9º p.ú.).
        lugares_a_preencher: cadeiras da circunscrição. Vem do dado do TSE,
            nunca de tabela embutida (spec 017 RF-124).

    Raises:
        ValueError: se `lugares_a_preencher` < 1.
    """
    if lugares_a_preencher < 1:
        raise ValueError(f"lugares_a_preencher deve ser >= 1, recebido {lugares_a_preencher}")
    if votos_validos < 0:
        raise ValueError(f"votos_validos não pode ser negativo: {votos_validos}")

    inteiro, resto = divmod(votos_validos, lugares_a_preencher)
    # fração > 1/2  ⟺  resto/lugares > 1/2  ⟺  2*resto > lugares
    return inteiro + 1 if 2 * resto > lugares_a_preencher else inteiro


# ---------------------------------------------------------------------------
# Ordenação de candidatos — arts. 108 e 110
# ---------------------------------------------------------------------------


def _ordenar_candidatos(candidatos: tuple[Candidato, ...]) -> list[Candidato]:
    """Ordem de ocupação de vaga: mais votos primeiro; empate → mais idoso.

    Art. 110: "Em caso de empate, haver-se-á por eleito o candidato mais idoso."
    Mais idoso = menor `nascimento` (data anterior).

    Candidato sem data conhecida vai para o fim do empate, e o desempate final é
    o código — determinístico e declarado. A alternativa (ordem de chegada do
    dado) faria o resultado depender de como o TSE serializou o JSON, o que
    violaria a constituição § 6.
    """
    return sorted(
        candidatos,
        key=lambda c: (
            -c.votos_nominais,
            c.nascimento if c.nascimento is not None else 99999999,
            c.cod,
        ),
    )


def _media(votos: int, vagas_obtidas: int) -> Fraction:
    """Média do art. 109 I: votos ÷ (lugares já obtidos + 1). Exata."""
    return Fraction(votos, vagas_obtidas + 1)


# ---------------------------------------------------------------------------
# Algoritmo — ADR-0027
# ---------------------------------------------------------------------------


def distribuir_cadeiras(
    agremiacoes: list[Agremiacao],
    lugares_a_preencher: int,
) -> ResultadoCadeiras:
    """Distribui as cadeiras de uma circunscrição (UF) entre as agremiações.

    Fases, na ordem do ADR-0027:

      0. Quociente eleitoral (art. 106).
      1. Quociente partidário e vagas diretas, com a cláusula dos 10% do QE por
         candidato (arts. 107 e 108).
      2. Sobras restritas: só agremiações com ≥80% do QE e com candidato não
         eleito com ≥20% do QE (art. 109 I/II + § 2º).
      3. Sobras abertas: quando a fase 2 se esgota, **todos** participam, sem
         piso algum (art. 109 III na interpretação conforme das ADIs 7228/7263/
         7325; Res. 23.677 art. 11 § 4º).

    O caso "nenhuma agremiação atinge o QE" não tem tratamento especial: todos
    entram na fase 2 com `vagas_obtidas = 0` e o algoritmo de médias distribui
    tudo — que é o que manda o art. 12-A. O art. 111 **não** é implementado.

    Raises:
        ValueError: `lugares_a_preencher` < 1, ou códigos de agremiação repetidos.
    """
    if lugares_a_preencher < 1:
        raise ValueError(f"lugares_a_preencher deve ser >= 1, recebido {lugares_a_preencher}")
    cods = [a.cod for a in agremiacoes]
    if len(set(cods)) != len(cods):
        raise ValueError(
            "código de agremiação repetido — federação deve entrar como UMA linha, "
            f"com os partidos já somados: {sorted(cods)}"
        )

    votos = {a.cod: a.votos_totais for a in agremiacoes}
    votos_validos = sum(votos.values())

    qe = quociente_eleitoral(votos_validos, lugares_a_preencher)

    eleitos: dict[str, list[Candidato]] = {a.cod: [] for a in agremiacoes}
    vagas_obtidas: dict[str, int] = {a.cod: 0 for a in agremiacoes}
    qp: dict[str, int] = {a.cod: 0 for a in agremiacoes}
    empates: list[str] = []

    # Fila de candidatos por agremiação, já na ordem de ocupação.
    fila: dict[str, list[Candidato]] = {a.cod: _ordenar_candidatos(a.candidatos) for a in agremiacoes}
    posicao: dict[str, int] = {a.cod: 0 for a in agremiacoes}

    # QE == 0 só acontece com zero votos válidos: nada a distribuir.
    if qe < 1:
        return ResultadoCadeiras(
            quociente_eleitoral=qe,
            quociente_partidario=qp,
            eleitos=eleitos,
            cadeiras={c: 0 for c in votos},
            vagas_obtidas=vagas_obtidas,
            suplentes={c: list(fila[c]) for c in votos},
            vagas_nao_preenchidas=lugares_a_preencher,
        )

    piso_10 = Fraction(qe, 10)
    piso_20 = Fraction(qe, 5)
    piso_80 = Fraction(4 * qe, 5)

    # ── Fase 1 — quociente partidário (art. 107) e vagas diretas (art. 108) ──
    for a in agremiacoes:
        qp[a.cod] = votos[a.cod] // qe  # "desprezada a fração" = floor puro
        # `vagas_obtidas` recebe o QP INTEIRO, não o que for ocupado — é o
        # denominador da média (Res. art. 11 § 5º, ADI 5.420).
        vagas_obtidas[a.cod] = qp[a.cod]

        elegiveis = [c for c in fila[a.cod] if c.votos_nominais >= piso_10]
        for cand in elegiveis[: qp[a.cod]]:
            eleitos[a.cod].append(cand)

    ocupadas = sum(len(v) for v in eleitos.values())
    restantes = lugares_a_preencher - ocupadas

    def _proximo_nao_eleito(cod: str, piso: Fraction | None) -> Candidato | None:
        """Próximo da fila ainda não eleito, opcionalmente acima de um piso."""
        ja_eleitos = {c.cod for c in eleitos[cod]}
        for cand in fila[cod]:
            if cand.cod in ja_eleitos:
                continue
            if piso is not None and cand.votos_nominais < piso:
                continue
            return cand
        return None

    def _rodada(restrita: bool) -> bool:
        """Atribui UMA vaga. Devolve `False` quando não há candidato elegível."""
        piso_cand = piso_20 if restrita else None
        concorrentes: list[str] = []
        for a in agremiacoes:
            if restrita and votos[a.cod] < piso_80:
                continue
            if _proximo_nao_eleito(a.cod, piso_cand) is None:
                continue
            concorrentes.append(a.cod)
        if not concorrentes:
            return False

        melhor = max(
            concorrentes,
            key=lambda cod: (
                _media(votos[cod], vagas_obtidas[cod]),  # art. 109 I
                votos[cod],  # § 6º — maior votação total
                # § 7º — maior votação nominal do candidato que disputa a vaga
                (_proximo_nao_eleito(cod, piso_cand) or Candidato(0, 0)).votos_nominais,
            ),
        )

        # Empate que a norma NÃO resolve: mesma média, mesma votação total e
        # mesma votação nominal do candidato em disputa. Registrado para a tela
        # marcar como indeterminado (spec 017, open question 3) — nunca
        # escolhemos por critério inventado.
        chave_melhor = (
            _media(votos[melhor], vagas_obtidas[melhor]),
            votos[melhor],
            (_proximo_nao_eleito(melhor, piso_cand) or Candidato(0, 0)).votos_nominais,
        )
        empatados = [
            cod
            for cod in concorrentes
            if cod != melhor
            and (
                _media(votos[cod], vagas_obtidas[cod]),
                votos[cod],
                (_proximo_nao_eleito(cod, piso_cand) or Candidato(0, 0)).votos_nominais,
            )
            == chave_melhor
        ]
        if empatados:
            empates.append(
                f"vaga disputada em empate não resolvido pela norma entre "
                f"{sorted([melhor, *empatados])}"
            )

        cand = _proximo_nao_eleito(melhor, piso_cand)
        assert cand is not None  # garantido pelo filtro de `concorrentes`
        eleitos[melhor].append(cand)
        vagas_obtidas[melhor] += 1
        return True

    # ── Fase 2 — sobras restritas (80% / 20%) ──
    while restantes > 0 and _rodada(restrita=True):
        restantes -= 1

    # ── Fase 3 — sobras abertas (ADI 7228) ──
    while restantes > 0 and _rodada(restrita=False):
        restantes -= 1

    cadeiras = {cod: len(v) for cod, v in eleitos.items()}
    suplentes: dict[str, list[Candidato]] = {}
    for a in agremiacoes:
        ja = {c.cod for c in eleitos[a.cod]}
        # Art. 112 p.ú. — suplência NÃO exige votação nominal mínima.
        suplentes[a.cod] = [c for c in fila[a.cod] if c.cod not in ja]

    return ResultadoCadeiras(
        quociente_eleitoral=qe,
        quociente_partidario=qp,
        eleitos=eleitos,
        cadeiras=cadeiras,
        vagas_obtidas=vagas_obtidas,
        suplentes=suplentes,
        vagas_nao_preenchidas=restantes,
        empates_indeterminados=empates,
    )
