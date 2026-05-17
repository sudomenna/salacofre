"""Agregação de swing zona → UF via média ponderada por eleitores aptos (RF-012).

Fórmula:
    swing_c(U) = Σ(z) swing_c(z) · n(z) / Σ(z) n(z)

Edge cases:
  - Lista de zonas vazia → retorna None (UF 0% apurada, gatilho do RF-017).
  - Zonas com swing=None são excluídas do numerador E do denominador
    (zona apurada sem dado 2022 — design.md "Excluída do cálculo de swing").
  - Zona sem entrada em `eleitorado` ou com peso 0 → excluída (peso 0
    seria neutro mas pode mascarar bugs, então logamos via exclusão).
  - Se TODAS as zonas forem excluídas → retorna None.
"""

from __future__ import annotations

from typing import TypedDict


class ZoneSwing(TypedDict):
    """Entrada do `swing_uf`: uma zona apurada com seu swing já calculado."""

    cod_zona: int
    swing: float | None


def swing_uf(
    zones: list[ZoneSwing],
    eleitorado: dict[int, int],
) -> float | None:
    """Média ponderada do swing de zonas apuradas em uma UF.

    Args:
        zones: lista de `{cod_zona, swing}` (swing pode ser None).
        eleitorado: dict `cod_zona → eleitores_aptos` (todas as zonas da UF).

    Returns:
        Swing médio ponderado em fração [-1, +1] (tipicamente |x| < 0.3)
        ou None se não houver zona elegível.
    """
    numerator = 0.0
    denominator = 0

    for entry in zones:
        swing = entry["swing"]
        if swing is None:
            continue
        cod = entry["cod_zona"]
        weight = eleitorado.get(cod, 0)
        if weight <= 0:
            continue
        numerator += swing * weight
        denominator += weight

    if denominator == 0:
        return None

    return numerator / denominator
