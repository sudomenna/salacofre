"""Testes pra `aggregate_by_mesorregiao` — S06/F4d (Fase 2).

Cobertura:
  (a) Caso normal: UF com 3 mesorregiões distintas + votos distribuídos.
      Verifica agregação correta de votos, líder, margem, pct_apurado
      e ordenação estável por `cod` ASC.
  (b) UF pequena: 1 mesorregião única (caso tipo SE/AP). Verifica que
      ainda retorna 1 entrada bem-formada.
  (c) Mesorregião sem apuração: `pct_apurado = 0` em todos os municípios
      + `votos_reportados = {}`. Verifica que entrada é emitida com
      `lider_id = 0`, `lider_pct = 0`, `margem = 0` (não NaN, não crash).
  (d) `delta_vs_2022` opcional: com e sem `historical_by_meso`. Verifica
      `None` quando ausente; cálculo correto quando presente.
  (e) Forward-compat: municípios sem `mesorregiao_cod` (caso de dev sem
      migration 0005 populada) são silenciosamente skipped — retorno `[]`.
  (f) Determinismo: mesma entrada → mesma saída bit-a-bit, ordem estável.
  (g) UF mismatch (sanity): municípios de UF errada apenas geram warn,
      não quebram a agregação. (Testa que `uf_row` é usado defensivamente.)

Estes testes são puros (sem DB, sem network) — rodam em <100ms.
"""

from __future__ import annotations

from typing import Any

from api.model.project import aggregate_by_mesorregiao


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────


def _munic(
    cod_ibge: str,
    *,
    meso_cod: str | None,
    meso_nome: str | None = None,
    pct_apurado: float = 100.0,
    votos: dict[int, int] | None = None,
    uf: str = "SP",
) -> dict[str, Any]:
    """Factory de município no shape esperado por aggregate_by_mesorregiao."""
    return {
        "cod_ibge": cod_ibge,
        "nome": f"Munic {cod_ibge}",
        "uf": uf,
        "mesorregiao_cod": meso_cod,
        "mesorregiao_nome": meso_nome,
        "pct_apurado": pct_apurado,
        "lider": {"candidato_id": 0, "votos": 0, "partido": "—", "margem_pp": 0.0},
        "votos_reportados": votos or {},
    }


# ─────────────────────────────────────────────────────────────────────────────
# (a) Caso normal — 3 mesorregiões
# ─────────────────────────────────────────────────────────────────────────────


def test_a_3_mesorregioes_agregacao_basica() -> None:
    """SP com 3 mesorregiões: cada uma com 2 municípios + votos distintos.

    Verifica:
      - 3 entradas no retorno
      - ordem por `cod` ASC
      - líder agregado correto (soma dos votos > líder por meso)
      - pct_apurado ponderado pelo total de votos
      - margem em pp = (lider - segundo) / total * 100
    """
    municipios = [
        # Meso 3501 — candidato 100 ganha (300 vs 200)
        _munic("3501101", meso_cod="3501", meso_nome="Norte", votos={100: 150, 200: 100}),
        _munic("3501202", meso_cod="3501", meso_nome="Norte", votos={100: 150, 200: 100}),
        # Meso 3502 — candidato 200 ganha (400 vs 100), apuração parcial
        _munic("3502303", meso_cod="3502", meso_nome="Centro", pct_apurado=80.0, votos={100: 50, 200: 200}),
        _munic("3502404", meso_cod="3502", meso_nome="Centro", pct_apurado=80.0, votos={100: 50, 200: 200}),
        # Meso 3503 — candidato 100 ganha apertado (110 vs 100)
        _munic("3503505", meso_cod="3503", meso_nome="Sul", votos={100: 110, 200: 100}),
    ]
    result = aggregate_by_mesorregiao(
        uf_row={"sigla": "SP"},
        municipios=municipios,
    )

    assert len(result) == 3
    # Ordem estável por cod ASC.
    assert [r["cod"] for r in result] == ["3501", "3502", "3503"]

    # Meso 3501: 300 vs 200 → lider 100, margem 100/500 = 20pp, pct_apurado 100
    m1 = result[0]
    assert m1["nome"] == "Norte"
    assert m1["lider_candidato_id"] == 100
    assert m1["lider_pct"] == 60.0  # 300/500
    assert m1["margem"] == 20.0  # (300-200)/500 * 100
    assert m1["pct_apurado"] == 100.0
    assert m1["num_municipios"] == 2
    assert m1["delta_vs_2022"] is None

    # Meso 3502: 100 vs 400 → lider 200, margem 60pp, pct_apurado 80 (ponderado)
    m2 = result[1]
    assert m2["lider_candidato_id"] == 200
    assert m2["lider_pct"] == 80.0  # 400/500
    assert m2["margem"] == 60.0  # (400-100)/500 * 100
    assert abs(m2["pct_apurado"] - 80.0) < 0.01
    assert m2["num_municipios"] == 2

    # Meso 3503: 110 vs 100 → lider 100, margem pequena
    m3 = result[2]
    assert m3["lider_candidato_id"] == 100
    assert abs(m3["lider_pct"] - (110.0 / 210.0 * 100.0)) < 0.01
    assert abs(m3["margem"] - (10.0 / 210.0 * 100.0)) < 0.01
    assert m3["num_municipios"] == 1


# ─────────────────────────────────────────────────────────────────────────────
# (b) UF pequena — 1 mesorregião única
# ─────────────────────────────────────────────────────────────────────────────


def test_b_uf_pequena_uma_mesorregiao() -> None:
    """SE com 1 mesorregião (caso real para UFs pequenas)."""
    municipios = [
        _munic(
            "2800101",
            meso_cod="2801",
            meso_nome="Agreste Sergipano",
            uf="SE",
            votos={100: 1000, 200: 800},
        ),
        _munic(
            "2800202",
            meso_cod="2801",
            meso_nome="Agreste Sergipano",
            uf="SE",
            votos={100: 500, 200: 400},
        ),
    ]
    result = aggregate_by_mesorregiao(
        uf_row={"sigla": "SE"},
        municipios=municipios,
    )

    assert len(result) == 1
    m = result[0]
    assert m["cod"] == "2801"
    assert m["nome"] == "Agreste Sergipano"
    assert m["lider_candidato_id"] == 100
    assert m["lider_pct"] == 1500.0 / 2700.0 * 100.0  # 100 ganhou 1500 de 2700
    assert m["num_municipios"] == 2


# ─────────────────────────────────────────────────────────────────────────────
# (c) Mesorregião sem apuração — todos os campos zero, sem NaN
# ─────────────────────────────────────────────────────────────────────────────


def test_c_mesorregiao_sem_apuracao() -> None:
    """Meso onde nenhum município tem votos_reportados.

    Verifica:
      - entrada é emitida (não filtra)
      - lider_id = 0 (placeholder)
      - lider_pct = 0, margem = 0 (sem NaN/Inf)
      - pct_apurado = 0
    """
    municipios = [
        _munic("3501101", meso_cod="3501", meso_nome="Vazia", pct_apurado=0.0, votos={}),
        _munic("3501202", meso_cod="3501", meso_nome="Vazia", pct_apurado=0.0, votos={}),
    ]
    result = aggregate_by_mesorregiao(
        uf_row={"sigla": "SP"},
        municipios=municipios,
    )

    assert len(result) == 1
    m = result[0]
    assert m["cod"] == "3501"
    assert m["lider_candidato_id"] == 0
    assert m["lider_pct"] == 0.0
    assert m["margem"] == 0.0
    assert m["pct_apurado"] == 0.0
    assert m["num_municipios"] == 2
    # Sanity: nenhum campo numérico veio NaN/Inf
    for field in ("pct_apurado", "lider_pct", "margem"):
        v = m[field]
        assert v == v, f"{field} is NaN"  # NaN != NaN
        assert v not in (float("inf"), float("-inf"))


# ─────────────────────────────────────────────────────────────────────────────
# (d) delta_vs_2022 opcional
# ─────────────────────────────────────────────────────────────────────────────


def test_d_delta_vs_2022_calculado_quando_historico_presente() -> None:
    """Com `historical_by_meso`, calcula delta = lider_pct - hist."""
    municipios = [
        _munic("3501101", meso_cod="3501", meso_nome="Norte", votos={100: 600, 200: 400}),
    ]
    # Em 2022, líder na meso 3501 fez 55%; agora líder está em 60% → +5pp
    result = aggregate_by_mesorregiao(
        uf_row={"sigla": "SP"},
        municipios=municipios,
        historical_by_meso={"3501": 55.0},
    )
    assert result[0]["delta_vs_2022"] == 5.0  # 60 - 55


def test_d_delta_none_quando_sem_historico() -> None:
    """Sem `historical_by_meso`, delta_vs_2022 = None."""
    municipios = [
        _munic("3501101", meso_cod="3501", meso_nome="Norte", votos={100: 600, 200: 400}),
    ]
    result = aggregate_by_mesorregiao(
        uf_row={"sigla": "SP"},
        municipios=municipios,
    )
    assert result[0]["delta_vs_2022"] is None


def test_d_delta_none_quando_cod_nao_mapeado() -> None:
    """Meso fora do dict historical → delta None (não crasha)."""
    municipios = [
        _munic("3501101", meso_cod="3501", meso_nome="Norte", votos={100: 600, 200: 400}),
    ]
    # Histórico só tem 3502 — meso 3501 não está no mapa
    result = aggregate_by_mesorregiao(
        uf_row={"sigla": "SP"},
        municipios=municipios,
        historical_by_meso={"3502": 50.0},
    )
    assert result[0]["delta_vs_2022"] is None


# ─────────────────────────────────────────────────────────────────────────────
# (e) Forward-compat — municípios sem mesorregiao_cod
# ─────────────────────────────────────────────────────────────────────────────


def test_e_skip_municipios_sem_meso_cod() -> None:
    """Município sem `mesorregiao_cod` (migration 0005 não populou) → skip.

    Garante que dev sem CSV de mesorregião continua funcionando — payload UF
    simplesmente omite `mesorregioes`.
    """
    municipios = [
        _munic("3501101", meso_cod=None, votos={100: 600, 200: 400}),
        _munic("3501202", meso_cod=None, votos={100: 600, 200: 400}),
    ]
    result = aggregate_by_mesorregiao(
        uf_row={"sigla": "SP"},
        municipios=municipios,
    )
    assert result == []


def test_e_misturado_alguns_com_alguns_sem() -> None:
    """Quando só alguns municípios têm meso_cod, só esses entram na agregação."""
    municipios = [
        _munic("3501101", meso_cod="3501", meso_nome="Norte", votos={100: 100, 200: 50}),
        _munic("3501999", meso_cod=None, votos={100: 1000, 200: 1000}),  # ignored
        _munic("3502202", meso_cod="3502", meso_nome="Sul", votos={100: 200, 200: 100}),
    ]
    result = aggregate_by_mesorregiao(
        uf_row={"sigla": "SP"},
        municipios=municipios,
    )
    assert len(result) == 2
    assert [r["cod"] for r in result] == ["3501", "3502"]


# ─────────────────────────────────────────────────────────────────────────────
# (f) Determinismo — mesma entrada → mesma saída
# ─────────────────────────────────────────────────────────────────────────────


def test_f_determinismo_mesma_entrada_mesma_saida() -> None:
    """Constituição § 6: aggregate_by_mesorregiao é pure."""
    municipios = [
        _munic("3501101", meso_cod="3501", meso_nome="A", votos={100: 100, 200: 80}),
        _munic("3502202", meso_cod="3502", meso_nome="B", votos={100: 50, 200: 100}),
        _munic("3503303", meso_cod="3503", meso_nome="C", votos={100: 70, 200: 70}),
    ]
    r1 = aggregate_by_mesorregiao(uf_row={"sigla": "SP"}, municipios=municipios)
    r2 = aggregate_by_mesorregiao(uf_row={"sigla": "SP"}, municipios=municipios)
    assert r1 == r2

    # Reordena a entrada — saída ainda deve ser estável (ordem por cod ASC).
    shuffled = [municipios[2], municipios[0], municipios[1]]
    r3 = aggregate_by_mesorregiao(uf_row={"sigla": "SP"}, municipios=shuffled)
    assert r1 == r3


def test_f_tie_breaker_lider_por_id_asc() -> None:
    """Quando 2 candidatos empatam em votos, líder = id menor (estável)."""
    municipios = [
        _munic("3501101", meso_cod="3501", meso_nome="Empate", votos={200: 100, 100: 100}),
    ]
    result = aggregate_by_mesorregiao(uf_row={"sigla": "SP"}, municipios=municipios)
    # Empate 100 vs 100 — líder = id menor (100), por tie-break ASC.
    assert result[0]["lider_candidato_id"] == 100
    assert result[0]["margem"] == 0.0


# ─────────────────────────────────────────────────────────────────────────────
# (g) UF mismatch sanity — não quebra, só warn
# ─────────────────────────────────────────────────────────────────────────────


def test_g_uf_mismatch_nao_quebra() -> None:
    """Município com `uf` diferente de `uf_row.sigla` ainda é agregado.

    Defensivo: a sanity check só loga warn, não filtra. Função permanece
    pure no sentido determinístico (entrada igual → saída igual), o warn
    vai pra logger (side effect controlado).
    """
    municipios = [
        _munic(
            "3501101",
            meso_cod="3501",
            meso_nome="Norte",
            uf="RJ",  # mismatch propositado
            votos={100: 100, 200: 80},
        ),
    ]
    # Não deve raise.
    result = aggregate_by_mesorregiao(
        uf_row={"sigla": "SP"},  # esperava SP
        municipios=municipios,
    )
    # Agregação aconteceu normalmente.
    assert len(result) == 1
    assert result[0]["cod"] == "3501"


def test_g_lista_vazia_retorna_lista_vazia() -> None:
    """Edge: municipios=[] → return []."""
    result = aggregate_by_mesorregiao(uf_row={"sigla": "SP"}, municipios=[])
    assert result == []


def test_g_uf_row_sem_sigla_nao_quebra() -> None:
    """uf_row sem campo 'sigla' não impede agregação (sanity check é opcional)."""
    municipios = [
        _munic("3501101", meso_cod="3501", meso_nome="Norte", votos={100: 100, 200: 80}),
    ]
    result = aggregate_by_mesorregiao(
        uf_row={},  # sem sigla
        municipios=municipios,
    )
    assert len(result) == 1
