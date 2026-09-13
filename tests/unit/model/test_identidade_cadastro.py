"""tests/unit/model/test_identidade_cadastro.py — spec 018, RF-143/RF-144/RF-145.

O **degrau 3** da cadeia de nome: o cadastro de candidaturas (tabela
`candidatos`), lido quando o boletim do TSE não trouxe o nome.

A cadeia inteira, para orientação:

    1. EA20 `cand[].nmu`  ← `extract_identidade_by_cand`
    2. EA20 `cand[].nm`   ← idem
    3. **cadastro, por `(cargo, uf, numero)`**  ← este arquivo
    4. `f"Candidato {n}"` ← construtores de payload

Cada teste aqui existe para morrer sob uma mutação específica, nomeada no seu
docstring. Um teste que passa com a mutação aplicada não está testando o que
diz testar — a rede que importa é a inversão de precedência (degrau 3 por cima
do 1), a comparação de sequencial como texto, e o filtro de publicabilidade.
"""

from typing import Any

from api.model.project import (
    build_edge_payload,
    fetch_identidade_cadastro,
    merge_identidade_cadastro,
    resolver_candidatura,
)

# ---------------------------------------------------------------------------
# Fixtures — linhas como o banco as devolve, e um cursor falso por cima delas.
# ---------------------------------------------------------------------------

# Colunas de `fetch_identidade_cadastro`, nesta ordem:
#   uf, numero, sq_candidato, nome, nome_urna, situacao_julgamento,
#   publicavel, cargo
COLUNAS = (
    "uf",
    "numero",
    "sq_candidato",
    "nome",
    "nome_urna",
    "situacao_julgamento",
    "publicavel",
    "cargo",
)

DEFERIDO = "DEFERIDO"
DEFERIDO_RECURSO = "DEFERIDO EM PRAZO RECURSAL OU COM RECURSO"
INDEFERIDO_RECURSO = "INDEFERIDO EM PRAZO RECURSAL OU COM RECURSO"


def _linha(
    uf: str,
    numero: int,
    sq: str,
    nome: str,
    *,
    nome_urna: str | None = None,
    situacao: str = DEFERIDO,
    publicavel: bool = True,
    cargo: int = 3,
) -> tuple:
    """Uma linha de `candidatos` na ORDEM das colunas da query.

    Tupla, não dict, porque é assim que `psycopg` devolve — um dict aqui
    esconderia um erro de ordem de coluna, que é silencioso e troca nome por
    situação de julgamento.
    """
    return (
        uf,
        numero,
        sq,
        nome,
        nome_urna if nome_urna is not None else nome,
        situacao,
        publicavel,
        cargo,
    )


def _dict(linha: tuple) -> dict[str, Any]:
    """A mesma linha como mapping — o formato que `resolver_candidatura` lê."""
    return dict(zip(COLUNAS, linha, strict=True))


class _FakeCursor:
    def __init__(self, conn: "_FakeConn") -> None:
        self._conn = conn

    def execute(self, sql: str, params: tuple) -> None:
        if self._conn.erro is not None:
            raise self._conn.erro
        self._conn.sqls.append(sql)
        self._conn.params.append(params)
        (cargo,) = params
        self._conn.rows_devolvidas = [
            r for r in self._conn.rows if r[COLUNAS.index("cargo")] == cargo
        ]

    def fetchall(self) -> list[tuple]:
        return self._conn.rows_devolvidas

    def __enter__(self) -> "_FakeCursor":
        return self

    def __exit__(self, *a: Any) -> None:
        return None


class _FakeConn:
    """Cursor falso que devolve as linhas CRUAS, sem aplicar o `WHERE`.

    Deliberado: o `WHERE cargo = %s AND publicavel` da query é o recorte
    barato, mas quem **decide** publicabilidade é o degrau (a) de
    `resolver_candidatura`. Devolvendo também as não-publicáveis, o teste de
    filtro exercita a guarda que decide, não a que economiza rede — e a
    mutação "remove o filtro do resolver" fica visível.
    """

    def __init__(self, rows: list[tuple], erro: Exception | None = None) -> None:
        self.rows = rows
        self.rows_devolvidas: list[tuple] = []
        self.erro = erro
        self.sqls: list[str] = []
        self.params: list[tuple] = []
        self.rollbacks = 0

    def cursor(self) -> _FakeCursor:
        return _FakeCursor(self)

    def rollback(self) -> None:
        self.rollbacks += 1


# ---------------------------------------------------------------------------
# A precedência — o EA20 ganha, sempre
# ---------------------------------------------------------------------------


def test_ea20_com_nmu_vence_o_cadastro_para_o_mesmo_par():
    """Mutação que deve derrubar: **inverter a precedência** no merge
    (`out[chave] = cadastro[...]` sem o `if chave in out: continue`).

    Mesmo candidato, dois nomes diferentes. Quem está em `cand[]` do boletim
    está concorrendo — substituição de última hora inclusa —, e o cadastro
    decide no máximo se a linha TEM nome, nunca qual é.
    """
    ea20 = {("SP", 13): {"nome": "NOME DO BOLETIM", "sqcand": "250002553928"}}
    cadastro = {("SP", 13): {"nome": "NOME DO CADASTRO", "sqcand": "50002553927"}}

    merged = merge_identidade_cadastro(ea20, cadastro, ["SP"])

    assert merged[("SP", 13)]["nome"] == "NOME DO BOLETIM"
    # `sqcand` acompanha o nome: a fusão é por ENTRADA, não por campo. Costurar
    # o sequencial do cadastro ao nome do boletim penduraria a FOTO errada no
    # nome certo, e isso não aparece em log nenhum.
    assert merged[("SP", 13)]["sqcand"] == "250002553928"


def test_sem_ea20_o_nome_vem_do_cadastro():
    """Mutação: **não implementar o degrau 3** (merge devolvendo só o EA20)."""
    cadastro = {("SP", 13): {"nome": "NOME DO CADASTRO", "sqcand": "50002553927"}}

    merged = merge_identidade_cadastro({}, cadastro, ["SP"])

    assert merged[("SP", 13)]["nome"] == "NOME DO CADASTRO"
    assert merged[("SP", 13)]["sqcand"] == "50002553927"


def test_sem_ea20_e_sem_cadastro_o_payload_cai_no_placeholder():
    """Mutação: **quebrar o degrau 4** (emitir `nome: ""`, ou `None`).

    O placeholder é o contrato de degradação — a tela renderiza
    `"Candidato 13"`, nunca um rótulo vazio.
    """
    merged = merge_identidade_cadastro({}, {}, ["SP"])
    assert merged == {}

    payload = build_edge_payload(
        cargo=1,
        turno=1,
        ts_iso="2026-10-04T18:23:15Z",
        uf_rows=[
            {
                "cargo": 1,
                "turno": 1,
                "uf": "SP",
                "candidato_id": 13,
                "pct_projetado": 55.0,
                "pct_apurado": 80.0,
            }
        ],
        national_rows=[{"candidato_id": 13, "pct_projetado": 55.0, "rank": 1}],
        eleitorado_total_by_uf={"SP": 1000},
        identidade_by_cand=merged,
    )

    assert payload["national"]["candidatos"][0]["nome"] == "Candidato 13"
    assert "nome" not in payload["por_uf"][0]["top_candidatos"][0]


def test_o_nome_do_cadastro_atravessa_ate_top_candidatos():
    """A ponta a ponta do degrau 3: cadastro → merge → `top_candidatos`.

    Sem este teste, os dois anteriores passariam com o merge correto e o
    payload ignorando o mapa.
    """
    merged = merge_identidade_cadastro(
        {},
        {("SP", 13): {"nome": "NOME DO CADASTRO", "sqcand": "250002553928"}},
        ["SP"],
    )

    payload = build_edge_payload(
        cargo=3,
        turno=1,
        ts_iso="2026-10-04T18:23:15Z",
        uf_rows=[
            {
                "cargo": 3,
                "turno": 1,
                "uf": "SP",
                "candidato_id": 13,
                "pct_projetado": 55.0,
                "pct_apurado": 80.0,
            }
        ],
        national_rows=[{"candidato_id": 13, "pct_projetado": 55.0, "rank": 1}],
        eleitorado_total_by_uf={"SP": 1000},
        identidade_by_cand=merged,
    )

    top = payload["por_uf"][0]["top_candidatos"][0]
    assert top["nome"] == "NOME DO CADASTRO"
    assert top["sqcand"] == "250002553928"


# ---------------------------------------------------------------------------
# Publicabilidade — fail-closed (ADR-0040)
# ---------------------------------------------------------------------------


def test_candidatura_nao_publicavel_nao_da_nome():
    """Mutação: **remover o filtro** `if not c.get("publicavel"): continue`.

    Um indeferido fora da urna não pode ganhar nome por esta porta. O cursor
    falso devolve a linha de propósito (não aplica o `WHERE`), então o que
    está sob teste é a guarda que decide, não a que economiza rede.
    """
    conn = _FakeConn([_linha("SP", 13, "250002553928", "FORA DA URNA", publicavel=False)])

    mapa = fetch_identidade_cadastro(conn, cargo=3)

    assert mapa == {}


def test_entre_publicavel_e_nao_publicavel_vence_a_publicavel_mesmo_com_sq_menor():
    """A contraprova do teste acima: sem ela, "devolver sempre `{}`" passaria.

    E o sequencial da não-publicável é MAIOR — se o filtro caísse e o
    desempate rodasse sozinho, ele escolheria a errada.
    """
    conn = _FakeConn(
        [
            _linha("SP", 13, "250002553928", "FORA DA URNA", publicavel=False),
            _linha("SP", 13, "50002553927", "NA URNA", publicavel=True),
        ]
    )

    mapa = fetch_identidade_cadastro(conn, cargo=3)

    assert mapa[("SP", 13)]["nome"] == "NA URNA"


# ---------------------------------------------------------------------------
# A chave é o PAR — ADR-0042 item 1
# ---------------------------------------------------------------------------


def test_sp_e_ba_com_o_mesmo_numero_13_dao_nomes_diferentes():
    """Mutação: **chave plana** (dicionário por número sozinho).

    Todo candidato a governador do PT do país concorre sob o 13. Um mapa plano
    poria o de São Paulo nos outros 26 estados, arbitrariamente, conforme a
    ordem de leitura do banco.
    """
    conn = _FakeConn(
        [
            _linha("BA", 13, "50002553927", "JAQUELINE DA BA"),
            _linha("SP", 13, "250002553928", "FERNANDO DE SP"),
        ]
    )

    mapa = fetch_identidade_cadastro(conn, cargo=3)

    assert mapa[("SP", 13)]["nome"] == "FERNANDO DE SP"
    assert mapa[("BA", 13)]["nome"] == "JAQUELINE DA BA"
    assert len(mapa) == 2


def test_resolver_candidatura_nao_atravessa_uf_com_lista_nao_agrupada():
    """Mutação: **tirar a comparação de UF** de `resolver_candidatura`.

    O teste acima não pega essa mutação, e é importante dizer por quê:
    `fetch_identidade_cadastro` agrupa por `(uf, numero)` ANTES de resolver, de
    modo que cada grupo já é de uma UF só e a guarda interna fica redundante
    ali. Mas `resolver_candidatura` é pública e é a gêmea de `resolverCandidato`
    (`data-pipeline/candidatos-resolve.ts`), que recebe a lista INTEIRA e
    filtra sozinha. Quem chamar assim — e o lado TS chama — precisa da guarda.

    O sequencial de SP é maior de propósito: sem a comparação de UF, ele
    venceria também a resolução da Bahia.
    """
    todos = [
        _dict(_linha("BA", 13, "50002553927", "JAQUELINE DA BA")),
        _dict(_linha("SP", 13, "250002553928", "FERNANDO DE SP")),
    ]

    assert resolver_candidatura(3, "SP", 13, todos)["nome"] == "FERNANDO DE SP"
    assert resolver_candidatura(3, "BA", 13, todos)["nome"] == "JAQUELINE DA BA"


def test_resolver_candidatura_nao_atravessa_cargo():
    """Mesma família: sem a comparação de cargo, o governador do 13 e o
    senador do 13 viram o mesmo candidato.
    """
    todos = [
        _dict(_linha("SP", 13, "250002553928", "GOVERNADOR", cargo=3)),
        _dict(_linha("SP", 13, "250002553999", "SENADOR", cargo=5)),
    ]

    assert resolver_candidatura(3, "SP", 13, todos)["nome"] == "GOVERNADOR"
    assert resolver_candidatura(5, "SP", 13, todos)["nome"] == "SENADOR"


# ---------------------------------------------------------------------------
# Colisão de `(cargo, uf, numero)` — os 4 casos reais da Bahia
# ---------------------------------------------------------------------------


def test_colisao_6_ba_2727_devolve_um_so_o_de_maior_sequencial():
    """Mutação: **pegar o primeiro** (`melhor = grupo[0]`).

    Caso real medido em 2026-09-13: MARLI LIMA aparece duas vezes em
    `6|BA|2727`, os dois registros INDEFERIDOS sob recurso — então o degrau
    (b) empata e quem decide é o degrau (c), o maior `sq_candidato`. Os dois
    têm o mesmo nome, por isso a asserção é sobre o `sqcand`: é o que endereça
    a FOTO (ADR-0041), e trocá-lo troca o rosto na tela.
    """
    conn = _FakeConn(
        [
            _linha(
                "BA", 2727, "50002542551", "MARLÍ BÁRBARA LIMA DOS SANTOS",
                nome_urna="MARLI LIMA", situacao=INDEFERIDO_RECURSO, cargo=6,
            ),
            _linha(
                "BA", 2727, "50002543999", "MARLÍ BÁRBARA LIMA DOS SANTOS",
                nome_urna="MARLI LIMA", situacao=INDEFERIDO_RECURSO, cargo=6,
            ),
        ]
    )

    mapa = fetch_identidade_cadastro(conn, cargo=6)

    assert len(mapa) == 1
    assert mapa[("BA", 2727)]["sqcand"] == "50002543999"


def test_colisao_6_ba_2727_independe_da_ordem_de_leitura_do_banco():
    """Constituição § 6. A mesma colisão, com as linhas invertidas, produz o
    mesmo vencedor — o desempate é comparação TOTAL, não posição na lista.
    """
    a = _dict(
        _linha("BA", 2727, "50002542551", "MARLI LIMA",
               situacao=INDEFERIDO_RECURSO, cargo=6)
    )
    b = _dict(
        _linha("BA", 2727, "50002543999", "MARLI LIMA",
               situacao=INDEFERIDO_RECURSO, cargo=6)
    )

    assert resolver_candidatura(6, "BA", 2727, [a, b])["sq_candidato"] == "50002543999"
    assert resolver_candidatura(6, "BA", 2727, [b, a])["sq_candidato"] == "50002543999"


def test_colisao_3_ba_27_prefere_o_deferido_sobre_o_indeferido():
    """Mutação: **pular o degrau do julgamento** (ir direto ao maior
    sequencial).

    Caso real: em `3|BA|27` o INDEFERIDO (ESTÊVÃO, `…36579`) tem sequencial
    MAIOR que o DEFERIDO (ARIEL CAPISTRANO, `…35253`). Sem o degrau (b), o
    desempate escolhe ESTÊVÃO — e o teste que só olhasse "devolveu um" passaria
    igual.
    """
    conn = _FakeConn(
        [
            _linha(
                "BA", 27, "50002535253", "ARIEL DA SILVA CAPISTRANO",
                nome_urna="ARIEL CAPISTRANO", situacao=DEFERIDO_RECURSO, cargo=3,
            ),
            _linha(
                "BA", 27, "50002536579", "JOSE ESTEVAO DOS SANTOS BARBOSA",
                nome_urna="ESTÊVÃO", situacao=INDEFERIDO_RECURSO, cargo=3,
            ),
        ]
    )

    mapa = fetch_identidade_cadastro(conn, cargo=3)

    assert mapa[("BA", 27)]["nome"] == "ARIEL CAPISTRANO"
    assert mapa[("BA", 27)]["sqcand"] == "50002535253"


def test_indeferido_nao_e_confundido_com_deferido_por_substring():
    """`"INDEFERIDO…"` CONTÉM `"DEFERIDO"`. Mutação: trocar `startswith` por
    `in` — os dois virariam "deferidos", o degrau (b) empataria e o desempate
    cairia no sequencial, escolhendo o INDEFERIDO de `3|BA|27`.
    """
    deferido = _dict(_linha("BA", 27, "50002535253", "ARIEL",
                            situacao=DEFERIDO_RECURSO, cargo=3))
    indeferido = _dict(_linha("BA", 27, "50002536579", "ESTÊVÃO",
                              situacao=INDEFERIDO_RECURSO, cargo=3))

    vencedor = resolver_candidatura(3, "BA", 27, [deferido, indeferido])

    assert vencedor["nome"] == "ARIEL"


def test_sequencial_de_11_e_de_12_digitos_ordena_como_numero():
    """Mutação: **comparar como string** (`str(a) > str(b)`).

    O sequencial tem 11 OU 12 dígitos — 1.995 das 8.323 candidaturas dos
    quatro cargos têm 11. Em texto, `"99999999999"` (11) vence
    `"100000000000"` (12), e o desempate pega o registro ERRADO: sem erro, sem
    log, sem teste vermelho. É o único caso desta suíte que não tem
    correspondente na base real de hoje — as 4 colisões de 2026 têm sequenciais
    de mesma largura —, e é justamente por isso que precisa ser sintético: a
    armadilha existe e o dado atual não a dispara.
    """
    onze = _dict(_linha("BA", 2727, "99999999999", "ONZE DIGITOS",
                        situacao=INDEFERIDO_RECURSO, cargo=6))
    doze = _dict(_linha("BA", 2727, "100000000000", "DOZE DIGITOS",
                        situacao=INDEFERIDO_RECURSO, cargo=6))

    # Comparação textual escolheria "ONZE DIGITOS" nas DUAS ordens.
    assert resolver_candidatura(6, "BA", 2727, [onze, doze])["nome"] == "DOZE DIGITOS"
    assert resolver_candidatura(6, "BA", 2727, [doze, onze])["nome"] == "DOZE DIGITOS"


# ---------------------------------------------------------------------------
# RF-145 — o bloco nacional de cargo 3 e 5 continua mudo
# ---------------------------------------------------------------------------


def test_nome_do_cadastro_nao_vaza_para_o_bloco_nacional_de_cargo_3_e_5():
    """Mutação: **"melhorar" o nacional** estendendo o nome a cargo 3/5.

    Asserção NEGATIVA sobre o bloco serializado — a positiva ("o placeholder
    está lá") passaria com nomes reais ao lado, porque `top_candidatos`
    legitimamente os carrega no mesmo payload.

    O desenho que garante isto é na ORIGEM: `identidade_nacional` chega vazio
    fora do cargo 1. O nome do cadastro entra em `identidade_by_cand` pelo
    mesmo caminho do nome do EA20, então a garantia vale para os dois sem um
    `if` novo no ponto de uso — e este teste é o que prova que ela vale para o
    degrau 3 também, não só para os degraus 1 e 2.
    """
    import json

    merged = merge_identidade_cadastro(
        {},
        {
            ("SP", 13): {"nome": "FERNANDO DE SP", "sqcand": "250002553928"},
            ("BA", 13): {"nome": "JAQUELINE DA BA", "sqcand": "50002553927"},
        },
        ["SP", "BA"],
    )

    uf_rows = [
        {"cargo": 3, "turno": 1, "uf": "SP", "candidato_id": 13,
         "pct_projetado": 55.0, "pct_apurado": 80.0},
        {"cargo": 3, "turno": 1, "uf": "BA", "candidato_id": 13,
         "pct_projetado": 45.0, "pct_apurado": 80.0},
    ]
    national_rows = [{"candidato_id": 13, "pct_projetado": 50.0, "rank": 1}]

    for cargo in (3, 5):
        payload = build_edge_payload(
            cargo=cargo,
            turno=1,
            ts_iso="2026-10-04T18:23:15Z",
            uf_rows=uf_rows,
            national_rows=national_rows,
            eleitorado_total_by_uf={"SP": 1000, "BA": 500},
            identidade_by_cand=merged,
        )
        serializado = json.dumps(payload["national"]["candidatos"], ensure_ascii=False)
        assert "FERNANDO DE SP" not in serializado
        assert "JAQUELINE DA BA" not in serializado
        assert payload["national"]["candidatos"][0]["nome"] == "Candidato 13"
        # Mas a linha da UF fala — é a assimetria do ADR-0042 item 4, e sem
        # esta asserção "nunca publicar nada" passaria o teste.
        por_uf = {u["sigla"]: u for u in payload["por_uf"]}
        assert por_uf["SP"]["top_candidatos"][0]["nome"] == "FERNANDO DE SP"


# ---------------------------------------------------------------------------
# Cargo 1 — a UF do cadastro é `"BR"`
# ---------------------------------------------------------------------------


def test_cargo_1_expande_br_para_as_ufs_do_ciclo():
    """Mutação: **não expandir `"BR"`** — o degrau 3 ficaria inerte no único
    cargo em que o número identifica uma pessoa no país inteiro.

    As 12 candidaturas presidenciais publicáveis moram sob `uf = "BR"` no
    cadastro (medido: cargo 1 tem exatamente uma UF distinta, `"BR"`), mas o
    payload as procura por `("SP", 13)`, `("BA", 13)`, …
    """
    cadastro = {("BR", 13): {"nome": "PRESIDENCIAVEL", "sqcand": "280000600001"}}

    merged = merge_identidade_cadastro({}, cadastro, ["SP", "BA", "sp"])

    assert merged[("SP", 13)]["nome"] == "PRESIDENCIAVEL"
    assert merged[("BA", 13)]["nome"] == "PRESIDENCIAVEL"
    # A chave crua não sobra no mapa como UF fantasma: `("BR", 13)` não casa
    # com corrida nenhuma do payload.
    assert ("BR", 13) not in merged


def test_cargo_1_expandido_nao_sobrepoe_a_uf_que_o_ea20_ja_nomeou():
    """A expansão de `"BR"` não é um bypass da precedência do EA20."""
    ea20 = {("SP", 13): {"nome": "NOME DO BOLETIM"}}
    cadastro = {("BR", 13): {"nome": "PRESIDENCIAVEL", "sqcand": "280000600001"}}

    merged = merge_identidade_cadastro(ea20, cadastro, ["SP", "BA"])

    assert merged[("SP", 13)]["nome"] == "NOME DO BOLETIM"
    assert merged[("BA", 13)]["nome"] == "PRESIDENCIAVEL"


# ---------------------------------------------------------------------------
# Degradação — constituição § 7
# ---------------------------------------------------------------------------


def test_query_falhando_nao_derruba_o_ciclo():
    """Mutação: **deixar propagar** (tirar o `try/except` da query).

    O replay 2022 roda contra um banco sem cadastro de 2026 populado; se a
    ausência da tabela levantasse, o gate OT-4 quebraria junto. Aqui a falha
    vira `{}` e a cadeia do RF-144 cai no degrau 4.
    """
    conn = _FakeConn([], erro=RuntimeError('relation "candidatos" does not exist'))

    mapa = fetch_identidade_cadastro(conn, cargo=3)

    assert mapa == {}
    # E a transação é liberada: sem o rollback, o `INSERT INTO projections`
    # logo adiante morreria com "current transaction is aborted".
    assert conn.rollbacks == 1


def test_cadastro_vazio_devolve_o_ea20_intacto_e_nao_muta_a_entrada():
    """O merge é puro: quem ainda segura o mapa do EA20 não o vê mudar."""
    ea20 = {("SP", 13): {"nome": "NOME DO BOLETIM"}}

    merged = merge_identidade_cadastro(ea20, {}, ["SP"])
    merged[("SP", 13)]["nome"] = "MUTADO"

    assert ea20[("SP", 13)]["nome"] == "NOME DO BOLETIM"


# ---------------------------------------------------------------------------
# A query — uma por ciclo, e sem filtro de turno
# ---------------------------------------------------------------------------


def test_uma_query_por_ciclo_nao_uma_por_candidato():
    """Orçamento apertado na noite da apuração: 7.221 linhas em cargo 6 são
    UMA leitura, agrupada e resolvida em memória.
    """
    rows = [
        _linha("SP", n, f"2500025{n:05d}", f"CANDIDATO {n}", cargo=6)
        for n in range(1000, 1200)
    ]
    conn = _FakeConn(rows)

    mapa = fetch_identidade_cadastro(conn, cargo=6)

    assert len(conn.sqls) == 1
    assert len(mapa) == 200


def test_a_query_nao_filtra_por_turno():
    """O cadastro do TSE só tem `turno = 1` — não há republicação para o 2º
    turno. Um `AND turno = %s` devolveria zero linha em 25/10 e o degrau 3
    sumiria em silêncio, que é a forma clássica deste defeito no projeto.
    """
    conn = _FakeConn([_linha("SP", 13, "250002553928", "FERNANDO DE SP")])

    fetch_identidade_cadastro(conn, cargo=3)

    assert "turno" not in conn.sqls[0]
    assert conn.params[0] == (3,)


def test_cargo_e_parametro_da_query_nao_interpolacao():
    """O cargo viaja como parâmetro de bind, nunca concatenado na SQL."""
    conn = _FakeConn([_linha("SP", 13, "250002553928", "FERNANDO DE SP", cargo=5)])

    fetch_identidade_cadastro(conn, cargo=5)

    assert "%s" in conn.sqls[0]
    assert "cargo = 5" not in conn.sqls[0]


def test_nome_de_urna_vence_o_nome_completo():
    """Mesmo critério dos degraus 1 e 2 (`nmu` antes de `nm`): é o nome pelo
    qual o eleitor conhece o candidato e o que o próprio TSE exibe.
    """
    conn = _FakeConn(
        [
            _linha(
                "BA", 2744, "50002554210", "DURVAL QUEIROZ ALVES NETO",
                nome_urna="DURVAL NETO", cargo=6,
            )
        ]
    )

    mapa = fetch_identidade_cadastro(conn, cargo=6)

    assert mapa[("BA", 2744)]["nome"] == "DURVAL NETO"


def test_candidatura_sem_nome_nenhum_nao_vira_entrada_vazia():
    """Entrada com `nome: ""` faria a tela renderizar um rótulo vazio em vez
    de cair no placeholder honesto — troca um fallback por um buraco.
    """
    conn = _FakeConn([_linha("SP", 13, "250002553928", "  ", nome_urna="")])

    assert fetch_identidade_cadastro(conn, cargo=3) == {}
