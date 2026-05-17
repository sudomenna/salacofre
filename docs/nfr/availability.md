---
title: NFR — Disponibilidade
description: Metas de uptime, degradação aceitável, recuperação automática e graceful degradation
status: stable
source: PRD.md § 6.2
---

# Disponibilidade

| ID | Descrição | Meta |
|---|---|---|
| RNF-009 | Uptime na janela de eleição (17h–04h dia D) | 99,9% |
| RNF-010 | Tempo máximo de degradação aceitável | <30s |
| RNF-011 | Recuperação automática após falha do TSE | Sim |
| RNF-012 | Graceful degradation (último valor conhecido) | Sim |

## Como atingir

- Edge Config replicado em todos os PoPs — falha de uma região não derruba.
- Último payload conhecido persistido em Edge Config — banner amarelo "Reconectando" se TSE cair.
- Retry com backoff exponencial em `/api/ingest` (3 tentativas).
- Página de manutenção (`/manutencao`) como último recurso ([spec 013](../specs/013-pagina-manutencao/spec.md)).

## Cross-refs

- Tratamento de falhas TSE: [../specs/001-ingestao-tse/design.md](../specs/001-ingestao-tse/design.md)
- Runbook de incidentes: [../operations/runbook.md](../operations/runbook.md)
