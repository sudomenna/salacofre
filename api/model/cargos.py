"""api/model/cargos.py

Espelho Python da tabela canônica de cargos — `lib/config/cargos.ts`.

## Por que existe um espelho, e não um import

O orchestrator roda em Python (runtime Vercel `python3.14`, ver
`api/model/project.py`) e o catálogo de cargos é TypeScript. Não há
mecanismo de import entre os dois: o processo Python não carrega módulo TS,
e serializar a tabela em build time acrescentaria um passo de geração ao
`pnpm build` que nada mais no repositório usa.

O que este módulo NÃO é: uma segunda fonte de verdade. `lib/config/cargos.ts`
continua sendo a única — ele nasceu justamente para acabar com as quatro
cópias desalinhadas do mesmo conhecimento (ver o cabeçalho de lá). O que
protege a sincronia é um teste, não a boa vontade:
`tests/unit/model/test_cargos_sync.py` lê o `.ts` e falha se qualquer campo
aqui divergir do de lá. Um cargo novo, ou uma mudança de `vagas_por_uf`,
quebra o teste antes de chegar ao ar.

## O que o modelo lê daqui

Dois campos, e só:

  - `vagas_por_uf` — quantos eleitos a UF entrega. É o `vagas` de
    `p_vitoria.p_eleito` (RF-103): 1 para Presidente/Governador, **2** para
    Senador em 2026 (renovação de 2/3 → 54 vagas), `None` para Deputado
    Federal, que é proporcional e tem bancada variável por UF.
  - `granularidade` — `"zona"` ou `"uf"` (ADR-0026 item 1). Vai para
    `metodo.granularidade` no payload (RF-102): é a diferença que a tela de
    Senador precisa declarar ao leitor, porque a projeção dele NÃO é zona a
    zona como a de Presidente e Governador.

Constituição § 9: nenhum I/O, tabela estática e funções puras — igual ao
módulo TS que este espelha.
"""

from __future__ import annotations

from typing import Literal, TypedDict

Granularidade = Literal["uf", "zona"]


class CargoInfo(TypedDict):
    """Subconjunto de `CargoInfo` (TS) que o modelo consome.

    `token`, `slug` e `label` entram porque o teste de sincronia os confere —
    é barato manter a linha inteira alinhada e caro descobrir depois que só
    metade estava.
    """

    cd: int
    token: str
    slug: str
    label: str
    vagas_por_uf: int | None
    tem_segundo_turno: bool
    tem_arquivo_br: bool
    proporcional: bool
    granularidade: Granularidade


CARGOS: tuple[CargoInfo, ...] = (
    {
        "cd": 1,
        "token": "pres",
        "slug": "presidente",
        "label": "Presidente",
        "vagas_por_uf": 1,
        "tem_segundo_turno": True,
        "tem_arquivo_br": True,
        "proporcional": False,
        "granularidade": "zona",
    },
    {
        "cd": 3,
        "token": "gov",
        "slug": "governador",
        "label": "Governador",
        "vagas_por_uf": 1,
        "tem_segundo_turno": True,
        "tem_arquivo_br": False,
        "proporcional": False,
        "granularidade": "zona",
    },
    {
        "cd": 5,
        "token": "sen",
        "slug": "senador",
        "label": "Senador",
        "vagas_por_uf": 2,
        "tem_segundo_turno": False,
        "tem_arquivo_br": False,
        "proporcional": False,
        "granularidade": "uf",
    },
    {
        "cd": 6,
        "token": "dep",
        "slug": "deputado-federal",
        "label": "Deputado Federal",
        "vagas_por_uf": None,
        "tem_segundo_turno": False,
        "tem_arquivo_br": False,
        "proporcional": True,
        "granularidade": "uf",
    },
)

_POR_CD: dict[int, CargoInfo] = {c["cd"]: c for c in CARGOS}


# ---------------------------------------------------------------------------
# Fatos da eleição de 2026 — não são configuração, e não se derivam do ciclo
# ---------------------------------------------------------------------------

#: Cadeiras da casa legislativa inteira, por cargo. O Senado tem 81 (3 por UF
#: × 27); em 2026 renova 2/3 delas. Presidente e Governador não têm "casa" —
#: ficam fora do dicionário.
TOTAL_CADEIRAS: dict[int, int] = {5: 81}

#: Cadeiras que a eleição de 2026 renova, por cargo. **54** para o Senado —
#: 2 por UF × 27. É o denominador que a tela nacional de Senador exibe
#: (RF-107), e ele não pode ser derivado das UFs que já apuraram: às 18h,
#: com 4 estados apurados, a derivação diria "8 vagas em disputa", o que é
#: falso. O número é fixo desde antes da urna abrir.
VAGAS_EM_DISPUTA_2026: dict[int, int] = {5: 54}


def total_cadeiras(cd: int) -> int | None:
    """Tamanho da casa legislativa do cargo, ou `None` quando não se aplica."""
    return TOTAL_CADEIRAS.get(int(cd))


def vagas_em_disputa(cd: int) -> int | None:
    """Cadeiras renovadas em 2026, ou `None` quando não se aplica."""
    return VAGAS_EM_DISPUTA_2026.get(int(cd))


def cargo_info(cd: int) -> CargoInfo | None:
    """Metadados do cargo, ou `None` quando o código não é coberto.

    `None` em vez de exceção: o orchestrator aceita `cargo` de 1 a 99 no corpo
    do trigger (`ProjectRequest`) e precisa degradar — um cargo desconhecido
    cai no comportamento default (1 vaga, granularidade de zona), nunca
    derruba o ciclo.
    """
    return _POR_CD.get(int(cd))


def vagas_por_uf(cd: int, default: int = 1) -> int:
    """Vagas em disputa por UF. `default` cobre cargo desconhecido e o
    proporcional (Deputado Federal, `vagas_por_uf = None`), cuja bancada vem
    de tabela própria e não desta."""
    info = cargo_info(cd)
    if info is None:
        return default
    vagas = info["vagas_por_uf"]
    return default if vagas is None else vagas


def granularidade(cd: int, default: Granularidade = "zona") -> Granularidade:
    """Granularidade de ingestão do cargo (ADR-0026 item 1)."""
    info = cargo_info(cd)
    return info["granularidade"] if info is not None else default
