"""tests/unit/model/test_uf_outros.py

2026-09-19 — pedido do dono: o balão de hover dos mapas passa de 3 para 4
candidaturas + uma linha "Outros" com o percentual que TODOS os demais
somados representam. `api/model/project.py` publica o corte em
`TOP_CANDIDATOS_POR_UF` e o agregado em `EdgeUfRow.outros`.

Regra durável do projeto: **teste que não discrimina não vale**
(`feedback_teste_que_nao_discrimina`). Cada caso abaixo nomeia, no docstring,
a mutação que ele mata — e as fixtures são escolhidas para que a mutação
PRODUZA um número diferente, não para que o caso pareça realista.

O que este arquivo trava:
  1. a cauda é SOMADA candidatura a candidatura, nunca `100 − Σ(top 4)`;
  2. `pct_atual` do agregado é TUDO-OU-NADA (uma cauda com um membro não
     medido não publica soma parcial);
  3. cauda vazia ⇒ a chave `outros` NÃO EXISTE (nunca `{"pct": 0}`);
  4. `votos_atuais` sobrevive à ausência de `pct_atual` — `0` é um fato;
  5. `top_candidatos` continua sendo uma lista de CANDIDATURAS (≤ 4, toda
     entrada com `id`) — o agregado não virou um elemento sintético dela;
  6. o custo em bytes do par (4ª entrada + `outros`) no pior caso de CADA
     campo fica abaixo de um teto medido, aqui na CI e não num documento.
"""

from __future__ import annotations

import json
from typing import Any

from api.model.project import TOP_CANDIDATOS_POR_UF, build_edge_payload

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _linha(
    cand: int,
    pct_projetado: float,
    *,
    pct_atual: float | None = None,
    votos_atuais: int | None = None,
    nome_len: int | None = None,
) -> dict[str, Any]:
    linha: dict[str, Any] = {
        "cargo": 1,
        "turno": 1,
        "uf": "BA",
        "candidato_id": cand,
        "pct_projetado": pct_projetado,
        "pct_apurado": 80.0,
    }
    if votos_atuais is not None:
        linha["votos_atuais"] = votos_atuais
    if pct_atual is not None:
        linha["pct_atual"] = pct_atual
    if nome_len is not None:
        linha["_nome_len"] = nome_len
    return linha


#: 🔴 A SOMA DOS `pct_projetado` É 99,1 — **de propósito, nunca 100**.
#:
#: Este é o ponto inteiro do caso "soma da cauda". Com Σ = 100 exatos, somar a
#: cauda (9,1) e subtrair o topo de 100 (100 − 90,9 = 9,1) dariam o MESMO
#: número, e o teste passaria com a mutação `100 - Σ(top 4)` aplicada — isto
#: é, não discriminaria nada. Com Σ = 99,1 as duas contas divergem: a soma dá
#: 8,2 e a subtração dá 9,1.
#:
#: E 99,1 não é um número arbitrário de laboratório: `pct_projetado` é um
#: PONTO por candidatura (mean de um bootstrap próprio, arredondado em 5
#: casas), e a soma dos pontos de uma UF real fecha perto de 100, não em 100.
#: A fixture reproduz a condição de produção, não uma exceção.
SEIS_CANDIDATURAS: list[dict[str, Any]] = [
    _linha(13, 40.0, pct_atual=39.0, votos_atuais=400_000),
    _linha(22, 25.0, pct_atual=26.0, votos_atuais=250_000),
    _linha(12, 15.0, pct_atual=14.5, votos_atuais=150_000),
    _linha(15, 10.9, pct_atual=11.0, votos_atuais=109_000),
    _linha(30, 5.1, pct_atual=5.2, votos_atuais=51_000),
    _linha(50, 3.1, pct_atual=3.0, votos_atuais=31_000),
]
#: Σ = 40.0 + 25.0 + 15.0 + 10.9 + 5.1 + 3.1 = 99.1
#: top 4 = 90.9  ·  cauda = 8.2  ·  `100 − top4` = 9.1  (≠ 8.2 → discrimina)

NATIONAL_ROWS: list[dict[str, Any]] = [
    {"candidato_id": 13, "pct_projetado": 40.0, "rank": 1},
    {"candidato_id": 22, "pct_projetado": 25.0, "rank": 2},
    {"candidato_id": 12, "pct_projetado": 15.0, "rank": 3},
    {"candidato_id": 15, "pct_projetado": 10.9, "rank": 4},
    {"candidato_id": 30, "pct_projetado": 5.1, "rank": 5},
    {"candidato_id": 50, "pct_projetado": 3.1, "rank": 6},
]


def _linha_ba(uf_rows: list[dict[str, Any]], **kwargs: Any) -> dict[str, Any]:
    payload = build_edge_payload(
        cargo=1,
        turno=1,
        ts_iso="2026-10-04T18:23:15Z",
        uf_rows=[{k: v for k, v in r.items() if not k.startswith("_")} for r in uf_rows],
        national_rows=NATIONAL_ROWS,
        eleitorado_total_by_uf={"BA": 500},
        **kwargs,
    )
    (ba,) = [u for u in payload["por_uf"] if u["sigla"] == "BA"]
    return ba


# ---------------------------------------------------------------------------
# 1. A cauda é somada, não subtraída
# ---------------------------------------------------------------------------


def test_outros_soma_a_cauda_candidato_a_candidato():
    """Mata: `outros["pct"] = 100 - sum(top 4)`.

    Com a fixture somando 99,1, a soma da cauda vale 8,2 e a subtração vale
    9,1. Qualquer implementação por complemento devolve 9,1 e falha aqui.
    """
    ba = _linha_ba(SEIS_CANDIDATURAS)

    assert "outros" in ba
    assert ba["outros"]["pct"] == 8.2
    assert ba["outros"]["n_candidatos"] == 2

    # E a soma das cinco linhas do balão reproduz o total da corrida — 99,1,
    # NÃO 100. Se algum dia der 100 exato sem o modelo ter mudado, é sinal de
    # que alguém reintroduziu o complemento.
    soma_top = sum(c["pct"] for c in ba["top_candidatos"])
    assert round(soma_top + ba["outros"]["pct"], 5) == 99.1


def test_outros_soma_votos_e_pct_atual_da_cauda():
    """Mata: somar a cauda errada (p.ex. `ordered[3:]`, que incluiria a 4ª
    candidatura no agregado E na lista, contando-a duas vezes).

    `ordered[3:]` daria `n_candidatos == 3`, `pct == 19.1` e
    `votos_atuais == 191_000`. A cauda correta é `ordered[4:]`.
    """
    ba = _linha_ba(SEIS_CANDIDATURAS)

    assert ba["outros"]["n_candidatos"] == 2
    assert ba["outros"]["votos_atuais"] == 51_000 + 31_000
    assert ba["outros"]["pct_atual"] == 8.2  # 5.2 + 3.0


# ---------------------------------------------------------------------------
# 2. `pct_atual` é tudo-ou-nada
# ---------------------------------------------------------------------------


def test_pct_atual_da_cauda_e_tudo_ou_nada():
    """Mata DUAS mutações de uma vez, ambas plausíveis de escrever:

      - `sum(float(p or 0.0) for p in pcts_cauda)` → publicaria 5,2
      - `sum(float(p) for p in pcts_cauda if p is not None)` → publicaria 5,2

    As duas coeririam ausência em medição: diriam "os demais somam 5,2%"
    quando 5,2% é o que UM deles tem e do outro não se sabe nada. A chave TEM
    de sumir.

    Por que a 6ª e não a 5ª: é a cauda inteira que precisa estar medida, e
    deixar a 5ª medida torna o `sum(...)` parcial um número *bonito* e
    plausível — exatamente o que passaria despercebido numa revisão.
    """
    rows = [dict(r) for r in SEIS_CANDIDATURAS]
    rows[5]["pct_atual"] = None

    ba = _linha_ba(rows)

    assert "pct_atual" not in ba["outros"], "soma parcial de pct_atual vazou"
    # O resto do agregado continua inteiro — a ausência de um campo não
    # apaga os outros.
    assert ba["outros"]["pct"] == 8.2
    assert ba["outros"]["n_candidatos"] == 2
    assert ba["outros"]["votos_atuais"] == 82_000


def test_pct_atual_ausente_na_linha_tambem_suprime_a_chave():
    """Mesma regra, outro modo de falta: a linha não tem a CHAVE `pct_atual`
    (caller legado — ver `test_top_candidatos_votos_pct_atual.py::
    test_linha_sem_as_chaves_nenhuma_regressao_de_keyerror`).

    Mata: `rc.get("pct_atual", 0.0)` — um default posicional que trataria
    chave ausente como "medimos zero".
    """
    rows = [dict(r) for r in SEIS_CANDIDATURAS]
    del rows[5]["pct_atual"]

    ba = _linha_ba(rows)

    assert "pct_atual" not in ba["outros"]


# ---------------------------------------------------------------------------
# 3. Sem cauda, sem chave
# ---------------------------------------------------------------------------


def test_uf_com_exatamente_quatro_candidaturas_nao_emite_outros():
    """Mata: emitir `{"pct": 0.0, "n_candidatos": 0}` quando a cauda é vazia.

    "Não há mais ninguém" e "os demais somam 0%" são estados diferentes: um
    objeto zerado faria a tela escrever "Outros 0,0%" numa corrida de quatro,
    afirmando a existência de candidaturas que não existem. `EdgeUfRow.outros`
    é opcional no TS justamente para isto.

    Também mata `if cauda is not None:` (a lista vazia é `not None` e passaria)
    e `if len(ordered) > TOP_CANDIDATOS_POR_UF - 1:` (erro de fencepost).
    """
    ba = _linha_ba(SEIS_CANDIDATURAS[:4])

    assert "outros" not in ba, f"cauda vazia emitiu {ba.get('outros')!r}"
    assert len(ba["top_candidatos"]) == 4


def test_uf_com_menos_de_quatro_candidaturas_nao_quebra():
    """Corrida de três (existe: a fixture de simulação tem uma UF com 2
    candidaturas de Governador). Sem cauda, sem chave, sem exceção."""
    ba = _linha_ba(SEIS_CANDIDATURAS[:3])

    assert "outros" not in ba
    assert len(ba["top_candidatos"]) == 3


# ---------------------------------------------------------------------------
# 4. `votos_atuais` sobrevive à ausência de `pct_atual`
# ---------------------------------------------------------------------------


def test_votos_atuais_da_cauda_sobrevive_a_imputacao_nacional():
    """A UF inteira veio de `impute_uf_from_national` (cargo 1, nenhuma zona
    apurada): `pct_atual=None` em TODA linha e `votos_atuais=0` em toda linha
    — é literalmente o que aquela função monta
    (`api/model/extrapolation.py`, `"pct_atual_votaveis": None`,
    `"votos_atuais": 0`).

    Mata: omitir `votos_atuais` junto com `pct_atual` (tratar os dois como a
    mesma espécie de ausência). `0` aqui é um FATO — zero boletim chegado —
    e some do payload se alguém acoplar os dois campos.
    """
    rows = [
        {**dict(r), "pct_atual": None, "votos_atuais": 0} for r in SEIS_CANDIDATURAS
    ]

    ba = _linha_ba(rows)

    assert "pct_atual" not in ba["outros"]
    assert ba["outros"]["votos_atuais"] == 0, "o fato 'zero boletim' foi apagado"
    assert ba["outros"]["n_candidatos"] == 2


def test_votos_atuais_ausente_na_linha_suprime_so_esse_campo():
    """Caller legado sem a chave `votos_atuais`: o campo some do agregado
    (nada foi medido), mas `pct`/`n_candidatos` continuam.

    Mata: `int(rc.get("votos_atuais") or 0)` — a forma que o plano de
    2026-09-19 propunha, e que publicaria `"votos_atuais": 0` para a cauda no
    mesmo payload em que `top_candidatos[]` omite o campo. Duas respostas
    diferentes para a mesma ausência, e a de "Outros" seria a afirmação falsa
    "a cauda não recebeu nenhum voto".
    """
    rows = [dict(r) for r in SEIS_CANDIDATURAS]
    del rows[5]["votos_atuais"]

    ba = _linha_ba(rows)

    assert "votos_atuais" not in ba["outros"]
    assert ba["outros"]["pct"] == 8.2
    assert ba["outros"]["n_candidatos"] == 2


# ---------------------------------------------------------------------------
# 5. `top_candidatos` continua sendo uma lista de candidaturas
# ---------------------------------------------------------------------------


def test_top_candidatos_tem_no_maximo_quatro_entradas_todas_com_id():
    """Mata: enfiar o agregado DENTRO de `top_candidatos[]` como uma 5ª
    entrada sintética.

    `top_candidatos` tem contrato de CANDIDATURAS (spec 018 / ADR-0042): toda
    entrada tem `id` de urna, e é por esse `id` que o consumidor cruza foto
    (ADR-0041) e cor. Uma entrada "Outros" precisaria de um `id` sentinela, e
    um sentinela num espaço de números de urna é exatamente como nasce o bug
    "o 13 de Alagoas". Uma 5ª entrada — com ou sem `id` — falha aqui.
    """
    ba = _linha_ba(SEIS_CANDIDATURAS)
    top = ba["top_candidatos"]

    assert len(top) <= TOP_CANDIDATOS_POR_UF == 4
    assert len(top) == 4
    for item in top:
        assert "id" in item, f"entrada sem id de urna: {item!r}"
        assert isinstance(item["id"], int)
        assert "n_candidatos" not in item, "o agregado virou elemento da lista"

    # E o corte respeita a ordem por `pct_projetado` desc.
    assert [c["id"] for c in top] == [13, 22, 12, 15]


def test_o_corte_e_a_cauda_leem_a_mesma_constante():
    """Mata a divergência que a constante existe para impedir: um `[:4]` com
    um `[5:]` republicaria a 5ª candidatura como linha própria E dentro de
    "Outros", e `Σtop + outros` passaria de 100 sem nada reclamar.

    A soma abaixo é a prova: nenhuma candidatura contada duas vezes, nenhuma
    esquecida — top + cauda reconstrói a corrida inteira.
    """
    ba = _linha_ba(SEIS_CANDIDATURAS)

    assert len(ba["top_candidatos"]) + ba["outros"]["n_candidatos"] == len(
        SEIS_CANDIDATURAS
    )
    assert ba["outros"]["votos_atuais"] + sum(
        c["votos_atuais"] for c in ba["top_candidatos"]
    ) == sum(r["votos_atuais"] for r in SEIS_CANDIDATURAS)


# ---------------------------------------------------------------------------
# 6. Orçamento de bytes — MEDIDO, no pior caso de cada campo
# ---------------------------------------------------------------------------

#: Teto do delta por UF, em bytes serializados compactos.
#:
#: 🔴 **286 B é o número MEDIDO por este teste, não uma estimativa.** O plano
#: de 2026-09-19 estimava +224 B por UF (4ª entrada 141 B + objeto `outros`
#: 82 B) e propunha travar em 260 B. As duas coisas ficaram para trás na
#: medição — a 4ª entrada sozinha custa 194 B no pior caso e o objeto `outros`
#: custa 92 B (contando a chave e a vírgula). O teto aqui é o MEDIDO mais uma
#: folga pequena, nunca o estimado: este repositório já transformou estimativa
#: em garantia mais de uma vez (ADR-0046, emenda de 17/09; memória durável
#: "medir payload com amostra aleatória mente"), e a resposta acordada é pôr o
#: número na CI e não num documento.
#:
#: Onde a estimativa errou: ela pressupunha nome de urna ASCII. O teto do TSE
#: são 30 CARACTERES, e 30 caracteres acentuados ocupam 60 BYTES em UTF-8 — o
#: dobro. Medido nas três hipóteses (20 candidaturas, cauda de 16):
#:   - nome 30 acentuados, sigla 14, id 5 dígitos ............. 286 B
#:   - nome 30 ASCII,      sigla 12, id 5 dígitos ............. 254 B
#:   - nome 30 ASCII,      sigla 12, id 2 dígitos (cargo 1/3/5)  251 B
#: Nem a hipótese mais branda cabe nos 224 B estimados.
#:
#: A folga de 300: cobre ~14 B de deriva (um `id` mais largo, uma sigla nova)
#: sem quebrar a CI por nada — e NÃO cobre um campo novo, que é o que este
#: teste existe para barrar. Qualquer campo acrescentado a `top_candidatos[]`
#: ou a `outros` reprova aqui (o mais barato deles, `"x":0`, já custa 6 B por
#: entrada × 4 = 24 B).
#:
#: Contexto do orçamento: teto DURO de 1 MB no store
#: (`GLOBAL_CONFIG_STORE_LIMIT_BYTES`, `lib/edge-config/writer.ts:335`), erro
#: do writer bem antes disso, store hoje em ~410 KB, e aviso por chave
#: nacional em 75 KiB (`EDGE_CONFIG_NATIONAL_WARN_BYTES`) contra um payload
#: nacional de ~17,3 KB. 286 B × 27 UFs = **7.722 B por chave** — o payload
#: nacional passa a ~25,0 KB, um terço do limiar de aviso. Cabe com folga,
#: e é essa folga que o teste protege de sumir sem ninguém ver.
ORCAMENTO_DELTA_POR_UF_BYTES = 300

#: Nome de urna no pior caso: 30 caracteres (o teto do TSE), TODOS acentuados
#: — 60 bytes em UTF-8. Medir com ASCII subestimaria em 30 B por entrada, que
#: é exatamente o erro da estimativa do plano.
NOME_URNA_PIOR_CASO = "Á" * 30


def _bytes(obj: Any) -> int:
    """Serialização compacta, a mesma que vai para o Edge Config."""
    return len(
        json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    )


def _uf_pior_caso(n_cands: int = 20) -> dict[str, Any]:
    """Uma linha de `por_uf` com o pior caso de CADA campo simultaneamente.

    A combinação é impossível numa UF real (30 caracteres acentuados em toda
    candidatura, 30 milhões de votos para cada uma), e é isso que a torna um
    limite SUPERIOR honesto: nenhuma UF de verdade custa mais que isto.

    Pior caso, campo a campo, e por quê:
      - `nome`    — 30 caracteres acentuados = 60 B (ver `NOME_URNA_PIOR_CASO`).
      - `sqcand`  — 12 dígitos, a maior das duas larguras (11 **ou** 12, ver
                    `EdgeUfRow.top_candidatos[].sqcand`).
      - `partido` — 14 caracteres: uma sigla maior que a mais longa em uso
                    hoje ("REPUBLICANOS", 12), para o teto sobreviver a uma
                    federação de nome comprido.
      - `id`      — 5 dígitos. Em cargo 1/3/5 o número de urna tem 2, mas o
                    tipo não promete isso e o gerador de simulação já usa
                    ids de 4.
      - `pct` / `pct_atual` — 5 casas decimais é a precisão publicada
                    (`_frac_to_pct`, `NUMERIC(8,5)`); `99.99999` é a forma
                    mais larga de um percentual.
      - `votos_atuais` — 8 dígitos cobre a maior UF (SP, ~30 M votos).
      - `n_candidatos` — 20 candidaturas ⇒ cauda de 16 ⇒ DOIS dígitos. (O
                    plano sugeria 12, que deixaria este campo num dígito só;
                    com 20 o pior caso deste campo também fica coberto — mede
                    1 B a mais.)
    """
    ids = [10_000 + i for i in range(n_cands)]
    rows = [
        {
            "cargo": 1,
            "turno": 1,
            "uf": "SP",
            "candidato_id": cid,
            "pct_projetado": round(90.0 - i * 4.0 + 0.99999, 5),
            "pct_apurado": 99.99999,
            "votos_atuais": 30_000_000 - i,
            "pct_atual": round(89.0 - i * 4.0 + 0.99999, 5),
        }
        for i, cid in enumerate(ids)
    ]
    identidade = {
        ("SP", cid): {
            "nome": NOME_URNA_PIOR_CASO,
            "sqcand": f"{700_000_000_000 + cid}",
        }
        for cid in ids
    }
    partidos = {cid: "REPUBLICANOSXX" for cid in ids}

    payload = build_edge_payload(
        cargo=1,
        turno=1,
        ts_iso="2026-10-04T18:23:15Z",
        uf_rows=rows,
        national_rows=[
            {
                "candidato_id": cid,
                "pct_projetado": rows[i]["pct_projetado"],
                "rank": i + 1,
            }
            for i, cid in enumerate(ids)
        ],
        eleitorado_total_by_uf={"SP": 34_000_000},
        identidade_by_cand=identidade,
        partido_by_cand=partidos,
    )
    (sp,) = [u for u in payload["por_uf"] if u["sigla"] == "SP"]
    return sp


def test_delta_de_bytes_por_uf_no_pior_caso():
    """Mede o custo REAL do par (4ª entrada + `outros`) e o compara ao teto.

    O "antes" é reconstruído a partir do MESMO objeto — 3 entradas, sem
    `outros`, que é literalmente o payload que o código de 18/09 produzia —
    para que a diferença seja o que esta mudança acrescentou e nada mais.
    Medir dois payloads gerados separadamente deixaria ruído de outros campos
    entrar na conta.

    Mata: qualquer campo novo enfiado em `top_candidatos[]` ou em `outros`.
    Se a medição divergir, o número medido é o que vale — o teto NÃO se
    ajusta para caber numa estimativa.
    """
    sp = _uf_pior_caso()

    assert len(sp["top_candidatos"]) == TOP_CANDIDATOS_POR_UF
    assert sp["outros"]["n_candidatos"] == 16
    # Os dois campos opcionais presentes: é o caso mais caro, e é o que o
    # teto precisa cobrir.
    assert "pct_atual" in sp["outros"]
    assert "votos_atuais" in sp["outros"]

    antes = {k: v for k, v in sp.items() if k != "outros"}
    antes["top_candidatos"] = sp["top_candidatos"][:3]

    delta = _bytes(sp) - _bytes(antes)

    assert delta <= ORCAMENTO_DELTA_POR_UF_BYTES, (
        f"delta medido de {delta} B por UF (×27 = {delta * 27} B por chave) "
        f"estourou o teto de {ORCAMENTO_DELTA_POR_UF_BYTES} B"
    )


def test_chave_nacional_inteira_continua_longe_do_limiar_de_aviso():
    """O delta por UF só importa multiplicado por 27, contra o limiar por
    chave. `EDGE_CONFIG_NATIONAL_WARN_BYTES` são 75 KiB
    (`lib/edge-config/writer.ts:423`) e o payload nacional real mede ~17,3 KB.

    Mata: uma mudança que passe folgada no delta por UF e ainda assim
    encoste no aviso por acumulação — o modo de falha que só aparece quando
    alguém multiplica.
    """
    sp = _uf_pior_caso()
    antes = {k: v for k, v in sp.items() if k != "outros"}
    antes["top_candidatos"] = sp["top_candidatos"][:3]
    delta_por_chave = (_bytes(sp) - _bytes(antes)) * 27

    warn_nacional_bytes = 75 * 1024
    payload_nacional_hoje_bytes = 17_301

    assert payload_nacional_hoje_bytes + delta_por_chave < warn_nacional_bytes / 2, (
        f"+{delta_por_chave} B por chave levaria o payload nacional a "
        f"{payload_nacional_hoje_bytes + delta_por_chave} B, metade ou mais do "
        f"limiar de aviso de {warn_nacional_bytes} B"
    )
