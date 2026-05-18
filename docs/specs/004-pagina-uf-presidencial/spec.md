---
id: 004-pagina-uf-presidencial
title: Página de UF — Presidencial (T-03)
status: shipped
priority: M
personas: [P1, P2, P3, P4]
screens: [T-03]
requirements: [RF-031, RF-032, RF-033, RF-034, RF-035, RF-036, RF-037, RF-038, RF-039, RF-040, RF-041, RF-042, RF-043, RF-044]
depends_on: [001-ingestao-tse, 002-modelo-estatistico, 008-interatividade-brushing, 003-home-nacional]
apis: [GET /api/projection?uf=<sigla>]
components: [WinnerBanner, CandidateRow, NewsClippingPlaceholder, ChoroplethMapUF, BubbleMap, SwingArrowMap, MunicipioTable, UFMapDuo, UfMapsLazy, Needle, TimeSeriesChart, ProbabilityOverTime, TurnoutAreaChart, ForecastTransparency, InsightCard, UFBreadcrumb, Footer]
nfr: [RNF-001, RNF-002, RNF-003, RNF-008, RNF-022, RNF-023, RNF-024, RNF-025, RNF-027]
adrs: [0001, 0003, 0004, 0007, 0010, 0013, 0014, 0015, 0017]
shipped_with_carry_overs:
  - NewsClippingPlaceholder-sem-RF-formal-clipping-midias-BR-virara-spec-em-F4b-F5
  - chunk-MapLibre-287KB-acima-RNF-007b-pendente-ADR-aumentar-meta-300KB
  - e2e-Playwright-cobertura-RF-034-RF-035-RF-036-RF-038-interacao-MapLibre-deferida-S05
  - imagens-OG-dinamicas-RF-051-deferidas-spec-009-dedicada
---

# Spec 004 — Página de UF (Presidencial)

**Rota**: `/uf/[sigla]`

## Objetivo

Espelhar a profundidade da página estadual do NYT, adaptada ao contexto brasileiro — winner banner, mapas duo (votos reportados + estimativa do que falta), tabela de municípios, swing vs 2022, agulha estadual, séries temporais.

## Escopo

**In**:
- Breadcrumb para voltar ao nacional.
- Winner banner colorido (P(vitória) > 95%).
- Tabela de candidatos.
- Mapa do estado em granularidade de município.
- Mapas duo: votos reportados (bubbles) + estimativa do que falta (choropleth).
- Tabela de municípios paginada/virtualizada.
- Mapa de swing vs 2022 com setas.
- Agulha estadual + estimated margin.
- Gráficos: margem ao longo do tempo, probabilidade ao longo do tempo, turnout cumulativo.
- Bloco "O que está movendo o forecast agora".
- Insight textual por template.

**Out**:
- Página de UF para Governador (escopo [spec 005](../005-pagina-uf-governador/)).
- Drill-down de município — deferido para v2.

## Personas e jornadas

- **P1**: drill-down rápido após ver UF decisiva na home.
- **P2**: dados defensáveis e exportáveis, swing vs 2022.
- **P3**: passa horas, navega entre UFs.

## Wireframe (desktop)

```
┌──────────────────────────────────────────────────────────────────┐
│ ‹ Voltar ao nacional                                             │
│ São Paulo — Apuração Presidencial 2026                           │
├──────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────┐ ┌───────────────────────────┐   │
│ │ [VENCEDOR ✓]                 │ │                            │   │
│ │ Lula vence em São Paulo     │ │     [MAPA DE MUNICÍPIOS]   │   │
│ │ Chamada por AP/Reuters       │ │     com choropleth         │   │
│ │                              │ │     coordenado             │   │
│ │ Candidato  Partido  Votos %  │ │                            │   │
│ │ ▌Lula      PT       8.2M 54.1│ │                            │   │
│ │ ▌Bols      PL       7.0M 45.9│ │                            │   │
│ │ Total: 15.2M reportados      │ │                            │   │
│ └──────────────────────────────┘ └───────────────────────────┘   │
│                                                                  │
│ Insight: "Lula supera 2022 em SP por 2,1pp; ganho expressivo... │
│                                                                  │
│ Mapeando os resultados e o que ainda falta                       │
│ ┌──────────────────────┐  ┌──────────────────────┐               │
│ │  Votos REPORTADOS    │  │  ESTIMATIVA do que   │               │
│ │  (bubbles)           │  │  falta (choropleth)  │               │
│ └──────────────────────┘  └──────────────────────┘               │
│                                                                  │
│ Tabela de municípios (645 itens, paginada/virtualizada)          │
│ Município   Margem   % apurado   Votos                           │
│ São Paulo   Lula+8   100%        4.2M    [highlighted on hover]  │
│ Campinas    Bols+3   100%        680k                            │
│ ...                                                              │
│                                                                  │
│ Como os votos se comparam com 2022                               │
│ [Mapa de swing — choropleth + setas]                             │
│                                                                  │
│ Forecast ao vivo de SP                                           │
│ ╱─agulha─╲   Margem estimada: Lula +8.2pp (± 1.1)                │
│                                                                  │
│ Margem ao longo do tempo    Probabilidade ao longo do tempo      │
│ Turnout reportado            O que está movendo o forecast       │
└──────────────────────────────────────────────────────────────────┘
```

## Requisitos Funcionais (EARS)

**RF-031 — Breadcrumb voltar ao nacional**

WHEN a página de UF renderiza, the system SHALL exibir breadcrumb `‹ Voltar ao nacional` linkando para `/`.

**RF-032 — Winner banner quando P(vitória) > 95%**

IF `p_vitoria_lider ≥ 0.95`, the system SHALL exibir `<WinnerBanner />` colorido na cor do candidato vencedor.

**RF-033 — Tabela de candidatos**

WHEN a página renderiza, the system SHALL exibir tabela com `{avatar, partido, votos, %, barra}` para cada candidato.

**RF-034 — Mapa do estado em granularidade de município (choropleth)**

WHEN a página renderiza, the system SHALL exibir mapa do estado em granularidade de município colorido por líder/margem.

**RF-035 — Mapa "Votos reportados" com bubbles proporcionais**

WHEN a página renderiza, the system SHALL exibir mapa com bubbles proporcionais aos votos reportados por município.

**RF-036 — Mapa "Estimativa do que falta" choropleth**

WHEN a página renderiza, the system SHALL exibir mapa choropleth da estimativa do resultado nos municípios ainda não apurados.

**RF-037 — Tabela de municípios paginada/virtualizada**

WHEN a página renderiza, the system SHALL exibir tabela de municípios (até 645 em SP) com virtualização para performance.

**RF-038 — Mapa de swing vs 2022 com setas/indicadores (Should)**

WHEN a página renderiza, the system SHOULD exibir mapa com setas/indicadores de direção e magnitude do swing por município.

**RF-039 — Agulha estadual + estimated margin**

WHEN a página renderiza, the system SHALL exibir agulha estadual com `p_vitoria` e margem estimada com CI.

**RF-040 — Gráfico "Margem ao longo do tempo" (Should)**

WHEN a página renderiza, the system SHOULD exibir line chart da margem do líder ao longo do tempo desde 17h.

**RF-041 — Gráfico "Probabilidade de vitória ao longo do tempo" (Should)**

WHEN a página renderiza, the system SHOULD exibir line chart de `p_vitoria` do líder ao longo do tempo.

**RF-042 — Gráfico "Turnout cumulativo" (Should)**

WHEN a página renderiza, the system SHOULD exibir area chart de turnout cumulativo da UF ao longo do tempo.

**RF-043 — Bloco "O que está movendo o forecast agora"**

WHEN a página renderiza, the system SHALL exibir bloco `<ForecastTransparency />` mostrando a composição (modelo vs apuração).

**RF-044 — Análise textual gerada por templates estáticos**

WHEN a página renderiza, the system SHALL exibir 1–3 frases analíticas geradas pelo engine de templates ([insights-templates](../../design-system/insights-templates.md)).

## Requisitos Não-Funcionais aplicáveis

- URL canônica `/uf/[sigla]` — [RNF-027](../../nfr/seo.md).
- Performance, a11y completos — ver frontmatter.

## Open questions

- Critério de "Chamada por AP/Reuters" — temos parceria editorial ou é placeholder? (atual: placeholder, decidir antes de F5).
- Virtualização da tabela de municípios — Tanstack Virtual ou solução custom? (atual: pesquisar).

## v2 — S05 Multi-candidato e 2º turno

Extensão da v1 (2 candidatos em foco) para visualização completa de todos os candidatos em 1T e métricas de 2º turno.

**Mudanças principais** (conforme [ADR-0017](../../architecture/adrs/0017-transparencia-total-3-camadas.md)):

- **Tabela candidatos**: agora exibe todos, com rank visual; top-2 em destaque, 3–6 em bloco expandível, 7+ em lista compacta.
- **Métricas de 2º turno**: novos campos `p_passa_2t` e `p_fecha_1t` por candidato ([ADR-0015](../../architecture/adrs/0015-k1-fallback-3-tier.md)).
- **Tokens de rank**: cores/ícones por posição (ADR-0013), não por partido.
- **Needle**: variante que exibe margem ou P(2º turno) conforme turno ativo.
- **Breadcrumb**: "Voltar ao nacional (1T)" ou "...ao nacional (2T)" — dinâmico por turno.

**Componentes novos**:
- `<RaceTypeIndicator />` — "Disputa entre N candidatos" no header.
- `<MinorCandidatesList />` — rank 7+ em linha única.
- `<TurnoBadge />` — turno ativo.

**Componentes refatorados**:
- `<CandidateRow />` estendido com suporte a `p_passa_2t`, `p_fecha_1t` e modo compacto.
- `<Needle />` com `metricMode: 'margin' | 'round2_probability'`.
- `<UFBreadcrumb />` dinâmico por turno.

**Status**: v1 (`status: shipped`) continua válida pra 1T binário. v2 estende e é backward-compatible.

## Cross-refs

- Design: [./design.md](./design.md)
- Spec UF Governador (estrutura idêntica): [../005-pagina-uf-governador/](../005-pagina-uf-governador/)
- Brushing: [../008-interatividade-brushing/](../008-interatividade-brushing/)
