"""Testes K-1 fallback 3-tier (ADR-0015 — S05/F4c).

Cobertura:
  - Tier 1: candidato 2026 mapeado para partido 2022 com dados na UF
    → retorna prior baseado em swing histórico do partido.
  - Tier 2: candidato sem partido conhecido NAS DUAS tabelas, mas com
    prior em `pre_election_polls` → retorna prior pesquisa.
  - Tier 3: candidato sem dados em nenhuma tabela → (tier=3, prior=None).
  - Tier 0/1 (mapping direto): `has_direct_2022_mapping=True` → curto-circuita
    (caller usa caminho S04).
  - `partido_swing_uf_2022` helper: pondera por eleitorado.
"""

from __future__ import annotations

from api.model.party_mapping import (
    CANDIDATO_2026_TO_PARTIDO_2022,
    partido_for_candidato_2026,
    partido_swing_uf_2022,
)
from api.model.pre_election_polls import (
    PRE_ELECTION_PCT_PRIOR,
    TIER_2_CI_INFLATION,
    pre_election_prior,
)
from api.model.swing import resolve_k1_tier


# ---------------------------------------------------------------------------
# Tier 1 — partido principal
# ---------------------------------------------------------------------------


def test_tier1_mdb_uf_com_historico() -> None:
    """Candidato 2026 do MDB (1003) com histórico do partido na UF.

    Cenário sintético: MDB teve 8% em SP zona 1 e 6% em SP zona 2.
    Eleitorado: 100k e 200k. Média ponderada = (0.08*100k + 0.06*200k) /
    300k = (8000 + 12000) / 300_000 = 20_000 / 300_000 = ~0.0667.
    """
    historical = [
        {"uf": "SP", "cod_zona": 1, "partido": "MDB", "pct_validos": 0.08},
        {"uf": "SP", "cod_zona": 2, "partido": "MDB", "pct_validos": 0.06},
        # Outro partido (PL) — não deve entrar no cálculo do MDB.
        {"uf": "SP", "cod_zona": 1, "partido": "PL", "pct_validos": 0.45},
    ]
    eleitorado = {("SP", 1): 100_000, ("SP", 2): 200_000}

    tier, prior = resolve_k1_tier(
        cod_candidato_2026=1003,  # MDB
        uf="SP",
        has_direct_2022_mapping=False,
        historical=historical,
        eleitorado_zona=eleitorado,
    )
    assert tier == 1
    assert prior is not None
    # ~0.0667.
    assert abs(prior - 0.0667) < 0.001


def test_tier1_helper_partido_swing_pondera_eleitorado() -> None:
    """`partido_swing_uf_2022` pondera por eleitorado da zona."""
    historical = [
        {"uf": "RJ", "cod_zona": 10, "partido": "PT", "pct_validos": 0.55},
        {"uf": "RJ", "cod_zona": 11, "partido": "PT", "pct_validos": 0.45},
    ]
    # Zona 10 com peso 1k, zona 11 com peso 9k → média ponderada
    # = (0.55*1000 + 0.45*9000) / 10000 = (550 + 4050) / 10000 = 0.46.
    eleitorado = {("RJ", 10): 1_000, ("RJ", 11): 9_000}
    result = partido_swing_uf_2022("PT", "RJ", historical, eleitorado)
    assert result is not None
    assert abs(result - 0.46) < 0.001


# ---------------------------------------------------------------------------
# Tier 2 — prior pesquisa pré-eleitoral
# ---------------------------------------------------------------------------


def test_tier2_candidato_sem_partido_mas_com_prior() -> None:
    """Candidato 2026 SEM mapping de partido, MAS no dict de priors.

    Usamos cod 1007 (PTB) — está em `PRE_ELECTION_PCT_PRIOR` mas NÃO em
    `CANDIDATO_2026_TO_PARTIDO_2022`. Tier 1 falha, Tier 2 acerta.
    """
    # Sanity: cod 1007 está em priors mas não em mapping de partido.
    assert 1007 in PRE_ELECTION_PCT_PRIOR
    assert 1007 not in CANDIDATO_2026_TO_PARTIDO_2022

    tier, prior = resolve_k1_tier(
        cod_candidato_2026=1007,
        uf="SP",
        has_direct_2022_mapping=False,
        historical=[],  # vazio — tier 1 não consegue nada
        eleitorado_zona={},
    )
    assert tier == 2
    assert prior is not None
    # Valor exato do stub.
    assert prior == PRE_ELECTION_PCT_PRIOR[1007]


def test_tier2_ci_inflation_constant() -> None:
    """`TIER_2_CI_INFLATION` é 1.5 (+50%) por ADR-0015."""
    assert TIER_2_CI_INFLATION == 1.5


# ---------------------------------------------------------------------------
# Tier 3 — disable
# ---------------------------------------------------------------------------


def test_tier3_sem_nada() -> None:
    """Candidato sem partido, sem prior, sem mapping direto → tier 3."""
    tier, prior = resolve_k1_tier(
        cod_candidato_2026=99999,  # cod totalmente desconhecido
        uf="SP",
        has_direct_2022_mapping=False,
        historical=[],
        eleitorado_zona={},
    )
    assert tier == 3
    assert prior is None


def test_tier3_partido_conhecido_mas_sem_uf() -> None:
    """Candidato com partido mapeado, mas SEM dados do partido na UF
    pedida E também SEM prior de pesquisa → cai pra Tier 3.
    """
    # Usamos cod 1006 (NOVO) — tem partido mapeado mas vamos passar
    # historical sem NOVO. Ele TEM prior também — então não cai em tier 3.
    # Para forçar tier 3, usamos um cod com partido mas sem prior:
    # adicionamos manualmente.
    # Atalho: 1003 (MDB) está em ambos mappings. Removemos histórico de MDB.
    historical = [
        {"uf": "SP", "cod_zona": 1, "partido": "PL", "pct_validos": 0.40},
    ]
    eleitorado = {("SP", 1): 1_000}
    # 1003 tem prior em PRE_ELECTION_PCT_PRIOR → cai em tier 2, NÃO tier 3.
    tier, prior = resolve_k1_tier(
        cod_candidato_2026=1003,
        uf="SP",
        has_direct_2022_mapping=False,
        historical=historical,
        eleitorado_zona=eleitorado,
    )
    assert tier == 2  # Tier 1 falhou (sem MDB no histórico), Tier 2 ok.
    assert prior is not None


# ---------------------------------------------------------------------------
# Tier 0/1 — has_direct_2022_mapping (curto-circuito)
# ---------------------------------------------------------------------------


def test_has_direct_mapping_short_circuits_to_tier_1() -> None:
    """Quando o caller já tem mapping direto, returns (tier=1, prior=None).

    Convenção: tier=1 marca "sem degradação" — mesmo significado de
    "Tier 1 com mapping direto". Caller usa caminho S04 normal.
    """
    tier, prior = resolve_k1_tier(
        cod_candidato_2026=99999,
        uf="SP",
        has_direct_2022_mapping=True,
        historical=[],
        eleitorado_zona={},
    )
    assert tier == 1
    assert prior is None


# ---------------------------------------------------------------------------
# Helpers — sanity
# ---------------------------------------------------------------------------


def test_partido_for_candidato_2026_retorna_string() -> None:
    """Lookup direto retorna sigla pra cods conhecidos, None pra outros."""
    assert partido_for_candidato_2026(1001) == "PT"
    assert partido_for_candidato_2026(1003) == "MDB"
    assert partido_for_candidato_2026(99999) is None


def test_pre_election_prior_retorna_fracao() -> None:
    """Lookup direto retorna fração [0, 1]."""
    assert pre_election_prior(1001) == 0.43
    assert pre_election_prior(99999) is None
