---
id: 019-fase-pre-eleicao
type: design
title: Design — o campo que decide a fase, as nove superfícies que calam, e o semeador
status: draft
date: 2026-09-13
spec: ./spec.md
adrs: [0043, 0012, 0017, 0024, 0029, 0038, 0042]
requirements: [RF-153, RF-154, RF-155, RF-156, RF-157, RF-158, RF-159, RF-160, RF-161, RF-162, RF-163, RF-164, RF-165, RF-166]
---

# Design 019 — fase pré-eleição

> Escrito em 2026-09-13, **antes** de qualquer implementação, sobre leitura
> linha a linha dos nove componentes da tabela de mentiras. O
> [ADR-0043](../../architecture/adrs/0043-fase-pre-eleicao-campo-proprio-nao-derivada.md) decide; este
> documento diz **onde**, **com que forma** e **qual teste prova**.
>
> Nenhuma linha de código desta spec existe hoje. Os caminhos marcados
> ✅ **existe** foram verificados no disco; os marcados ⬜ **a fazer** são
> previstos.

## D0 — A pergunta única: mede ou identifica?

O produto inteiro assume que existe apuração. Não há um interruptor "modo sem
dados" a ser ligado; há **nove superfícies** que precisam ser tratadas uma a
uma. O critério que decide o tratamento de cada uma — e o de qualquer bloco que
o produto ganhe depois — é uma pergunta só:

> **O bloco existe para comunicar uma medição, ou para comunicar identidade?**

- **Mede ⇒ cala.** Sem voto, a medição não existe. Renderizá-la com zeros não é
  "mostrar o vazio", é afirmar um resultado.
- **Identifica ⇒ fala.** Nome, foto, partido, cor e geografia são verdadeiros
  antes de 04/10 tanto quanto depois. É exatamente essa parte que o dono quer no
  ar, e é a única que pode ficar.

Não há um terceiro caso. O que a tabela do § D2 faz é aplicar essa pergunta às
nove superfícies medidas.

## D1 — O contrato: `fase` no payload, um só ponto de leitura

### O campo

```ts
// lib/edge-config/types.ts — ⬜ a fazer
export interface EdgePayload {
  // …
  /**
   * Ausente = fase normal. Presente = o payload foi SEMEADO, não medido.
   * Nenhum emissor real jamais escreve este campo (RF-166).
   */
  fase?: "pre_eleicao";
}

export interface EdgePayloadDeputado {
  // …
  fase?: "pre_eleicao";   // declarado por simetria; nunca semeado (RF-163)
}
```

Opcional nos dois, e por isso um payload pré-019 continua validando.
`app/api/internal/edge-write/route.ts` aceita e repassa: os dois `z.object` de
`composition` (`:167`, `:277`) não são `.strict()`, então o campo passa sem
mudança de schema — mas o schema **deve** declará-lo explicitamente, para que o
campo apareça no tipo inferido e o `writer` não o descarte silenciosamente.

### O ponto único de leitura

```ts
// lib/config/fase.ts — ⬜ a fazer. Molde: lib/config/dado-freshness.ts
export type Fase = "pre_eleicao" | "normal";

export function faseDoPayload(p: { fase?: string } | null | undefined): Fase;
export function isPreEleicao(p: { fase?: string } | null | undefined): boolean;
```

Três propriedades herdadas do molde (`lib/config/dado-freshness.ts`, que é o
lado de leitura do [ADR-0038](../../architecture/adrs/0038-dado-ts-hora-do-dado-nao-hora-do-calculo.md)):

1. **Zero I/O.** Funções puras sobre o JSON que já chegou. Nenhuma query nova,
   nenhuma chamada ao TSE, nenhum `Date.now()` — constituição § 9.
2. **Decidido no servidor.** O veredito viaja como prop para os componentes; não
   há estado de cliente, não há `useEffect`, nenhuma rota deixa de ser
   pré-renderizada.
3. **Uma guarda própria.** `tests/unit/config/fase.test.ts` varre `app/` e
   `components/` e falha se a string `"pre_eleicao"` aparecer fora deste módulo.

`faseDoPayload(null)` devolve `"normal"`. Isso é deliberado e é o que sustenta o
§ D5: uma página **sem payload** não está em fase pré por este caminho; ela está
no ramo de espera, que é outra coisa, e a faixa lá é decisão do chamador.

### As quatro negativas

O campo é o **único** sinal. Quatro fontes de fase que parecem naturais e estão
proibidas, cada uma com o modo de falha que a proíbe:

| fonte tentadora | por que está proibida |
|---|---|
| `pct_apurado_total === 0` | 🔴 Às 20h01 de 04/10 o valor real é **0,01%**, não 0 — mas por poucos minutos ele passa por lá, e um render nesse intervalo poria a tela em modo pré-eleição **com a apuração em andamento**. É a mutação que o § D9 mais teme. |
| `por_uf.length === 0` | Mesmo problema, deslocado: uma falha parcial de ingestão que produza `por_uf` vazio no meio da noite acenderia a fase pré. |
| `composition.pre_election` | Constante `0.0` nos dois emissores Python (`api/model/project.py:4051`, `api/model/deputado_payload.py:691`) e constante `1` nos dois `emptyPayload()` de TypeScript — **hoje ele já não mede fase**. E quando a [spec 008](../008-interatividade-brushing/spec.md) o tornar dinâmico, ele valerá ~0,95 em plena apuração, o que faria a tela voltar ao modo pré-eleição no meio da noite. É uma rede de segurança de mão única: parece uma guarda, aponta para o lado errado. |
| data de calendário | Relógio de servidor errado ou fuso mal resolvido produz a faixa "a eleição ainda não começou" durante a apuração. E a data não sabe se o orchestrator de fato começou a gravar. |

## D2 — As nove superfícies, o que cada uma faz e o que passa a fazer

Esta é a tabela que justifica cada supressão. A coluna "a mentira" é o que a
superfície **diria hoje** com um payload zerado, lida no arquivo e na linha.

| # | superfície | a mentira | arquivo:linha | veredito | RF |
|---|---|---|---|---|---|
| 1 | `RemainingPanel` (`por_uf: []`) | **"Todas as unidades federativas estão com a apuração concluída."** | `components/blocks/RemainingPanel.tsx:114-117, 183-188` | mede ⇒ **some** | RF-154 |
| 2 | `RemainingPanel` (rodapé) | "Nenhuma unidade federativa combina apuração pendente com resultado local ainda em aberto." | `:256-258` | mede ⇒ **some** | RF-154 |
| 3 | `RemainingPanel` (`por_uf` zerado) | "Líder projetado — Fulano (PT)" em UF sem um voto | `:190-244` | mede ⇒ **some** | RF-154 |
| 4 | `ChancesPanel` | "Fulano vence no 1º turno — **0%**". Sobrevive porque `p_fecha_1t` é `number` não-anulável (`types.ts:308`), logo `has(0) === true` | `components/blocks/ChancesPanel.tsx:128-130, 170-202` | mede ⇒ **some** | RF-154 |
| 5 | `BulletinPanel` | 5 linhas com `formatTimeHMS(ts)` ao lado de zero voto; IC de 95% **`[0,0; 0,0]`** = certeza absoluta | `components/blocks/BulletinPanel.tsx:101-133, 181-186` | mede ⇒ **some** | RF-154 |
| 6 | `RaceTypeIndicator` | **"Disputa entre 0 candidatos"** ao lado de 12 nomes | `components/atoms/badges/RaceTypeIndicator.tsx:41, 64-73` | identifica ⇒ **corrige** | RF-156 |
| 7 | `ResultPanel` | `<VoteBar>` 100% cinza "Outros" com marcador de 50%; margem "+0,0 pp"; 12 linhas com `rank` que não mede nada | `components/blocks/ResultPanel.tsx:180-186, 271-299, 352-361` | identifica ⇒ **poda** | RF-155 |
| 8 | mapa nacional | guarda de zero só em `viewMode === "parcial"` (`:204`); o default é `proj`+`winner` ⇒ **27 UFs** com a cor de identidade de `top_candidatos[0]` | `components/blocks/_NationalChoroplethMapImpl.tsx:204, 209, 215-219` | identifica (geografia) ⇒ **neutraliza a cor, mantém o mapa** | RF-157 |
| 9 | `ShellLiveBadge` | **"AO VIVO" pulsando**, `sr-only` "Apuração ao vivo" incondicional — **já mente hoje**, na tela honesta, em produção | `components/layout/ShellLiveBadge.tsx:44-54` | mede ⇒ **reescreve** | RF-159 |

E uma décima, que não é um componente:

| # | superfície | a mentira | arquivo:linha |
|---|---|---|---|
| 10 | `/governador` e `/senador` **sem ramo de espera** | caem em `emptyPayload()` e **já hoje** renderizam a estrutura completa com zeros, incluindo "Nenhuma UF se encaixa no filtro **Todas** no momento" | `app/(gov)/governador/page.tsx:184-206`, `:413` · `app/(sen)/senador/page.tsx:101-123` |

A #10 muda o enquadramento da spec inteira: para metade das telas, o estado que
o dono pediu **já é o estado atual**, sem aviso nenhum. Esta spec não está só
adicionando um modo — está fechando um buraco aberto.

### O bloco que NÃO some

`ForecastTransparency` (`components/blocks/ForecastTransparency.tsx`) mede — ele
decompõe o forecast em `pre_election` / `model` / `actual_results`. Pela regra do
§ D0 ele sumiria. **Não some**, e a razão é hierárquica, não estética: a
constituição [§ 8](../../constitution.md#8-transparência-metodológica) exige
"Bloco 'O que está movendo o forecast' presente em toda página com projeção".
Princípio constitucional está acima de regra de design desta spec
(hierarquia: constituição > ADRs > NFRs > specs).

A saída é a mesma que a regra permite: o bloco fica, a **medição** sai. Vira um
parágrafo no futuro — "quando os primeiros boletins chegarem, esta caixa mostra
quanto da projeção vem de dado real" — sem fração, sem barra, sem percentual
(RF-158).

## D3 — Por que suprimir aqui não viola o ADR-0017

O [ADR-0017](../../architecture/adrs/0017-transparencia-total-3-camadas.md)
proíbe que um bloco de uma página **com payload** suma quando a fonte dele
falha — o leitor não pode perder informação por causa de um erro invisível. Um
revisor pode ler o RF-154 como violação direta disso.

Não é, e a distinção é a mesma que `components/blocks/CandidaturasAguardando.tsx`
já registra no próprio cabeçalho:

- **O que o ADR-0017 proíbe** é o bloco sumir por **falha** — a fonte deveria ter
  dado e não deu, e o leitor nunca fica sabendo.
- **O que acontece aqui** é o bloco sumir por **ausência declarada de referente**
  — não há apuração, o payload diz isso explicitamente no campo `fase`, e o
  leitor é informado por uma faixa não dispensável no topo do `<main>`
  (RF-160).

A prova de que a distinção é real: no primeiro caso o leitor **não sabe** que
perdeu algo; no segundo, saber é o propósito da tela. E a informação que sumiu
não existia — não há medição a esconder.

## D4 — Onde cada mudança entra

> ⚠️ **A supressão é decisão do chamador, não do componente.** Um `if (fase) return null`
> dentro de `RemainingPanel` poria a regra de fase em quatro arquivos e violaria
> o ponto único do RF-153. É exatamente assim que a guarda do mapa acabou no ramo
> errado (#8): a condição foi escrita onde era conveniente, não onde era
> completa.

| RF | arquivo | mudança |
|---|---|---|
| RF-153 | `lib/edge-config/types.ts` ⬜ | `fase?: "pre_eleicao"` nas duas interfaces |
| RF-153 | `lib/config/fase.ts` ⬜ | módulo novo; `isPreEleicao`, `faseDoPayload` |
| RF-154 | `app/page.tsx`, `app/(gov)/governador/page.tsx`, `app/(sen)/senador/page.tsx` ⬜ | `{!pre && <RemainingPanel …/>}` etc. — quatro chamadas, no chamador |
| RF-155 | `components/blocks/ResultPanel.tsx` ✅ (prop existe) | passar `poles={false}`; duas props novas para margem e rank, ou uma `variant="identidade"` (ver abaixo) |
| RF-156 | `components/atoms/badges/RaceTypeIndicator.tsx` ⬜ | prop `preEleicao`; quando ligada, `candidatos.length` sem o limiar `PCT_THRESHOLD_1T` |
| RF-157 | `components/blocks/_NationalChoroplethMapImpl.tsx` ⬜ | `if (preEleicao) return getCssVar("--map-uncounted") \|\| "#e1e4e8";` como **primeira linha** de `resolveColor` |
| RF-157 | `components/blocks/NationalMapBlock.tsx` ⬜ | não renderizar `MapViewToggle`; trocar `MapLegend` |
| RF-158 | `components/blocks/ForecastTransparency.tsx` ⬜ | ramo de prosa |
| RF-159 | `components/layout/ShellLiveBadge.tsx` + `.module.css` ⬜ | dois `sr-only`; `display` por custom property; ponto sem animação |
| RF-160 | `components/atoms/banners/FasePreEleicaoBanner.tsx` ⬜ | componente novo; molde de posição: `DadoParadoBanner` |
| RF-162 | `components/blocks/UfLinksGrid.tsx` ⬜ | componente novo; 27 links |
| RF-164 | `data-pipeline/projection-seed.ts` ⬜ | semeador |
| RF-165 | `scripts/edge-config-prune.ts` ⬜ | fiscal |
| RF-166 | `api/model/project.py`, `api/model/deputado_payload.py` | **nenhuma mudança** — e é isso que o teste afirma |

### `ResultPanel`: uma prop ou três?

`poles?: boolean` já existe (`:118`, `:243`) e resolve um terço do RF-155. Faltam
margem e rank. Duas formas:

- **três props booleanas** (`poles`, `margem`, `rank`) — mais granular, e três
  chamadores futuros podem combiná-las de oito jeitos, sete dos quais ninguém
  testou;
- **`variant="identidade"`** — uma decisão, um nome, um caminho testável, e a
  semântica fica legível no call site.

**Recomendação: `variant`**, com `poles={false}` derivado dela. A granularidade
extra não tem consumidor previsto, e cada booleano solto é uma combinação a mais
que um teste de caminho feliz não cobre.

### `FasePreEleicaoBanner`: o molde e a divergência

`components/atoms/banners/DadoParadoBanner.tsx` ✅ é o molde de **posição** —
faixa irmã dos painéis, fora de `<Panel>`, logo abaixo do shell, na mesma camada
de `NationalWinnerBanner` e `BreakingNewsTicker` (ADR-0029 § 1). Três coisas
mudam:

| | `DadoParadoBanner` | `FasePreEleicaoBanner` |
|---|---|---|
| cliente ou servidor | `"use client"` — reavalia com o tempo contra a store de frescor | **Server Component puro.** O estado não muda enquanto a página está aberta; a transição de 04/10 é uma gravação no Edge Config, que só alcança um render novo. |
| cor | âmbar = "algo está errado" | tinta neutra do kit. Aqui **nada está errado**; o produto está funcionando como projetado. Reusar o âmbar treinaria o leitor a ignorar o âmbar. |
| semântica | faixa de estado degradado | `<section aria-labelledby>`, **não** `role="alert"` (ver D5) |

## D5 — O aviso em duas camadas, e o problema da tela sem payload

### Camada A — a faixa

Primeiro filho do `<main>`, antes do kicker, antes do `<h1>`. O teste é de
**ordem**, não de presença (RF-160) — a mesma lição do RF-149 da spec 018, onde
um teste de presença passaria com a faixa enterrada no rodapé.

**`<section aria-labelledby>`, não `role="alert"`.** `alert` interrompe o leitor
de tela e é para mudança inesperada e urgente. Este é um estado **estável de
semanas**, anunciado a cada navegação; como alerta, vira ruído que treina o
usuário a ignorar alertas de verdade (RNF-023).

**Sem dispensar.** Nenhum `×`, nenhum `localStorage`, nenhum cookie. Um aviso
dispensável produz, do segundo acesso em diante, exatamente a tela contra a qual
a spec inteira foi escrita.

### Camada B — o texto no lugar de cada zero

A faixa é lida uma vez, no primeiro segundo. Depois o leitor rola. A camada B
existe para que **o lugar onde o zero estaria** também diga o que está
acontecendo:

- o kicker vira texto de candidatura;
- o `<h1>` vira **"Quem está concorrendo"**;
- a `note` do `ResultPanel` diz que a lista é de candidaturas registradas e que
  nenhum voto foi contado;
- a ordem é por **número de urna**, não por `pct_projetado` zerado (que ordena
  pelo desempate e produz falso favoritismo estável — constituição § 2).

**Métrica de aceitação da spec**: a palavra "projeção" não aparece em nenhuma das
quatro telas em fase pré, exceto no bloco do RF-158. Medida sobre o **HTML
renderizado**, não sobre a lista de componentes — a palavra vaza por `note`,
`aria-label`, `title` e legenda, que são os lugares que ninguém revisa.

### O furo: a faixa numa tela que não tem payload

`AguardandoNacional` de `/deputado-federal`
(`app/(dep)/deputado-federal/page.tsx:650`) precisa da faixa (RF-163) e **não tem
payload** de onde ler `fase`. `faseDoPayload(null)` devolve `"normal"` por
construção (§ D1).

**Resolução: o chamador decide, e naquele ramo a faixa é incondicional.** Aquele
ramo já significa "não há apuração publicada"; a faixa é a afirmação em prosa do
que o ramo já é. `FasePreEleicaoBanner` não lê payload nenhum — recebe props e
renderiza. Dois tipos de chamador:

1. páginas cujo payload tem `fase: "pre_eleicao"` → renderizam a faixa sob
   `isPreEleicao(payload)`;
2. ramos de espera sem payload → renderizam a faixa sempre.

A alternativa — gatear por data de calendário — foi **rejeitada**: relógio de
servidor errado ou fuso mal resolvido produziria a faixa no meio da noite de
apuração, e a data não sabe se o orchestrator de fato começou a gravar
(spec § open question 3).

### Consequência de fiação que a spec 018 não previu

O gatilho de **T-14** (a grade de rostos da spec 018) é hoje "não há payload".
Para Presidente, o semeador **faz o payload existir**, então a página sai do
ramo de espera e a grade de T-14 deixa de ser montada pelo caminho atual.

A grade precisa ser re-pendurada no ramo de fase pré. Os componentes já existem
— `components/blocks/CandidaturasAguardando.tsx` ✅ e
`components/blocks/CandidatosGrid.tsx` ✅ —, e o que muda é **de onde** são
chamados. Isso emenda a fiação do RF-149 sem mudar seu comportamento observável:
o parágrafo honesto continua antes da grade onde o parágrafo existir, e nas
telas semeadas o papel dele passa a ser da faixa (camada A) mais o `<h1>`
(camada B).

## D6 — O selo do shell: duas camadas de texto, uma para cada leitor

`app/layout.tsx` não pode ler Edge Config nem `searchParams`/`cookies()` — os
dois tiram a home e as 54 páginas de UF do pré-render estático (ADR-0025 § 2 e
§ 5) — e `<TopBar>`, sendo irmão anterior de `{children}`, não recebe props da
página. A saída existente é a página publicar uma custom property em `:root`, que
herda para trás no documento (ADR-0029 § 4).

**Rótulo visível**: continua por custom property, como hoje. A página em fase pré
publica um rótulo que não afirma liveness.

**Ponto**: sem animação em fase pré. O problema não é movimento —
`prefers-reduced-motion` já cobre isso — é a **afirmação** de que algo está
acontecendo agora.

**Texto acessível**: 🔴 **CSS `content` não conserta texto acessível.** O próprio
cabeçalho de `ShellLiveBadge.tsx` documenta isso como a razão de o número não ser
anunciado dali: texto gerado por `content` é lido de forma inconsistente entre
leitores de tela. A saída é emitir **os dois textos no DOM** e esconder um com
`display: none`, controlado por custom property:

```tsx
// ⬜ a fazer
<span className={styles.srPre}    >Ainda não há apuração. A eleição é em 4 de outubro.</span>
<span className={styles.srNormal} >Apuração ao vivo</span>
```

```css
/* ShellLiveBadge.module.css — ⬜ a fazer */
.srPre    { display: var(--live-sr-pre,    none); }
.srNormal { display: var(--live-sr-normal, inline); }
```

`display: none` remove do accessibility tree — é a única forma que funciona nos
dois leitores. `visibility: hidden` também remove; `sr-only` **não** remove, e um
`sr-only` no elemento errado faria o leitor ouvir as duas frases seguidas.

### O fallback, e a correção de um defeito presente

Rotas que **não publicam** custom property nenhuma — `/candidatos`,
`/sobre-o-modelo`, `/status` — hoje caem no fallback `"ao vivo"` do `content` e
no `sr-only` "Apuração ao vivo" incondicional (`:44-54`). Essas rotas **nunca
foram ao vivo**, em fase nenhuma. Então o que o selo afirma é falso **em qualquer
dia do calendário**, não só em fase pré.

**Decisão do orquestrador (2026-09-13)**: O RF-159 deixa de afirmar liveness
nas duas camadas do fallback. Isso não é uma concessão à fase pré — é a
correção de um defeito presente. Um painel que lista candidatos e afirma ao
leitor (visual e acessível) "apuração ao vivo" está mentindo. A especificação
de quando essa correção toma efeito é simples: no mesmo dia do semeador (e
qualquer dia depois). **Não é ampliação de escopo**, é conserto. Removido de
open questions.

## D7 — O semeador

```
data-pipeline/projection-seed.ts     ⬜   runner: tsx
scripts/edge-config-prune.ts         ⬜   fiscal
```

### O que grava

Para **Presidente, Governador e Senador** — nunca Deputado Federal (RF-163):

```ts
{
  fase: "pre_eleicao",
  ts: <iso>,
  cargo, turno: 1,
  pct_apurado_total: 0,
  ufs_apuradas: 0,
  national: { candidatos: [ /* identidade, vinda da spec 018 */ ], … },
  por_uf: [],          // ← vazio, e é decisão de desenho
  insights: [],
}
```

**`por_uf: []` é defesa em profundidade, não economia de bytes.** Linhas em
`por_uf` são a matéria-prima das mentiras #1, #2 e #3. Não produzi-las é mais
barato e mais seguro que suprimir os painéis que as leem — e as duas defesas
(não produzir + suprimir) coexistem de propósito: a supressão protege contra um
`por_uf` que volte a ser populado; o vazio protege contra um painel que escape da
supressão.

Alvo de tamanho: **~10 KB** no total, medido contra o teto do Global Config
([ADR-0032](../../architecture/adrs/0032-detalhe-municipal-vercel-blob.md)) —
medido, não estimado.

### A ordem `gov → sen → pres`, e por que ela é load-bearing

`lib/edge-config/writer.ts:738-740` grava, a cada chamada, **duas** coisas: a
chave nomeada `projection-current-<cargo>-t<turno>` **e** o alias
`projection-current`, apontando para o mesmo valor. O alias fica, portanto, com
**quem escreveu por último**.

E o único leitor do alias é a corrida presidencial —
`lib/edge-config/reader.ts:131` e `:252` registram que o alias legado sem cargo
"só existiu para a corrida presidencial".

Logo: **`pres` por último**. Trocar a ordem faz a home presidencial ler o payload
de Senador. O teste afirma **qual cargo está no alias**, não que o alias existe
(§ D9).

> ⚠️ **Ambiguidade do desenho aprovado**: ele diz "6 chaves". A contagem que o
> código sustenta é **3 chaves nomeadas + 1 alias = 4 nomes distintos**, escritos
> em **6 upserts**. Este design adota 4 nomes / 6 upserts. Ver spec § open
> question 1.

### A guarda de reentrância

```
se a chave de destino já existe E não tem `fase`  ⇒  RECUSA, não grava nada, erro nomeado
se a chave de destino já existe E tem `fase`       ⇒  sobrescreve (re-semear é normal)
se a chave não existe                              ⇒  grava
```

O modo de falha que ela previne é o pior da spec: **rodar o semeador por engano
às 21h de 04/10 apagaria a apuração ao vivo** e poria o país inteiro de volta em
zero. A guarda é fail-closed, como a publicabilidade do RF-141 da spec 018, e
pelo mesmo motivo — a dúvida resolve para "não escreve".

`--force` levanta essa recusa e **só** essa, e o uso fica no log do ciclo.

### O fiscal

`scripts/edge-config-prune.ts` lista (default) e remove (sob confirmação) as
chaves que ainda carregam `fase: "pre_eleicao"`. Ele existe para o caso em que a
transição do § D8 **não** aconteceu para algum cargo — é a alavanca manual de 30
segundos que o [runbook](../../operations/runbook.md) precisa ter às 20h05 de
04/10. No caminho feliz ele não encontra nada, porque o upsert real já apagou o
campo.

## D8 — A transição de 04/10

```
20h00  três chaves no store com `fase: "pre_eleicao"`
       ↓ cron do cargo dispara, orchestrator monta o payload real
20h01  writer grava o payload real SOBRE a chave semeada (substituição integral)
       ↓ `fase` deixa de existir para aquele cargo
20h01  tela daquele cargo em MODO NORMAL, com pct_apurado_total = 0,01
```

Três invariantes:

1. **O orchestrator nunca emite `fase`.** Não há código novo em
   `api/model/project.py` nem em `api/model/deputado_payload.py`. O teste é uma
   **asserção negativa** sobre o JSON emitido — um emissor que escrevesse
   `fase: null` ou `fase: "normal"` passaria num teste positivo e falharia aqui.
2. **A gravação é substituição integral, não merge.** Um merge preservaria
   `fase` do valor antigo, e a tela ficaria em modo pré-eleição com dado real por
   baixo, indefinidamente, sem alarme.
3. **A transição é por cargo, não global.** Os crons são independentes; um cargo
   atrasar não pode arrastar os outros dois.

🔴 **A negativa dura**: **nada** pode gatear em `pct_apurado_total === 0`. Às
20h01 o valor real é 0,01% — e por alguns minutos antes disso ele passa por 0
**com o orchestrator já rodando**. Um gate no percentual poria a tela em modo
pré-eleição com a apuração em andamento. Ver § D9, mutação M1.

## D9 — Testes que discriminam, e a mutação que cada um derruba

Um teste que passa sem provar nada é o padrão de falha mais caro deste projeto
(ver [feedback: teste que não discrimina](../../reference/risks.md)). Cada linha
abaixo nomeia **a mutação que o teste tem de matar** — se a mutação passa, o
teste não vale.

| id | teste | mutação que ele derruba | RF |
|---|---|---|---|
| **M1** 🔴 | payload **sem** `fase` + `pct_apurado_total: 0.01` ⇒ **tela normal** | trocar `isPreEleicao(p)` por `p.pct_apurado_total === 0` (ou `<= 0`, ou `!p.por_uf.length`). **Este é o teste mais importante da spec.** Sem ele, a mutação mais natural do mundo entra sem resistência e a tela vai a modo pré-eleição às 20h01. | RF-153, RF-166 |
| M2 | payload **sem** `fase` + `pct: 0` + `por_uf: []` ⇒ **tela normal** | fecha a mesma mutação pelo outro campo | RF-153 |
| M3 | payload **com** `fase` + `pct: 37.4` ⇒ **modo pré** | trocar a leitura por um `&&` de fase e percentual ("na dúvida, confere os dois") | RF-153 |
| M4 | `queryByTestId(painel)` devolve `null` para os quatro painéis | trocar a supressão por `toBeEmptyDOMElement()` — que passa com o painel presente e vazio, e o painel presente ocupa espaço, tem borda e tem título | RF-154 |
| M5 | as strings `"apuração concluída"`, `"vence no 1º turno"`, `"Líder projetado"` ausentes do HTML | mover a frase para outro bloco; um teste por componente não pega, um teste por texto pega | RF-154 |
| M6 | os quatro painéis **presentes e idênticos ao snapshot** em fase normal | apagar o painel de vez em nome da "simplificação" — a regressão barata desta spec é sumir com um painel na noite de 04/10 | RF-154 |
| M7 | `RaceTypeIndicator` sobre **o mesmo array** devolve 12 em fase pré e N<12 em fase normal | remover `PCT_THRESHOLD_1T` de vez; um teste só do modo pré passaria | RF-156 |
| M8 | mapa: matriz completa `{proj,parcial} × {winner,margin,swing}` ⇒ 27 UFs em `--map-uncounted` | pôr a guarda depois do `switch`, ou só no caso `winner` — é exatamente o defeito que existe hoje, deslocado | RF-157 |
| M9 | a guarda está **antes** da linha que lê `top_candidatos[0]` (teste de posição, sobre o fonte) | um refactor futuro que reordene e reintroduza a cor sem tocar na guarda | RF-157 |
| M10 | `ForecastTransparency` **presente** em fase pré, **sem** fração/barra/percentual | suprimi-lo junto com os outros quatro — viola constituição § 8 | RF-158 |
| M11 | leitor de tela em fase pré **não** ouve "Apuração ao vivo"; o `sr-only` alternativo **está** no DOM | trocar o texto acessível por `content` de CSS, que parece funcionar no inspetor e não funciona no leitor | RF-159 |
| M12 | a faixa é `firstElementChild` do `<main>` | inserir a faixa em qualquer outro lugar; um teste de presença passa com ela no rodapé | RF-160 |
| M13 | a faixa **não** tem `role="alert"` e **não** tem controle focável | "melhorar" a acessibilidade pondo `role="alert"`, ou acrescentar um `×` por gentileza | RF-160 |
| M14 | a raiz `projeç`/`projec` ocorre **zero** vezes no HTML das quatro telas fora do RF-158 | vazamento por `aria-label`, `title`, `alt` ou legenda — medir sobre componentes em vez de sobre o HTML não pega | RF-161 |
| M15 | a ordem das candidaturas é por número de urna, **estável** em 100 renders | ordenar por `pct_projetado` zerado, que produz a ordem do desempate e é lida como ranking | RF-161 |
| M16 | `/governador` e `/senador` em fase pré: **nenhum nome de candidatura** no documento, e 27 links | a positiva ("os 27 links estão lá") passa com uma grade de rostos logo abaixo | RF-162 |
| M17 | o semeador grava **zero** chaves de cargo `dep` — asserção sobre o conjunto gravado, verificada contra o store | semear `dep` "por simetria" | RF-163 |
| M18 | depois do semeador, `projection-current` contém o payload de **cargo 1** | trocar a ordem para `pres → gov → sen`; o alias ficaria com Senador e a home presidencial leria a corrida errada. Um teste de "o alias existe" passa com qualquer ordem. | RF-164 |
| M19 | semeador contra chave existente **sem** `fase` ⇒ não grava nada e lança | remover a guarda de reentrância, ou fazê-la avisar e prosseguir | RF-164 |
| M20 | JSON emitido por `project.py`/`deputado_payload.py` **não contém** a chave `fase` | emitir `fase: null` ou `fase: "normal"` — passa em teste positivo, apaga a distinção "ausente = normal" | RF-166 |

Dois princípios que atravessam a tabela:

- **Asserção negativa onde a positiva é fraca.** "O placeholder está lá" passa
  com o nome real ao lado; "o nome real não está em lugar nenhum" não passa. É a
  mesma técnica dos RF-140 e RF-145 da spec 018.
- **Todo teste de supressão tem um par em modo normal.** Suprimir é fácil de
  implementar e fácil de implementar demais. O par (M6, M7) é o que impede a
  supressão de vazar para 04/10.

## D10 — Riscos técnicos

| # | risco | mitigação |
|---|---|---|
| T1 | **`emptyPayload()` de `/governador` e `/senador` cai em modo normal.** Ele produz `composition.pre_election: 1` e `por_uf: []` **sem** `fase`, e exibiria a mentira #1 quando o Global Config falhar. | 🟡 **Aberto.** Ou `emptyPayload()` passa a carregar `fase` (e a fase vira também estado de falha, o que RNF-010 desaconselha), ou aquelas duas páginas ganham um ramo de espera de verdade. Spec § open question 4. **Bloqueia `shipped`, não bloqueia a implementação.** |
| T2 | **`por_uf: []` e o mapa.** O fallback de UF sem `row` é `--map-uncounted`, que é o resultado desejado — mas isso foi **deduzido**, não visto. | Verificar no browser antes de considerar o RF-157 fechado. A guarda continua necessária de qualquer forma, como rede para um `por_uf` que volte a ser populado. |
| T3 | **Fiação de T-14.** O semeador tira Presidente do ramo "sem payload", que é o gatilho da grade da spec 018. | § D5, último bloco. Os componentes existem; muda de onde são chamados. |
| T4 | **Orçamento above-the-fold.** RNF-007a está em **148,7 KiB de 150** — 1,3 KiB de folga. | A spec é toda de supressão; os dois componentes novos são Server Components sem JS de cliente, e suprimir `MapViewToggle` devolve bytes. Delta líquido esperado **negativo**, medido por `tests/e2e/perf-budget.spec.ts` — medido, não estimado. |
| T5 | **CLS da faixa.** Ela é o primeiro filho do `<main>` e empurra tudo para baixo. | Server Component, altura por conteúdo, nunca aparece depois da hidratação. Um banner que entra no cliente é CLS medido exatamente onde mais dói (RNF-002). |
| T6 | **Guard de tamanho do Global Config.** ~10 KB é a estimativa; o store já é dividido por quatro cargos e a spec 018 já pendurou campos novos em `top_candidatos` sem medição fechada (spec 018 § open question 5). | Medir o store **depois** do semeador, contra o teto, antes de ir ao ar. |
| T7 | **Contraste da faixa.** Não reusa o âmbar de `DadoParadoBanner`. | Tinta neutra do kit com contraste medido (RNF-022). O âmbar significa "algo está errado", e aqui nada está. |

## Cross-refs

- [Spec 019](./spec.md) — os 14 RFs em EARS, a tabela de mentiras, os riscos de produto
- [ADR-0043](../../architecture/adrs/0043-fase-pre-eleicao-campo-proprio-nao-derivada.md) — a decisão e a objeção registrada
- [ADR-0012](../../architecture/adrs/0012-edge-config-chaves-nomeadas.md) — chaves nomeadas e o alias dinâmico (§ D7)
- [ADR-0017](../../architecture/adrs/0017-transparencia-total-3-camadas.md) — o bloco que não some por falha (§ D3)
- [ADR-0029](../../architecture/adrs/0029-home-mobile-first-mapa-primeiro-fiel-ao-kit.md) § 1 e § 4 — camada das faixas, e o selo por custom property (§ D5, § D6)
- [ADR-0032](../../architecture/adrs/0032-detalhe-municipal-vercel-blob.md) — teto do Global Config (§ D7, T6)
- [ADR-0038](../../architecture/adrs/0038-dado-ts-hora-do-dado-nao-hora-do-calculo.md) — `lib/config/dado-freshness.ts`, o molde de `lib/config/fase.ts` (§ D1)
- [Design 018](../018-identidade-candidatura/design.md) — de onde vêm nome, foto, partido e cor
- [Runbook](../../operations/runbook.md) — onde o fiscal do § D7 vira item de checagem às 20h05
- Constituição [§ 2](../../constitution.md#2-neutralidade-política) (ordem e cor), [§ 7](../../constitution.md#7-resiliência-operacional) (degradação ≠ fase pré), [§ 8](../../constitution.md#8-transparência-metodológica) (o bloco que não pode sumir)
