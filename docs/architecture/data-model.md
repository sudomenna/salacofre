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

## Princípios

- **Snapshots são append-only** (princípio § 10 da constituição) — habilita replay e auditoria.
- **Postgres não está no read path do cliente** — Edge Config é o único leitor durante apuração.
- **Hash SHA256 do payload** permite dedup rápida vs ETag do TSE.

## Cross-refs

- Constituição § 7 (resiliência) e § 10 (append-only): [../constitution.md](../constitution.md)
- ADR-0001 Edge Config no read path: [./adrs/0001-edge-config-no-read-path.md](./adrs/0001-edge-config-no-read-path.md)
- ADR-0008 Não Convex: [./adrs/0008-nao-convex.md](./adrs/0008-nao-convex.md)
- Specs que consomem: [001-ingestao-tse](../specs/001-ingestao-tse/), [002-modelo-estatistico](../specs/002-modelo-estatistico/)
