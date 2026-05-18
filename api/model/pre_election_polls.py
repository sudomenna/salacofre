"""
api/model/pre_election_polls.py

Tabela `cod_candidato_2026 -> pct_prior_pre_eleicao` para o K-1 fallback
**Tier 2** (ADR-0015 — S05/F4c).

Contexto:
  Quando o candidato 2026 não tem mapping direto com 2022 (Tier 3) E o
  partido principal também não tem dados utilizáveis na UF (Tier 1 falhou),
  o orchestrator usa um prior baseado em pesquisas pré-eleitorais como
  ponto de partida.

  Política: o CI95 é **inflado em +50%** quando este tier é acionado
  (intervalo de confiança maior reflete a incerteza adicional do prior
  de pesquisa).

Constituição § 4 (sem PII) e § 5 (sem LLM):
  - Dados são agregados públicos (Datafolha, Quaest, etc.) — sem PII.
  - Sem LLM — números literais conferidos por humano.

Status S05/F4c — STUB MANUAL:
  Os priors aqui são **placeholders** até o owner aprovar uma fonte oficial
  (provavelmente Datafolha D-7 ou simulado nacional do TSE). O ETL definitivo
  vive na spec 011 (catálogo + priors).

  Em runtime, se cod_candidato_2026 ausente do dict → caller (orchestrator)
  desce pra Tier 3 (disable modelo).

Determinismo (§ 6):
  Dict imutável (constante de módulo), zero random.
"""

from __future__ import annotations


# ---------------------------------------------------------------------------
# Priors pré-eleitorais — Datafolha simulado D-7 (PLACEHOLDER S05)
# ---------------------------------------------------------------------------
#
# Formato: cod_candidato_2026 -> pct_prior em [0, 1] (fração, não %).
# Atualizar na semana D-7 ANTES da eleição com o último simulado oficial.
#
# Hoje (2026-05-17, S05/F4c), os valores aqui são SINTÉTICOS — ajustados
# para casar com os tests de fixture multi-candidato (11 candidatos típicos
# 2022). Ranking aproximado preserva ordem 1-11 que apareceu em 2022.
PRE_ELECTION_PCT_PRIOR: dict[int, float] = {
    # Top-tier (>10%)
    1001: 0.43,   # candidato top-1 placeholder (PT-style)
    1002: 0.38,   # candidato top-2 placeholder (PL-style)
    # Tier intermediário (3–10%)
    1003: 0.045,  # MDB-style
    1004: 0.030,  # PDT-style
    1005: 0.020,  # UNIÃO-style
    1006: 0.015,  # NOVO-style
    # Long tail (<2%)
    1007: 0.010,  # PTB-style
    1008: 0.008,  # UP-style
    1009: 0.005,  # PCB-style
    1010: 0.003,  # PSTU-style
    1011: 0.002,  # DC-style
}


def pre_election_prior(cod_candidato_2026: int) -> float | None:
    """Retorna o prior pré-eleitoral do candidato em fração [0, 1].

    `None` se candidato não está no catálogo → caller desce para Tier 3
    (disable modelo).
    """
    return PRE_ELECTION_PCT_PRIOR.get(int(cod_candidato_2026))


# ---------------------------------------------------------------------------
# CI inflation policy (ADR-0015)
# ---------------------------------------------------------------------------

#: Multiplicador aplicado ao half-width do CI quando Tier 2 é acionado.
#: 1.5 = +50% de largura. Refletido em `compute_uf_projections` quando
#: `model_fallback_tier == 2` na linha de projection emitida.
TIER_2_CI_INFLATION: float = 1.5
