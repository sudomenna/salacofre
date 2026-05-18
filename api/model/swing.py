"""Swing zona-a-zona vs 2022 (RF-011) + K-1 fallback 3-tier (ADR-0015).

Pure function: dado o pct atual de um candidato em uma zona e o pct do
mesmo bloco político em 2022 na mesma zona, retorna a diferença.

Edge case (design.md "Casos de borda"):
  - Zona apurada SEM dado 2022 (mudança administrativa, criação de zona,
    etc.) → retorna None. Quem agrega (weighted_average.swing_uf) DEVE
    excluir esses zeros do somatório/denominador.

Contrato:
  - Entrada em fração [0,1] (não percentual). Conversão fica fora.
  - Saída em pontos percentuais "absolutos" no mesmo espaço (ex.: 0.05 = +5pp).

K-1 fallback 3-tier (S05/F4c — ADR-0015):
  Substituí o binário "tem mapping ou não" por uma cascata:
    Tier 1 — partido principal: usa swing histórico do partido do
             candidato em 2022 na UF (lookup em `party_mapping`).
    Tier 2 — prior pesquisa pré-eleitoral: usa valor publicado da
             última pesquisa antes da eleição (`pre_election_polls`),
             com CI inflado em +50%.
    Tier 3 — disable: comportamento S04 — pula esse candidato no modelo.
  O helper `resolve_k1_tier` retorna `(tier, value)` que o orchestrator usa
  para decidir o caminho de projeção e flagrar `model_fallback_tier` na
  linha de projection.
"""

from __future__ import annotations

from typing import Any

from api.model.party_mapping import partido_for_candidato_2026, partido_swing_uf_2022
from api.model.pre_election_polls import pre_election_prior


def swing_zone(p_now: float, p_2022: float | None) -> float | None:
    """Calcula `p_now - p_2022` para uma zona.

    Args:
        p_now: pct atual do candidato na zona (fração [0,1]).
        p_2022: pct do bloco político em 2022 na zona (fração [0,1]) ou None
            se a zona não tem mapeamento histórico.

    Returns:
        Diferença `p_now - p_2022` (pode ser negativa) ou None se sem 2022.
    """
    if p_2022 is None:
        return None
    return p_now - p_2022


# ---------------------------------------------------------------------------
# K-1 fallback 3-tier (ADR-0015)
# ---------------------------------------------------------------------------


def resolve_k1_tier(
    cod_candidato_2026: int,
    uf: str,
    has_direct_2022_mapping: bool,
    historical: list[dict[str, Any]],
    eleitorado_zona: dict[tuple[str, int], int],
) -> tuple[int, float | None]:
    """Determina qual tier do K-1 fallback aplicar e retorna o prior `p_2022`.

    Args:
        cod_candidato_2026: ID do candidato 2026 sendo projetado.
        uf: Sigla da UF.
        has_direct_2022_mapping: `True` se o candidato JÁ tem `p_2022_uf`
            calculado (Tier 0 — mapping direto, comportamento S04).
        historical: Histórico 2022 carregado (rows com `partido`, `pct_validos`).
        eleitorado_zona: Eleitores aptos `(uf, cod_zona) -> int`.

    Returns:
        `(tier, prior)`:
          - tier=0, prior=None → caller já tem mapping direto, usar caminho S04.
          - tier=1, prior=<float> → swing do partido principal substitui
            o histórico do candidato (CI normal).
          - tier=2, prior=<float> → prior de pesquisa pré-eleitoral
            (caller deve inflar CI em +50% via TIER_2_CI_INFLATION).
          - tier=3, prior=None → desabilita modelo nesse candidato/UF.

    Determinismo (§ 6): zero random. Ordem da cascata é fixa.
    """
    if has_direct_2022_mapping:
        # Tier 0 — caller já tinha p_2022_uf; ainda assim marcamos como
        # tier=1 (não-degraded) para registro no projection row. Convenção:
        # quando há mapping direto, projection.model_fallback_tier = 1.
        return 1, None

    # Tier 1 — partido principal.
    partido = partido_for_candidato_2026(cod_candidato_2026)
    if partido:
        prior_t1 = partido_swing_uf_2022(partido, uf, historical, eleitorado_zona)
        if prior_t1 is not None:
            return 1, prior_t1

    # Tier 2 — prior pesquisa pré-eleitoral (sem UF — prior nacional).
    prior_t2 = pre_election_prior(cod_candidato_2026)
    if prior_t2 is not None:
        return 2, prior_t2

    # Tier 3 — disable.
    return 3, None
