---
id: 020-evolucao-da-apuracao
title: Evolução da apuração — a noite como linha, quatro candidaturas, duas bases
status: draft
priority: M
personas: [P1, P2, P3]
screens: [T-01, T-03, T-04, T-10]
requirements: [RF-167, RF-168, RF-169, RF-170, RF-171, RF-172, RF-173, RF-174, RF-175, RF-176]
depends_on: [002-modelo-estatistico, 003-home-nacional, 004-pagina-uf-presidencial, 005-pagina-uf-governador, 016-senador, 019-fase-pre-eleicao]
apis: []
components: [SerieApuracaoChart, DetailUnavailable, Panel, ViewModeSwitch, TimeSeriesChart]
nfr: [RNF-002, RNF-007a, RNF-022, RNF-023, RNF-024, RNF-026]
adrs: [0046, 0011, 0012, 0017, 0024, 0029, 0031, 0032, 0038, 0043]
amends: [003-home-nacional, 004-pagina-uf-presidencial, 005-pagina-uf-governador, 016-senador]
ship_blocked_on: []
---

# Spec 020 — Evolução da apuração

**Rotas novas**: nenhuma.
**Superfícies emendadas**: `/`, `/uf/[sigla]`, `/uf/[sigla]/governador`, `/uf/[sigla]/senador`.
**Mecanismo**: uma série por candidatura publicada em forma colunar com teto de
pontos, um componente SVG sem lib de charting, e a cascata `data-view-only` que
já existe para alternar entre apurado e projetado.
**Decisão**: [ADR-0046](../../architecture/adrs/0046-serie-por-candidato-limitada-por-construcao.md).

## Status

`draft`. Escrita em 2026-09-17 a partir de um protótipo visual do dono do
produto e de cinco decisões tomadas por ele na mesma sessão (§ Decisões do dono).

## Objetivo

As telas de apuração mostram um retrato: quem está à frente **agora**. Não
mostram como se chegou até ali. A história de uma noite de apuração está no
movimento — quem larga na frente porque o Norte apura primeiro, em que hora as
linhas se cruzam, quando a disputa deixa de ser disputa.

Esta spec acrescenta um gráfico de linhas com o horário do boletim no eixo
horizontal e a fatia de votos no vertical, uma linha por candidatura, limitado às
**quatro à frente no momento**, em **duas bases** (o que já foi contado e o que o
modelo projeta) alternadas pelo controle que já existe no topo da tela.

## Decisões do dono (2026-09-17 — não re-litigar)

| | Decisão |
|---|---|
| D-A | As 4 são as que estão à frente **no momento**; se alguém ultrapassa, entra e outra sai |
| D-B | O eixo vertical é a fatia de votos da candidatura |
| D-C | Duas bases — apurado **e** projetado — com alternância entre as visões |
| D-D | Senador: 4 linhas, as 2 primeiras posições destacadas (2 vagas por UF em 2026) |
| D-E | Só onde há **uma** corrida. `/governador` e `/senador` nacionais ficam fora |

**Consequência de D-A registrada e aceita pelo dono:** a candidatura que cai do
top-4 desaparece do gráfico **inclusive do seu próprio passado**, e a
ultrapassagem que a derrubou fica invisível — vê-se o resultado dela, não o
evento. Mitigado por rótulo explícito e pela tabela acessível; não resolvido.

## Escopo

### Dentro

- Persistência do percentual **apurado por candidatura** ao longo do tempo, que
  hoje é calculado a cada ciclo e descartado.
- Publicação de uma série por candidatura, por UF (no objeto Blob) e nacional
  (em campo do payload que já existe).
- Um componente de gráfico novo, Server Component, SVG inline, sem lib.
- Quatro estados de exibição, nenhum deles apagando o bloco do DOM.
- O estado anterior a 04/10, com os eixos desenhados e sem nenhuma linha.

### Fora

- `/governador` e `/senador` nacionais (D-E): ali não há quatro candidaturas,
  há 27 disputas distintas cujas fatias não se somam.
- Deputado Federal: a cadência é outra (volta completa em 30 min,
  [ADR-0036](../../architecture/adrs/0036-deputado-federal-granularidade-zona-fatiada.md)) e a corrida
  é proporcional. Fica para depois do 1º turno.
- Interação no gráfico (hover, tooltip, brushing). A spec 008 é dona disso.
- Ressuscitar RF-040/041/042 (margem, probabilidade e turnout **do líder**).
  São perguntas diferentes desta e continuam órfãs no corpo da spec 004.

## Os três estados, aplicados a uma série

A regra de produto de 2026-09-14 vale ponto a ponto: **não começou**, **não
sabemos** e **apurando** são três estados, e nenhum deles é zero.

| Situação | Estado | O que a tela faz |
|---|---|---|
| Antes de 04/10 | não começou | eixos e rótulos, zero linhas, "disponível apenas no dia das eleições" |
| Sem payload, eleição em curso | não sabemos | motivo explícito, via `DetailUnavailable` |
| Um único ponto medido | apurando | diz a hora da primeira medição e que a linha aparece no segundo boletim |
| Balde sem ciclo no meio da série | apurando, com furo | o traço **interrompe**; nunca interpola, nunca desce a zero |

A distinção entre "não começou" e "não sabemos" nas três rotas de UF é o ponto
frágil: essas rotas **não têm payload próprio em fase pré** — o semeador grava
apenas as chaves nacionais (`data-pipeline/projection-seed.ts`), e o ramo
`if (!payload)` de cada uma funde hoje os dois estados num só texto. A fase é
lida do **payload nacional**, pelo ponto único `isPreEleicao` — nunca por data de
calendário, que `lib/config/fase.ts` lista entre as quatro fontes proibidas.

## Requisitos Funcionais

### Persistência

**RF-167 — O percentual por candidatura é persistido, não recalculado**

WHEN o orchestrator persiste um ciclo em `projections`, the system SHALL gravar,
em cada linha `(cargo, turno, uf, candidato_id, ts)`, as colunas `pct_atual`
(percentual sobre votos válidos apurados), `votos_atuais` (numerador absoluto) e
`dado_ts` (hora do boletim do TSE que originou o ciclo).

*Aceitação:* (a) linha de UF e linha nacional (`uf IS NULL`) gravam as três, e a
nacional não levanta `KeyError` — hoje `national_rows` não carrega a chave
`pct_atual`; (b) o `pct_atual` nacional é a razão de somas de `votos_atuais` das
UFs, pela **mesma função** que o payload nacional usa, e não por uma segunda
implementação; (c) linha anterior à migration fica `NULL`, nunca `0`; (d) nenhum
`UPDATE` ou `DELETE` (constituição § 10).

### Forma e volume da série

**RF-168 — A série é limitada por construção, nunca por corte**

WHILE o orchestrator monta a série por candidatura, the system SHALL escolher a
cadência como o menor valor de `[5, 10, 15, 30]` minutos tal que
`ceil(janela_minutos / cadência) ≤ 120`, SHALL representar cada balde pelo ponto
de maior `dado_ts` dentro dele, e SHALL declarar a cadência escolhida no payload.

*Aceitação:* (a) para toda janela de 1h a 24h, o eixo tem no máximo 120 pontos;
(b) o balde é representado pelo **último**, nunca pela média — média suavizaria
descontinuidades e poderia fazer uma quantidade quase-monotônica regredir;
(c) o teto **re-bucketiza**, nunca descarta o começo da noite; (d) o balde deriva
do epoch de `dado_ts`, nunca do índice do array: um ciclo perdido não desloca os
pontos anteriores (constituição § 6).

**RF-169 — O último ponto é o número publicado ao lado**

WHEN o orchestrator emite a série de um ciclo, the system SHALL anexar o ponto
daquele ciclo a partir dos valores em memória, de modo que o último ponto de cada
linha seja idêntico ao `pct_atual` / `pct_projetado` publicados no mesmo payload.

*Aceitação:* (a) `serie.candidatos[i].apurado.at(-1)` é igual ao `pct_atual` da
mesma candidatura no payload, na mesma renderização; (b) vale sem reconsultar
`projections` depois da escrita do ciclo; (c) o teste falha se a leitura da série
voltar a preceder a escrita — hoje ela precede, e a série sai um ciclo atrasada.

### Elenco e cor

**RF-170 — Quatro linhas, escolhidas agora, desenhadas desde o início**

WHEN a série é montada, the system SHALL selecionar as 4 candidaturas pelo
comparador `pct_atual` desc → `pct_projetado` desc → `id` asc aplicado ao ciclo
corrente, e SHALL emitir a série **completa** dessas 4 desde o primeiro ponto da
janela.

*Aceitação:* (a) o elenco é igual a `rankByParcial(candidatos).slice(0, 4)`, por
um helper único importado tanto pelas páginas quanto pelo teste; (b) nenhuma
linha começa depois do primeiro ponto do eixo; (c) o consumidor **não** re-ordena
— renderiza na ordem recebida; (d) troca de elenco entre ciclos não altera a cor
de nenhuma linha remanescente.

**RF-171 — A cor é do partido; o rank escolhe quem entra, nunca de que cor**

WHILE o widget renderiza, the system SHALL resolver a cor de cada linha por
`colorForParty(candidato.partido)`, e SHALL NOT consumir o campo `cor` do
payload.

*Aceitação:* (a) renderizar a mesma série com o array de candidaturas em ordem
invertida produz `stroke` idêntico por `id`; (b) a string `--color-cand-` não
ocorre no HTML do widget — é a cor por rank que o
[ADR-0024](../../architecture/adrs/0024-paleta-editorial-por-partido.md)
aposentou, e que o payload ainda publica; (c) partido sem token cai no token de
"outros", nunca em cor ausente.

### Apresentação

**RF-172 — As duas visões alternam pelo controle que já existe**

WHERE o leitor alterna entre apurado e projetado, the system SHALL renderizar as
duas séries no servidor sob `data-view-only="parcial"` e `data-view-only="proj"`,
deixando o `<ViewModeSwitch>` do shell e a cascata de `app/globals.css`
resolverem a alternância, e SHALL NOT introduzir controle próprio.

*Aceitação:* (a) o HTML do servidor contém os dois grupos; (b) o widget adiciona
**0 B** ao bundle de aplicação medido por `tests/e2e/perf-budget.spec.ts`;
(c) não há `<input>`, `<button>` nem `"use client"` no módulo do gráfico; (d) o
eixo vertical é **idêntico** nas duas visões — alternar não move nenhuma linha
por mudança de escala, que seria uma mentira gráfica produzida a cada clique.

**RF-173 — Senador: quatro linhas, duas vagas legíveis sem cor**

WHERE a corrida elege 2 vagas, the system SHALL destacar as 2 primeiras posições
por espessura de traço e por uma régua rotulada na altura da 2ª vaga, e SHALL
declarar quais duas ocupam vaga na legenda da tabela acessível.

*Aceitação:* (a) o destaque sobrevive a monocromático e a daltonismo; (b) as 2 de
fora **não** usam opacidade reduzida — `app/globals.css` registra que ela
derrubou 16 nós para 2,27:1 no axe em 2026-09-08; (c) o destaque não usa
intensidade de partido, que o ADR-0024 reserva para margem, não para posição;
(d) a informação existe em texto para quem não enxerga o gráfico.

**RF-174 — Antes de 04/10 o gráfico desenha os eixos e diz que ainda não é hora**

WHILE a corrida está em fase pré-eleição, the system SHALL renderizar eixos e
rótulos sem nenhuma linha, com a frase "disponível apenas no dia das eleições", e
a palavra "projeção" SHALL NOT ocorrer em nenhuma superfície do widget —
incluindo `aria-label`, `<title>`, `<desc>`, legenda de tabela e rótulo de eixo.

*Aceitação:* (a) nenhum elemento de traçado de série no DOM; (b) os únicos
percentuais na tela são os da **régua fixa** (0, 10, 20, 30, 40, 50) e os únicos
horários são os da janela ilustrativa (17h às 20h30) — rótulo de escala é
moldura, não medição, e é o que o protótipo do dono mostra; qualquer percentual
fora dessa lista é valor fabricado e reprova; (c) a decisão de fase é do chamador, pelo ponto único de leitura — o
literal da fase não ocorre no módulo do widget, e `tests/unit/config/fase.test.ts`
varre e falha se ocorrer; (d) nas rotas de UF, que não têm payload próprio em
fase pré, a fase é lida do payload **nacional**, nunca de data de calendário;
(e) o bloco não some da tela ([ADR-0032](../../architecture/adrs/0032-detalhe-municipal-vercel-blob.md) item 3).

**RF-175 — Três estados degradados, nenhum silencioso**

WHEN a série não pode ser desenhada, the system SHALL distinguir "menos de 2
pontos" (apurando, informando a hora da primeira medição), "detalhe
indisponível" (com o motivo) e "produtor ainda não publica a série" (motivo
próprio), e em nenhum caso SHALL remover o bloco do DOM.

*Aceitação:* (a) eixo com 1 ponto renderiza a frase de apuração e nenhum gráfico;
com 2 pontos renderiza o gráfico; com 0 renderiza indisponível; (b) balde sem
medição interrompe o traço — não interpola, não desce a zero, e a tabela diz
"sem medição"; (c) nenhuma frase afirma conclusão, empate ou liderança a partir
de ausência de dado.

**RF-176 — Tabela completa para leitor de tela, com as duas bases**

WHEN o gráfico renderiza com dado, the system SHALL fornecer uma figura rotulada,
um SVG com papel de imagem descrito por uma tabela, e a tabela com uma linha por
ponto do eixo e duas colunas por candidatura (apurado e projeção), com as horas
formatadas em `America/Sao_Paulo`.

*Aceitação:* (a) a legenda da tabela nomeia escopo, janela, cadência, critério do
elenco e a natureza **não oficial** da projeção (constituição § 1); (b) a hora é
legível, nunca ISO cru — o gráfico existente imprime o ISO direto, que um leitor
de tela soletra por inteiro em cada linha; (c) ausência sai como "sem medição",
nunca "0%"; (d) os traçados internos são ocultos à árvore de acessibilidade;
(e) axe sem violação nas 4 rotas × 2 temas × 2 viewports.

## Requisitos Não-Funcionais

| RNF | Como esta spec o respeita |
|---|---|
| RNF-007a (bundle) | Server Component puro, SVG inline, sem lib de charting; alternância por CSS. Contribuição esperada: 0 B |
| RNF-023 (gráfico com tabela) | RF-176 |
| RNF-022 (contraste) | Cor por partido com ΔE76 ≥ 12 ([ADR-0031](../../architecture/adrs/0031-piso-separacao-entre-partidos.md)); destaque por espessura, nunca opacidade |
| RNF-024 (teclado) | O widget não tem foco próprio; o controle de visão é o do shell, já navegável |
| RNF-026 (movimento) | Zero animação — nada a zerar sob `prefers-reduced-motion` |
| RNF-002 (latência) | Nenhuma leitura nova no read path: UF reaproveita o `readUfDetail` do `Promise.all` existente; nacional viaja no payload que a página já lê |

## Telas

| Tela | Rota | Posição do bloco |
|---|---|---|
| T-01 | `/` | entre o painel de chances e o de redutos |
| T-03 | `/uf/[sigla]` | entre o painel de resultado e o de municípios |
| T-04 | `/uf/[sigla]/governador` | entre o painel de resultado e o de municípios |
| T-10 | `/uf/[sigla]/senador` | entre o painel de chances e o de metodologia |

Nunca acima do painel de resultado: o `<h1>` da página vive nele, e há teste de
contagem.

## Open questions

1. **Fixtures de simulação de governador e senador** — hoje só existe a de
   presidente (3,1 MB). Sem as irmãs, o widget aparece indisponível sob
   `pnpm dev:sim` justamente nas duas rotas que o dono mais vai querer revisar.
   Proposta: gerá-las apenas com as séries, sem o array de municípios, para não
   levar o diretório de fixtures a ~10 MB. **Aguarda decisão.**

1b. **Fase pré-eleição não é revisável em `pnpm dev:pre` fora da home.** Medido
   em 2026-09-17: `projection-current-pre.json` é importada **só** por
   `app/(pres)/page.tsx`. As demais rotas leem o nacional pelo reader, que em
   dev não tem chave semeada, então `isPreEleicao` responde `false` e o widget
   cai — corretamente — no estado "não sabemos". **O caminho de produção está
   certo e coberto por teste** nas três rotas de UF (nacional com `fase` ⇒
   `data-estado="antes-do-dia"`); o que falta é poder VER isso sem o Edge
   Config. Opções: (a) uma fixture pré por cargo, no mesmo portão de
   `NODE_ENV === "development"` que a da home já usa; (b) semear o Global
   Config de preview e revisar lá. **Aguarda decisão** — sem uma das duas, a
   revisão visual do estado do protótipo só acontece na home.
2. **Janela do eixo** — o protótipo mostra 17h→20h30. A janela é fixa a partir
   de 17h ou começa no primeiro boletim? Proposta: começa no primeiro boletim,
   porque uma janela fixa desenharia 45 minutos de linha reta fabricada antes do
   primeiro dado. **Aguarda decisão.**
3. **2º turno** — a série reinicia em 25/10 ou o eixo mostra as duas noites?
   Proposta: reinicia; são corridas diferentes com elencos diferentes.

## Riscos

| Risco | Mitigação |
|---|---|
| A migration não estar aplicada em produção antes de 04/10 — sem ela a base "apurado" não existe no dia | Fase 1 do plano é a primeira depois da entrega do estado vazio; gate na retro da sprint |
| O produtor usar o rank que já existe (ordena só por projetado) em vez do comparador de três chaves | RF-170(a) e teste T2 comparam contra o helper único |
| O widget ler o campo `cor` do payload e trocar de cor ao vivo numa ultrapassagem | RF-171 e teste T7, com asserção negativa sobre `--color-cand-` |
| **A Fase 3 derrubar a produção.** Em 2026-09-17 o site ficou 5h30 em 500 — todas as páginas — porque `lib/dev/simulacao.ts` montava caminho com `join(process.cwd(), …)` e o Turbopack traçou os 22.572 arquivos do repositório para dentro de cada função. **O build passou verde**, com o aviso apenas no log. A Fase 3 mexe exatamente nesse arquivo e no gerador de fixtures | Qualquer caminho novo montado ali usa `join(/*turbopackIgnore: true*/ process.cwd(), …)`; e antes de confiar em deploy verde, `grep` no log de build por `traced unintentionally`. Conferir a contagem em `.next/server/app/(pres)/page.js.nft.json` (esperado: ~124 arquivos, não milhares) |
| A série crescer sem teto e recusar a escrita no store na noite | RF-168 e ADR-0046 D2; teste de propriedade sobre o teto |

## Cross-refs

- [ADR-0046](../../architecture/adrs/0046-serie-por-candidato-limitada-por-construcao.md) — as cinco decisões de forma, volume, destino, elenco e cor
- [ADR-0032](../../architecture/adrs/0032-detalhe-municipal-vercel-blob.md) — a divisória que o 0046 emenda
- [ADR-0038](../../architecture/adrs/0038-dado-ts-hora-do-dado-nao-hora-do-calculo.md) — o eixo do tempo é a hora do boletim
- [ADR-0043](../../architecture/adrs/0043-fase-pre-eleicao-campo-proprio-nao-derivada.md) — a fase vem do campo, não da data
- [Spec 019](../019-fase-pre-eleicao/spec.md) — os três estados e a supressão pelo chamador
- [Spec 008](../008-interatividade-brushing/spec.md) — dona de qualquer interação futura no gráfico
