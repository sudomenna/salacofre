---
title: Métricas de Sucesso
description: Objetivos de produto (OP) e técnicos (OT) com metas mensuráveis
status: stable
source: PRD.md § 3
---

# Métricas de Sucesso

## Objetivos de Produto

| ID | Objetivo | Métrica | Meta |
|---|---|---|---|
| OP-1 | Ser fonte primária de apuração para o eleitor engajado | Usuários únicos no 1º turno | 500k+ |
| OP-2 | Maximizar engajamento por sessão | Tempo médio na sessão | >8min |
| OP-3 | Reter audiência entre 1º e 2º turno | Taxa de retorno | >60% |
| OP-4 | Construir credibilidade de marca | Citações em mídia jornalística | 10+ |

## Objetivos Técnicos

| ID | Objetivo | Métrica | Meta |
|---|---|---|---|
| OT-1 | Suportar pico de tráfego | Acessos simultâneos sustentados | 20.000+ |
| OT-2 | Latência percebida baixa | LCP p95 global | <2.5s |
| OT-3 | Fidelidade temporal aos dados | Defasagem TSE → tela do usuário | <30s |
| OT-4 | Acurácia da projeção | Erro absoluto da projeção em t=1h | <2pp |
| OT-5 | Disponibilidade na noite D | Uptime entre 17h e 03h | 99,9% |

---

## Cross-refs

- NFRs detalhadas: [../nfr/](../nfr/)
- Validação de OT-4 (acurácia): [../testing/replay.md](../testing/replay.md)
- Validação de OT-1 (carga): [../testing/load.md](../testing/load.md)
