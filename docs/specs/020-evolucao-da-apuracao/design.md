---
id: 020-evolucao-da-apuracao
title: Design — Evolução da apuração
spec: ./spec.md
---

# Design — Spec 020

Documento de implementação. A spec diz o que a tela promete; este diz por onde o
número passa. Números de linha refletem 2026-09-17 e devem ser reconferidos.

## 1. O que já existe e está desligado

Três quartos do trabalho já estão no repositório, sem call site:

| Ativo | Onde | Estado |
|---|---|---|
| Gráfico de linhas SVG à mão | `components/atoms/charts/TimeSeriesChart.tsx` | órfão desde 2026-09-08 |
| Alternância apurado/projetado | `components/atoms/controls/ViewModeSwitch.tsx` + cascata `data-view-only` em `app/globals.css` | **em uso**, comanda título, linhas de candidato e termômetros |
| Transporte de série por UF | `UfDetailBlob.series_temporais` em `lib/blob/uf-detail.ts` | em uso para as 3 séries agregadas |
| Acessor de série | `seriesFrom()` em `lib/blob/uf-detail.ts` | existe, sem call site em `app/` |
| Série real de 2022 para teste | `tests/fixtures/replay-2022/snapshots.json`, chave `timesteps` | 5 instantes reais: 20h15, 20h30, 21h, 22h, 23h30 |

O que **não** existe: o percentual apurado por candidatura ao longo do tempo. A
tabela `projections` guarda `pct_projetado` e um `pct_apurado` que é o
**progresso da apuração**, não a fatia da candidatura.

## 2. Modelo de dados

### 2.1 Migration `0009_projections_pct_atual.ts`

Padrão `.ts` de `data-pipeline/migrations/` (a última é `0008_candidatos.ts`).
Manual e numerada; nunca `drizzle-kit push`.

```sql
ALTER TABLE projections ADD COLUMN pct_atual    numeric(8,5);
ALTER TABLE projections ADD COLUMN votos_atuais bigint;
ALTER TABLE projections ADD COLUMN dado_ts      timestamptz;
CREATE INDEX ix_proj_serie ON projections (cargo, turno, uf, candidato_id, ts);
```

Três colunas anuláveis sem `DEFAULT` — `ALTER TABLE` O(1) em PG 11+, sem
reescrita. Linhas anteriores ficam `NULL`, que é o valor honesto: não foi medido.

Por que as três:

- **`pct_atual`** — o que o gráfico desenha na base "apurado". Precisão
  `numeric(8,5)` espelha `pct_projetado` (mesma fronteira de escala 0–100).
- **`votos_atuais`** — o numerador. `pct_atual` tem denominador móvel (os votos
  válidos crescem a noite toda) e percentual não se re-agrega. Sem o numerador, a
  série nacional não pode ser reconstruída a partir das UFs sem rodar o modelo de
  novo.
- **`dado_ts`** — a hora do boletim. Sem ela o eixo horizontal vira o relógio do
  servidor, que é exatamente o que o ADR-0038 proíbe.

⚠️ **Armadilha de nome, a documentar na docstring da coluna:** `pct_apurado` é o
*progresso* da apuração (0–100); `pct_atual` é a *fatia de votos da candidatura*
(0–100). Mesma unidade, significados opostos, colunas vizinhas. O nome
`pct_atual` é mantido porque é o que o dicionário Python, `EdgeUfCandidate` e
`EdgeCandidate` já usam — um quarto nome criaria mais uma tradução na pilha.

### 2.2 Python — `api/model/project.py`

**(a) `insert_projections`** passa a listar as três colunas novas.

**(b) Novo, e obrigatório antes de (a):** `national_rows` **não carrega a chave
`pct_atual`** — um `executemany` com `%(pct_atual)s` sobre `uf_rows +
national_rows` levantaria `KeyError` na primeira linha nacional. O `pct_atual`
nacional só nasce depois, dentro da montagem do payload, fora da transação.

Extrair para função pura e usar nos **dois** lugares:

```python
def pct_atual_nacional_por_candidato(
    uf_rows: list[dict[str, Any]],
) -> tuple[dict[int, float], dict[int, int], int]:
    """Razão de somas: Σ votos_atuais da candidatura ÷ Σ votos_atuais de todas."""
```

A montagem do payload nacional passa a chamá-la em vez de recomputar inline.
**Não é refactor gratuito:** com duas implementações, o gráfico e o placar da home
divergiriam no quinto decimal e não haveria como saber qual está certo.

**(c)** Imediatamente antes do INSERT, `national_rows` recebe `pct_atual` e
`votos_atuais` dessa função, e ambas as listas recebem `dado_ts`.

⚠️ **`relogio.dado_ts` é `str | None`** (`api/model/dado_ts.py` — o valor sai de
`.isoformat()`), não `datetime`. Converter no ponto único acima, nunca nos call
sites, e tratar `None`.

**(d) `fetch_series_por_candidato()`** — irmã de `fetch_series_temporais`, com o
downsample **dentro do SQL**:

```sql
SELECT DISTINCT ON (uf, candidato_id, balde)
       uf, candidato_id,
       to_timestamp(floor(extract(epoch from COALESCE(dado_ts, ts)) / (%(cad)s * 60))
                    * (%(cad)s * 60)) AS balde,
       COALESCE(dado_ts, ts) AS dado_ts,
       pct_atual, pct_projetado
FROM projections
WHERE cargo = %(cargo)s AND turno = %(turno)s
  AND ts > NOW() - (%(janela)s || ' hours')::interval
ORDER BY uf, candidato_id, balde, COALESCE(dado_ts, ts) DESC;
```

Três decisões dentro dessa consulta:

1. **No SQL, não em TypeScript.** Downsample na leitura pagaria o transporte
   inteiro para descartar 80% do outro lado do CDN. O limite do store é de
   **escrita**.
2. **`DISTINCT ON` + `ORDER BY … DESC` = o último do balde, nunca a média.**
   Média suavizaria descontinuidades e poderia fazer uma quantidade
   quase-monotônica regredir — o que a regra dos três estados proíbe. E "último
   do balde" garante por construção que o ponto final é o valor corrente.
3. **Balde por epoch, não por índice de array.** Determinismo: o mesmo instante
   cai no mesmo balde independentemente de quantos ciclos falharam.

**(e) `anexar_ponto_corrente()`** — a série é lida do banco **antes** de o ciclo
corrente ser escrito nele (a leitura ocorre centenas de linhas antes do INSERT),
de modo que a série publicada sai um ciclo (60 s) atrasada em relação ao placar
ao lado. Ninguém nota hoje porque nenhuma tela consome série; com o widget, o
último ponto do gráfico discordaria do número logo acima. A correção é anexar o
ponto do ciclo a partir dos valores em memória, com a mesma regra de
último-do-balde — não mover a leitura para depois do INSERT, que custaria uma
segunda varredura dentro do orçamento de 60 s.

## 3. Forma, volume e transporte

### 3.1 Forma colunar

```ts
export interface EdgeSeriePorCandidato {
  eixo: string[];            // dado_ts ISO, ASC. length === N
  cadencia_min: number;      // declarada, não inferida
  candidatos: EdgeSerieCandidato[];  // ordem = ordem de exibição
}
export interface EdgeSerieCandidato {
  id: number;
  nome: string;
  partido: string;           // a cor sai DAQUI, nunca do campo `cor`
  sqcand?: string;
  apurado: (number | null)[];
  projetado: (number | null)[];
}
```

`null`, nunca `0`: um balde sem ciclo é um furo na linha, não um mergulho ao chão.

Medido sobre JSON minificado, 4 candidaturas × 2 bases:

| Forma | 480 pontos | 96 pontos |
|---|---|---|
| Array de objetos `{ts, pct}` | 160.460 B | 32.356 B |
| **Colunar** | 33.249 B | **6.905 B** |

### 3.2 Cadência adaptativa com teto

`SERIE_MAX_PONTOS = 120`; cadência = menor de `[5, 10, 15, 30]` min tal que
`ceil(janela / cadência) ≤ 120`. Teto absoluto **8.553 B por corrida**.

A 480 pontos numa coluna de 400px (`--container-sidebar`), com `padX=32`, cada
ponto ocupa 0,7 px — sub-pixel. A 5 min são 3,5 px. O passo de 5 min já é o
precedente do repo (`SERIE_PASSO_MIN` no gerador de simulação; `CADENCIA_MIN` na
página de senador).

### 3.3 Destino

| Escopo | Destino | Campo |
|---|---|---|
| Por UF | objeto Blob existente | `UfDetailBlob.series_temporais.por_candidato` |
| Nacional | payload da chave de Global Config existente | `EdgePayload.serie_por_candidato` |

A conta que decide: série de UF no Global Config custaria 27 UF × 3 cargos ×
6.905 B = **559.305 B**, levando o store de ~410 KB para ~969 KB — acima do
limiar de erro de 940.000 B do writer e a 31 KB do teto de 1 MB, **com a escrita
recusada na noite de 04/10**. O nacional custa +6.905 B sobre 17.301 B → 24.206 B,
contra um DoD de 75 KB.

Blob nacional novo foi rejeitado: helper de caminho, módulo de leitura, ramo no
writer, um `Promise.all` novo na rota de maior tráfego e um segundo `ts` de
frescor a explicar ao leitor — para poupar 6,9 KB num store com 583 KB livres.

**Não mexer em `app/api/projection/municipios/route.ts`**, que hoje descarta as
séries ao serializar. Seu consumidor é a moldura persistente do mapa, que só quer
municípios. Acrescentar a série ali seria +6,9 KB numa resposta pública baixada
por todo visitante, para um consumidor que não existe. **Decisão registrada, não
esquecimento.**

`isUfDetailBlob` é permissiva (exige apenas `ts`, `uf` e `municipios` array):
blob antigo sem o campo novo continua válido, e o campo novo passa sem mudança.

### 3.4 TypeScript a tocar

- `lib/edge-config/types.ts` — os dois tipos novos; `por_candidato?` em
  `EdgeUfSeriesTemporais`; `serie_por_candidato?` em `EdgePayload`. Ambos
  **opcionais**. `EdgePayloadUf` não ganha campo: a série de UF vive no Blob.
- `lib/blob/uf-detail.ts` — `seriePorCandidatoFrom(result)`. `splitUfPayload` não
  muda: o destructuring já leva o objeto de séries inteiro ao Blob.
- `components/atoms/surfaces/DetailUnavailable.tsx` — motivo novo `sem_serie`
  ("o arquivo de detalhe chegou, mas ainda sem a série por candidatura"). Sem
  ele, "o Blob não respondeu" e "o Blob respondeu sem a série" caem no mesmo
  texto e o operador caça o erro errado.

## 4. O elenco dos quatro

Comparador: `pct_atual desc → pct_projetado desc → id asc`. É o de
`rankByParcial`, hoje **triplicado** nas três páginas de UF, a ser extraído para
`lib/utils/rank-parcial.ts` e importado pelas três.

⚠️ **Não** é o rank que o Python já calcula para UF, que ordena só por
`pct_projetado`. Usar o existente é a mutação mais provável do projeto — é copiar
código que já está ali — e a divergência só aparece quando apurado e projetado
discordam de ordem, isto é, exatamente na noite.

Decidido no produtor e não na tela: para a tela escolher, o payload carregaria as
12 candidaturas (14.809 B contra 6.905 B) e ainda assim não teria como
reconstruir a série de quem não veio. A ordem do array vira contrato; o
consumidor não re-ordena.

**Cor e rank são eixos ortogonais.** O rank escolhe quem entra; o partido escolhe
a cor, por `colorForParty(c.partido)`. O widget não lê `c.cor`, que ainda publica
a cor por rank aposentada pelo ADR-0024 — lê-la aqui reintroduziria o defeito no
único lugar onde ele seria visível como movimento.

## 5. O componente

`components/atoms/charts/SerieApuracaoChart.tsx` — Server Component, SVG inline,
sem lib de charting.

**Irmão, não extensão** de `TimeSeriesChart`: dele só se reusam ~13 linhas de
aritmética, e estendê-lo quebraria o único teste que fixa seu contrato sem
benefício. Extrair a aritmética para `components/atoms/charts/scale.ts`
(`makeScale({width, height, padX, padY, n, yMin, yMax})`) e fazer os dois usarem.

⚠️ **Defeito a não herdar:** `TimeSeriesChart` posiciona os pontos pela posição na
fila, não pela hora. Com eixo de relógio, a posição vem de `dado_ts` — um atraso
de 20 min do TSE precisa aparecer como espaço, não como intervalo normal.

```ts
interface SerieApuracaoChartProps {
  eixo: string[];
  cadenciaMin: number;
  candidatos: SerieCandidatoView[];
  escopo: string;            // "Brasil", "SP", "Governador SP"
  vagas?: 1 | 2;             // 2 liga a régua do Senado
  preEleicao?: boolean;
  width?: number;            // 480
  height?: number;           // 220
  titleId: string;
}
```

Sem prop de visão: o componente renderiza as duas, em
`<g data-view-only="parcial">` e `<g data-view-only="proj">`, e a cascata
escolhe. Custo: os dois conjuntos de traçado no DOM (~7 KB de HTML, ~1,5 KB
comprimido) — o mesmo que o painel de resultado já paga pelas suas células de
visão.

**Por que `display: none` aqui não viola o [ADR-0017](../../architecture/adrs/0017-transparencia-total-3-camadas.md).**
A nota de 2026-09-10 daquele ADR (via
[ADR-0034](../../architecture/adrs/0034-resultpanel-colapso-visual-corte-fora-do-kit.md)
D21) é explícita em que a proibição mira a **remoção de nós** — `display:none`,
`hidden`, `<details>` — usada para **esconder candidaturas atrás de um
controle**. Não é o caso: as quatro candidaturas estão presentes nas duas
visões, e o que alterna é a **base de medição**, não o elenco. Nenhuma
candidatura fica inalcançável em nenhum estado do interruptor. A mecânica é a
mesma que o painel de resultado já usa em produção, pela mesma razão. Registrado
aqui porque é a pergunta que uma revisão futura vai fazer.

**Eixo vertical**: `yMax = ceil(max / 5) * 5`, `yMin = max(0, floor(min / 5) * 5 - 5)`.
Idêntico nas duas visões — escalas diferentes fariam a alternância parecer
mudança de resultado. Arredondado a múltiplos de 5 para os rótulos não
redesenharem a cada revalidação. **Sem forçar zero**: com candidaturas entre 8% e
42%, ancorar em 0 comprime a ação no terço superior. (O gráfico existente força
zero porque mede margem, onde o zero é o cruzamento; aqui não há zero semântico.)

**Senador**: espessura 2.5 vs 1.5, régua tracejada na altura da 2ª vaga, ponto
final maior nos dois primeiros. **Nunca opacidade** — ela derrubou 16 nós para
2,27:1 no axe em 2026-09-08. Nunca intensidade de partido, reservada a margem.

## 6. Estados

| Estado | Gatilho | Tratamento |
|---|---|---|
| não começou | `isPreEleicao(payloadNacional)` | eixos + rótulos, zero traçados, "disponível apenas no dia das eleições" |
| apurando, sem linha | `eixo.length < 2` | frase com a hora da primeira medição. Não reusar o texto "Série temporal ainda insuficiente": é jargão |
| não sabemos | Blob indisponível | `DetailUnavailable` com o motivo |
| produtor sem série | Blob ok, campo ausente | `DetailUnavailable` motivo `sem_serie` |
| furo no meio | `null` num balde | dois traçados separados; nunca interpolar, nunca zero |

⚠️ **Fiação nova nas três rotas de UF.** Elas nunca perguntam a fase, e **não têm
payload próprio em fase pré** — o semeador grava apenas as chaves nacionais. A
fase é lida do payload **nacional**, pelo ponto único `isPreEleicao`, dentro do
`Promise.all` que cada rota já faz. Nunca por data de calendário, que
`lib/config/fase.ts` lista entre as quatro fontes proibidas (o `revalidate`
congela o relógio no build).

⚠️ `app/(pres)/uf/[sigla]/page.tsx` **não declara `revalidate`** — herda os 60 s
só do `fetch` interno do Blob. Dado que chegue por outro caminho congela no build.

**Supressão é do chamador**, nunca do componente.

## 7. Acessibilidade

Precedente: `components/blocks/HexCartogramBrasil.tsx` (figura rotulada +
estrutura paralela `sr-only`), não o coroplético — aquele usa papel de imagem por
ser canvas opaco. E não papel de grupo: aquele existe porque o hexágono contém 27
links; este SVG não tem nada interativo dentro.

Uma tabela só, **8 colunas de dado**: hora + (apurado, projeção) × 4. Duas
tabelas dobrariam o DOM e obrigariam o leitor a percorrer o mesmo eixo duas vezes.

Cinco regras de conteúdo, cada uma fechando um buraco real:

1. A hora é `dado_ts` formatada em `America/Sao_Paulo` — o gráfico existente
   imprime o ISO cru, que um leitor de tela soletra por inteiro em cada linha.
2. `null` sai como "sem medição", nunca "0%" nem célula vazia.
3. A palavra "projeção" aparece no cabeçalho de cada par e na legenda — a tabela
   `sr-only` é superfície, e é uma das que ninguém revisa.
4. No Senador a legenda diz quais duas ocupam vaga: o destaque por espessura não
   tem tradução textual automática.
5. Série completa, sem paginar. Medir o peso do HTML no gate de performance.

**Zero animação.** Não há Framer Motion desde a S07; o caminho seguro é não ter
animação para zerar.

## 8. Sequenciamento

| Fase | Conteúdo | Depende de |
|---|---|---|
| **0** | `scale.ts`; `rank-parcial.ts`; `SerieApuracaoChart` completo com os 4 estados; fiação de fase nas 3 rotas de UF; bloco nos 4 slots; testes de ordem atualizados | nada |
| **1** | migration 0009; `pct_atual_nacional_por_candidato`; INSERT; `fetch_series_por_candidato`; `anexar_ponto_corrente`; tipos TS ⟨tipos em paralelo⟩ | 0 |
| **2** | produtor emite a série (UF e nacional); páginas passam props reais; testes T1–T7 | 1 |
| **3** ⟨paralelo⟩ | gerador de simulação emite série por candidatura; fixtures de gov e sen; gate de coerência | 0 |
| **4** | teste sobre os 5 instantes reais de 2022; e2e de performance e a11y | 2 |

A Fase 0 é desenhada para **entregar sozinha**: o estado do protótipo nas quatro
telas, correto e honesto, sem depender de nada do pipeline.

## 9. Testes que matam mutação

O projeto tem histórico de teste que passa sem provar nada. Cada um abaixo é
escrito contra uma mutação específica, com fixture construída para que a mutação
mude o resultado.

| # | Mutação | Fixture / asserção que discrimina |
|---|---|---|
| T1 | apurado ↔ projetado | direções **opostas** (`[10,20,30]` vs `[40,35,31]`); comparar o **sinal** das coordenadas, não o texto do traçado |
| T2 | ordenar por `pct_projetado` | 5 candidaturas onde os dois critérios divergem no 4º lugar; comparar contra `rankByParcial` importado |
| T3 | `< 2` → `<= 2` ou `< 1` | três casos: 0, 1 e **2** pontos. Testar só 0 e 3 passa com as duas mutações |
| T4 | a defasagem de um ciclo | último ponto da série === `pct_atual` do payload, na mesma renderização |
| T5 | `?? 0` em qualquer ponto | furo no meio (`[30, null, 32]`): **dois** traçados, nenhuma coordenada em 0%, tabela com "sem medição" |
| T6 | teto virar `LIMIT` de SQL | propriedade: janelas de 1h a 24h → no máximo 120 pontos, cadência é a **menor** que satisfaz, bytes < 9.000 |
| T7 | ler `c.cor` | renderizar com o array invertido: `stroke` idêntico por id; `--color-cand-` ausente do HTML |

**Existentes a atualizar** (ordem de blocos e contagem de `<h1>`, que **não pode
mudar**): `tests/integration/home-page.test.tsx`,
`tests/unit/components/UFPage.test.tsx`,
`tests/integration/uf-governador-page.test.tsx`,
`tests/unit/pages/senador.test.tsx`, `tests/unit/config/fase.test.ts`,
`tests/unit/data-pipeline/simulacao-gerar.test.ts`.
