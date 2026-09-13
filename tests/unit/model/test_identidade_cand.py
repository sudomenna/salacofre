"""tests/unit/model/test_identidade_cand.py — spec 018, RF-143/RF-144.

O teste que dá nome a este arquivo é o primeiro: **SP e BA compartilhando o
número 13 devem produzir DUAS entradas com nomes diferentes.** Ele é impossível
de passar com um dicionário plano chaveado só pelo número — que é exatamente o
defeito que o ADR-0042 existe para prevenir, e a forma natural de estender
`extract_partido_by_cand` por analogia.

`extract_partido_by_cand` pode ser plano porque em cargo majoritário o número
na urna É o número do partido (13 é PT em qualquer UF). Nome não herda essa
propriedade: todo candidato a governador do PT do país é o 13.
"""

from typing import Any

from api.model.project import extract_identidade_by_cand

# ---------------------------------------------------------------------------
# Fixtures — envelope EA20 mínimo, só com o que o extrator lê.
# ---------------------------------------------------------------------------


def _ea20(cargo: int, cands: list[dict[str, Any]]) -> dict[str, Any]:
    """Envelope `carg[] → agr[] → par[] → cand[]`, o caminho de `_iter_cands`.

    Cada dict de `cands` entra cru em `cand[]` — é assim que um teste pode
    omitir `nmu`, `nm` ou `sqcand` um a um sem que o construtor os reponha.
    """
    return {
        "carg": [
            {
                "cd": str(cargo),
                "agr": [
                    {
                        "n": "1",
                        "par": [{"n": "1", "sg": "PT", "cand": cands}],
                    }
                ],
            }
        ]
    }


def _snapshot(uf: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Linha como `fetch_snapshots` a devolve — `uf` incluída, que é o ponto:
    a UF já vem em cada snapshot, então o extrator não precisa de query nova
    nem de um laço de UF dentro de `_iter_cands`."""
    return {
        "uf": uf,
        "cod_municipio_tse": 0,
        "cod_zona": 0,
        "pct_apurado": 100.0,
        "payload": payload,
    }


def _cand(numero: int, **campos: Any) -> dict[str, Any]:
    base: dict[str, Any] = {"n": str(numero), "vap": "100", "pvap": "50,00", "e": "n"}
    base.update(campos)
    return base


# ---------------------------------------------------------------------------
# O teste que o dicionário plano NÃO consegue passar
# ---------------------------------------------------------------------------


def test_mesmo_numero_em_duas_ufs_produz_duas_entradas_com_nomes_distintos():
    """SP e BA, ambos com o número 13, nomes diferentes → DUAS entradas.

    Com `dict[int, str]` chaveado pelo número, a segunda UF seria descartada
    ("primeira leitura não-vazia vence") e o nome de São Paulo apareceria na
    Bahia. Não há como um dicionário plano fazer este teste passar.
    """
    snapshots = [
        _snapshot(
            "SP",
            _ea20(3, [_cand(13, nmu="FERNANDO DE SP", sqcand="250002553928")]),
        ),
        _snapshot(
            "BA",
            _ea20(3, [_cand(13, nmu="JAQUELINE DA BA", sqcand="50002553927")]),
        ),
    ]

    mapa = extract_identidade_by_cand(snapshots, cargo=3)

    assert len(mapa) == 2
    assert mapa[("SP", 13)]["nome"] == "FERNANDO DE SP"
    assert mapa[("BA", 13)]["nome"] == "JAQUELINE DA BA"
    # E a leitura de uma UF não vaza para a outra — a asserção positiva acima
    # passaria se o mapa tivesse UMA entrada que por acaso batesse; esta não.
    assert mapa[("SP", 13)]["nome"] != mapa[("BA", 13)]["nome"]


def test_sqcand_acompanha_o_par_e_nao_o_numero():
    """Mesmo número, UFs diferentes → `sqcand` diferente. A foto (ADR-0041) é
    endereçada por esta chave; trocá-la trocaria o rosto na tela."""
    snapshots = [
        _snapshot("SP", _ea20(5, [_cand(13, nmu="A DE SP", sqcand="250002553928")])),
        _snapshot("BA", _ea20(5, [_cand(13, nmu="B DA BA", sqcand="50002553927")])),
    ]

    mapa = extract_identidade_by_cand(snapshots, cargo=5)

    assert mapa[("SP", 13)]["sqcand"] == "250002553928"
    assert mapa[("BA", 13)]["sqcand"] == "50002553927"


# ---------------------------------------------------------------------------
# A cadeia de nome: nmu → nm → não entra
# ---------------------------------------------------------------------------


def test_nmu_vence_nm():
    """Degrau 1 do RF-144: o nome de urna é o que o eleitor conhece."""
    snapshots = [
        _snapshot(
            "SP",
            _ea20(1, [_cand(13, nmu="LULA", nm="LUIZ INACIO LULA DA SILVA")]),
        )
    ]

    mapa = extract_identidade_by_cand(snapshots, cargo=1)

    assert mapa[("SP", 13)]["nome"] == "LULA"


def test_nm_entra_quando_nmu_ausente():
    """Degrau 2: sem `nmu`, o nome completo serve."""
    snapshots = [_snapshot("SP", _ea20(1, [_cand(13, nm="FULANO DE TAL")]))]

    mapa = extract_identidade_by_cand(snapshots, cargo=1)

    assert mapa[("SP", 13)]["nome"] == "FULANO DE TAL"


def test_nm_entra_quando_nmu_e_string_vazia():
    """`nmu: ""` é ausência, não um nome. Um `or ""` ingênuo devolveria vazio
    e o mapa registraria um rótulo em branco no lugar do placeholder."""
    snapshots = [_snapshot("SP", _ea20(1, [_cand(13, nmu="", nm="FULANO DE TAL")]))]

    mapa = extract_identidade_by_cand(snapshots, cargo=1)

    assert mapa[("SP", 13)]["nome"] == "FULANO DE TAL"


def test_candidato_sem_nenhum_dos_dois_nomes_nao_entra():
    """Sem `nmu` e sem `nm`, a entrada **não existe** — nunca `nome: ""`.

    Mutação alvo: trocar o `continue` por `out[chave] = {"nome": ""}`. O
    consumidor cai no placeholder `"Candidato {n}"` justamente porque a chave
    está ausente; com string vazia ele renderizaria um buraco.
    """
    snapshots = [
        _snapshot(
            "SP",
            _ea20(
                3,
                [
                    _cand(13, sqcand="250002553928"),
                    _cand(22, nmu="   ", nm="  ", sqcand="250002553929"),
                    _cand(40, nmu="TEM NOME", sqcand="250002553930"),
                ],
            ),
        )
    ]

    mapa = extract_identidade_by_cand(snapshots, cargo=3)

    assert ("SP", 13) not in mapa
    assert ("SP", 22) not in mapa
    assert mapa[("SP", 40)]["nome"] == "TEM NOME"
    assert len(mapa) == 1


def test_sqcand_ausente_nao_inventa_chave():
    """Sem `sqcand` no EA20, a identidade sai só com `nome` — ausência é
    ausência, não string vazia (que endereçaria uma foto inexistente)."""
    snapshots = [_snapshot("SP", _ea20(3, [_cand(13, nmu="SEM SEQUENCIAL")]))]

    mapa = extract_identidade_by_cand(snapshots, cargo=3)

    assert mapa[("SP", 13)] == {"nome": "SEM SEQUENCIAL"}


# ---------------------------------------------------------------------------
# Determinismo e filtro de cargo
# ---------------------------------------------------------------------------


def test_primeira_leitura_nao_vazia_vence_dentro_da_mesma_uf():
    """Duas zonas da MESMA UF com o mesmo número: a primeira vence, e duas
    execuções sobre o mesmo dado dão o mesmo resultado (constituição § 6)."""
    snapshots = [
        _snapshot("SP", _ea20(3, [_cand(13, nmu="PRIMEIRA LEITURA")])),
        _snapshot("SP", _ea20(3, [_cand(13, nmu="SEGUNDA LEITURA")])),
    ]

    primeira = extract_identidade_by_cand(snapshots, cargo=3)
    segunda = extract_identidade_by_cand(snapshots, cargo=3)

    assert primeira[("SP", 13)]["nome"] == "PRIMEIRA LEITURA"
    assert primeira == segunda


def test_filtro_de_cargo_descarta_o_carg_errado():
    """`cargo=3` não pode colher candidato de `carg[].cd == "5"`."""
    snapshots = [
        _snapshot("SP", _ea20(3, [_cand(13, nmu="GOVERNADOR")])),
        _snapshot("SP", _ea20(5, [_cand(13, nmu="SENADOR")])),
    ]

    gov = extract_identidade_by_cand(snapshots, cargo=3)
    sen = extract_identidade_by_cand(snapshots, cargo=5)

    assert gov[("SP", 13)]["nome"] == "GOVERNADOR"
    assert sen[("SP", 13)]["nome"] == "SENADOR"


def test_snapshot_sem_uf_e_ignorado_em_vez_de_virar_chave_vazia():
    """UF ausente/em branco não pode virar a chave `("", 13)` — seria uma UF
    fantasma que casaria com nenhuma corrida e poluiria o mapa."""
    snapshots = [
        {"uf": None, "payload": _ea20(3, [_cand(13, nmu="ORFAO")])},
        {"uf": "  ", "payload": _ea20(3, [_cand(22, nmu="ORFAO 2")])},
        _snapshot("SP", _ea20(3, [_cand(40, nmu="LEGITIMO")])),
    ]

    mapa = extract_identidade_by_cand(snapshots, cargo=3)

    assert mapa == {("SP", 40): {"nome": "LEGITIMO"}}


def test_uf_minuscula_normaliza_para_caixa_alta():
    """A chave do payload usa sigla em caixa alta; um snapshot com `sp` não
    pode criar uma segunda corrida paralela invisível."""
    snapshots = [_snapshot("sp", _ea20(3, [_cand(13, nmu="NORMALIZADO")]))]

    mapa = extract_identidade_by_cand(snapshots, cargo=3)

    assert ("SP", 13) in mapa
    assert ("sp", 13) not in mapa


def test_mapa_vazio_para_snapshots_vazios():
    assert extract_identidade_by_cand([], cargo=3) == {}
