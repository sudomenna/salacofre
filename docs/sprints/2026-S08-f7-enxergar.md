---
id: 2026-S08
title: Sprint 08 — Enxergar
status: active
start: null        # D9 (2026-09-18): sprints por dependência, não por data
end: null
sequence: 1
opened: 2026-09-18
phase: F7
goal: Parar de trabalhar às cegas — o alarme sai do código e chega a um canal, um vigia de fora prova que o ciclo rodou, e o portão de CI passa a enxergar o modelo.
specs_in_flight: [010-operacao-monitoramento]
specs_planned_next: [020-evolucao-da-apuracao, 001-ingestao-tse, 002-modelo-estatistico]
---

# Sprint 08 — Enxergar

> **Sprint sem datas, por decisão do dono (D9, 2026-09-18).** O sequenciamento é por
> dependência, não por calendário: `sequence: 1`, e nada aqui depende de sprint anterior.
> Os três itens com data de terceiros (código de eleição do TSE, janelas de simulado,
> reimportação obrigatória de candidatos) vivem no **trilho externo**, fora deste arquivo.

## Calendário — o que tem data e não é nosso

Esta sprint **não tem data**. Mas ela é a sprint `active`, e por isso carrega o ponteiro
para o que tem data de terceiro. O roteiro **não** é copiado aqui — ele vive em
[`_trilho-externo.md`](./_trilho-externo.md).

| Data | Evento | Onde está o roteiro |
|---|---|---|
| **22–24/09** | 2ª janela de simulado do TSE, 9h–12h e 14h–17h BRT | [trilho § Item 1](./_trilho-externo.md#item-1--janela-de-simulado-do-tse--gatilho-2224092026) |
| **02–03/10** | Reimportação obrigatória do cadastro de candidaturas | [trilho § Item 3](./_trilho-externo.md#item-3--reimportação-do-cadastro-de-candidaturas--gatilho-0203102026) |
| **03/10** | Código da eleição de produção — bloqueante absoluto | [trilho § Item 2](./_trilho-externo.md#item-2--código-da-eleição-de-produção--gatilho-03102026) |

🔴 **O simulado de 22–24/09 dispara sozinho** — o preview está armado (cron ligado, janela
`9-17`, os dois códigos de eleição criados; conferido com `vercel env ls` em 18/09).
**Ninguém precisa acionar nada.** O risco é ele rodar e ninguém ver, e é por isso que esta
sprint vem primeiro.

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

`SLACK_WEBHOOK_URL` **não existe em nenhum ambiente** — conferido em 18/09 por
`vercel env ls` (Preview, Production e Development) e por `grep` no `.env.local`.
São **10 pontos de alerta** no código, todos mudos hoje:

| Arquivo | Linhas | Função |
|---|---|---|
| `api/model/project.py` | `:1321`, `:5148`, `:5421`, `:5522`, `:5591`, `:5792` | `_alert_slack` |
| `lib/tse/ingest-handler.ts` | `:938`, `:945`, `:955` | `notifySlack` |
| `scripts/tse-watch.ts` | `:538` | `notifySlack` |

> **Eram 9, e viraram 10 em 18/09** com o alarme de série cega do § 3 — recontado no disco
> depois de escrevê-lo, não estimado. As linhas de `project.py` também mudaram todas de
> número, porque o arquivo cresceu 215 linhas no mesmo trabalho.
>
> ⚠️ **Contar com `grep` de um nome só subconta aqui.** O mesmo conceito tem dois nomes: o
> lado Python chama `_alert_slack` e o TypeScript chama `notifySlack`. Um agente contou só o
> segundo em 18/09 e "corrigiu" o total para 4, com evidência colada e tudo. O total é a
> **soma dos dois**.

O ponto único de decisão é `api/model/project.py:4815` — lê a variável e, quando ela não
existe, registra `"slack alert skipped — SLACK_WEBHOOK_URL ausente"` (`:4826`) e segue. A
contraparte TypeScript faz o mesmo em `lib/tse/alerts.ts:62`. Risco catalogado em
[`risks.md:70`](../reference/risks.md) e em
[ADR-0038 § D3](../architecture/adrs/0038-dado-ts-hora-do-dado-nao-hora-do-calculo.md).

- [ ] Decidir o destino (canal Slack ou webhook de outro sistema) — **decisão do dono**.
      ⏸️ **Adiada pelo dono em 18/09**, com o resto da sprint seguindo sem ela. Consequência
      aceita e registrada: se a janela de **22–24/09** rodar antes desta caixa fechar, ela
      roda **sem ninguém ser avisado de falha** — exatamente o cenário que esta sprint
      existe para evitar. O vigia externo (§ 2) reduz o dano mas não substitui o canal:
      ele prova que o ciclo parou, não *por que* parou.
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

- [x] **`pnpm vigia:ciclo`** — `scripts/vigia-ciclo.ts`, 18/09. Núcleo puro `avaliarCiclo`
      (sem rede, sem env, sem relógio implícito) + casca fina de I/O. Lê `dado_ts` do payload
      publicado, nunca `ts` ([ADR-0038](../architecture/adrs/0038-dado-ts-hora-do-dado-nao-hora-do-calculo.md) D1).
      Roda no agendador horário `~/.claude/scheduled-tasks/vigia-tse-2026/`, **fora da Vercel**.

      🔴 **Descoberta que mudou o desenho, medida em 18/09**: o vigia **não pode** bater em
      `/api/*`. Todas as rotas de API de produção respondem **HTTP 403 `bot_detected`** a
      cliente automatizado (Vercel BotID); só a página HTML responde 200, e ela **só mostra a
      hora do boletim quando há apuração** — em fase pré-eleição não há carimbo, e "não achei
      a hora" seria indistinguível de "o ciclo morreu". Por isso o vigia lê o payload **na
      fonte** (store do Global Config), não pela porta do site.

      **Seis estados, três desfechos** — `pre_eleicao`/`fora_da_janela`/`fresco` → exit 0;
      `parado`/`sem_payload` → exit **2**; `indeterminado` → exit **1**.
      🔴 O exit 1 separado não é cosmético: *"não consegui olhar"* jamais pode sair com a
      mesma cara de *"olhei e está parado"*. Foi essa indistinção — 403 permanente lido como
      "o TSE ainda não publicou" — que custou dois dos três dias da janela de 15–17/09.

      Cobertura: `tests/unit/scripts/vigia-ciclo.test.ts`, **13 casos**, 4 mutações aplicadas
      à mão e todas vermelhas (ver o § Definition of Done).
- [x] **Documentado no [runbook](../operations/runbook.md)** § "Vigia externo — `pnpm vigia:ciclo`":
      quem recebe, os seis estados, o que fazer com cada um, e o que ainda não está feito.
- [ ] ⏸️ **Dead-man's switch hospedado** — o que existe hoje depende da **máquina do dono estar
      ligada**. Um serviço externo com página de status própria é mais robusto e continua
      aberto. Custa dinheiro ou conta nova ⇒ **decisão do dono**.

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

- [x] **Contador de ciclos descartados por `dado_ts` ausente, por cargo** — 18/09.
      `vigiar_serie_cega` (`api/model/project.py:1234`), chamada no orquestrador em `:5989`
      **antes** de `anexar_ponto_corrente`. Emite
      `_log("warn", "serie: ciclo descartado por dado_ts ausente", cargo=…, ciclos_cegos=…,
      placar_andou=…, delta_pp=…)`. Hora **ilegível** conta como cegueira, não só hora
      ausente — é o modo de falha que o alarme existe para cobrir.
- [x] **Alarme na conjunção** — `api/model/project.py:1310`, deduplicado por sequência cega
      (um alarme por sequência, não um por ciclo). Piso de movimento
      `SERIE_PLACAR_EPSILON_PP = 0.01`, acoplado a `SERIE_CASAS_DECIMAIS` — é a precisão
      **publicada**, não um número escolhido a dedo.

      **Decisão de projeto**, justificada no código acima de `vigiar_serie_cega`: o baseline
      do placar sai da **série já em memória** (`SeriePorCandidatoBruta`), não de uma consulta
      nova nem do payload anterior. O `pct_atual` do último balde **é** a ponta da linha do
      gráfico; comparar o placar deste ciclo contra ele não aproxima a discrepância — é
      exatamente os dois números que apareceriam lado a lado na tela. Zero query, zero rede,
      dentro do orçamento de 60 s.

      ⚠️ **Limite assumido por escrito**: o contador vive no processo, por `(cargo, turno)`, e
      conta ciclos cegos **consecutivos**. Instância fria recomeça do zero — ele
      **subestima, nunca superestima**. Aceitável porque não é o gatilho sozinho: a metade que
      distingue pausa legítima de série cega é o placar ter andado, e essa metade é medida
      contra a série, que é estado persistido.

      ⏸️ **O alarme nasce mudo** (`SLACK_WEBHOOK_URL` ausente, § 1). O **contador no log
      estruturado funciona desde já** — por isso as duas caixas eram separadas.

### 4. `pytest` no CI

`.github/workflows/ci.yml` tem três jobs — `typecheck`, `lint`, `test` — e o job `test`
termina em `pnpm test` (`:127-130`). **Os 560 testes do modelo estatístico não têm portão**
(`.venv-model/bin/python3.14 -m pytest --collect-only` → `560 tests collected`, 34 arquivos).
Uma regressão em `api/model/` passa verde hoje.

O custo é baixo porque **o CI já constrói o ambiente**: `.github/workflows/ci.yml:117-126`
instala Python e monta o `.venv-model` com as dependências, só para que os testes de
integração consigam invocar o modelo em subprocesso. Falta o passo que o executa.

- [x] **Passo novo no job `test`** — `.github/workflows/ci.yml`, 18/09: `Testes do modelo
      (pytest)`, entre a montagem do `.venv-model` e o `pnpm test`. Usa
      `.venv-model/bin/python3.14 -m pytest`, **não** `pnpm test:py` (que pega o `python` do
      PATH e morre com `ModuleNotFoundError: pydantic` antes do primeiro teste).

      🔴 **O passo NÃO recebe `DATABASE_URL`, e a ausência é deliberada** — é a mitigação do
      risco listado no § Riscos desta sprint. `pyproject.toml` fixa
      `testpaths = ["tests/unit/model"]`, que não toca o banco: medido em 18/09,
      `env -u DATABASE_URL .venv-model/bin/python3.14 -m pytest` → **560 passed**. Passar a
      credencial só criaria a chance de um teste futuro escrever num banco real por acidente,
      que é exatamente o incidente de 17/09 (1.877 linhas de harness em produção).

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

### 7. Herdados da S07 — triados no fechamento de 18/09

Quatro caixas da S07 caíram nesta sprint. A referência de cada uma é a linha original no
arquivo da [S07](./2026-S07-f6-simulado-hero-1t.md#triagem-das-60-caixas-restantes).

- [ ] 🔴 **Assert de percentil do RF-015** *(S07 linha 270)* — **o mais urgente dos quatro,
      e é pré-requisito da S10.** Medido em 18/09 pelo orquestrador: trocar
      `np.percentile(est_v, 2.5/97.5)` por `10.0/90.0` em
      `api/model/extrapolation.py:389-398` — o que transforma o intervalo de confiança de
      **95% em 80%**, mudando o que o leitor vê — deixa os **560 testes pytest verdes**.
      Nada no repositório trava esse número.
      **Por que entra aqui e não na S10**: a S10 § 1 vai mexer exatamente nesse valor por
      decisão D8 (baixar a promessa para o número real). Mudar um número que nenhum teste
      protege é como consertar no escuro. O assert vem antes.
      ⚠️ O teste tem de asserir o **percentil** (que `ci_lower` é o 2,5 e `ci_upper` o 97,5
      da distribuição de resamples), não a largura relativa — a largura já é coberta pelo
      RF-018 (×1,5) e foi ela que deixou a mutação passar.

- [ ] **`rf-coverage-checker` sobre RF-008/RF-009 (pares município×zona)** *(S07 linha 626)*
      — a matriz já lista `geo-coverage.test.ts` (`traceability.md:35-36`), mas o teste
      exige `DATABASE_URL` contra o Neon real e o gate nunca rodou formalmente desde a
      Fase 7c. Encaixa no item 6 desta sprint.
      🔴 Rodar **somente** contra banco descartável, nunca com `.env.local` carregado.

- [ ] **`spec-syncer` repropagando após os gates** *(S07 linha 628)* — bloqueado por 626 até
      agora. **É o conserto estrutural da lição central da S07**: 16 caixas feitas e nunca
      marcadas, e quatro documentos afirmando que falta o que já existe. Alvos conhecidos,
      todos medidos em 18/09:
      - `../specs/017-deputado-federal/spec.md:23-33` — corpo diz `implementing`, frontmatter
        diz `shipped` (o frontmatter é o certo)
      - `../specs/019-fase-pre-eleicao/spec.md:33-34` — "Falta" dois arquivos que existem
        desde 17/09
      - `../specs/020-evolucao-da-apuracao/spec.md:36-41` — Fase 2 marcada ⬜, entregue em 18/09
      - `../_meta/traceability.md:147,152` — RF-144 e RF-149 como bloqueadores, fechados em 13/09
      - `../architecture/tech-stack.md:56-60` — lista `@vercel/analytics`,
        `@vercel/speed-insights` e `@vercel/config` como stack; **nenhum está instalado**

- [ ] **`SLACK_WEBHOOK_URL`** *(S07 linha 415)* — é o item 1 desta sprint; a caixa da S07
      fica fechada por migração, não por conclusão.

---

## Definition of Done

Cada linha abaixo é algo que alguém consegue conferir.

- [ ] ⏸️ **Um alarme forçado contra o mock local (`pnpm tse:mock`) chega ao canal** — captura
      da mensagem recebida, com hora. Zero requisições ao CDN do TSE durante o teste.
      **Bloqueado pela decisão adiada do dono** (§ 1). Os outros itens desta lista não
      dependem dele e seguem.

- [ ] 🔴 **A mutação do percentil do RF-015 fica vermelha.** Prova exigida, nesta ordem:
      trocar `2.5/97.5` por `10.0/90.0` em `api/model/extrapolation.py:389-398`, rodar
      `.venv-model/bin/python3.14 -m pytest`, **colar a saída mostrando pelo menos um
      vermelho**, restaurar por cópia do scratchpad e provar com `diff` vazio.
      Hoje esse mesmo procedimento devolve **560 passed** — medido em 18/09.
- 🔶 **O vigia externo detecta um ciclo que não rodou** — a **lógica** está provada por
      mutação (4 aplicadas à mão em 18/09, 4 vermelhas):

      | Mutação em `scripts/vigia-ciclo.ts` | Vermelho? |
      |---|---|
      | limiar `idade > limite` → `>=` | ✅ *"exatamente no limite ainda é fresco"* |
      | remover a guarda de hora ilegível | ✅ *"hora de boletim ilegível é alarme, não 'fresco por acidente'"* |
      | trocar a ordem das guardas credencial ↔ fase | ✅ *"cego + payload de pré-eleição ainda é indeterminado"* |
      | remover a guarda de janela de ingestão | ✅ *"fora da janela não cobra frescura"* |

      ⚠️ **A terceira sobreviveu na primeira tentativa** — 12 verdes com a ordem trocada. O
      caso que a mata foi escrito depois, e o defeito que passava era real: com um payload
      obsoleto em cache, o vigia diria *"não há o que apurar, silêncio é o certo"* quando na
      verdade não tinha conseguido ler nada. É a regra da casa funcionando.

      ⏸️ **O ensaio ponta-a-ponta (desligar `CRON_ENABLED`, esperar, religar) NÃO foi feito, de
      propósito.** Mexer no interruptor do cron às vésperas da janela de **22–24/09** arrisca
      deixá-lo desligado justamente quando ela abrir — e a janela anterior já foi perdida por
      um erro de configuração que ninguém viu. **Fazer o ensaio depois de 24/09.**
- [x] **O portão de CI reprova com um teste de modelo quebrado de propósito** — provado
      em 18/09 rodando **o comando exato que o CI roda**:
      mutação em `api/model/cadeiras_bootstrap.py:142-143` (percentis `2.5/97.5` → `20.0/80.0`)
      → `.venv-model/bin/python3.14 -m pytest` devolveu **`3 failed, 557 passed`, exit code 1**
      (qualquer código ≠ 0 reprova o job). Restaurado por cópia do scratchpad, `diff` vazio,
      **560 passed**, exit 0.
      ⏸️ Falta a confirmação **no GitHub**, que exige abrir PR — ordem explícita do dono
      (`CLAUDE.md` § 11). O comando é o mesmo; o que falta provar é o encanamento do Actions.
- [x] **Existe contador de ciclo descartado por `dado_ts` ausente**, visível no log
      estruturado, e um alarme que dispara na conjunção "série parada + placar andando".
      `tests/unit/model/test_serie_cega_alarme.py` (12 casos) +
      `test_orchestrator.py::test_vigia_da_serie_cega_roda_antes_de_anexar_o_ponto`.
      Pytest: **560 → 573**, zero falhas.

      **14 mutações aplicadas, 14 vermelhas**, todas restauradas com `diff` vazio. Duas foram
      **reaplicadas à mão pelo orquestrador**, de forma independente, e bateram com o relatório:

      | Mutação conferida pelo orquestrador | Resultado medido |
      |---|---|
      | `and` → `or` na conjunção (`:1310`) | **5 failed, 7 passed** |
      | apagar a chamada do vigia no orquestrador (`:5989`) | **1 failed, 572 passed** |

      🔴 A segunda é a que mais importa, e o próprio agente a levantou: **apagar a chamada
      deixava os 572 testes verdes** antes de ele escrever o teste de fiação. Um alarme
      correto e nunca invocado é um alarme mudo — que é exatamente o defeito que esta sprint
      existe para consertar. As outras 12 estão na tabela do relatório e cobrem: contador sem
      incremento, hora legível que não zera, hora ilegível tratada como visão, piso de
      movimento zerado, baseline ausente imputado como `0.0`, ausência de deduplicação,
      contador global em vez de por cargo, e a ordem da chamada.
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
- Estado do projeto: [../_meta/handoff-2026-09-18.md](../_meta/handoff-2026-09-18.md) — supersede o de 17/09
- Spec tocada: [010-operacao-monitoramento](../specs/010-operacao-monitoramento/spec.md)
- ADRs do alarme: [0038](../architecture/adrs/0038-dado-ts-hora-do-dado-nao-hora-do-calculo.md) · [0047](../architecture/adrs/0047-serie-cor-legivel-e-ciclo-sem-hora-fora-do-eixo.md)
- Riscos: [../reference/risks.md](../reference/risks.md)
- Runbook: [../operations/runbook.md](../operations/runbook.md)
- Checklist pré-produção: [../operations/pre-prod-checklist.md](../operations/pre-prod-checklist.md)
- Matriz de rastreabilidade: [../_meta/traceability.md](../_meta/traceability.md)
