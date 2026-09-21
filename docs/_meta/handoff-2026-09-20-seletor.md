---
id: handoff-2026-09-20-seletor
title: Handoff 20/09 (4ª sessão) — 3 commits: contraste do placar, o traço da barra e o seletor no mapa
date: 2026-09-20
supersedes: handoff-2026-09-20.md
status: current
baselines:
  vitest: 3546
  pytest: 626
  lint_arquivos: 527
commits: 3
empurrados: true
---

# Handoff 20/09 (4ª sessão) — o seletor Parcial/Projeção

> Supersede [`handoff-2026-09-20.md`](./handoff-2026-09-20.md), que descreve as
> 19 entregas anteriores do mesmo dia e **continua válido para elas**.
> **Árvore limpa. Os 3 commits estão EMPURRADOS** — `origin/main` em `b3029e8`.

| | antes | agora |
|---|---|---|
| vitest | 3.521 | **3.546** |
| pytest | 626 | **626** |
| lint | 522 | **527 arquivos** |

⚠️ O vitest sai com **10 arquivos falhando na COLETA** sem `DATABASE_URL` —
isso é o baseline, não regressão. A linha que importa é `Tests 3546 passed`.

🔴 **Verifique lint e typecheck pelo CÓDIGO DE SAÍDA, não filtrando o texto.**
Nesta sessão eu reportei "lint limpo" três vezes a partir de `grep` sobre a
saída, e uma delas estava errada — só o hook de pre-commit pegou. `pnpm lint
> /dev/null; echo $?`.

---

## Os três commits

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

## 🔴 O que ficou ABERTO

### 1. Os quatro portões de `CLAUDE.md § 9` NÃO rodaram no commit do mapa

Dois agentes (`constitution-guard`, `a11y-perf-auditor`) foram despachados e
**travaram sem produzir relatório** (watchdog, 600s). Medi eu mesmo as três
perguntas específicas que tinha — estão no corpo do commit `b3029e8`. **A
varredura ampla da constituição e de a11y sobre esse commit continua
pendente.** É a primeira coisa a fazer na próxima sessão.

Os portões do `fe3a53d` e do `4774f96` **rodaram e passaram**.

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
**dívida 2** (pares de Senador divergentes — depende de reimportação do TSE em
02–03/10), **dívida 16** (a paleta `-text` passa com folga mínima; a regra
nova é "`--surface-page` pode clarear, nunca escurecer") e **dívida 17** (ordem
visual × ordem do DOM, SC 1.3.2 — a maior dívida de a11y aberta).

⚠️ A dívida **1 foi fechada** nesta sessão.

### 6. Duas pontas soltas que não são deste trabalho

- **Worktree esquecido** em `.claude/worktrees/nice-kepler-1f19a8`: nenhum
  commit perdido, mas há uma edição **não commitada** que promove a spec 017
  (Deputado) a `shipped`, com texto pronto dizendo que o RF-127 fechou.
- Na visão Projeção, o número em **destaque** é o da projeção (o parcial
  recua), espelhando o ADR-0029 § 2. O print que motivou o pedido mostra o
  inverso; trocar é uma linha de cascata. **Escolha minha, não do dono.**
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
4. **Disse que `HexCartogramBrasil` era usado em `/governador`.** As
   ocorrências eram todas em **comentário**; nenhuma página o importa.
5. **Medi a exposição da dívida 4 aplicando a margem nova ao Senador**, que o
   código não faz (aquele cargo usa `margemSegundaVaga`). Refiz.

**O padrão**: cinco erros, cinco medições que tinham FORMA de resposta.
Comentário não é código; resumo não é lista; filtro de texto não é código de
saída.
