---
id: 005-pagina-uf-governador
title: Página de UF — Governador (T-04)
status: draft
priority: M
personas: [P1, P2, P3]
screens: [T-04]
requirements: [RF-031, RF-032, RF-033, RF-034, RF-035, RF-036, RF-037, RF-038, RF-039, RF-040, RF-041, RF-042, RF-043, RF-044]
depends_on: [001-ingestao-tse, 002-modelo-estatistico, 004-pagina-uf-presidencial, 008-interatividade-brushing]
apis: [GET /api/projection?cargo=governador&uf=<sigla>]
components: [WinnerBanner, CandidateRow, ChoroplethMap, BubbleMap, SwingArrowMap, MunicipioTable, UFMapDuo, Needle, TimeSeriesChart, ProbabilityOverTime, TurnoutAreaChart, ForecastTransparency, InsightCard]
nfr: [RNF-001, RNF-002, RNF-003, RNF-008, RNF-022, RNF-023, RNF-024, RNF-025, RNF-027]
adrs: [0001, 0003, 0004, 0007, 0010]
---

# Spec 005 — Página de UF (Governador)

**Rota**: `/uf/[sigla]/governador`

## Objetivo

Versão da página de UF para a corrida de Governador daquela unidade federativa.

## Escopo

**In**:
- Mesma estrutura da [spec 004](../004-pagina-uf-presidencial/spec.md), mas com dados do cargo Governador (cargo=3).
- Reutiliza todos os componentes — mudança é apenas no fetch (`?cargo=governador`).

**Out**:
- Lista das 27 corridas estaduais (escopo [spec 006](../006-grid-governadores/)).
- Páginas presidenciais.

## Requisitos Funcionais

**Idênticos a [spec 004](../004-pagina-uf-presidencial/spec.md)** — todos os RFs RF-031 a RF-044 se aplicam, com `cargo=3` no fetch.

A única diferença comportamental: candidatos a governador podem ter blocos políticos não mapeáveis em 2022 (governador é mais volátil). Quando isso acontece (RF-018-like, ver [spec 002](../002-modelo-estatistico/spec.md)), exibir disclaimer:

> "Modelagem para essa corrida está desabilitada — exibimos apenas o parcial atual sem projeção."

## Requisitos Não-Funcionais

Mesmos da spec 004 — URL canônica `/uf/[sigla]/governador`.

## Open questions

- Quando todos os candidatos a Governador de uma UF não são mapeáveis em 2022 (caso raro: 100% novos), a página deve ainda existir ou retornar 404? (atual: existe, exibe parcial sem projeção).

## Cross-refs

- Spec irmã (Presidencial): [../004-pagina-uf-presidencial/](../004-pagina-uf-presidencial/)
- Lista nacional Gov: [../006-grid-governadores/](../006-grid-governadores/)
- Modelo (casos de borda): [../002-modelo-estatistico/spec.md](../002-modelo-estatistico/spec.md)
- Design técnico: [./design.md](./design.md)
