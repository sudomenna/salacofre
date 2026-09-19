"""Do envelope EA20 para o cálculo de cadeiras (spec 017, RF-121 a RF-125.1).

`api/model/cadeiras.py` implementa o algoritmo do ADR-0027 e não sabe nada sobre
o TSE. Este módulo é a ponte: lê um envelope EA20 de cargo proporcional e produz
as `Agremiacao` que aquele algoritmo consome.

## A hierarquia, e por que `fed[]` NÃO é percorrida

A árvore do EA20 (documento oficial,
`tse_docs/txt/tse-ea20-arquivo-de-resultado-unificado.txt:417-434`) é:

    carg[]  ├── nv  (vagas no cargo)
            ├── qe  (quociente eleitoral — só cargo proporcional)
            ├── fed[]  (n, nm, sg, com, npar[])          ← só COMPOSIÇÃO
            └── agr[]  (Coligação | Federação | Partido isolado)
                 ├── tp ('c' | 'f' | 'i'), vag
                 └── par[] ── cand[]

`fed[]` **não tem `par[]` nem `cand[]`**: é um dicionário que diz quais partidos
compõem cada federação. Todo voto e todo candidato chegam por `agr[]`, e a
federação aparece ali como `agr[].tp == "f"` — que é exatamente a unidade de
agregação que o art. 6º-A da Lei 9.504 manda usar. Percorrer `fed[]` atrás de
candidatos devolveria lista vazia.

## Os três números que o TSE publica e que ninguém lia

`carg[].qe`, `carg[].nv` e `agr[].vag` são, respectivamente, o quociente
eleitoral, as vagas da circunscrição e as cadeiras que **o próprio TSE** atribuiu
a cada agremiação. Nenhum tinha consumidor no repositório até 2026-09-11.

Eles valem ouro por dois motivos:

1. **`nv` é a fonte de `lugares_a_preencher`** (RF-124): o número de cadeiras por
   UF sai do dado, nunca de tabela embutida. A Res.-TSE 23.748/2026 art. 7º § 1º
   remete à LC 78/1993 — errar esse denominador corrompe a projeção inteira.
   ⚠️ **2026-09-19**: a frase "a redistribuição pelo Censo 2022 (PLP 177/2023)
   tem desfecho não confirmado" saiu daqui — o PLP foi vetado em julho/2025 e o
   STF manteve as 513. Isto não afrouxa nada nesta alínea: o `nv` **por UF**
   continua vindo do TSE. O que a premissa falsa autorizava, e foi corrigido,
   era derivar o **total nacional** da soma das UFs presentes
   (`deputado_payload.py`).
2. **`qe` e `vag` são um golden AO VIVO.** Depois da totalização final, comparar
   nossa conta com a do TSE responde, com dado real, se o algoritmo do ADR-0027
   está certo — sem depender do dataset histórico de 2022. `conferir_contra_tse`
   faz isso e é o que torna o gate de 19/09 verificável mesmo antes do golden.

Enquanto a apuração é parcial, `vag` reflete o estado parcial e divergir dele é
esperado: a comparação só é conclusiva com `tf == "s"` (totalização final).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from api.model.cadeiras import Agremiacao, Candidato, ResultadoCadeiras

CARGO_DEPUTADO_FEDERAL = 6

#: Prefixo do `cod` de uma agremiação do tipo `"c"` (coligação) — anomalia de
#: dado em cargo proporcional (ADR-0027, caso de borda 7). Exportado porque o
#: caller precisa detectá-la sem reconstruir a string.
PREFIXO_COLIGACAO = "coligacao:"


# ---------------------------------------------------------------------------
# Leitura de campos — o TSE publica tudo como string, em formato BR
# ---------------------------------------------------------------------------


def _int(raw: Any, default: int = 0) -> int:
    """`"1.234"` → `1234`. Campo ausente ou ilegível vira `default`.

    O separador de milhar do TSE é o ponto; não há decimal nestes campos.
    """
    if raw is None:
        return default
    texto = str(raw).strip().replace(".", "").replace(" ", "")
    if not texto:
        return default
    try:
        return int(texto)
    except ValueError:
        return default


def _nascimento(raw: Any) -> int | None:
    """`"31/12/1970"` → `19701231`, para o desempate do art. 110 (mais idoso).

    Devolve `None` quando ausente ou malformado — `cadeiras.py` trata isso como
    "data desconhecida" e desempata pelo código, de forma declarada.
    """
    if raw is None:
        return None
    partes = str(raw).strip().split("/")
    if len(partes) != 3:
        return None
    dia, mes, ano = partes
    if not (dia.isdigit() and mes.isdigit() and ano.isdigit()):
        return None
    if len(ano) != 4:
        return None
    return int(ano) * 10_000 + int(mes) * 100 + int(dia)


def _cod_candidato(cand: dict[str, Any]) -> int | None:
    """Identificador ÚNICO do candidato: `sqcand`, nunca o número de urna.

    `cand.n` é o número que o eleitor digita — ele se repete entre UFs e entre
    partidos no proporcional. Usá-lo como chave fundiria candidatos distintos.
    `sqcand` é o sequencial único do TSE (`ea20-schema.ts:80`).
    """
    seq = cand.get("sqcand")
    if seq is None:
        return None
    texto = str(seq).strip()
    return int(texto) if texto.isdigit() else None


def _texto(raw: Any) -> str:
    """Campo de texto do EA20, normalizado — nunca `None` para a tela.

    A sigla de partido **inapto** vem com `**` à direita no EA20 (dicionário
    oficial, elemento `par.sg`). O asterisco é um marcador de situação
    cadastral, não parte da sigla: exibi-lo colaria `PP**` no rótulo de uma
    barra. Ele é removido aqui, e a informação de inaptidão não é usada em
    lugar nenhum do produto hoje — se um dia for, tem de ser um campo próprio,
    não um sufixo de string.
    """
    if raw is None:
        return ""
    return str(raw).strip().rstrip("*").strip()


def _componentes(raw: Any) -> tuple[str, ...]:
    """`"PT/PCdoB/PV"` → `("PT", "PCdoB", "PV")` (campo `com` do EA20)."""
    if raw is None:
        return ()
    partes = [_texto(p) for p in str(raw).split("/")]
    return tuple(p for p in partes if p)


def _raiz(payload: Any) -> dict[str, Any] | None:
    """Desembrulha o `abr[0]` que alguns níveis do EA20 usam."""
    if not isinstance(payload, dict):
        return None
    abr = payload.get("abr")
    if isinstance(abr, list) and abr and isinstance(abr[0], dict):
        return abr[0]
    return payload


# ---------------------------------------------------------------------------
# Extração
# ---------------------------------------------------------------------------


TipoAgremiacao = Literal["partido", "federacao", "coligacao"]


@dataclass(frozen=True)
class IdentidadeAgremiacao:
    """Quem é a agremiação — nome, sigla, tipo, composição.

    Vive **fora** de `cadeiras.Agremiacao` de propósito (design 017 D4): aquele
    dataclass é o contrato do algoritmo do ADR-0027 e não tem nada a ganhar
    conhecendo nome de partido. A identidade viaja num mapa paralelo chaveado
    pelo mesmo `cod` (`agr[].n`), e o algoritmo continua magro.
    """

    cod: str
    sigla: str
    nome: str
    tipo: TipoAgremiacao
    #: Siglas dos partidos componentes. `()` em partido isolado (RF-122).
    componentes: tuple[str, ...]


@dataclass(frozen=True)
class IdentidadeCandidato:
    """Quem é o candidato. Chaveado por `sqcand`, **nunca** por `cand.n`."""

    sqcand: int
    nome: str
    #: Sigla do partido dentro da agremiação — numa federação, distingue os
    #: componentes (RF-122); num partido isolado, repete a sigla da agremiação.
    partido: str
    #: `cod` da agremiação a que pertence.
    agremiacao: str


@dataclass(frozen=True)
class EntradaProporcional:
    """Tudo que um envelope EA20 de cargo proporcional oferece ao cálculo."""

    agremiacoes: list[Agremiacao]
    #: `carg[].nv` — vagas da circunscrição. `None` quando o TSE não publicou.
    lugares_a_preencher: int | None
    #: `carg[].qe` — o quociente eleitoral do PRÓPRIO TSE, para conferência.
    quociente_eleitoral_tse: int | None
    #: `agr[].vag` — cadeiras que o TSE atribuiu a cada agremiação.
    vagas_tse: dict[str, int]
    #: `tf == "s"` — só com totalização final a conferência é conclusiva.
    totalizacao_final: bool
    #: `cod` → identidade da agremiação. Paralelo a `agremiacoes` (D4).
    identidade_agremiacoes: dict[str, IdentidadeAgremiacao] = field(default_factory=dict)
    #: `sqcand` → identidade do candidato. Paralelo aos `Candidato` (D4).
    identidade_candidatos: dict[int, IdentidadeCandidato] = field(default_factory=dict)

    @property
    def tem_coligacao(self) -> bool:
        """Há agremiação do tipo `"c"` — anomalia em cargo proporcional.

        Coligação proporcional é vedada desde 2020 (CF art. 17 § 1º, EC
        97/2017). O ADR-0027 (caso de borda 7) manda **não processá-la como
        agremiação válida**; quem decide o que fazer com a UF inteira é o
        caller, que é quem sabe alertar.
        """
        return any(a.cod.startswith(PREFIXO_COLIGACAO) for a in self.agremiacoes)


def extrair_entrada_proporcional(
    payload: Any, cargo: int = CARGO_DEPUTADO_FEDERAL
) -> EntradaProporcional:
    """Lê um envelope EA20 e monta a entrada de `distribuir_cadeiras`.

    Cada `agr[]` vira **uma** `Agremiacao` — inclusive a federação, que é
    `tp == "f"` e já traz os partidos componentes em `par[]`. Somar os `par[]`
    aqui é o que a Lei 9.096 art. 11-A e a Lei 9.504 art. 6º-A mandam fazer, e é
    o que evita o erro de tratar uma federação como três partidos (medido em
    `tests/unit/model/test_cadeiras.py`: duas cadeiras de diferença).

    Agremiações do tipo `"c"` (coligação) são **descartadas com sinal**: coligação
    em eleição proporcional é vedada desde 2020 (CF art. 17 § 1º, EC 97/2017), e
    encontrá-la aqui é anomalia de dado, não caso a processar (ADR-0027, caso de
    borda 7). Elas saem em `agremiacoes` com `cod` prefixado por `"coligacao:"`
    para que o caller possa logar — nunca silenciosamente somadas.

    ## Identidade (design 017 D4)

    Nome, sigla, tipo e composição saem em `identidade_agremiacoes`; nome e
    partido de cada candidato, em `identidade_candidatos`. Dois mapas paralelos,
    não campos novos em `Agremiacao`/`Candidato` — o contrato do algoritmo do
    ADR-0027 continua sendo só voto e código.

    **A sigla da agremiação não existe no EA20.** `agr[]` publica `n`, `nm`,
    `tp` e `com`, mas **não** `sg` (dicionário oficial, `carg[].agr[]`). Ela é
    derivada: federação pega a sigla de `carg[].fed[]` com o mesmo número
    (`fed[].sg`); partido isolado pega a do seu único `par[].sg`. É o único
    ponto em que `fed[]` é lida — e mesmo aqui só por identidade: nenhum voto e
    nenhum candidato passam por ela.
    """
    raiz = _raiz(payload)
    if raiz is None:
        return EntradaProporcional([], None, None, {}, False)

    cargos = raiz.get("carg")
    if not isinstance(cargos, list):
        return EntradaProporcional([], None, None, {}, False)

    totalizacao_final = str(raiz.get("tf", "")).strip().lower() == "s"

    for carg in cargos:
        if not isinstance(carg, dict):
            continue
        if _int(carg.get("cd"), default=-1) != cargo:
            continue

        nv = carg.get("nv")
        qe = carg.get("qe")
        agremiacoes: list[Agremiacao] = []
        vagas_tse: dict[str, int] = {}
        identidade_agr: dict[str, IdentidadeAgremiacao] = {}
        identidade_cand: dict[int, IdentidadeCandidato] = {}

        # `fed[]` só para IDENTIDADE (sigla/composição da federação) — nunca
        # para voto ou candidato, que chegam exclusivamente por `agr[]`.
        federacoes: dict[str, dict[str, Any]] = {}
        for fed in carg.get("fed") or []:
            if isinstance(fed, dict):
                numero_fed = str(fed.get("n", "")).strip()
                if numero_fed:
                    federacoes[numero_fed] = fed

        for agr in carg.get("agr") or []:
            if not isinstance(agr, dict):
                continue
            tipo = str(agr.get("tp", "")).strip().lower()
            numero = str(agr.get("n", "")).strip()
            if not numero:
                continue
            cod = f"{PREFIXO_COLIGACAO}{numero}" if tipo == "c" else numero

            candidatos: list[Candidato] = []
            legenda_dos_partidos = 0
            siglas_par: list[str] = []
            for par in agr.get("par") or []:
                if not isinstance(par, dict):
                    continue
                legenda_dos_partidos += _int(par.get("tvtl"))
                sigla_par = _texto(par.get("sg"))
                if sigla_par:
                    siglas_par.append(sigla_par)
                for cand in par.get("cand") or []:
                    if not isinstance(cand, dict):
                        continue
                    cod_cand = _cod_candidato(cand)
                    if cod_cand is None:
                        continue
                    candidatos.append(
                        Candidato(
                            cod=cod_cand,
                            votos_nominais=_int(cand.get("vap")),
                            nascimento=_nascimento(cand.get("dt")),
                        )
                    )
                    # `nmu` (nome na urna) antes de `nm` (nome completo): é o
                    # nome pelo qual o eleitor conhece o candidato e o que o
                    # próprio TSE exibe. `nm` fica de reserva.
                    identidade_cand[cod_cand] = IdentidadeCandidato(
                        sqcand=cod_cand,
                        nome=_texto(cand.get("nmu")) or _texto(cand.get("nm")),
                        partido=sigla_par,
                        agremiacao=cod,
                    )

            identidade_agr[cod] = _identidade_agremiacao(
                cod=cod,
                tipo_bruto=tipo,
                agr=agr,
                siglas_par=siglas_par,
                fed=federacoes.get(numero),
            )

            # `agr[].tvtl` é o agregado publicado; a soma dos `par[].tvtl` é o
            # mesmo número por construção. Preferimos o agregado quando existe,
            # e caímos na soma quando o TSE o omite.
            legenda = _int(agr.get("tvtl"), default=legenda_dos_partidos)
            if agr.get("tvtl") is None:
                legenda = legenda_dos_partidos

            agremiacoes.append(
                Agremiacao(cod=cod, votos_legenda=legenda, candidatos=tuple(candidatos))
            )
            if agr.get("vag") is not None:
                vagas_tse[cod] = _int(agr.get("vag"))

        return EntradaProporcional(
            agremiacoes=agremiacoes,
            lugares_a_preencher=_int(nv, default=0) or None,
            quociente_eleitoral_tse=_int(qe, default=0) or None,
            vagas_tse=vagas_tse,
            totalizacao_final=totalizacao_final,
            identidade_agremiacoes=identidade_agr,
            identidade_candidatos=identidade_cand,
        )

    return EntradaProporcional([], None, None, {}, totalizacao_final)


def _identidade_agremiacao(
    *,
    cod: str,
    tipo_bruto: str,
    agr: dict[str, Any],
    siglas_par: list[str],
    fed: dict[str, Any] | None,
) -> IdentidadeAgremiacao:
    """Nome, sigla, tipo e composição de uma `agr[]` (D4).

    `tp` do EA20 → tipo do payload: `"i"` → `"partido"`, `"f"` → `"federacao"`,
    `"c"` → `"coligacao"` (anomalia — nunca exibida, sempre logada).

    A sigla vem, nesta ordem: `fed[].sg` (só federação), a sigla do único
    `par[]` (partido isolado), o nome da agremiação, e por fim o próprio número.
    Nunca fica vazia: uma barra sem rótulo é pior que uma barra com o número.
    """
    tipo: TipoAgremiacao = (
        "federacao" if tipo_bruto == "f" else "coligacao" if tipo_bruto == "c" else "partido"
    )
    nome = _texto(agr.get("nm"))

    if tipo == "federacao":
        sigla = _texto((fed or {}).get("sg")) or nome or cod
        # `com` sai da própria agremiação quando publicado; `fed[].com` é o
        # mesmo dado no dicionário de federações. A lista de `par[].sg` é o
        # último recurso — ela é a composição de fato, só não vem ordenada
        # pelo TSE, por isso não é a primeira escolha.
        componentes = (
            _componentes(agr.get("com"))
            or _componentes((fed or {}).get("com"))
            or tuple(siglas_par)
        )
    elif tipo == "partido":
        sigla = (siglas_par[0] if siglas_par else "") or nome or cod
        # RF-122 / D5: partido isolado sai com `componentes` vazio — repetir a
        # própria sigla ali faria a tela desenhar "PT (PT)".
        componentes = ()
    else:
        sigla = nome or cod
        componentes = _componentes(agr.get("com")) or tuple(siglas_par)

    return IdentidadeAgremiacao(
        cod=cod,
        sigla=sigla,
        nome=nome or sigla,
        tipo=tipo,
        componentes=componentes,
    )


# ---------------------------------------------------------------------------
# Combinação de envelopes — a defesa contra o `Map.set` sobre linhas de par
# ---------------------------------------------------------------------------


def combinar_entradas(entradas: list[EntradaProporcional]) -> EntradaProporcional:
    """Soma N envelopes da MESMA UF em uma entrada só.

    O cargo 6 passou de granularidade UF para ZONA em 2026-09-13 (emenda ao
    ADR-0026 item 1 — mesmo diagnóstico de bootstrap que moveu o Senador em
    11/09: um único arquivo por UF só dá ao estimador uma unidade de
    reamostragem, e o IC95 degenera). Desde então o caso NORMAL é **várias**
    linhas de `(município, zona)` por UF — uma por par publicado pelo TSE —
    e esta função soma todas. O caso de **uma** única linha (devolvida sem
    cópia, abaixo, sem custo) volta a ser normal apenas quando o interruptor
    de emergência `TSE_DEPUTADO_GRANULARIDADE=uf`
    (`lib/tse/targets.ts::getGranularidade`) reverte o cargo à ingestão por
    UF — nesse modo o envelope único é o esperado, não uma escotilha de
    diagnóstico.

    De qualquer forma, a única coisa certa a fazer com os votos de várias
    linhas é **somar**: escolher uma e descartar as outras é o modo de falha
    que esta base já pagou caro desde a migration 0006 (ADR-0035) — o número
    sai plausível, menor, e sem erro nenhum.

    O que **não** é somado, porque somar seria inventar:

      - `quociente_eleitoral_tse` e `vagas_tse` viram `None`/`{}`. São grandezas
        da circunscrição inteira; a versão publicada num arquivo de zona não
        é conferível contra a nossa conta da UF, e `conferir_contra_tse`
        acusaria divergência que não existe.
      - `lugares_a_preencher` é o **máximo** dos publicados — a circunscrição é
        a mesma para todas as linhas, e vaga não encolhe.
      - `totalizacao_final` só é verdadeira se **todas** as linhas o disserem.
    """
    if not entradas:
        return EntradaProporcional([], None, None, {}, False)
    if len(entradas) == 1:
        return entradas[0]

    legenda_por_cod: dict[str, int] = {}
    votos_por_cand: dict[str, dict[int, int]] = {}
    nascimento_por_cand: dict[int, int | None] = {}
    ordem_cods: list[str] = []
    ordem_cands: dict[str, list[int]] = {}
    identidade_agr: dict[str, IdentidadeAgremiacao] = {}
    identidade_cand: dict[int, IdentidadeCandidato] = {}

    for entrada in entradas:
        for agremiacao in entrada.agremiacoes:
            cod = agremiacao.cod
            if cod not in legenda_por_cod:
                legenda_por_cod[cod] = 0
                votos_por_cand[cod] = {}
                ordem_cands[cod] = []
                ordem_cods.append(cod)
            legenda_por_cod[cod] += agremiacao.votos_legenda
            for cand in agremiacao.candidatos:
                if cand.cod not in votos_por_cand[cod]:
                    votos_por_cand[cod][cand.cod] = 0
                    ordem_cands[cod].append(cand.cod)
                votos_por_cand[cod][cand.cod] += cand.votos_nominais
                if nascimento_por_cand.get(cand.cod) is None:
                    nascimento_por_cand[cand.cod] = cand.nascimento
        for cod, ident in entrada.identidade_agremiacoes.items():
            identidade_agr.setdefault(cod, ident)
        for sq, ident_c in entrada.identidade_candidatos.items():
            identidade_cand.setdefault(sq, ident_c)

    agremiacoes = [
        Agremiacao(
            cod=cod,
            votos_legenda=legenda_por_cod[cod],
            candidatos=tuple(
                Candidato(
                    cod=sq,
                    votos_nominais=votos_por_cand[cod][sq],
                    nascimento=nascimento_por_cand.get(sq),
                )
                for sq in ordem_cands[cod]
            ),
        )
        for cod in ordem_cods
    ]

    lugares = [e.lugares_a_preencher for e in entradas if e.lugares_a_preencher is not None]

    return EntradaProporcional(
        agremiacoes=agremiacoes,
        lugares_a_preencher=max(lugares) if lugares else None,
        quociente_eleitoral_tse=None,
        vagas_tse={},
        totalizacao_final=all(e.totalizacao_final for e in entradas),
        identidade_agremiacoes=identidade_agr,
        identidade_candidatos=identidade_cand,
    )


# ---------------------------------------------------------------------------
# Conferência contra o próprio TSE — o golden ao vivo
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Divergencia:
    """Uma discordância entre a nossa conta e a do TSE."""

    o_que: str
    nosso: int
    tse: int
    detalhe: str = ""


def conferir_contra_tse(
    resultado: ResultadoCadeiras, entrada: EntradaProporcional
) -> list[Divergencia]:
    """Compara nossa distribuição com os números que o TSE publica.

    É o golden que não depende de dataset histórico: o EA20 traz o quociente
    eleitoral (`carg[].qe`) e as cadeiras por agremiação (`agr[].vag`) calculados
    pelo próprio TSE. Se o ADR-0027 estiver implementado certo, os dois batem.

    **Só é conclusivo com totalização final** (`tf == "s"`). Durante a apuração
    parcial o TSE recalcula a cada boletim e divergir dele é esperado — por isso
    o caller deve tratar divergência parcial como observação, e divergência com
    `totalizacao_final=True` como **erro** que bloqueia a exibição de cadeiras.

    Devolve lista vazia quando bate, ou quando o TSE não publicou os campos.
    """
    divergencias: list[Divergencia] = []

    if entrada.quociente_eleitoral_tse is not None:
        if resultado.quociente_eleitoral != entrada.quociente_eleitoral_tse:
            divergencias.append(
                Divergencia(
                    o_que="quociente_eleitoral",
                    nosso=resultado.quociente_eleitoral,
                    tse=entrada.quociente_eleitoral_tse,
                    detalhe=(
                        "arredondamento do art. 106 (0,5 exato desce) ou definição "
                        "de votos válidos (brancos/nulos fora)"
                    ),
                )
            )

    for cod, vag_tse in sorted(entrada.vagas_tse.items()):
        nosso = resultado.cadeiras.get(cod, 0)
        if nosso != vag_tse:
            divergencias.append(
                Divergencia(
                    o_que=f"cadeiras[{cod}]",
                    nosso=nosso,
                    tse=vag_tse,
                    detalhe="distribuição de sobras ou cláusula dos 10%/20%",
                )
            )

    return divergencias
