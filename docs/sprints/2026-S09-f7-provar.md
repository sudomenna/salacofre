---
id: 2026-S09
title: Sprint 09 — Provar
status: planned
start: null        # D9 (2026-09-18): sprints por dependência, não por data
end: null
sequence: 2
depends_on_sprint: 2026-S08
phase: F7
goal: Ver o produto funcionando com dado de verdade, e medir o que a noite de 04/10 vai exigir do banco e da gaveta de dados.
specs_in_flight: [020-evolucao-da-apuracao]
specs_evolving: [001-ingestao-tse, 002-modelo-estatistico]
specs_planned_next: [016-senador, 018-identidade-candidatura, 019-fase-pre-eleicao]
---

# Sprint 09 — Provar

> **Sprint sem datas (D9, 2026-09-18).** `sequence: 2`, depende da S08 estar fechada.
> As janelas de simulado do TSE têm data de terceiro e vivem no **trilho externo** — o que
> está aqui é o **preparo** para usá-las, que não depende de quando elas acontecerem.

## Objetivo único

**Ver o produto funcionando com dado, e medir o que a noite vai exigir.** Ao fim desta
sprint, o gráfico da noite existe desenhado em tela, e os dois números que a noite pode
estourar — escrita no banco e tamanho do payload — são medidos, não supostos.

## Dependências

**O que esta sprint exige que já esteja pronto (da S08):**

- **O canal de alarme ligado.** Medir um ciclo contra o TSE sem alarme é medir com o
  vigia dormindo: se a ingestão morrer no meio da janela, o número medido é lixo e
  ninguém sabe disso.
- **`pytest` no CI.** Os itens 3 e 4 mexem em `api/model/project.py` e em
  `lib/edge-config/writer.ts`. Sem portão, uma regressão nos 560 testes do modelo entra
  na `main` verde.

**O que ela destrava:**

- **S10** — a Fase 4 da spec 020 (replay de 2022 + e2e) só faz sentido depois da Fase 3;
  e promover a 020 a `shipped` exige ter visto a linha desenhada pelo menos uma vez.
- **S10, no gate OT-4** — a decisão D1 (baixar a promessa de 95%) precisa do replay
  rodando de ponta a ponta, o que depende de o pipeline ter sido exercitado.
- **S11** — o teste de carga e o checklist pré-produção pressupõem um payload cujo
  tamanho já foi medido no pior caso.

---

## Specs in-flight

- [ ] **020-evolucao-da-apuracao** (`draft`) — **Fase 3** do sequenciamento de
      [`design.md` § 8](../specs/020-evolucao-da-apuracao/design.md): *"gerador de
      simulação emite série por candidatura; fixtures de gov e sen; gate de coerência"*.
      Depende da Fase 0, que está entregue.

## Specs evolving (mantêm status, recebem trabalho)

- **001-ingestao-tse** (`shipped`) — o preparo do ciclo autônomo contra o TSE (item 2).
- **002-modelo-estatistico** (`implementing`) — a medição da escrita da série (item 3).

---

## Chores fora de spec

### 1. Fixtures de simulação com a série (spec 020, Fase 3)

🔴 **NENHUMA fixture contém `serie_por_candidato` — nem a de Presidente.** Conferido em
18/09: `grep -l serie_por_candidato tests/fixtures/simulacao/*.json` retorna **zero**,
sobre os 9 arquivos do diretório (`presidente`, `presidente-uf`, `governador`, `senador`,
`senador-uf`, `deputado`, `deputado-uf`, `municipios-pres-t1`, `manifest`).

A consequência, dita sem rodeio: **o gráfico de evolução, entregue em 18/09 e publicado
nas 4 rotas, nunca foi visto com uma linha desenhada em tela nenhuma.** O que foi visto é
o estado vazio — que está correto e é a entrega da Fase 0, mas não prova a linha.

⚠️ **Esta fase mexe em `lib/dev/simulacao.ts`** — o arquivo que derrubou a produção por
horas em 17/09. Um `join(process.cwd(), …)` fez o Turbopack traçar **22.572 arquivos** (o
projeto inteiro) para dentro de cada função, **e o build passou verde**, com o aviso
apenas no log. O risco está catalogado em
[`spec.md` § Riscos](../specs/020-evolucao-da-apuracao/spec.md) e a defesa já existe em
`lib/dev/simulacao.ts:169-178`.

- [ ] `serie_por_candidato` nas fixtures das 4 trilhas (pres, gov, sen + as variantes de UF).
- [ ] Todo caminho novo montado com `join(/*turbopackIgnore: true*/ process.cwd(), …)`,
      como o de `lib/dev/simulacao.ts:178`.
- [ ] `grep "traced unintentionally"` no log do build **antes** de confiar em deploy verde.
- [ ] Contagem em `.next/server/app/(pres)/page.js.nft.json` na casa das **dezenas**
      (esperado ~124), não dos milhares.
- [ ] Gate de coerência: a série da fixture bate com o placar da mesma fixture (o gráfico
      e o painel ao lado não podem discordar).

ℹ️ **Decisão pendente do dono, registrada na própria spec** (§ Questões em aberto, item
1): as fixtures de Governador e Senador com série + array de municípios levariam o
diretório de fixtures a ~10 MB. A proposta da spec é gerá-las **só com as séries**, sem os
municípios. Sem essa decisão, as duas rotas que o dono mais vai querer revisar ficam de
fora de `pnpm dev:sim`.

### 2. Preparar o pipeline para rodar sozinho contra o TSE

A tabela **"Registro das janelas"** de [`docs/testing/tse-simulados.md:296-306`](../testing/tse-simulados.md)
está **em branco**: cinco linhas, nenhuma célula preenchida — nenhum ciclo, nenhum atraso,
nenhum `rateLimited`, nenhum tamanho de payload. Os 15 arquivos de simulado que temos
foram baixados **à mão** (`22a2892 — chore(tse): os arquivos reais do simulado entram no
repo, byte a byte`, 17/09).

Quatro decisões de produção dependem literalmente desses números
(`tse-simulados.md:308-314`): fan-out, `TSE_MAX_RPS`, `INGEST_CONCURRENCY`/`maxDuration`,
e o path real do EA15.

- [ ] Ciclo completo rodando **sozinho** (cron, não invocação manual) contra o ambiente de
      simulado, com a env de preview correta —
      `TSE_BASE_URL=https://resultados-sim.tse.jus.br/simulado/simulado2026`.
      ⚠️ O segmento `/oficial` **não existe** naquele host (`scripts/tse-watch.ts:25`).
- [ ] Tabela "Registro das janelas" preenchida, linha por ciclo.
- [ ] `duration_ms` real do Senador medido — é a folga mais apertada do projeto: ~244 s de
      ciclo dentro de uma janela de 300 s entre disparos (`vercel.ts:144-148`).

### 3. Medir a escrita da série no banco

A série por candidatura passou a ser gravada em `projections` (migration 0009, aplicada em
produção em 17/09). Medido no banco de produção em 18/09
([ADR-0047](../architecture/adrs/0047-serie-cor-legivel-e-ciclo-sem-hora-fora-do-eixo.md),
tabela de leitura): **25 ciclos desde a 0009**, **650 linhas** no total, e **13.180 linhas**
na tabela inteira.

**A noite é outra ordem de grandeza.** Três cargos persistem série
(`CARGOS_COM_SERIE_PERSISTIDA = {1, 3, 5}`, `api/model/project.py:1541`); Presidente e
Governador a cada 60 s e Senador a cada 5 min, ao longo de ~11 h. A conta de guardanapo do
orquestrador dá **algumas centenas de milhares de linhas** — a ordem que motivou excluir
Deputado Federal, cujas 7.791 candidaturas dariam ~3,7 milhões (`project.py:5744-5749`).
🔴 **Esse número é estimativa, não medição** — e a regra da casa é não publicar um número
único para o que depende de dado de terceiro. Esta sprint troca a estimativa por medida.

**Por que isso é caminho crítico e não curiosidade**: a gravação acontece **dentro** do
passo que fecha o cálculo, e **antes** de a tela atualizar. `insert_projections` +
`conn.commit()` rodam em `api/model/project.py:5751-5756`, dentro da transação; só depois,
em `:5768`, vem a *"Publicação no Edge Config — best-effort, fora da transação do DB"*.
Um INSERT lento não atrasa um relatório: atrasa o número que o leitor vê. E
`insert_projections` usa `cur.executemany` (`:1624-1626`).

- [ ] Número **medido** (ms) do par `insert_projections` + `commit` por ciclo, por cargo,
      sob volume de noite — não sob os 26 registros/ciclo de hoje.
- [ ] Se o número comer a folga do ciclo: decidir entre `execute_values`/COPY, gravação
      fora da transação de publicação, ou redução do escopo persistido — **com ADR**, por
      ser mudança de desenho de persistência (constituição § 10, append-only).

### 4. Freio na gaveta de dados

O Global Config tem teto de **1 MB** (`GLOBAL_CONFIG_STORE_LIMIT_BYTES = 1_000_000`,
`lib/edge-config/writer.ts:300`). O writer **avisa** aos **780 KB** (`:329`) e aos
**940 KB** (`:339`) — e **nunca recusa**. Está escrito no próprio arquivo, em `:53-57`:
*"A guarda NUNCA aborta a gravação nem propaga exceção — o pipeline vale mais que a
instrumentação."*

Esse desenho é defensável quando a instrumentação pode errar. Deixa de ser quando o teto é
duro do outro lado: **passado 1 MB, a plataforma recusa**, a gravação falha, e a tela
congela no último número — com cara de normalidade. É o modo de falha que os "três
estados" de 14/09 existem para não produzir, entrando pela porta dos fundos.

- [ ] Limiar acima do qual o writer **recusa** a gravação, em vez de avisar — com a recusa
      virando alarme (o canal da S08) e estado explícito na tela, nunca silêncio.
- [ ] Pior caso de **cada campo** do payload forçado na medição, não amostra aleatória:
      nome mais longo, maior número de candidaturas por UF, série no teto de pontos
      ([ADR-0046](../architecture/adrs/0046-serie-por-candidato-limitada-por-construcao.md) D2).
      Publicar **intervalo**, nunca um número único.
- [ ] `pnpm edge-config:smoke` executado contra o Global Config real (exige
      `EDGE_CONFIG_TOKEN`), confirmando grava/lê/apaga.

---

### 5. Herdados da S07 — triados no fechamento de 18/09

Referência: [S07 § Triagem](./2026-S07-f6-simulado-hero-1t.md#triagem-das-60-caixas-restantes).

- [ ] **Fase 3 da spec 020: `serie_por_candidato` nas fixtures** *(S07 linha 405)* — é a
      chore 1 desta sprint. ℹ️ A caixa da S07 estava prestes a ser marcada como feita por um
      agente que conferiu se os **arquivos** de fixture existem (existem) em vez de conferir
      se a **série está dentro** deles (não está: `grep -l serie_por_candidato
      tests/fixtures/simulacao/*.json` → zero sobre as 9). Erro pego no fechamento.
- [ ] **`EDGE_CONFIG_STORE_GUARD_BYTES`** *(S07 linha 432)* — o ADR-0032 especifica um freio de
      983.040 B que **recusaria** a escrita; o código só tem `GLOBAL_CONFIG_STORE_WARN_BYTES`
      (780.000) e `..._CRITICAL_BYTES` (940.000) em `lib/edge-config/writer.ts:329,339`, e
      **os dois apenas registram no log** — não há `throw` antes do `fetch`. Encaixa na chore 4.
- [ ] **`archiveProjectionKey` é lida e nunca escrita** *(S07 linha 437)* — `lib/edge-config/reader.ts:213`
      lê; nenhum escritor grava. Ou passa a ser escrita, ou a leitura sai.
- [ ] **Incorporar as fixtures `2026-sim` à suíte** *(S07 linha 528)* — os 14 arquivos reais do
      simulado (`tests/fixtures/tse/2026-sim/`) **não são consumidos por nenhum teste
      automatizado**. O teste que valida `EA20Schema` usa `tests/fixtures/tse/2026/`, um
      diretório **sintético diferente** derivado do dicionário do TSE. O único consumidor do
      dado real é o script manual `scripts/verify-fatia-premise.ts`.
- [ ] **`scripts/profile-model.py` quebrado** *(S07 linha 172)* — gera payload achatado da era
      pré-Fase 1. ⚠️ Ele também cita **RNF-006 quatro vezes** (`:2,10,19,358`) para um limite de
      `p95 < 2000 ms` que **não existe em `docs/nfr/`** — ver o achado do RNF fantasma na
      [auditoria da S07](./2026-S07-f6-simulado-hero-1t.md#tr%C3%AAs-achados-que-nenhuma-caixa-cobria).
- [ ] **Batch de Postgres em `repository.ts`/`route.ts`** *(S07 linha 213)* — **condicional**: só
      se a janela de 22–24/09 confirmar lag > 90 s inaceitável.
- [ ] **Edge Config externo** *(S07 linha 748)* — `EDGE_CONFIG` segue comentada em `.env.local`
      desde 18/05. ℹ️ **Novidade de 18/09**: a variável **existe no escopo Preview da Vercel**
      (criada há ~21 h, conferida com `vercel env ls preview`). Investigar o local, não o remoto.

---

## Definition of Done

- [ ] **`pnpm dev:sim` mostra o gráfico DESENHADO nas 4 rotas** — captura de tela de cada
      uma, com linha visível (não o estado vazio). Se a decisão do dono cortar gov/sen das
      fixtures, o DoD cai para as rotas decididas e a exceção fica escrita aqui.
- [ ] **A tabela "Registro das janelas" (`docs/testing/tse-simulados.md:300-306`) deixa de
      estar em branco** — pelo menos uma linha completa, com ciclos, `rateLimited`, lag e
      tamanho de payload medidos.
- [ ] **Existe número medido (ms) para a escrita da série** por ciclo e por cargo, sob
      volume de noite, registrado neste arquivo ou no runbook.
- [ ] **O writer RECUSA acima do limiar** — teste que monta um payload acima do limiar e
      prova que a gravação não acontece e que o alarme dispara.
- [ ] **Zero regressão do incidente de 17/09** — `grep "traced unintentionally"` no log do
      build vem vazio, e a contagem do `.nft.json` da home fica na casa das dezenas.
- [ ] 🔴 **Mutação aplicada à mão em cada teste novo desta sprint** — aplicar a mutação,
      confirmar o **vermelho**, restaurar, provar com `diff`. Relatório de agente não
      substitui. É a regra da casa.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` verde e
      `.venv-model/bin/python3.14 -m pytest` verde (baseline: 560).

---

## Riscos da sprint

- **A Fase 3 derrubar a produção de novo** — é o mesmo arquivo
  (`lib/dev/simulacao.ts`) do incidente de 17/09, e o build **passou verde** naquela vez.
  Mitigação: `turbopackIgnore` em todo caminho novo (`lib/dev/simulacao.ts:178` é o
  modelo), `grep` por `traced unintentionally` no log, e conferência da contagem em
  `.next/server/app/(pres)/page.js.nft.json` antes de considerar o deploy bom.
- **Fixtures de gov e sen levarem o diretório a ~10 MB** — decisão do dono pendente
  (spec 020 § Questões em aberto, item 1). Mitigação: gerar só as séries, sem o array de
  municípios; se o dono decidir o contrário, o DoD desta sprint muda no mesmo movimento.
- **A janela do TSE não cooperar** — o ambiente de simulado já respondeu **403** uma vez
  (`docs/reference/risks.md:19`) e o `codEleicao` é dado de terceiro. Mitigação: o item 2
  é **preparo**, e é medível contra `pnpm tse:mock` (CDN falso local) mesmo sem janela; a
  data da janela vive no trilho externo, não aqui.
- **Medir a escrita da série sob volume de hoje e chamar de medição** — 26 linhas por
  ciclo não dizem nada sobre algumas centenas de milhares. Mitigação: a medição roda sobre
  volume sintético de noite, e o número publicado é intervalo, não ponto.
- **A recusa do writer virar indisponibilidade** — um limiar mal calibrado transforma um
  aviso inofensivo em site parado. Mitigação: o limiar sai da medição de pior caso, não de
  palpite; e a recusa precisa produzir estado explícito na tela, não congelamento.
- **Escrever em produção por acidente durante a medição** — `DATABASE_URL` do `.env.local`
  é **produção**. 🔴 Nunca declarar `ALLOW_DB_WRITE_TESTS` com o `.env.local` carregado;
  a medição roda sempre contra banco descartável
  (`tests/integration/_guarda-banco.ts`, e [runbook § série por candidatura](../operations/runbook.md)).

---

## Replanejamentos mid-sprint

_(preencher se mudar)_

---

## Retrospective (preencher ao fechar)

- O que funcionou:
- O que melhorar:
- Carry-over pra próxima:

---

## Cross-refs

- Sprint anterior: [2026-S08-f7-enxergar.md](./2026-S08-f7-enxergar.md)
- Próxima sprint: [2026-S10-f7-verdade.md](./2026-S10-f7-verdade.md)
- Plano de F7 (referência): [../_meta/plano-s07-2026-09-05.md](../_meta/plano-s07-2026-09-05.md)
- Estado do projeto: [../_meta/handoff-2026-09-18.md](../_meta/handoff-2026-09-18.md) — supersede o de 17/09
- Specs tocadas: [020-evolucao-da-apuracao](../specs/020-evolucao-da-apuracao/spec.md) · [001-ingestao-tse](../specs/001-ingestao-tse/spec.md) · [002-modelo-estatistico](../specs/002-modelo-estatistico/spec.md)
- ADRs da série: [0046](../architecture/adrs/0046-serie-por-candidato-limitada-por-construcao.md) · [0047](../architecture/adrs/0047-serie-cor-legivel-e-ciclo-sem-hora-fora-do-eixo.md)
- Protocolo dos simulados: [../testing/tse-simulados.md](../testing/tse-simulados.md)
- Runbook: [../operations/runbook.md](../operations/runbook.md)
- Riscos: [../reference/risks.md](../reference/risks.md)
