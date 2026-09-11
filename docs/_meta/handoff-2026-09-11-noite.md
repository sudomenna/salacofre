---
title: Handoff — 2026-09-11, segunda sessão (noite)
description: Cinco defeitos silenciosos fechados, os cargos novos destravados, e as três correções ao handoff da manhã
status: stable
date: 2026-09-11
branch: main
supersedes: handoff-2026-09-11.md
---

# Handoff — 2026-09-11, segunda sessão

## Estado em uma frase

A entrega dos resultados ao site **voltou a existir** — o endereço para onde o
modelo publicava nunca foi roteável —, Senador e Deputado Federal saíram do papel
(ingestão, specs, ADR das cadeiras, módulo de cálculo), e o risco da fatia por
município ganhou um caso real de teste e um comando para o dia 15.

**Faltam 4 dias para o simulado 1 e 23 para o 1º turno.**

## Três correções ao handoff da manhã

O handoff anterior (`handoff-2026-09-11.md`) tem três afirmações que não batem
com o disco. Confira sempre — inclusive isto aqui.

1. **"Decidir se a spec 001 fecha" não era uma decisão.** Ela já está
   `status: shipped` (`docs/specs/001-ingestao-tse/spec.md:4`) e a própria sprint
   a lista sob "Evolving em regime shipped". Não havia portão a abrir.
2. **O `EDGE_CONFIG_TOKEN` não bloqueava o Blob, o painel municipal nem o gate de
   a11y.** Aquilo era outro defeito, descrito abaixo. O token destrava **uma**
   coisa: a gravação no Global Config.
3. **As specs 016 e 017 não existiam** — nunca foram commitadas em branch nenhum.
   Nem o ADR-0027. O que existia era só o ADR-0026.

## Os cinco defeitos que não davam erro

Mesma família dos três de 10/09. Nada quebra, só não acontece.

| # | Defeito | Consequência | Fechado em |
|---|---|---|---|
| 1 | `app/api/_internal/edge-write/route.ts` sob **private folder** do App Router (prefixo `_`) — 404 em todo ambiente | **Nenhuma** gravação no Global Config ou no Blob jamais ocorreu, em nenhum ambiente. No dia D o site não mostraria nada novo. | `0b858b5` |
| 2 | `MODEL_SECRET` ausente do `.env.local` | Trigger do modelo, edge-write e a rota interna pulados em silêncio (`ingest-handler.ts:702`, `project.py:3259`, `edge-write/route.ts:165`) | `.env.local` local |
| 3 | Abort de `listIngestTargets` não fechava o lock anti-overlap | Falha transitória custaria **6 ciclos** em vez de 1, no dia D | `0b858b5` |
| 4 | Teto de requisições de 40 rps mantido ao acrescentar 2 cargos | Pico de **160 rps** contra o teto de 100 do TSE → bloqueio de IP de 10 min. **Introduzido por mim hoje**, no `9ee5871`, e achado ao refazer a conta do § 1 | `e40fe8f` |
| 5 | `opts?.cargo ?? "pres"` no reader | O ADR-0028 mandou tirar o default vindo do calendário; troquei por um literal e o footgun ficou de pé. Achado MEDIUM do `constitution-guard` | `dba4eb7` |

O defeito 1 é o de primeira grandeza. A causa raiz está documentada no próprio
arquivo: o autor tratou `_internal` como **convenção de nome** ("Vercel não filtra
automaticamente"), e o Next filtra — removendo a rota inteira do roteamento.
Medido com duas rotas idênticas: `/api/zzdiag` → 200, `/api/_zzdiag/sub` → 404.

**Verificado depois da correção**, ciclo MG cargo 3 contra o mock: 898 pares
ingeridos, 0 notFound, 0 rateLimited; `merge_pairs_into_zonas` somou 898 linhas
em 304 zonas (242 multi-município); `edge-write ok status=200` pela primeira vez;
`blob write ok municipios/uf/MG/gov/t1.json` 175.037 bytes; `/uf/MG/governador`
renderizando o painel com Belo Horizonte em 1º e **Uberaba** presente — um dos
municípios que o ADR-0035 media como estruturalmente invisíveis.

## O risco da fatia por município — o que mudou

**Continua sem prova, mas com quatro linhas de evidência convergentes.** A nova:
`votacao_partido_munzona` dá **6.102 pares** contra **2.636 zonas**, o mesmo nos
dois anos (2018 e 2022), e o TSE declara **6.083** arquivos de zona por cargo —
0,3% dos pares e 2,3× o número de zonas. O que o documento chama de "zonas" são
pares. Não é prova porque o `cdabr` de um arquivo de zona não carrega município:
dois pares da mesma zona seriam indistinguíveis pelo conteúdo.

**Duas ferramentas novas:**

- **`pnpm verify-fatia-premise`** (`scripts/verify-fatia-premise.ts`) automatiza o
  Passo 0 do simulado. Zero requisições — opera sobre arquivos já baixados à mão.
  exit 0 = fatia · exit 2 = multiplicação, pare · exit 1 = inconclusivo.
  Validado nos três desfechos.
- **Fixture real de MG zona 4** (`tests/fixtures/model/mg-zona-4-pares-2022.json`),
  6 municípios, 2º turno de 2022. As fatias somam PT 19.152 / PL 9.391, e o total
  da zona em `historical_results` — **fonte independente** — é exatamente isso.
  A fixture separa `total_zona_historical_results` de
  `total_zona_recalculado_da_entrada` de propósito: assertar contra a soma da
  entrada seria tautológico, o mesmo defeito que o gate OT-4 já teve.

## Senador e Deputado — o que entrou

**Destravado** (ADR-0028, `accepted` desde 07/09 e nunca implementado):
`currentRace` → `currentPresidentialRace`, `currentTurno` →
`currentPresidentialTurno`, `currentCargo` removida, e o reader deixou de derivar
cargo do calendário.

**`lib/config/cargos.ts`** — a tabela canônica que não existia. Antes, o
conhecimento de cargo estava em quatro lugares independentes, todos `1 | 3`.
Agora: código TSE, token de chave, slug de rota, rótulo, vagas por UF, 2º turno,
arquivo `br-`, proporcional, granularidade e teto de rps.

**Ingestão**: 6.110 alvos para Presidente e Governador (zona), **27** para Senador
e Deputado (UF), medido. Crons por segmento de rota — ⚠️ isso **emenda o ADR-0026
item 1**, que previa `?cargos=5`; query string em `path` de cron não existe na
Vercel.

**`p_eleito`** (`api/model/p_vitoria.py`) — probabilidade de terminar entre as N
vagas. Com 1º em 40%, 2º em 30% e 3º em 29%, `p_vitoria` dá ao terceiro **0,46%**
e `p_eleito` com 2 vagas dá **41%**. É a diferença entre dizer que a disputa
acabou e dizer que é cara ou coroa.

**ADR-0027 + `api/model/cadeiras.py`** — o método de cadeiras. Duas correções de
premissa registradas: os artigos estão no **Código Eleitoral**, não na Lei 9.504
como o ADR-0026 cita; e o **art. 111 foi declarado inconstitucional** (ADI 7228) —
implementá-lo ao pé da letra dá resultado errado. Conferido no Planalto.

## Lições desta sessão

1. **Conferir o próprio trabalho, não só o dos agentes.** Dos cinco defeitos, dois
   foram **meus**, feitos nesta sessão: o teto de 160 rps e o default literal no
   reader. O primeiro eu achei sozinho, refazendo a conta do § 1; o segundo veio
   do `constitution-guard`. O padrão: mudança que parece local (acrescentar dois
   cargos) altera uma invariante global (o teto agregado do IP).
2. **Teste que passa não prova nada — teste que reprova, sim.** Quatro vezes nesta
   sessão um teste meu não discriminava: a invariante da soma do `p_eleito` (não
   pegava pareamento quebrado), e dois cenários do módulo de cadeiras (davam o
   mesmo resultado nas duas hipóteses). As guardas que eu mesmo pus ("teste sem
   poder") pegaram os dois últimos. **Verifique por mutação.**
3. **Não rode `constitution-guard` em paralelo com um agente de implementação no
   mesmo working tree.** O guard fez `git stash`/`pop` durante o trabalho do
   `spec-implementer`. Nada se perdeu (conferido: stash vazio, sem marcadores de
   conflito, typecheck limpo), mas foi sorte.
4. **`*/5` dentro de comentário JSDoc fecha o bloco.** Escrevi cadência de cron em
   comentário e o formatador destruiu dois blocos inteiros ao tentar formatar o
   código quebrado. Escrever em prosa.

## Tarefas do usuário

- **Chamado no TSE — prazo 12/09, amanhã.** `pnpm tse:watch --once` às 06:49:
  `changed=false`, nenhum dos 10 alvos mudou, `ele-c.json` segue em `ele2024`.
- **`EDGE_CONFIG_TOKEN`** — escopo do time. Destrava **só** a gravação no Global
  Config. Ver a correção 2 no topo.

## Pendências abertas

- **Golden de cadeiras de 2022** (spec 017 RF-126, gate de 19/09) — o módulo está
  pronto com 21 testes de caso de borda, mas falta o dado: o CSV no disco é por
  partido e a conta precisa por candidato. ⚠️ O gabarito tem de ser o
  **recalculado** pós-ADI 7228.
- **Piso de 20% na 2ª fase**: "candidato" ou "candidato não eleito"? Sem
  jurisprudência. Travar com fixture do simulado 2.
- **Limitador coordenado entre invocações** — buckets independentes garantem a
  média, não o pico. Decidir com `rateLimited` medido.
- **Gate de performance** — não avaliável em dev; precisa de `pnpm build && pnpm start`.
- **Spec 016 em implementação** quando esta sessão fechou.

## Comandos

```bash
set -a; . ./.env.local; set +a
pnpm typecheck && pnpm lint && pnpm test
.venv-model/bin/python3.14 -m pytest -q
pnpm verify-fatia-premise --fixtures tests/fixtures/tse/2026-sim   # Passo 0 do dia 15
pnpm list-targets --env production --cargo 5    # 27; exige TSE_COD_ELEICAO
pnpm replay-2022 --dataset tests/fixtures/replay-2022/snapshots.json \
                 --ground-truth tests/fixtures/replay-2022/ground-truth.json
```
