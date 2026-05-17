"""Casos de borda do modelo (RF-017, RF-018, K-1).

RF-017 — UF 0% apurada:
  point = p_2022_uf
  ci_lower = clip(p_2022 - 0.10, 0, 1)
  ci_upper = clip(p_2022 + 0.10, 0, 1)
  Sem `estimates` — bootstrap não roda.

RF-018 — UF <5% apurada:
  Mantém `point`, multiplica largura (ci_upper - ci_lower) por 1.5 ao redor
  do `point`. Clipado em [0, 1].

K-1 — Candidato sem bloco político mapeável em 2022:
  Modelo desabilitado para a corrida do candidato. Helper que diz se o
  candidato está nessa situação (caller decide o fallback).
"""

from __future__ import annotations

from typing import TypedDict


class InflatedResult(TypedDict):
    point: float
    ci_lower: float
    ci_upper: float


def _clip(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    if x < lo:
        return lo
    if x > hi:
        return hi
    return x


def inflate_ci_zero_apurado(p_2022: float) -> InflatedResult:
    """RF-017: UF 0% apurada → projeção = 2022 com CI ±10pp."""
    return {
        "point": _clip(p_2022),
        "ci_lower": _clip(p_2022 - 0.10),
        "ci_upper": _clip(p_2022 + 0.10),
    }


def inflate_ci_low_apurado(
    result: InflatedResult,
    pct_apurado: float,
) -> InflatedResult:
    """RF-018: se pct_apurado < 5%, multiplica largura do CI por 1.5.

    O `point` é mantido como centro da nova faixa (preserva projeção
    central). Resultados clipados em [0, 1].

    Args:
        result: `{point, ci_lower, ci_upper}` vindo do bootstrap.
        pct_apurado: percentual apurado da UF, em escala [0, 100] (TSE
            historicamente publica em %, não em fração — manter consistente
            com `snapshots.pct_apurado`).

    Returns:
        Result com CI inflado se pct_apurado < 5, senão result inalterado.
    """
    if pct_apurado >= 5.0:
        return result

    point = result["point"]
    width = result["ci_upper"] - result["ci_lower"]
    new_half = (width * 1.5) / 2.0
    return {
        "point": _clip(point),
        "ci_lower": _clip(point - new_half),
        "ci_upper": _clip(point + new_half),
    }


def is_candidate_unmappable(
    candidato_id: int,
    mapping_2022: dict[int, str | None],
) -> bool:
    """K-1: candidato 2026 sem bloco político mapeável em 2022.

    Args:
        candidato_id: id do candidato 2026.
        mapping_2022: dict `candidato_id → bloco_2022` (string com sigla/coligação)
            ou None se não mapeável. Candidato AUSENTE do dict também conta
            como não mapeável (fail-safe).

    Returns:
        True se o modelo deve ser desabilitado para esse candidato.
    """
    return mapping_2022.get(candidato_id) is None
