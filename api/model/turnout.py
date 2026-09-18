"""api/model/turnout.py

Projeção de participação (abstenção, brancos/nulos) por REGRA DE TRÊS —
RF-020.1 (spec 002), Fase 1a do plano `sim-monte-um-planejamento-magical-
key.md`, decisão D5 fechada com o usuário em 2026-09-05.

Por que regra de três (D5) — decisão de produto, não técnica:
  SEM prior histórico, SEM tabela nova, SEM importar
  `detalhe_votacao_munzona` de 2022. A projeção é a taxa observada nas
  zonas JÁ APURADAS do próprio ciclo 2026, ponderada por eleitorado
  (`weight` = eleitores aptos 2026 da zona, tabela `eleitorado`),
  extrapolada para o total da UF/Brasil. Rótulo obrigatório na UI:
  "projeção a partir do apurado" — nunca "baseado em 2022" (não há prior
  histórico nenhum por trás deste cálculo).

Reuso obrigatório (constituição § 6, determinismo; ver briefing da tarefa):
  - Bootstrap vetorizado no MESMO estilo de `bootstrap.py::bootstrap_uf`
    (`np.random.default_rng(seed)`, matriz `(n_resamples, k)` de índices
    sorteados com reposição, zero loop Python por resample).
  - `edge_cases.py::inflate_ci_low_apurado` (RF-018) — reusada tal qual,
    SEM reimplementação; opera em fração [0,1] + `pct_apurado` em [0,100]
    (mesma convenção de `compute_uf_projections`).
  - Seed por `(uf, metric)` é responsabilidade do CALLER
    (`project.py::compute_participacao`, que replica o padrão de
    `compute_uf_projections::local_seed`) — este módulo só recebe
    `seed: int` já derivado, mantendo `turnout.py` sem qualquer
    acoplamento ao restante do pipeline (nenhum import de `project.py`,
    evita ciclo já que `project.py` importa `turnout.py`).

Casos de borda:
  - Zona com denominador da métrica ≤ 0 (ex.: `comparecimento == 0` antes
    da totalização daquela zona) OU `weight <= 0` (eleitorado ausente/zero
    para a zona) → excluída do cálculo — análogo ao contrato de
    `zones_with_swing` em `compute_uf_projections`.
  - Nenhuma zona utilizável → `estimate_uf_participacao` retorna `None`.
    A UI mostra "aguardando projeção" em vez de inventar um número
    (nunca `0.0` disfarçado de dado real).
  - `pct_apurado_uf < 5` → CI inflado 1.5x ao redor do `point` via RF-018
    (`inflate_ci_low_apurado`), idêntico ao tratamento de
    `compute_uf_projections` para candidatos.

⚠️ Fase 5 (2026-09-18) — `brancos_nulos` SAIU daqui em produção.
  `project.py::compute_participacao` agora lê a métrica de
  `extrapolation.py::estimate_uf_candidatos` (campo
  `brancos_nulos_comparecimento`), que a calcula no MESMO `idx` do
  bootstrap dos candidatos. Motivo: com seed e estimador próprios, este
  módulo produzia um brancos/nulos que somava 100 ± 0,3 pp com os
  candidatos na base comparecimento — a tela publicava partes que não
  fechavam o inteiro que ela mesma afirma estar dividindo.

  O ramo `"brancos_nulos"` de `_metric_num_den`/`metric_value`/
  `estimate_uf_participacao` CONTINUA neste arquivo e continua correto —
  o que ele não tem mais é caller em produção. Está aqui porque
  `compute_participacao` mantém o caminho antigo como fallback quando o
  caller não passa `cand_by_uf` (testes e callers legados). **Se você
  está prestes a religar este ramo no pipeline, a identidade exata da
  Fase 5 morre junto** — leia
  `docs/_meta/plano-modelo-regra-de-tres-2026-09-05.md` § A, "Coerência
  das bases (E2)", antes.

  `abstencao` (base `esi`) continua sendo daqui, e continua fora do 100%
  por E2 — a base dela não é o comparecimento.

Cobre: RF-020.1 (spec 002-modelo-estatistico) — participação por
extrapolação do apurado. Persistência em `projections` fica DEFERIDA
(coluna `candidato_id NOT NULL` não comporta linhas de participação) —
o resultado desta Fase 1a só viaja pelo payload Edge Config
(`build_edge_payload`/`build_uf_payloads`, ver `project.py`).
"""

from __future__ import annotations

from typing import Literal, TypedDict

import numpy as np

from api.model.edge_cases import inflate_ci_low_apurado

# ---------------------------------------------------------------------------
# Tipos
# ---------------------------------------------------------------------------


class ZonaParticipacaoRaw(TypedDict):
    """Espelha `api.model.project.ZonaParticipacaoRaw` (fonte real, extraída
    do EA20 via `_extract_zone_participacao`).

    Duplicado aqui SÓ como referência de tipo para quem lê `turnout.py`
    isoladamente — NÃO importar de `project.py` (importaria na direção
    errada: `project.py` importa `turnout.py`, nunca o contrário; um
    import de volta criaria um ciclo).
    """

    eleitores_aptos: int
    eleitores_instalados: int
    comparecimento: int
    abstencao: int
    brancos: int
    nulos: int
    validos: int
    votaveis: int
    anulados: int
    sub_judice: int
    psa: float


class ZonaParticipacao(ZonaParticipacaoRaw):
    """`ZonaParticipacaoRaw` + identificação/peso da zona para agregação.

    `weight` = eleitores aptos 2026 da zona segundo a tabela `eleitorado`
    (RF-008) — é o peso usado em TODO o resto do pipeline (RF-011..RF-018),
    não necessariamente idêntico a `eleitores_aptos` (que vem do próprio
    payload EA20, `e.te`, e pode divergir ligeiramente da base de
    eleitorado 2026). Usar o mesmo peso do restante do modelo mantém
    `compute_participacao` consistente com `compute_uf_projections`.
    """

    cod_zona: int
    weight: int


Metric = Literal["abstencao", "brancos_nulos"]


class ParticipacaoEstimate(TypedDict):
    """Resultado de `estimate_uf_participacao` / `aggregate_national_participacao`.

    `pct_atual`/`pct_projetado`/`lower`/`upper` em PERCENTUAL 0–100 (mesma
    convenção de `project.py::_frac_to_pct` — espaço de payload Edge
    Config). `estimates` fica em FRAÇÃO [0,1] (espaço do bootstrap), shape
    `(n_resamples,)` — reusado por `aggregate_national_participacao` sem
    precisar recomputar o bootstrap.
    """

    pct_atual: float | None
    pct_projetado: float
    lower: float
    upper: float
    n_zonas: int
    num: int
    den: int
    estimates: np.ndarray


# ---------------------------------------------------------------------------
# Helpers de escala/clip — duplicados de `project.py` de propósito (ver
# docstring do módulo: `turnout.py` não importa `project.py`).
# ---------------------------------------------------------------------------


def _frac_to_pct(x: float) -> float:
    """Fração [0,1] → percentual 0–100, arredondado em 5 casas — mesma
    convenção de `api.model.project._frac_to_pct` (NUMERIC(8,5))."""
    return round(100.0 * x, 5)


def _clip01(x: float) -> float:
    if x < 0.0:
        return 0.0
    if x > 1.0:
        return 1.0
    return x


def _metric_num_den(z: ZonaParticipacao, metric: Metric) -> tuple[float, float]:
    """Numerador/denominador CRUS (contagens do TSE, não fração) da métrica
    para uma zona.

    - `abstencao`     → `abstencao / eleitores_instalados`. `eleitores_
      instalados` (não `eleitores_aptos`) é o denominador oficial —
      mesma ressalva documentada em
      `project.py::_extract_zone_participacao` (`e.esi`, não `e.te`).
    - `brancos_nulos` → `(brancos + nulos) / comparecimento`.
    """
    if metric == "abstencao":
        return float(z["abstencao"]), float(z["eleitores_instalados"])
    return float(z["brancos"] + z["nulos"]), float(z["comparecimento"])


def metric_value(z: ZonaParticipacao, metric: Metric) -> float:
    """Fração [0,1] da métrica para UMA zona.

    Retorna `0.0` se o denominador for `<= 0` — fallback defensivo; o
    caller (`estimate_uf_participacao`) é quem exclui essas zonas ANTES de
    agregar, então esse `0.0` nunca deveria, na prática, entrar em uma
    agregação real.
    """
    num, den = _metric_num_den(z, metric)
    if den <= 0:
        return 0.0
    return num / den


# ---------------------------------------------------------------------------
# Estimativa por UF (regra de três + bootstrap de zonas)
# ---------------------------------------------------------------------------


def estimate_uf_participacao(
    zonas: list[ZonaParticipacao],
    metric: Metric,
    pct_apurado_uf: float,
    seed: int,
    n_resamples: int = 1000,
) -> ParticipacaoEstimate | None:
    """Projeta `metric` para uma UF (regra de três, D5): taxa observada nas
    zonas apuradas, ponderada por `weight` (eleitores aptos 2026),
    extrapolada para o total da UF.

    Args:
        zonas: zonas com dados de participação da UF. Zonas com
            denominador da métrica `<= 0` OU `weight <= 0` são excluídas
            AQUI (não é responsabilidade do caller pré-filtrar).
        metric: `"abstencao"` ou `"brancos_nulos"`.
        pct_apurado_uf: percentual apurado da UF em [0, 100] — usado para
            RF-018 (inflar CI 1.5x se `< 5`). Mesma convenção de
            `compute_uf_projections`/`inflate_ci_low_apurado`.
        seed: determinístico, DERIVADO PELO CALLER de `(uf, metric)`
            (mesmo padrão de `local_seed` em `compute_uf_projections`).
        n_resamples: default 1000 (paridade com `bootstrap_uf`).

    Returns:
        `ParticipacaoEstimate`, ou `None` se nenhuma zona for utilizável —
        a UI deve mostrar "aguardando projeção", nunca um número inventado.
    """
    usable = [
        z
        for z in zonas
        if _metric_num_den(z, metric)[1] > 0 and z.get("weight", 0) > 0
    ]
    if not usable:
        return None

    values = np.array([metric_value(z, metric) for z in usable], dtype=np.float64)
    weights = np.array([float(z["weight"]) for z in usable], dtype=np.float64)
    nums = np.array([_metric_num_den(z, metric)[0] for z in usable], dtype=np.float64)
    dens = np.array([_metric_num_den(z, metric)[1] for z in usable], dtype=np.float64)

    # `pct_atual`: razão LITERAL de somas (Σnum/Σden) — não é a média
    # ponderada das frações por zona. Cada zona contribui pelo seu próprio
    # denominador bruto (nº de eleitores/comparecimento reais), não por um
    # peso externo — é o que "percentual apurado até agora" significa.
    sum_num = float(nums.sum())
    sum_den = float(dens.sum())
    pct_atual = _frac_to_pct(sum_num / sum_den) if sum_den > 0 else None

    # Ponto projetado: média de `metric_value` ponderada por `weight`
    # (eleitores aptos 2026) — determinístico, SEM random. Mesmo padrão de
    # `compute_uf_projections`: o "point" oficial vem de uma fórmula
    # fechada (T08), não de `mean(bootstrap_estimates)` (que carrega ruído
    # de amostragem, ainda que pequeno com 1000 resamples).
    weight_sum = float(weights.sum())
    point_frac = float((values * weights).sum() / weight_sum)

    # Bootstrap vetorizado de zonas — mesma mecânica de `bootstrap_uf`
    # (matriz de índices sorteados com reposição, sem loop Python por
    # resample). Determinismo (§ 6): `default_rng(seed)` fixo, nunca
    # `np.random.seed()` global.
    rng = np.random.default_rng(seed)
    k = len(usable)
    idx = rng.integers(0, k, size=(n_resamples, k))
    sampled_values = values[idx]
    sampled_weights = weights[idx]
    num_arr = (sampled_values * sampled_weights).sum(axis=1)
    den_arr = sampled_weights.sum(axis=1)
    # den_arr é sempre > 0 porque weights são todos > 0 (filtrado acima).
    estimates = num_arr / den_arr

    ci_lower = float(np.percentile(estimates, 2.5))
    ci_upper = float(np.percentile(estimates, 97.5))

    # RF-018: infla CI 1.5x se pct_apurado_uf < 5% (reuso tal qual de
    # edge_cases.py — nenhuma reimplementação).
    inflated = inflate_ci_low_apurado(
        {"point": point_frac, "ci_lower": ci_lower, "ci_upper": ci_upper},
        pct_apurado_uf,
    )
    point_frac = _clip01(inflated["point"])
    ci_lower = _clip01(inflated["ci_lower"])
    ci_upper = _clip01(inflated["ci_upper"])

    return {
        "pct_atual": pct_atual,
        "pct_projetado": _frac_to_pct(point_frac),
        "lower": _frac_to_pct(ci_lower),
        "upper": _frac_to_pct(ci_upper),
        "n_zonas": len(usable),
        "num": int(round(sum_num)),
        "den": int(round(sum_den)),
        "estimates": estimates,
    }


# ---------------------------------------------------------------------------
# Agregação nacional
# ---------------------------------------------------------------------------


def aggregate_national_participacao(
    by_uf: dict[str, ParticipacaoEstimate | None],
    eleitorado_total_by_uf: dict[str, int],
) -> ParticipacaoEstimate | None:
    """Agrega `ParticipacaoEstimate` por UF → nacional, ponderado pelo
    eleitorado total da UF — mesmo padrão de
    `project.py::aggregate_national_estimates` (soma dos `estimates`
    array-a-array, ponderada por peso, dividida pela soma dos pesos).

    `pct_atual` nacional = razão das somas (Σnum / Σden entre as UFs) —
    mesma filosofia usada dentro de cada UF: cada UF contribui pelo seu
    próprio denominador bruto, não por um peso externo.

    Determinismo (§ 6): agregação puramente aritmética sobre os
    `estimates` já sorteados por UF — zero `random` novo aqui.

    Returns:
        `None` se `by_uf` não tiver nenhuma UF utilizável (todas `None`,
        ou nenhuma com `eleitorado_total_by_uf` positivo).
    """
    usable = {
        uf: est
        for uf, est in by_uf.items()
        if est is not None and eleitorado_total_by_uf.get(uf, 0) > 0
    }
    if not usable:
        return None

    sample_arr = next(iter(usable.values()))["estimates"]
    n_resamples = sample_arr.shape[0]
    combined = np.zeros(n_resamples, dtype=np.float64)
    weight_sum = 0
    sum_num = 0
    sum_den = 0
    n_zonas = 0
    for uf, est in usable.items():
        w = eleitorado_total_by_uf[uf]
        combined += est["estimates"] * w
        weight_sum += w
        sum_num += est["num"]
        sum_den += est["den"]
        n_zonas += est["n_zonas"]

    if weight_sum <= 0:
        return None
    combined = combined / weight_sum

    point = float(np.mean(combined))
    ci_lower = float(np.percentile(combined, 2.5))
    ci_upper = float(np.percentile(combined, 97.5))
    pct_atual = _frac_to_pct(sum_num / sum_den) if sum_den > 0 else None

    return {
        "pct_atual": pct_atual,
        "pct_projetado": _frac_to_pct(point),
        "lower": _frac_to_pct(ci_lower),
        "upper": _frac_to_pct(ci_upper),
        "n_zonas": n_zonas,
        "num": sum_num,
        "den": sum_den,
        "estimates": combined,
    }
