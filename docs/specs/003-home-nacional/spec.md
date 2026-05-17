---
id: 003-home-nacional
title: Home Nacional Presidencial (T-01)
status: draft
priority: M
personas: [P1, P2, P3, P4]
screens: [T-01]
requirements: [RF-021, RF-022, RF-023, RF-024, RF-025, RF-026, RF-027, RF-028, RF-029, RF-030, RF-030.1, RF-030.2, RF-030.3, RF-030.4, RF-030.5, RF-030.6]
depends_on: [001-ingestao-tse, 002-modelo-estatistico, 008-interatividade-brushing]
apis: [GET /api/projection]
components: [HeadlineScore, NationalChoroplethMap, MapViewToggle, StateGroupedTable, NationalNeedle, DecisiveUFsGrid, InsightCard, ForecastTransparency, LiveBadge, Tabs]
nfr: [RNF-001, RNF-002, RNF-003, RNF-007, RNF-008, RNF-022, RNF-023, RNF-024, RNF-025, RNF-026, RNF-028]
adrs: [0001, 0002, 0003, 0004, 0005, 0010]
---

# Spec 003 — Home Nacional Presidencial

**Rota**: `/`

## Objetivo

Em 5 segundos, comunicar quem está vencendo a presidência. Em 30 segundos, dar profundidade suficiente para o curioso engajado.

## Escopo

**In**:
- Headline com score dos 2 candidatos líderes (estilo NYT).
- Mapa coroplético do Brasil em destaque (hero) com toggles de visualização.
- Agulha de probabilidade.
- Grid de UFs decisivas (top 6 por contribuição ao swing).
- Tabela de UFs agrupada por margem.
- Card de insight gerado por template.
- Bloco "O que está movendo o forecast".
- Toggle Presidente/Governador (Governador leva para [spec 006](../006-grid-governadores/)).
- Toggle 1º/2º turno.
- Atualização live sem reload (polling SWR).

**Out**:
- Drill-down em UF (escopo [spec 004](../004-pagina-uf-presidencial/)).
- Lógica de brushing entre componentes (escopo [spec 008](../008-interatividade-brushing/)).

## Personas e jornadas

- **P1, P4** (alvo primário): consomem o hero em segundos.
- **P2, P3**: usam UFs decisivas + tabela agrupada para drill-down.

Jornada principal: [../../product/use-cases.md](../../product/use-cases.md#fluxo-principal-quem-está-ganhando)

## Wireframe (desktop)

```
┌──────────────────────────────────────────────────────────────────┐
│ SalaCofre     ● AO VIVO   atualizado 17:23:42      [Pres][Gov] │
├──────────────────────────────────────────────────────────────────┤
│   Apuração Presidencial 2026: Lula à frente                      │
│   Projeção em tempo real com base em apuração real do TSE e     │
│   comparação com 2022. Como funciona ›                           │
│                                                                  │
│   ┌──────────────────────────┐ ┌──────────────────────────────┐ │
│   │  53,2%                   │ │                      46,8%   │ │
│   │  Lula (PT)               │ │           Bolsonaro (PL)     │ │
│   │  ████████████████░░░░░░░░│░│░░░░░░░░░░░░░░░░░██████████   │ │
│   │  79.812.408 votos        │ │ 70.140.992 votos             │ │
│   └──────────────────────────┘ └──────────────────────────────┘ │
│                ▲ 50%+1 (gatilho de 2º turno)                     │
│                                                                  │
│   [Por vencedor] [Margem] [Swing vs 2022] [% apurado]            │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │   [MAPA CHOROPLETH DO BRASIL — hero]                     │  │
│   │   tooltip on hover: UF, % líder, votos, contrib. swing   │  │
│   └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│   ┌──────────────────────┐    ┌─────────────────────────────┐   │
│   │      AGULHA          │    │ Apurado: 23,4% das urnas    │   │
│   │   ╱── prob 78% ─╲   │    │ UFs apuradas: 14/27         │   │
│   │       ▼              │    │ Última atualização: 17:23:42│   │
│   │      LULA            │    └─────────────────────────────┘   │
│   └──────────────────────┘                                       │
│                                                                  │
│   UFs decisivas (top contribuição ao swing)                      │
│   [6 cards: MG, SP, RJ, RS, BA, PR]                              │
│                                                                  │
│   Resultados por estado (agrupado por margem)                    │
│   Lula confortável | Lula apertado | Em disputa | Bolsonaro      │
│   apertado | Bolsonaro confortável                               │
│                                                                  │
│   [InsightCard textual gerado por template]                      │
│                                                                  │
│   O que está movendo o forecast                                  │
│   Modelo:  ████ 12%  |  Apuração: ████████████████████ 88%      │
└──────────────────────────────────────────────────────────────────┘
```

**Mobile (375px)**: stack vertical. Agulha no topo. Estimativas em accordion. UFs decisivas vira carrossel swipeable. Tabela vira lista virtualizada com cards.

## Estados

- **Loading inicial**: skeleton da agulha + barras dos candidatos com shimmer.
- **Pré-eleição (sábado < 17h domingo)**: cronograma "Apuração começa em Xh"; agulha estática em "Aguardando dados".
- **Dados zerados (17h–17h05)**: agulha em tossup, mensagem "Primeiras urnas chegando".
- **Apuração ativa**: estado normal.
- **Apuração concluída (>99%)**: banner "Resultado final" + lock no winner.
- **Erro de dados (>60s sem update)**: banner amarelo "Reconectando ao TSE", continua mostrando último valor.

## Requisitos Funcionais (EARS)

### Componentes hero

**RF-021 — Agulha hero com probabilidade de vitória**

WHEN a home renderiza, the system SHALL exibir uma agulha hero indicando `P(vitória)` do candidato líder.

**Aceitação**:
- Given `p_vitoria_A = 0.78`, when a agulha renderiza, then a posição reflete `(0.78 - 0.5) * 2 = 0.56` e a banda é `'likely'`.

**RF-022 — Votos absolutos projetados por candidato**

WHEN a home renderiza, the system SHALL exibir os votos absolutos projetados de cada candidato no headline.

**RF-023 — Percentual projetado com intervalo de confiança**

WHEN a home renderiza, the system SHALL exibir `pct_projetado` e intervalo `[pct_projetado_lower, pct_projetado_upper]` para cada candidato.

### Mapa coroplético hero

**RF-030.1 — Mapa coroplético do Brasil em destaque**

WHEN a home renderiza, the system SHALL exibir um mapa coroplético do Brasil em destaque (hero) com UFs coloridas pelo líder projetado.

**RF-030.2 — Toggles de visualização**

WHEN o usuário interage com `<MapViewToggle />`, the system SHALL alternar a coloração do mapa entre `Por vencedor`, `Margem`, `Swing vs 2022` e `% apurado`.

**RF-030.3 — Hover/tap em UF abre tooltip e click navega**

WHEN o usuário passa o mouse (desktop) ou toca (mobile) em uma UF, the system SHALL exibir tooltip com `{votos, %, contribuição ao swing}`.
WHEN o usuário clica em uma UF, the system SHALL navegar para `/uf/[sigla]`.

**RF-030.4 — Hachura/pattern em UFs que viraram (Should)**

WHERE uma UF tem `swing_vs_2022 > threshold` que mudou o vencedor vs 2022, the system SHOULD aplicar hachura/pattern visual indicando "flip".

### Scoreboard e tabela

**RF-030.5 — Scoreboard headline grande com gatilho 50%+1**

WHEN a home renderiza, the system SHALL exibir um placar grande com `pct_projetado` dos 2 candidatos líderes e uma marca visual em 50%+1 (gatilho de 2º turno).

**RF-030.6 — Tabela "Resultados por estado" agrupada por margem**

WHEN a home renderiza, the system SHALL exibir tabela `<StateGroupedTable />` com UFs agrupadas em 5 colunas: `Lula confortável | Lula apertado | Em disputa | Bolsonaro apertado | Bolsonaro confortável`.

### Lista de UFs

**RF-024 — UFs decisivas (top 6 por contribuição ao swing)**

WHEN a home renderiza, the system SHALL exibir grid com as 6 UFs com maior contribuição ao swing nacional.

**RF-025 — Tabela completa das 27 UFs com dot-plot inline**

WHEN a home renderiza, the system SHALL exibir tabela `<UFForecastTable />` com as 27 UFs incluindo dot-plot inline de margem.

### Atualização live

**RF-026 — Indicador de timestamp de última atualização**

WHEN a home renderiza, the system SHALL exibir timestamp ISO da última ingestão TSE.

**RF-027 — Atualização do payload sem reload**

WHILE a página está aberta, the system SHALL fazer polling SWR de `/api/projection` a cada 5s e atualizar apenas componentes afetados.

**RF-028 — Indicador "ao vivo" pulsante (Should)**

WHILE a página está aberta e a janela de apuração está ativa, the system SHOULD exibir badge "● AO VIVO" pulsante.

### Tabs

**RF-029 — Tabs Presidente/Governador**

WHEN o usuário clica no tab `[Gov]`, the system SHALL navegar para `/governador` (escopo [spec 006](../006-grid-governadores/)).

**RF-030 — Switch 1º/2º turno (Must no 2º turno)**

WHEN estamos no 2º turno (data ≥ 2026-10-25), the system SHALL exibir switch para alternar entre dados do 1º e 2º turno.

## Requisitos Não-Funcionais aplicáveis

- LCP <2.5s, INP <200ms, bundle <150KB, mapa <1.5s — [performance](../../nfr/performance.md).
- Contraste 4.5:1, fallback de tabela para gráficos, navegação por teclado, mapa com `aria-label`, reduced-motion — [accessibility](../../nfr/accessibility.md).
- OG tags dinâmicas — [seo](../../nfr/seo.md) + [spec 009](../009-compartilhamento-meta/).

## Open questions

- Cores partidárias: a paleta atual em [`tokens.md`](../../design-system/tokens.md) mapeia PT → vermelho, PL → azul. Confirmar com QA de design antes de F4.
- Carrossel mobile de UFs decisivas — swipe horizontal ou vertical scroll com snap? (atual: swipe horizontal).

## Cross-refs

- Design técnico: [./design.md](./design.md)
- Wireframes detalhados: [../../design-system/components.md](../../design-system/components.md)
- Brushing & linking: [../008-interatividade-brushing/](../008-interatividade-brushing/)
- Templates de insights: [../../design-system/insights-templates.md](../../design-system/insights-templates.md)
- ADRs aplicáveis: [0001](../../architecture/adrs/0001-edge-config-no-read-path.md), [0002](../../architecture/adrs/0002-polling-cdn-cache.md), [0003](../../architecture/adrs/0003-pmtiles-nao-geojson.md), [0004](../../architecture/adrs/0004-maplibre-nao-mapbox.md), [0005](../../architecture/adrs/0005-templates-nao-llm.md)
