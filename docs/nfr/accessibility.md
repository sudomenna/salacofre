---
title: NFR — Acessibilidade (WCAG 2.1 AA)
description: Contraste, fallback de tabela para gráficos, navegação por teclado, mapas com aria-label
status: stable
source: PRD.md § 6.5
---

# Acessibilidade (WCAG 2.1 AA)

| ID | Descrição | Meta |
|---|---|---|
| RNF-022 | Contraste mínimo de **texto** (SC 1.4.3) | 4.5:1 |
| RNF-035 | Contraste mínimo de **elemento não-texto** que carrega informação (SC 1.4.11) | 3:1 |
| RNF-023 | Todos os gráficos com fallback de tabela para screen readers | Sim |
| RNF-024 | Navegação completa por teclado | Sim |
| RNF-025 | Mapas com `aria-label` descrevendo o que mostram + lista textual paralela | Sim |
| RNF-026 | Animações respeitam `prefers-reduced-motion` | Sim |

## RNF-035 — contraste de não-texto (SC 1.4.11)

> **Criado em 2026-09-18**, e o motivo de ter demorado é o que ele corrige: até
> aqui só existia o RNF-022, que é **texto**. O piso de 3:1 para elemento
> gráfico não tinha requisito nenhum — e mesmo assim já era o critério de duas
> decisões tomadas ([ADR-0047](../architecture/adrs/0047-serie-cor-legivel-e-ciclo-sem-hora-fora-do-eixo.md) D1
> e o `DATA_FILL_STROKE` de `components/blocks/_candidateColor.ts`). A spec 020
> chegou a citar o RNF-022 para uma garantia que ele não dá.
>
> Decidir por um critério que não está escrito funciona enquanto quem decide
> lembra dele. Este documento é para quando não lembrar.

**O que cobre.** Qualquer superfície ou traço cuja **cor carrega informação**:
linha de gráfico, preenchimento de barra, marcador de identidade (o quadradinho
de 8×8 ao lado do nome), região de mapa, limite de faixa. Não cobre decoração
pura nem elemento que apenas repete algo já dito em texto ao lado.

**Contra o quê se mede.** A superfície em que o elemento de fato repousa, nos
**dois temas**. As quatro do produto, medidas em 18/09:

| Superfície | Claro | Escuro |
|---|---|---|
| `--surface-page` | `#f3f4f6` | `#14171b` |
| `--surface-card` | `#fbfbfc` | `#1c1f24` |
| `--surface-sunken` | `#e9ebee` | `#262a31` |

**Os dois remédios, e quando usar cada um.** Não é gosto — depende do que a cor
está dizendo:

| Caso | Remédio | Por quê |
|---|---|---|
| **Marcador de identidade** — quadradinho, ponto, linha de gráfico. A cor diz *quem*. | `textForParty` (a variante `-text`) | O elemento não tem extensão a perder; o que precisa é ser **distinguível**. Medido em 18/09: a variante `-text` passa 3:1 nas **4 superfícies, nos 2 temas, para os 31 partidos** — zero exceções. Em 17 dos 31 ela **é** a cor base, então nada muda. |
| **Preenchimento com extensão** — barra, segmento, região. A cor diz *quanto* ou *onde*. | `DATA_FILL_STROKE` (contorno em `--text-secondary`) | Trocar a cor não resolveria o problema real, que é **onde o dado acaba**: sem borda, o leitor perde a extensão. O contorno mede ≥5,0:1 nas três superfícies claras e conserta os 31 tokens de uma vez. |

**O estado medido em 18/09.** Das 33 cores-base, **4 reprovam**, e só no tema
claro:

| Partido | base | sobre page | sobre card | `-text` | sobre page |
|---|---|---|---|---|---|
| PSOL | `#d6a400` | **2,08** | 2,21 | `#8d6b00` | 4,51 ✅ |
| PSB | `#b6a92a` | **2,19** | 2,33 | `#7a7200` | 4,51 ✅ |
| outros | `#9aa0a8` | **2,39** | 2,55 | `#6b7078` | 4,53 ✅ |
| NOVO | `#e07b1d` | **2,72** | 2,89 | `#ae5900` | 4,51 ✅ |

No tema escuro as mesmas quatro medem entre 9,3 e 12,8 — **o problema é só do
claro**, e é por isso que medir um tema só engana.

### Lacunas do RNF-035 — 2026-09-18, 1ª passagem

Uma fica **abaixo do piso e sem variante `-text`**, e não é identidade de
partido. Está isenta no teste com a razão escrita, e fica aqui para não
sumir:

| Token | Claro | Estado |
|---|---|---|
| `--party-none` | 1,16:1 | **Zero consumidores.** `grep -rn party-none lib components app` fora do arquivo de tokens = 0. Definido e nunca usado — nada a consertar até ter uso. |

`--party-tie` (1,73:1) e o mapa coroplético em si foram fechados na **2ª
passagem do mesmo dia**, abaixo.

### 2026-09-18, 2ª passagem — as regiões do mapa e a rampa da legenda

A 1ª passagem cobriu os **marcadores de identidade** (quadradinho do balão,
pontos da folha de UF) e a **extensão da barra** (`DATA_FILL_STROKE`). Ficou
de fora, e dito explicitamente para não passar por feito: o mapa coroplético
em si (`_NationalChoroplethMapImpl.tsx`) pinta REGIÕES (UFs) com a cor de
partido, e a legenda (`MapLegend.tsx`) desenha os mesmos degraus sem contorno
nenhum.

**Por que a decisão aqui não é a mesma do quadradinho.** Região é
preenchimento com extensão — mesma família de problema da barra — mas a barra
mede contra uma calha de superfície FIXA (quase-branca/quase-preta); a UF
mede contra OUTRA UF, de cor imprevisível. Medido: `--text-secondary`
(o remédio da barra) reprova 3:1 contra **31 das 33** cores-base de partido —
inadequado aqui. Um contorno de **uma cor só** também não fecha: `--map-stroke`
(quase-papel, o traço que já existia) reprova contra os níveis PÁLIDOS da
escala de margem (`--party-<sigla>-1` e `-2`, usados pela view "margin" em
disputas apertadas) — **62 dos 155 tokens de nível no tema claro, 93 dos 155
no escuro** — porque esses níveis ficam, por desenho da escala, perto da
própria luminância do papel. Um contorno escuro sozinho resolveria os pálidos
e quebraria os saturados (8 a 21 dos 33 tokens-base, a depender da cor de
teste). **Nenhuma cor única cobre as duas pontas da escala de intensidade.**
Trocar as regiões para a variante `-text` também não serve: ela não existe
para os níveis 1–5 (só para a base), e forçá-la quebraria a própria razão de
existir da escala (constituição § 2: "só a intensidade varia com a margem").

**A decisão: HALO, duas linhas.** Técnica cartográfica padrão para traço sobre
fundo variável — uma linha clara por baixo (`--map-stroke`, mais larga) e uma
escura por cima (`--map-stroke-focus`, mais fina; o mesmo token que já
existia só para o traço de hover). Medido contra as **186 combinações reais**
de preenchimento que o mapa pode pintar (33 cores-base + 155 níveis de
margem, dois temas) mais `--map-uncounted`, `--color-tossup` e os tokens de
fallback por rank (`--color-cand-*`/`--color-cand-band-*`): **zero ficam
abaixo de 3:1 contra as DUAS linhas ao mesmo tempo** — sempre uma das duas
alcança o piso, qualquer que seja a cor do lado. `--party-tie` também está
coberto (1,84:1 contra `--map-stroke` no claro, mas 9,44:1 contra
`--map-stroke-focus`), embora ele não seja hoje uma cor que o mapa de fato
pinta (`resolvePartyHex` nunca resolve para "tie"; o token só aparecia na
legenda).

Implementado:
- `components/blocks/_NationalChoroplethMapImpl.tsx` — a camada `ufs-stroke`
  (traço único, 0.8px) virou duas: `ufs-stroke-halo` (clara, 1.4px, por baixo)
  + `ufs-stroke` (escura, 0.6px, por cima), as duas permanentes (sem filtro de
  hover — o traço de hover, `ufs-stroke-hover`, continua existindo por cima
  das duas, só na UF sob o cursor).
- `components/atoms/maps/MapLegend.tsx` — `LEGEND_STEP_HALO`, um
  `box-shadow` de dois anéis (`inset` escuro + externo claro, os mesmos dois
  tokens) aplicado a cada degrau de `<MapLegend>` (`left`/`tie`/`right`) e de
  `<CandidateLegendGroup>` (`map-legend-group-step` — a legenda que de fato
  está em produção hoje). `box-shadow` em vez de `border` porque não consome
  espaço de layout dos degraus `flex-1`.

Não fechado nesta passagem, achado mas fora do escopo pedido:
`components/atoms/maps/ChoroplethMapUF.tsx` (o mapa de município dentro de
uma UF) tem o MESMO padrão — traço único hardcoded (`#ffffff`/`#222222`
literais, nem token) em vez de halo. Mesma classe de problema, arquivo
diferente.

### Validação executável

`tests/unit/design-system/contraste-nao-texto.test.ts` (10 casos) mede este
RNF a cada corrida: toda variante `-text` nas 4 superfícies × 2 temas, o
contorno de `DATA_FILL_STROKE`, o separador da barra, e — desde a 2ª passagem
de 18/09 — o halo das regiões do mapa (as 186 combinações reais contra as
duas linhas, nos 2 temas) e a presença do halo nos degraus das duas legendas.
Um caso mede **o instrumento**, não o produto — confere a fórmula contra um
número que o próprio `tokens-party.css` documenta em comentário (4,91:1),
porque na primeira tentativa de medir isto o bloco lido foi o **escuro**
achando que era o claro, e o resultado foi "71 cores reprovando" com toda
`-text` idêntica à base.

## Validação

- `axe-core` rodando em CI em cada PR.
- Lighthouse a11y score >95 em CI.
- Bug bash manual em Set/2026 com leitor de tela (VoiceOver + NVDA).

## Cross-refs

- Acessibilidade dos mapas: [../mapas/acessibilidade.md](../mapas/acessibilidade.md)
- Reduced-motion nas animações: [../design-system/animations.md](../design-system/animations.md)
- Constituição § 4 (a11y): [../constitution.md](../constitution.md#4-acessibilidade-wcag-21-aa)
- Teste a11y: [../testing/accessibility.md](../testing/accessibility.md)
