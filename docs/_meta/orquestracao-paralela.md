---
title: Orquestração Paralela — quem colide com quem
description: Escopo de escrita dos 9 subagents, matriz de colisão, gargalos de serialização e o molde de ondas
status: stable
last_updated: 2026-09-18
---

# Orquestração Paralela — quem colide com quem

## Por que este arquivo existe

Três documentos cobrem delegação neste repositório, e nenhum cobre **colisão**:

| Documento | O que responde | O que **não** responde |
|---|---|---|
| [`../../CLAUDE.md`](../../CLAUDE.md) § 1, § 5, § 6 | **Quando** delegar, **como** escrever o briefing, padrões de orquestração por cenário | quais despachos simultâneos se atropelam |
| [`../../AGENTS.md`](../../AGENTS.md) § 5 | **O que** o subagent não pode fazer | idem |
| `.claude/agents/<nome>.md` | O que **cada** agente faz, isoladamente | idem |

**Ninguém diz o que colide com o quê.** É esse vão que este arquivo preenche.

Ele é material de **consulta** — abre-se antes de montar uma onda de despachos paralelos, não todo
dia. Por isso não mora no `CLAUDE.md`, que é leitura de entrada do orquestrador em todo turno.

> **Dados verificados em 18/09/2026** lendo `.claude/agents/*.md` diretamente. Onde este arquivo cita
> uma ferramenta ou um escopo, a evidência é o frontmatter ou a linha citada — não memória de
> sessão.

---

## 1. Escopo por agente

Os nove agentes de `.claude/agents/`, com o que o frontmatter **declara** e os diretórios que o corpo
do system prompt manda tocar.

| Agente | Modelo | `tools:` declaradas | Escreve? | Diretórios que toca |
|---|---|---|---|---|
| `spec-implementer` | opus | **nenhuma declarada** → herda todas | ✅ escritor | `lib/`, `components/atoms/`, `components/blocks/`, `app/`, `tests/`, `docs/specs/<NNN>/` (cria `tasks.md`), `docs/_meta/` |
| `spec-syncer` | haiku | Read, Edit, Write, Bash, Grep, Glob | ✅ escritor | `docs/specs/<NNN>/`, `docs/_meta/traceability.md`, `docs/_meta/index.json`, `docs/README.md`, `docs/design-system/components.md`, **`CLAUDE.md`** |
| `adr-author` | sonnet | Read, Write, Edit, Grep, Glob — **sem Bash** | ✅ escritor | `docs/architecture/adrs/`, `docs/_meta/index.json`, frontmatter `adrs:` das specs afetadas |
| `map-builder` | sonnet | Read, Write, Edit, Bash, Grep, Glob | ✅ escritor | `components/atoms/maps/`, `components/blocks/`, **`tests/e2e/maps/`**, `data-pipeline/` (PMTiles/tippecanoe), `lib/utils/` |
| `model-validator` | sonnet | Read, Write, Edit, Bash, Grep, Glob | ✅ escritor | `lib/model/`, `scripts/replay-2022.ts`, `api/model/project.py`, `docs/testing/replay.md` — **e o banco** |
| `tse-parser-builder` | sonnet | Read, Write, Edit, Bash, Grep, Glob, **WebFetch** (único) | ✅ escritor | `lib/tse/`, `app/api/ingest/`, `tests/fixtures/tse/`, `docs/reference/` — **e o banco** |
| `a11y-perf-auditor` | sonnet | Read, Bash, **Edit**, Grep, Glob | ⚠️ escritor disfarçado | `app/`, `components/`, **`tests/e2e/`** (`a11y-perf-auditor.md:70-71`: "escrever um spec rápido se não houver") |
| `constitution-guard` | sonnet | Read, Bash, Grep, Glob | ❌ read-only puro | — (lê `app/`, `components/`, `lib/`, configs) |
| `rf-coverage-checker` | haiku | Read, Bash, Grep, Glob | ❌ read-only puro | — (lê `docs/specs/`, `docs/_meta/`, `tests/`) |

Duas leituras que valem o tempo:

- **`spec-implementer` não declara `tools:`.** O frontmatter tem `name`, `description` e `model` — e
  nada mais. Sem declaração, herda **todas** as ferramentas, inclusive a de despachar outros agentes
  (§ 7). É o único da lista nessa condição.
- **`a11y-perf-auditor` tem `Edit`.** Não é portão puro. Tem `Bash` também, então na prática pode
  criar arquivo mesmo sem `Write`.

---

## 2. Matriz de colisão

Pares que **não** podem rodar na mesma onda, cada um com o recurso em disputa.

| Par | Recurso em disputa | Por quê |
|---|---|---|
| `spec-implementer` × **qualquer outro escritor** | quase tudo | Sem `tools:` declaradas e com escopo `lib/` + `components/` + `app/` + `tests/` + `docs/specs/`, ele é **superconjunto** de quase todos os outros. Despachá-lo junto de outro escritor é apostar que os dois não se cruzam. |
| `adr-author` × `spec-syncer` | `docs/_meta/index.json` | Ambos escrevem o mesmo arquivo: `adr-author.md:78` ("atualize `index.json` adicionando entrada no array `adrs`") e `spec-syncer.md:22`. Edit concorrente em JSON não faz merge — o segundo sobrescreve o retrato que leu. |
| **duas instâncias de `adr-author`** | a numeração de ADR | `adr-author.md:75` manda "liste ADRs existentes com `ls docs/architecture/adrs/`, pegue o maior número, incremente". Duas instâncias leem o mesmo diretório e chegam ao mesmo número. Resultado: dois ADRs disputando o mesmo `NNNN`, um deles sobrescrevendo o outro no disco. |
| **duas instâncias de `spec-syncer`** | arquivos globais | `traceability.md`, `index.json`, `README.md`, `CLAUDE.md`. Mesmo problema, quatro vezes. |
| `map-builder` × `a11y-perf-auditor` | `tests/e2e/` | `map-builder.md:184` cria `tests/e2e/maps/<file>.spec.ts`; `a11y-perf-auditor.md:70-71` escreve `tests/e2e/a11y.spec.ts` se não existir. Arquivos diferentes hoje, mesma árvore — e o auditor roda `playwright test` enquanto o outro escreve dentro dela. |
| `tse-parser-builder` × `model-validator` | ⚠️ **o banco, não um arquivo** | O validador exige a tabela `snapshots` **estável** para o replay; o parser faz INSERT nela durante os ciclos de ingestão. Nenhum `git status` mostra esta colisão. É a única da lista invisível no disco. |

### O caso especial do banco

`DATABASE_URL` de `.env.local` é **produção** — o banco que vai guardar a apuração de 04/10. Qualquer
onda com dois agentes que tocam o banco herda, além da colisão entre eles, o risco documentado em
[`../../CLAUDE.md`](../../CLAUDE.md#12-comandos-úteis) § 12 (`ALLOW_DB_WRITE_TESTS`). Onda com
`tse-parser-builder` **e** `model-validator` é onda de um agente só, executada duas vezes.

---

## 3. Os cinco gargalos de serialização

Recursos com **um escritor por vez**, sempre. Qualquer despacho que escreva num deles exige **onda
exclusiva** — nada mais escrevendo ao mesmo tempo, nem no mesmo arquivo nem em outro.

| Gargalo | Quem escreve | Modo de falha |
|---|---|---|
| `docs/_meta/index.json` | `spec-syncer`, `adr-author`, `spec-implementer` | JSON não tem merge textual: o segundo a gravar apaga a entrada do primeiro sem conflito visível |
| [`traceability.md`](./traceability.md) | `spec-syncer`, `spec-implementer` | matriz grande, edições em linhas próximas; um RF some sem ninguém notar |
| [`../README.md`](../README.md) | `spec-syncer` | tabela de specs — mesma linha para duas specs diferentes |
| [`../../CLAUDE.md`](../../CLAUDE.md) | `spec-syncer` (`spec-syncer.md:25`, "stats agregadas") | é o arquivo que **todo** turno seguinte lê; corrompê-lo contamina toda sessão posterior |
| numeração de ADR (`docs/architecture/adrs/`) | `adr-author` | não é arquivo, é um **contador derivado do diretório**; duas leituras simultâneas dão o mesmo número |

⚠️ A numeração de ADR tem uma armadilha a mais, e ela já mordeu: **não passe o número ao subagent**.
Um número de sequência medido 7 minutos antes já pode ser falso. Mande o agente calculá-lo do
diretório no instante em que for criar o arquivo — e ainda assim, um por onda.

---

## 4. O molde de ondas

Três ondas, nesta ordem. Dentro de cada onda, paralelo; entre ondas, barreira.

```
ONDA 1 — construir      2–3 escritores com escopos DISJUNTOS
                        (ex.: map-builder × tse-parser-builder)
        ──────────── barreira: todos retornaram ────────────
ONDA 2 — auditar        os read-only puros, em paralelo
                        constitution-guard + rf-coverage-checker
        ──────────── barreira: todos retornaram ────────────
ONDA 3 — sincronizar    spec-syncer SOZINHO
```

Regras do molde:

1. **Onda 1 precisa de escopos disjuntos provados**, não presumidos. Antes de despachar, cruze os
   diretórios da tabela § 1. Se houver interseção, são duas ondas.
2. **`spec-implementer` ocupa a onda 1 inteira.** Escopo superconjunto = onda de um.
3. **Onda 3 é sempre de um agente.** É onde vivem quatro dos cinco gargalos do § 3.
4. ⚠️ **`a11y-perf-auditor` não é portão puro.** Tem `Edit` e escreve em `tests/e2e/`. Ou entra na
   onda 2 **depois** que a onda 1 fechou de fato, ou é tratado como escritor e vai para a onda 1 —
   nunca "junto com o resto porque é só auditoria".
5. **A barreira é literal**: espere o retorno, não o "deve estar quase". E leia o retorno (§ 7).

O padrão § 6.1 do [`../../CLAUDE.md`](../../CLAUDE.md) é este molde aplicado ao ciclo de uma spec;
aqui está a regra que o sustenta.

---

## 5. Pares seguros em paralelo

Combinações com escopo comprovadamente disjunto, verificadas contra a tabela § 1:

| Par | Por que é seguro |
|---|---|
| `constitution-guard` × **qualquer coisa** | read-only puro: `Read, Bash, Grep, Glob`, sem `Edit`/`Write` |
| `rf-coverage-checker` × **qualquer coisa** | idem |
| `map-builder` × `tse-parser-builder` | `components/atoms/maps/` + `tests/e2e/maps/` vs. `lib/tse/` + `app/api/ingest/` + `tests/fixtures/tse/` — zero interseção |
| `map-builder` × `model-validator` | frontend de mapa vs. `lib/model/` + `scripts/replay-2022.ts`; o mapa não toca o banco |
| `tse-parser-builder` × `adr-author` | código vs. `docs/architecture/adrs/`; o parser não escreve ADR, o autor de ADR não tem `Bash` |

⚠️ Nenhum destes pares pode virar trio adicionando um terceiro escritor sem refazer o cruzamento —
segurança de par não é transitiva.

---

## 6. As lacunas — o que nenhum agente cobre

Seis áreas sem dono entre os nove agentes:

| Área | Por que ninguém cobre |
|---|---|
| Variáveis de ambiente e segredos na Vercel | trabalho de console, não de arquivo |
| Alarmes e monitoramento | [`../operations/alerts.md`](../operations/alerts.md) descreve; ninguém opera |
| Teste de carga | [`../testing/load.md`](../testing/load.md) especifica; ninguém executa |
| Backup de banco (snapshot Neon) | item do checklist pré-prod sem executor |
| Página estática de manutenção | spec 013, sem agente correspondente |
| CI (GitHub Actions) | `.github/workflows/` fora do escopo de todos os nove |

### Decisão de 18/09 — não criar agentes novos para estas seis

**Cinco das seis são tarefas de uma vez só.** Configurar env var na Vercel, ligar backup, publicar a
página de manutenção, rodar o teste de carga e ajustar o CI acontecem uma vez e ficam. Criar um
agente custa escrever o system prompt, mantê-lo em dia com o repositório e revisar o que ele devolve
— mais caro que executar a tarefa. A única com cara de recorrência é alarme/monitoramento, e ela é
trabalho do **dia D**, coberto por [`../sprints/_D1-04out2026.md`](../sprints/_D1-04out2026.md) e
pelo [runbook](../operations/runbook.md), não por delegação.

Consequência prática: estas seis são feitas pelo orquestrador ou pelo dono, diretamente. Se alguma
delas aparecer recorrentemente em três sessões distintas, reabrir a decisão.

---

## 7. Armadilhas medidas

Cada uma custou tempo real.

### 7.1. Subagent não despacha subagent — a orquestração é de uma camada só

[`../../AGENTS.md`](../../AGENTS.md) § 5.1: *"Não despacha outros subagents. Despachar é função do
orquestrador."* Isto não é preferência de estilo — é **o que limita todo o desenho deste arquivo**.
Não há árvore de agentes, só uma estrela: orquestrador no centro, uma camada de executores em volta.
Toda a análise de ondas acima existe porque o orquestrador é o único ponto onde a serialização pode
ser imposta.

### 7.2. ⚠️ Contradição no repositório — quatro agentes mandam delegar

Quatro system prompts instruem o agente a delegar, o que colide frontalmente com § 5.1 do
`AGENTS.md`:

| Arquivo:linha | Texto |
|---|---|
| `.claude/agents/spec-implementer.md:89-92` | "Delegue checagens proativas: **constitution-guard**… **a11y-perf-auditor**… **rf-coverage-checker**" (Fase 5) |
| `.claude/agents/spec-implementer.md:100` | "Delegue para **spec-syncer** atualizar `traceability.md`, `index.json`, `README.md`" (Fase 6) |
| `.claude/agents/spec-implementer.md:105` | "delegue para **adr-author** depois" |
| `.claude/agents/map-builder.md:197-198` | "Delegar a a11y-perf-auditor…" / "Delegar a constitution-guard…" |
| `.claude/agents/tse-parser-builder.md:118` | "Re-rode replay 2022 (delegue a **model-validator**)" |
| `.claude/agents/tse-parser-builder.md:134-135` | "Delegar a constitution-guard…" / "Delegar a spec-syncer…" |
| `.claude/agents/rf-coverage-checker.md:66,69` | "delegue ao **model-validator**" / "delegue ao **a11y-perf-auditor**" |

Na prática, só o `spec-implementer` tem ferramenta para despachar — por não declarar `tools:` (§ 1).
Os outros três leem "delegue" e não têm como; no melhor caso viram sugestão no relatório final, que
é o que o `AGENTS.md` § 5.1 manda fazer.

**Esta contradição fica registrada, não resolvida.** Decidir se o `spec-implementer` mantém o
privilégio (e os outros trocam "delegue" por "sugira") ou se ele também passa a declarar `tools:`
sem despacho é **decisão do dono**, não de quem escreve documentação.

### 7.3. Relatório de agente é hipótese, não fato

Um agente que devolve relatório está afirmando o que **acredita** ter feito. Confira no disco:
`git status`, `git diff`, e leitura dos arquivos citados. Isso vale nos dois sentidos — nesta sessão
(18/09) um subagent corrigiu um número do orquestrador, e o orquestrador corrigiu dois de subagents.

Duas classes distintas de erro, e elas exigem verificações diferentes:

- **Forma em vez de conteúdo** — o relatório descreve a forma certa com o conteúdo errado. Pega-se
  aplicando a mutação você mesmo.
- **Retrato velho** — a afirmação era verdadeira quando foi medida e não é mais. Em trabalho
  paralelo, confira também a **idade** da sua própria base: os outros agentes escreveram no disco
  desde que você leu.

### 7.4. Nunca `git checkout -- <arquivo>` com trabalho de outro agente na árvore

Ao desfazer uma mutação de teste — ou qualquer edição temporária — `git checkout -- <arquivo>`
descarta **tudo** que não está commitado naquele caminho, inclusive o que outro agente acabou de
escrever ali. Um agente quase apagou **575 linhas** de outro exatamente assim.

O procedimento seguro:

```bash
cp <arquivo> "$SCRATCHPAD/<arquivo>.antes"    # cópia no diretório de rascunho
# ... aplica a mutação, roda o teste, mede ...
cp "$SCRATCHPAD/<arquivo>.antes" <arquivo>    # restaura da cópia, não do git
diff "$SCRATCHPAD/<arquivo>.antes" <arquivo>  # prova: saída vazia
```

A restauração se **prova com `diff`**. "Restaurei" sem diff é a mesma classe de afirmação do § 7.3.

---

## Cross-refs

- Quando delegar e como escrever o briefing: [`../../CLAUDE.md`](../../CLAUDE.md) § 1, § 5, § 6
- Contrato universal do subagent: [`../../AGENTS.md`](../../AGENTS.md) § 5
- Convenções de documentação (cross-refs, frontmatter): [`./conventions.md`](./conventions.md)
- Matriz RF ↔ Spec ↔ Componente ↔ Teste: [`./traceability.md`](./traceability.md)
- Princípios não-negociáveis: [`../constitution.md`](../constitution.md)
- System prompts: `.claude/agents/<nome>.md` (9 arquivos)
