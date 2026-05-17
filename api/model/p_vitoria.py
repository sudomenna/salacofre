"""Probabilidade de vitória e posição da agulha (RF-016 + design.md § Agulha).

RF-016 — `p_vitoria(A, B) = P(estimates_A > estimates_B)`
  Calculado sobre arrays bootstrap pareados (mesmo índice = mesmo resample).
  Caller DEVE garantir que A e B foram gerados com o MESMO seed (mesmo cargo,
  turno, trigger_ts) para que a comparação pareada faça sentido.
  Se shapes diferirem → raise ValueError.

Posição da agulha (design.md):
  position = clip((p_a - 0.5) * 2, -1, +1)
  band:
    |pos| < 0.20 → 'tossup'
    |pos| < 0.50 → 'lean'
    |pos| < 0.85 → 'likely'
    else         → 'very_likely'
"""

from __future__ import annotations

from typing import Literal, TypedDict

import numpy as np

Band = Literal["tossup", "lean", "likely", "very_likely"]


class NeedlePosition(TypedDict):
    position: float
    band: Band


def p_vitoria(estimates_a: np.ndarray, estimates_b: np.ndarray) -> float:
    """RF-016: fração de resamples em que A > B."""
    if estimates_a.shape != estimates_b.shape:
        raise ValueError(
            f"shapes incompatíveis: A={estimates_a.shape}, B={estimates_b.shape}"
        )
    return float(np.mean(estimates_a > estimates_b))


def needle_position(p_a: float) -> NeedlePosition:
    """Mapeia p_vitoria do candidato A para posição e banda da agulha."""
    raw = (p_a - 0.5) * 2.0
    if raw < -1.0:
        position = -1.0
    elif raw > 1.0:
        position = 1.0
    else:
        position = raw

    abs_pos = abs(position)
    band: Band
    if abs_pos < 0.20:
        band = "tossup"
    elif abs_pos < 0.50:
        band = "lean"
    elif abs_pos < 0.85:
        band = "likely"
    else:
        band = "very_likely"

    return {"position": position, "band": band}
