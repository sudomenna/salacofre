---
id: ADR-0012
title: Chaves nomeadas no Edge Config por corrida e turno, não chave única
status: accepted
date: 2026-05-17
---

# ADR-0012 — Chaves nomeadas no Edge Config por corrida e turno, não chave única

## Status

Aceito.

### Emenda 2026-09-11 — precedente para o lock de ingestão por cargo (ADR-0035 D3)

**Nota 2026-09-11 ([ADR-0035](0035-par-municipio-zona-unidade-de-ingestao.md) D3).** O princípio de
fundo deste ADR — nomear o estado por corrida/contexto em vez de uma chave única compartilhada —
reaparece na camada de ingestão: o lock anti-overlap de `/api/ingest` passou a ser **por cargo**
(`notes.cargo` no marcador de `ingest_log`, `lib/tse/ingest-handler.ts:360-420`), para que um ciclo
de Presidente e um de Governador possam correr concorrentemente sem um bloquear o outro. Mesmo
princípio, mecanismo diferente (marcador de linha em vez de chave de Edge Config); nenhuma mudança
ao schema de chaves deste ADR.

### Emenda 2026-09-08 — separador `-` no lugar de `:` (a decisão de fundo permanece)

**Append-only. O corpo abaixo não foi reescrito** — ele registra o esquema como foi decidido em
S05, com dois-pontos. O que mudou é apenas o **separador**; onde este ADR escreve
`projection:current:pres:t1`, leia `projection-current-pres-t1`, e assim por diante.

**O que mudou.** Todas as chaves do Global Config passaram a usar `-` como separador:

| Como este ADR escreve (S05) | Como é hoje |
|---|---|
| `projection:current:<cargo>:t<turno>` | `projection-current-<cargo>-t<turno>` |
| `projection:uf:<sigla>:<cargo>:t<turno>` | `projection-uf-<SIGLA>-<cargo>-t<turno>` |
| `projection:archive:<cargo>:t<turno>` | `projection-archive-<cargo>-t<turno>` |
| `projection:current` (alias dinâmico) | `projection-current` |
| `projection:uf:<sigla>` (alias legado) | `projection-uf-<SIGLA>` |

**Por quê.** A doc da Vercel — `/docs/global-config/global-config-limits`, seção "Maximum item key
name length", atualizada em 2026-07-29 — é literal: *"The key name must adhere to the regex pattern
`^[\w-]+$`, which is equivalent to `/^[A-Za-z0-9_-]+$/`, and allows A-Z, a-z, 0-9, `_`, and `-`"*.
**Dois-pontos não está na lista.** Se a API aplicar o padrão que documenta, nenhuma escrita sob o
esquema original jamais funcionou, e a descoberta chegaria com a gravação recusada na noite da
apuração.

Não foi possível verificar empiricamente: `EDGE_CONFIG` está comentada no `.env.local` desde 18/05,
não há token de escrita no ambiente, o `vercel` CLI não está autenticado, e os testes de ingestão
rodam contra `fetch` mockado. Diante de um caminho crítico que não dá para testar a 26 dias do 1º
turno, adota-se o padrão documentado em vez de depender de uma tolerância não documentada.

**O que NÃO mudou — e é o ponto.** A decisão de fundo deste ADR permanece **intacta**: chaves
**nomeadas por corrida e turno**, em vez de uma chave única. Cada corrida segue independente no
store (escrita concorrente entre presidencial e governadores sem race condition), a transição de
turno segue sem destruir `projection-archive-pres-t1`, e o alias dinâmico resolvido por
`lib/config/calendar.ts` segue existindo. Arity, semântica e consequências (positivas e negativas)
deste ADR valem sem alteração. **Muda o separador, não o esquema.**

**Como isso passou a ser garantido.** A construção de chave, que estava espalhada por `reader.ts` e
`writer.ts` em template literals soltos, foi centralizada em **`lib/edge-config/keys.ts`** — ponto
único de construção *e* de validação. Todo construtor valida a chave que produz contra
`^[A-Za-z0-9_-]+$`, e `writeEdgePayload` revalida antes de chamar a API da Vercel (inclusive antes do
no-op sem credencial, para que CI e dev local não passem cegos). Uma chave fora do padrão não nasce
e não chega ao store. Cobertura em `tests/unit/edge-config/keys.test.ts` (matriz completa das 144
chaves produzíveis contra a regex transcrita da doc) e `tests/unit/edge-config/reader.test.ts`.

**Compatibilidade de leitura, com prazo.** O reader tenta a chave nova e, só em caso de miss, tenta
a chave antiga com dois-pontos — cobrindo o cenário em que a API sempre aceitou `:` e há dado
publicado. Custa uma leitura a mais apenas no caminho de miss. **Remoção marcada para 2026-10-26**
(dia seguinte ao 2º turno), em `DEPRECATED_COLON_KEYS_REMOVAL_DATE` (`lib/edge-config/keys.ts`).

**Escopo.** Esta emenda cobre só chaves do Global Config. Os pathnames de Vercel Blob definidos pelo
ADR-0026 (`deputado:uf:<sigla>.json`) e pelo ADR-0032 (`municipios:uf:<sigla>:<cargo>:t<turno>.json`)
**não são afetados**: pathname de Blob obedece a outra regra, e `:` é seguro ali (verificado na doc
do `@vercel/blob` e no próprio SDK v2.3.3, cuja única sequência proibida é `//`, com limite de 950
caracteres).

## Contexto

O ADR-0001 definiu `projection:current` e `projection:uf:[sigla]` como chaves do Edge Config para o read path. No escopo original (presidencial, turno único em foco), uma chave por nível geográfico era suficiente.

Com o suporte a múltiplas corridas simultâneas (presidencial 1T e 2T, governador 1T e 2T), o payload de `projection:current` precisaria ser substituído ao avançar de turno — destruindo o archive do 1T no exato momento em que o 2T começa, ou exigindo concatenação de múltiplas corridas em um único JSON. Nenhuma das duas abordagens é aceitável: a primeira viola o princípio append-only para snapshots históricos (constituição § 10); a segunda infla o payload além dos 512KB do Edge Config se todas as UFs estiverem presentes para ambas as corridas.

A transição de 1T para 2T em 04/out/2026 precisa ocorrer atomicamente sem derrubada do site e sem corrupção do archive do primeiro turno. O writer já precisa publicar projeções de governadores e presidenciais em paralelo durante a janela de apuração. Uma chave única torna esse multi-write impossível sem race condition.

## Decisão

Adotar schema de chaves namespaced no Edge Config. A estrutura canônica é:

```
projection:current:pres:t1          # projeção nacional presidencial 1T
projection:current:pres:t2          # projeção nacional presidencial 2T
projection:current:gov:t1           # projeção nacional governadores 1T
projection:current:gov:t2           # projeção nacional governadores 2T
projection:uf:<sigla>:pres:t1       # projeção UF presidencial 1T
projection:uf:<sigla>:pres:t2       # projeção UF presidencial 2T
projection:uf:<sigla>:gov:t1        # projeção UF governadores 1T
projection:uf:<sigla>:gov:t2        # projeção UF governadores 2T
projection:archive:pres:t1          # snapshot final 1T, gravado uma vez na transição
```

A chave legada `projection:current` permanece como **alias dinâmico**: `lib/config/calendar.ts` resolve o par `(cargo, turno)` correto com base na data/hora do servidor, retornando `("pres", 1)` até o encerramento das urnas do 1T (04/out/2026 ~21h BRT) e `("pres", 2)` depois. Durante a coexistência de 1T e 2T no Edge Config, o writer publica nas duas chaves (nomeada e alias). A chave legada `projection:current` será deprecada ao fim de S06.

## Consequências

**Positivas**:
- Cada corrida é independente no Edge Config: escrita concorrente sem race condition entre presidencial e governadores.
- Transição de turno não destrói o archive: `projection:archive:pres:t1` persiste após o início do 2T.
- Backward-compat garantida por 1 sprint: consumidores que ainda usam `projection:current` continuam funcionando.
- Custo de payload distribuído: cada chave carrega somente sua corrida, mantendo folga sob o limite de 512KB (cf. ADR-0001).

**Negativas**:
- Durante a janela de coexistência (S05–S06), o writer publica em 2 chaves por ingestão — duplicação transitória de write.
- `lib/config/calendar.ts` torna-se load-bearing: erro de data/hora no resolver pode apontar alias para chave errada. Exige teste unitário de clock.
- Schema de chaves precisa ser documentado explicitamente no runbook operacional; equipe de monitoramento precisa conhecer as novas chaves para alertas.

## Cross-refs

- ADR-0001 (Edge Config no read path — define o mecanismo; ADR-0012 expande o schema): [0001-edge-config-no-read-path.md](0001-edge-config-no-read-path.md)
- ADR-0011 (cadência de ingestão 60s): [0011-cadencia-60s.md](0011-cadencia-60s.md)
- Spec afetada: `docs/specs/001-ingestao-tse/spec.md` (writer precisa publicar nas chaves nomeadas)
- Spec afetada: `docs/specs/002-modelo-estatistico/spec.md` (output do modelo endereça chave nomeada)
- Spec afetada: `docs/specs/003-home-nacional/spec.md` (read path via alias `projection:current`)
- Spec afetada: `docs/specs/004-pagina-uf-presidencial/spec.md` (read path via `projection:uf:<sigla>:pres:t1`)
- Data model: [../data-model.md](../data-model.md)
- Constituição § 9 (stack 100% Vercel), § 10 (append-only snapshots): [../../constitution.md](../../constitution.md)
- Operations runbook: `docs/operations/runbook.md`
