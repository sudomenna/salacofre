---
title: NFR — Escalabilidade
description: Auto-scale horizontal sem intervenção, DB fora do read path, custos previsíveis
status: stable
source: PRD.md § 6.3
---

# Escalabilidade

| ID | Descrição | Meta |
|---|---|---|
| RNF-013 | Stack deve escalar horizontalmente sem intervenção | Auto-scale Vercel |
| RNF-014 | Não pode haver gargalo em banco de dados no read path | DB fora do read path |
| RNF-015 | Custos devem ser previsíveis e dimensionáveis | Modelo Pay-as-you-go |

## Como atingir

- Vercel Fluid Compute multiplexing single-instance.
- Edge Config no read path ([ADR-0001](../architecture/adrs/0001-edge-config-no-read-path.md)).
- Postgres só no write path (1× a cada 15s, não 20k/s).
- Monitoramento de billing semanal com alertas.

## Cross-refs

- Stack: [../architecture/tech-stack.md](../architecture/tech-stack.md)
- Risco "custo Vercel acima do orçado": [../reference/risks.md](../reference/risks.md)
