"""Swing zona-a-zona vs 2022 (RF-011).

Pure function: dado o pct atual de um candidato em uma zona e o pct do
mesmo bloco político em 2022 na mesma zona, retorna a diferença.

Edge case (design.md "Casos de borda"):
  - Zona apurada SEM dado 2022 (mudança administrativa, criação de zona,
    etc.) → retorna None. Quem agrega (weighted_average.swing_uf) DEVE
    excluir esses zeros do somatório/denominador.

Contrato:
  - Entrada em fração [0,1] (não percentual). Conversão fica fora.
  - Saída em pontos percentuais "absolutos" no mesmo espaço (ex.: 0.05 = +5pp).
"""

from __future__ import annotations


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
