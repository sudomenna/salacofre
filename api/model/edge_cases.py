"""Casos de borda do modelo (RF-017, RF-018).

RF-017 — UF SEM NENHUMA zona apurada (E3, 2o nível hierárquico — plano
`tem-um-erro-eu-velvety-sprout.md` § A, decisão E1/E3 do usuário,
2026-09-05): a projeção da UF assume a proporção NACIONAL já calculada a
partir das UFs com dado (não mais `p_2022_uf` — 2022 saiu inteiramente da
projeção de candidatos):
  point = share nacional do candidato (`extrapolation.impute_uf_from_
          national`, argumento `national_point`)
  ci_lower = clip(point - 0.10, 0, 1)
  ci_upper = clip(point + 0.10, 0, 1)
  `estimates` reusa o array nacional pareado (não gera amostra
  degenerada constante) — ver `extrapolation.impute_uf_from_national`.

RF-018 — UF <5% apurada:
  Mantém `point`, multiplica largura (ci_upper - ci_lower) por 1.5 ao redor
  do `point`. Clipado em [0, 1]. Aplicado nas DUAS bases (votáveis e
  comparecimento) por `extrapolation.estimate_uf_candidatos`.

K-1 (candidato sem bloco político mapeável em 2022) foi REMOVIDO desta
tarefa — o pipeline de candidatos não usa mais 2022 como âncora, então a
noção de "candidato sem bloco 2022 mapeável" deixou de existir. ADR-0015
(K-1) fica desatualizado por este código; a formalização do ADR de
substituição é trabalho de `adr-author` (fora do escopo desta tarefa).
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
