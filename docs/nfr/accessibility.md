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

### A régua do gráfico de evolução — 2026-09-19

O gráfico "Evolução da apuração" ganhou **gridlines no estado com dado** em
19/09 (antes só o esqueleto pré-eleição as tinha). A primeira versão usou
`--border-hairline` (**1,45:1**), com o argumento de que a gridline é andaime
redundante — o valor está escrito no rótulo ao lado, a 5,52:1.

**O argumento não sobreviveu à auditoria do mesmo dia, e errava no ponto que
importa.** A gridline não é redundante: ela é o que permite seguir a ALTURA de
uma curva no meio da caixa até o rótulo da borda **sem fazer a proporção de
cabeça** — exatamente a função que o SC 1.4.11 protege para baixa visão. Ler
"35%" na régua diz qual valor mora naquela altura; não ajuda a comparar aquela
altura com a linha do 3º colocado.

Havia ainda um erro de escala no "é o mesmo token que já está em produção":
verdade literal, mas o estado que o usava era o esqueleto visto por poucos
minutos antes do 1º boletim. Levar o cinza fraco para a tela que fica no ar a
**noite inteira da apuração** amplia a dívida no pior momento, não a reaproveita.

**Decisão do dono (19/09): token próprio.**

| Token | Claro | Escuro | Onde |
|---|---|---|---|
| `--rule-chart` / `--border-chart` | **3,26:1** (`--paper-1`) · 3,47:1 (`--paper-0`) | **3,91:1** — aponta para `--ink-3`, que já passava | eixos e régua de `SerieApuracaoChart` |

Matiz preservada da família `--ink-*` para não introduzir um cinza de outra
temperatura. Fica a 3,26:1 contra os 5,52:1 do rótulo — passa o piso **e**
continua visivelmente mais leve que o número, para a grade não competir com o
dado.

🔴 **Este piso não tem portão automático.** O axe joga contraste de SVG no
balde `results.incomplete`, que não reprova nada — reconfirmado em 19/09 com
Lighthouse nas 6 rotas, com o gráfico renderizado com dado real: **zero** itens
de série no audit `color-contrast`. A única proteção é
`tests/unit/design-system/contraste-nao-texto.test.ts` § "a RÉGUA do gráfico",
com três casos, e as três mutações foram aplicadas e morrem: clarear o token,
apontar o gráfico de volta para `--border-hairline`, e escurecer o token até o
peso do texto. Quem mexer aqui **não receberá aviso de nenhuma outra esteira**.

---

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
existia só para o traço de hover). Medido contra as **combinações reais**
de preenchimento que o mapa pode pintar (**32 cores de partido + 1 fallback 
`--party-outros`**, níveis 1–5 de margem, dois temas) mais `--map-uncounted`: 
**zero ficam abaixo de 3:1 contra as DUAS linhas ao mesmo tempo** — sempre uma 
das duas alcança o piso, qualquer que seja a cor do lado. Nota 2026-09-20: tokens 
legados de rank (`--color-cand-*`/`--color-cand-band-*`) foram removidos da UI 
(commit `19c2ae2`); mapa só pinta cores de partido. `--party-tie` também está
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

## SC 1.3.2 (Meaningful Sequence) — a ordem visual da lista diverge da ordem do DOM

> **Decisão do dono, 2026-09-20: aceitar e registrar.** Escrito aqui no formato
> do RNF-035 acima — fato medido, decisão, porquê — porque decidir por um
> critério que não está escrito funciona só enquanto quem decidiu lembra.
>
> Esta seção **não** cria um RNF novo. Ela documenta uma **não-conformidade
> conhecida e aceita** com um critério WCAG de **nível A**, que é o mais
> básico da escala. Registrar não é o mesmo que resolver.

**O fato.** Desde `290b8de` (2026-09-20), `<ResultPanel>` emite as `<li>` da
lista de candidatos **sempre na ordem da Projeção** e reposiciona visualmente
por `order` de CSS quando a base ativa é "Parcial" (`app/globals.css`, bloco
"A ORDEM da lista de candidatos acompanha a base ativa"). `order` move pixel,
não move documento.

**O que se perde, e o que não se perde.** Nenhuma linha carrega número errado
— cada uma traz a colocação da base ativa. O que diverge é a **sequência**: na
base "Parcial", quem lê pelo DOM recebe as linhas em ordem de Projeção, com a
numeração da Parcial. Ouve "3º, 1º, 2º".

**Quem recebe o DOM e não a pintura**: leitor de tela, navegação por teclado,
`Ctrl+F` e **copiar-colar**. O último é o teste mais rápido de reproduzir, e
serve de verificação manual: na base "Parcial", selecionar a lista e colar num
editor devolve a ordem da Projeção.

**Quando ocorre.** Só depois de o leitor trocar para "Parcial". A página abre
em `VIEW_MODE_DEFAULT = "proj"`, e nesse estado ordem visual e ordem do DOM
**coincidem** — inclusive no primeiro paint, antes de qualquer hidratação.

**Por que foi construído assim.** A home e as 54 rotas de UF são
pré-renderizadas estáticas (ADR-0025 §§ 2 e 5) e `data-view` é estado de
cliente: o servidor não sabe em que base o leitor está. Restavam emitir as
duas listas ou reposicionar por CSS. Emitir as duas foi **medido**: +312 nós
(a lista de 13 linhas é 312 dos 367 nós do painel, e a home tem 831 nós) e
~42 KB de HTML acima da dobra, **em toda visita — inclusive nas noites em que
as duas ordens coincidem e a cópia não serve para nada**. Client Component
custaria bundle acima da dobra (RNF-007a) e arrastaria `<CandidateResultRow>`,
`<PartyTag>` e o payload para o cliente.

**Por que nenhuma ferramenta pega.** `axe-core` e Lighthouse **não detectam**
divergência entre ordem visual e ordem do DOM. É um balde cego conhecido, da
mesma família do contraste de texto em SVG que este projeto já documentou. A
seção `## Validação` abaixo, que se apoia nas duas, **não cobre este item** —
só teste manual com leitor de tela cobre.

**A decisão, e o que ela não é.** Aceita porque: (1) só alcança quem troca de
base; (2) nenhum dado individual fica falso, só fora de ordem; (3) o conserto
completo custa peso em toda visita, inclusive nas em que não há divergência; e
(4) faltavam 14 dias para 04/10 quando a decisão foi tomada, e a lista de
resultado é a estrutura central das quatro telas. **Não é** avaliação de que o
problema seja pequeno para quem depende de leitor de tela — é escolha de
momento, com data para ser revista.

**Revisão marcada: depois de 04/10.** Avaliar o caminho (d) da dívida 17 —
reordenar o DOM de verdade na troca de base, que é o que o balão do mapa já
faz (`buildHoverRows` reordena o array, e por isso ali ordem visual e ordem do
DOM coincidem). Não foi prometido como barato: mover nós dentro de uma árvore
React tem risco de reconciliação desfazer a mudança e de o foco de teclado
saltar. Exige investigação própria antes de virar tarefa.

**Cross-refs**: dívida 17 em
[`../reference/dividas-tecnicas.md`](../reference/dividas-tecnicas.md) ·
RF-181 e RF-177 em [`../specs/003-home-nacional/spec.md`](../specs/003-home-nacional/spec.md) ·
[ADR-0051](../architecture/adrs/0051-ordem-de-candidatos-segue-base-de-apuracao-selecionada.md)
(que legitimou a reordenação perante a constituição § 2 e **não** resolve este item).

## Validação

- `axe-core` rodando em CI em cada PR.
- Lighthouse a11y score >95 em CI.
- Bug bash manual em Set/2026 com leitor de tela (VoiceOver + NVDA).

## Cross-refs

- Acessibilidade dos mapas: [../mapas/acessibilidade.md](../mapas/acessibilidade.md)
- Reduced-motion nas animações: [../design-system/animations.md](../design-system/animations.md)
- Constituição § 4 (a11y): [../constitution.md](../constitution.md#4-acessibilidade-wcag-21-aa)
- Teste a11y: [../testing/accessibility.md](../testing/accessibility.md)
