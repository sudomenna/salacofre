---
id: 002-modelo-estatistico
type: design
title: Modelo estatístico — Design Técnico
status: draft
---

# Design — Modelo estatístico

## Arquitetura

Endpoint Python (`/api/model/project`) rodando em Vercel Fluid Compute (Python 3.14 + NumPy). Acionado pelo `/api/ingest` após cada batch de snapshots ingeridos.

## Cálculos

### Extrapolação do apurado + bootstrap — `api/model/extrapolation.py`

Módulo **irmão** de `turnout.py` (semânticas diferentes: aqui é razão de somas de contagens escaladas, lá é média ponderada de taxas). Não importa `historical_results`, não conhece `pct_validos` de 2022, não faz swing ([ADR-0021](../../architecture/adrs/0021-extrapolacao-do-apurado-sem-2022.md)).

**Pré-processamento (zona_merge)**: O endpoint Python recebe snapshots já agregados de **par** (município, zona) por `api/model/zona_merge.py` (módulo novo em [ADR-0035 D2](../../architecture/adrs/0035-par-municipio-zona-unidade-de-ingestao.md)). Esse módulo soma os pares de volta em zona, em memória, antes de passar ao estimador — operação determinística que preserva o contrato zona-a-zona. O método do estimador (extrapolação + bootstrap) **não muda**. A mudança de unidade de ingestão (zona → par → zona novamente) foi medida e validada: o gate OT-4 rodado contra o mesmo fixture commitado antes e depois da mudança retornou **MAE@1h idêntico ao dígito** (PT 2,3623pp / cobertura IC95 82,5%).

```python
def estimate_uf_candidatos(
    zonas: list[ZonaCandidatos],
    pct_apurado_uf: float,      # 0–100
    seed: int,                  # derivado pelo CALLER de (uf, "candidatos")
    n_resamples: int = 1000,
) -> UfCandidatosEstimate | None:
    """
    Zona apurada  <=> esi > 0 ∧ vvc > 0 ∧ weight > 0.
    k(z)   = te/esi                       # fator de escala (RF-011)
    V_c(z) = vap_c·k   B_v(z) = vvc·k   B_c(z) = c·k
    s_v_c(U) = ΣV_c / ΣB_v                # razão de somas (RF-012)
    pct_atual_v(U) = Σvap_c / Σvvc        # literal, SEM k

    E3 (RF-013): zonas não apuradas entram por fórmula fechada
        B_v(U) = ΣB_v(A) · (Σte(todas) / Σte(A))
    — o share não muda; só o volume absoluto.

    IC (RF-015): UM idx por UF, compartilhado entre TODOS os candidatos
    e as DUAS bases, sorteado só sobre as zonas apuradas:
        idx     = default_rng(seed).integers(0, k_A, (n, k_A))
        den_v   = (vvc·k)[idx].sum(1);  den_c = (c·k)[idx].sum(1)
        num_c   = (vap_c·k)[idx].sum(1)
        est_v_c = num_c/den_v;          est_c_c = num_c/den_c
    Ponto = fórmula fechada (não `mean` do bootstrap). RF-018 nas duas bases.
    Retorna None se NENHUMA zona estiver apurada -> caller decide (RF-017).
    """

def impute_uf_from_national(national_shares, national_point, w_uf, r_v_br) -> UfCandidatosEstimate:
    """RF-017, 2º nível hierárquico: UF sem zona apurada (só cargo 1).
    s_c(U) := s_c(BR), CI ±10pp via `inflate_ci_zero_apurado`, `estimates`
    reusa o array NACIONAL pareado. Cargo 3 não chama — o caller omite a UF."""

def aggregate_national_votos(by_uf) -> tuple[dict[int, int], int]:
    """RF-020.3 — Σ `votos_projetados` por candidato, UF → Brasil."""
```

O contrato de `estimates_by_uf[uf][cand]` (share **fracionário**, shape `(1000,)`, pareado) é preservado — `compute_national`, `p_vitoria`, `compute_p_passa_2t`, `compute_p_fecha_1t`, `compute_two_round_scenarios` e `compute_outros_estimates` continuam agnósticos ao método de projeção.

### Probabilidade de vitória

```python
def p_vitoria(estimates_a, estimates_b):
    return np.mean(estimates_a > estimates_b)
```

### Posição da agulha

```
position = clip((p_vitoria_A - 0.5) * 2, -1, +1)

band = {
  if |position| < 0.2  → 'tossup'
  elif |position| < 0.5 → 'lean'
  elif |position| < 0.85 → 'likely'
  else                  → 'very_likely'
}
```

## Tratamento de casos de borda

| Caso | Tratamento |
|---|---|
| Zona sem urna aberta (`esi ≤ 0` ∨ `vvc ≤ 0` ∨ `w ≤ 0`) | **Imputada** pela proporção das zonas apuradas da própria UF (RF-013). Nunca descartada do total. |
| UF (presidente) com 0 zonas apuradas | Proporção do agregado **nacional**, CI = ±10pp, `metodo.tipo = "imputado_nacional"` (RF-017) |
| UF (governador) com 0 zonas apuradas | UF **omitida** — não existe corrida nacional para ancorar; UI mostra "aguardando projeção" |
| UF com <5% apurado | CI inflado em 50% adicional nas duas bases (RF-018) |
| Candidato sem histórico em 2022 | **Não é caso de borda** — a projeção não consulta 2022; o candidato entra pela união dos vistos nas zonas apuradas |
| Volatilidade anômala / divergência entre UFs vizinhas | **Não existe circuit breaker** no código. A redação anterior descrevia um fallback por volatilidade que nunca foi implementado; qualquer mecanismo desse tipo exigiria ADR próprio |

## Validação por Replay

Script `scripts/replay-2022.ts`:

- Carrega todos os snapshots de 2022 do dataset aberto TSE.
- Replica cronologicamente.
- A cada timestep, computa projeção e compara com resultado final.
- **Métricas**:
  - Erro absoluto médio (MAE) por candidato em t = {15min, 30min, 1h, 2h}.
  - Cobertura do IC95: em quantos pares (UF, candidato) o resultado final caiu dentro da faixa.
  - Calibração de probabilidade: dos casos onde modelo disse P=80%, em quantos % candidato realmente venceu?

Critério de aceite: MAE em t=1h < 2pp (OT-4) **+** cobertura do IC95 em t=1h ≥ 90%.

> **Gate e faixa de sensibilidade (atualizado 2026-09-11).**
>
> O fixture de replay **deixou de ser tautológico** na Fase 5 da S07 (06–07/09). Antes ele gravava
> `pct_apurado: 100` por zona — cada zona apurava inteira num instante, não havia nada a extrapolar
> e a projeção colapsava no gabarito; era isso que os 0,998pp de S03 mediam. Hoje cada zona apura em
> frações (`INTRA_ZONA_FRACOES`, `scripts/build-replay-fixtures.ts:152`) e o gate voltou a exercitar
> o modelo de verdade — o MAE subir de 0,998 para ~2,36pp é o gate ficando honesto, não o modelo
> piorando.
>
> **O parâmetro de sensibilidade é `REGIONAL_DELAY`** (`build-replay-fixtures.ts:150`, parametrizável
> por `REPLAY_REGIONAL_DELAY`): quantos **timesteps** — não horas — as zonas de Norte e Nordeste
> relatam depois do resto do país (`regionDelay(uf)`, `:158`). Não é um corte global de tempo; é um
> viés **regional** de ordem de chegada, que é exatamente o que o replay foi reescrito para expor.
>
> Faixa medida com `pnpm replay-2022:sensitivity` ([ADR-0033](../../architecture/adrs/0033-navegacao-moldura-persistente-paineis-home-calibracao-ot4.md) D3,
> implementado em 11/09; tabela viva em [`docs/testing/replay-sensitivity.md`](../../testing/replay-sensitivity.md)):
>
> | atraso regional | MAE@1h PT | cobertura IC95@1h | veredito |
> |---|---|---|---|
> | 0 timesteps | 1,3420pp | 93,3% | ✅ |
> | 1 timestep | 1,5979pp | 90,2% | ✅ |
> | 2 timesteps | 1,9510pp | 87,5% | ❌ |
> | **3 timesteps (ponto oficial)** | **2,3623pp** | **82,5%** | ❌ |
>
> **O gate continua reprovando no ponto oficial, e a spec continua `implementing`.** O que mudou é
> *como o gate é reportado* — faixa em vez de veredito único —, não o limiar (< 2pp e ≥ 90%, RNF-006)
> nem qual ponto é o oficial.
>
> **Não há calibração possível com dado de 2022**: os timestamps de apuração zona a zona não existem
> em nenhuma fonte pública verificável (verificado em 08/09 — a URL de zona documentada no PRD devolve
> 404 e o config do TSE só lista `ele2024`). Os simulados de 15–17/09 e 22–24/09 permitem medir o
> atraso regional **de 2026**, o que é evidência medida e pode estreitar a faixa — mas mede outra
> coisa, não substitui a calibração perdida. O protocolo de coleta precisa cobrir as cinco regiões,
> não só SP ([`docs/testing/tse-simulados.md`](../../testing/tse-simulados.md)).
>
> **`zona_merge` não afeta este gate**: medido antes e depois contra o fixture commitado, MAE@1h PT
> 2,3623pp / cobertura 82,5% — dígitos idênticos (ADR-0035 D2).

## Contratos

### Request `POST /api/model/project`

```json
{ "cargo": 1, "turno": 1, "trigger_ts": "2026-10-04T18:23:15Z" }
```

### Response 200

```json
{ "computed": true, "uf_count": 14, "national_p_vitoria_a": 0.78 }
```

## Cálculos S05 — 2º turno (e a remoção do K-1 em S07)

### `compute_two_round_scenarios`

Função nova S05 (conforme [ADR-0014](../../architecture/adrs/0014-p-segundo-turno-primeira-classe.md)):

```python
def compute_two_round_scenarios(
    national_estimates: dict[int, np.ndarray],
    _cand_ordered: list[int] | None = None,
) -> dict:
    """
    Gera P(2º turno) + os 3 duelos mais prováveis, direto dos resamples.

    Para cada resample: identifica o top-2, canonicaliza o par (id menor
    primeiro) para não contar AB e BA em separado, e conta se algum
    candidato fechou sozinho >= 50%.

    Args:
        national_estimates: {candidato_id: ndarray} em fração [0, 1].

    Returns:
        {
            'p_segundo_turno_overall': float,           # P(ninguém fecha no 1T)
            'cenarios_2t': [{'par': [id_a, id_b], 'prob': 0.35}, ...]  # top-3
        }
    """
```

> Não existe parâmetro de "indecisos" no modelo. O universo é sempre o dado
> apurado do TSE decomposto pelo próprio EA20 (`v.vvc`, `e.c`, `e.esi`); o
> que não é voto em candidato entra como brancos/nulos ou abstenção, com
> denominador próprio (RF-020.1), nunca como massa redistribuída.

### `compute_p_passa_2t`

Probabilidade por candidato de passar para 2º turno:

```python
def compute_p_passa_2t(national_estimates: dict[int, np.ndarray]) -> dict[int, float]:
    """
    P(candidato termina no top-2), contada resample a resample — não
    derivada de rank fixo. Devolve {candidato_id: probabilidade}.
    """
```

### `compute_p_fecha_1t`

Probabilidade por candidato de fechar eleição no 1º turno:

```python
def compute_p_fecha_1t(national_estimates: dict[int, np.ndarray]) -> dict[int, float]:
    """
    P(candidato fecha a eleição no 1º turno) = fração dos resamples em que
    ele sozinho passa de 50%. Devolve {candidato_id: probabilidade}.
    """
```

### K-1 Fallback 3-tier — **removido** ([ADR-0021](../../architecture/adrs/0021-extrapolacao-do-apurado-sem-2022.md) supersede [ADR-0015](../../architecture/adrs/0015-k1-fallback-3-tier.md))

O fallback K-1 nunca ficou operacional (`swing.resolve_k1_tier`, `party_mapping`, `pre_election_polls` eram código morto, não chamados por `project.py`) e deixou de fazer sentido: sem 2022 no caminho do cálculo, não existe "candidato sem mapeamento". Os módulos foram deletados.

A coluna `projections.model_fallback_tier` e o campo opcional `EdgePayloadUf.model_fallback_tier?` permanecem no schema marcados `@deprecated`, **sem migration de remoção** — nenhum consumidor os lê, e a UI não exibe mais disclaimer de prior limitado.

Color lock em `pct_apurado ≥ 1%` (conforme [ADR-0013](../../architecture/adrs/0013-tokens-multi-candidato-por-rank.md)): candidatos com < 1% são greyed out, não recebem token de rank visual.

## Cálculos S07 — participação e agregado "Outros" (RF-020.1)

### `api/model/turnout.py`

Módulo isolado (não importa `project.py` — a dependência é de mão única, `project.py` → `turnout.py`).

```python
Metric = Literal["abstencao", "brancos_nulos"]

def metric_value(z: ZonaParticipacao, metric: Metric) -> float:
    """Fração [0,1] da métrica numa zona:
       abstencao     → a(z) / esi(z)     (eleitorado das seções instaladas)
       brancos_nulos → bn(z) / c(z)      (comparecimento)"""

def estimate_uf_participacao(
    zonas: list[ZonaParticipacao],
    metric: Metric,
    pct_apurado_uf: float,      # 0–100
    seed: int,                  # derivado pelo CALLER de (uf, metric)
    n_resamples: int = 1000,
) -> ParticipacaoEstimate | None:
    """Regra de três + bootstrap de zonas. `None` se nenhuma zona é utilizável."""

def aggregate_national_participacao(
    by_uf: dict[str, ParticipacaoEstimate | None],
    eleitorado_total_by_uf: dict[str, int],
) -> ParticipacaoEstimate | None:
    """Soma dos arrays de resample por UF, ponderada por eleitorado total."""
```

Pontos que o código fixa e a spec depende:

- **Ponto projetado é fórmula fechada**, não `mean(bootstrap)` — média de `metric_value(z)` ponderada por `w(z)`. O bootstrap serve só para o CI, como em `compute_uf_projections`.
- **`pct_atual` é razão literal de somas** (`Σ num / Σ den`), não média de frações por zona: cada zona contribui pelo seu denominador bruto real.
- **Exclusão de zonas** acontece dentro de `estimate_uf_participacao` (denominador ≤ 0 **ou** `weight ≤ 0`) — o caller não pré-filtra.
- **Seed** é responsabilidade do caller (`compute_participacao`), derivado de `(uf, metric)` pelo mesmo padrão de `local_seed` em `compute_uf_projections`. Isso mantém `turnout.py` desacoplado e o resultado reprodutível bit-a-bit.
- **RF-018 reusado tal qual** via `edge_cases.inflate_ci_low_apurado` — sem reimplementação.

### Agregado "Outros"

```python
def compute_outros_estimates(
    estimates: dict[int, np.ndarray],   # fração [0,1], mesmo shape
    rank_by_cand: dict[int, int],       # 1-based; ausente ⇒ rank 0 (nunca entra)
    min_rank: int = 4,
) -> tuple[np.ndarray, int]:            # (soma pareada por resample, n_candidatos)
```

A soma é **elementwise entre arrays já sorteados** — preserva a covariância entre os candidatos de cauda e produz um IC genuíno. `100 − Σtop3` descartaria toda essa incerteza e por isso só existe como fallback de apresentação, obrigatoriamente rotulado "IC indisponível" (ADR-0018).

### Contrato das duas bases por candidato (RF-020.2)

```ts
export interface EdgeBaseComparecimento {
  pct_atual: number | null;   // 0–100
  pct_projetado: number;      // 0–100
  lower: number;
  upper: number;
}
// EdgeCandidate  / EdgeUfCandidate:      comparecimento?: EdgeBaseComparecimento;
// EdgeParticipacao.outros:               ... & { comparecimento?: EdgeBaseComparecimento };
```

Os campos de topo (`pct_atual`, `pct_projetado`, `lower`, `upper`) seguem na base **votáveis** — o default da tela. A chave `comparecimento` é **opcional**: fixtures anteriores à S07 não a têm, e o consumidor que não a encontra renderiza "aguardando projeção", **nunca** o número de votáveis sob o rótulo de comparecimento (seria publicar um valor sob denominador alheio — art. 267 §4º, [ADR-0020](../../architecture/adrs/0020-conformidade-res-23751-2026.md)).

### Contrato do bloco `participacao` no payload

Emitido por `build_participacao_payload` em `EdgeNational` e em `EdgePayloadUf` — ambos opcionais (`participacao?`), tipados em `lib/edge-config/types.ts`:

```json
"participacao": {
  "abstencao":     {"pct_atual": 20.1, "pct_projetado": 21.4, "lower": 19.8, "upper": 23.0, "base": "eleitores_instalados"},
  "brancos_nulos": {"pct_atual": 6.9,  "pct_projetado": 7.3,  "lower": 6.6,  "upper": 8.1,  "base": "comparecimento"},
  "outros":        {"pct_atual": 5.2,  "pct_projetado": 5.0,  "lower": 4.1,  "upper": 6.2,  "base": "votaveis", "n_candidatos": 8},
  "metodo": {"tipo": "extrapolacao_apurado", "n_zonas": 1234, "pct_apurado": 48.2}
}
```

Cada métrica é omitida quando não calculável; o bloco inteiro é omitido quando nenhuma das três existe (evita um `metodo` órfão). `metodo.n_zonas` é o **maior** `n_zonas` entre `abstencao` e `brancos_nulos` — as duas podem ter conjuntos de zonas úteis ligeiramente diferentes.

**Sem persistência**: nada disso entra em `projections` (ver RF-020.1). Sem migration nesta fase.

## Persistência

- **`projections`** — append-only, uma linha por (cargo, turno, uf, candidato, ts).
- **Edge Config** — escrita do payload consolidado via chaves nomeadas ([ADR-0012](../../architecture/adrs/0012-edge-config-chaves-nomeadas.md)): `projection:current:pres:t1`, `projection:current:pres:t2`, etc.

## ADRs aplicáveis

- [ADR-0006 Bootstrap, não Bayesiano](../../architecture/adrs/0006-bootstrap-nao-bayesiano.md)
- [ADR-0007 Granularidade zona vs município](../../architecture/adrs/0007-zona-vs-municipio.md)
- [ADR-0001 Edge Config write path](../../architecture/adrs/0001-edge-config-no-read-path.md)
- [ADR-0012 Chaves nomeadas por corrida e turno](../../architecture/adrs/0012-edge-config-chaves-nomeadas.md)
- [ADR-0014 Métricas de 2º turno primeira classe](../../architecture/adrs/0014-p-segundo-turno-primeira-classe.md)
- [ADR-0021 Extrapolação do apurado por zona, sem 2022](../../architecture/adrs/0021-extrapolacao-do-apurado-sem-2022.md) — supersede o ADR-0015 e é a base de RF-011/012/013/017/020.2/020.3
- [ADR-0018 Seis termômetros no hero do 1T](../../architecture/adrs/0018-termometros-hero-1t.md) — origem de RF-020.1
- [ADR-0020 Conformidade Res. TSE 23.751/2026](../../architecture/adrs/0020-conformidade-res-23751-2026.md) — art. 267 §4º veda alterar o conteúdo dos dados (base da regra de denominadores não-intercambiáveis)

## Riscos técnicos

- **Modelo retorna NaN sob input degenerado** — guardrails em `lib/model/project.py` com defaults seguros.
- **Bootstrap lento sob alta carga de UFs** — paralelizar via `numpy.random.Generator` com seeds determinísticas.
- **Viés de composição — risco metodológico central** ([ADR-0021](../../architecture/adrs/0021-extrapolacao-do-apurado-sem-2022.md), Consequências). Vale para candidatos e participação: as seções/zonas que apuram primeiro podem ter perfil sistematicamente diferente das que faltam, e **o bootstrap não vê esse resíduo** — reamostrar zonas apuradas mede a variação entre elas, não a distância para as não apuradas. Mitigação declarada: RF-018 (CI inflado <5% apurado) + rótulo "projeção a partir do apurado" (RF-062). Não inventar inflações extras sem ADR. Reavaliar após os simulados TSE de 15–17/09 e 22–24/09/2026.

## Cross-refs

- Spec: [./spec.md](./spec.md)
- Schema `projections`: [../../architecture/data-model.md](../../architecture/data-model.md)
- Validação: [../../testing/replay.md](../../testing/replay.md)
