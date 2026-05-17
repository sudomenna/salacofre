---
id: 006-grid-governadores
title: Grid Nacional Governadores (T-02)
status: draft
priority: M
personas: [P1, P2, P3]
screens: [T-02]
requirements: [RF-021, RF-022, RF-025, RF-027, RF-029]
depends_on: [001-ingestao-tse, 002-modelo-estatistico, 005-pagina-uf-governador]
apis: [GET /api/projection?cargo=governador]
components: [GovernorCard, GovernorFilterBar, LiveBadge, Tabs]
nfr: [RNF-001, RNF-002, RNF-003, RNF-022, RNF-023, RNF-024]
adrs: [0001, 0002, 0010]
---

# Spec 006 — Grid Nacional Governadores

**Rota**: `/governador`

## Objetivo

Mostrar status de todas as 27 corridas estaduais em uma única tela.

## Escopo

**In**:
- Grid de 27 cards `<GovernorCard />` (um por UF).
- Cada card: agulha mini, top 2 candidatos com %, status (chamada/em disputa).
- Filtros: Todas / Em disputa / Chamadas / Apuradas.
- Tab para alternar entre Presidente/Governador.
- Header com contagem (ex: "14 chamados, 13 ainda em disputa").

**Out**:
- Drill-down por UF (escopo [spec 005](../005-pagina-uf-governador/)).

## Wireframe (desktop)

```
┌──────────────────────────────────────────────────────────────────┐
│ Governadores 2026                              [Pres] [Gov]      │
│ 14 chamados, 13 ainda em disputa                                 │
├──────────────────────────────────────────────────────────────────┤
│ Filtros: [Todas] [Em disputa] [Chamadas] [Apuradas]              │
│                                                                  │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                  │
│ │ SP          │ │ MG          │ │ RJ          │                  │
│ │ ╱─agulha─╲ │ │ ╱─agulha─╲ │ │ ╱─agulha─╲ │                  │
│ │ Tarcísio 52│ │ Zema     61│ │ Castro   48│                  │
│ │ Boulos   46│ │ Pacheco  37│ │ Freixo   40│                  │
│ │ ✓ CHAMADA  │ │ ✓ CHAMADA  │ │ Em disputa │                  │
│ └─────────────┘ └─────────────┘ └─────────────┘                  │
│ ... (24 cards mais)                                              │
└──────────────────────────────────────────────────────────────────┘
```

## Requisitos Funcionais (EARS)

Aplicam-se subsets dos RFs já definidos na home:

**RF-021 (agulha)** — cada `<GovernorCard />` exibe mini-agulha.
**RF-022 (votos absolutos)** — exibidos no card resumido.
**RF-025 (tabela de UFs)** — substituída por grid de cards aqui.
**RF-027 (atualização live)** — polling SWR a cada 5s.
**RF-029 (tabs Pres/Gov)** — alterna entre `/` e `/governador`.

### RFs específicos dessa tela

**RF-006.1 — Header com contagem de chamadas**

WHEN a página renderiza, the system SHALL exibir contagem `{n_chamadas} chamados, {n_em_disputa} ainda em disputa`.

**RF-006.2 — Filtros por status**

WHEN o usuário clica em um filtro, the system SHALL filtrar cards visíveis por `Todas | Em disputa | Chamadas | Apuradas`.

> Nota: esses RFs específicos são **adições à spec**, não estão no PRD original. Ver [traceability.md](../../_meta/traceability.md).

## Requisitos Não-Funcionais

Mesmos da home (performance + a11y).

## Open questions

- Mobile: grid 1-col em portrait, 2-col em landscape? (atual: 1-col sempre <640px).

## Cross-refs

- Design: [./design.md](./design.md)
- Spec UF Governador (drill-down): [../005-pagina-uf-governador/](../005-pagina-uf-governador/)
- Home Presidencial (modelo de tela espelho): [../003-home-nacional/](../003-home-nacional/)
