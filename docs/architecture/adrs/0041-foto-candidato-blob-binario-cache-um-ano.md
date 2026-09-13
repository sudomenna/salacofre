---
id: ADR-0041
title: Foto de candidato como binário no mesmo módulo de escrita do Blob, cache de 1 ano — não os 60s do JSON de apuração
status: accepted
date: 2026-09-13
---

# ADR-0041 — Foto de candidato como binário no mesmo módulo de escrita do Blob, cache de 1 ano

## Status

Aceito.

## Contexto

`lib/blob/write.ts` e `lib/blob/paths.ts` (ADR-0026, ADR-0032) são hoje **JSON-only** por construção,
não por omissão. `putJson` (`write.ts:65-90`) fixa `contentType: "application/json"`, serializa com
`JSON.stringify`, e grava com `cacheControlMaxAge: BLOB_CACHE_CONTROL_MAX_AGE_SECONDS` = **60
segundos** — o mínimo aceito pelo Blob, escolhido porque o objeto é reescrito a cada ciclo de 60s
(ADR-0011) e um cache mais longo serviria apuração parada sem erro visível em lugar nenhum
(`write.ts:11-19`). `blobPathname` (`paths.ts:135-140`) **sempre** acrescenta `.json` ao caminho —
incondicionalmente, sem parâmetro que permita outra extensão. Os três pontos de chamada existentes
(`ufDetailBlobPathname`, `deputadoUfBlobPathname`, e a chamada direta em
`tests/unit/blob/paths.test.ts:78`) dependem desse comportamento.

A spec 018 (identidade de candidatura 2026 — nome, foto, partido) precisa hospedar a foto oficial de
candidato que o TSE publica por `SQ_CANDIDATO` — fonte formalizada pelo [ADR-0039](0039-portal-dados-abertos-tse-identidade-candidatura.md)
(Portal de Dados Abertos do TSE): ~8.400 candidaturas nacionais, cada foto um JPEG 161×225 px de
4,8–7,7 KB, ~43 MB no total. Estes são os **primeiros binários** que o produto hospeda — todo o read
path existente (Edge Config, Blob de município/série/deputado) é JSON. Não há hoje nenhum mecanismo
no repositório para escrever um objeto que não seja `JSON.stringify`-able, e forçar a foto por esse
caminho (ex. base64 dentro de um JSON) infla o payload em ~33% e reintroduz o mesmo problema de
orçamento que o ADR-0032 já resolveu para município — sem necessidade, já que o Blob aceita binário
nativamente via `put()`.

**Ensaio medido em 2026-09-13**, ZIP de fotos do TSE para o Acre: 387 JPEGs para 387 candidaturas,
join 1:1 por `SQ_CANDIDATO`, zero foto órfã, zero candidatura sem foto, zero nome de arquivo fora do
padrão `F<UF><SQ>_div.jpg`. O volume e o formato são previsíveis nacionalmente a partir dessa amostra.

## Decisão

**1. O primitivo binário entra no MESMO módulo (`lib/blob/write.ts`), não em um módulo novo.** O
ADR-0032 é explícito — "a implementação que materializa este ADR e a que materializa o ADR-0026 devem
compartilhar o mesmo módulo de escrita/leitura Blob — não é opcional" — e o mesmo raciocínio vale para
um terceiro recurso: um segundo módulo de escrita duplicaria a lógica de no-op sem credencial, de
`allowOverwrite`/`addRandomSuffix` e de log estruturado que `putJson` já centraliza. Novo export:

```ts
export async function putBinary(
  pathname: string,
  body: Buffer | Uint8Array,
  opts: { contentType: string; cacheControlMaxAge?: number },
): Promise<BlobWriteResult>
```

Mesma tríade de `putJson` (`access: "public"`, `allowOverwrite: true`, `addRandomSuffix: false`) —
é o que torna a URL determinística, premissa que todo o read path de Blob já assume
(`lib/blob/paths.ts:49-63`, `blobUrlFor`). `cacheControlMaxAge` é **opcional, com default
`BLOB_IMMUTABLE_MAX_AGE_SECONDS` (1 ano)** — nunca os 60s de `putJson`.

> **Correção 2026-09-13, antes do commit.** A primeira redação deste parágrafo dizia "parâmetro
> obrigatório do caller (sem default)", contradizendo o próprio bloco de assinatura acima, que já
> mostrava `cacheControlMaxAge?: number`. Resolvido em favor do **opcional**, e o motivo importa:
> o medo legítimo era que uma foto imutável herdasse por acidente um cache de 60s pensado para dado
> que muda a cada minuto. Um default de **1 ano** torna esse acidente impossível — o valor herdado
> por omissão é justamente o correto para binário. Obrigar o caller a declarar não compra segurança
> adicional; compra fricção, e desloca o risco para o lado errado (quem esquece, esquece para
> `putJson`, não para cá). O que segue proibido, e é o que o ADR realmente protege: `putBinary`
> jamais pode cair em `BLOB_CACHE_CONTROL_MAX_AGE_SECONDS`. Há teste de mutação cobrindo isso —
> trocar as duas constantes de lugar derruba 4 asserções.

**2. `blobPathname` ganha um 3º parâmetro `extension`, default `".json"`.** Assinatura nova:

```ts
export function blobPathname(
  segments: readonly string[],
  context: string,
  extension: string = ".json",
): string
```

Validado por `/^\.[a-z0-9]+$/` — **lança** se a extensão vier sem o ponto (`"jpg"` em vez de
`".jpg"`), pela mesma filosofia de erro cedo que `assertValidBlobSegment` já aplica aos segmentos
(`paths.ts:92-111`: "um caminho errado só falharia em produção, com um 404 mudo do CDN"). O default
preserva os três chamadores existentes **byte a byte** — nenhum deles precisa mudar.

**3. `BLOB_IMMUTABLE_MAX_AGE_SECONDS = 31_536_000` (1 ano) para foto — não os 60s do `putJson`.**
Esta é a razão principal de este ADR existir: sem registrar o porquê, alguém "conserta" o número de
volta para 60 por consistência com o resto do módulo, e a cada leitura o CDN revalida uma foto que
nunca muda. O argumento: os 60s do `putJson` protegem um objeto **reescrito sob nome fixo** — a
apuração muda a cada ciclo, o caminho não. A foto é endereçada por `SQ_CANDIDATO`: foto diferente
significa candidato diferente, que significa caminho diferente (`candidatos/foto/<UF>/<SQ_CANDIDATO
>.jpg`, item 5). Não existe cenário em que o CDN sirva "foto velha do candidato certo" — o candidato
certo só tem uma foto, para sempre, sob aquele caminho. O único caso de reescrita real — o TSE
publica uma foto corrigida do mesmo candidato — é resolvido por um `--force` explícito no
importador (fora do escopo deste ADR, que fixa a decisão de cache, não a implementação do
importador), e uma foto defasada por até 24h nesse caso raro não é erro de apuração: é uma foto.

**4. `unoptimized` no `next/image`, ou `<img>` com `width`/`height` explícitos.** A Vercel cobra por
imagem-fonte transformada pelo pipeline de otimização; ~8.400 fontes entrariam no orçamento de
otimização sem contrapartida, porque a fonte **já vem** em 161×225 px — exatamente o tamanho de
render que o design da spec 018 usa. Otimizar essa foto é custo puro por ganho zero: não há
redimensionamento, não há reencode que reduza bytes de forma perceptível numa imagem já pequena e já
comprimida pelo TSE. **Registrar aqui e no runbook operacional**, porque "otimizar toda imagem
externa" é o instinto padrão de quem chegar depois e vir um `<img>` cru no código. Nota factual:
`next.config.ts:13-15` já declara `images.remotePatterns` para `*.public.blob.vercel-storage.com`
(herdado do ADR-0032, nunca usado por nenhum consumidor até hoje), mas **não existe atualmente
nenhum `next/image` nem `<img>` em `app/` ou `components/`** (confirmado por grep) — as fotos de
candidato serão as primeiras imagens do produto, o que também significa que não há precedente interno
a copiar; a escolha exata (`unoptimized` vs. `<img>` nativo) cabe ao spec-implementer, mas ambas
implicam **não pagar** o pipeline de otimização de imagem da Vercel para este recurso.

**5. Esquema de caminho: `candidatos/foto/<UF>/<SQ_CANDIDATO>.jpg`.** Segue o padrão de `/` já
estabelecido por `lib/blob/paths.ts` para município e Deputado (não `:` — ver o próprio cabeçalho de
`paths.ts:36-47` sobre por que dois-pontos produz URL percent-encoded). `SQ_CANDIDATO` tem 11 ou 12 dígitos,
só numérico, e passa em `BLOB_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/` sem qualquer escape — um
construtor nomeado (`candidatoFotoBlobPathname(uf, sqCandidato)`, análogo a `ufDetailBlobPathname` e
`deputadoUfBlobPathname`) é a forma correta de expor isso, não concatenação ad hoc pelo importador.
`sqCandidato` que chegar sem passar pelo filtro de publicabilidade do [ADR-0040](0040-publicabilidade-candidatura-fail-closed.md)
não deve ter foto escrita — a foto segue a mesma fronteira de "quem existe" que o ADR-0040 já fixa
para nome e partido, e não introduz uma segunda regra de elegibilidade.

## Alternativas rejeitadas

- **Base64 dentro de um JSON existente (ex. anexar a foto ao payload de UF).** Rejeitada: infla o
  binário em ~33% (overhead de base64), reabre o mesmo problema de orçamento de store que o ADR-0032
  resolveu para município, e mistura dois tipos de conteúdo (dado de apuração, asset estático) num
  mesmo objeto com ciclos de vida completamente diferentes (a foto nunca muda; o payload muda a cada
  minuto).
- **Módulo de escrita binário separado (`lib/blob/write-binary.ts`).** Rejeitada pela mesma razão que
  o ADR-0032 rejeitou dois padrões de caminho para dois recursos parecidos: duplicaria a lógica de
  no-op sem credencial, log estruturado e a tríade `access`/`allowOverwrite`/`addRandomSuffix` que já
  existe em `write.ts`.
- **Cache de 60s (herdado do `putJson`) também para foto.** Rejeitada explicitamente — é o erro que
  este ADR existe para prevenir. Uma foto imutável sob cache de 60s gera revalidação constante no CDN
  sem nenhum ganho de frescor, porque o conteúdo nunca muda sob aquele caminho.
- **Otimizar a foto via `next/image` padrão.** Rejeitada: custo de transformação por imagem-fonte sem
  ganho, já que a fonte chega no tamanho exato de render.

## Consequências

**Positivas**:
- Um único módulo de escrita Blob continua sendo a fonte de verdade para binário e JSON — zero
  duplicação de lógica de credencial, log ou determinismo de URL.
- Cache de 1 ano elimina revalidação desnecessária no CDN para um asset que, por construção de
  caminho (`SQ_CANDIDATO`), nunca muda sob o mesmo nome.
- `unoptimized`/`<img>` evita custo de otimização de imagem da Vercel para ~8.400 fontes que já
  chegam no tamanho de render — economia mensurável, não hipotética.
- O 3º parâmetro de `blobPathname` com default `".json"` não quebra nenhum chamador existente —
  extensão zero-risco ao contrato atual.

**Negativas**:
- O `--force` do importador para o caso raro de o TSE corrigir uma foto é uma peça nova de
  implementação que este ADR não especifica em detalhe — fica como pendência para o spec-implementer,
  e sem ele uma correção de foto do TSE fica presa atrás do cache de 1 ano até a próxima limpeza
  manual de CDN.
- ~~`cacheControlMaxAge` obrigatório em `putBinary` é uma pequena fricção de API.~~ **Revisado
  antes do commit** — o parâmetro ficou opcional com default de 1 ano; ver a nota de correção na
  Decisão item 1. A consequência negativa que sobra é outra, e menor: um chamador futuro de binário
  que NÃO seja asset imutável (um PDF regerado por ciclo, digamos) herda 1 ano por omissão. Mitigação
  registrada: o nome da constante (`BLOB_IMMUTABLE_...`) diz para que serve, e o `putJson` continua
  sendo o caminho para qualquer coisa que se reescreve.
- Nenhuma auditoria de acessibilidade foi feita aqui para o `alt` text da foto (nome do candidato,
  presumivelmente) — fora de escopo deste ADR, mas é gate do `a11y-perf-auditor` antes de a spec 018
  ser `shipped`.
- O ensaio de 2026-09-13 cobre só o Acre (387 candidaturas); a extrapolação para ~8.400 nacionais
  assume que o formato do ZIP do TSE é uniforme entre UFs — não confirmado neste ADR para as 26
  UFs restantes.

## Cross-refs

- ADR-0026 (Vercel Blob como exceção ao ADR-0001, origem do módulo compartilhado de escrita/leitura):
  [0026-cargos-senador-deputado-ingestao-e-read-path.md](0026-cargos-senador-deputado-ingestao-e-read-path.md)
- ADR-0032 (generalização do Blob para detalhe municipal — precedente direto de "um módulo, não dois
  padrões ad hoc" reaplicado aqui a um terceiro recurso e a um segundo content-type):
  [0032-detalhe-municipal-vercel-blob.md](0032-detalhe-municipal-vercel-blob.md)
- ADR-0011 (cadência de 60s — a mesma premissa que justifica o cache curto do JSON e, por oposição,
  justifica o cache longo da foto): [0011-cadencia-60s.md](0011-cadencia-60s.md)
- ADR-0039 (fonte de identidade de candidatura — Portal de Dados Abertos do TSE, origem do
  `SQ_CANDIDATO` usado como chave do caminho da foto): [0039-portal-dados-abertos-tse-identidade-candidatura.md](0039-portal-dados-abertos-tse-identidade-candidatura.md)
- ADR-0040 (publicabilidade fail-closed via `ST_CANDIDATO_INSERIDO_URNA` — a foto só é escrita para
  candidatura publicável): [0040-publicabilidade-candidatura-fail-closed.md](0040-publicabilidade-candidatura-fail-closed.md)
- ADR-0042 (chave de identidade de candidatura — a foto é endereçada por `sqcand`, a mesma chave
  global que o ADR-0042 formaliza): [0042-cargo-uf-numero-chave-identidade-candidatura.md](0042-cargo-uf-numero-chave-identidade-candidatura.md)
- `lib/blob/write.ts` (`putJson`, `BLOB_CACHE_CONTROL_MAX_AGE_SECONDS`) — a estender com `putBinary` e
  `BLOB_IMMUTABLE_MAX_AGE_SECONDS`, a fazer pelo implementador.
- `lib/blob/paths.ts` (`blobPathname`, `BLOB_PATH_SEGMENT_PATTERN`) — a estender com o parâmetro
  `extension` e um construtor nomeado `candidatoFotoBlobPathname`, a fazer pelo implementador.
- `next.config.ts:13-15` (`images.remotePatterns` para `*.public.blob.vercel-storage.com`) — já
  cobre o host da foto; nenhuma mudança de config necessária.
- Constituição § 9 (stack 100% Vercel — Blob e a otimização de imagem nativa da Vercel são canônicos;
  a decisão de não usar o pipeline de otimização é sobre custo, não sobre sair da stack):
  [../../constitution.md](../../constitution.md)
- Spec afetada: `docs/specs/018-identidade-candidatura/spec.md` (a criar/atualizar pelo
  spec-implementer com `adrs: [..., 0039, 0040, 0041, 0042]`).
- `docs/operations/runbook.md` — precisa de uma nota "não otimizar a foto de candidato" ao lado da
  seção de monitoramento de Blob já pendente dos ADR-0026/0032.
