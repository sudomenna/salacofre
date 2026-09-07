"""model-validator (2026-09-06) — fix do denominador de `uf_pct_apurado`.

Achado do replay 2022 não-tautológico: `compute_uf_projections` e o gêmeo
`compute_participacao` calculavam `uf_pct_apurado` dividindo pela soma dos
PESOS das zonas PRESENTES em `snapshots`, não pelo eleitorado TOTAL da UF
(`eleitorado_total_by_uf`). Zonas ausentes (404 "sem dados ainda" no
ingest, `app/api/ingest/route.ts`) simplesmente não entravam no
denominador — se 5 zonas pequenas de 400 já fecharam a 100%, a UF inteira
aparecia como ~100% apurada quando o real era pouco mais de 1%.

Este arquivo cobre:
  - o cenário do bug (poucas zonas presentes a 100% -> `pct_apurado`
    baixo, não ~100%);
  - o caso de borda que NÃO pode regredir: a zona-sentinela `cod_zona=0`
    (modo `TSE_GRANULARIDADE=uf`) sozinha continua produzindo
    `uf_pct_apurado` correto (sem dupla contagem, sem zerar);
  - UF ausente de `eleitorado` (ou com total 0) não pode virar divisão
    por zero nem `pct_apurado` fantasma;
  - o mesmo trio de casos no gêmeo `compute_participacao`;
  - o viés residual em `build_edge_payload.pct_apurado_total` quando uma
    UF inteira está ausente de `uf_rows` (nenhuma zona sua apareceu em
    `snapshots` ainda) — ela precisa contar como 0% no numerador E
    contribuir seu peso cheio ao denominador, não desaparecer dos dois.
"""

from __future__ import annotations

import pytest

from api.model.project import build_edge_payload, compute_participacao, compute_uf_projections


def _cand_payload(vap_by_cand: dict[int, int], *, te: int, esi: int, c: int, vvc: int) -> dict:
    a = max(0, esi - c)
    return {
        "e": {"te": str(te), "esi": str(esi), "c": str(c), "a": str(a)},
        "v": {"vvc": str(vvc), "vv": str(vvc), "vb": "0", "tvn": "0"},
        "cand": [{"n": str(cod), "vap": str(vap)} for cod, vap in vap_by_cand.items()],
    }


# ---------------------------------------------------------------------------
# compute_uf_projections — denominador
# ---------------------------------------------------------------------------


def test_poucas_zonas_a_100pct_nao_infla_pct_apurado_da_uf() -> None:
    """UF com 400 zonas (eleitorado uniforme), das quais só 5 pequenas já
    apuraram 100% -> `pct_apurado` deve refletir o peso real dessas 5
    zonas sobre o total, não ~100%."""
    n_zonas_total = 400
    peso_zona = 1_000
    eleitorado = {("SP", z): peso_zona for z in range(1, n_zonas_total + 1)}

    n_presentes = 5
    snapshots = [
        {
            "uf": "SP",
            "cod_zona": z,
            "pct_apurado": 100.0,
            "payload": _cand_payload({100: 550, 200: 450}, te=peso_zona, esi=peso_zona, c=900, vvc=1000),
        }
        for z in range(1, n_presentes + 1)
    ]

    rows, _est, _est_c, _cand_by_uf = compute_uf_projections(
        cargo=1, turno=1, seed_base=1, snapshots=snapshots, eleitorado=eleitorado,
    )

    assert len(rows) == 2
    pct_apurado_uf = rows[0]["pct_apurado"]
    esperado = 100.0 * (n_presentes * peso_zona) / (n_zonas_total * peso_zona)
    assert pct_apurado_uf == pytest.approx(esperado, abs=0.01)
    # Bug antigo produziria ~100% aqui — a asserção abaixo documenta a
    # regressão que este teste previne.
    assert pct_apurado_uf < 5.0


def test_sentinela_cod_zona_zero_sozinha_produz_pct_apurado_correto() -> None:
    """Modo `TSE_GRANULARIDADE=uf`: a UF só tem a linha-sentinela
    `cod_zona=0`. `_resolve_zone_weight` já resolve seu peso para o
    eleitorado TOTAL da UF — o novo denominador (também o eleitorado
    total) não pode dobrar a contagem nem zerar o resultado."""
    eleitorado = {("RJ", 1): 40_000, ("RJ", 2): 60_000}  # total real: 100_000
    snapshots = [
        {
            "uf": "RJ",
            "cod_zona": 0,
            "pct_apurado": 42.0,
            "payload": _cand_payload({300: 600, 400: 400}, te=100_000, esi=100_000, c=80_000, vvc=100_000),
        },
    ]

    rows, _est, _est_c, _cand_by_uf = compute_uf_projections(
        cargo=1, turno=1, seed_base=2, snapshots=snapshots, eleitorado=eleitorado,
    )

    assert len(rows) == 2
    # Sentinela sozinha -> uf_pct_apurado == pct_apurado da própria linha
    # (peso == denominador, sem dupla contagem).
    assert rows[0]["pct_apurado"] == pytest.approx(42.0, abs=0.01)


def test_uf_ausente_de_eleitorado_nao_gera_divisao_por_zero() -> None:
    """UF com zonas em `snapshots` mas NENHUMA linha em `eleitorado`
    (gap de dados real — ex.: DF no fixture de replay 2022) não pode
    lançar `ZeroDivisionError` nem produzir `pct_apurado` "fantasma"
    (um valor > 0 fingindo apuração real sem eleitorado conhecido).

    `eleitorado.get((uf, zona), 0) == 0` também zera o `weight` da zona
    (`_resolve_zone_weight`), o que a exclui de `_is_apurada` — a UF cai
    no fallback nacional (RF-017, cargo 1) como as demais UFs "sem
    nenhuma zona apurada". O fallback ancora no nacional das UFs COM
    dado (SP, aqui) e herda `pct_apurado = 0.0` explicitamente (nunca um
    valor derivado de uma divisão por zero)."""
    eleitorado = {("SP", 1): 100_000}  # DF ausente de propósito
    snapshots = [
        {
            "uf": "SP",
            "cod_zona": 1,
            "pct_apurado": 100.0,
            "payload": _cand_payload({100: 550, 200: 450}, te=100_000, esi=100_000, c=80_000, vvc=100_000),
        },
        {
            "uf": "DF",
            "cod_zona": 1,
            "pct_apurado": 50.0,
            "payload": _cand_payload({100: 500, 200: 500}, te=1000, esi=1000, c=800, vvc=1000),
        },
    ]

    rows, _est, _est_c, _cand_by_uf = compute_uf_projections(
        cargo=1, turno=1, seed_base=3, snapshots=snapshots, eleitorado=eleitorado,
    )

    df_rows = {r["candidato_id"]: r for r in rows if r["uf"] == "DF"}
    assert set(df_rows.keys()) == {100, 200}
    assert df_rows[100]["metodo"]["tipo"] == "imputado_nacional"
    assert df_rows[100]["pct_apurado"] == 0.0


# ---------------------------------------------------------------------------
# compute_participacao — gêmeo do bug
# ---------------------------------------------------------------------------


def _snapshots_3_zonas_ba() -> tuple[list[dict], list[dict]]:
    """3 zonas presentes idênticas em ambos os cenários — só o total de
    `eleitorado` (zonas ausentes) muda entre eles. Como `estimate_uf_
    participacao` só recebe as zonas PRESENTES (`zonas` list, montada por
    `compute_participacao` a partir de `snapshots`), o bootstrap
    pré-inflação (`point`/`ci_lower`/`ci_upper` antes de `inflate_ci_low_
    apurado`) é IDÊNTICO nos dois cenários — só a decisão de inflar (RF-018,
    limiar <5%) muda, porque só ela depende do denominador corrigido."""
    n_presentes = 3
    peso_zona = 2_000
    snaps = [
        {
            "uf": "BA",
            "cod_zona": z,
            "pct_apurado": 100.0,
            "payload": _cand_payload(
                {100: 900, 200: 100}, te=peso_zona, esi=peso_zona, c=1800, vvc=1000
            ),
        }
        for z in range(1, n_presentes + 1)
    ]
    eleitorado_presentes = [{"uf": "BA", "cod_zona": z, "peso": peso_zona} for z in range(1, n_presentes + 1)]
    return snaps, eleitorado_presentes


def test_participacao_poucas_zonas_a_100pct_infla_ci_via_rf018() -> None:
    """Com o denominador corrigido, uma UF onde só 3 zonas pequenas (de
    200) já apuraram a 100% deve calcular `pct_apurado_uf` bem abaixo de
    5% -> RF-018 infla a largura do CI em 1.5x. O bootstrap em si (antes
    da inflação) é idêntico entre os dois cenários — a única diferença é
    o total de `eleitorado` usado no denominador."""
    snaps, presentes = _snapshots_3_zonas_ba()
    peso_zona = presentes[0]["peso"]
    n_presentes = len(presentes)

    # Cenário A: eleitorado só conhece as zonas presentes -> UF "fechada"
    # a 100% (sem inflação RF-018).
    eleitorado_fechado = {("BA", p["cod_zona"]): p["peso"] for p in presentes}
    by_uf_a, _ = compute_participacao(
        cargo=1, turno=1, seed_base=7, snapshots=snaps, eleitorado=eleitorado_fechado,
    )
    est_a = by_uf_a["BA"]["abstencao"]
    assert est_a is not None
    width_a = est_a["upper"] - est_a["lower"]

    # Cenário B: eleitorado conhece as 3 zonas presentes + 197 ausentes
    # (mesmo peso) -> UF real ~1.5% apurada -> RF-018 dispara.
    eleitorado_aberto = dict(eleitorado_fechado)
    for z in range(n_presentes + 1, 200 + 1):
        eleitorado_aberto[("BA", z)] = peso_zona
    by_uf_b, _ = compute_participacao(
        cargo=1, turno=1, seed_base=7, snapshots=snaps, eleitorado=eleitorado_aberto,
    )
    est_b = by_uf_b["BA"]["abstencao"]
    assert est_b is not None
    width_b = est_b["upper"] - est_b["lower"]

    # Ponto central preservado (RF-018 só muda a largura do CI).
    assert est_a["pct_projetado"] == pytest.approx(est_b["pct_projetado"], abs=1e-6)
    # Largura do cenário "poucas zonas de muitas" é 1.5x a do "UF fechada"
    # — exatamente o comportamento de `inflate_ci_low_apurado`. Sem o fix
    # do denominador, os dois cenários seriam idênticos (bug ignorava as
    # 197 zonas ausentes e via a UF como 100% apurada nos dois casos).
    assert width_b == pytest.approx(width_a * 1.5, rel=1e-6)


def test_participacao_sentinela_cod_zona_zero_sozinha() -> None:
    """Modo `TSE_GRANULARIDADE=uf`: sentinela sozinha não pode gerar
    `ZeroDivisionError` nem produzir estimativa degenerada — o cálculo
    deve completar normalmente (RF-018 é moot com k=1 zona: bootstrap tem
    variância zero, CI colapsa a largura 0 independente de inflação)."""
    eleitorado = {("RJ", 1): 40_000, ("RJ", 2): 60_000}
    snapshots = [
        {
            "uf": "RJ",
            "cod_zona": 0,
            "pct_apurado": 37.5,
            "payload": _cand_payload({300: 500, 400: 500}, te=100_000, esi=100_000, c=80_000, vvc=100_000),
        },
    ]

    by_uf, _nacional = compute_participacao(
        cargo=1, turno=1, seed_base=5, snapshots=snapshots, eleitorado=eleitorado,
    )

    abstencao = by_uf["RJ"]["abstencao"]
    assert abstencao is not None
    assert 0.0 <= abstencao["pct_projetado"] <= 100.0


def test_participacao_uf_ausente_de_eleitorado_nao_gera_divisao_por_zero() -> None:
    eleitorado: dict[tuple[str, int], int] = {}
    snapshots = [
        {
            "uf": "DF",
            "cod_zona": 1,
            "pct_apurado": 50.0,
            "payload": _cand_payload({100: 500, 200: 500}, te=1000, esi=1000, c=800, vvc=1000),
        },
    ]

    # weight == 0 para a única zona -> zona excluída de `zonas` (mesmo
    # filtro pré-existente `if raw is None or w <= 0: continue`) -> UF
    # entra no by_uf com ambas as métricas `None` (sem zonas utilizáveis,
    # RF-020.1) — não deve lançar exceção.
    by_uf, _nacional = compute_participacao(
        cargo=1, turno=1, seed_base=6, snapshots=snapshots, eleitorado=eleitorado,
    )
    assert by_uf["DF"]["abstencao"] is None


# ---------------------------------------------------------------------------
# build_edge_payload — pct_apurado_total nacional não pode excluir UFs
# inteiramente ausentes de uf_rows do denominador.
# ---------------------------------------------------------------------------


def test_pct_apurado_total_inclui_uf_ausente_de_uf_rows_como_zero() -> None:
    """UF sem NENHUMA zona em `snapshots` (nunca processada por
    `compute_uf_projections`) não pode desaparecer do cálculo nacional de
    `pct_apurado_total` — ela conta como 0% apurada, com peso cheio no
    denominador. Sem a correção, `pct_apurado_total` ficava artificialmente
    alto ao ignorar UFs que ainda não começaram a apurar."""
    uf_rows = [
        {
            "uf": "SP",
            "candidato_id": 100,
            "pct_apurado": 80.0,
            "pct_projetado": 55.0,
            "pct_projetado_lower": 50.0,
            "pct_projetado_upper": 60.0,
            "p_vitoria": 0.9,
            "votos_atuais": 1000,
            "votos_projetados": 1000,
        },
    ]
    national_rows = [
        {
            "candidato_id": 100,
            "pct_projetado": 55.0,
            "pct_projetado_lower": 50.0,
            "pct_projetado_upper": 60.0,
            "p_vitoria": 0.9,
            "votos_projetados": 1000,
        },
    ]
    # AC nunca apareceu em `uf_rows` (nenhuma zona sua em snapshots ainda),
    # mas É conhecida via eleitorado — mesmo peso de SP para o teste ser
    # legível (50/50).
    eleitorado_total_by_uf = {"SP": 100_000, "AC": 100_000}

    payload = build_edge_payload(
        cargo=1,
        turno=1,
        ts_iso="2026-10-04T18:00:00Z",
        uf_rows=uf_rows,
        national_rows=national_rows,
        eleitorado_total_by_uf=eleitorado_total_by_uf,
        cand_a_id=100,
    )

    # SP a 80% + AC a 0% (peso igual) -> média ponderada = 40%, não 80%.
    assert payload["pct_apurado_total"] == pytest.approx(40.0, abs=0.01)
