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
- Retry com backoff exponencial em `/api/ingest` e `/api/ingest/[cargo]` (3 tentativas cada) — dois endpoints em paralelo possível (Presidente + Governador em Fluid Compute isolado, cada um com seu próprio rate limiter e lock anti-overlap por cargo) ([ADR-0035 D3](../architecture/adrs/0035-par-municipio-zona-unidade-de-ingestao.md)).
- Página de manutenção (`/manutencao`) como último recurso ([spec 013](../specs/013-pagina-manutencao/spec.md)).
- **Desde ADR-0038 (D4)**: Banner amarelo "Os dados do TSE não avançam há X min" gatilhado quando `dado_ts` (hora real do boletim TSE) fica mais de 3× a cadência do cargo atrás de `now()`, com limiar derivado (60s Pres/Gov, 300s Senador, 1.800s Deputado) — formalizando a meta de graceful degradation que RNF-012 exige.

## Cross-refs

- Tratamento de falhas TSE: [../specs/001-ingestao-tse/design.md](../specs/001-ingestao-tse/design.md)
- Runbook de incidentes: [../operations/runbook.md](../operations/runbook.md)
