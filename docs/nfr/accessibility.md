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

### Lacunas abertas do RNF-035 — 2026-09-18

Duas ficam **abaixo do piso e sem variante `-text`**, e não são identidade de
partido. Estão isentas no teste com a razão escrita, e ficam aqui para não
sumirem:

| Token | Claro | Estado |
|---|---|---|
| `--party-none` | 1,16:1 | **Zero consumidores.** `grep -rn party-none lib components app` fora do arquivo de tokens = 0. Definido e nunca usado — nada a consertar até ter uso. |
| `--party-tie` | 1,73:1 | Degrau de rampa na legenda do mapa (`MapLegend.tsx:127`, faixa de 10px). É preenchimento com extensão ⇒ remédio é contorno. 🔴 **E a rampa inteira não tem contorno nenhum** — os degraus se separam por `gap: 2` sobre a página, e o degrau mais claro encosta no papel sem fronteira. É achado do componente de mapa, com verificação visual própria. |

⚠️ **Fora de escopo da passagem de 18/09**, e dito para não passar por feito:
o mapa coroplético em si (`_NationalChoroplethMapImpl`) pinta REGIÕES com a
cor-base. Região é preenchimento com extensão, e a decisão lá é diferente da
do quadradinho — envolve contraste entre regiões vizinhas, não só contra o
papel. A passagem de 18/09 cobriu os **marcadores de identidade** (quadradinho
do balão, pontos da folha de UF) e a **extensão da barra**.

### Validação executável

`tests/unit/design-system/contraste-nao-texto.test.ts` (7 casos) mede este RNF
a cada corrida: toda variante `-text` nas 4 superfícies × 2 temas, o contorno
de `DATA_FILL_STROKE`, e o separador da barra. Um caso mede **o instrumento**,
não o produto — confere a fórmula contra um número que o próprio
`tokens-party.css` documenta em comentário (4,91:1), porque na primeira
tentativa de medir isto o bloco lido foi o **escuro** achando que era o claro,
e o resultado foi "71 cores reprovando" com toda `-text` idêntica à base.

## Validação

- `axe-core` rodando em CI em cada PR.
- Lighthouse a11y score >95 em CI.
- Bug bash manual em Set/2026 com leitor de tela (VoiceOver + NVDA).

## Cross-refs

- Acessibilidade dos mapas: [../mapas/acessibilidade.md](../mapas/acessibilidade.md)
- Reduced-motion nas animações: [../design-system/animations.md](../design-system/animations.md)
- Constituição § 4 (a11y): [../constitution.md](../constitution.md#4-acessibilidade-wcag-21-aa)
- Teste a11y: [../testing/accessibility.md](../testing/accessibility.md)
