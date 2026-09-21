"""tests/unit/model/test_resgate_por_apurado.py

2026-09-21 — decisão do dono: quem lidera os BOLETINS JÁ APURADOS não pode
sumir do payload só porque a projeção não o vê entre os 4 primeiros.

## O defeito

`top_candidatos` era `ordered[:TOP_CANDIDATOS_POR_UF]`, com `ordered` por
`pct_projetado` desc. Quem estava fora ia para `outros`, que **não tem `id`
nem nome**. A UI, que desde 2026-09-20 pinta o mapa, ordena a lista e destaca
o líder pela base ATIVA (`lib/utils/lider-por-base.ts`), não tinha como
mostrar essa pessoa nem como saber que ela existia — o payload silenciava
quem estava ganhando a contagem.

## Como a fixture discrimina

O candidato `44` tem a MENOR projeção da corrida (5,0) e o MAIOR apurado
(60,0). Ele está fora do corte por projeção por construção, e é o líder do
apurado por construção. Uma fixture em que as duas ordens concordam não
conseguiria falhar — foi assim que, em 2026-09-20, eu declarei pronta uma
reordenação medindo numa UF onde as duas ordens coincidem.

    id   pct_projetado   pct_atual      onde cai
    13        55,0          10,0        prefixo (projeção)
    22        30,0           8,0        prefixo (projeção)
    30        20,0           7,0        prefixo (projeção)
    40        10,0           6,0        prefixo (projeção)
    44         5,0          60,0        RESGATADO — 1º do apurado
    50         4,0          55,0        RESGATADO — 2º do apurado
    60         3,0           1,0        cauda ("Outros")

## O que os casos travam

  - o resgatado ENTRA, com id e identidade — não some dentro de "Outros";
  - ele entra DEPOIS do prefixo (índices 4+). `margemSegundaVaga`
    (`lib/utils/margem-senado.ts:43`) lê `top_candidatos[1]`/`[2]` por
    POSIÇÃO: um resgatado no índice 1 trocaria, em silêncio, o par que decide
    a 2ª vaga do Senado;
  - o prefixo continua byte a byte o de antes — resgate não reordena projeção;
  - **partição exata**: quem foi resgatado NÃO aparece também em `outros`, e
    `outros["n_candidatos"]` cai junto. Republicá-lo nos dois lugares faria
    `Σtop + outros` passar de 100% sem nenhuma exceção ser levantada;
  - **sem `pct_atual`, sem resgate** — o caso `impute_uf_from_national`
    (cargo 1, UF sem nenhuma zona apurada). Ali não existe ordem de apurado, e
    ordenar por um `0.0` de conveniência elegeria o resgatado pelo id, não
    pelo voto. O payload tem de sair idêntico ao de antes desta data;
  - **no máximo 2**, porque são exatamente os dois postos que a derivação por
    base consome (`liderIdPorBase` e `margemPorBase`/2ª cadeira).
"""

from typing import Any

from api.model.project import (
    RESGATE_POR_APURADO,
    TOP_CANDIDATOS_POR_UF,
    build_edge_payload,
)

#: `(id, pct_projetado, pct_atual)` — ver a tabela do docstring.
CORRIDA: list[tuple[int, float, float | None]] = [
    (13, 55.0, 10.0),
    (22, 30.0, 8.0),
    (30, 20.0, 7.0),
    (40, 10.0, 6.0),
    (44, 5.0, 60.0),
    (50, 4.0, 55.0),
    (60, 3.0, 1.0),
]


def _uf_rows(com_pct_atual: bool = True) -> list[dict[str, Any]]:
    linhas: list[dict[str, Any]] = []
    for cid, proj, atual in CORRIDA:
        linha: dict[str, Any] = {
            "cargo": 1,
            "turno": 1,
            "uf": "BA",
            "candidato_id": cid,
            "pct_projetado": proj,
            "pct_apurado": 40.0,
            "votos_atuais": int((atual or 0.0) * 100),
        }
        # `None` explícito, e não chave ausente: é o que
        # `impute_uf_from_national` produz.
        linha["pct_atual"] = atual if com_pct_atual else None
        linhas.append(linha)
    return linhas


NATIONAL_ROWS: list[dict[str, Any]] = [
    {"candidato_id": cid, "pct_projetado": proj, "rank": i + 1}
    for i, (cid, proj, _) in enumerate(CORRIDA)
]


def _linha_ba(com_pct_atual: bool = True) -> dict[str, Any]:
    payload = build_edge_payload(
        cargo=1,
        turno=1,
        ts_iso="2026-10-04T18:23:15Z",
        uf_rows=_uf_rows(com_pct_atual),
        national_rows=NATIONAL_ROWS,
        eleitorado_total_by_uf={"BA": 500},
    )
    (ba,) = [u for u in payload["por_uf"] if u["sigla"] == "BA"]
    return ba


def test_lider_do_apurado_fora_do_corte_por_projecao_entra_no_payload():
    ids = [c["id"] for c in _linha_ba()["top_candidatos"]]
    assert 44 in ids, (
        "o líder do apurado (44, 60%) sumiu do payload — é exatamente o "
        "defeito que este arquivo existe para travar"
    )


def test_o_segundo_do_apurado_tambem_entra_porque_e_quem_decide_a_2a_cadeira():
    ids = [c["id"] for c in _linha_ba()["top_candidatos"]]
    assert 50 in ids


def test_resgatados_entram_DEPOIS_do_prefixo_nunca_no_meio():
    """`margemSegundaVaga` lê `top_candidatos[1]`/`[2]` por POSIÇÃO."""
    top = _linha_ba()["top_candidatos"]
    prefixo = [c["id"] for c in top[:TOP_CANDIDATOS_POR_UF]]
    assert prefixo == [13, 22, 30, 40], (
        "o prefixo por projeção mudou — um resgatado entrou no meio e "
        "trocaria em silêncio o par que decide a 2ª vaga do Senado"
    )
    assert [c["id"] for c in top[TOP_CANDIDATOS_POR_UF:]] == [44, 50]


def test_resgatados_saem_da_cauda_a_particao_continua_exata():
    ba = _linha_ba()
    ids_top = {c["id"] for c in ba["top_candidatos"]}
    outros = ba["outros"]
    # Só o 60 sobrou de fora.
    assert outros["n_candidatos"] == 1, (
        "quem foi resgatado continua contado dentro de 'Outros' — está "
        "publicado duas vezes, e Σtop + outros passa de 100%"
    )
    assert outros["pct"] == 3.0
    assert outros["pct_atual"] == 1.0
    # A consequência aritmética da partição: as duas somas fecham em 100 (±
    # resíduo de arredondamento). Se o resgatado estivesse nos DOIS lados,
    # `pct_atual` somaria 60 a mais e esta linha seria a que gritaria.
    soma_atual = sum(c["pct_atual"] for c in ba["top_candidatos"]) + outros["pct_atual"]
    assert abs(soma_atual - 147.0) < 0.01, (
        f"Σ pct_atual = {soma_atual}; a fixture soma 147 por construção, e "
        "qualquer duplicação aparece aqui como excesso"
    )
    soma_proj = sum(c["pct"] for c in ba["top_candidatos"]) + outros["pct"]
    assert abs(soma_proj - 127.0) < 0.01


def test_sem_pct_atual_nao_ha_resgate_e_o_payload_e_o_de_antes():
    """`impute_uf_from_national`: não existe ordem de apurado para consultar."""
    top = _linha_ba(com_pct_atual=False)["top_candidatos"]
    assert [c["id"] for c in top] == [13, 22, 30, 40]
    # E ninguém ganhou um `pct_atual` de conveniência.
    assert all("pct_atual" not in c for c in top)


def test_no_maximo_RESGATE_POR_APURADO_entram():
    top = _linha_ba()["top_candidatos"]
    assert len(top) == TOP_CANDIDATOS_POR_UF + RESGATE_POR_APURADO
    # 60 é o 3º do apurado entre os de fora do corte — e NÃO entra.
    assert 60 not in [c["id"] for c in top]


# ---------------------------------------------------------------------------
# Dois casos que a MUTAÇÃO exigiu — a fixture principal não os alcançava
# ---------------------------------------------------------------------------
#
# As duas mutações abaixo sobreviveram à primeira versão deste arquivo, e em
# ambos os casos por acidente da fixture, não por acerto do código:
#
#   - "resgata 3 em vez de 2": o 3º do apurado na `CORRIDA` é o `13`, que já
#     está no prefixo — então `[:3]` e `[:2]` davam o mesmo resultado;
#   - "`pct_atual` ausente vira 0,0": com todos em `0.0` o desempate por id
#     elegia `13` e `22`, que também já estão no prefixo.
#
# Cada caso abaixo existe para tirar essa coincidência do caminho.


def test_o_TERCEIRO_do_apurado_nao_entra_mesmo_estando_fora_do_corte():
    """Fixture em que os TRÊS primeiros do apurado estão fora do prefixo."""
    linhas = [
        {
            "cargo": 1,
            "turno": 1,
            "uf": "BA",
            "candidato_id": cid,
            "pct_projetado": proj,
            "pct_apurado": 40.0,
            "votos_atuais": int(atual * 100),
            "pct_atual": atual,
        }
        # prefixo por projeção = 13, 22, 30, 40 · apurado = 44 > 50 > 60 > ...
        for cid, proj, atual in [
            (13, 55.0, 4.0),
            (22, 30.0, 3.0),
            (30, 20.0, 2.0),
            (40, 10.0, 1.0),
            (44, 5.0, 60.0),
            (50, 4.0, 55.0),
            (60, 3.0, 50.0),
        ]
    ]
    payload = build_edge_payload(
        cargo=1,
        turno=1,
        ts_iso="2026-10-04T18:23:15Z",
        uf_rows=linhas,
        national_rows=[
            {"candidato_id": r["candidato_id"], "pct_projetado": r["pct_projetado"], "rank": i + 1}
            for i, r in enumerate(linhas)
        ],
        eleitorado_total_by_uf={"BA": 500},
    )
    (ba,) = [u for u in payload["por_uf"] if u["sigla"] == "BA"]
    ids = [c["id"] for c in ba["top_candidatos"]]
    assert ids == [13, 22, 30, 40, 44, 50], (
        f"veio {ids} — o 3º do apurado (60) entrou, e não deveria: o resgate "
        "cobre os dois postos que a derivação por base consome, não mais"
    )
    assert ba["outros"]["n_candidatos"] == 1


def test_sem_pct_atual_o_desempate_por_id_NAO_pode_eleger_ninguem():
    """Prefixo com ids ALTOS, cauda com ids BAIXOS, e `pct_atual` todo `None`.

    Se a ausência virasse `0.0`, todo mundo empataria em zero e o desempate
    por id resgataria os ids baixos da cauda — elegendo pelo NÚMERO DE URNA
    duas candidaturas de quem não se mediu um único voto.
    """
    linhas = [
        {
            "cargo": 1,
            "turno": 1,
            "uf": "BA",
            "candidato_id": cid,
            "pct_projetado": proj,
            "pct_apurado": 0.0,
            "votos_atuais": 0,
            "pct_atual": None,
        }
        for cid, proj in [(90, 55.0), (80, 30.0), (70, 20.0), (60, 10.0), (10, 5.0), (20, 4.0)]
    ]
    payload = build_edge_payload(
        cargo=1,
        turno=1,
        ts_iso="2026-10-04T18:23:15Z",
        uf_rows=linhas,
        national_rows=[
            {"candidato_id": r["candidato_id"], "pct_projetado": r["pct_projetado"], "rank": i + 1}
            for i, r in enumerate(linhas)
        ],
        eleitorado_total_by_uf={"BA": 500},
    )
    (ba,) = [u for u in payload["por_uf"] if u["sigla"] == "BA"]
    ids = [c["id"] for c in ba["top_candidatos"]]
    assert ids == [90, 80, 70, 60], (
        f"veio {ids} — 10 e/ou 20 foram resgatados sem nenhum voto apurado, "
        "pelo id. 'Não sabemos' virou 'medimos zero'"
    )


def test_ordens_que_CONCORDAM_nao_resgatam_ninguem():
    """O caso normal — e o que o replay de 2022 mostra em 133 de 133.

    🔴 Este caso existe porque a primeira versão da implementação errava aqui.
    Ela pegava "os 2 melhores **entre os excluídos**" em vez da UNIÃO com os 2
    melhores da corrida inteira — e portanto resgatava 2 pessoas em TODA UF
    com 6+ candidaturas, inclusive os dois ÚLTIMOS do apurado, apagando a
    linha "Outros" de corridas de exatamente 6. Quem pegou não fui eu: foram
    os 7 casos de `test_uf_outros.py`, que estavam certos.

    Com as duas ordens concordando, o payload tem de sair **idêntico** ao de
    antes desta mudança: 4 linhas, e a cauda inteira em "Outros".
    """
    concordante = [
        {
            "cargo": 1,
            "turno": 1,
            "uf": "BA",
            "candidato_id": cid,
            "pct_projetado": proj,
            "pct_apurado": 40.0,
            "votos_atuais": int(proj * 100),
            "pct_atual": proj,  # apurado == projetado: mesma ordem
        }
        for cid, proj, _ in CORRIDA
    ]
    payload = build_edge_payload(
        cargo=1,
        turno=1,
        ts_iso="2026-10-04T18:23:15Z",
        uf_rows=concordante,
        national_rows=NATIONAL_ROWS,
        eleitorado_total_by_uf={"BA": 500},
    )
    (ba,) = [u for u in payload["por_uf"] if u["sigla"] == "BA"]
    ids = [c["id"] for c in ba["top_candidatos"]]
    assert ids == [13, 22, 30, 40], (
        f"com as ordens concordando nada deve ser resgatado, mas veio {ids} — "
        "resgate que dispara sempre gasta payload e apaga a linha 'Outros'"
    )
    assert len(ids) == len(set(ids))
    # E a cauda continua inteira: 3 candidaturas fora do corte.
    assert ba["outros"]["n_candidatos"] == 3
