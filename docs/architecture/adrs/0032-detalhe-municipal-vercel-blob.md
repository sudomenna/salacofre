---
id: ADR-0032
title: Detalhe municipal e séries por UF em Vercel Blob, não no store do Edge Config — resumo por UF permanece, com correção do limite real (1 MB) e guarda de store inteiro
status: accepted
date: 2026-09-08
amends: 0001, 0026
---

# ADR-0032 — Detalhe municipal e séries por UF em Vercel Blob, não no store do Edge Config

## Status

Aceito.

### Emenda 2026-09-11 — `eleitores`/`capital` somados ao objeto Blob (ADR-0035 D2)

**Nota 2026-09-11 ([ADR-0035](0035-par-municipio-zona-unidade-de-ingestao.md) D2).** `EdgeUfMunicipio`
ganha dois campos opcionais no mesmo objeto Blob que este ADR já definia: `eleitores?: number` (soma
do eleitorado dos pares do município) e `capital?: boolean` (emitido só quando `true`). Nenhum
destino de armazenamento novo é criado — os dois campos entram no mesmo
`municipios:uf:<sigla>:<cargo>:t<turno>.json` que este ADR já especificava. A soma de eleitorado por
município passou a ser exata (soma dos pares reais), não mais dependente da tabela `zonas` antiga
(um município por zona) que o `LEFT JOIN` removido por esta mudança usava.

Este ADR **emenda o ADR-0001** e o **ADR-0026** — não os supersede. O princípio central do
ADR-0001 (Postgres fora do read path) permanece intacto. O ADR-0026 abriu uma exceção pontual ao
ADR-0001 para o Vercel Blob, restrita ao drill-down de UF de Deputado Federal; este ADR generaliza
essa exceção: o Blob passa a ser o destino de **qualquer** detalhe por UF cujo volume seja
incompatível com o orçamento do store inteiro do Edge Config — o detalhe municipal de
Presidente/Governador é o segundo caso, não o último, e reutiliza o mesmo mecanismo e o mesmo
esquema de nomeação, sem inventar um terceiro padrão. Este ADR também corrige um número que os dois
ADRs anteriores herdaram errado: o limite real do Edge Config — produto renomeado pela Vercel para
"Global Config", changelog + `/docs/global-config/global-config-limits` atualizado em 2026-07-29 —
é **1 MB por store inteiro** (todas as chaves e valores somados, igual em Hobby/Pro/Enterprise), não
os 512 KB que `lib/edge-config/writer.ts:171,266,275,317,325` codifica hoje como `hardLimit`.

## Contexto

O read path de UF (`EdgePayloadUf`, `lib/edge-config/types.ts:687-787`) inclui hoje o array
`municipios: EdgeUfMunicipio[]` (linha 703) inline na mesma chave que carrega candidatos, agulha,
bucket e mesorregiões — `projection:uf:<sigla>:<cargo>:t<turno>` mais o alias legado
`projection:uf:<sigla>` (ADR-0012, `lib/edge-config/writer.ts:330-336`). O comentário de cabeçalho de
`types.ts:22-26` ainda estima esse envelope em "<20 KB por UF" com base em amostras da S05 — uma
estimativa de viabilidade nunca remedida contra o volume nacional real, exatamente o mesmo padrão de
erro que o ADR-0030 encontrou no orçamento de bundle above-the-fold.

**Medição de hoje, não estimativa.** O banco tem 5.572 municípios em 27 UFs. O custo médio por
município, medido no payload real de MG (56.087 B para 272 municípios), é ~206 B. Isso dá, para o
array `municipios` **sozinho**, sem nenhum outro campo do payload:

- **1,10 MB** para os 5.572 municípios de UM cargo, à cobertura plena.
- **2,19 MB** somando Presidente + Governador.

O primeiro número já é decisivo por si: **1,10 MB excede o 1 MB inteiro do store**, mesmo ignorando
por completo `national`, `por_uf`, candidatos, agulha, mesorregiões e a duplicação nomeada+alias
(ADR-0012) que grava cada UF em duas chaves. Não há orçamento possível em que os arrays de
municípios de um único cargo caibam inteiros no store — a questão não é "quanto sobra de margem",
é que o dado, à cobertura plena, **não cabe por definição** de limite de produto.

O problema não é hipotético nem distante: hoje a cobertura municipal é de 2.180 de 5.572 municípios
(39% — dívida já declarada, constituição § 8). Só esses 2.180 municípios, ao custo médio medido,
somam ~449 KB **apenas de `municipios`**, por cargo — um número que já rondaria o warn antigo de
450 KB (`EDGE_CONFIG_SIZE_WARN_BYTES`, `writer.ts:171`) contando só este campo, antes de somar
candidatos, `por_uf`, `national` ou a duplicação de chave. **O payload cresce conforme a cobertura
municipal melhora** — ou seja, a escrita tende a ser recusada precisamente na madrugada da apuração,
quando a cobertura fica mais completa e o dado mais importa. Isso precisa estar resolvido antes do
simulado 1 (15–17/09) — a 26 dias do 1º turno (04/10/2026) — porque é exatamente esse tipo de
condição de borda, invisível em preview com dado esparso, que um simulado com carga real deveria
expor primeiro em produção, não na noite da eleição.

Há um segundo problema de fundo, independente do volume: `writer.ts` **nunca mediu o store**. O
`EDGE_CONFIG_SIZE_WARN_BYTES` (450 KB) e os warns dedicados por chave (`EDGE_CONFIG_NATIONAL_WARN_
BYTES` 75 KB, `EDGE_CONFIG_UF_WARN_BYTES` 20 KB) medem o `JSON.stringify` de **um único item sendo
gravado naquela chamada** — nunca a soma de todas as chaves que já existem no store (as duas chaves
nacionais, as 2×27 chaves de UF nomeada+alias, `projection:archive:*` pós-virada de turno, e — assim
que Senador entrar pelo ADR-0026 — mais um conjunto inteiro de chaves `:sen:t1`). Não existe hoje
nenhum ponto no código que pergunte "quanto o store inteiro está ocupando neste momento" antes de
escrever. É a guarda que falta, e é ortogonal a onde o detalhe municipal mora: mesmo depois deste
ADR mover municípios para Blob, o store segue crescendo (mais cargos, mais chaves nomeadas,
`projection:uf:<sigla>:series-por-cand` cotado em `types.ts:710-717` como chave dedicada futura) e
precisa de uma guarda real, não de um comentário que cita um limite errado.

O `@vercel/edge-config` (pacote npm) continua com esse nome — a Vercel mantém o pacote funcionando
sob o nome antigo e publica um guia de migração para quem quiser adotar o novo nome de produto,
"Global Config"; não há prazo forçado de migração de pacote.

## Decisão

**1. Fronteira campo a campo.** `EdgePayloadUf` (`lib/edge-config/types.ts:687-787`) deixa de
carregar dois campos inline, que passam a viver em Vercel Blob:

- `municipios: EdgeUfMunicipio[]` (linha 703) — **sai** do Edge Config. É o campo que motiva este
  ADR (1,10 MB/cargo à cobertura plena).
- `series_temporais?: EdgeUfSeriesTemporais` (linha 719) — **sai** também. O próprio comentário do
  campo (`types.ts:610-620`) já registrava um carry-over não resolvido: "se aproximar dos 450KB no
  payload total da UF, paginar via chave separada `projection:uf:<sigla>:series`" — uma saída
  cogitada e nunca formalizada. Este ADR fecha essa lacuna definindo o destino como **Blob**, não uma
  segunda chave de Edge Config: é o mesmo tipo de dado, cresce com o tempo de apuração (até ~480
  pontos × 3 séries por UF), e não há razão para abrir um terceiro padrão de armazenamento quando o
  Blob já resolve exatamente esse formato de crescimento.
- A nota de `types.ts:710-717` sobre uma futura chave dedicada `projection:uf:<sigla>:series-por-
  cand` (série por candidato, ainda sem tipo formal, S06+) fica **resolvida por este ADR antes de
  existir**: quando essa evolução for implementada, o destino é o mesmo objeto Blob deste ADR (ou um
  Blob irmão no mesmo esquema de caminho), nunca uma nova chave de Edge Config. Uma série por
  candidato multiplica o custo de `series_temporais` pelo número de candidatos — o mesmo argumento de
  volume que tira `municipios` do Edge Config se aplica com mais força ainda aqui.

Permanecem em `EdgePayloadUf` (sem mudança): `uf`, `ts`, `cargo`, `turno`, `pct_apurado`,
`candidatos: EdgeUfCandidate[]` (~11 candidatos, poucos KB), `needle_position`, `needle_band`,
`mesorregioes?: EdgeMesorregiao[]` (bounded, ~80–120 B/linha, SP ~1,5–2 KB — não cresce com a noite
de apuração, cresce só com o número de mesorregiões, que é fixo), `model_fallback_tier`,
`participacao?: EdgeParticipacao`. Nenhum campo do payload nacional (`EdgePayload`, `types.ts:507-
524`) muda — `por_uf: EdgeUfRow[]` já é um resumo sem municípios. A linha divisória é: **estado atual
resumido e limitado por construção** (Edge Config) vs. **detalhe que cresce com cobertura municipal
ou com o tempo decorrido de apuração** (Blob).

**2. Esquema de caminho — o mesmo padrão do ADR-0026, estendido, não um segundo padrão.** O ADR-0026
já fixou `deputado:uf:<sigla>.json` (pathname fixo, `allowOverwrite: true`, URL determinística) para
um cargo sem concorrência de turno/cargo na mesma chave. Presidente e Governador coexistem em
turno e cargo simultâneos (ADR-0012), então o caminho precisa dos mesmos qualificadores que a chave
de Edge Config já usa — não um esquema novo, a mesma extensão que o ADR-0026 já aplicou ao criar
`:sen`/`:dep` em cima do padrão existente:

```
municipios:uf:<sigla>:<cargo>:t<turno>.json
```

Ex.: `municipios:uf:SP:pres:t1.json`, `municipios:uf:SP:gov:t1.json`. O objeto JSON nesse blob
carrega `{ ts, uf, cargo, turno, municipios: EdgeUfMunicipio[], series_temporais:
EdgeUfSeriesTemporais | null }` — os dois campos removidos do item 1, bundlados num único fetch por
UF/cargo/turno (mesmo princípio do Deputado: "a lista completa de candidatos... é carregada lazy no
client a partir do mesmo blob", ADR-0026 — um único objeto por recurso composto, não um blob por
campo). `ts` no objeto Blob é **próprio**, independente do `ts` do payload de Edge Config: os dois
mecanismos de escrita não são atômicos entre si (ver Consequências), e a UI precisa poder mostrar a
frescor real do detalhe municipal separada da frescor do resumo.

Escrita: `put()` do SDK `@vercel/blob` com pathname fixo e `allowOverwrite: true`, produzindo a mesma
URL determinística toda vez — reaproveitar a mesma função utilitária que o ADR-0026 introduz para
Deputado (construir a URL a partir do pathname, sem índice/lookup) em vez de duas implementações
paralelas. Como nenhum código do repositório importa `@vercel/blob` hoje (confirmado por grep, igual
ao que o ADR-0026 já constatara), a implementação que materializa este ADR e a que materializa o
ADR-0026 devem compartilhar o mesmo módulo de escrita/leitura Blob — não é opcional, é a razão de
existir um "esquema de caminho" único em vez de dois ad hoc.

**3. Leitura — servidor, com `revalidate`, degradação explícita.** A página de UF faz `fetch` da URL
determinística do Blob **no servidor** (nunca client-side direto, mesma regra do ADR-0026), com
`next: { revalidate: 60 }` — alinhado à cadência de escrita de 60s de Presidente/Governador
(ADR-0011; os únicos cargos com `municipios` populado — Senador é granularidade UF sem detalhe
municipal, ADR-0026, e Deputado já tem seu próprio Blob). Este fetch corre **em paralelo** com
`readUfProjection()` (Edge Config), não em série — a página não deve esperar o Blob para começar a
renderizar o resumo.

Modo de falha, explícito porque agora há **dois** read paths com dois modos de falha diferentes
(consequência já nomeada pelo ADR-0026, que se repete e se agrava aqui):

- Blob 404 (chave nunca escrita — ex. cargo/turno novo, ou UF cuja cobertura municipal ainda é 0%) →
  seções de detalhe municipal (`<MunicipioTable/>`, mapas de município, os charts de série temporal)
  renderizam em estado "detalhe indisponível" explícito, **sempre no DOM** (mesmo princípio do
  ADR-0017 aplicado a uma fonte de dado, não só a uma camada de candidato) — nunca escondem o bloco
  nem mostram silenciosamente vazio.
- Blob stale (fetch expira/erra, CDN serve versão anterior além do `revalidate`) → a UI usa o `ts`
  próprio do objeto Blob (item 2) para rotular a idade do detalhe municipal — pode ficar visivelmente
  mais velho que o `ts` do resumo de Edge Config, e a UI **não deve** silenciar essa diferença.
- Edge Config indisponível mas Blob OK (ou vice-versa) → a página degrada por seção, não por inteiro:
  o resumo (candidatos, agulha, bucket) e o detalhe municipal falham **independentemente**.

**4. Guarda de store inteiro — a peça que falta hoje.** O writer precisa medir o **store inteiro**
antes de escrever, não a chamada individual. Isso exige um `GET /v1/edge-config/<id>/items` prévio
(soma de todos os itens já existentes) menos o tamanho antigo das chaves que este ciclo vai
sobrescrever, mais o tamanho novo das chaves que vai escrever — não um cálculo local isolado por
chave como `EDGE_CONFIG_SIZE_WARN_BYTES` faz hoje.

O limite oficial documentado é **1 MB por store inteiro** — tratado aqui, por convenção binária (a
mesma que o código já usa hoje para `512 * 1024`), como **1.048.576 B**. Três limiares, não um só,
seguindo o mesmo padrão de piso operacional abaixo do limite oficial que o repositório já usa em
dois lugares — ΔE76 operacional 12 contra o mínimo constitucional 10 (ADR-0031), e orçamento de
aplicação separado de piso de framework (ADR-0030):

| Constante | Valor | Margem sob 1.048.576 B | Comportamento |
|---|---|---|---|
| `EDGE_CONFIG_STORE_WARN_BYTES` | `900 * 1024` = 921.600 B | 126.976 B (12,1%) | `logWarn` — não bloqueia. Mesma margem proporcional (~12%) que o repositório já usava entre o antigo warn (450 KB) e o antigo hard limit assumido (512 KB) — continuidade de um padrão que já existia, agora aplicado ao número certo. |
| `EDGE_CONFIG_STORE_GUARD_BYTES` | `960 * 1024` = 983.040 B | 65.536 B (6,25%) | **Recusa a escrita antes de chamar a API da Vercel** — throw com o total medido, o limite real e a lista de chaves que mais pesam no store. Existe porque hoje a única "guarda" é deixar a Vercel devolver 413, sem diagnóstico útil no log. |
| `EDGE_CONFIG_STORE_HARD_LIMIT_BYTES` | `1024 * 1024` = 1.048.576 B | 0 | Documentado pela Vercel; nunca deve ser alcançado em produção — se for, o guard (linha acima) já deveria ter interrompido a escrita antes. |

Por que 900/960 e não outro par: a margem de 12,1% do warn preserva a mesma proporção que o código já
tinha (450/512 ≈ 87,9% do limite assumido — aqui, 921.600/1.048.576 ≈ 87,9%), então é uma correção de
número, não uma mudança de filosofia de margem. A margem do guard (6,25%) é deliberadamente menor —
existe para cobrir variância entre a serialização local (`JSON.stringify`) e a contabilização real do
lado da Vercel (overhead de armazenamento por item, se houver), não para ser uma segunda linha de
warn. Um guard com a mesma margem do warn não teria função própria.

Limitação honesta desta guarda: o `GET` prévio mais a escrita **não são atômicos**. Sob os múltiplos
crons concorrentes que o ADR-0026 já introduziu (60s para Presidente/Governador, 5 min Senador, 15
min Deputado — cada um podendo invocar `writeProjection` de forma independente), dois ciclos podem
fazer o `GET` quase simultaneamente, ambos verem o store abaixo do guard, e escrever em paralelo
somando mais do que qualquer um previu sozinho — a mesma classe de problema que o ADR-0026 já nomeou
para o rate limiter do TSE (singleton não coordenado entre invocações). A guarda reduz a
probabilidade de estouro silencioso; não a elimina sob concorrência real.

**5. Correção de número e de nome — o que muda agora, o que fica para depois do 1º turno.**

*Agora* (correção factual, baixo risco, sem renomear arquitetura):
- `lib/edge-config/writer.ts:171,266,275,317,325` — `hardLimit: 512 * 1024` está errado; passa a
  `EDGE_CONFIG_STORE_HARD_LIMIT_BYTES` (1.048.576 B, item 4).
- `lib/edge-config/types.ts:22-26` — cabeçalho que cita "limite duro de 512 KB" e "<20 KB por UF"
  precisa da correção de número e da nota de que `municipios`/`series_temporais` saíram do envelope.
- Este próprio ADR usa "1 MB" (o termo que a Vercel documenta) e, ao citar bytes, sempre a conversão
  binária explícita — sem ambiguidade decimal/binária propagada.
- Nota de emenda no `## Status` do ADR-0001 e do ADR-0026 (não reescrita de corpo — apêndice
  append-only, mesmo mecanismo que o ADR-0026 já usou sobre o ADR-0001, e que o ADR-0031 usou sobre
  o ADR-0024): registrar que o "limite duro de 512 KB" citado nos dois é **1 MB**, e que o Blob deixa
  de ser exclusivo de Deputado.

*Depois do 1º turno* (baixo valor imediato, alto custo de diff, 26 dias antes de D1):
- Renomear "Edge Config" → "Global Config" em prosa de docs/ADRs/comentários de código. É troca de
  nome de produto, não de comportamento; fazer isso agora movimenta dezenas de arquivos sem reduzir
  nenhum risco operacional do simulado 1.
- Trocar o pacote `@vercel/edge-config` por um equivalente com o novo nome — a Vercel não força essa
  migração, o pacote atual segue funcional, e trocar dependência 26 dias antes do 1º turno introduz
  risco de regressão sem benefício mensurável agora.

**6. Consequências para a cobertura municipal declarada (constituição § 8).** Com `municipios` fora
do store, o crescimento de 39% → 100% de cobertura deixa de ameaçar o limite do Edge Config — o
gargalo que motivava este ADR desaparece para esse campo especificamente. Ele **não** desaparece por
completo: o Blob tem seus próprios limites de tamanho por objeto, não medidos aqui (fora do escopo
desta pesquisa) — antes de a cobertura se aproximar de 100% dos 5.572 municípios, alguém precisa
confirmar que um único objeto `municipios:uf:SP:...json` (a maior UF, ~645 municípios) continua
folgado dentro do limite por objeto do Blob. Não decidido neste ADR por falta de número medido;
registrado como pendência explícita.

## Alternativas rejeitadas

- **Aumentar o warn/hard limit só para o número certo (1 MB), sem tirar `municipios` do Edge
  Config.** Rejeitada: mesmo com o número corrigido, o array de municípios de UM cargo à cobertura
  plena (1,10 MB) sozinho excede o store inteiro (1.048.576 B) — não há margem de correção de
  constante que resolva isso, é um problema de volume, não de contabilidade.
- **Um Blob por município, em vez de um Blob por UF.** Rejeitada: 5.572 objetos Blob por cargo/turno
  multiplicam o custo de escrita a cada ciclo de 60s por uma ordem de grandeza sem benefício de
  leitura — a página de UF sempre precisa da UF inteira de uma vez (tabela + mapa), nunca de um
  município isolado antes do drill-down de spec 015 (ainda `draft`, `opens_after: D1`).
- **Chave Edge Config dedicada para `series_temporais` (a saída cogitada no próprio comentário de
  `types.ts:619`), mantendo só `municipios` no Blob.** Rejeitada: cria dois padrões de "detalhe
  grande" (uma chave nomeada extra de Edge Config e um Blob) para o mesmo tipo de problema, quando um
  basta; e uma série por candidato futura (item 1) reabriria a mesma pergunta de novo.
- **Postgres direto para o drill-down municipal.** Rejeitada pelo mesmo motivo do ADR-0026: viola o
  princípio central do ADR-0001, acopla a disponibilidade da página de UF à do Neon sob a carga da
  noite de apuração.

## Consequências

**Positivas**:
- Remove o único campo do payload que, sozinho, já excede o store inteiro à cobertura plena — o
  gargalo estrutural desaparece antes do simulado 1, não é apenas adiado.
- A cobertura municipal (39% → 100%, constituição § 8) deixa de ser uma corrida contra o limite do
  Edge Config; o crescimento de cobertura só custa mais bytes no Blob, cujo teto é outra ordem de
  grandeza (pendência de confirmação registrada no item 6).
- A guarda de store inteiro (item 4) é a primeira vez que o writer sabe, com número real, se está
  perto do limite — hoje ele não sabe nada até a Vercel devolver 413.
- Reaproveita integralmente o mecanismo e o esquema de nomeação que o ADR-0026 já decidiu — zero
  padrão novo de infraestrutura introduzido, só uma segunda aplicação do mesmo padrão.

**Negativas**:
- Latência a mais no drill-down municipal: um segundo `fetch` (Blob) no servidor, em paralelo ao
  Edge Config — não é zero-custo, mesmo que o conteúdo afetado (tabela de municípios, mapa,
  gráficos de série) já esteja abaixo da dobra e fora do bundle above-the-fold (ADR-0010), então o
  impacto esperado em RNF-002 (LCP) é baixo mas não nulo, e não medido por este ADR.
- Dois read paths para monitorar viram, na prática, **três chaves de Blob por cargo/UF/turno**
  (municípios de Presidente, de Governador, mais o já existente de Deputado) — o runbook precisa de
  uma seção de monitoramento maior do que a que o ADR-0026 já havia pedido, não menor.
- Custo de escrita adicional no Blob a cada ciclo de 60s: até 27 UFs × 2 cargos (Presidente,
  Governador — Senador não tem `municipios`) = até 54 `put()` por ciclo, além dos ~110 itens de Edge
  Config já gravados hoje por `writeProjection`. Não medimos aqui custo monetário nem limite de taxa
  do Blob para esse volume — pendência operacional a validar antes do simulado 1.
- A guarda de store inteiro (item 4) não é atômica sob os múltiplos crons concorrentes que o
  ADR-0026 introduziu — reduz, não elimina, o risco de estouro silencioso do limite real.
- `series_temporais` sai do Edge Config junto com `municipios`, o que resolve a lacuna do comentário
  em `types.ts:619` mas também significa que qualquer consumidor que hoje lê `EdgePayloadUf.
  series_temporais` diretamente do payload de Edge Config (se algum já existir) precisa ser migrado
  para o fetch de Blob — não auditado neste ADR (fora de escopo de documentação; cabe ao
  implementador confirmar).

## Cross-refs

- ADR-0001 (Edge Config no read path — emendado por este ADR, corrigindo o limite citado):
  [0001-edge-config-no-read-path.md](0001-edge-config-no-read-path.md)
- ADR-0026 (Vercel Blob como exceção ao ADR-0001 para Deputado Federal — este ADR generaliza o
  mesmo mecanismo e o mesmo esquema de nomeação, sem inventar um segundo padrão):
  [0026-cargos-senador-deputado-ingestao-e-read-path.md](0026-cargos-senador-deputado-ingestao-e-read-path.md)
- ADR-0012 (chaves nomeadas por corrida e turno — origem dos qualificadores `<cargo>:t<turno>`
  reaproveitados no caminho Blob): [0012-edge-config-chaves-nomeadas.md](0012-edge-config-chaves-nomeadas.md)
- ADR-0011 (cadência de 60s — base do `revalidate: 60` do fetch de Blob):
  [0011-cadencia-60s.md](0011-cadencia-60s.md)
- ADR-0030 (piso de framework vs. orçamento de aplicação — precedente de separar limite não
  controlado de limite controlado, reaproveitado na lógica dos três limiares de guarda):
  [0030-orcamento-above-the-fold-piso-framework-vs-aplicacao.md](0030-orcamento-above-the-fold-piso-framework-vs-aplicacao.md)
- ADR-0031 (piso operacional 12 contra mínimo 10 — precedente direto da margem de 12,1% do
  `EDGE_CONFIG_STORE_WARN_BYTES`): [0031-piso-separacao-entre-partidos.md](0031-piso-separacao-entre-partidos.md)
- ADR-0017 (transparência total — precedente do "sempre no DOM, nunca esconder", aplicado aqui ao
  estado "detalhe indisponível" das seções municipais): [0017-transparencia-total-3-camadas.md](0017-transparencia-total-3-camadas.md)
- `lib/edge-config/types.ts` (`EdgePayloadUf`, `EdgeUfMunicipio`, `EdgeUfSeriesTemporais`) — remoção
  dos campos `municipios`/`series_temporais` e correção do comentário de limite, a fazer pelo
  implementador.
- `lib/edge-config/writer.ts` — correção de `hardLimit`, novas constantes de guarda de store inteiro,
  novo caminho de escrita Blob compartilhado com o Deputado do ADR-0026.
- `lib/edge-config/reader.ts` — `readUfProjection` deixa de esperar `municipios`/`series_temporais`
  no payload; novo helper de leitura de Blob compartilhado com o Deputado.
- `docs/architecture/data-model.md` — precisa de seção nova descrevendo o payload Blob de detalhe
  municipal (schema, esquema de caminho, tamanho estimado) — fora do escopo deste ADR (código/
  data-model são do implementador).
- `docs/operations/runbook.md` — seção de monitoramento de Blob (já pendente do ADR-0026) precisa
  incorporar as chaves de municípios de Presidente/Governador.
- Constituição § 8 (dívida de cobertura municipal declarada), § 9 (stack 100% Vercel — Blob é
  canônico), § 10 (append-only — não se aplica ao Blob, que é upsert por design via
  `allowOverwrite: true`; a série histórica de snapshots continua em Postgres, inalterada):
  [../../constitution.md](../../constitution.md)
- Sprint ativa: `docs/sprints/2026-S07-f6-simulado-hero-1t.md` — este ADR é pré-requisito declarado
  do usuário para o simulado 1 (15–17/09).
