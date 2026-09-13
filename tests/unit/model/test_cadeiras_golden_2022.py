"""Golden de cadeiras contra a eleição de 2022 — spec 017 RF-126.

É o gate da degradação pré-acordada de 19/09: se a conta de cadeiras não
reproduzir 2022, o Deputado Federal shippa sem projeção de cadeiras.

## Por que 2022, se em 04/10 os dados são de 2026

2022 é a **única** eleição em que conhecemos as duas pontas: os votos que
entraram e quem de fato foi eleito. É bancada de teste, não dado de produção —
nada de 2022 chega à tela. A contraparte em tempo real é
`api/model/deputado.py::conferir_contra_tse`, que compara nossa conta com o
quociente (`carg[].qe`) e as cadeiras (`agr[].vag`) que o próprio TSE publica no
feed de 2026.

## Procedência do gabarito

`tests/fixtures/model/cadeiras-golden-2022.json`, gerado por
`scripts/build-cadeiras-golden.py` a partir de dois datasets abertos do TSE:

  - `votacao_candidato_munzona_2022` — votos nominais por candidato e, crucial,
    a coluna **`DS_SIT_TOT_TURNO`**, que é o desfecho oficial de cada candidato
    ("ELEITO POR QP", "ELEITO POR MÉDIA", "SUPLENTE", "NÃO ELEITO"). O gabarito
    é essa coluna — não uma reconstrução nossa.
  - `votacao_partido_munzona_2022` — votos de **legenda** por partido.

⚠️ Os dois arquivos ficam em `build/` (git-ignored, 8,1 GB). A fixture commitada
tem 0,23 MB e é o que este teste lê.

**Os arquivos foram gerados pelo TSE em 11/09/2026** (campo `DT_GERACAO`) — ou
seja, já refletem qualquer recálculo posterior à ADI 7228, cujos embargos, em
13/03/2025, derrubaram a modulação e fizeram a decisão retroagir a 2022. Usar os
números proclamados à época produziria um golden errado, que passaria com um
algoritmo errado.

## Uma armadilha que este golden já pagou

A primeira medição deu **505/513**, com exatamente uma cadeira errada em 8 UFs —
padrão sistemático demais para ser acaso. A causa era do gerador, não do
algoritmo: os votos de **legenda** estavam sendo lidos do arquivo `_BR`, e o
cargo 6 não está lá — só nos arquivos por UF. Todos entravam como zero. Com a
fonte certa, seis cadeiras se acertaram sozinhas (SP foi de 69/70 para 70/70).

Fica o registro: um golden pode estar medindo com defeito e ainda assim parecer
bom. 98% é exatamente a faixa em que isso passa despercebido.
"""

from __future__ import annotations

import json
import pathlib
from typing import Any

import pytest

from api.model.cadeiras import Agremiacao, Candidato, distribuir_cadeiras

FIXTURE = pathlib.Path(__file__).parents[2] / "fixtures" / "model" / "cadeiras-golden-2022.json"

#: As duas cadeiras que o resultado oficial atribui de forma que a aritmética do
#: ADR-0027 não reproduz. Em ambas, fase 1 (quociente partidário) bate
#: exatamente; a divergência é numa rodada de sobras, e em ambas o TSE deu a
#: vaga à agremiação de **menor** média, com a de maior média tendo candidato
#: acima do piso de 20% — o que a leitura literal do art. 109 I não admite.
#:
#: Investigado em 2026-09-12 e NÃO explicado pelo dado: conferimos que o
#: quociente eleitoral bate por duas fontes independentes (210.400 em MG, ao
#: voto), que os votos nominais batem exatamente entre os dois datasets, e que a
#: ordem não muda incluindo ou excluindo voto de legenda da média.
#:
#: Hipótese mais provável, não confirmada: decisão judicial posterior
#: realocando a vaga — `DS_SIT_TOT_TURNO` registra o desfecho **jurídico** final,
#: que não precisa coincidir com a aritmética. Ambos os casos são troca entre
#: duas agremiações, que é a forma típica desse tipo de decisão.
#:
#: Registrado como open question da spec 017. Se algum dia forem explicados,
#: este dicionário encolhe — e o teste falha se encolher sozinho.
DIVERGENCIAS_CONHECIDAS = {
    "MG": "NELY AQUINO (PODE) eleita por média; a aritmética dá a vaga a UNIÃO",
    "RS": "BIBO NUNES (PL) eleito por média; a aritmética dá a vaga a PODE",
}


@pytest.fixture(scope="module")
def golden() -> dict[str, Any]:
    if not FIXTURE.exists():  # pragma: no cover - a fixture é commitada
        pytest.skip(f"fixture ausente: {FIXTURE}")
    return json.loads(FIXTURE.read_text(encoding="utf-8"))["ufs"]


def _rodar(uf_data: dict[str, Any]):
    ags = [
        Agremiacao(
            cod=a["cod"],
            votos_legenda=a["legenda"],
            candidatos=tuple(Candidato(cod=c[0], votos_nominais=c[1]) for c in a["candidatos"]),
        )
        for a in uf_data["agremiacoes"]
    ]
    return distribuir_cadeiras(ags, uf_data["vagas"])


# ---------------------------------------------------------------------------
# Guardas de que a fixture não encolheu — um golden vazio passa em tudo
# ---------------------------------------------------------------------------


def test_fixture_cobre_as_27_ufs_e_as_513_cadeiras(golden: dict[str, Any]) -> None:
    assert len(golden) == 27
    assert sum(u["vagas"] for u in golden.values()) == 513
    assert sum(len(u["eleitos_tse"]) for u in golden.values()) == 513


def test_fixture_tem_federacoes_e_partidos_isolados(golden: dict[str, Any]) -> None:
    """Sem federação na amostra, o caso mais difícil não seria exercitado."""
    cods = {a["cod"][0] for u in golden.values() for a in u["agremiacoes"]}
    assert cods == {"F", "P"}, "a fixture perdeu federações ou partidos isolados"


# ---------------------------------------------------------------------------
# O golden
# ---------------------------------------------------------------------------


def test_fase_1_reproduz_o_quociente_partidario_em_todas_as_ufs(golden: dict[str, Any]) -> None:
    """Quem o TSE marcou "ELEITO POR QP" tem de sair da nossa fase 1.

    É a parte do algoritmo que não depende de rodada de sobras: quociente
    eleitoral, quociente partidário e a cláusula dos 10% do art. 108. Se esta
    falhar, o erro é estrutural, não de desempate.
    """
    erros = []
    for uf, dados in sorted(golden.items()):
        r = _rodar(dados)
        qe = r.quociente_eleitoral
        nossos_por_qp: set[int] = set()
        for a in dados["agremiacoes"]:
            qp = r.quociente_partidario[a["cod"]]
            elegiveis = [c for c in a["candidatos"] if c[1] >= qe / 10]
            nossos_por_qp.update(c[0] for c in elegiveis[:qp])
        esperado = set(dados["eleitos_por_qp_tse"])
        if nossos_por_qp != esperado:
            erros.append(f"{uf}: {len(nossos_por_qp ^ esperado)} divergências na fase 1")

    assert not erros, "fase 1 divergiu:\n" + "\n".join(erros)


def test_golden_reproduz_a_eleicao_de_2022(golden: dict[str, Any]) -> None:
    """511 das 513 cadeiras, com as 2 divergências conhecidas declaradas.

    O teste **não** afrouxa a comparação: exige acerto total nas 25 UFs sem
    divergência conhecida, e exatamente uma divergência nas duas que têm. Se uma
    terceira aparecer — ou se uma das duas sumir —, ele falha.
    """
    resumo: dict[str, int] = {}
    for uf, dados in sorted(golden.items()):
        r = _rodar(dados)
        nossos = {c.cod for lista in r.eleitos.values() for c in lista}
        tse = set(dados["eleitos_tse"])
        resumo[uf] = len(tse - nossos)

    for uf, faltantes in sorted(resumo.items()):
        if uf in DIVERGENCIAS_CONHECIDAS:
            assert faltantes == 1, (
                f"{uf} tinha 1 divergência conhecida ({DIVERGENCIAS_CONHECIDAS[uf]}) "
                f"e agora tem {faltantes} — reinvestigar antes de ajustar este teste"
            )
        else:
            assert faltantes == 0, f"{uf}: {faltantes} cadeira(s) divergente(s), sem explicação registrada"

    total_ok = 513 - sum(resumo.values())
    assert total_ok == 511, f"esperado 511/513; veio {total_ok}/513"


def test_soma_de_cadeiras_fecha_no_total_de_vagas_em_todas_as_ufs(
    golden: dict[str, Any],
) -> None:
    """Invariante do ADR-0027 (caso 2b) contra dado real das 27 UFs.

    `Σ cadeiras` tem de dar exatamente as vagas da UF. Exibir `vagas_obtidas` no
    lugar mostraria cadeira a mais — em 2022, a soma de `vagas_obtidas` excede o
    total em quase toda UF, porque conta quociente partidário não preenchido.
    """
    houve_excesso = False
    for uf, dados in sorted(golden.items()):
        r = _rodar(dados)
        assert sum(r.cadeiras.values()) == dados["vagas"], f"{uf}: soma de cadeiras != vagas"
        assert r.vagas_nao_preenchidas == 0, f"{uf}: sobrou vaga sem dono"
        if sum(r.vagas_obtidas.values()) > dados["vagas"]:
            houve_excesso = True

    assert houve_excesso, (
        "em nenhuma UF `vagas_obtidas` excedeu o total — o cenário deixou de "
        "distinguir as duas grandezas, e o teste perdeu poder"
    )


def test_nenhuma_uf_produz_empate_indeterminado(golden: dict[str, Any]) -> None:
    """Se a norma não resolve um empate, a tela marca "indeterminado".

    Em 2022 isso não ocorreu em nenhuma das 27 UFs. O teste registra o fato: se
    passar a ocorrer, é sinal de mudança no dado ou no algoritmo, e a UI precisa
    ter o caminho pronto.
    """
    for uf, dados in sorted(golden.items()):
        r = _rodar(dados)
        assert r.empates_indeterminados == [], f"{uf}: {r.empates_indeterminados}"


# ---------------------------------------------------------------------------
# O que este golden NÃO consegue provar
# ---------------------------------------------------------------------------


UFS_NA_FRONTEIRA_DO_ARREDONDAMENTO = {"AP", "MT", "SC", "TO"}


def test_o_golden_exercita_mas_nao_discrimina_o_arredondamento(golden: dict[str, Any]) -> None:
    """Duas afirmações precisas, medidas em 2026-09-12 — não uma intuição.

    **(1) 2022 EXERCITA a regra do art. 106.** Quatro UFs caem com a fração
    exatamente em 0,5 (`2 × resto == vagas`): AP, MT, SC e TO — todas com 4/8 ou
    8/16. Nelas o quociente desce, por força do "desprezada a fração se igual ou
    inferior a meio".

    **(2) E mesmo assim o golden NÃO discrimina a regra.** Trocar `> 0,5` por
    `>= 0,5` em `quociente_eleitoral` muda o quociente dessas quatro UFs em 1
    voto — e **nenhuma cadeira muda de dono**, porque 1 voto é desprezível frente
    aos totais partidários. Verificado por mutação: com a troca, os 6 testes
    deste arquivo continuam passando.

    Quem protege a regra são os casos sintéticos de
    `test_cadeiras.py::test_caso1_*`, construídos para que 1 voto de diferença no
    quociente **mude** a distribuição.

    A primeira versão deste teste afirmava que 2022 não exercitava a regra. Estava
    errada, e foi o próprio teste que corrigiu ao rodar. Fica o registro de que
    "o golden passou" e "o golden prova" são coisas diferentes.
    """
    na_fronteira = set()
    for uf, dados in sorted(golden.items()):
        votos_validos = sum(
            a["legenda"] + sum(c[1] for c in a["candidatos"]) for a in dados["agremiacoes"]
        )
        if 2 * (votos_validos % dados["vagas"]) == dados["vagas"]:
            na_fronteira.add(uf)

    assert na_fronteira == UFS_NA_FRONTEIRA_DO_ARREDONDAMENTO, (
        "o conjunto de UFs na fronteira do arredondamento mudou — o dado mudou, "
        "ou o gerador da fixture mudou. Reinvestigue antes de ajustar."
    )
