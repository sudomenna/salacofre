---
title: Integration Tests
description: Pipeline ingest → modelo → Edge Config → API → render com TSE mockado
status: stable
source: PRD.md § 20.2
---

# Integration Tests

- Pipeline ingest → model → Edge Config → API → render (mock TSE).
- Replay de uma hora de dados reais de 2022 ponta-a-ponta.

## 🔴 Cinco destes testes ESCREVEM no banco — e precisam de autorização

`model-edge-cases`, `model-cycle`, `ingest-cycle`, `ingest-model-trigger` e o bloco de lock de
`ingest-routes-auth-cargo` inserem linhas reais em `projections`, `snapshots`, `eleitorado`,
`historical_results` e `ingest_log`. Eles só rodam com **`ALLOW_DB_WRITE_TESTS=1` declarada**:

```bash
ALLOW_DB_WRITE_TESTS=1 npx vitest run tests/integration/model-edge-cases.test.ts
```

⚠️ **Nunca declare essa variável com o `.env.local` de produção carregado.** O `DATABASE_URL` de
lá aponta para o Neon que vai guardar a apuração de 04/10.

### Por que a guarda existe

Até 2026-09-17 o único freio era a **ausência** de `DATABASE_URL` — e ausência é um estado que se
perde por acidente. Alguém carregou o `.env.local` para conferir uma migration, rodou
`npx vitest run`, e **1.877 linhas de harness foram gravadas no banco de produção**: 1.233 sob
cargos que não existem (91, 92, 93) e 644 sob o cargo **real** 1, com as candidaturas sintéticas
101 e 102 ao lado das de verdade.

O ponto único da decisão é [`tests/integration/_guarda-banco.ts`](../../tests/integration/_guarda-banco.ts).
Ele exige consentimento **declarado** em vez de tentar detectar "é produção" pelo host: adivinhação
com default permissivo é rede de mão única — uma URL nova de preview, e o buraco reabre.

### A regra que vale para qualquer cleanup

O cleanup daqueles testes filtrava `uf IN (…)`, e **`IN` nunca casa com `NULL`**. As linhas de
escopo NACIONAL (`uf IS NULL`) — justamente as que o modelo cria em todo ciclo — nunca eram
apagadas. O teste limpava o que via e deixava o que não via, por meses.

**Um `DELETE … WHERE col IN (…)` de limpeza só apaga o que a coluna enxerga.** Se a coluna é
anulável e o `NULL` significa alguma coisa, o furo tem o tamanho desse significado. Vale para
qualquer tabela deste repositório com `uf`, `cod_municipio_tse` ou `cod_zona` anuláveis.

### Como conferir resíduo no banco

```sql
SELECT cargo, count(*) FROM projections WHERE cargo NOT IN (1,3,5,6) GROUP BY cargo;
SELECT count(*) FROM projections WHERE cargo = 1 AND candidato_id BETWEEN 100 AND 299;
```

(os candidatos reais de presidente têm `candidato_id` < 100)

## Cross-refs

- Spec ingestão: [../specs/001-ingestao-tse/](../specs/001-ingestao-tse/)
- Spec modelo: [../specs/002-modelo-estatistico/](../specs/002-modelo-estatistico/)
