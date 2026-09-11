"""Probabilidade de vitória/eleição e posição da agulha (RF-016, RF-103).

RF-016 — `p_vitoria(A, B) = P(estimates_A > estimates_B)`
  Calculado sobre arrays bootstrap pareados (mesmo índice = mesmo resample).
  Caller DEVE garantir que A e B foram gerados com o MESMO seed (mesmo cargo,
  turno, trigger_ts) para que a comparação pareada faça sentido.
  Se shapes diferirem → raise ValueError.

RF-103 (spec 016) — `p_eleito(estimativas, vagas)` = fração de resamples em que
  o candidato termina entre os `vagas` primeiros. Com `vagas=1` é equivalente a
  `p_vitoria` contra o melhor adversário; com `vagas=2` é o Senado em 2026.
  A soma dos `p_eleito` de todos os candidatos tende a `vagas`, não a 1 — é a
  diferença que faz a tela de Senador ser lida certo.

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


def p_eleito(estimates_por_candidato: dict[int, np.ndarray], vagas: int) -> dict[int, float]:
    """RF-103 — probabilidade de terminar entre os `vagas` primeiros.

    Generaliza `p_vitoria` para disputas de N vagas. O Senado renova 2/3 em 2026,
    o que são **2 vagas por UF** — usar `p_vitoria` (1º lugar) ali produziria um
    número correto para a pergunta errada: o que decide a eleição de um senador
    não é liderar, é estar entre os dois primeiros.

    Cada resample é um cenário completo e coerente (mesmo índice = mesmo sorteio
    em todos os candidatos, garantido pelo `idx` único por UF de
    `extrapolation.py`). Por isso a contagem é feita **por coluna**: em cada
    cenário, ordena-se os candidatos e marca-se quem ficou no top-`vagas`. Fazer
    candidato a candidato, comparando distribuições marginais, daria outro número
    e não corresponderia a nenhum mundo possível.

    Args:
        estimates_por_candidato: `{cod_candidato: array de resamples}`. Todos os
            arrays precisam ter o MESMO comprimento e vir do mesmo seed — é a
            mesma exigência de pareamento de `p_vitoria`.
        vagas: número de eleitos na circunscrição (2 para Senador em 2026).

    Returns:
        `{cod_candidato: probabilidade}`. Soma ≈ `min(vagas, nº de candidatos)`.

    Raises:
        ValueError: se `vagas < 1` ou se os arrays tiverem comprimentos diferentes.
    """
    if vagas < 1:
        raise ValueError(f"vagas deve ser >= 1, recebido {vagas}")
    if not estimates_por_candidato:
        return {}

    cods = list(estimates_por_candidato)
    comprimentos = {len(estimates_por_candidato[c]) for c in cods}
    if len(comprimentos) != 1:
        raise ValueError(
            "arrays de resample com comprimentos diferentes — a comparação por "
            f"cenário exige pareamento: {sorted(comprimentos)}"
        )

    # (n_candidatos, n_resamples). Cada COLUNA é um cenário completo.
    matriz = np.vstack([np.asarray(estimates_por_candidato[c], dtype=float) for c in cods])
    n_cands, n_resamples = matriz.shape
    if n_resamples == 0:
        return {c: 0.0 for c in cods}

    vagas_efetivas = min(vagas, n_cands)
    if vagas_efetivas >= n_cands:
        # Mais vagas que candidatos: todos eleitos em todo cenário.
        return {c: 1.0 for c in cods}

    # `argpartition` no eixo dos candidatos põe os `vagas_efetivas` maiores nas
    # últimas linhas de cada coluna — O(n) por coluna, sem ordenar tudo.
    corte = n_cands - vagas_efetivas
    top_idx = np.argpartition(matriz, corte - 1 if corte > 0 else 0, axis=0)[corte:, :]

    contagem = np.zeros(n_cands, dtype=np.int64)
    np.add.at(contagem, top_idx.ravel(), 1)

    return {cod: float(contagem[i] / n_resamples) for i, cod in enumerate(cods)}


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
