---
id: ADR-0042
title: "(cargo, UF, número na urna)" é a chave de identidade de candidatura para nome — não o número sozinho, que só é seguro para partido
status: accepted
date: 2026-09-13
---

# ADR-0042 — `(cargo, UF, número na urna)` é a chave de identidade de candidatura

## Status

Aceito. Este ADR **emenda os contratos de payload das specs 016 (Senador) e 017 (Deputado
Federal)** — não os supersede: a estrutura geral de `EdgeUfRow`/`EdgeCandidate` permanece, mas o
campo `top_candidatos` ganha forma nova (ver Decisão, item 3). A propagação do frontmatter `adrs:`
e do texto das duas specs cabe ao `spec-syncer`, não a este documento.

## Contexto

**O achado, verificado no código.** `api/model/project.py:1712` define
`extract_partido_by_cand(snapshots, cargo) -> dict[int, str]`: um dicionário **plano**, chaveado só
pelo número na urna (`int(c.get("n"))`), construído sobre **todos** os snapshots de **todas** as UFs,
com a regra "primeira leitura não-vazia vence" (`project.py:1729-1734`, documentada no próprio
docstring da função). Essa função nasceu do RF-107 (spec 016), que precisa da contagem das 54 vagas de
Senador por partido/federação — e o dicionário plano funciona para esse propósito porque, em cargo
majoritário, **o número na urna É o número do partido**: 13 é PT em qualquer UF do país, então a
sigla é função do número, não da UF.

Essa mesma propriedade é **catastrófica** se copiada para nome. Um `extract_nome_by_cand` escrito
como gêmeo literal de `extract_partido_by_cand` poria o nome do candidato a governador do PT de São
Paulo em outros 26 estados — porque todo candidato a governador do PT no Brasil concorre sob o número
13, e "primeira leitura não-vazia vence" pegaria qualquer um deles, arbitrariamente, para representar
os 27.

Os dois consumidores da UI **já estão montados** para resolver identidade por essa chave colidente,
o que significa que o defeito não é hipotético — é a forma natural de estender o código como está
hoje:

- `components/blocks/GovernorCard.tsx:130` — `const candIndex = new Map(candidatos.map(c => [c.id,
  c]))`, seguido por `nome: meta?.nome ?? "Cand ${t.id}"` (`:137`), cruzando `uf.top_candidatos`
  contra `national.candidatos` por `id` (o número na urna) sozinho.
- `app/(sen)/senador/page.tsx:139-146` (`topDaUf`) — `const c = porId.get(t.id)`, mesmo padrão:
  `nome: c?.nome ?? "Candidatura ${t.id}"`.
- O próprio `GovernorCard.tsx` já documenta, em comentário (linhas 85–92 na versão vigente), que em
  cargo 3 (Governador) `national.candidatos` "não é uma corrida — é a união dos candidatos, com
  `rank` reiniciando a cada UF" — ou seja, o próprio código já reconhece que o bloco nacional mistura
  candidaturas de UFs diferentes sob o mesmo espaço de `id`, mas ainda assim indexa por `id` sozinho
  para resolver nome.

O tipo hoje é `EdgeUfRow.top_candidatos: Array<{ id: number; pct: number }>` (`lib/edge-config/
types.ts:476`) — sem nome, sem partido, sem `sqcand`. A UI resolve nome e partido só depois, batendo
`id` contra `EdgeCandidate[]` do bloco nacional, que é exatamente o ponto onde a colisão acontece.

## Decisão

**1. A chave de identidade para nome é o par `(cargo, UF, número)`** — nunca o número sozinho.
`extract_partido_by_cand` **permanece como está** (`project.py:1712`, dicionário plano por número): é
correto para o que faz, e este ADR registra explicitamente **por que** ele pode ser plano — para não
que, no futuro, alguém "uniformize" as duas funções sob a mesma assinatura e reintroduza o defeito de
nome que motivou este documento. `extract_nome_by_cand` (a criar) deve ser chaveado por
`(cargo, uf, numero)`, nunca por `numero` isolado.

**2. `sq_candidato` (11 ou 12 dígitos, sequencial único do TSE) é a chave global e estável**, independente
de cargo/UF/número. É a mesma chave que a foto do candidato usa como caminho (ADR-0041) e que
`api/model/deputado.py:102-108,176-178` já trata como "identificador ÚNICO do candidato... nunca o
número de urna". As duas chaves — `(cargo, uf, numero)` para resolver "quem concorre com este número
nesta corrida" e `sqcand` para "quem é este candidato, unicamente" — **coexistem**; uma tabela de
candidatos precisa das duas, ou o join com a foto (ADR-0041) e com a fonte de dados (ADR-0039) não
fecha.

**3. `EdgeUfRow.top_candidatos` passa de `Array<{ id, pct }>` para `Array<{ id, pct, nome?, partido?,
sqcand? }>`.** Enriquecer a linha da UF é **pré-condição** de publicar qualquer nome — não é
polimento de UI que pode vir depois. Os três campos novos são opcionais para não quebrar o payload
sob o `model_fallback_tier` já existente (dado indisponível continua renderizando "Cand {id}" via
fallback, não erro).

**4. No bloco nacional (`national.candidatos`) de cargo 3 (Governador) e 5 (Senador), o nome
permanece o placeholder `f"Candidato {id}"`.** Ali não existe uma corrida única — é a união de 27
corridas distintas sob o mesmo espaço de `id` — e qualquer nome atribuído seria ambíguo por
construção: o `id` 13 nesse bloco não identifica uma pessoa, identifica "o número 13 nalguma UF". Só
o **cargo 1 (Presidente)** recebe nome no bloco nacional, porque ali existe de fato uma corrida
nacional única com 13 candidaturas e 13 números distintos (medido contra o registro vigente de
2026).

**5. A chave `(cargo, uf, numero)` NÃO é única nem na fonte oficial — não criar índice único sobre
ela.** Medido em 2026-09-13 sobre a base de candidaturas do TSE (fonte formalizada pelo
[ADR-0039](0039-portal-dados-abertos-tse-identidade-candidatura.md)): **52 colisões** brutas de
`(cargo, uf, numero)`. Depois de aplicar o filtro de publicabilidade fail-closed do
[ADR-0040](0040-publicabilidade-candidatura-fail-closed.md) (`ST_CANDIDATO_INSERIDO_URNA = "SIM"`),
restam **4** — todas do cargo 6 (Deputado Federal) na Bahia, com julgamento sob recurso, incluindo
dois pares com o **mesmo nome** sob o mesmo número (`6|BA|2727` MARLI LIMA duas vezes; `6|BA|2717`
BRUNO ELIAS duas vezes). Um `UNIQUE INDEX` sobre `(cargo, uf, numero)` quebraria em produção contra
esses 4 casos reais. A resposta correta não é constraint de banco — é uma **função de resolução
determinística e testada**, aplicada nesta ordem:

   a. Só candidaturas publicáveis (ADR-0040).
   b. Entre as publicáveis, prefere `DS_SITUACAO_JULGAMENTO` começando em `DEFERIDO`.
   c. Desempate final pelo maior `sq_candidato` (registro mais recente na base do TSE).

      > ⚠️ **Comparar como NÚMERO, nunca como texto** (medido 2026-09-13). `SQ_CANDIDATO` tem
      > **11 ou 12 dígitos** — 5.569 das 20.939 candidaturas têm 11. Em comparação textual,
      > `"99..."` (11 dígitos) vence `"100..."` (12 dígitos), e o desempate escolhe o registro
      > **errado** — em silêncio, sem erro, sem teste vermelho. Em TypeScript: `BigInt`, nunca
      > `localeCompare` nem `>` entre strings. Em SQL: a coluna já é `bigint`, então `ORDER BY`
      > está correto — o risco mora do lado da aplicação. A implementação
      > (`data-pipeline/candidatos-resolve.ts`) usa `BigInt` e tem teste dedicado.
      >
      > Nota de origem: a sondagem inicial relatou "12 dígitos" porque mediu o **máximo** e não a
      > distribuição. O erro atravessou este ADR, o ADR-0041, a spec 018 e dois arquivos de
      > `lib/blob/` antes de a importação real encontrá-lo. Todos corrigidos.
   d. Na noite da apuração, o **EA20 tem precedência absoluta** sobre a base de candidaturas —
      se o EA20 já trouxe um nome para aquele `(cargo, uf, numero)`, ele vence os passos a–c.

**6. Cadeia de resolução de nome, a testar degrau a degrau:** EA20 `nmu` (nome de urna) → EA20 `nm`
(nome completo) → fatia da base de candidaturas por `(cargo, uf, numero)` resolvida pelos passos do
item 5 → `"Candidato {n}"` (placeholder final, nunca ausência de nome).

## Alternativas rejeitadas

- **Chavear nome por número sozinho, como `extract_partido_by_cand`.** Rejeitada — é exatamente o
  defeito que este ADR existe para prevenir: o número na urna não identifica um candidato entre UFs
  diferentes, só identifica um partido.
- **`UNIQUE INDEX` sobre `(cargo, uf, numero)`.** Rejeitada — quebraria contra os 4 casos reais de
  colisão pós-filtro medidos em 2026-09-13 (DC na Bahia, julgamento sob recurso). Índice não-único
  mais função de resolução é o único desenho que sobrevive ao dado real.
- **Usar `sqcand` como única chave, descartando `(cargo, uf, numero)`.** Rejeitada — `sqcand` resolve
  "quem é este candidato", não "quem concorre com este número nesta corrida", que é a pergunta que
  `top_candidatos` (indexado por número, vindo do EA20 em tempo real) precisa responder durante a
  apuração. As duas chaves respondem perguntas diferentes; nenhuma substitui a outra.
- **Nome também no bloco nacional para cargo 3/5.** Rejeitada — o bloco nacional desses cargos é uma
  união de 27 corridas sob o mesmo espaço de `id`, e qualquer nome atribuído ali seria ambíguo por
  construção, não apenas impreciso.

## Consequências

**Positivas**:
- Elimina uma classe inteira de bug — nome de candidato de UF errada — antes de qualquer componente
  de nome ir ao ar, em vez de descobri-la em produção como a atribuição de sigla já foi descoberta
  (o "travessão em toda tela" que motivou `extract_partido_by_cand`, `project.py:1719-1722`).
- Registra explicitamente por que `extract_partido_by_cand` pode continuar plano — protege a função
  correta de ser "corrigida" por analogia equivocada com a futura função de nome.
- A função de resolução determinística (item 5) tem cobertura de teste natural: os 4 casos de colisão
  real da Bahia são um fixture pronto para o caso de borda mais importante.
- `sqcand` como chave global unifica o join entre identidade (nome/partido), foto (ADR-0041) e fonte
  de dados (ADR-0039) — três ADRs da mesma spec 018 compartilham uma única chave de junção.

**Negativas**:
- `EdgeUfRow.top_candidatos` cresce de 2 para até 5 campos por item — mais bytes no store de Edge
  Config em cada UF, em um momento (ADR-0032) em que o orçamento do store inteiro já é vigiado de
  perto. O acréscimo é pequeno por candidato (nome + partido + sqcand, poucas dezenas de bytes), mas
  não foi medido neste ADR contra o guard de store do ADR-0032 — pendência para o implementador.
- A função de resolução do item 5 introduz lógica nova e não-trivial (4 passos, incluindo
  "prefere DEFERIDO" e "maior sqcand como desempate") que precisa de teste próprio; sem ele, os 4
  casos de colisão real da Bahia produzem resultado nu-determinístico dependendo da ordem de leitura
  do banco.
- Placeholder `"Candidato {n}"` no bloco nacional de cargo 3/5 permanece uma **assimetria visível**
  entre cargos: o leitor vê nome completo na tela de Presidente e "Candidato 13" no bloco nacional de
  Governador, o que pode ler como inconsistência de qualidade de dado em vez de diferença estrutural
  de corrida — mitigação de copy fica fora do escopo deste ADR.
- Este ADR **não resolve** dois `EdgeUfRow` que citam `top_candidatos.id` como corrida diferente
  entre governador e senador (2 vagas vs. 1) — a resolução de nome é ortoganal a essa diferença de
  semântica de corrida (ADR-0024, item 2 do Contexto), mas os dois problemas convivem no mesmo campo
  de dado e um implementador apressado pode confundir as duas questões.

## Cross-refs

- ADR-0039 (fonte de identidade de candidatura — Portal de Dados Abertos do TSE, origem de
  `sq_candidato`, `ST_CANDIDATO_INSERIDO_URNA`, `DS_SITUACAO_JULGAMENTO`): [0039-portal-dados-abertos-tse-identidade-candidatura.md](0039-portal-dados-abertos-tse-identidade-candidatura.md)
- ADR-0040 (publicabilidade fail-closed via `ST_CANDIDATO_INSERIDO_URNA` — passo (a) da função de
  resolução do item 5): [0040-publicabilidade-candidatura-fail-closed.md](0040-publicabilidade-candidatura-fail-closed.md)
- ADR-0041 (foto de candidato em Blob, endereçada por `sqcand` — a mesma chave global formalizada
  aqui): [0041-foto-candidato-blob-binario-cache-um-ano.md](0041-foto-candidato-blob-binario-cache-um-ano.md)
- ADR-0026 (Senador e Deputado Federal — granularidade e read path; `top_candidatos` é o campo que
  este ADR estende): [0026-cargos-senador-deputado-ingestao-e-read-path.md](0026-cargos-senador-deputado-ingestao-e-read-path.md)
- ADR-0032 (guard de store inteiro do Edge Config — o acréscimo de campos a `top_candidatos` consome
  desse orçamento, não medido aqui): [0032-detalhe-municipal-vercel-blob.md](0032-detalhe-municipal-vercel-blob.md)
- ADR-0024 (paleta por partido — `EdgeUfRow.top_candidatos` já carrega uma ambiguidade de semântica
  de corrida entre Governador/Senador, ortogonal à resolvida aqui): [0024-paleta-editorial-por-partido.md](0024-paleta-editorial-por-partido.md)
- Constituição § 6 (determinismo — a função de resolução do item 5 precisa ser reproduzível a partir
  do mesmo snapshot, mesma exigência já aplicada a `extract_partido_by_cand`): [../../constitution.md](../../constitution.md)
- `api/model/project.py:1712-1738` (`extract_partido_by_cand` — mantido como está; comentário a
  acrescentar apontando para este ADR).
- `api/model/deputado.py:102-108,176-178` (`sqcand` como identificador único — precedente direto da
  decisão do item 2).
- `lib/edge-config/types.ts:476` (`EdgeUfRow.top_candidatos` — tipo a estender pelo implementador).
- `components/blocks/GovernorCard.tsx:130-143` e `app/(sen)/senador/page.tsx:134-148` (`topDaUf`) —
  os dois consumidores que hoje resolvem nome por `id` sozinho; precisam migrar para o campo
  enriquecido ou para a função de resolução do item 5.
- Specs emendadas por este ADR (frontmatter `adrs:` e contrato de payload — propagação via
  `spec-syncer`): `docs/specs/016-senador/spec.md`, `docs/specs/017-deputado-federal/spec.md`.
- Spec de origem: `docs/specs/018-identidade-candidatura/spec.md` (a criar/atualizar pelo
  spec-implementer com `adrs: [..., 0039, 0040, 0041, 0042]`).
