---
id: ADR-0028
title: Corrida explícita por rota, não corrida ativa única — currentRace() passa a resolver só o turno presidencial
status: accepted
date: 2026-09-07
---

# ADR-0028 — Corrida explícita por rota, não corrida ativa única

## Status

Aceito. Este ADR resolve a nota de implementação aberta no item 2 da Decisão do
[ADR-0026](0026-cargos-senador-deputado-ingestao-e-read-path.md) ("o repositório hoje tem dois
tipos `Cargo` distintos e não relacionados"). Não emenda o texto do ADR-0026 — o alcance é maior
que o título daquele ADR (que é sobre ingestão e read path de Senador/Deputado): a mudança de
semântica de `currentRace()` atinge também Presidente e Governador, cargos já `shipped` nas specs
003, 004, 005 e 006, que não têm relação de escopo com o ADR-0026.

## Contexto

`lib/config/calendar.ts:86` define `currentRace(now)`, que percorre um calendário **linear**
(`CALENDAR_2026`, 3 entradas, todas com `cargo: "pres"`, `calendar.ts:59-70`) e devolve a corrida
com maior `start <= now`. `lib/edge-config/reader.ts:63,132,164` — os três readers do read path
(`readProjection`, `readArchivedProjection`, `readUfProjection`) — chamam `currentRace()` e usam
`race.cargo`/`race.turno` como **default** quando o caller não passa `opts.cargo`/`opts.turno`
explícito. Esse desenho pressupõe que existe **uma** corrida ativa por vez — verdadeiro quando o
site cobria só Presidente, falso a partir do momento em que Governador entrou (mesmo calendário,
UF diferente) e definitivamente falso em 04/10/2026, quando Presidente, Governador, Senador e
Deputado Federal apuram **simultaneamente** (pré-requisito das specs 016 e 017, formalizado no
ADR-0026, aceito nesta mesma data).

O repositório tem, hoje, **dois tipos `Cargo` sem relação entre si**: `lib/edge-config/types.ts:45`
(`1 | 3`, código numérico do TSE, usado no payload `EdgePayload.cargo`/`EdgeUfCandidate` etc.) e
`lib/config/calendar.ts:24` (`"pres" | "gov"`, string usada exclusivamente para nomear a chave do
Edge Config — `projection:current:<cargo>:t<turno>` e `projection:uf:<sigla>:<cargo>:t<turno>`,
ADR-0012). O ADR-0026 já havia identificado essa duplicidade (item 2 da Decisão) e a ampliado com
novos tokens de calendário para Senador/Deputado, mas deixou explicitamente em aberto **qual dos
dois modelos de calendário resolveria** o problema de corrida ativa única — o próprio texto lista
duas alternativas sem decidir, remetendo a decisão para "o início do Bloco 3 (spec 016)", conforme
também registrado em `docs/_meta/handoff-2026-09-07-redesign.md:100-111` (mesma investigação que
originou este ADR).

Os call sites hoje já divergem em disciplina: as rotas de Governador **já** passam cargo/turno
explícitos — `app/governador/page.tsx:170-171` (`readProjection({ cargo: "gov", turno: 1 })` e
`{ cargo: "gov", turno: 2 }`) e `app/uf/[sigla]/governador/page.tsx:221`
(`readUfProjection(sigla, { cargo: "gov", turno: 1 })`). As rotas presidenciais **não** passam —
`app/uf/[sigla]/page.tsx:237` (`readUfProjection(sigla)`), `app/page.tsx:120`
(`readNationalProjection()`, wrapper que chama `readProjection()` sem args),
`app/api/projection/route.ts:53` (`readUfProjection(sigla)`) e `app/api/projection/route.ts:91`
(`readNationalProjection()`) — todas dependendo do default implícito de `currentRace()`. Essa
assimetria só não quebrou nada até agora porque, coincidentemente, o default de `currentRace()` é
sempre `cargo: "pres"` (nenhuma entrada de `CALENDAR_2026` tem `cargo: "gov"`) — ou seja, as rotas
presidenciais "acertam por sorte", não por desenho.

Três alternativas foram avaliadas para resolver a corrida ativa única:

- **(A) Corrida explícita por rota** — cada página/rota declara o próprio cargo ao chamar o
  reader; `currentRace()` deixa de ser "qual corrida está no ar" e vira apenas "em que turno está
  a corrida presidencial" (única coisa genuinamente dirigida por data no calendário 2026).
  **Escolhida.**
- **(B) Calendário devolve um conjunto de corridas ativas** — `currentRace()` viraria
  `currentRaces(): Race[]`, com as 4 corridas simultâneas em 04/10. Rejeitada: muda a assinatura
  usada pelos 3 readers e por todos os testes que hoje esperam um `Race` singular, e **ainda
  assim** exige que cada rota diga qual cargo quer dentro do conjunto (um caller não pode "usar o
  array inteiro" — precisa filtrar por cargo de qualquer forma). Paga o custo de uma reforma maior
  sem eliminar a explicitação que (A) já entrega de graça.
- **(C) Manter `currentRace()` e adicionar um mapa `RACE_BY_CARGO`** — um segundo lookup ao lado
  do calendário linear, indexado por cargo. Rejeitada: cria **duas fontes de verdade** sobre o
  calendário que podem divergir silenciosamente (ex.: alguém atualiza `CALENDAR_2026` para uma
  virada de turno e esquece de espelhar em `RACE_BY_CARGO`), e mantém o nome `currentRace()`
  enganoso — continuaria parecendo devolver "a" corrida ativa quando na prática só uma leitura
  (presidencial) usaria seu resultado de fato.

## Decisão

**1. `currentRace()` muda de significado.** Deixa de ser "qual corrida está ativa" (não existe
mais "a" corrida ativa — há até 4 simultâneas) e passa a significar exclusivamente "em que turno
está a corrida presidencial neste instante" (1T antes de 04/10/2026, 2T a partir de 25/10/2026).
`CALENDAR_2026` continua com 3 entradas, todas `cargo: "pres"` — nenhuma mudança de dado, só de
contrato semântico. `currentCargo()` (`calendar.ts:114`) passa a ser redundante por construção
(sempre retorna `"pres"`, já que `CALENDAR_2026` não tem outra entrada) — ver item 3 sobre
renomeação/remoção.

**2. Os dois tipos `Cargo` continuam existindo, sem fusão.** `lib/edge-config/types.ts:45`
(`Cargo = 1 | 3`, código numérico do TSE) permanece o tipo do **payload** — o que o modelo e o
orchestrator entendem como cargo. `lib/config/calendar.ts:24` (`Cargo = "pres" | "gov"`, string)
permanece o tipo de **namespacing de chave** do Edge Config (ADR-0012) — o que o read path usa
para montar `projection:current:<cargo>:t<turno>` / `projection:uf:<sigla>:<cargo>:t<turno>`. Este
ADR não funde os dois tipos nem propõe um terceiro — a duplicidade já foi avaliada e mantida
deliberadamente pelo ADR-0026 (item 2), que estendeu ambos (`1 | 3 | 5 | 6` no numérico; novos
tokens `"sen"`/`"dep"` no de calendário). O que muda aqui é só quem **decide** qual valor do tipo
de calendário entra em cada chamada de reader: antes, `currentRace()` decidia por default; agora,
o caller decide sempre.

**3. Call sites passam a declarar cargo/turno explicitamente — sem exceção para Presidente.**
As rotas presidenciais deixam de contar com o default implícito:

- `app/page.tsx:120` — `readNationalProjection()` (wrapper que hoje chama `readProjection()` sem
  args) passa a resolver `readProjection({ cargo: "pres", turno: currentTurno() })` (ou o
  equivalente após a renomeação do item 4). `app/page.tsx:138` já passa `{ cargo: "pres", turno: 1
  }` explícito para `readArchivedProjection` — vira o padrão a replicar, não a exceção.
- `app/uf/[sigla]/page.tsx:237` — `readUfProjection(sigla)` passa a
  `readUfProjection(sigla, { cargo: "pres", turno: currentTurno() })`.
- `app/api/projection/route.ts:53` (`readUfProjection(sigla)`) e `app/api/projection/route.ts:91`
  (`readNationalProjection()`) recebem o mesmo tratamento.

As rotas de Governador (`app/governador/page.tsx:170-171`,
`app/uf/[sigla]/governador/page.tsx:221`) não mudam — já fazem o que este ADR exige de todo mundo.
Senador e Deputado Federal (specs 016/017, a implementar) declaram `cargo: "sen"` / `"dep"` e
`turno: 1` fixo (ambos decidem em turno único) e **não consultam o calendário em nenhum momento**
— nem para cargo, nem para turno.

**4. Renomeação recomendada.** `currentRace()` que só resolve turno presidencial sob um nome que
sugere "qualquer corrida ativa" é uma armadilha para o próximo leitor. Recomenda-se renomear:

- `currentRace()` → `currentPresidentialRace()`.
- `currentTurno()` (`calendar.ts:109`) → `currentPresidentialTurno()`.
- `currentCargo()` (`calendar.ts:114`) → **remover**. Levantamento de uso (`grep` em todo o
  repositório fora de `docs/`) mostra **zero call sites reais** — a única ocorrência fora da
  própria definição é uma referência em JSDoc (`reader.ts:55`). Não há custo de migração; manter a
  função seria manter morto o próprio sintoma que este ADR corrige (um cargo "ativo" genérico que
  não existe mais).

Custo de implementação (medido por grep, não estimado): `currentRace` aparece em **2 arquivos** —
`lib/config/calendar.ts` (definição + 3 usos em comentários/doctest) e `lib/edge-config/reader.ts`
(3 call sites reais: `readProjection`, `readArchivedProjection`, `readUfProjection` — mais 2
menções em JSDoc). Nenhum arquivo em `app/`, `components/` ou `tests/` importa `currentRace`,
`currentCargo` ou `currentTurno` diretamente — todo o `app/` consome via os 3 readers. A
renomeação é, portanto, um `rename` de baixo raio de explosão (2 arquivos, ~10 ocorrências
incluindo comentários), não uma refatoração. Este ADR **decide** a renomeação como parte do
contrato; a execução (fora do escopo deste documento, que não edita código) cabe à próxima sessão
de implementação, junto com o item 3.

**5. Fallback legado é presidencial, não genérico.** O fallback sem cargo em
`lib/edge-config/reader.ts` (`projection:current` sem sufixo, linha 77; `projection:uf:<sigla>`
sem sufixo, linha 176) existe para compatibilidade com payloads S04, gravados antes do
namespacing por cargo (ADR-0012). Esse fallback só é semanticamente correto para a corrida
presidencial — é o único cargo que já existia quando as chaves legadas foram gravadas. Ele **não
deve ser estendido** a Senador nem a Deputado Federal: não existe payload legado desses cargos, e
uma chave `projection:uf:SP` sem sufixo nunca deve ser interpretada como "Senador de SP" só porque
o Edge Config a devolveu não-nula. A condição de guarda já presente no código (`cargo === race.cargo
&& turno === race.turno`, `reader.ts:76,175`) captura isso corretamente hoje porque `race.cargo`
só é `"pres"` — mas depois da renomeação do item 4, essa condição deve ser reescrita para comparar
contra a constante literal `"pres"`, não contra o resultado de uma função de calendário, para que
a intenção ("legado só vale pra presidencial") fique legível no código sem depender de saber que
`currentPresidentialRace().cargo` é sempre `"pres"` por construção do calendário.

## Consequências

**Positivas**:
- `currentRace()` (ou seu nome renomeado) passa a fazer exatamente o que o nome diz depois do item
  4 — elimina a armadilha de uma função cujo escopo real (turno presidencial) é mais estreito que
  seu nome sugere (qualquer corrida).
- Nenhuma mudança no modelo de dados do calendário (`CALENDAR_2026` continua com 3 entradas) nem
  na assinatura dos 3 readers — `opts.cargo`/`opts.turno` já existiam como override opcional desde
  S05/F4c; este ADR só torna obrigatório, por convenção de código (não de tipo), que Presidente
  também os passe.
- Evita a segunda fonte de verdade da alternativa (C) e a reforma de assinatura da alternativa
  (B) — o custo de implementação fica concentrado em 4 call sites (item 3) + rename de baixo
  impacto (item 4).
- Desacopla Senador/Deputado do calendário por completo — nenhum dos dois cargos jamais precisa
  ler `CALENDAR_2026`, o que evita a tentação futura de "adicionar mais uma corrida ao calendário
  linear" e reproduzir o problema original.

**Negativas**:
- **Falha silenciosa permanece possível.** Uma rota nova (ou um caller futuro de Senador/Deputado)
  que esqueça de passar `cargo` explícito continua caindo no default presidencial dos 3 readers —
  sem erro, sem warning, com um payload plausível (o presidencial) no lugar do esperado. Este ADR
  **não** torna `cargo` um parâmetro obrigatório no nível de tipo dos 3 readers existentes, porque
  isso quebraria a compatibilidade deles com o uso presidencial legítimo que ainda depende do
  default (ex.: o próprio `readNationalProjection()` antes de ser migrado pelo item 3).
  **Mitigação proposta** (fora do escopo de implementação deste ADR, a decidir na próxima sessão):
  (i) para Senador — e qualquer cargo novo que só existir a partir daqui — expor um reader
  dedicado sem overload opcional (ex. `readSenadorUfProjection(sigla, turno)`, cargo fixo por
  nome de função, não por parâmetro com default), de forma que o TypeScript recuse a compilação de
  um caller que esqueça o cargo, em vez de aceitar silenciosamente; (ii) um teste de regressão
  (grep-based, ao estilo `constitution-guard`) que falha o CI se `app/page.tsx`,
  `app/uf/[sigla]/page.tsx` ou `app/api/projection/route.ts` chamarem `readProjection`,
  `readArchivedProjection` ou `readUfProjection` sem o segundo argumento `opts.cargo` — pega
  exatamente a regressão que este ADR corrige, sem alterar a assinatura pública dos readers.
- **Rename é uma dívida se não for executado junto com o item 3.** Enquanto `currentRace()`
  mantiver o nome atual, o contrato deste ADR só existe em documentação — o código continua
  parecendo devolver "a corrida ativa" para quem não leu este ADR. O custo do rename é baixo
  (item 4), mas baixo custo não é custo zero: 2 arquivos tocados exigem re-rodar a suíte de testes
  de `lib/config/calendar.test.ts` e `lib/edge-config/reader.test.ts` (nomes de arquivo
  presumidos — a próxima sessão confirma os caminhos reais).
- **Não resolve a causa raiz de fundo:** o calendário `CALENDAR_2026` continua sendo, estruturalmente,
  um artefato pensado para 1 cargo. Se um dia o Brasil tiver um calendário com datas diferentes
  por cargo (ex. 2º turno de Governador em data distinta da de Presidente, o que não é o caso em
  2026), o modelo "currentPresidentialRace() é a única coisa dirigida por data" ainda serve — mas
  Senador/Deputado, ao não consultarem calendário algum, ficariam sem um mecanismo para expressar
  uma futura mudança de data caso um dia precisassem de uma. Aceitável para 2026 (ambos decidem em
  turno único, sem 2º turno, conforme ADR-0026 item 1); registrado aqui para não ser esquecido se
  o calendário eleitoral mudar em ciclos futuros.

## Cross-refs

- [ADR-0026](0026-cargos-senador-deputado-ingestao-e-read-path.md) — origem da nota de
  implementação que este ADR resolve (item 2 da Decisão); não emendado por este ADR (escopo maior
  que o título do 0026 cobre).
- [ADR-0012](0012-edge-config-chaves-nomeadas.md) — introduziu `currentRace()` e o namespacing de
  chave por cargo/turno que este ADR não altera, só disciplina quem invoca o default.
- [ADR-0001](0001-edge-config-no-read-path.md) — read path (Edge Config + Blob por ADR-0026)
  permanece inalterado; este ADR não é uma exceção a ele, só regula os call sites que chegam até
  ele.
- `docs/_meta/handoff-2026-09-07-redesign.md:100-111` — investigação original que identificou o
  problema e já recomendava a alternativa (A), adotada aqui.
- Specs a atualizar (frontmatter `adrs:`): `docs/specs/003-home-nacional/spec.md`,
  `docs/specs/004-pagina-uf-presidencial/spec.md` (call sites presidenciais tocados pelo item 3);
  `docs/specs/016-senador/` e `docs/specs/017-deputado-federal/` (a criar — devem citar este ADR
  desde o rascunho, já que a spec 016 é o gatilho original desta decisão).
- `docs/architecture/data-model.md` — se documentar o contrato dos readers, precisa refletir que
  `cargo`/`turno` deixam de ter default implícito para Presidente.
