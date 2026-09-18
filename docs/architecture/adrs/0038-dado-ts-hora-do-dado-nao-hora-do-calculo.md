---
id: ADR-0038
title: Hora do dado do TSE (dg/hg) como campo dado_ts explícito no payload, não a hora em que o modelo rodou — alarme de pipeline parado via _alert_slack, inerte até SLACK_WEBHOOK_URL existir
status: accepted
date: 2026-09-13
amends: 0001, 0011, 0012, 0026, 0032, 0036
---

# ADR-0038 — `dado_ts` explícito, separado da hora do cálculo, com alarme de defasagem inerte por padrão

## Status

Aceito. Este ADR **emenda o ADR-0001** (read path — dois novos campos no mesmo Edge Config/Blob, nenhum destino novo), o **ADR-0011** (a cadência de 60s vira a base do limiar de alarme de Presidente/Governador), o **ADR-0012** (nenhuma chave nova — os campos entram nos payloads já publicados nas chaves existentes), o **ADR-0026** (seu item 5 já exigia "`ts` por payload" como sinal de transparência de cadência; este ADR corrige o que esse `ts` de fato mede e acrescenta o segundo relógio que faltava), o **ADR-0032** (o objeto Blob de detalhe municipal ganha, por composição na página, acesso ao mesmo sinal, sem mudança de schema do Blob em si — ver D5) e o **ADR-0036** (a cadência de Deputado Federal usada na tabela de limiares de D3 é a que aquele ADR fixou — 30 min, não os 15 min vigentes quando a investigação deste ADR começou; ver nota abaixo). Não supersede nenhum dos seis: os princípios de fundo de cada um permanecem intactos.

> ⚠️ **Nota 2026-09-18 — D1 passa a valer também para o EIXO publicado
> ([ADR-0047](0047-serie-cor-legivel-e-ciclo-sem-hora-fora-do-eixo.md) D2).** Quando este ADR foi
> escrito, `dado_ts` era um **carimbo** de frescor: a decisão de "ausência → `null` explícito, nunca
> fallback" governava o que a tela **diz**. A spec 020 criou uma superfície que não existia em
> 13/09 — um eixo horizontal desenhado a partir de `dado_ts` —, e a Fase 2 nasceu com um
> `COALESCE(dado_ts, ts)` na leitura da série, isto é, com o fallback que D1 proíbe, só que numa
> coordenada em vez de num rótulo. Por decisão do dono, o `COALESCE` saiu das duas metades
> (leitura e ponto corrente) no mesmo commit: **ciclo sem hora legível do TSE não vira ponto, vira
> buraco**. Medido em produção em 18/09: dos 25 ciclos posteriores à migration 0009, 22 não têm
> `dado_ts`, e nenhuma das 572 linhas sem hora tem `pct_atual` — mas o `pct_projetado` delas muda,
> então a linha da projeção marchava para a direita sobre dado congelado, exatamente o modo de
> falha que este ADR existe para impedir. Nenhuma decisão deste documento é revogada.

**Nota 2026-09-13 — números reconferidos contra um HEAD mais novo.** A investigação original deste ADR foi feita contra um worktree 15 commits atrás de `main`. Nesse intervalo, dois ADRs novos entraram (`ADR-0036`, Deputado Federal em granularidade zona/par, fatiado em 6, volta completa em 30 min; `ADR-0037`, agregação nacional do IC95 de cadeiras) e `api/model/project.py` ganhou código suficiente para deslocar a maioria das linhas citadas na primeira redação. Este documento já nasce escrito contra o HEAD corrigido — todo `arquivo:linha` abaixo foi reconferido nele. Nenhuma das cinco decisões (D1–D5) mudou de mérito; mudaram a cadência de Deputado usada em D3 (era 15 min, é 30 min) e a descrição de como o cargo 6 chega à lista em granularidade de par (não é mais "27 linhas por UF", é a mesma lista de pares que os outros três cargos, só que agregada por uma função diferente rio abaixo — ver Contexto e D1). **ADR-0037 é ortogonal a este documento** — trata de como o IC95 nacional de cadeiras agrega UFs sem faixa própria, não de relógios nem de payload `ts`; citado aqui só para registro, sem relação de emenda.

## Contexto

O campo `ts` que hoje aparece em `EdgePayload` (`lib/edge-config/types.ts:530-532`), `EdgePayloadUf`
(`types.ts:804-807`) e `EdgePayloadDeputado` (`types.ts:991-993`) é escrito uma única vez por ciclo do
modelo — `ts_iso = datetime.now(timezone.utc).isoformat()` — em dois pontos de origem que cobrem os
quatro cargos: `api/model/project.py:4053` (dentro de `_do_project_proporcional`, alimenta
`construir_payload_deputado`, cargo 6, chega ao payload em `deputado_payload.py:425` por UF e `:643`
nacional) e `api/model/project.py:4310` (dentro de `_do_project`, alimenta `build_edge_payload`, cargos
1/3/5, chega ao payload em `project.py:3522` nacional e `:3027` por UF). Os doc-comments do próprio
tipo já são honestos sobre o que esse valor significa — "Timestamp ISO 8601 do momento em que o modelo
rodou" — e não há bug de tipo nem contrato quebrado. O que quebra é a apresentação: `<ApuracaoMeta>`
rotula esse valor como **"Última atualização"** (`components/blocks/ApuracaoMeta.tsx:52`), e o leitor
razoavelmente lê isso como "quando o TSE atualizou o dado", não "quando o Python rodou o cálculo em
cima do que já tinha".

A consequência prática: se a ingestão parar — TSE fora do ar, cron falhando, lock preso, granularidade
descartada por filtro — o modelo continua rodando sobre os últimos snapshots do banco e publicando um
`ts` **fresco** sobre dado **parado**, a cada ciclo, indefinidamente. Nada no payload, na UI ou no
alarme distingue esse cenário do cenário saudável. Isso não é uma falha teórica: `docs/specs/
003-home-nacional/spec.md:108` já declara o estado "**Erro de dados (>60s sem update)**: banner amarelo
'Reconectando ao TSE'" desde a redação original da spec, e a constituição § 7 exige "graceful
degradation (último valor conhecido + banner amarelo)" e RNF-010/RNF-012 (`docs/nfr/availability.md:
13,15`) formalizam a mesma meta — mas nenhum componente do repositório implementa esse estado hoje
(busca por `banner`/`degrad`/`stale`/`Reconectando` em `components/` não encontra nenhum candidato:
os únicos matches são falsos positivos em CSS/nomes de outros componentes). "Sem update" nunca teve um
relógio para medir "update de quê" — só existia o relógio do cálculo, que roda a cada ciclo *mesmo
quando o dado não mudou*. Constituição § 3 declara "Defasagem TSE → tela do usuário < 30s" como
princípio de performance percebida (renegociado para <90s pelo ADR-0011, `docs/nfr/performance.md:17`)
— uma meta que, rigorosamente, **nunca foi medível**: o único relógio disponível ponta a ponta sempre
foi o de cálculo, não o do dado que o TSE de fato gerou.

Todo boletim EA20 do TSE traz `dg` (data de geração) e `hg` (hora de geração) no **topo** do envelope,
junto de `ele`, `t`, `f`, `tpabr`, `cdabr` — não em sub-objeto — e são **obrigatórios**, sem
`.optional()`, no schema Zod (`lib/tse/ea20-schema.ts:337-338`). Confirmado contra fixture real
(`tests/fixtures/tse/2022/presidente-sp-z0001.json`): `dg = "04/10/2026"`, `hg = "20:15:30"`, exatamente
no formato que `calculateLagSeconds` já espera. Esses dois campos já são parseados no ingest para medir
lag — `lib/tse/ingest-handler.ts:719` chama `calculateLagSeconds(result.data.dg, result.data.hg)`
(`lib/tse/metrics.ts:74-115`, que monta `${yyyy}-${mm}-${dd}T${hg}-03:00` com BRT fixo -03:00 e aceita
`dd/mm/aaaa` ou `ddMMyyyy`) — mas o resultado (`maxLagSeconds`, RNF-033) só é usado para logar/alertar
no ciclo de ingestão (`ingest-handler.ts:862-890`); nunca chega ao modelo nem ao payload. Um achado de
nomenclatura relevante para D1: no vocabulário do TSE, o token `ts` **já** significa outra coisa —
`payload['s']['ts']` é "total de seções" (`SecoesSchema`, `lib/tse/ea20-schema.ts:197`), dentro do
elemento `s`, não colidindo literalmente com o `ts` de topo dos nossos payloads, mas deixando claro que
`ts` é um nome sobrecarregado dentro de qualquer estrutura que conviva com o EA20 — um argumento a mais
para não usá-lo, nem de forma renomeada, para o relógio novo.

O EA20 é gravado **inteiro e cru** (`lib/tse/repository.ts:183`, constituição § 1), e `fetch_snapshots`
(`api/model/project.py:312-384`) já seleciona a coluna `payload` inteira (`r[4]`) — `dg`/`hg` de cada
linha **já estão na memória do Python**, por par, sem custo de query adicional. (A mesma função também
passou a selecionar `ts`, a hora de **coleta** — `r[5]`, `project.py:358,366,380` — desde 2026-09-13,
para resolver por frescor qual família de linhas sobrevive quando sentinela e zonas reais coexistem;
esse é um mecanismo ortogonal ao relógio do dado que este ADR introduz, e não é reaproveitado aqui — ver
D1.)

**Desde o ADR-0036 (13/09), os quatro cargos — não só três — chegam a `fetch_snapshots` em
granularidade de par (município, zona), ~6.110 linhas por cargo.** Isso muda o que era verdade na
primeira investigação deste ADR (o cargo 6 não é mais "uma linha por UF") e simplifica a decisão: existe
uma lista em granularidade de par disponível nos dois ramos do modelo, e é dela que sai o relógio do
dado, para os quatro cargos.

- **Ramo majoritário** (cargos 1, 3, 5 — Presidente, Governador, Senador; `_do_project`,
  `project.py:4096`): `raw_snapshots = fetch_snapshots(...)` (`:4142`) é mantido **antes** de
  `merge_pairs_into_zonas` (`:4143`) por outro motivo — a guarda de sanidade do ADR-0035 D2 compara
  antes/depois do merge para detectar multiplicação (comentário em `:4135-4141`). É a fonte certa para
  o relógio do dado: depois do merge, `zona_merge.py:52` documenta explicitamente que
  `dg`/`hg`/`idg`/`cdabr` são "metadados de envelope" herdados só do par dominante de cada zona (maior
  `e.te`) — usar o `snapshots` pós-merge esconderia 100% dos pares não-dominantes.
- **Ramo proporcional** (cargo 6 — Deputado Federal; `_do_project_proporcional`, `project.py:3775`):
  `snapshots = fetch_snapshots(...)` (`:3832`) devolve a mesma granularidade de par, mas este ramo **não
  chama `merge_pairs_into_zonas`** — a correção que uma leitura inicial deste ADR precisou fazer sobre
  si mesma. `snapshots` segue, sem tocar o relógio do dado, por dois caminhos que o próprio docstring da
  função descreve (`project.py:3806-3820`): somado inteiro por `combinar_entradas`
  (`api/model/deputado.py:412`) para o **ponto** publicado (as cadeiras), e agrupado por `cod_zona` para
  a decomposição `zonas` que o bootstrap de RF-127 (ADR-0037) reamostra para o **intervalo**. Nenhum dos
  dois caminhos altera `dg`/`hg` — a lista `snapshots`, logo após a leitura em `:3832` e antes de
  qualquer uma dessas duas agregações, desempenha para o cargo 6 exatamente o papel que `raw_snapshots`
  desempenha para os outros três.

**Restrição que este ADR precisa resolver, não ignorar**: as fixtures do replay 2022
(`tests/fixtures/replay-2022/snapshots.json`) foram construídas com o envelope **podado** — cada
snapshot carrega só `payload.{carg, e, s, v}`, sem `dg`/`hg`. `api/model/replay_batch.py` declara
consumir "o mesmo schema de `fetch_snapshots`" e alimenta o mesmo `build_edge_payload`; se a extração
do relógio do dado assumir `payload["dg"]` presente, o replay quebra com `KeyError`, e o gate OT-4 (MAE@1h
PT 2,3623pp / cobertura 82,5%, referência estável) cairia por um motivo que não tem nada a ver com o
modelo — exatamente o tipo de falso-negativo que este projeto já tratou como pior que ruído.

## Decisão

### D1 — Novo campo `dado_ts`, `ts` existente **não muda de significado nem de nome**

Os três envelopes (`EdgePayload`, `EdgePayloadUf`, `EdgePayloadDeputado`) ganham dois campos novos,
opcionais/nulos:

```ts
dado_ts: string | null;        // ISO 8601 UTC — max(dg, hg) entre os snapshots que entraram no ciclo
pares_atrasados: number | null; // contagem de pares/linhas cujo próprio (dg,hg) já ficou para trás — D2
```

`ts` **permanece exatamente como é hoje** — "hora em que o modelo rodou" — sem renomear, sem remover,
sem redefinir. Três razões convergem para essa escolha, e não para renomear `ts` (opção considerada e
rejeitada, ver Alternativas): (a) o contrato já é honesto sobre o que `ts` significa — o doc-comment do
tipo nunca prometeu "hora do dado"; quem mentiu foi o rótulo na tela, e é lá que a mentira se corrige;
(b) `ts` é lido hoje em pelo menos seis pontos de código de produção com semânticas que dependem de ser
"quando o Node/Python escreveu isto" — a validação de borda em `app/api/internal/edge-write/route.ts:
125,234`, a comparação de frescor em `splitUfPayload` (`lib/blob/uf-detail.ts:127-129`, comentário
explícito: "as duas escritas não são atômicas... a UI precisa poder datar as duas separadamente"), o
carimbo de `emptyPayload()` em `app/(gov)/governador/page.tsx:189` e `app/(sen)/senador/page.tsx:105`, e
o `revalidate: 60` do fetch de Blob (ADR-0032) alinhado a essa mesma semântica de write-clock —
renomear obrigaria migrar todos esses pontos, mais os testes que os cobrem, a 3 semanas do 1º turno,
por um ganho que a adição do campo novo já entrega sem risco de regressão; (c) nomes cogitados como
substituto de `ts` (`calculo_ts`, `model_ts`) não removem a causa raiz — a UI continuaria precisando de
DOIS relógios lado a lado, então a pergunta "que nome dar ao segundo" tem que ser resolvida de qualquer
forma, e resolvê-la sem tocar o primeiro é estritamente menos invasivo.

**Escolha do nome `dado_ts` sobre alternativas** (`tse_ts`, `boletim_ts` foram cogitados e descartados
por serem mais longos sem ganho de clareza): "dado" é o termo que a própria constituição já usa nesse
sentido em § 1 ("o dado oficial é intocável") e § 8 ("como a projeção é extrapolada do apurado"), então
`dado_ts` lê como "a hora do dado [oficial]" sem precisar reexplicar o que é TSE/boletim/EA20 no nome
do campo.

**Extração — nota de implementação.** `dg`/`hg` estão no **topo** de cada `payload` de snapshot
(confirmado na fixture real citada no Contexto), leitura direta sem navegar sub-objeto: `payload["dg"]`,
`payload["hg"]`. O parser Python que converte esse par de strings em datetime UTC **deve portar** a
mesma lógica tolerante de `calculateLagSeconds` (`lib/tse/metrics.ts:74-115`: aceita `dd/mm/aaaa` e
`ddMMyyyy`, offset BRT fixo `-03:00`, sem DST) em vez de reimplementá-la de forma independente em
Python — duas implementações da mesma conversão de data divergindo silenciosamente em um caso de borda
é exatamente a classe de defeito que este projeto já pagou caro para descobrir tarde (ver o histórico de
"default silencioso" nos ADRs de ingestão). Hoje **não existe** parser equivalente em `api/model/` —
`zona_merge.py:52` só cita `dg`/`hg` como metadado de envelope não-aditivo, nunca os converte, e
`combinar_entradas` (`api/model/deputado.py:412`) soma campos de voto, não datas — então esta é uma peça
de código nova, não uma reutilização, para os dois ramos.

**A `ts` de coleta que `fetch_snapshots` passou a selecionar em 2026-09-13 (`r[5]`, `project.py:358,
366,380`) não é reaproveitada aqui.** Ela resolve um problema diferente — qual família de linhas
(sentinela `cod_zona=0` vs. zonas reais) é mais fresca ao decidir qual descartar
(`_discard_zero_zona_sentinel_when_real_zonas_exist`) — e continua sendo relógio de **coleta**, não do
**dado**. Os dois mecanismos coexistem sem conflito: um decide dedup estrutural, o outro alimenta
`dado_ts`.

**Ausência de `dg`/`hg`: `null` explícito, nunca fallback.** Quando nenhum snapshot do ciclo tem
`dg`/`hg` parseável, `dado_ts` e `pares_atrasados` são publicados como `null` — nunca a hora de coleta,
nunca a hora de cálculo. Cair de volta para qualquer um dos outros dois relógios reintroduziria
exatamente o problema que este ADR resolve: um número que parece "hora do dado" mas não é. Dois casos
produzem essa ausência, com causas e gravidades diferentes, que o implementador deve distinguir no log
(não no payload — o payload só sabe `null`, o log sabe por quê):

- **Fixture de replay podada** (benigno, esperado): `tests/fixtures/replay-2022/snapshots.json` não tem
  `dg`/`hg` em nenhum dos 5 timesteps. O replay roda inteiro com `dado_ts = null` em todo payload que
  gerar — não é regressão, é a fixture histórica sendo o que sempre foi. O timestep carrega seu próprio
  `trigger_ts` (chaves do timestep: `bucket, cargo, snapshots, trigger_ts, turno`); usá-lo como relógio
  sintético do dado no replay é uma opção aberta ao implementador, não uma exigência deste ADR — o gate
  OT-4 não precisa de `dado_ts` para nada, roda inteiro sobre `snapshots`/`estimates`.
- **Boletim real de produção sem `dg`/`hg`** (anomalia, não deveria acontecer): `dg`/`hg` são
  obrigatórios no schema Zod que valida todo snapshot antes do insert (`ea20-schema.ts:337-338`, sem
  `.optional()`). Se este caso ocorrer em produção, é um TSE publicando fora do próprio dicionário — cai
  para `null` no payload (constituição § 8: melhor dizer "hora do dado indisponível" do que inventar um
  número), mas **deve** logar `warn`/`error`, porque um `null` de produção por essa via é sintoma de algo
  errado no upstream, não de fixture antiga.

**Compatibilidade de leitura — o que a UI faz sem o campo novo.** O read path (Edge Config + Blob)
convive com payload antigo e código novo por alguns minutos durante o rollout do Rolling Release
(constituição § 7 — canary 10/50/100%). `dado_ts`/`pares_atrasados` são campos **aditivos**: o
`.passthrough()` já presente em `app/api/internal/edge-write/route.ts:120,152,206,229` já aceita esses
campos extras **sem qualquer mudança de schema** no momento em que o Python passar a enviá-los — o
`bodySchema`/`deputadoBodySchema` não precisam de edição para não rejeitar a escrita; precisam de edição
só para dar tipagem explícita ao campo do lado do leitor (recomendado, não obrigatório para a escrita
não quebrar). Três estados possíveis na leitura, tratados como três textos diferentes, nunca um
substituindo silenciosamente o outro:

1. `dado_ts` presente e não-nulo → rótulo novo: "Dado do TSE: HH:MM:SS" (substitui "Última atualização"
   como texto primário de frescor voltado ao leitor — decisão do usuário, item 1 do briefing).
2. `dado_ts` presente e explicitamente `null` → "hora do dado indisponível neste ciclo" — nunca
   fabricar um substituto.
3. Chave `dado_ts` **ausente** (payload gravado por código anterior a este ADR, ou em voo durante o
   canary) → cai para o texto **de hoje**, associado a `ts` (ex. o atual "Última atualização"). Não é a
   correção final, mas também não é uma mentira nova: é o mesmo grau de imprecisão que já existe em
   produção, só que por uma janela de minutos durante o deploy, nunca indefinidamente.

### D2 — O payload carrega o **máximo** (`dado_ts`, rótulo do leitor) e uma **contagem de pares atrasados relativa ao próprio ciclo** (`pares_atrasados`, sinal de operação) — não o mínimo cru

O máximo responde "qual o dado mais recente que entrou nesta conta" e é a pergunta que o leitor faz
("quando foi atualizado") — é o valor de D1 exibido na tela, coerente com a decisão do usuário de que a
tela mostra a hora do TSE, um único número. Mas o máximo, sozinho, tem exatamente o ponto cego que o
usuário nomeou: com ~6.110 pares por cargo (ADR-0035, e desde o ADR-0036 isso vale para os **quatro**
cargos, não só três), se **um único** par se mexer, o máximo fica fresco enquanto 6.109 ficam
congelados — o cenário concreto de risco é a ingestão falhando para quase todos os alvos enquanto um
punhado de retries isolados continua tendo sucesso, não o TSE parando de publicar (nesse segundo caso o
máximo também envelhece, corretamente).

**O mínimo cru foi rejeitado como métrica publicada** (headline ou diagnóstico) por um motivo
estrutural, não de gosto: no início da apuração — e para qualquer zona já 100% apurada que o TSE parou
de regerar — o `dg`/`hg` mais antigo entre 6.110 pares vai ser **sempre** velho, por razões legítimas
que nada têm a ver com a saúde do nosso pipeline. Publicar o mínimo como sinal de saúde produziria
alarme permanente a partir de meia-noite de toda corrida, exatamente o tipo de ruído que erode a
confiança no alarme real (o mesmo argumento, em espírito, que fez o usuário rejeitar publicar `p_eleito`
degenerado no ADR-0026 nota (b) — um número tecnicamente correto mas enganoso na prática).

**A métrica que de fato captura "um par se mexeu, os outros 6.109 não" é relativa ao próprio ciclo, não
ao relógio de parede**: `pares_atrasados` conta quantos pares do ciclo têm seu próprio `dg`/`hg`
mais de **2 cadências do cargo** (D3) atrás do `dado_ts` (o máximo) **do mesmo ciclo** — não atrás de
"agora". Essa escolha, deliberada: comparar cada par contra o `dado_ts` do próprio ciclo, em vez de
contra `now()`, é o que diferencia "a maioria dos pares não avançou enquanto um avançou" (o padrão de
falha do nosso pipeline, que este número acende) de "o TSE genuinamente não tem novidade para ninguém
agora" (legítimo, e nesse caso a distância de cada par ao máximo do ciclo permanece pequena, porque
todos envelhecem juntos). O custo de computar isso é desprezível: já se está parseando `dg`/`hg` de
todo o `raw_snapshots`/`snapshots` para achar o máximo; contar quantos ficam a mais de 2 cadências dele
é uma comparação extra por linha, sem query nova, sem parse duplicado.

`pares_atrasados` **não é a métrica primária que o leitor vê** — a tela mostra `dado_ts` (D1), um único
número, como o usuário decidiu. `pares_atrasados` é um sinal de **operação**: alimenta o alarme (D3) e
pode aparecer como detalhe de transparência em `/sobre-o-modelo` ou `<DeputadoMetodologia>`
(constituição § 8), nunca como manchete concorrendo com "Dado do TSE: HH:MM:SS".

**Granularidade por UF, nos quatro cargos.** `EdgePayloadUf` (e o detalhe por UF de `EdgePayloadDeputado`)
carrega seu próprio `dado_ts`/`pares_atrasados`, calculados só sobre os pares daquela UF (`raw_snapshots`/
`snapshots` já vêm com coluna `uf`, nenhuma query adicional, nos dois ramos) — porque a ingestão pode
degradar regionalmente (um problema de rede específico, um lock preso que só afeta parte do fan-out) sem
que o agregado nacional acuse nada, o mesmo argumento de fundo que já levou o ADR-0032 a dar `ts` próprio
ao Blob de detalhe municipal. Antes do ADR-0036, esta granularidade por UF não fazia sentido para
Deputado (uma única linha por UF); depois dele, o cargo 6 se beneficia da mesma resolução que os outros
três.

### D3 — Limiar de "dado parado" por cargo, alarme via `_alert_slack`, inerte sem `SLACK_WEBHOOK_URL`

Cada cargo já declara sua cadência em código, e o limiar deriva dela — nunca um número absoluto
hardcoded compartilhado entre cargos, porque o mesmo limiar aplicado a Presidente (60s) e Deputado
(30 min) seria ruidoso para um e cego para o outro:

| Cargo | Cadência declarada | Fonte | Limiar de alarme (×3) |
|---|---|---|---|
| Presidente / Governador (1, 3) | 60s | ADR-0011 | 180s (3 min) |
| Senador (5) | 300s (5 min) | ADR-0026, nota (b) — granularidade revertida para zona no mesmo dia, cadência de 5 min mantida | 900s (15 min) |
| Deputado Federal (6) | 1.800s (30 min) — volta completa das 6 fatias de 5 min cada | `ATUALIZACAO_MIN_DEPUTADO = 30`, `api/model/project.py:3716` ([ADR-0036](0036-deputado-federal-granularidade-zona-fatiada.md)) | 5.400s (90 min) |

**×3, não ×1 nem um número maior.** ×1 dispararia a cada tick de cron atrasado por qualquer motivo
transitório de infraestrutura — o próprio design do ADR-0011 já assume que um ciclo pode ocasionalmente
demorar mais sem que isso seja incidente. ×3 dá margem para **dois ciclos perdidos completos** antes de
soar o alarme — generoso o bastante para não confundir jitter com incidente, apertado o bastante para
alarmar bem antes de qualquer leitor humano notar "isso não anda há muito tempo". O limiar é **derivado**
da cadência declarada, não um valor paralelo mantido à mão — se a cadência de um cargo mudar, o limiar
de alarme acompanha automaticamente, sem exigir uma segunda edição sincronizada em outro lugar do código.

**A questão que a primeira redação deste ADR deixou aberta já tem resposta, e ela valida o desenho.** A
investigação original citava `ATUALIZACAO_MIN_DEPUTADO = 15` e registrava como "questão aberta" um
briefing que mencionava 30 min sem ADR que sustentasse o número. O ADR-0036 (13/09) é exatamente esse
ADR: o cargo 6 saiu de granularidade UF para zona (par município×zona) pelo mesmo motivo que moveu o
Senador em 11/09 — com um único arquivo por UF, o bootstrap de RF-127 (spec 017) tinha uma única
unidade de reamostragem e o IC95 degenerava. A varredura de ~6.110 alvos a 5 rps precisa de 6 fatias de
~204s cada para caber no `maxDuration` de 300s, e 6 fatias de 5 min é a volta completa em 30 min —
`ATUALIZACAO_MIN_DEPUTADO` mudou de 15 para 30 no mesmo commit. A tabela acima já usa 30 min porque o
limiar é **derivado** da constante (não um número fixado à mão neste documento) — exatamente o
comportamento que a primeira redação já projetava para "se a cadência mudar". Nenhuma edição a este ADR
foi necessária além de atualizar o número na tabela.

**Mecanismo de alarme — reaproveitar `_alert_slack`, não construir um novo canal.** `_alert_slack`
(`api/model/project.py:3560-3590`) já é inerte sem `SLACK_WEBHOOK_URL` — lê `os.environ.get(
"SLACK_WEBHOOK_URL")`, e a ausência é logada como "slack alert skipped" em vez de lançar (`:3575-3590`)
— exatamente o comportamento "entra desligado, liga sozinho quando a variável existir" que o usuário
pediu (decisão 3 do briefing). Novo ponto de chamada: logo após computar `dado_ts`/`pares_atrasados`
(D2) em `_do_project` e `_do_project_proporcional`, comparar `now() - dado_ts` ao limiar da tabela
acima; se excedido, `_alert_slack("error", "dado do TSE parado", cargo=req.cargo, turno=req.turno,
dado_ts=dado_ts, lag_seconds=lag, pares_atrasados=pares_atrasados)`. Reaproveita o mesmo mecanismo já
usado para cadeiras divergentes (`project.py:3996-4004`) e para a guarda de sanidade do zona_merge
(ADR-0035) — nenhuma peça de infraestrutura nova, nenhum segundo canal de alerta a manter (constituição
§ 9).

`SLACK_WEBHOOK_URL` **não está configurada hoje** — decisão pendente do usuário, fora do escopo deste
ADR. Até que seja configurada, o alarme roda silenciosamente a cada ciclo (comparação + log), sem
nenhum efeito visível fora do log estruturado.

### D4 — A tela em dado parado: último valor conhecido + banner amarelo, gatilho é `dado_ts`, não `ts`

A constituição § 7 já exige "graceful degradation (último valor conhecido + banner amarelo)"; RNF-010/
RNF-012 (`docs/nfr/availability.md:13,15`) formalizam a mesma meta; a spec 003 já nomeia o estado
"**Erro de dados (>60s sem update)**" (`spec.md:108`) desde a redação original. Nenhum desses três nunca
teve um relógio que medisse "update de quê" — este ADR fecha essa lacuna: o gatilho do banner passa a
ser exatamente o mesmo cálculo do alarme de D3 (`now() - dado_ts > limiar do cargo`), calculado no
servidor a partir do `dado_ts` já presente no payload lido (nenhuma chamada nova ao TSE, nenhuma query
nova — o mesmo número que já veio no JSON).

Comportamento, por estado de `dado_ts`:

- **Presente, dentro do limiar** → nada muda visualmente; o texto normal (D1) mostra "Dado do TSE:
  HH:MM:SS".
- **Presente, além do limiar** → banner amarelo, texto proporcional à cadência do cargo (não um "60s"
  fixo herdado de spec 003 quando a tela é de Deputado): "Os dados do TSE não avançam há X min — a
  página segue mostrando o último apurado conhecido." A página **continua exibindo o último payload
  conhecido inteiro** — não esconde, não zera, não bloqueia interação — só acrescenta o aviso.
- **`null` explícito** → nenhum banner de "parado" (não há como calcular uma defasagem de um relógio
  que não existe neste ciclo); em vez disso, o texto de D1 já diz "hora do dado indisponível", o que já
  é a transparência honesta cabível.
- **Ausente do payload** (payload pré-ADR-0038, janela de rollout) → nenhum banner novo dispara; a tela
  se comporta como hoje, pelo tempo que durar o canary.

Este ADR não decide o nome exato do componente que renderiza esse banner nem sua posição no layout —
não existe hoje nenhum candidato em `components/` (busca por `banner`/`Reconectando`/`stale`/`degrad`
não encontra nenhum componente dedicado; a spec 003 descreve o estado em prosa, nunca foi implementado).
Cabe ao implementador decidir se estende `<ApuracaoMeta>` (que já renderiza "Última atualização") ou
cria um componente de shell dedicado — decisão de design de interface, fora do escopo arquitetural
deste documento.

### D5 — `DetailFreshness`: o sinal que já existe está correto para o que mede; ganha um segundo sinal independente, não uma reescrita

Investigação corrigiu uma leitura inicial errada deste ADR: `DetailFreshness`
(`components/atoms/surfaces/DetailUnavailable.tsx:126-146`) compara `resumoTs` (o `ts` do resumo,
Global Config) contra `ts` do detalhe (Blob, `splitUfPayload`, `lib/blob/uf-detail.ts:129`). As duas
escritas — `writeUfDetails`/`writeDeputadoUfDetails` (`lib/edge-config/writer.ts:1031,1194`) — são
**independentes e best-effort**: `Promise.allSettled`, nunca lançam, disparadas em paralelo ao resumo
(`writer.ts:941`, comentário em `:1183-1188`: "as duas escritas não são atômicas... um `ts` comum
esconderia justamente a divergência que ele deveria revelar"). Quando o Blob falha e o resumo não, o
Blob antigo persiste com seu carimbo do ciclo anterior, e no ciclo seguinte `resumoMs - detalheMs`
fica positivo e o aviso dispara — o mecanismo **funciona para o propósito com que foi construído**:
detectar que o detalhe (Blob) ficou para trás da escrita do resumo.

O que esse mecanismo **não pode** detectar, por construção, é o assunto deste ADR: os dois relógios que
ele compara são **relógios de escrita**. Se a ingestão parar, ambos continuam avançando a cada ciclo —
o Blob escreve sua hora de escrita, o resumo escreve a sua, os dois em sincronia, e `DetailFreshness`
fica mudo mesmo com o dado do TSE congelado há horas. É uma lacuna aditiva, não um defeito do mecanismo
existente.

**Decisão**: `DetailFreshness` mantém seu texto e seu cálculo atuais, intocados. A página de UF passa a
compor um **segundo** sinal, independente, ao lado dele — o banner de D4, alimentado por `dado_ts` do
próprio `EdgePayloadUf` já disponível na página (não precisa entrar no schema do Blob do ADR-0032; a
página já tem o resumo carregado antes de renderizar o detalhe municipal). Os dois textos não se fundem
em uma frase: "Blob mais velho que o resumo" e "dado do TSE parado" são falhas de causas diferentes
(uma é sobre a escrita do Blob deste servidor; a outra é sobre o TSE), e misturá-las numa única sentença
obrigaria o leitor a decifrar qual das duas está acontecendo.

**Correção cosmética, no mesmo arquivo**: no ciclo saudável, o detalhe é carimbado alguns instantes
**depois** do resumo (Python carimba `ts_iso` → POST → Node carimba o Blob), então
`Math.floor((resumoMs - detalheMs) / 60_000)` (`DetailUnavailable.tsx:129-131`) produz `-1` no caso
normal — inofensivo porque o texto só aparece com `lagMinutes >= 2`, mas o valor negativo vaza para o
atributo `data-lag-minutes` (`:138`), um atributo cujo nome promete "minutos de defasagem" e entrega um
número negativo. Correção decidida aqui: `Math.max(0, lagMinutes)` tanto no valor exibido quanto no
atributo. **Sem cobertura de teste hoje** (`grep -rn DetailFreshness tests/` → vazio) — qualquer
implementação de D4/D5 deve vir com teste que force os quatro estados de `dado_ts` (presente-fresco,
presente-velho, `null`, ausente) e o clamp do valor negativo, não só o caminho feliz.

## Alternativas rejeitadas

- **Renomear `ts` para `calculo_ts`/`model_ts` em vez de adicionar `dado_ts`.** Rejeitada (D1): o
  contrato de `ts` já é honesto no doc-comment; a mudança tocaria pelo menos seis pontos de código já
  em produção e seus testes, a 3 semanas do 1º turno, por um ganho que a adição do campo novo entrega
  sem esse risco.
- **Publicar o mínimo de `dg`/`hg` entre os pares como sinal de frescor.** Rejeitada (D2): estruturalmente
  velho por razões legítimas (zonas ainda não apuradas, zonas já encerradas) desde o início de toda
  corrida — produziria alarme permanente, não detecção de incidente.
- **Contar pares atrasados relativos a `now()` em vez de relativos ao `dado_ts` do próprio ciclo.**
  Rejeitada (D2): alarma sobre lulls legítimos do TSE (nenhuma novidade para ninguém agora) tanto quanto
  sobre o padrão de falha real (um par avança, os outros não) — não discrimina as duas causas, que têm
  respostas operacionais opostas.
- **Limiar de alarme absoluto, igual para todos os cargos.** Rejeitada (D3): calibrado para Presidente
  (60s) seria ruidoso a cada ciclo perdido de Deputado (30 min); calibrado para Deputado seria cego a
  horas de silêncio de Presidente/Governador.
- **Limiar de ×1 cadência (dispara no primeiro ciclo perdido).** Rejeitada (D3): o próprio ADR-0011 já
  assume ciclos ocasionalmente mais lentos como normais, não incidente; ×1 confundiria os dois.
- **Canal de alerta novo (e-mail, PagerDuty, webhook dedicado) em vez de `_alert_slack`.** Rejeitada
  (D3): duplica um mecanismo já existente e já inerte-por-padrão, adiciona superfície operacional nova
  a 3 semanas do 1º turno sem necessidade, e sai da stack 100% Vercel + canal único já em uso
  (constituição § 9).
- **Reaproveitar a `ts` de coleta que `fetch_snapshots` passou a selecionar em 2026-09-13
  (`r[5]`) como relógio do dado.** Rejeitada (D1): aquela coluna mede quando **nós** lemos a linha do
  banco, resolvendo um problema de dedup estrutural entre sentinela e zonas reais — continua sendo
  relógio de coleta, exatamente a categoria que este ADR já rejeita como substituto de `dado_ts`.
- **Reescrever `DetailFreshness` para comparar `dado_ts` contra o `ts` do detalhe.** Rejeitada (D5): o
  sinal atual (Blob atrasado do resumo) é uma falha genuinamente diferente de "TSE parou de publicar" —
  fundir as duas num único cálculo obrigaria o leitor a adivinhar qual causa está ativa a partir de um
  texto só.

## Consequências

**Positivas**:
- O leitor passa a ver a hora **do dado**, não a hora do cálculo — fecha a divergência entre contrato
  (`ts` sempre foi honestamente "hora do modelo" no doc-comment) e apresentação (a tela sempre chamou
  isso de "atualização").
- RNF-006 ("Defasagem TSE → tela", `docs/nfr/performance.md:17`) e a meta de constituição § 3 passam a
  ser **empiricamente verificáveis** pela primeira vez: até este ADR, o único relógio ponta a ponta era
  o de cálculo, que não mede a defasagem que a meta declara medir.
- O estado "Erro de dados (>60s sem update)" que a spec 003 descreve desde a redação original
  (`spec.md:108`) finalmente ganha um relógio real para decidir quando disparar — hoje não existe
  nenhum componente que implemente esse estado.
- Zero infraestrutura nova: reaproveita `_alert_slack` (já existente, já inerte sem
  `SLACK_WEBHOOK_URL`), os mesmos três envelopes de payload (nenhuma chave nova de Edge Config, nenhum
  novo Blob), e o `.passthrough()` já presente na validação de borda aceita os campos novos sem edição
  obrigatória de schema para a escrita não quebrar.
- `pares_atrasados`, calculado como subproduto do mesmo parse que já produz `dado_ts`, dá visibilidade
  a exatamente o cenário que o usuário nomeou como ponto cego do máximo cru (um par se mexe, 6.109
  não), sem custo de query adicional.
- Compatibilidade de leitura explícita para os três estados de `dado_ts` (presente, `null`, ausente)
  evita que o rollout deste ADR quebre a tela durante a janela de canary do Rolling Release.
- O limiar por cargo, sendo **derivado** da constante de cadência (D3) em vez de fixado à mão, já se
  provou: quando o ADR-0036 mudou `ATUALIZACAO_MIN_DEPUTADO` de 15 para 30 no meio da investigação
  deste documento, a tabela de limiares se atualizou trocando um número, sem reabrir nenhuma decisão.
- Desde o ADR-0036, os quatro cargos — não só três — chegam a `fetch_snapshots` em granularidade de
  par, o que dá a Deputado Federal a mesma resolução de `pares_atrasados`/`dado_ts` por UF que os
  demais cargos já tinham; antes, o cargo 6 não teria como se beneficiar de D2 (uma única linha por UF
  não produz sinal de "coverage parcial").

**Negativas**:
- **Parser Python de `dg`/`hg` é código novo, sem precedente no repositório** (`zona_merge.py` só cita
  esses campos como metadado não-aditivo, e `combinar_entradas` soma voto, não datas) — precisa portar
  fielmente a lógica tolerante de `calculateLagSeconds` (dois formatos de data, BRT fixo) para não
  divergir do comportamento já testado do lado TypeScript; um segundo parser divergente é exatamente a
  classe de bug que este projeto já pagou caro para descobrir tarde.
- **O limiar ×3 é uma escolha de engenharia sem validação empírica sob carga real** — não foi medido
  contra nenhum incidente real de pipeline parado; a primeira validação de verdade só vem com dado real
  do simulado (15–17/09) ou de um incidente de produção.
- **`pares_atrasados` não distingue "nosso pipeline falhou para este par" de "o TSE genuinamente não
  tem novidade só para este par específico"** — ele agrega os dois sob o mesmo número. Discriminar as
  duas causas exigiria um sinal adicional (ex. comparar contra o histórico de sucesso de ingestão por
  alvo), fora do escopo deste ADR.
- **`SLACK_WEBHOOK_URL` não está configurada** — o alarme de D3 fica mudo em produção até essa decisão
  pendente do usuário ser resolvida; até lá, a única forma de notar "dado parado" é o `dado_ts`/banner
  na própria tela (D4) e os logs estruturados.
- **O componente de banner de D4 não existe e este ADR não o especifica** — decisão de UI (nome,
  posição, se estende `<ApuracaoMeta>` ou é um componente novo) fica para a implementação, sem gate
  arquitetural definido aqui além do gatilho (`dado_ts` + limiar por cargo) e do texto mínimo exigido.
- **Replay 2022 roda inteiro com `dado_ts = null`** (fixture podada, sem `dg`/`hg`) — qualquer
  ferramenta futura que espere `dado_ts` populado a partir de fixtures de replay vai precisar tratar
  esse `null` explicitamente; não é um defeito deste ADR, mas é uma restrição herdada que a próxima
  pessoa a mexer no replay precisa conhecer.
- **`pares_atrasados` por UF multiplica o parse de `dg`/`hg` por 27** (uma vez por UF, além da vez
  nacional), agora nos **quatro** cargos — custo desprezível em CPU (~6.110 strings parseadas, já em
  memória), mas é mais um cálculo por ciclo que não existia antes, inclusive no ciclo de 30 min de
  Deputado, que antes do ADR-0036 nem tinha pares para parsear.
- **Este documento depende de um segundo ADR (0036) para o número correto de um dos quatro cargos** —
  se a cadência de Deputado mudar de novo, a tabela de D3 se recalcula sozinha a partir de
  `ATUALIZACAO_MIN_DEPUTADO`, mas a prosa que explica "por que 30 min" só faz sentido lida ao lado do
  ADR-0036.

## Cross-refs

- [ADR-0001](0001-edge-config-no-read-path.md) (Edge Config no read path — emendado: dois campos novos
  nos payloads já existentes, nenhum destino de armazenamento novo).
- [ADR-0011](0011-cadencia-60s.md) (cadência de 60s de Presidente/Governador — base do limiar ×3 de D3
  para esses dois cargos).
- [ADR-0012](0012-edge-config-chaves-nomeadas.md) (chaves nomeadas — nenhuma chave nova; os campos
  entram nos payloads das chaves já existentes).
- [ADR-0026](0026-cargos-senador-deputado-ingestao-e-read-path.md) (item 5 já exigia `ts` por payload e
  cadência legível por cargo — este ADR corrige o que esse `ts` mede e formaliza a cadência de Senador
  usada em D3, 5 min, conforme a nota (b) de reversão de granularidade do próprio ADR-0026).
- [ADR-0032](0032-detalhe-municipal-vercel-blob.md) (Blob de detalhe municipal — `DetailFreshness`
  ganha um segundo sinal independente na página, D5; nenhuma mudança ao schema do Blob em si).
- [ADR-0035](0035-par-municipio-zona-unidade-de-ingestao.md) (par município×zona como unidade de
  ingestão — `raw_snapshots`/`snapshots` em granularidade de par, já mantidos em memória pelos dois
  ramos do modelo, são a fonte de `dado_ts`/`pares_atrasados`, D1/D2).
- [ADR-0036](0036-deputado-federal-granularidade-zona-fatiada.md) (Deputado Federal em granularidade
  zona/par, 6 fatias, cadência de 30 min — fonte da linha de Deputado na tabela de D3, e razão pela qual
  o cargo 6 hoje se beneficia de `pares_atrasados`/`dado_ts` por UF como os outros três).
- ADR-0037 (agregação nacional do IC95 de cadeiras) — **ortogonal**: não toca relógios nem payload `ts`;
  citado só para registro de que os três ADRs (0036, 0037, este) nasceram da mesma janela de trabalho
  em `api/model/`.
- Constituição § 1 (dado oficial intocável — `dg`/`hg` vêm do envelope cru, nunca recalculados), § 3
  (defasagem TSE→tela — passa a ser mensurável de verdade, D1), § 6 (determinismo — `dado_ts` é
  reproduzível a partir do mesmo `payload` já persistido append-only), § 7 (resiliência — banner
  amarelo + último valor conhecido, D4), § 8 (transparência metodológica — `pares_atrasados` como
  detalhe auditável, cadência legível por cargo), § 9 (stack 100% Vercel — `_alert_slack` reaproveitado,
  nenhuma infraestrutura nova).
- `docs/nfr/performance.md` (RNF-006 — passa a ser verificável contra `dado_ts`, não só inferido da
  cadência do cron).
- `docs/nfr/availability.md` (RNF-010, RNF-012 — o banner amarelo que essas metas exigem ganha, pela
  primeira vez, um gatilho real).
- `docs/specs/001-ingestao-tse/spec.md` — RF de ingestão deve citar este ADR (o parser de `dg`/`hg` é
  extensão do que `calculateLagSeconds`/RNF-033 já fazem no lado de ingestão).
- `docs/specs/002-modelo-estatistico/spec.md` — `fetch_snapshots`/`raw_snapshots` ganham novo consumidor
  (D1/D2); gate OT-4 precisa continuar rodando com `dado_ts = null` sobre a fixture podada (Contexto).
- `docs/specs/003-home-nacional/spec.md` — o estado "Erro de dados (>60s sem update)" (`spec.md:108`)
  ganha implementação real pela primeira vez (D4).
- `docs/specs/004-pagina-uf-presidencial/spec.md`, `docs/specs/005-pagina-uf-governador/spec.md`,
  `docs/specs/016-senador/spec.md` — `EdgePayloadUf.dado_ts`/`pares_atrasados` (D2) e o banner de D4 na
  página de UF.
- `docs/specs/006-grid-governadores/spec.md` — grid nacional deve refletir `dado_ts` por UF quando
  aplicável.
- `docs/specs/017-deputado-federal/spec.md` — **já lista `0036`/`0037` no frontmatter `adrs:`** (spec
  `shipped`, `ship_blocked_on: []`); deve passar a listar também este ADR. RF-128 (`spec.md:229-238`,
  "Cadência de 30 minutos visível") já cita o ADR-0036 para o número 30; deve citar este ADR como o
  relógio correto ao lado de `atualizacao_min`. D5 (correção cosmética de `DetailFreshness`) é
  compartilhada com o Blob de Deputado (`DeputadoUfDetail`).
- `docs/operations/runbook.md` — precisa de seção descrevendo o novo alarme (`_alert_slack`, limiares
  por cargo) e o que fazer quando ele disparar.
- `docs/reference/risks.md` — pendente de nova linha: alarme de dado parado depende de
  `SLACK_WEBHOOK_URL`, ainda não configurada (propagação sugerida).
