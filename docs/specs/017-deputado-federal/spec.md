---
id: 017-deputado-federal
title: Deputado Federal — corrida proporcional com projeção de cadeiras
status: implementing
priority: M
personas: [P1, P2, P3]
screens: [T-11, T-12]
requirements: [RF-120, RF-121, RF-122, RF-123, RF-124, RF-125, RF-125.1, RF-126, RF-127, RF-128, RF-129, RF-130]
depends_on: [001-ingestao-tse, 002-modelo-estatistico, 016-senador]
apis: [GET /api/ingest/deputado-federal, POST /api/ingest/deputado-federal, GET /api/projection?cargo=deputado-federal]
components: [CargoTabs, DeputadoMetodologia, VoteBar, Figure, Panel, Footer]
nfr: [RNF-001, RNF-002, RNF-003, RNF-006, RNF-007a, RNF-022, RNF-023, RNF-024]
adrs: [0001, 0012, 0020, 0021, 0026, 0027, 0028, 0032, 0034, 0035, 0036, 0037]
ship_blocked_on: [gate-a11y-perf, gate-constitution-rerun]
opens_after: 2026-09-11
---

# Spec 017 — Deputado Federal

**Rotas**: `/deputado-federal` (nacional) e `/uf/[sigla]/deputado-federal`
**Cargo TSE**: 6 · **Turno único** · **Proporcional** — 513 cadeiras, 8 a 70 por UF

## Status

`implementing` desde 2026-09-12. Escrita em 2026-09-11; cálculo de cadeiras
validado em 12/09 (511/513) e a spec implementada ponta a ponta no mesmo dia,
com os **4 gates aprovados** (`rf-coverage-checker`, `constitution-guard`,
`a11y-perf-auditor`, `spec-syncer`).

**Não é `shipped`** porque o RF-127 saiu pela metade: a marcação de cadeira
indefinida entrou, o **intervalo** não — falta o bootstrap de voto por
agremiação (design.md D7, custo medido e dentro do teto). Promover quando ele
entrar, mirando 04/10.

### O que está pronto

| camada | estado |
|---|---|
| Ingestão (cargo 6, ~6.110 alvos de zona, 6 fatias, volta de 30 min — [ADR-0036](../../architecture/adrs/0036-deputado-federal-granularidade-zona-fatiada.md)) | ✅ `9ee5871`, `e2f3240` |
| Método de cadeiras (ADR-0027) | ✅ `api/model/cadeiras.py`, 21 casos de borda |
| Ponte EA20 → cadeiras | ✅ `api/model/deputado.py`, 28 testes |
| **Golden contra 2022 (RF-126)** | ✅ **511/513 cadeiras**, fase 1 exata nas 27 UFs |
| Conferência ao vivo contra o TSE | ✅ `conferir_contra_tse` — compara com `carg[].qe` e `agr[].vag` |
| Payload (`EdgePayloadDeputado` nacional + UF) | ✅ `lib/edge-config/`, `lib/blob/` |
| Read path do Blob (`deputado/uf/<SIGLA>.json`) | ✅ `lib/blob/deputado-uf.ts::readDeputadoUfDetail` + testes |
| Telas `/deputado-federal` e `/uf/[sigla]/deputado-federal` | ✅ rotas implementadas, aba habilitada |
| Aba no `CargoTabs` | ✅ `href="/deputado-federal"`, `disabled: false` |

**A degradação de 19/09 não será acionada por causa do cálculo** — ele passou. O
que resta é payload e UI, que é trabalho de engenharia sem incerteza de método.

## Objetivo

Mostrar, ao vivo, como a bancada da Câmara está se formando — por partido e
federação —, com a honestidade de dizer quando ainda não dá para dizer. Cadeira
projetada é a informação que o leitor quer e a mais fácil de errar: numa eleição
proporcional, **um partido pode ganhar votos e perder cadeira**, e a última vaga
de um estado costuma se decidir por algumas centenas de votos.

## Escopo

### Dentro

- Ingestão do cargo 6 em granularidade **zona** (par município×zona, ~6.110
  arquivos), varrida em **6 fatias** de ~1.019 alvos, uma a cada 5 min — volta
  completa a cada **30 minutos**. Implementada em UF em 2026-09-11; movida para
  zona fatiada em 2026-09-13 ([ADR-0036](../../architecture/adrs/0036-deputado-federal-granularidade-zona-fatiada.md)),
  porque com um arquivo por estado o bootstrap do RF-127 tem uma única unidade
  de reamostragem e o intervalo degenera.
- Leitura da hierarquia proporcional do EA20: `carg[] → (fed[] | agr[].par[]) → cand[]`
  e os **votos de legenda** `v.vl` (`lib/tse/ea20-schema.ts:269`), que existem
  neste cargo e não nos majoritários.
- Projeção de votos por agremiação pela regra de três do ADR-0021, em nível de UF.
- **Módulo de cadeiras** implementando o ADR-0027, com testes golden contra 2022.
- Read path híbrido: resumo nacional no Global Config; drill-down por UF no
  **Vercel Blob** ([ADR-0026](../../architecture/adrs/0026-cargos-senador-deputado-ingestao-e-read-path.md) item 4,
  `deputadoUfBlobPathname` em `lib/blob/paths.ts:168-171`, hoje sem caller).

### Fora

- **Deputado Estadual e Distrital** (cargos 7/8). Fora do escopo do produto.
- **Projeção zona a zona.** Mesma razão da spec 016.
- **Suplência nominal.** O ADR-0027 descreve a regra (Código Eleitoral art. 112),
  mas exibir lista de suplentes não entra nesta janela.

## Requisitos Funcionais

### Ingestão e dado

**RF-120 — Ingestão do cargo 6, varrida em 6 fatias, volta completa em 30 minutos**

> **Reescrito em 2026-09-13 ([ADR-0036](../../architecture/adrs/0036-deputado-federal-granularidade-zona-fatiada.md)).**
> A redação anterior — "a cada 15 minutos, produzindo 27 alvos de nível UF" —
> descrevia a granularidade que o ADR-0036 substituiu, e a sua aceitação
> (`then devolve 27 alvos nivel: "uf"`) passou a afirmar o **oposto** do
> comportamento correto. ADR vence spec (constituição, hierarquia), então o
> requisito acompanha.

WHILE estamos na janela de apuração, the system SHALL acionar
`/api/ingest/deputado-federal/<fatia>` a cada 5 minutos, uma fatia por
invocação, cobrindo as 6 fatias — e portanto os ~6.110 alvos de nível zona — a
cada 30 minutos.

**Aceitação**:
- Given o cron da fatia N dispara, when `listIngestTargets(production, {cargo: 6, fatia: N})`
  roda, then devolve ~1.019 alvos `nivel: "zona"`.
- Given as 6 fatias, when unidas, then o resultado é **exatamente** o conjunto
  dos ~6.110 alvos — sem sobra e sem repetição (disjunção par a par).
- Given `TSE_DEPUTADO_GRANULARIDADE=uf` (interruptor de emergência), when
  qualquer fatia roda, then devolve os 27 alvos `nivel: "uf"` e a fatia é
  ignorada.

**RF-121 — Votos de legenda preservados**

WHEN o parser lê um envelope de cargo 6, the system SHALL persistir `v.vl` (votos
de legenda) e somá-lo aos votos nominais ao compor os **votos válidos da
agremiação**, conforme ADR-0027.

**Aceitação**:
- Given `v.vl = 1000` e Σ nominais = 9000, when os votos da agremiação são
  computados, then o total é **10.000**.
- Given brancos e nulos presentes no envelope, when os votos válidos são
  computados, then eles **não** entram (Lei 9.504 art. 5º; Res.-TSE 23.677 art. 9º p.ú.).

**RF-122 — Federação conta como uma agremiação**

WHEN o sistema agrega votos para o cálculo de cadeiras, the system SHALL tratar
cada federação como **uma única** agremiação, somando os partidos que a compõem,
e NÃO como partidos separados.

**Aceitação**:
- Given uma federação de 3 partidos, when o quociente partidário é calculado,
  then há **um** quociente para a federação, não três.
- Given a tela renderizada, when exibe a bancada, then a federação aparece com
  identidade própria, com os partidos componentes legíveis (constituição § 2 —
  cor por federação sem sugerir fusão).

### Cadeiras

**RF-123 — Quociente eleitoral com o arredondamento da lei**

WHEN o sistema calcula o quociente eleitoral de uma UF, the system SHALL usar
`QE = votos_válidos / lugares_a_preencher`, **desprezando a fração se ≤ 0,5 e
arredondando para 1 se > 0,5** (Código Eleitoral art. 106).

**Aceitação**:
- Given fração exatamente 0,5, when o QE é calculado, then ela é **desprezada**
  (não é `round()` de linguagem nenhuma — é a classe de erro que passa
  despercebida).
- Given fração 0,5000001, when o QE é calculado, then arredonda para cima.

**RF-124 — Número de vagas NUNCA hardcoded**

WHEN o sistema precisa de `lugares_a_preencher` de uma UF, the system SHALL
obtê-lo do dado publicado pelo TSE ou de tabela versionada com verificação contra
o simulado, e NUNCA de constante embutida no código.

**Aceitação**:
- Given a tabela de bancadas, when o valor de uma UF diverge do que o TSE publica,
  then o ciclo registra erro e aciona alerta — errar o denominador do QE corrompe
  a projeção inteira daquela UF.
- Rationale: a Res.-TSE 23.748/2026 art. 7º § 1º remete à LC 78/1993, e a
  redistribuição pelo Censo 2022 (PLP 177/2023) tem desfecho **não confirmado**.

**RF-125 — Distribuição em três fases, conforme ADR-0027**

WHEN o sistema converte votos em cadeiras, the system SHALL executar, nesta ordem:
(1) cadeiras por quociente partidário com a cláusula de 10% do QE por candidato;
(2) sobras restritas aos partidos com ≥80% do QE e candidatos com ≥20% do QE;
(3) sobras abertas a **todos**, sem piso algum, quando a fase 2 se esgotar
(STF, ADI 7228; Res.-TSE 23.677 art. 11 § 4º).

**Aceitação**:
- Given um partido abaixo de 80% do QE, when a fase 2 termina sem candidatos
  elegíveis, then esse partido **participa** da fase 3.
- Given cadeiras contadas pelo QP mas não preenchidas por falta de candidato acima
  de 10%, when a média é calculada, then o **QP inteiro** entra no denominador
  (ADI 5.420; Res. art. 11 § 5º).
- Given nenhum partido atinge o QE, when o sistema distribui, then aplica o
  algoritmo de médias a **todas** as cadeiras (Res. art. 12-A) e **não** elege os
  mais votados — o art. 111 do Código Eleitoral foi declarado inconstitucional.

**RF-125.1 — Cadeiras exibidas ≠ vagas obtidas para o denominador**

WHEN o sistema exibe a contagem de cadeiras de uma agremiação, the system SHALL usar o número de
candidatos **efetivamente eleitos**, e NUNCA a variável de bookkeeping que alimenta o denominador
da média — que conta o quociente partidário inteiro, ainda que não preenchido (Res.-TSE 23.677
art. 11 § 5º, ADI 5.420).

**Aceitação**:
- Given uma UF, when a apuração termina, then `Σ cadeiras_exibidas` sobre todas as agremiações é
  **exatamente** `lugares_a_preencher`.
- Given um partido com quociente para 3 cadeiras e apenas 2 candidatos acima de 10% do QE, when a
  tela renderiza, then ele aparece com **2** cadeiras, não 3.
- Rationale: com a variável errada, uma UF de 10 vagas exibiria 11 — a vaga não ocupada vai para as
  sobras, possivelmente para outro partido, e seria contada duas vezes.

**RF-126 — Testes golden contra 2022** ✅ **cumprido em 2026-09-12**

WHEN o módulo de cadeiras é alterado, the system SHALL reproduzir a distribuição
oficial de cadeiras de 2022 para todas as 27 UFs.

**Resultado medido**: **511 das 513** cadeiras, candidato por candidato
(`tests/unit/model/test_cadeiras_golden_2022.py`). A fase 1 (quociente
partidário + cláusula dos 10%) é **exata nas 27 UFs**. As 2 divergências estão
em rodada de sobras, nomeadas no teste, e viraram a open question 4 abaixo.

**Aceitação**:
- Given os votos de 2022 por (UF, agremiação), when o módulo roda, then a
  distribuição bate com a oficial em cada UF — **511/513**, com as 2 exceções
  nomeadas; o teste falha se surgir uma terceira **ou se uma das duas sumir**.
- ⚠️ O gabarito tem de ser o resultado **recalculado** após a ADI 7228: os
  embargos julgados em 13/03/2025 derrubaram a modulação, e a decisão **retroage
  a 2022**. Usar os números proclamados à época produziria um golden errado que
  passaria com um algoritmo errado.

### Telas

**RF-127 — Bancada projetada com incerteza explícita**

WHEN uma tela de Deputado exibe cadeiras projetadas, the system SHALL exibir o
intervalo, não só o número central, e SHALL marcar as cadeiras cuja atribuição
depende de sobras ainda indefinidas.

**Aceitação**:
- Given uma UF com a última vaga dentro do IC entre duas agremiações, when a tela
  renderiza, then isso é legível — não uma cadeira atribuída com falsa firmeza.

**RF-128 — Cadência de 30 minutos visível**

> **15 → 30 em 2026-09-13 ([ADR-0036](../../architecture/adrs/0036-deputado-federal-granularidade-zona-fatiada.md)):**
> a volta completa das 6 fatias. O número **não** é literal no JSX — sai de
> `atualizacao_min` do payload (design § D8), e é por isso que a tela
> acompanhou a mudança sozinha.

WHEN uma tela exibe Deputado Federal, the system SHALL exibir "atualizado a cada
30 min" e o `ts` do payload, e NÃO um "atualizado às" único quando a tela mistura
cargos de cadências diferentes (ADR-0026 item 5, ADR-0036, constituição § 8).

**Aceitação**:
- Given um payload com `atualizacao_min` diferente de 30, when a tela renderiza,
  then ela diz **aquele** valor — o teste injeta 7 e exige que a tela diga 7,
  para que um literal esquecido no JSX seja pego.

**RF-129 — Drill-down por UF vem do Blob**

WHEN `/uf/[sigla]/deputado-federal` precisa da lista completa de candidatos, the
system SHALL lê-la do Vercel Blob via `fetch` no servidor com revalidate, e NÃO
do Global Config.

**Aceitação**:
- Given o payload por UF (~10–15 KB × 27), when gravado, then vai para
  `deputado/uf/<SIGLA>.json`, não para o Global Config — cujo limite de 1 MB já é
  compartilhado por três cargos.
- Given o Blob indisponível, when a página renderiza, then exibe estado de detalhe
  indisponível e **mantém** o resumo (constituição § 7).

**RF-130 — Voto de legenda visível**

WHEN a tela exibe a votação de uma agremiação, the system SHALL distinguir votos
nominais de votos de legenda.

**Aceitação**:
- Given uma agremiação com legenda relevante, when a tela renderiza, then os dois
  números são distinguíveis — somá-los sem dizer esconde um fato que decide
  cadeira.

## Requisitos Não-Funcionais

Herda RNF-001/002/003, RNF-006 (relaxado para a cadência de 30 min — ADR-0036),
RNF-007a (o payload por UF é o maior do produto — o drill-down vai para Blob por
isso), RNF-022/023/024.

## Degradação pré-acordada — decidida em 2026-09-07, **não re-discutir**

| Marco | Condição | Consequência |
|---|---|---|
| **19/09** | Módulo de cadeiras não passa nos golden de 2022 | Spec shippa **parcial**: votos por partido/federação, **sem** projeção de cadeiras. RF-123 a RF-127 saem do escopo desta janela. |
| **24/09** | Nem o parcial por partido está verde | A aba fica **desabilitada** e o cargo vai para **2030**. |

A degradação é sobre a **projeção de cadeiras**, não sobre a ingestão: o cargo 6
continua sendo ingerido e persistido de todo jeito (append-only, constituição § 10),
para que 2030 comece com histórico.

## Open questions

4. **As duas cadeiras de 2022 que a aritmética não explica.** MG (NELY AQUINO,
   PODE) e RS (BIBO NUNES, PL), ambas "ELEITO POR MÉDIA". Nos dois casos o TSE
   deu a vaga à agremiação de **menor** média, tendo a de maior média candidato
   acima do piso de 20% — o que a leitura literal do art. 109 I não admite.
   Descartado pelo dado: o quociente de MG bate por duas fontes independentes
   (210.400, ao voto), os votos nominais batem exatamente entre os dois datasets
   do TSE, e a ordem não muda incluindo ou excluindo legenda da média.
   Hipótese **não confirmada**: decisão judicial posterior — `DS_SIT_TOT_TURNO`
   registra o desfecho jurídico, que não precisa coincidir com a aritmética.
   Ambos são troca entre duas agremiações, forma típica desse tipo de decisão.
   **Não bloqueia o ship**: 511/513 com fase 1 exata é evidência suficiente de
   que o método está certo. Reabrir se o simulado mostrar padrão parecido.

5. **O golden exercita, mas não discrimina, o arredondamento do art. 106.**
   Quatro UFs de 2022 caem na fração exata de 0,5 (AP, MT, SC, TO), mas 1 voto
   de diferença no quociente não move cadeira nelas — verificado por mutação.
   Quem protege a regra são os casos sintéticos de `test_cadeiras.py`. Registrado
   para que ninguém trate o golden como prova completa.

1. **"Candidato com ≥20% do QE" — precisa estar não eleito?** O texto do art. 109
   § 2º não qualifica. A leitura operacional é que sim (a cadeira precisa ser
   ocupável), mas não há dispositivo nem acórdão que resolva. **Travar com fixture
   do simulado** antes de 04/10.
2. **Tabela de cadeiras por UF em 2026** — o total de 513 está confirmado; a
   distribuição por UF, não. Ver RF-124.
3. **Empate de médias que sobrevive aos dois critérios de desempate** (maior
   votação total, depois maior votação nominal) — a norma não prevê sorteio. A
   decisão desta spec é **marcar como indeterminado na tela**, nunca escolher.

## Cross-refs

- [ADR-0027](../../architecture/adrs/0027-conversao-votos-em-cadeiras-deputado-federal.md) — o método de cadeiras, com o texto legal vigente e a jurisprudência
- [ADR-0026](../../architecture/adrs/0026-cargos-senador-deputado-ingestao-e-read-path.md) — ingestão e read path híbrido (⚠️ cita "Lei 9.504 art. 111"; o correto é **Código Eleitoral** art. 111, e ele está inconstitucional — ver ADR-0027)
- [ADR-0032](../../architecture/adrs/0032-detalhe-municipal-vercel-blob.md) — o mesmo mecanismo de Blob, já em uso para detalhe municipal
- [Spec 016](../016-senador/spec.md) — o outro cargo novo, majoritário
- `lib/config/cargos.ts` — tabela canônica (`proporcional: true`, `vagasPorUf: null`)
