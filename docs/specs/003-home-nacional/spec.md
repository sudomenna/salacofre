---
id: 003-home-nacional
title: Home Nacional Presidencial (T-01)
status: shipped
priority: M
personas: [P1, P2, P3, P4]
screens: [T-01]
requirements: [RF-021, RF-022, RF-023, RF-025, RF-026, RF-027, RF-028, RF-029, RF-030, RF-030.1, RF-030.2, RF-030.3, RF-030.4, RF-030.5, RF-030.6, RF-030.7, RF-030.8, RF-061, RF-062, RF-063]
depends_on: [001-ingestao-tse, 002-modelo-estatistico, 008-interatividade-brushing]
apis: [GET /api/projection]
components: [HeadlineScore, NationalChoroplethMap, MapViewToggle, StateGroupedTable, NationalNeedle, ChancesPanel, InsightCard, ForecastTransparency, LiveBadge, Tabs, MinorCandidatesList, RaceTypeIndicator, TurnoBadge, ProjectionThermometer, ProjectionThermometers, TrilhaKicker, RaceHeader, ApuracaoMeta, BreakingNewsTicker, NationalWinnerBanner, TurnoOneRecap, ResultPanel, CandidateListCollapse]
nfr: [RNF-001, RNF-002, RNF-003, RNF-007, RNF-008, RNF-022, RNF-023, RNF-024, RNF-025, RNF-026, RNF-028]
adrs: [0001, 0002, 0003, 0004, 0005, 0010, 0012, 0013, 0014, 0017, 0018, 0019, 0025, 0033, 0034]
shipped_with_carry_overs:
  - RF-025-UFForecastTable-completa-deferida-S05
  - RF-030.4-hachura-flip-MapLibre-sprite-deferida-S05
  - chunk-MapLibre-287KB-acima-RNF-007b-pendente-ADR-aumentar-meta-300KB
  - e2e-Playwright-cobertura-completa-deferida-S05
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

WHEN a home renderiza **em modo `binary`**, the system SHALL exibir um placar grande com `pct_projetado` dos 2 candidatos líderes e uma marca visual em 50%+1 (gatilho de 2º turno).

> **Escopo restrito desde S07** ([ADR-0018](../../architecture/adrs/0018-termometros-hero-1t.md)): em modo `multi-1t` o `<HeadlineScore />` sai do hero e é substituído por RF-061. RF-030.5 continua **integralmente vigente** no modo `binary` (2º turno), que não foi tocado.

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

### Multi-candidato no 1º turno (S05/F4c)

> Estes três requisitos foram **implementados em S05** e só agora receberam texto EARS formal. O conteúdo é o registrado em [`docs/sprints/2026-S05-f4c-multi-candidato.md`](../../sprints/2026-S05-f4c-multi-candidato.md) — "RF-030.7..030.9 (P(2T), cenários 2T, ranking multi-camada)".

**RF-030.7 — Indicador de probabilidade de 2º turno**

WHILE a home está em modo `multi-1t` (1º turno com mais de 2 candidatos), the system SHALL exibir `<TwoRoundIndicator />` com `p_segundo_turno_overall` do payload e a banda de confiança correspondente, conforme [ADR-0014](../../architecture/adrs/0014-p-segundo-turno-primeira-classe.md).

**Aceitação**:
- Given `national.p_segundo_turno_overall = 0.62`, when a home renderiza em `multi-1t`, then o indicador exibe 62% e a banda derivada.
- Given `payload.turno === 2`, when a home renderiza, then o indicador **não** é renderizado (a métrica já se resolveu).

**RF-030.8 — Transparência total: todos os candidatos visíveis, sem collapsible**

WHILE a home está em modo `multi-1t`, the system SHALL manter **todos** os candidatos com `pct_projetado ≥ 0,1%` acessíveis sem clique, no DOM, distribuídos em camadas de destaque decrescente e **sem nenhum controle de expandir/recolher**, conforme [ADR-0017](../../architecture/adrs/0017-transparencia-total-3-camadas.md).

Após [ADR-0018](../../architecture/adrs/0018-termometros-hero-1t.md), as camadas em `multi-1t` são: **Camada 1** = os seis termômetros (RF-061), que já absorvem os ranks 1–3 e o agregado de rank ≥ 4; **Camada 2/3** = `<MinorCandidatesList />` sob o heading "Composição de Outros", detalhando quem compõe o agregado. `<RaceTypeIndicator />` declara o número de candidatos na corrida. O modo `binary` segue com `<HeadlineScore />` como Camada 1, inalterado.

**Aceitação**:
- Given um payload de 1º turno com 11 candidatos, when a home renderiza, then todos os 11 aparecem no HTML servido, sem `<details>`, sem botão "ver mais" e sem `hidden`.
- Given a mesma renderização, when os candidatos de rank ≥ 4 são inspecionados, then aparecem sob o heading "Composição de Outros".

**RF-030.9 — Cenários de 2º turno (Should)**

IF `p_segundo_turno_overall ≥ 0,4` e a home está em modo `multi-1t`, the system SHOULD exibir `<RunoffScenarios />` com os até 3 duelos mais prováveis lidos de `national.cenarios_2t`, cada um com sua probabilidade.

**Aceitação**:
- Given `p_segundo_turno_overall = 0.72` e `cenarios_2t` com 3 pares, when a home renderiza, then os 3 duelos aparecem ordenados por probabilidade decrescente.
- Given `p_segundo_turno_overall = 0.25`, when a home renderiza, then o bloco é omitido (gate de relevância — abaixo de 0,4 o cenário de 2T é ruído).

### Hero de seis termômetros e identidade de trilha (S07)

**RF-061 — Hero de seis termômetros de projeção no 1º turno**

WHILE a home está em modo `multi-1t`, the system SHALL exibir como hero o bloco `<ProjectionThermometers />` com **seis** termômetros de projeção — 1º, 2º e 3º colocados, "Outros candidatos" (agregado de rank ≥ 4), brancos/nulos e abstenção — cada um com valor projetado, faixa de incerteza `[lower, upper]`, marcador do valor apurado e **rótulo explícito da sua base de cálculo**, conforme [ADR-0018](../../architecture/adrs/0018-termometros-hero-1t.md).

WHERE a home está em modo `multi-1t`, the system SHALL **substituir** `<HeadlineScore />`, `<CandidateRanking />` e `<NationalNeedle variant="national-1t" />` por este bloco, e SHALL manter `<TwoRoundIndicator />` (RF-030.7) e `<RunoffScenarios />` (RF-030.9) inalterados.

IF a home está em modo `binary` (2º turno, ou 1º turno com exatamente 2 candidatos), the system SHALL **não** renderizar este bloco e SHALL preservar integralmente o layout anterior (RF-030.5 com `<HeadlineScore />` como hero) — decisão D1 de 2026-09-05.

**Denominador misto e rotulado** (decisão D3): candidatos e "Outros" em % de `v.vvc` — votos a votáveis concorrentes, o mesmo denominador do campo oficial `pvap` do TSE; brancos/nulos em % de `e.c` (comparecimento); abstenção em % de `e.esi` (eleitorado das seções instaladas). Os seis números **não somam 100** e o bloco fecha com uma legenda única dizendo isso. Normalizar tudo num denominador só está vedado: produziria percentual de candidato divergente do publicado pelo TSE e alteraria o conteúdo dos dados distribuídos (art. 267 §4º da Res. TSE 23.751/2026 — [ADR-0020](../../architecture/adrs/0020-conformidade-res-23751-2026.md)).

**Aceitação**:
- Given um payload de 1º turno com 11 candidatos e bloco `participacao` completo, when a home renderiza, then existem exatamente 6 elementos com `role="meter"`, na ordem 1º, 2º, 3º, Outros, brancos/nulos, abstenção.
- Given o mesmo payload, when o `aria-label` de cada meter é lido, then ele cita o valor projetado, a base do denominador, o IC95 e o valor apurado.
- Given `pct_atual = null` para uma métrica, when o termômetro renderiza, then o marcador de apurado é omitido e o rodapé escreve "sem apuração" — nunca um marcador em zero.
- Given `payload.turno === 2`, when a home renderiza, then não há nenhum `role="meter"` de termômetro e `<HeadlineScore />` continua sendo o hero.

**RF-062 — Projeção de participação e do agregado "Outros" na interface**

WHEN o payload traz `national.participacao`, the system SHALL exibir os termômetros de brancos/nulos, abstenção e "Outros" com os valores de RF-020.1 ([spec 002](../002-modelo-estatistico/spec.md)), rotulando a origem do número como **projeção a partir do apurado** — nunca como valor oficial e nunca como "baseado em 2022".

IF o payload **não** traz uma dessas métricas, the system SHALL manter o termômetro correspondente no DOM em estado "aguardando projeção" (ADR-0017 proíbe esconder camadas), e SHALL **não** exibir número, faixa nem marcador para ela.

IF o payload não traz `participacao.outros`, the system SHALL degradar para o fallback `100 − Σtop3` **sem faixa de incerteza** e com o rótulo explícito "IC indisponível" — nunca apresentar a subtração como se fosse um IC calculado.

> **Exceção de rota**: em `/governador` ([spec 006](../006-grid-governadores/spec.md)) o bloco inteiro é **omitido** quando `national.participacao` está ausente, em vez de renderizar em "aguardando". A razão é que ali não existe uma corrida nacional de governador — existem 27 corridas — e a participação é o único agregado nacional legítimo daquela tela; um bloco vazio anunciaria uma projeção nacional que não existe. Nas outras três rotas vale a regra geral de ADR-0017.

**Aceitação**:
- Given um payload com `participacao.abstencao` e `participacao.brancos_nulos`, when a home renderiza, then cada termômetro exibe o rótulo da sua base e o IC95 formatado.
- Given um payload **sem** o bloco `participacao`, when a home renderiza em `multi-1t`, then os 6 meters continuam no DOM e 3 deles (Outros, brancos/nulos, abstenção) estão em "aguardando projeção".
- Given `participacao.outros` ausente com top-3 somando 89,7%, when o termômetro de Outros renderiza, then exibe 10,3% sem faixa e com a nota "IC indisponível".

**RF-063 — Identidade visual por trilha**

WHEN qualquer uma das quatro páginas de corrida renderiza, the system SHALL declarar `data-trilha="pres" | "gov"` no `<main>` e SHALL exibir, acima do `<h1>`, um `<TrilhaKicker />` com o rótulo da trilha e a profundidade da navegação (ex.: "PRESIDÊNCIA · Brasil › SP", "GOVERNADOR · SP"), colorido por `--trilha-accent`, conforme [ADR-0019](../../architecture/adrs/0019-identidade-visual-por-trilha.md).

WHILE a página está renderizada, the system SHALL usar `--trilha-accent` **apenas** em chrome de navegação (`<TrilhaKicker />`, `<LiveBadge />`, aba ativa de `<Tabs />`, breadcrumb) e SHALL **nunca** usá-lo para colorir dado de apuração, projeção ou candidato — as cores de candidato continuam vindo exclusivamente de `--color-cand-*` ([ADR-0013](../../architecture/adrs/0013-tokens-multi-candidato-por-rank.md), intocado).

WHERE a trilha é `gov`, the system SHALL exibir o breadcrumb **sem** nó nacional presidencial (`Governadores › SP`), porque a trilha de governador não tem agregação nacional equivalente — apenas o cargo Presidente possui arquivo de abrangência Brasil no EA20.

**Aceitação**:
- Given a home, when o HTML é servido, then `<main data-trilha="pres">` e o kicker lê "PRESIDÊNCIA · Brasil".
- Given `/uf/SP`, when o HTML é servido, then o kicker lê "PRESIDÊNCIA · Brasil › SP" e o breadcrumb é `Brasil › SP`, com "SP" marcado `aria-current="page"`.
- Given `/uf/SP/governador`, when o HTML é servido, then `<main data-trilha="gov">`, o kicker lê "GOVERNADOR · SP" e o breadcrumb é `Governadores › SP` — sem nó "Brasil".
- Given qualquer uma das quatro páginas, when os tokens de cor são inspecionados, then nenhum elemento que representa dado eleitoral usa `--trilha-accent`.
- **Gate obrigatório** (ADR-0019): o accent escolhido precisa ser perceptualmente distinguível de `--color-cand-2` e `--color-cand-4`, verificado por `a11y-perf-auditor` antes de qualquer promoção a `shipped`.

## Requisitos Não-Funcionais aplicáveis

- LCP <2.5s, INP <200ms, bundle <150KB, mapa <1.5s — [performance](../../nfr/performance.md).
- Contraste 4.5:1, fallback de tabela para gráficos, navegação por teclado, mapa com `aria-label`, reduced-motion — [accessibility](../../nfr/accessibility.md).
- OG tags dinâmicas — [seo](../../nfr/seo.md) + [spec 009](../009-compartilhamento-meta/).

## Open questions

- Cores partidárias: a paleta atual em [`tokens.md`](../../design-system/tokens.md) mapeia PT → vermelho, PL → azul. Confirmar com QA de design antes de F4.
- Carrossel mobile de UFs decisivas — swipe horizontal ou vertical scroll com snap? (atual: swipe horizontal).

## v2 — S05 Multi-candidato (1º turno)

Extensão da v1 binária (2 candidatos líderes) para suporte total a 2º turno e visualização de todos os candidatos em 1º turno.

**Mudanças principais** (conforme [ADR-0017](../../architecture/adrs/0017-transparencia-total-3-camadas.md)):

- **Hero headline**: top-2 líderes + indicador de 2º turno obrigatório (ADR-0014).
- **Camada 2 (ranking)**: candidatos rank 3–6 em bloco colapsível com tokens de rank (ADR-0013).
- **Camada 3 (minor)**: candidatos rank 7+ em lista compacta, visível por padrão; não collapsível.
- **Métrica P(2º turno)**: componente novo `<TwoRoundIndicator />` exibe probabilidade calculada pelo modelo (ADR-0014, RF-030 extendido).
- **Badges turno**: `<TurnoBadge />` identifica "1º turno" ou "2º turno" em contextos de seleção (RF-030).

**Componentes novos**:
- `<TurnoBadge />` — chip visual "1º/2º turno" (atom).
- `<RaceTypeIndicator />` — cabeçalho "Disputa entre N candidatos" (atom).
- `<MinorCandidatesList />` — camada 3 rank 7+ em linha compacta (atom).
- `<TwoRoundIndicator />` — card com P(2º turno) e bandas de confiança (block).
- `<CandidateRanking />` — camada 2 rank 3–6 renderizado dinamicamente (block).

**Componentes refatorados**:
- `<HeadlineScore />` agora aceita `mode: 'binary' | 'multi-candidate'` (padrão: `'binary'` para backward-compat).
- `<NationalNeedle />` com variant `showTwoRoundIndicator` (integra a métrica de segundo turno).
- `<NationalChoroplethMap />` com `rankByLider` filter (opcional, mostra só vitória do líder vs 2º lugar).

**Status**: v1 (`status: shipped`) continua válida pra 1T binário. v2 estende e retrocompat é garantida.

## v3 — S07 Hero de seis termômetros + identidade de trilha

Terceira evolução, conforme [ADR-0018](../../architecture/adrs/0018-termometros-hero-1t.md) e [ADR-0019](../../architecture/adrs/0019-identidade-visual-por-trilha.md), decisões D1–D8 de 2026-09-05.

**Mudanças principais**:

- **Camada 1 em `multi-1t` trocada** — `<ProjectionThermometers />` (RF-061) substitui `<HeadlineScore />` + `<CandidateRanking />` + `<NationalNeedle variant="national-1t" />`. `<TwoRoundIndicator />` e `<RunoffScenarios />` permanecem. O modo `binary` (2º turno) é **byte-a-byte o anterior**.
- **Participação entra na tela** — brancos/nulos, abstenção e "Outros" com IC próprio (RF-062), alimentados por RF-020.1 da [spec 002](../002-modelo-estatistico/spec.md).
- **Denominador misto e rotulado** — três bases distintas, nunca normalizadas entre si.
- **`<MinorCandidatesList />` muda de papel** — deixa de ser "camada 3 solta" e passa a ser a "Composição de Outros" do termômetro-agregado, sempre no DOM.
- **Chrome por trilha** (RF-063) — `data-trilha` no `<main>`, `<TrilhaKicker />`, `<RaceHeader />` compartilhado pelas quatro rotas, breadcrumb com profundidade real.

**Componentes novos**:
- `<ProjectionThermometer />` — barra horizontal com faixa de IC e marcador do apurado (atom, `components/atoms/bars/ProjectionThermometer.tsx`).
- `<ProjectionThermometers />` — o bloco de seis, com `variant: "full" | "participacao-only"` (block, `components/blocks/ProjectionThermometers.tsx`).
- `<TrilhaKicker />` — rótulo de trilha acima do `h1` (atom, `components/atoms/nav/TrilhaKicker.tsx`).
- `<RaceHeader />` — cabeçalho compartilhado pelas quatro rotas (layout, `components/layout/RaceHeader.tsx`).

**Componentes refatorados**:
- `<UFBreadcrumb />` ganha `trilha?` e `items?` (profundidade real da trilha); o modo legado `label`/`href` continua funcionando.

Todos são **Server Components puros** — sem `"use client"`, sem `framer-motion` — porque o hero é above-the-fold e não pode custar bundle (RNF-007a).

## Cross-refs

- Design técnico: [./design.md](./design.md)
- Wireframes detalhados: [../../design-system/components.md](../../design-system/components.md)
- Brushing & linking: [../008-interatividade-brushing/](../008-interatividade-brushing/)
- Templates de insights: [../../design-system/insights-templates.md](../../design-system/insights-templates.md)
- ADRs aplicáveis: [0001](../../architecture/adrs/0001-edge-config-no-read-path.md), [0002](../../architecture/adrs/0002-polling-cdn-cache.md), [0003](../../architecture/adrs/0003-pmtiles-nao-geojson.md), [0004](../../architecture/adrs/0004-maplibre-nao-mapbox.md), [0005](../../architecture/adrs/0005-templates-nao-llm.md), [0017](../../architecture/adrs/0017-transparencia-total-3-camadas.md), [0018](../../architecture/adrs/0018-termometros-hero-1t.md), [0019](../../architecture/adrs/0019-identidade-visual-por-trilha.md)
- Origem dos dados de RF-062: [spec 002 — RF-020.1](../002-modelo-estatistico/spec.md)
- Rotas que herdam RF-061/062/063: [spec 004](../004-pagina-uf-presidencial/spec.md), [spec 005](../005-pagina-uf-governador/spec.md), [spec 006](../006-grid-governadores/spec.md)
