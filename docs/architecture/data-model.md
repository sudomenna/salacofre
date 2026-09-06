---
title: Modelo de Dados
description: Schema Postgres (Neon) e payload do Edge Config — fonte canônica do shape de dados
status: stable
source: PRD.md § 11
---

# Modelo de Dados

## Tabelas Postgres (Neon)

```sql
-- Histórico de eleições GERAIS (Presidente + Governador) — 2018 e 2022.
-- NÃO inclui 2024 (pleito municipal: prefeito/vereador — fora do escopo do SalaCofre).
-- Se houver expansão futura para municipal, adicionar cargos 11 (Prefeito), 13 (Vereador) e ano 2020/2024.
CREATE TABLE historical_results (
  id BIGSERIAL PRIMARY KEY,
  ano SMALLINT NOT NULL,            -- 2018, 2022 (ciclos de eleição geral)
  turno SMALLINT NOT NULL,          -- 1, 2
  cargo SMALLINT NOT NULL,          -- 1 = Presidente, 3 = Governador
  uf CHAR(2) NOT NULL,
  cod_municipio_tse INT,
  cod_zona INT NOT NULL,
  cod_candidato INT NOT NULL,
  nome_candidato TEXT,
  partido VARCHAR(20),
  votos INT NOT NULL,
  pct_validos NUMERIC(8,5),
  pct_total NUMERIC(8,5),
  UNIQUE (ano, turno, cargo, uf, cod_zona, cod_candidato)
);
CREATE INDEX ix_hist_lookup ON historical_results (ano, turno, cargo, uf, cod_zona);

-- Eleitorado por zona (atualizado para 2026)
CREATE TABLE eleitorado (
  ano SMALLINT NOT NULL,
  uf CHAR(2) NOT NULL,
  cod_municipio_tse INT NOT NULL,
  cod_zona INT NOT NULL,
  eleitores_aptos INT NOT NULL,
  comparecimento_pct_historico NUMERIC(5,4),
  PRIMARY KEY (ano, uf, cod_zona)
);

-- Mapeamento geográfico
CREATE TABLE municipios (
  cod_ibge CHAR(7) PRIMARY KEY,
  cod_municipio_tse INT NOT NULL UNIQUE,
  uf CHAR(2) NOT NULL,
  nome TEXT NOT NULL,
  geo_centroid GEOGRAPHY(POINT),
  populacao INT
);
CREATE INDEX ix_municipio_uf ON municipios (uf);

CREATE TABLE zonas (
  cod_zona INT PRIMARY KEY,
  cod_municipio_tse INT NOT NULL,
  uf CHAR(2) NOT NULL,
  nome TEXT,
  FOREIGN KEY (cod_municipio_tse) REFERENCES municipios(cod_municipio_tse)
);
CREATE INDEX ix_zona_uf ON zonas (uf);

-- Snapshots append-only do TSE durante apuração
CREATE TABLE snapshots (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cargo SMALLINT NOT NULL,
  turno SMALLINT NOT NULL,
  uf CHAR(2) NOT NULL,
  cod_zona INT NOT NULL,
  etag TEXT,                        -- ETag do TSE para dedup
  pct_apurado NUMERIC(5,2),
  votos_total INT,
  payload JSONB NOT NULL,           -- EA20 cru
  hash_payload CHAR(64) NOT NULL    -- SHA256 para detecção rápida de mudança
);
CREATE INDEX ix_snap_lookup ON snapshots (cargo, turno, uf, cod_zona, ts DESC);
CREATE INDEX ix_snap_ts ON snapshots (ts DESC);

-- Cálculos de projeção (histórico do modelo)
CREATE TABLE projections (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cargo SMALLINT NOT NULL,
  turno SMALLINT NOT NULL,
  uf CHAR(2),                       -- NULL = nacional
  candidato_id INT NOT NULL,
  votos_projetados BIGINT,
  pct_projetado NUMERIC(8,5),
  pct_projetado_lower NUMERIC(8,5), -- CI95 lower
  pct_projetado_upper NUMERIC(8,5),
  p_vitoria NUMERIC(5,4),
  pct_apurado NUMERIC(5,2)
);
CREATE INDEX ix_proj_lookup ON projections (cargo, turno, uf NULLS FIRST, ts DESC);

-- Operational
CREATE TABLE ingest_log (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INT,
  files_fetched INT,
  files_changed INT,
  errors INT,
  notes TEXT
);
```

## Escala de percentuais

O modelo (`api/model/`) trabalha internamente em **fração [0,1]** — é o
espaço do bootstrap (`bootstrap_uf`), de `edge_cases.py` (RF-017/RF-018) e
de `p_vitoria`. A fronteira de saída é `compute_uf_projections` /
`compute_national`: ambas convertem para **percentual 0–100** antes de
devolver `rows` (via `_frac_to_pct`) — mesma escala de `projections.pct_projetado*`
(coluna `NUMERIC(8,5)`, comporta até 999.99999) e do payload Edge Config
(`EdgeCandidate.pct_projetado*`, ver abaixo). `estimates_by_uf` /
`national_estimates` (os arrays do bootstrap, reusados por
`aggregate_national_estimates`, `compute_p_passa_2t`, `compute_p_fecha_1t`,
`compute_two_round_scenarios`) permanecem em fração — só `rows` cruza a
fronteira.

`api/model/replay_batch.py` (usado por `scripts/replay-2022.ts`, gate OT-4)
converte de volta para fração na serialização de stdout — o contrato com o
dataset de replay (`ground_truth`) e o threshold `< 0.02` sempre foram em
fração, e continuam sendo.

Linhas pré-simulado (2026-09-14 e antes) em `projections.pct_projetado*`
podem estar em fração (bug corrigido em S07) — não comparar diretamente
com linhas novas sem normalizar a escala.

`pct_apurado` (tabela `snapshots`, `historical_results.pct_total`, campo
`pct_apurado` de `rows`/payload) sempre foi 0–100 — não sofre essa
conversão em nenhum ponto do pipeline.

## Payload do Edge Config

Chave `projection:current` — JSON único de ~30KB:

```ts
type EdgePayload = {
  ts: string;                       // ISO8601
  cargo: 1 | 3;                     // Presidente ou Governador (1 cargo por payload)
  turno: 1 | 2;
  pct_apurado_total: number;        // 0–100
  ufs_apuradas: number;             // 0–27
  national: {
    candidatos: Array<{
      id: number;
      nome: string;
      partido: string;
      cor: string;
      votos_atuais: number;
      votos_projetados: number;
      pct_atual: number;
      pct_projetado: number;
      pct_projetado_lower: number;
      pct_projetado_upper: number;
      p_vitoria: number;
    }>;
    needle_position: number;        // -1 a 1
    needle_band: 'very_likely_a' | 'likely_a' | 'lean_a' | 'tossup' | 'lean_b' | 'likely_b' | 'very_likely_b';
  };
  por_uf: Array<{
    sigla: string;
    pct_apurado: number;
    lider: number;                  // candidato_id
    margem_atual: number;           // pp
    margem_projetada: number;
    margem_projetada_ci: [number, number];
    chamada: boolean;
    swing_vs_2022: number;          // pp
  }>;
  insights: string[];               // 1-3 frases por template
  composition: {                    // "What's powering the forecast"
    pre_election: number;           // 0–1, soma = 1
    model: number;
    actual_results: number;
  };
};
```

Payload `por_uf` para drill-down (chave `projection:uf:[sigla]`): inclui municípios e zonas. ~5–10KB por UF.

O bloco acima é o esqueleto histórico (S04). O shape completo e vigente — com
`rank`, `p_passa_2t`, `p_fecha_1t`, `participacao`, `mesorregioes` e o bloco de
segunda base descrito abaixo — vive em `lib/edge-config/types.ts`, que **deriva
deste markdown**: alterou o shape, atualize aqui primeiro.

### Duas bases por candidato (S07/Fase 2 — extrapolação do apurado)

A projeção de candidatos passa a ser **extrapolação do apurado por zona**
(regra de três: `k(z) = te/esi`, `V_c(z) = vap_c · k`), não mais swing vs. 2022.
Como a mesma contagem projetada de votos pode ser lida sobre dois
denominadores diferentes, o payload publica **as duas bases** e a UI escolhe
qual exibir — o numerador é idêntico, só o denominador muda.

| Base | Denominador (EA20) | Rótulo na UI | Onde |
|---|---|---|---|
| `votaveis` (default) | `v.vvc` — votos a **votáveis** concorrentes (válidos + anulados + sub judice; é o denominador do `pvap` do TSE) | "% dos votos a votáveis" | campos `pct_atual` / `pct_projetado` / `pct_projetado_lower` / `pct_projetado_upper` (nacional) e `ci95` (UF) |
| `comparecimento` | `e.c` — quem compareceu | "% do comparecimento" | bloco opcional `comparecimento` |

**Nunca chamar `vvc` de "válidos"** — o dicionário oficial de leiautes
(`docs/reference/tse-2026-leiautes.md`) reserva "válidos" para `v.vv`. O rótulo
canônico é "votáveis".

```ts
/** Segunda base de uma métrica de candidato: % sobre quem compareceu (e.c). */
type EdgeBaseComparecimento = {
  pct_atual: number | null;   // 0–100; null = ainda sem zona apurada
  pct_projetado: number;      // 0–100
  lower: number;              // CI95 inferior, 0–100
  upper: number;              // CI95 superior, 0–100
};

// EdgeCandidate      (nacional)                → comparecimento?: EdgeBaseComparecimento
// EdgeUfCandidate    (drill-down de UF)        → comparecimento?: EdgeBaseComparecimento
// EdgeParticipacao.outros                      → comparecimento?: EdgeBaseComparecimento
```

O campo é **opcional em todos os três pontos**: payloads pré-S07/Fase 2 e os
três fixtures de `tests/fixtures/edge-config/` continuam válidos. Quando a UI
está na base `comparecimento` e o campo não veio, o termômetro correspondente
renderiza em **"aguardando projeção"** (ADR-0017 — permanece no DOM) e **nunca**
cai de volta na base `votaveis`: exibir um número de outro denominador sob o
rótulo errado seria pior do que não exibir número nenhum.

**Identidade da base `comparecimento`.** O EA20 fecha
`Σvap + vb + tvn + van + vansj + vscv = c`, logo:

> candidatos + Outros + brancos + nulos = 100% de quem compareceu **menos**
> anulados e sub judice.

O resíduo (`van`, `vansj`, `vscv`) é pequeno mas não é zero — a legenda da UI
declara isso explicitamente em vez de arredondar para "somam 100". A abstenção
**não** entra nessa soma: ela tem base própria (`eleitores_instalados`).

### `participacao.metodo` — origem do número (RF-062)

```ts
metodo?: {
  tipo: "extrapolacao_apurado" | "imputado_nacional";
  n_zonas: number;              // zonas que entraram no estimador
  pct_apurado: number;          // 0–100
  n_zonas_imputadas?: number;   // zonas sem urna, imputadas pela proporção da UF
};
```

- `"extrapolacao_apurado"` — caminho normal: há pelo menos uma zona apurada na
  UF (ou no país) e a projeção é extrapolada do que já foi apurado.
- `"imputado_nacional"` — **nenhuma** zona da UF apurou ainda; a projeção usa a
  proporção nacional como âncora provisória, com IC alargado (RF-017). Só existe
  para cargo 1 (presidente): governador não tem agregado nacional equivalente,
  então a UF fica em "aguardando projeção".

`tipo` era `string` livre até S07/Fase 2 — passa a união fechada porque a UI
ramifica o rótulo por valor. `n_zonas_imputadas` é opcional: ausente ≡ 0.

### Campos em transição

- **`EdgeUfRow.swing_vs_2022: number | null`** — o tipo aceita `null` desde
  S07/Fase 2 (consumidores devem exibir "—"), mas o orchestrator ainda emite
  `0.0` fixo. Vira o **swing descritivo** (E1: apurado de agora − 2022, um fato
  observado, não insumo da projeção) na Fase 5, quando passa a ser `null` para
  UF/candidato sem número em 2022.
- **`EdgePayloadUf.model_fallback_tier`** — `@deprecated`. O K-1 3-tier
  (ADR-0015) dependia de 2022 como âncora e sai junto com o swing; a coluna
  `projections.model_fallback_tier` permanece no schema (sem migration) e o
  campo segue no tipo apenas para não quebrar payloads gravados. Novos
  consumidores não devem lê-lo.

## Princípios

- **Snapshots são append-only** (princípio § 10 da constituição) — habilita replay e auditoria.
- **Postgres não está no read path do cliente** — Edge Config é o único leitor durante apuração.
- **Hash SHA256 do payload** permite dedup rápida vs ETag do TSE.

## Cross-refs

- Constituição § 7 (resiliência) e § 10 (append-only): [../constitution.md](../constitution.md)
- ADR-0001 Edge Config no read path: [./adrs/0001-edge-config-no-read-path.md](./adrs/0001-edge-config-no-read-path.md)
- ADR-0008 Não Convex: [./adrs/0008-nao-convex.md](./adrs/0008-nao-convex.md)
- Specs que consomem: [001-ingestao-tse](../specs/001-ingestao-tse/), [002-modelo-estatistico](../specs/002-modelo-estatistico/)
