---
title: Diagnóstico — o colapso zona→município, medido
description: Por que 26% do eleitorado está sob o município errado, por que 3.392 municípios não existem no mapa, e o que é consertável sem inventar número
status: stable
date: 2026-09-10
scope: diagnóstico apenas — nenhuma migration, reimportação ou mudança de código foi feita
---

# Diagnóstico — o colapso zona→município

Medido em 2026-09-10 direto no CSV do TSE (`eleitorado_local_votacao_2024`, 234 MB,
155.910.528 eleitores no 1º turno) e no Postgres de produção, em leitura. **Nada foi escrito.**

## Resumo em quatro números

| | |
|---|---|
| Eleitorado creditado ao **município errado** | **40.750.446 — 26,1%** |
| Votos que o **mapa** joga no município errado | **48.626.221 de eleitorado — 31,2%** |
| Municípios que **somem** da tabela de eleitorado | **3.412** de 5.569 |
| Municípios **invisíveis no mapa municipal** | **3.392** de 5.572 |

## A estrutura: zona e município não são aninhados

A premissa em que os dois bugs se apoiam — "uma zona vive em um município",
escrita literalmente em [`data-pipeline/eleitorado-import.ts:138`](../../data-pipeline/eleitorado-import.ts) —
é falsa. A relação é **muitos-para-muitos**, medida no CSV:

| | |
|---|---|
| zonas distintas `(uf, zona)` | 2.619 |
| municípios distintos | 5.569 |
| **pares `(uf, município, zona)`** | **6.085** |
| zonas cobrindo mais de um município | **1.636 — 62,5%**, até 8 |
| municípios com mais de uma zona | 189 — 3,4%, até 57 |

Distribuição de municípios por zona: 983 zonas com 1 · 608 com 2 · 529 com 3 · 282 com 4 ·
154 com 5 · 47 com 6 · 9 com 7 · 7 com 8.

**Nenhum dos dois é "mais granular".** Em área rural o município é mais fino que a zona; na
capital a zona é mais fina que o município. O par `(município, zona)` é a interseção — 6.085
linhas — e é estritamente mais fino que as duas visões. Um esquema chaveado nele **não perde**
granularidade de zona: o total por zona é a soma sobre seus municípios, o total por município é a
soma sobre suas zonas. Ambas deriváveis, nenhuma privilegiada.

## Problema A — `eleitorado`: 26,1% sob o município errado

### Mecanismo

A PK é `(ano, uf, cod_zona)` ([`lib/db/schema.ts:72`](../../lib/db/schema.ts)) e o importador
agrega por `${uf}|${codZona}`, guardando o **primeiro** `cod_municipio_tse` que aparece no CSV e
somando nele o eleitorado da **zona inteira**. `CD_MUNICIPIO` já é coluna obrigatória na leitura e
`cod_municipio_tse` já é coluna da tabela — o dado correto é lido e descartado na agregação.

### Impacto medido

Estado da tabela em produção hoje: **2.619 linhas, 2.619 zonas, 2.157 municípios distintos** —
contra 5.572 municípios no universo.

Piores distorções nacionais (eleitorado real → exibido):

| Fator | Real | Exibido | Município |
|---|---|---|---|
| 44,8× | 2.350 | 105.293 | Nova Aurora (GO) |
| 44,6× | 2.013 | 89.702 | Paial (SC) |
| 41,1× | 2.090 | 85.964 | Nova Ramada (RS) |
| 30,0× | 3.532 | 105.911 | Lamim (MG) |
| 28,6× | 3.971 | 113.449 | Ouro Verde de Goiás (GO) |
| 27,0× | 1.655 | 44.702 | Gentil (RS) |
| 26,9× | 3.027 | 81.428 | Bom Sucesso do Sul (PR) |
| 26,3× | 4.117 | 108.145 | Vieiras (MG) |

O painel "Maiores colégios eleitorais" de MG, lado a lado:

| # | Como a tabela diria hoje | Verdade |
|---|---|---|
| 1 | Belo Horizonte 1.992.984 | Belo Horizonte 1.992.984 |
| 2 | Uberlândia 530.871 | Uberlândia 530.871 |
| 3 | Contagem 459.110 | Contagem 459.110 |
| 4 | Juiz de Fora 390.203 | Juiz de Fora 390.203 |
| 5 | Betim 297.070 | Betim 297.070 |
| 6 | Montes Claros **214.452** | Montes Claros **277.710** |
| 7 | Ribeirão das Neves 213.114 | **Uberaba 238.276** |
| 8 | **Sete Lagoas 202.319** | Ribeirão das Neves 213.114 |
| 9 | Ipatinga 161.232 | **Governador Valadares 198.486** |
| 10 | **Santa Luzia 161.158** | Ipatinga **180.396** |

Uberaba e Governador Valadares — 7º e 9º maiores colégios reais do estado — **não aparecem**.
Montes Claros perde 63 mil eleitores. As cinco primeiras posições coincidem por acidente: são
capitais e cidades grandes cujas zonas não transbordam para vizinhos.

### O que o conserto custa

Trocar a PK para `(ano, uf, cod_municipio_tse, cod_zona)` e agregar por `${uf}|${codMun}|${codZona}`.
A tabela vai de 2.619 para 6.085 linhas. O dado já está no CSV — **nada é inventado ou estimado**.

**Três consultas somariam errado em silêncio** e precisam de `GROUP BY` junto com a migration:

| Local | O que acontece sem o conserto |
|---|---|
| [`api/model/project.py:306`](../../api/model/project.py) `fetch_eleitorado` | monta `dict[(uf, cod_zona)]`; com até 8 linhas por zona fica com a **última**, não com a soma |
| [`lib/model/repository.ts:328`](../../lib/model/repository.ts) `getEleitoradoByZone` | mesmo padrão, `m.set()` sobrescreve |
| [`data-pipeline/zonas-import.ts:34`](../../data-pipeline/zonas-import.ts) | já faz `GROUP BY`, mas com `MIN()` — ver Problema B |

Nenhuma das três lança erro. As duas primeiras alimentam o modelo.

### Achado colateral: o importador nunca apaga

[`eleitorado-import.ts:52-62`](../../data-pipeline/eleitorado-import.ts) é `INSERT ... ON CONFLICT
DO UPDATE`, sem `DELETE` nem `TRUNCATE`. Chaves que existiam numa importação anterior e não
aparecem na seguinte **sobrevivem com o valor velho**. A migration de PK precisa, portanto,
reconstruir a tabela em vez de fazer upsert por cima — senão as 2.619 linhas velhas conviveriam
com as 6.085 novas. Implementado em 11/09 como `DELETE WHERE ano=$1` + `INSERT` na mesma transação.

> **Correção de 2026-09-11 — a evidência dos "723" era falsa.** A primeira versão desta seção
> afirmava que a tabela tinha 723 eleitores "a mais" que o CSV, e tratava isso como prova de
> resíduo. Não era: era **divergência entre parsers do mesmo arquivo**. Medido em 11/09, o CSV tem
> 599.216 linhas físicas mas **599.204 registros** — 6 registros trazem quebra de linha dentro de
> campo entre aspas. Somando o 1º turno: `awk` ingênuo (o desta análise) 155.910.528 · importador
> 155.911.251 · parser `csv` do Python **155.912.680**, que é o número correto. Depois do
> `DELETE`+`INSERT` limpo a soma **continuou** 155.911.251, o que descarta resíduo.
> O defeito real estava em `iterCsv` ([`_tse-common.ts`](../../data-pipeline/_tse-common.ts)), que
> lia linha a linha e não tratava quebra dentro de aspas: 1.429 eleitores viravam 0 (0,0009 %). Não
> movia o modelo, mas o mesmo `iterCsv` serve os importadores de 2018/2022.
> **Corrigido em 2026-09-11, commit `b28e82e`**: o parser acumula linhas enquanto as aspas estiverem
> desbalanceadas, com um circuit breaker de 64 linhas por registro para que uma aspa solta não engula
> o arquivo inteiro em silêncio. Depois da reimportação, Σ`eleitores_aptos` = **155.912.680** — os
> três parsers que divergiam agora convergem nesse número.
> O `DELETE` segue correto pelo mecanismo descrito acima; só a evidência citada estava errada.

## Problema B — `zonas` e o mapa municipal: 31,2%

### Mecanismo

Mesma premissa, lugar diferente. [`zonas-import.ts:34`](../../data-pipeline/zonas-import.ts) faz
`SELECT uf, cod_zona, MIN(cod_municipio_tse) ... GROUP BY uf, cod_zona` — uma escolha determinística
mas arbitrária de **um** município por zona. A tabela `zonas` tem PK `(uf, cod_zona)` e uma única
coluna `cod_municipio_tse`.

É essa tabela que alimenta o mapa municipal: [`api/model/project.py:577`](../../api/model/project.py)
junta os snapshots com `LEFT JOIN zonas z ON z.cod_zona = r.cod_zona AND z.uf = r.uf` e chaveia o
agregado por `(uf, cod_municipio_tse)`. Para as 1.636 zonas multi-município, **todos os votos da
zona caem no município de menor código** e os demais não recebem nada.

O docstring dessa função já registra um bug anterior de fan-out por UF corrigido em 05/09, com a
frase "município errado recebendo os votos da zona". Aquele conserto foi real, mas tratou do JOIN
sem `uf`; a premissa de um-município-por-zona continuou intacta embaixo dele.

### Impacto medido

- `zonas`: 2.651 linhas, **2.180 municípios alcançáveis**.
- **3.392 dos 5.572 municípios não têm nenhuma zona apontando para eles** — são estruturalmente
  invisíveis no mapa municipal, em qualquer estado da apuração.
- Sob a regra `MIN`, o eleitorado cujos votos caem no município errado é **48.626.221 — 31,2%**,
  pior que os 26,1% do Problema A porque `MIN` favorece sistematicamente o código mais baixo.

### Isto explica uma dívida que estava catalogada como outra coisa

O handoff de 10/09 lista, entre as dívidas abertas: *"visão municipal cobre 2.180 de 5.572
municípios sem avisar o leitor (§ 8)"*. Esses 2.180 são exatamente a contagem de
`COUNT(DISTINCT cod_municipio_tse) FROM zonas`. **Não é limitação de cobertura do TSE — é este
bug.** A cobertura não melhora com o avanço da apuração, porque o teto é estrutural: 2.619 zonas
mapeadas 1:1 para no máximo 2.619 municípios, e como 189 municípios têm várias zonas, o distinto
cai para 2.180.

### Por que este é mais difícil que o Problema A

**O eleitorado existe por `(município, zona)` no CSV; os votos não.** O TSE publica resultado por
zona. Repartir os votos de uma zona entre seus municípios exigiria uma suposição de rateio — por
eleitorado, presumivelmente — e isso é um **número estimado apresentado como apuração**, que a
constituição § 6 ("cada valor pode ser reproduzido a partir do snapshot persistido") e § 1 (o dado
oficial é intocável) não admitem.

Três saídas possíveis, nenhuma decidida aqui:

1. **Rotular, não ratear.** O mapa passa a pintar a *zona*, não o município, e a folha do município
   diz qual zona o cobre e que o resultado é da zona inteira. Honesto, não inventa número, mas muda
   a unidade visual do mapa.
2. **Pintar todos os municípios da zona com a cor da zona.** Os 3.392 municípios deixam de ser
   buracos brancos e recebem o resultado da zona a que pertencem, com o rótulo dizendo isso. Resolve
   a invisibilidade sem fabricar um número por município.
3. **Ratear por eleitorado.** Dá um número por município, mas é estimativa vestida de apuração.
   Barrado pela § 6 sem um ADR que o autorize explicitamente.

A opção 2 depende do Problema A estar consertado — ela precisa do mapa `(zona → municípios)`
completo, que só existe depois da PK nova.

## Este bug NÃO afeta a projeção — corrigido em 10/09, no mesmo dia

A primeira versão deste documento tratou o impacto sobre o **gate OT-4** como hipótese plausível
não testada. Verificação posterior no mesmo dia mostra que é **implausível**, e vale registrar por
quê, para ninguém gastar sessão perseguindo isso:

- O importador soma o eleitorado de **todas as seções da zona**, independentemente do município
  ([`eleitorado-import.ts:134-144`](../../data-pipeline/eleitorado-import.ts)). O **total por zona
  está correto hoje.** O que está errado é só o rótulo `cod_municipio_tse`.
- O modelo lê o eleitorado pela chave `(uf, cod_zona)`
  ([`project.py:306`](../../api/model/project.py)) e estratifica por **porte de zona** — tercis de
  `te`, chaveados por `cod_zona` ([`extrapolation.py:186`](../../api/model/extrapolation.py)).
  **Nenhum caminho do cálculo lê `cod_municipio_tse`.**
- Logo, depois da migration (com o `GROUP BY` nas três consultas), o modelo enxerga **os mesmos
  números que enxerga hoje**. O conserto não pode mover o OT-4, exceto por acidente.

O dano está confinado ao que nomeia um município: mapa municipal, painel "Maiores colégios
eleitorais", folha do município, bloco de mesorregião. É um bug de **apresentação**, não de
matemática — o que não o torna pequeno (26,1% do eleitorado sob rótulo errado é visível para o
leitor), mas muda a prioridade: ele não destrava a spec 002.

## O que ficou fora deste diagnóstico

- Nenhuma migration foi escrita nem rodada. Nenhuma reimportação. Nenhuma mudança de código.
- Não foi verificado se `historical_results` (a outra fonte do `UNION` de `zonas-import`) sofre do
  mesmo colapso. Ele tem `cod_zona` e `cod_municipio_tse` como colunas separadas na unique key, o
  que sugere que **não** — mas não foi medido.

## Como reproduzir

O CSV está em `build/tse-archives/eleitorado_local_votacao_2024/`. As medições saíram de passes
`awk` sobre ele (com `iconv -f LATIN1 -t UTF-8` para os nomes) e de quatro `SELECT` de contagem
contra `DATABASE_URL`. Os números de banco foram lidos em 2026-09-10 e podem mudar se alguém
reimportar.
