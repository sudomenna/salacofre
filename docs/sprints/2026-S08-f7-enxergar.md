---
id: 2026-S08
title: Sprint 08 — Enxergar
status: planned
start: null        # D2 (2026-09-18): sprints por dependência, não por data
end: null
sequence: 1
phase: F7
goal: Parar de trabalhar às cegas — o alarme sai do código e chega a um canal, um vigia de fora prova que o ciclo rodou, e o portão de CI passa a enxergar o modelo.
specs_in_flight: [010-operacao-monitoramento]
specs_planned_next: [020-evolucao-da-apuracao, 001-ingestao-tse, 002-modelo-estatistico]
---

# Sprint 08 — Enxergar

> **Sprint sem datas, por decisão do dono (D2, 2026-09-18).** O sequenciamento é por
> dependência, não por calendário: `sequence: 1`, e nada aqui depende de sprint anterior.
> Os três itens com data de terceiros (código de eleição do TSE, janelas de simulado,
> reimportação obrigatória de candidatos) vivem no **trilho externo**, fora deste arquivo.

## Objetivo único

**Parar de trabalhar às cegas.** Ao fim desta sprint, uma falha do pipeline produz uma
mensagem que sai do processo; e uma regressão no modelo estatístico reprova um PR.

## Dependências

**O que esta sprint exige que já esteja pronto:** nada. É a primeira da sequência e não
depende de nenhuma outra. Todo o insumo já está no repositório — os 9 pontos de alerta
existem e estão mudos, e o CI já constrói o `.venv-model` que falta usar.

**O que ela destrava:**

- **S09 (`Provar`)** — sem alarme que chega a alguém, medir a noite (escrita da série,
  ciclos contra o TSE) produz número sem vigia: se o ciclo morrer no meio da medição,
  ninguém sabe que morreu.
- **S09 e S10, via CI** — as duas mexem em `api/model/`. Enquanto o `pytest` não for
  portão, qualquer regressão nos 560 testes do modelo passa verde.
- **S10 (`Só afirmar o que sustenta`)** — a promoção das specs 016/018/019/020 a `shipped`
  exige `rf-coverage-checker` ✅, e o gate só enxerga o que está na **matriz principal** de
  `traceability.md` **e** no `requirements:` do frontmatter da spec. A migração das 16
  linhas ficou pronta em 18/09; o resíduo de frontmatter (item 6) é o que resta.

---

## Specs in-flight

- [ ] **010-operacao-monitoramento** (`draft`) — **parcial**: só **RF-057** (alertas) e
      **RF-060** (cron habilitável por env var). Detalhes em
      [`spec.md`](../specs/010-operacao-monitoramento/spec.md).

  ⚠️ **Achado que exige ação de spec antes da implementação.** O frontmatter declara
  `depends_on: [001-ingestao-tse, 012-dashboard-status, 013-pagina-manutencao]`
  (`docs/specs/010-operacao-monitoramento/spec.md:9`), e a **spec 012 foi cortada pelo
  dono** — `app/_status/` contém um único `.gitkeep`, zero código. Seguir a dependência
  ao pé da letra bloqueia RF-057 atrás de uma tela que não vai existir. **RF-057 não
  precisa de painel nenhum para mandar mensagem.** Ação: dividir a spec (RF-057/RF-060
  desta sprint; RF-056/RF-058/RF-059 seguem para a S11 junto com a 013) e emendar o
  `depends_on` para `[001-ingestao-tse]` na fatia que entra agora.

  ℹ️ **RF-060 já tem o interruptor no código** — `lib/tse/ingest-handler.ts:399`
  (`process.env.CRON_ENABLED !== "false"`). O que falta é o teste que prova o desligamento
  e a linha correspondente na matriz principal de `traceability.md`.

---

## Chores fora de spec

### 1. Ligar o canal de alarme

`SLACK_WEBHOOK_URL` **não existe no `.env.local`** (conferido em 18/09: zero ocorrências).
São **9 pontos de alerta** no código, todos mudos hoje:

| Arquivo | Linhas |
|---|---|
| `api/model/project.py` | `:4945`, `:5218`, `:5319`, `:5388`, `:5589` |
| `lib/tse/ingest-handler.ts` | `:938`, `:945`, `:955` |
| `scripts/tse-watch.ts` | `:538` |

O ponto único de decisão é `api/model/project.py:4815` — lê a variável e, quando ela não
existe, registra `"slack alert skipped — SLACK_WEBHOOK_URL ausente"` (`:4826`) e segue. A
contraparte TypeScript faz o mesmo em `lib/tse/alerts.ts:62`. Risco catalogado em
[`risks.md:70`](../reference/risks.md) e em
[ADR-0038 § D3](../architecture/adrs/0038-dado-ts-hora-do-dado-nao-hora-do-calculo.md).

- [ ] Decidir o destino (canal Slack ou webhook de outro sistema) — **decisão do dono**.
- [ ] Configurar em Vercel (Preview **e** Production) e no `.env.local`.
- [ ] Forçar um alarme **contra o mock local** (`pnpm tse:mock`) e confirmar a chegada.
      🔴 **Nunca forçar erro contra o CDN do TSE** — `docs/operations/pre-prod-checklist.md:38`
      e [runbook § testes manuais de alerting](../operations/runbook.md). Um 404 malformado
      pode bloquear o IP por 10 minutos.

### 2. Vigia externo (o alarme que vigia o alarme)

**Todo alarme mora dentro do próprio ciclo.** Os 9 pontos da tabela acima disparam a
partir de código que só roda se o cron for invocado. Se a Vercel parar de invocar o cron,
ou se a função morrer antes do primeiro `_alert_slack`, **nada avisa** — o site continua
servindo o último payload, com cara de normalidade (é exatamente o modo de falha que os
"três estados" da decisão de 14/09 existem para não esconder).

O `heartbeat` diurno de `vercel.ts:114-117` **não resolve isto**: ele aponta para
`/api/ingest`, isto é, para nós mesmos. Um vigia que mora dentro do processo vigiado não é
um vigia.

- [ ] Vigia **fora da Vercel** (cron de outra infra, serviço de dead-man's switch, ou o
      mesmo agendador externo que já vai rodar `pnpm tse:watch --once`) que confirme
      periodicamente que um ciclo rodou — via `dado_ts` do payload publicado, que é o
      relógio do boletim e não o do cálculo ([ADR-0038](../architecture/adrs/0038-dado-ts-hora-do-dado-nao-hora-do-calculo.md) D1).
- [ ] Documentar o vigia no [runbook](../operations/runbook.md): quem recebe, o que fazer.

### 3. Alarme para "série parada enquanto o placar anda"

Lacuna **nomeada hoje** no [ADR-0047](../architecture/adrs/0047-serie-cor-legivel-e-ciclo-sem-hora-fora-do-eixo.md),
na seção de consequências: o ciclo sem hora do TSE é descartado em **dois** lugares —

- `AND dado_ts IS NOT NULL` no SQL (`_SERIE_POR_CANDIDATO_SQL`, `api/model/project.py:870-915`);
- um `warn` em `anexar_ponto_corrente` (`api/model/project.py:1028-1075`);

— e **os dois são mudos, sem contador**. Hoje isso é inofensivo, porque ciclo sem hora é
ciclo sem voto (medido: 22 de 25 ciclos sem `dado_ts`, 572 linhas, **zero** com `pct_atual`).
Deixa de ser inofensivo se o TSE mudar o formato da data e o parser Python não tolerar:
aí um ciclo **com voto** some da série enquanto o placar ao lado continua andando, e a
linha congela em silêncio visual. O próprio ADR registra que não cria esse alarme.

- [ ] Contador de ciclos descartados por `dado_ts` ausente, por cargo.
- [ ] Alarme quando o contador cresce **e** o percentual apurado do mesmo cargo também
      cresce — é essa conjunção que distingue "lull legítimo do TSE" de "série cega".

### 4. `pytest` no CI

`.github/workflows/ci.yml` tem três jobs — `typecheck`, `lint`, `test` — e o job `test`
termina em `pnpm test` (`:127-130`). **Os 560 testes do modelo estatístico não têm portão**
(`.venv-model/bin/python3.14 -m pytest --collect-only` → `560 tests collected`, 34 arquivos).
Uma regressão em `api/model/` passa verde hoje.

O custo é baixo porque **o CI já constrói o ambiente**: `.github/workflows/ci.yml:117-126`
instala Python e monta o `.venv-model` com as dependências, só para que os testes de
integração consigam invocar o modelo em subprocesso. Falta o passo que o executa.

- [ ] Passo novo no job `test`: `.venv-model/bin/python3.14 -m pytest`.
      ⚠️ **Não** usar `pnpm test:py` — o script é literalmente `python -m pytest`
      (`package.json:21`) e pega o `python` do PATH, morrendo com `ModuleNotFoundError:
      pydantic` antes do primeiro teste.

### 5. Corrigir os documentos que ensinam o endereço errado do TSE

*(Outro agente faz o conserto; esta é a caixa que rastreia.)*

O endereço base do ambiente de simulado é
`https://resultados-sim.tse.jus.br/simulado/simulado2026`
(`docs/specs/001-ingestao-tse/design.md:81`, `docs/testing/tse-simulados.md:33`). O
segmento `/oficial` é o de **produção** e responde **403 para sempre** naquele host — o
próprio `scripts/tse-watch.ts:25` já diz isso em comentário. O 403 foi lido como "o TSE
ainda não publicou", a vigia não viu o ambiente subir em 14/09, e o `git log` registra
**zero commits em 14, 15 e 16/09** (contra 54 em 13/09 e 34 em 17/09) — dois dos três dias
da primeira janela de simulado.

**Estado em 2026-09-18**: o conserto de código saiu em 17/09
(`8645153 — docs: o endereço do simulado estava errado em todo lugar que o citava`), e o
resíduo de documentação — `2026-S07-f6-simulado-hero-1t.md` e `plano-s07-2026-09-05.md` —
**foi fechado em 18/09** por outro agente, com nota datada em cada um dos dois arquivos.
Fora dos sprints, a única ocorrência remanescente do endereço errado é
`docs/reference/risks.md:19`, e ela é **registro histórico do 403**, não instrução — não
deve ser "corrigida".

O que sobra para esta sprint é a **regra**, que é o valor durável do episódio:

- [ ] **"403 neste host nunca significa 'ainda não publicado' — significa caminho errado"**
      registrada onde a vigia é operada: [runbook](../operations/runbook.md) e
      [`tse-simulados.md`](../testing/tse-simulados.md).
- [ ] `pnpm tse:watch --once` reprovando de forma **distinguível**: 403 e "sem mudança" não
      podem sair do script com a mesma cara, porque foi essa indistinção que custou os dois
      dias.

### 6. Os 16 RFs fora da matriz principal — migração **feita**, resíduo aberto

*(Outro agente fez a migração; esta é a caixa que rastreia o que sobrou.)*

`RF-012.1`, `RF-012.2` (spec 012) e `RF-153..RF-166` (spec 019) viviam **só** na tabela
secundária "RFs adicionados pelas specs", que não tem coluna `Teste` — e a coluna `Teste`
da matriz principal é a única coisa que o gate `rf-coverage-checker` lê. Consequência: 16
RFs invisíveis ao portão, e a spec 019 podendo ser promovida sem que nada os confrontasse.

✅ **Migração concluída em 2026-09-18** (`docs/_meta/traceability.md:284-290`). As 16
linhas estão na matriz principal, com `Teste` preenchido contra arquivo **e número de
linha** conferidos no disco. Resultado por spec:

- **spec 019 — 14 de 14 com cobertura confirmada**, e as asserções citadas são as que
  **discriminam**, não a mera presença de arquivo com o nome certo. A spec está
  destravada para a S10.
- **spec 012 — RF-012.1 e RF-012.2 seguem sem cobertura, porque não há código.**
  `app/_status/` tem só um `.gitkeep`. É ausência de **implementação**, não de linha na
  matriz. Como a 012 foi cortada pelo dono, isto não bloqueia nada nesta sequência de
  sprints — vira decisão de rastro na S11 ("Opcionais explícitos").

🔴 **Resíduo que ainda bloqueia, e que a migração deixou explícito**: o frontmatter de
`docs/specs/012-dashboard-status/spec.md` declara `requirements: [RF-056, RF-057]` e
**não lista** RF-012.1 nem RF-012.2, embora a própria spec os defina em EARS
(`spec.md:45-53`). O `rf-coverage-checker` parte do `requirements:` do frontmatter — com a
linha na matriz e o RF fora do frontmatter, o gate continua sem vê-los.

⚠️ **E há um conflito de propriedade a resolver antes de mexer**: RF-057 aparece no
`requirements:` de **duas** specs — a 010 (que esta sprint coloca em voo) e a 012
(cortada). Duas specs donas do mesmo RF é ambiguidade de rastro, não redundância inofensiva.

- [ ] Frontmatter da spec 012 reconciliado: RF-012.1/RF-012.2 listados, RF-057 com dono único.
- [ ] `rf-coverage-checker` executado para as specs 010 e 019 depois da reconciliação.

---

## Definition of Done

Cada linha abaixo é algo que alguém consegue conferir.

- [ ] **Um alarme forçado contra o mock local (`pnpm tse:mock`) chega ao canal** — captura
      da mensagem recebida, com hora. Zero requisições ao CDN do TSE durante o teste.
- [ ] **O vigia externo detecta um ciclo que não rodou** — ensaio: desligar o cron
      (`CRON_ENABLED=false`), esperar o intervalo do vigia, receber o aviso; religar.
- [ ] **O CI reprova com um teste de modelo quebrado de propósito** — abrir um PR com
      uma mutação em `api/model/`, ver o job `test` vermelho, reverter.
- [ ] **Existe contador de ciclo descartado por `dado_ts` ausente**, visível no log
      estruturado, e um alarme que dispara na conjunção "série parada + placar andando".
- [ ] **`rf-coverage-checker` retorna ✅ para a spec 019** — a migração dos 16 RFs para a
      matriz principal ficou pronta em 18/09; o que falta provar é o gate **rodando** e
      passando, agora que os 14 RFs da 019 têm coluna `Teste` preenchida.
- [ ] **RF-057 tem dono único** e o frontmatter da spec 012 lista RF-012.1/RF-012.2 —
      verificável por `grep "^requirements:" docs/specs/012-dashboard-status/spec.md`.
- [ ] **Nenhum documento operacional ensina o endereço errado do TSE** — fora de `risks.md:19`
      (registro histórico do 403) e das notas datadas de correção, `grep` pelo endereço em
      `docs/` não devolve **instrução**. E `pnpm tse:watch --once` distingue 403 de "sem
      mudança" na saída.
- [ ] **Spec 010 dividida**, com o `depends_on` da fatia em voo sem a spec 012.
- [ ] 🔴 **Mutação aplicada à mão em cada teste novo desta sprint** — para cada teste
      escrito: aplicar a mutação, confirmar o **vermelho**, restaurar, e provar a
      restauração com `diff`. Relatório de agente **não** substitui a mutação feita à mão.
      É a regra da casa e foi ela que pegou os defeitos reais de 18/09.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` verde e
      `.venv-model/bin/python3.14 -m pytest` verde (baseline: 560).

---

## Riscos da sprint

- **O canal de alarme vira ruído e ninguém lê** — 9 pontos de disparo, alguns por ciclo,
  podem produzir dezenas de mensagens por hora na noite da apuração e treinar o leitor a
  ignorar o canal. Mitigação: separar severidade (`warn` × `error`) em destinos ou
  prefixos distintos, e ensaiar o volume durante a medição da S09 antes de 04/10.
- **O vigia externo depende de infra fora da Vercel, que ninguém está operando** — um
  vigia que também cai não vigia nada. Mitigação: escolher um serviço com página de status
  própria, e testar o vigia do vigia uma vez (desligar o cron e cronometrar o aviso).
- **O `pytest` no CI expõe testes que já estavam vermelhos** — a suíte roda verde
  localmente, mas o CI tem banco (`DATABASE_URL_CI`) e sistema de arquivos diferentes.
  Mitigação: primeira execução em PR próprio, antes de virar portão obrigatório na `main`.
- **`ALLOW_DB_WRITE_TESTS` no CI** — cinco arquivos de teste escrevem no banco de
  `DATABASE_URL` e só rodam com a variável declarada (`tests/integration/_guarda-banco.ts`).
  Ligar `pytest` no CI não deve, por acidente, ligar esses cinco contra um banco real.
  Mitigação: não declarar a variável no workflow; conferir que o `DATABASE_URL_CI` aponta
  para um **branch** do Neon, nunca para produção.
- **A divisão da spec 010 abre disputa de escopo com a S11** — RF-056 (painel) e RF-058
  (manutenção) ficam sem casa se a divisão não for escrita. Mitigação: a fatia que **não**
  entra aqui é nomeada explicitamente na S11, no mesmo movimento.

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

- Sprint anterior: [2026-S07-f6-simulado-hero-1t.md](./2026-S07-f6-simulado-hero-1t.md)
- Próxima sprint: [2026-S09-f7-provar.md](./2026-S09-f7-provar.md)
- Plano de F7 (referência): [../_meta/plano-s07-2026-09-05.md](../_meta/plano-s07-2026-09-05.md)
- Estado do projeto: [../_meta/handoff-2026-09-17.md](../_meta/handoff-2026-09-17.md)
- Spec tocada: [010-operacao-monitoramento](../specs/010-operacao-monitoramento/spec.md)
- ADRs do alarme: [0038](../architecture/adrs/0038-dado-ts-hora-do-dado-nao-hora-do-calculo.md) · [0047](../architecture/adrs/0047-serie-cor-legivel-e-ciclo-sem-hora-fora-do-eixo.md)
- Riscos: [../reference/risks.md](../reference/risks.md)
- Runbook: [../operations/runbook.md](../operations/runbook.md)
- Checklist pré-produção: [../operations/pre-prod-checklist.md](../operations/pre-prod-checklist.md)
- Matriz de rastreabilidade: [../_meta/traceability.md](../_meta/traceability.md)
