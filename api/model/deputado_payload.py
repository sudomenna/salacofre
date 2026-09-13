"""Do resultado de cadeiras para o payload publicado (spec 017, design D5/D6).

`cadeiras.py` distribui as vagas e `deputado.py` traduz o EA20 para a entrada
daquele cálculo. Este módulo faz o último trecho: monta os dois JSONs que a tela
consome — `EdgePayloadDeputado` (nacional, Global Config) e `DeputadoUfDetail`
(por UF, Vercel Blob). O contrato dos dois está em
`docs/specs/017-deputado-federal/design.md`, D5 e D6, e é **ele** que manda: não
há tipo TypeScript espelhado aqui, e o lado TS é escrito contra o mesmo
documento.

## Três coisas que este módulo se recusa a fazer

**1. Publicar `vagas_obtidas`** (D2 / RF-125.1). Nem com esse nome, nem com
outro. É o denominador da média (Res.-TSE 23.677 art. 11 § 5º, ADI 5.420) e
conta quociente partidário não preenchido: numa UF de 10 vagas, a soma dá 11.
`Σ agremiacoes[].cadeiras == lugares_a_preencher` é a invariante que sai daqui.

**2. Somar votos de legenda aos nominais em silêncio** (RF-130). Os dois números
saem separados e o total sai explícito; a tela decide o que mostrar, mas não
pode ser enganada pelo payload.

**3. Fingir firmeza que a apuração não tem** (RF-127). Cadeira ganha em rodada
de sobras, com a margem para a próxima agremiação menor que a fatia de votos
ainda não apurada, sai com `indefinido: true`. Ver `_marcar_indefinidas`.

## As duas metades de RF-127, e por que são duas

`cadeiras_ci95` (D5/D6) entrou em 2026-09-13, depois que o ADR-0036 moveu o
cargo 6 para granularidade de zona e deu ao bootstrap o que reamostrar. Ele é
**calculado fora daqui** (`api/model/cadeiras_bootstrap.py`) e chega pronto:
este módulo transporta, não sorteia — nada aqui consome RNG, e o payload
continua sendo função pura do que lhe entregam.

Ele **não** substitui `cadeiras_indefinidas`. São duas perguntas:

  - o **intervalo** responde "se o recorte de zonas já apuradas tivesse saído
    outro, quantas cadeiras esta agremiação teria?" — incerteza do que **já foi
    contado**;
  - a **marcação** responde "esta cadeira específica pode trocar de dono com o
    voto que **ainda falta** contar?" — e é determinística, em `Fraction`.

O intervalo não sabe nada do voto por vir (não há projeção de voto no cargo 6 —
D9), e a marcação não sabe nada de variância geográfica. Fundir as duas
apagaria uma das perguntas; derivar a marcação do intervalo a apagaria
justamente quando o intervalo é omitido (UF com menos de duas zonas apuradas,
ou o interruptor de emergência `TSE_DEPUTADO_GRANULARIDADE=uf`), que é quando o
dado está pior e o leitor mais precisa do aviso.
"""

from __future__ import annotations

from dataclasses import dataclass
from fractions import Fraction
from typing import Any

from api.model.cadeiras import Agremiacao, ResultadoCadeiras
from api.model.deputado import (
    Divergencia,
    EntradaProporcional,
    IdentidadeAgremiacao,
    IdentidadeCandidato,
)


def _pct(parte: int, total: int) -> float:
    """Percentual 0–100 com a mesma precisão do resto do payload (5 casas)."""
    if total <= 0:
        return 0.0
    return round(100.0 * parte / total, 5)


#: Valores possíveis de `divergencias[].o_que` no payload — conjunto FECHADO.
#:
#: A tela precisa rotular cada divergência para o leitor ("o quociente que
#: calculamos não bate com o do TSE"), e para isso ela mapeia esta chave para
#: uma frase. Um conjunto aberto obrigaria o outro lado a adivinhar strings
#: nossas: `conferir_contra_tse` produz `cadeiras[22]`, com o código da
#: agremiação embutido, o que gera uma chave nova por agremiação — e a chave
#: crua chegava à tela. Aqui ela é normalizada; o código da agremiação continua
#: visível, em `detalhe`.
#:
#: Acrescentar um valor aqui é mudança de contrato: combine com o lado TS antes.
CHAVES_DE_DIVERGENCIA = ("quociente_eleitoral", "cadeiras")

#: Quantos suplentes por agremiação entram no payload de UF (D6). A lista
#: completa de não eleitos de uma federação grande passa de 100 nomes numa UF
#: como SP — e o payload por UF já é a maior carga do produto (RNF-007a).
MAX_SUPLENTES = 5


def normalizar_divergencia(divergencia: Divergencia) -> dict[str, Any]:
    """`Divergencia` → a linha do payload, com `o_que` numa chave fechada.

    `conferir_contra_tse` nomeia a divergência de cadeiras como
    `cadeiras[<cod>]`, o que é ótimo em log e ruim em contrato: a tela recebe
    uma chave diferente por agremiação e não tem como mapeá-la para uma frase.
    A chave vira `"cadeiras"` e o código vai para `detalhe`, onde a tela já
    mostra texto.

    Chave desconhecida (alguém acrescentou uma comparação em `deputado.py` e
    esqueceu deste mapa) passa adiante como está, e não some: a divergência
    perdida seria pior que uma chave que a tela não sabe rotular.
    """
    o_que = divergencia.o_que
    detalhe = divergencia.detalhe
    if o_que.startswith("cadeiras["):
        cod = o_que[len("cadeiras[") : -1]
        o_que = "cadeiras"
        detalhe = f"agremiação {cod} — {detalhe}" if detalhe else f"agremiação {cod}"
    return {
        "o_que": o_que,
        "nosso": divergencia.nosso,
        "tse": divergencia.tse,
        "detalhe": detalhe,
    }


@dataclass(frozen=True)
class UfProporcional:
    """Uma UF pronta para virar payload.

    `resultado is None` significa "não deu para calcular" — sem
    `lugares_a_preencher` publicado não há quociente eleitoral, e inventar o
    denominador corromperia a UF inteira (RF-124). A UF continua aparecendo,
    com os campos nulos, e é contada em `ufs_aguardando`.
    """

    uf: str
    pct_apurado: float
    entrada: EntradaProporcional
    resultado: ResultadoCadeiras | None
    #: RF-127 — `{cod: (baixo, alto)}` vindo de
    #: `cadeiras_bootstrap.intervalo_de_cadeiras`. `None` (ou `cod` ausente)
    #: quando não há intervalo honesto a publicar para esta UF; o campo é
    #: opcional no contrato (D5/D6) exatamente para isso. Chega pronto: este
    #: módulo não sorteia nada.
    cadeiras_ci95: dict[str, tuple[int, int]] | None = None


# ---------------------------------------------------------------------------
# Identidade — o payload nunca sai sem rótulo
# ---------------------------------------------------------------------------


def _identidade(entrada: EntradaProporcional, cod: str) -> IdentidadeAgremiacao:
    """Identidade da agremiação, ou um rótulo mínimo derivado do código.

    Envelope sem `nm`/`sg` é degradação de dado, não motivo para a barra sair
    anônima: o número da agremiação é público e identifica a legenda na urna.
    """
    ident = entrada.identidade_agremiacoes.get(cod)
    if ident is not None:
        return ident
    return IdentidadeAgremiacao(
        cod=cod, sigla=cod, nome=cod, tipo="partido", componentes=()
    )


def _identidade_cand(entrada: EntradaProporcional, sqcand: int) -> IdentidadeCandidato:
    return entrada.identidade_candidatos.get(sqcand) or IdentidadeCandidato(
        sqcand=sqcand, nome=str(sqcand), partido="", agremiacao=""
    )


# ---------------------------------------------------------------------------
# Cor da federação — ADR-0024
# ---------------------------------------------------------------------------


def _votos_por_componente(
    entrada: EntradaProporcional, agremiacao: Agremiacao
) -> dict[str, int]:
    """Votos **nominais** somados por partido componente da agremiação.

    Só nominais: o voto de legenda chega agregado na agremiação (`agr[].tvtl`)
    e o rateio dele por partido componente não é reconstruível a partir do que
    o extrator guarda. Misturar um número que existe com um que não existe
    produziria líder diferente conforme o dado do dia — e a cor tem de ser
    estável a noite inteira (ADR-0024).

    Partido isolado devolve `{sigla: votos}` — um componente só, que é ele
    mesmo. Nenhum caso especial precisa existir a jusante.
    """
    votos: dict[str, int] = {}
    for cand in agremiacao.candidatos:
        sigla = _identidade_cand(entrada, cand.cod).partido
        if not sigla:
            continue
        votos[sigla] = votos.get(sigla, 0) + cand.votos_nominais
    return votos


def _sigla_lider(votos_por_componente: dict[str, int], sigla_agremiacao: str) -> str:
    """O partido que dá a cor (ADR-0024): o componente com mais votos nominais.

    **Empate desempata por sigla ascendente** (constituição § 6). Sem critério
    declarado, dois ciclos sobre o mesmo dado poderiam pintar a mesma federação
    de cores diferentes — e o ADR-0024 exige cor estável durante toda a noite,
    o que é uma propriedade do algoritmo, não de sorte na ordem do dicionário.

    Sem componente identificável (envelope degradado, `par[].sg` ausente), cai
    na sigla da própria agremiação: a tela resolve para `--party-outros` como
    resolveria de qualquer forma, mas por um caminho declarado.
    """
    if not votos_por_componente:
        return sigla_agremiacao
    return min(votos_por_componente.items(), key=lambda kv: (-kv[1], kv[0]))[0]


# ---------------------------------------------------------------------------
# RF-127 — a metade que sai agora: marcar a cadeira que ainda pode mudar de dono
# ---------------------------------------------------------------------------


def _cadeiras_de_fase_1(entrada: EntradaProporcional, resultado: ResultadoCadeiras) -> dict[str, int]:
    """Quantas cadeiras de cada agremiação vieram do quociente partidário.

    `eleitos[cod]` sai de `distribuir_cadeiras` **na ordem em que as vagas foram
    ocupadas**: primeiro as da fase 1, depois as de sobras. Então basta saber
    onde a fase 1 termina — e isso é `min(QP, nº de candidatos acima de 10% do
    QE)`, a mesma regra do art. 108 que o algoritmo aplica.

    Recalculado aqui em vez de devolvido por `cadeiras.py` de propósito: o
    algoritmo passou nos 511/513 e não se mexe nele para acrescentar
    instrumentação. A regra é curta e está coberta por teste próprio.
    """
    qe = resultado.quociente_eleitoral
    if qe < 1:
        return {a.cod: 0 for a in entrada.agremiacoes}
    piso_10 = Fraction(qe, 10)
    fase_1: dict[str, int] = {}
    for agremiacao in entrada.agremiacoes:
        elegiveis = sum(1 for c in agremiacao.candidatos if c.votos_nominais >= piso_10)
        fase_1[agremiacao.cod] = min(resultado.quociente_partidario.get(agremiacao.cod, 0), elegiveis)
    return fase_1


def _marcar_indefinidas(
    entrada: EntradaProporcional,
    resultado: ResultadoCadeiras,
    pct_apurado: float,
) -> set[int]:
    """`sqcand` das cadeiras que ainda dependem de sobra indefinida (RF-127).

    A regra, declarada em vez de arbitrada por constante mágica:

        a cadeira marginal de sobras de uma agremiação é **indefinida**
        enquanto a distância entre a média com que ela foi ganha e a melhor
        média de quem ficou de fora for menor que a fatia de votos que a UF
        ainda não apurou.

    Em 100% apurado a fatia é zero e nada é marcado — sobra empatada de verdade
    já sai em `empates_indeterminados`, que é outra coisa. Em 20% apurado, a
    fatia é 80% e quase toda cadeira de sobra é marcada, o que é honesto: a essa
    altura da noite ela realmente não está decidida.

    Só a cadeira **marginal** de cada agremiação entra (a última que ela ganhou
    em sobras). As anteriores foram ganhas com folga maior, por construção do
    algoritmo de médias, e marcá-las diria que a bancada inteira está no ar.

    Toda a aritmética é `Fraction`: a comparação decide uma cadeira, e um erro
    de 1e-15 decidiria junto (constituição § 6).
    """
    if resultado.quociente_eleitoral < 1:
        return set()
    if entrada.totalizacao_final:
        # `tf == "s"`: o TSE fechou a totalização. Não há voto por vir, e
        # marcar uma cadeira como indefinida aqui diria o contrário do que o
        # dado diz — mesmo que `s.psa` ainda não tenha chegado a 100,00.
        return set()

    fracao_faltante = max(Fraction(0), 1 - Fraction(pct_apurado).limit_denominator(10**6) / 100)
    if fracao_faltante <= 0:
        return set()

    votos = {a.cod: a.votos_totais for a in entrada.agremiacoes}
    fase_1 = _cadeiras_de_fase_1(entrada, resultado)

    # Melhor média entre quem ainda tem candidato a quem dar a próxima vaga —
    # é quem tomaria a cadeira se o dado virasse.
    melhor_perdedora = Fraction(0)
    for agremiacao in entrada.agremiacoes:
        cod = agremiacao.cod
        eleitos_cod = {c.cod for c in resultado.eleitos.get(cod, [])}
        if all(c.cod in eleitos_cod for c in agremiacao.candidatos):
            continue  # lista esgotada: não pode receber mais nada
        media = Fraction(votos.get(cod, 0), resultado.vagas_obtidas.get(cod, 0) + 1)
        melhor_perdedora = max(melhor_perdedora, media)

    indefinidas: set[int] = set()
    for cod, eleitos_cod in resultado.eleitos.items():
        if len(eleitos_cod) <= fase_1.get(cod, 0):
            continue  # nenhuma cadeira de sobra
        vagas_obtidas = resultado.vagas_obtidas.get(cod, 0)
        if vagas_obtidas < 1:
            continue
        # Média com que a ÚLTIMA vaga desta agremiação foi ganha: o algoritmo
        # incrementou `vagas_obtidas` logo depois de usá-la como denominador.
        media_vitoriosa = Fraction(votos.get(cod, 0), vagas_obtidas)
        if media_vitoriosa <= 0:
            continue
        margem = (media_vitoriosa - melhor_perdedora) / media_vitoriosa
        if margem <= fracao_faltante:
            indefinidas.add(eleitos_cod[-1].cod)
    return indefinidas


# ---------------------------------------------------------------------------
# D6 — payload por UF (Vercel Blob)
# ---------------------------------------------------------------------------


def _candidato_payload(
    entrada: EntradaProporcional,
    sqcand: int,
    votos: int,
    ordem: int,
    indefinidas: set[int],
) -> dict[str, Any]:
    ident = _identidade_cand(entrada, sqcand)
    saida: dict[str, Any] = {
        "sqcand": sqcand,
        "nome": ident.nome,
        "partido": ident.partido,
        "votos": votos,
        "ordem": ordem,
    }
    if sqcand in indefinidas:
        saida["indefinido"] = True
    return saida


def _codigos_em_empate(resultado: ResultadoCadeiras) -> list[str]:
    """Códigos de agremiação envolvidos em empate que a norma não resolve (D6).

    Lê `empates_agremiacoes`, que é dado. A versão anterior procurava o código
    **dentro da frase** de `empates_indeterminados` — funcionava, tinha teste, e
    teria quebrado calada no dia em que alguém reescrevesse a mensagem, num
    caso raro demais para alguém notar. A frase segue existindo; ela só não é
    mais fonte de dado.

    Um empate envolve 2+ agremiações e a UF pode ter mais de um — daí o
    achatamento com deduplicação, ordenado para determinismo (constituição § 6).
    """
    return sorted({cod for empate in resultado.empates_agremiacoes for cod in empate})


def construir_detalhe_uf(
    *,
    dados: UfProporcional,
    ts_iso: str,
    cargo: int,
    turno: int,
    divergencias: list[dict[str, Any]],
) -> dict[str, Any]:
    """`DeputadoUfDetail` (D6) — o payload que vai para `deputado/uf/<SIGLA>.json`."""
    entrada = dados.entrada
    resultado = dados.resultado

    indefinidas = (
        _marcar_indefinidas(entrada, resultado, dados.pct_apurado)
        if resultado is not None
        else set()
    )

    votos_validos_uf = sum(a.votos_totais for a in entrada.agremiacoes)

    agremiacoes: list[dict[str, Any]] = []
    for agremiacao in entrada.agremiacoes:
        cod = agremiacao.cod
        ident = _identidade(entrada, cod)
        nominais = sum(c.votos_nominais for c in agremiacao.candidatos)
        validos = agremiacao.votos_totais

        eleitos_cod = resultado.eleitos.get(cod, []) if resultado is not None else []
        suplentes_cod = resultado.suplentes.get(cod, []) if resultado is not None else []

        linha: dict[str, Any] = {
            "cod": cod,
            "sigla": ident.sigla,
            "nome": ident.nome,
            "tipo": ident.tipo,
            "componentes": list(ident.componentes),
            # ADR-0024 — a federação usa a cor do partido-líder. Aqui o
            # líder é medido NESTA UF; no payload nacional, na soma das 27.
            # Os dois podem divergir, e não é inconsistência (ver
            # `_bancada_nacional`).
            "sigla_lider": _sigla_lider(
                _votos_por_componente(entrada, agremiacao), ident.sigla
            ),
            "votos_nominais": nominais,
            "votos_legenda": agremiacao.votos_legenda,
            "votos_validos": validos,
            "pct_votos": _pct(validos, votos_validos_uf),
            "quociente_partidario": (
                resultado.quociente_partidario.get(cod, 0) if resultado is not None else 0
            ),
            "cadeiras": len(eleitos_cod),
            # Sem `cadeiras_indefinidas` aqui de propósito: D6 não o tem, e
            # o contrato manda. A contagem por agremiação que o payload
            # nacional precisa sai de `eleitos[].indefinido` — um campo, uma
            # verdade.
            "eleitos": [
                _candidato_payload(entrada, c.cod, c.votos_nominais, i + 1, indefinidas)
                for i, c in enumerate(eleitos_cod)
            ],
            "suplentes": [
                _candidato_payload(entrada, c.cod, c.votos_nominais, i + 1, indefinidas)
                for i, c in enumerate(suplentes_cod[:MAX_SUPLENTES])
            ],
        }
        # RF-127 — a faixa só aparece quando foi medida. Ausente é a forma de
        # dizer "não temos intervalo para esta UF"; `[n, n]` diria o contrário.
        faixa = (dados.cadeiras_ci95 or {}).get(cod)
        if faixa is not None:
            linha["cadeiras_ci95"] = [faixa[0], faixa[1]]
        agremiacoes.append(linha)

    # Determinismo (constituição § 6): cadeiras desc, votos desc, sigla asc e,
    # por último, o código — dois partidos com a mesma sigla não existem, mas a
    # ordenação não pode depender disso.
    agremiacoes.sort(key=lambda a: (-a["cadeiras"], -a["votos_validos"], a["sigla"], a["cod"]))

    return {
        "ts": ts_iso,
        "cargo": cargo,
        "turno": turno,
        "uf": dados.uf,
        "pct_apurado": round(float(dados.pct_apurado), 5),
        "lugares_a_preencher": entrada.lugares_a_preencher,
        "quociente_eleitoral": resultado.quociente_eleitoral if resultado is not None else None,
        "quociente_eleitoral_tse": entrada.quociente_eleitoral_tse,
        "totalizacao_final": entrada.totalizacao_final,
        "divergencias": divergencias,
        "agremiacoes": agremiacoes,
        "vagas_nao_preenchidas": (
            resultado.vagas_nao_preenchidas if resultado is not None else 0
        ),
        "empates_indeterminados": (
            _codigos_em_empate(resultado) if resultado is not None else []
        ),
    }


# ---------------------------------------------------------------------------
# D5 — payload nacional (Global Config)
# ---------------------------------------------------------------------------


def _linha_uf(detalhe: dict[str, Any], dados: UfProporcional) -> dict[str, Any]:
    """`EdgeDeputadoUfRow` (D5) — o resumo da UF que cabe no payload nacional."""
    agremiacoes = detalhe["agremiacoes"]
    lider = None
    if dados.resultado is not None and agremiacoes and agremiacoes[0]["cadeiras"] > 0:
        # `agremiacoes` já está ordenado por cadeiras desc com desempate
        # declarado — o líder é o primeiro, sem nova ordenação.
        topo = agremiacoes[0]
        lider = {"cod": topo["cod"], "sigla": topo["sigla"], "cadeiras": topo["cadeiras"]}

    return {
        "sigla": dados.uf,
        "pct_apurado": detalhe["pct_apurado"],
        "lugares_a_preencher": detalhe["lugares_a_preencher"],
        "quociente_eleitoral": detalhe["quociente_eleitoral"],
        "cadeiras_definidas": sum(a["cadeiras"] for a in agremiacoes),
        "vagas_nao_preenchidas": detalhe["vagas_nao_preenchidas"],
        "empates_indeterminados": len(detalhe["empates_indeterminados"]),
        "lider": lider,
    }


def _bancada_nacional(
    detalhes_ordenados: list[tuple[UfProporcional, dict[str, Any]]],
    ufs_conhecidas: int,
    cadeiras_ci95_nacional: dict[str, tuple[int, int]] | None = None,
) -> dict[str, Any]:
    """`EdgeBancadaNacional` (D5) — soma de 27 corridas, não um modelo nacional.

    As agremiações são reconciliadas por `cod` (`agr[].n`), que é estável no país
    inteiro: o PT é 13 em toda UF. A identidade (sigla, nome, composição) vem da
    primeira UF em ordem alfabética que a publicou — se uma UF vier sem rótulo, a
    seguinte completa, mas nenhuma sobrescreve a anterior.

    **`sigla_lider` nacional é a soma das 27 UFs**, não a moda dos líderes
    estaduais (ADR-0024). Contar "em quantos estados cada componente lidera"
    daria peso igual a Roraima e a São Paulo, e mudaria de resposta conforme a
    ordem em que as UFs apuram — a cor trocaria no meio da noite, que é
    exatamente o que o ADR proíbe.

    Como consequência, **o líder nacional pode ser diferente do líder de uma UF
    específica**, e isso não é inconsistência: são duas perguntas diferentes
    ("quem puxa a federação no Brasil" e "quem puxa a federação neste estado"),
    respondidas pelo mesmo critério sobre recortes diferentes.
    """
    cadeiras: dict[str, int] = {}
    indefinidas: dict[str, int] = {}
    nominais: dict[str, int] = {}
    legenda: dict[str, int] = {}
    validos: dict[str, int] = {}
    identidade: dict[str, dict[str, Any]] = {}
    componentes_br: dict[str, dict[str, int]] = {}
    ordem: list[str] = []

    total_cadeiras = 0
    cadeiras_atribuidas = 0
    ufs_calculadas = 0

    for dados, detalhe in detalhes_ordenados:
        if detalhe["lugares_a_preencher"] is not None:
            total_cadeiras += int(detalhe["lugares_a_preencher"])
        if dados.resultado is not None:
            ufs_calculadas += 1
        # Votos nominais por componente, SOMADOS país afora — o insumo do
        # líder nacional. Lido da entrada da UF, não do detalhe: o payload de
        # UF publica o líder já resolvido, e reconstruir o Brasil a partir de
        # 27 respostas prontas é justamente a moda que o docstring recusa.
        votos_componente_da_uf = {
            agremiacao.cod: _votos_por_componente(dados.entrada, agremiacao)
            for agremiacao in dados.entrada.agremiacoes
        }
        for cod_agr, por_sigla in votos_componente_da_uf.items():
            acumulado = componentes_br.setdefault(cod_agr, {})
            for sigla_componente, votos_componente in por_sigla.items():
                acumulado[sigla_componente] = (
                    acumulado.get(sigla_componente, 0) + votos_componente
                )
        for agremiacao in detalhe["agremiacoes"]:
            cod = agremiacao["cod"]
            if cod not in cadeiras:
                cadeiras[cod] = 0
                indefinidas[cod] = 0
                nominais[cod] = 0
                legenda[cod] = 0
                validos[cod] = 0
                ordem.append(cod)
            # Soma, nunca sobrescrita: uma agremiação aparece em até 27 linhas,
            # e `dict[cod] = valor` aqui seria a bancada do último estado lido.
            cadeiras[cod] += agremiacao["cadeiras"]
            cadeiras_atribuidas += agremiacao["cadeiras"]
            indefinidas[cod] += sum(1 for e in agremiacao["eleitos"] if e.get("indefinido"))
            nominais[cod] += agremiacao["votos_nominais"]
            legenda[cod] += agremiacao["votos_legenda"]
            validos[cod] += agremiacao["votos_validos"]

            atual = identidade.get(cod)
            if atual is None:
                identidade[cod] = {
                    "sigla": agremiacao["sigla"],
                    "nome": agremiacao["nome"],
                    "tipo": agremiacao["tipo"],
                    "componentes": list(agremiacao["componentes"]),
                }
            elif not atual["componentes"] and agremiacao["componentes"]:
                atual["componentes"] = list(agremiacao["componentes"])

    validos_br = sum(validos.values())
    por_agremiacao = [
        {
            "cod": cod,
            "sigla": identidade[cod]["sigla"],
            "nome": identidade[cod]["nome"],
            "tipo": identidade[cod]["tipo"],
            "componentes": identidade[cod]["componentes"],
            # ADR-0024 — soma das 27 UFs; ver o docstring desta função.
            "sigla_lider": _sigla_lider(
                componentes_br.get(cod, {}), identidade[cod]["sigla"]
            ),
            "cadeiras": cadeiras[cod],
            "cadeiras_indefinidas": indefinidas[cod],
            "votos_nominais": nominais[cod],
            "votos_legenda": legenda[cod],
            "votos_validos": validos[cod],
            "pct_votos": _pct(validos[cod], validos_br),
        }
        for cod in ordem
    ]
    # RF-127 — a faixa da bancada. Vem pronta de
    # `cadeiras_bootstrap.intervalo_nacional`, que soma RÉPLICAS das UFs e só
    # então tira o percentil: somar as faixas das 27 UFs daria uma faixa larga
    # e errada (a soma dos percentis não é o percentil da soma). Agremiação sem
    # entrada ali sai sem `cadeiras_ci95`, e não com `[n, n]`.
    for linha_agr in por_agremiacao:
        faixa = (cadeiras_ci95_nacional or {}).get(linha_agr["cod"])
        if faixa is not None:
            linha_agr["cadeiras_ci95"] = [faixa[0], faixa[1]]
    # D5: cadeiras desc, depois sigla asc. `cod` fecha o desempate para que a
    # ordem não dependa da ordem de leitura das UFs.
    por_agremiacao.sort(key=lambda a: (-a["cadeiras"], a["sigla"], a["cod"]))

    return {
        "total_cadeiras": total_cadeiras,
        "cadeiras_atribuidas": cadeiras_atribuidas,
        "ufs_calculadas": ufs_calculadas,
        "ufs_aguardando": max(0, ufs_conhecidas - ufs_calculadas),
        "por_agremiacao": por_agremiacao,
    }


def construir_payload_deputado(
    *,
    ufs: list[UfProporcional],
    divergencias_por_uf: dict[str, list[dict[str, Any]]],
    ts_iso: str,
    cargo: int,
    turno: int,
    atualizacao_min: int,
    ufs_conhecidas: int,
    pct_apurado_total: float,
    cadeiras_ci95_nacional: dict[str, tuple[int, int]] | None = None,
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    """Monta `EdgePayloadDeputado` (D5) e o mapa `sigla → DeputadoUfDetail` (D6).

    Devolve os dois juntos porque o nacional é **derivado** dos detalhes de UF:
    a bancada é a soma das 27 corridas (D3), e recalculá-la de outra fonte
    abriria espaço para os dois números divergirem na mesma tela.

    `ufs_conhecidas` é quantas UFs a eleição tem (27), vinda de quem chamou —
    não é contada a partir das UFs presentes, senão `ufs_aguardando` seria
    sempre zero e o leitor concluiria que a bancada já fechou.

    `cadeiras_ci95_nacional` (RF-127) é a faixa da bancada, já agregada por
    `cadeiras_bootstrap.intervalo_nacional`. `None` — o default — publica o
    payload sem faixa nenhuma, que é o estado correto enquanto não houver duas
    zonas apuradas em nenhuma UF.
    """
    ordenadas = sorted(ufs, key=lambda d: d.uf)
    detalhes: dict[str, dict[str, Any]] = {}
    pares: list[tuple[UfProporcional, dict[str, Any]]] = []
    for dados in ordenadas:
        detalhe = construir_detalhe_uf(
            dados=dados,
            ts_iso=ts_iso,
            cargo=cargo,
            turno=turno,
            divergencias=divergencias_por_uf.get(dados.uf, []),
        )
        detalhes[dados.uf] = detalhe
        pares.append((dados, detalhe))

    bancada = _bancada_nacional(pares, ufs_conhecidas, cadeiras_ci95_nacional)

    payload = {
        "ts": ts_iso,
        "cargo": cargo,
        "turno": turno,
        "pct_apurado_total": round(float(pct_apurado_total), 5),
        "ufs_apuradas": sum(1 for d in ordenadas if d.pct_apurado > 0),
        # RF-128 — a cadência é declarada pelo produtor do dado. A tela não a
        # deriva de `ts` (lição de 11/09: número escrito à mão no JSX vira
        # mentira em silêncio quando a cadência muda).
        "atualizacao_min": atualizacao_min,
        "bancada": bancada,
        "por_uf": [_linha_uf(detalhe, dados) for dados, detalhe in pares],
        # ADR-0005 — insights são template determinístico, nunca LLM. Vazio até
        # os templates da corrida proporcional existirem; lista vazia é a
        # ausência honesta, e a tela já sabe lidar com ela.
        "insights": [],
        # Cadeira de Deputado não é estimativa de modelo: é a aritmética do
        # ADR-0027 sobre o voto já apurado. `actual_results: 1` é o que isso é.
        "composition": {"pre_election": 0.0, "model": 0.0, "actual_results": 1.0},
    }
    return payload, detalhes
