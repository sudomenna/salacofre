---
id: handoff-2026-09-20-seletor
title: Handoff 20/09 (4ª sessão) — 10 commits: contraste, o traço, o seletor no mapa, constituição v1.5 e SC 1.3.2 resolvido
date: 2026-09-20
supersedes: handoff-2026-09-20.md
status: current
baselines:
  vitest: 3556
  pytest: 626
  lint_arquivos: 530
commits: 10
empurrados: true
---

# Handoff 20/09 (4ª sessão) — o seletor Parcial/Projeção, e o que ele destravou

> Supersede [`handoff-2026-09-20.md`](./handoff-2026-09-20.md), que descreve as
> 19 entregas anteriores do mesmo dia e **continua válido para elas**.
> **Árvore limpa. Os 10 commits estão EMPURRADOS** — `origin/main` em `d1a9f16`+1.

| | antes | agora |
|---|---|---|
| vitest | 3.521 | **3.556** |
| pytest | 626 | **626** |
| lint | 522 | **530 arquivos** |

⚠️ O vitest sai com **10 arquivos falhando na COLETA** sem `DATABASE_URL` —
isso é o baseline, não regressão. A linha que importa é `Tests 3556 passed`.

**O fio que liga a sessão inteira**: três vezes a documentação afirmou uma
coisa e o código fazia outra — o comentário que dizia que a cor do mapa seguia
o seletor, o tipo que chamava `lider` de "líder no momento" quando ele carrega
projeção, e o RF que descrevia o traço ao contrário. Nos três casos eu
acreditei no texto antes de ler o que o alimentava, e nos três o defeito estava
no código havia dias. **Comentário não é código.**

🔴 **Verifique lint e typecheck pelo CÓDIGO DE SAÍDA, não filtrando o texto.**
Nesta sessão eu reportei "lint limpo" três vezes a partir de `grep` sobre a
saída, e uma delas estava errada — só o hook de pre-commit pegou. `pnpm lint
> /dev/null; echo $?`.

---

## Os nove commits

| # | commit | o que fez |
|---|---|---|
| 1 | `fe3a53d` | contraste do número do placar (2º turno) |
| 2 | `4774f96` | a barra é o apurado, o traço é a projeção |
| 3 | `b3029e8` | o mapa passa a seguir o seletor — e nunca seguia |
| 4 | `1b4dcfb` | este handoff, e um só `current` no repositório |
| 5 | `d1ced05` | **constituição v1.5** — emenda ao § 2 |
| 6 | `af6476f` | fotos do simulado + `pnpm sim:full` |
| 7 | `49ca45f` | SC 1.3.2 aceito e registrado |
| 8 | `845f099` | investigação do caminho (d) |
| 9 | `d1a9f16` | **SC 1.3.2 resolvido** — reordenação no DOM |
| 10 | (este) | conserto: constante cruzando a fronteira RSC |

### Os três primeiros

### `fe3a53d` — o número grande do placar deixa de ser pintado com cor de preenchimento

Fecha a **dívida 1**. O número `text-3xl` de `<CandidateBar>` usava
`colorForParty` (cor-base, de PREENCHIMENTO): PSOL media **2,08:1** contra o
piso de 4,5 do RNF-022. Agora o NÚMERO usa `textForParty` e a BARRA continua
na cor-base — preenchimento com extensão tem piso de 3:1 e o remédio dele é
contorno, não tinta.

⚠️ **Alcance: é a tela do 2º TURNO.** `<HeadlineScore>` só é renderizado no
ramo `mode === "binary"` (`app/(pres)/page.tsx:685,903-948`) — 25/10, ou um 1º
turno com exatamente 2 candidaturas. No 1º turno multi-candidato de 04/10 a
home usa `<ResultPanel>`. O relato inicial dizia "a porta de entrada do site";
estava errado.

Teste: `tests/unit/design-system/placar-contraste.test.tsx`.

### `4774f96` — a barra é sempre o apurado; o traço é a projeção

Decisão do dono, 2ª rodada do dia: *"Parcial = sem tracinho e Projeção
tracinho fica como o parcial é hoje"*.

| | barra | traço | números |
|---|---|---|---|
| **Parcial** | apurado | nenhum | só o parcial |
| **Projeção** | apurado | marca a projeção | parcial + projeção |

Desfaz a simetria de `3553f80` (mesma manhã), que consertava um defeito real
mas por construção deixava o traço DENTRO do preenchimento em metade dos
casos. Com um preenchimento só, o defeito original fica **inalcançável**.

O número projetado **sai do DOM** na visão Parcial (`data-view-only`, não
`data-view-cell`) — inclusive da árvore de acessibilidade, para o leitor de
tela não anunciar um número que a tela não mostra.

🔴 **Vão fantasma consertado junto**: `display: none` num item de grade colapsa
a faixa para 0px mas **o `column-gap` antes dela permanece** — 12px de
desalinhamento entre o número e a barra, medido em navegador. O template da
linha virou `var(--linha-faixas, ...)` e a cascata troca a variável. Nenhum
teste pegaria: `getBoundingClientRect()` devolve zero no happy-dom.

`RF-180` (spec 003) foi **reescrito** — ele exigia literalmente o oposto.

### `b3029e8` — o mapa passa a seguir o seletor, e nunca seguiu

🔴 **O achado mais grave do dia.** `resolveColor` escolhia a cor com
`parcial ? row.lider : top_candidatos[0].id`, e o comentário afirmava que eram
bases diferentes. **Não são.** `api/model/project.py:5033,5081,5266` grava as
duas pontas a partir do mesmo `ordered[0]`, ordenado por `pct_projetado`.
`row.lider === top_candidatos[0].id` em todo payload — o ternário escolhia
entre A e A.

Segundo braço: `margem_atual` e `margem_projetada` recebem a MESMA variável
(linhas 5267-5268). **A cor E a intensidade do mapa nunca responderam ao
seletor, em nenhum cargo.**

Conserto em `lib/utils/lider-por-base.ts` (ponto único):
`ordenarTopCandidatosPorBase`, `liderIdPorBase`, `margemPorBase` — derivam a
base parcial dos `top_candidatos[].pct_atual`, reaproveitando os comparadores
de `lib/utils/rank-parcial.ts`. Consumido por `resolveColor` (cor +
intensidade) e `buildHoverRows` (ordem do balão), o mesmo ponto nos dois.

Duas sutilezas: o **✓ de "chamada" segue a IDENTIDADE** do líder projetado, não
o índice 0 (senão trocar de base inventaria uma chamada que o modelo não fez);
e **`pct_atual` ausente não vira zero** — a ordem cai inteira na de projeção.

As docstrings de `EdgeUfRow.lider` e `.margem_atual` foram corrigidas: elas
afirmavam o contrário do que o produtor faz, e foi acreditar nelas que
produziu o defeito **e** o meu relato errado ao dono.

---

### `d1ced05` — constituição **v1.5**: a ordem pode seguir a base que o LEITOR escolheu

O `constitution-guard`, auditando o commit do mapa, achou que **a reordenação
da lista contraria o § 2** — *"nomes de candidatos aparecem sempre na mesma
ordem dentro de uma mesma corrida"*, texto nunca emendado desde a v1.0.

⚠️ **Não nasceu no commit do mapa.** Entrou em `290b8de` (decisão do dono do
mesmo dia), virou RF-181 numa spec **`shipped`**, e valia em quatro telas havia
um dia. O relatório do portão descreveu como novidade; não era.

Decisão do dono: **emendar**, não reverter. A v1.5 separa "ordem que o PRODUTO
escolhe" (segue proibida) de "ordem que reflete a métrica que o LEITOR
selecionou num controle explícito e reversível" (permitida), sob três condições
cumulativas. [ADR-0051](../architecture/adrs/0051-ordem-de-candidatos-segue-base-de-apuracao-selecionada.md).

As duas leituras restritivas já existentes (fase pré e identidade de
candidatura, ambas sem controle de base) ficaram **nomeadas dentro do próprio
§ 2**, para a exceção não ser ampliada depois.

🔴 **Colisão de versão resolvida**: o ADR-0031 (08/09) também propôs uma emenda
"1.4 → 1.5" — o piso ΔE76 ≥ 12 entre cores de partido — e **nunca foi aprovada
nem aplicada**. Renumerada para **1.5 → 1.6**, em três lugares. **Continua
pendente do dono.**

### `af6476f` — fotos do simulado, e `pnpm sim:full`

O dono viu a tela de Governador do RS com candidatura sem rosto. **100 de 180**
candidaturas a governador estavam sem `sqcand`, em 26 das 27 UFs — sempre as 3
primeiras com foto e o resto sem.

**Produção estava correta** (verificado no site publicado: as 6 do RS com foto
real). Era só a fixture, porque `governador-uf.json` era o único arquivo
produzido por um **script avulso** que deriva de outro arquivo em vez de
consultar o banco. Presidente 0/324 e Senador 0/285 — exclusivo do Governador.

🔴 **E o meu conselho de conserto quebrou 8 testes.** Disse "roda `pnpm sim`";
isso reescreve a base e **apaga a série da evolução da apuração**, que vem de
um script Python separado. O sinal estava no `git diff --stat` (arquivos de
município caíram a um terço), não numa mensagem de erro.

**`pnpm sim:full`** encadeia gerador → série → formatação. A formatação entrou
porque o gerador emite JSON que o `biome` reprova. `CLAUDE.md § 12` ganhou o
modo simulado, que **não estava no manual**.

### `49ca45f` + `845f099` + `d1a9f16` — SC 1.3.2, de aceito a resolvido no mesmo dia

A lista reordenava só na **pintura** (`order` de CSS): o documento ficava na
ordem da Projeção, e leitor de tela, teclado, `Ctrl+F` e **copiar-colar**
recebiam a lista fora de ordem. WCAG **SC 1.3.2, nível A**.

> **A explicação que funcionou**, depois de duas que não: *na base "Parcial",
> selecione a lista e cole num editor — vem na ordem da Projeção.* Verificação
> manual vale mais que descrição.

1. **`49ca45f`** — decisão (a): aceitar e registrar em `docs/nfr/accessibility.md`.
2. **`845f099`** — investigação do caminho (d), a pedido do dono. Os dois riscos
   eram menores: o React **não desfaz** reordenação imperativa (3 cenários
   medidos — a lista é Server Component e sua vdom nunca muda de ordem), e o
   foco **salta mesmo**, com conserto de 4 linhas.
3. **`d1a9f16`** — implementado, antecipando o que estava marcado para depois de
   04/10. `<ReordenaListaPorBase>`, **zero nó a mais e zero payload no
   cliente**: o dado já estava em cada `<li>` e o gatilho já existia. A regra de
   `order` saiu de `globals.css`.

🔴 **Dois defeitos de TESTE achados aí, e valem mais que o conserto:**

- **Os 22 casos de `ResultPanel.ordemPorBase.test.tsx` não pegavam o defeito.**
  Mediam as custom properties e a existência da regra CSS — a INTENÇÃO. Apaguei
  a regra inteira e os 22 continuaram verdes.
- **Eu fiz um teste passar pelo motivo errado.** O caso (d) lê `globals.css`
  com espaços normalizados, e minha primeira versão deixou a regra antiga
  **reproduzida no comentário** que explicava a remoção. Percebi por estranhar
  que nada quebrou. O caso foi **invertido**: agora guarda a AUSÊNCIA da regra,
  porque um `order` reintroduzido compõe com o DOM e cria uma terceira ordem.

**Seis mutações**, seis mortes. ⚠️ **Falta teste com leitor de tela real** — os
casos medem ordem de DOM e foco, provam o mecanismo, não a experiência.

---

## 🔴 O que ficou ABERTO

### 1. Os quatro portões de `CLAUDE.md § 9` NÃO rodaram no commit do mapa

✅ **RESOLVIDO ainda nesta sessão.** Os dois agentes travaram na 1ª tentativa
(watchdog, 600s). Na 2ª, com o **diff pronto num arquivo** em vez de mandá-los
abrir `_NationalChoroplethMapImpl.tsx` (1.549 linhas com docblocks enormes) —
que é a minha suspeita para os três travamentos do dia —, **os dois voltaram**:

- `a11y-perf-auditor`: **PASS**. Confirmou minha leitura de que não há SC 1.3.2
  no balão (lá a reordenação é no dado, não em CSS), remediu a exposição da
  dívida 4 do zero e chegou aos mesmos números. Corrigiu uma contagem minha:
  são **9** menções a `HexCartogramBrasil`, não 8 — o número 8 ficou escrito na
  mensagem de `b3029e8`, que já está empurrada.
- `constitution-guard`: achou o conflito do § 2, que virou a emenda `d1ced05`.
- `rf-coverage-checker`: achou que a cor do mapa **não tinha RF**. Nasceu o
  **RF-189**, e RF-177/RF-180/RF-030.1 foram corrigidos — descreviam o oposto
  do código, numa spec `shipped`.

⚠️ **`spec-syncer` não rodou.** Fiz as propagações à mão e validei cross-refs,
mas a varredura dele fica pendente.

**Lição de despacho**: agente que precisa ler arquivo gigante trava. Gere o
diff antes e aponte para ele.

### 2. O mapa municipal não pode seguir o seletor — falta DADO, não código

`EdgeUfMunicipio` tem `pct_apurado`, `lider` (apurado) e `votos_reportados`.
**Nenhum campo projetado.** Não existe projeção por município. As opções são
do dono: (a) aceitar e dizer isso na tela, ou (b) projetar por município —
trabalho de modelo em Python, campo novo no payload, e uma discussão de
método (município com poucas seções apuradas dá número instável).

**Não fabricar** projeção municipal por regra de três local nem rateando a da
UF — seria publicar número inventado (constituição § 1).

### 3. Líder apurado fora do corte TOP-N fica invisível

`top_candidatos` é o top 4 **por projeção**. Quem lidera os boletins mas não a
projeção está agregado em `row.outros`, sem id. Exigiria campo novo no
produtor. Candidato a tarefa de `model-validator`.

### 4. Dívida 4 ficou mais visível (medida, não estimada)

São **15 de 32** partidos com nível 1 abaixo de ΔE76 10 contra
`--map-uncounted`. Com a margem parcial real em jogo (nível 1 é `< 2pp`),
medido na fixture do simulado a 19,9% de apuração: **Governador vai de 0/27
para 3/27** UFs no tom mais claro; **Presidente melhora**, de 3/27 para 1/27;
**Senador não é afetado** (usa `margemSegundaVaga`, RF-104). Segue P2, não
bloqueia 04/10 — mas alguém VAI ver na noite.

### 5. Decisões do dono ainda pendentes

Ver [`../reference/dividas-tecnicas.md`](../reference/dividas-tecnicas.md):

- **dívida 2** — pares de Senador divergentes; depende da reimportação do TSE
  em 02–03/10, então decidir agora é decidir no escuro;
- **dívida 16** — a paleta `-text` passa com folga mínima. A regra nova, que é
  seguível sem régua: **`--surface-page` pode clarear, nunca escurecer**;
- **dívida 20** — três scripts de fixture ficaram **obsoletos** e continuam no
  disco sem aviso (`gerar-votos-pct-atual`, `gerar-outros`,
  `gerar-governador-uf`). Remover ou marcar;
- **a emenda do ADR-0031** — piso ΔE76 ≥ 12 entre cores de partido, proposta em
  08/09, **nunca aprovada**. Renumerada para 1.5 → 1.6. O § 2 hoje ainda não
  exige distância mínima entre as cores da paleta.

✅ **Fechadas nesta sessão**: dívida **1** (contraste do placar), **17**
(SC 1.3.2, resolvida de verdade) e **18** (o conflito do § 2, via emenda).
Dívida **4** ganhou causa e solução medidas — é **um número** no gerador
(baixar o L\* do nível 1 em 7 pontos), não o "redesenho de rampa" que a dívida
estimava em uma sessão de design.

### 6. Duas pontas soltas que não são deste trabalho

- **Worktree esquecido** em `.claude/worktrees/nice-kepler-1f19a8`: nenhum
  commit perdido, mas há uma edição **não commitada** que promove a spec 017
  (Deputado) a `shipped`, com texto pronto dizendo que o RF-127 fechou.
- Na visão Projeção, o número em **destaque** é o da projeção (o parcial
  recua), espelhando o ADR-0029 § 2. O print que motivou o pedido mostra o
  inverso; trocar é uma linha de cascata. **Escolha minha, não do dono.**
- **Teste com leitor de tela real** (NVDA/VoiceOver) — é o que fecha o SC 1.3.2
  de verdade. Os 8 casos novos medem ordem de DOM e foco: provam o mecanismo,
  não a experiência. Registrado em `accessibility.md § Validação` e na dívida
  17 para não virar "já foi testado".
- A **barra de maioria do topo** (`<VoteBar>`) continua trocando de conteúdo
  com a base. Não foi tocada.

---

## Erros meus nesta sessão, para não repetir

1. **Afirmei que a cor do mapa já seguia o seletor.** Li o comentário em cima
   da linha em vez do produtor que alimenta o campo. Duas fontes concordavam
   (o comentário e a docstring do tipo) e as duas estavam erradas.
2. **Contei 2, depois 3, eram 7 arquivos de teste** com o contrato antigo —
   conclusão tirada de log passado por `tail`, que corta os `FAIL` reais
   (o rodapé é das 10 falhas de coleta).
3. **Reportei "lint limpo" com o lint sujo** — `grep` sobre a saída em vez do
   código de saída.
4. **Errei duas vezes sobre `HexCartogramBrasil`**: disse que era usado em
   `/governador` (as ocorrências eram todas **comentário**) e contei 8 menções
   quando são 9 — esta segunda pega pelo `a11y-perf-auditor`, e o 8 ficou
   escrito na mensagem de `b3029e8`, já empurrada.
5. **Medi a exposição da dívida 4 aplicando a margem nova ao Senador**, que o
   código não faz (aquele cargo usa `margemSegundaVaga`). Refiz.

6. 🔴 **Quebrei a tela do dono com uma constante.** Exportei `ATRIBUTO_LISTA`
   de um módulo `"use client"` e importei no Server Component. O Next
   converte TODA exportação de módulo cliente em referência remota —
   **inclusive uma string** —, e o stub virou o nome do atributo da `<ol>`:
   três erros no navegador e a lista sem reordenar. **Nenhum teste podia
   pegar** (no vitest não há fronteira RSC), `pnpm build` passava, e eu
   commitei e empurrei. **Quem viu foi o dono, na tela.** Regra: valor
   compartilhado entre servidor e cliente mora em módulo SEM diretiva.
7. **Declarei o conserto pronto medindo na UF errada.** Testei no RS, onde as
   duas ordens COINCIDEM — o teste não podia falhar nem funcionando. Só no AC,
   onde divergem, a medição discrimina. Mesma família do "teste que não
   discrimina", agora na verificação manual.
8. **Aconselhei `pnpm sim` e quebrei 8 testes.** A fixture é montada por uma
   CADEIA; rodar só o primeiro elo apaga a série. Virou `pnpm sim:full`.
9. **Fiz um teste passar pelo motivo errado.** Removi a regra de `order` de
   `globals.css` e deixei a regra antiga **reproduzida no comentário** — o
   teste, que normaliza espaços, continuou achando a string apagada. Percebi
   por estranhar que nada quebrou.
10. **Reescrevi `index.json` com `json.dumps` e reformatei 476 linhas** para
   mudar uma. Desfeito e refeito como edição de texto: 9 linhas. Diff que
   ninguém consegue revisar é diff que esconde.
11. **Disse que a sessão do dono tinha apagado a série**, sem conferir antes.
    Ela estava lá. Rodei o script mesmo assim (inofensivo), mas a afirmação
    estava errada.

**O padrão**: 11 erros, 11 medições que tinham FORMA de resposta.
**Comentário não é código; resumo não é lista; filtro de texto não é código de
saída; e um arquivo já lido não dispensa reler antes de afirmar.**

⚠️ Três desses (2, 3, 8) são a MESMA falha em roupas diferentes: **confiar
numa leitura filtrada da saída**. O antídoto que passou a valer nesta sessão:
`pnpm lint > /dev/null; echo $?` para veredito, e `grep -E "^ FAIL"` com
`grep -v "\[ tests"` para saber QUAIS testes caíram.

---

## O que uma sessão nova deve fazer primeiro

1. **`spec-syncer`** — é o único dos portões que não rodou. As propagações
   foram feitas à mão (RF-189 criado, RF-177/180/030.1 corrigidos, matriz
   sincronizada, cross-refs validadas), mas sem a varredura dele.
2. **Ler `docs/reference/dividas-tecnicas.md`** — 20 itens, 4 fechados hoje.
   As decisões que esperam o dono estão no § 5 acima.
3. **Não rodar `pnpm sim` sozinho.** É `pnpm sim:full`, e o `CLAUDE.md § 12`
   agora explica por quê.
