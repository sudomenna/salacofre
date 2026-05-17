"""Projeção UF e nacional (RF-013, RF-014).

RF-013 — Projeção da UF:
    p_proj(U) = p_2022(U) + swing(U)
    Resultado é clipado em [0, 1] para evitar artefatos numéricos (swing
    extremo + p_2022 quase 1 pode estourar). NOTA: clip é defensivo;
    chamador deve normalizar entre candidatos depois.

RF-014 — Projeção nacional:
    votos_c(BR) = Σ(U) votos_c(U)
    pct_c(BR) = votos_c(BR) / Σ(c') votos_{c'}(BR)

    A renormalização garante Σ pct_c = 1 mesmo se a projeção individual
    estourar [0,1] em alguma UF.
"""

from __future__ import annotations

from typing import TypedDict


class UFProjection(TypedDict):
    """Projeção de UM candidato em UMA UF (entrada de project_national)."""

    uf: str
    votos_proj: float  # votos absolutos projetados para o candidato na UF


class NationalProjection(TypedDict):
    pct: float
    votos: float


def project_uf(p_2022_uf: float, swing_uf_value: float) -> float:
    """RF-013: soma p_2022 + swing, clipada em [0, 1]."""
    raw = p_2022_uf + swing_uf_value
    if raw < 0.0:
        return 0.0
    if raw > 1.0:
        return 1.0
    return raw


def project_national(uf_projections: list[UFProjection]) -> NationalProjection:
    """RF-014: soma votos por UF e devolve pct e votos nacionais.

    O caller é responsável por chamar `project_national` UMA vez por candidato
    com a lista de UFs daquele candidato — a renormalização entre candidatos
    é feita um nível acima (orchestrator T12) somando os `votos` de cada um.

    Args:
        uf_projections: lista de `{uf, votos_proj}` do MESMO candidato em
            todas as 27 UFs (ou subconjunto, UFs faltantes contam zero).

    Returns:
        `{votos, pct}` — `pct` aqui é o share desse candidato no total das
        UFs fornecidas. Renormalização entre candidatos vem do orchestrator.
    """
    total_votos = sum(p["votos_proj"] for p in uf_projections)
    if total_votos <= 0:
        return {"votos": 0.0, "pct": 0.0}
    # pct=1.0 só se o caller passou apenas este candidato. Para o pct nacional
    # *entre candidatos*, o caller deve dividir total_votos pelo Σ entre todos.
    return {"votos": total_votos, "pct": 1.0}
