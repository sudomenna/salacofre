"""
api/model/party_mapping.py

Tabela de mapping `partido → swing histórico` para o K-1 fallback **Tier 1**
(ADR-0015 — S05/F4c).

Contexto:
  Quando um candidato 2026 não tem mapping direto com candidato 2022 (mudança
  de candidatura, novo partido na disputa, etc.), o orchestrator antes
  desabilitava o modelo (Tier 3, comportamento S04). Tier 1 troca isso por
  uma aproximação: usa o swing histórico do **partido principal** do
  candidato em 2022 como prior.

Estratégia:
  Mapping é `cod_candidato_2026 -> sigla_partido_2022`. Em produção real,
  o mapping vem do catálogo de candidatos da spec 011 (após o DivulgaCand).
  Aqui mantemos um stub manual + um helper que consulta historical_results
  pra extrair o swing médio do partido em 2022 dado uma UF.

Determinismo (§ 6):
  - Sem random. Lookup table puro, sem cache mutável.
  - Helper `partido_swing_uf_2022` retorna mesmo valor dado mesmo histórico.

NÃO substitui:
  - Tier 2 (prior de pesquisa pré-eleitoral) — vive em `pre_election_polls.py`.
  - Tier 3 (disable model) — fallback final em `compute_uf_projections`.
"""

from __future__ import annotations

from typing import Any


# ---------------------------------------------------------------------------
# Catálogo manual S05 — placeholder pré-DivulgaCand 2026
# ---------------------------------------------------------------------------
#
# Esses cod_candidato são SINTÉTICOS (aceitam fixture S05). O DivulgaCand
# 2026 publica os reais pré-eleição; spec 011 vai popular este dict via job
# de import. Mantemos aqui apenas como referência de SCHEMA + amostra
# para os testes Python.
#
# Em runtime, se o cod_candidato não estiver no dict, helper retorna None
# → Tier 1 não se aplica → orchestrator desce para Tier 2.
CANDIDATO_2026_TO_PARTIDO_2022: dict[int, str] = {
    # Sigla → exemplos sintéticos comuns nos testes:
    1001: "PT",   # candidato sintético PT em fixtures
    1002: "PL",   # candidato sintético PL em fixtures
    1003: "MDB",  # candidato 2026 do MDB (Tier 1 — usa swing MDB 2022)
    1004: "PDT",  # candidato 2026 PDT
    1005: "UNIÃO",
    1006: "NOVO",
}


def partido_for_candidato_2026(cod_candidato_2026: int) -> str | None:
    """Retorna a sigla do partido principal do candidato em 2022.

    `None` se o candidato não está no catálogo — caller (orchestrator)
    desce para Tier 2.
    """
    return CANDIDATO_2026_TO_PARTIDO_2022.get(int(cod_candidato_2026))


def partido_swing_uf_2022(
    partido: str,
    uf: str,
    historical: list[dict[str, Any]],
    eleitorado_zona: dict[tuple[str, int], int],
) -> float | None:
    """Swing médio do PARTIDO numa UF em 2022 (Tier 1 — ADR-0015).

    Pondera pct_validos das zonas pelo eleitorado da zona. Retorna `None`
    se o partido não tem nenhuma zona com pct_validos válido na UF (sinaliza
    pro caller que Tier 1 não conseguiu produzir prior — desce pra Tier 2).

    Args:
        partido: Sigla (ex.: "PT", "MDB", "PL").
        uf: Sigla da UF (ex.: "SP").
        historical: Lista de rows `historical_results` (já carregada pelo
            orchestrator). Cada row: `{uf, cod_zona, partido, pct_validos, ...}`.
        eleitorado_zona: `{(uf, cod_zona) -> eleitores_aptos}`.

    Returns:
        Fração [0, 1] — média ponderada do pct_validos do partido nas zonas
        daquela UF em 2022. Ou None se sem dados.

    Determinismo: zero random, função pura.
    """
    num = 0.0
    den = 0.0
    for h in historical:
        if h.get("uf") != uf:
            continue
        if h.get("partido") != partido:
            continue
        pct = h.get("pct_validos")
        if pct is None:
            continue
        w = eleitorado_zona.get((uf, int(h["cod_zona"])), 0)
        if w <= 0:
            continue
        num += float(pct) * w
        den += w
    if den <= 0:
        return None
    return num / den
