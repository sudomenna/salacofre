---
id: 016-senador
title: Senador — corrida majoritária de 2 vagas por UF
status: draft
priority: M
personas: [P1, P2, P3]
screens: [T-09, T-10]
requirements: [RF-100, RF-101, RF-102, RF-103, RF-104, RF-105, RF-106, RF-107, RF-108]
depends_on: [001-ingestao-tse, 002-modelo-estatistico]
apis: [GET /api/ingest/senador, POST /api/ingest/senador, GET /api/projection?cargo=senador]
components: [ResultPanel, CandidateListCollapse, ChancesPanel, CargoTabs, RaceHeader, ForecastTransparency]
nfr: [RNF-001, RNF-002, RNF-003, RNF-006, RNF-022, RNF-023, RNF-024]
adrs: [0001, 0012, 0020, 0021, 0026, 0028, 0033, 0034, 0035]
opens_after: 2026-09-11
---

# Spec 016 — Senador

**Rotas**: `/senador` (nacional) e `/uf/[sigla]/senador` (por estado)
**Cargo TSE**: 5 · **Turno único** · **2 vagas por UF**

## Status

`draft`. Escrita em 2026-09-11 a partir do [ADR-0026](../../architecture/adrs/0026-cargos-senador-deputado-ingestao-e-read-path.md),
que fixou ingestão e read path em 07/09 mas não gerou spec. A ingestão já está
implementada e medida (27 alvos por ciclo, cron de 5 min); falta o modelo, o
payload e as duas telas.

## Objetivo

Cobrir a disputa do Senado em 2026 com a mesma qualidade de projeção dos cargos
majoritários já cobertos, respeitando a diferença que muda tudo na leitura:
**são duas vagas por estado, não uma**. Um leitor que veja a tela de Senador com
a gramática de "quem está na frente" vai ler errado — o que importa é **quem são
os dois primeiros**, e a margem que interessa é a do **2º para o 3º**, não a do
1º para o 2º.

## Escopo

### Dentro

- Ingestão do cargo 5 em granularidade **UF** (27 arquivos por ciclo), cron de
  5 minutos — já implementado em 2026-09-11.
- Projeção por UF pela regra de três do [ADR-0021](../../architecture/adrs/0021-extrapolacao-do-apurado-sem-2022.md),
  aplicada no **nível da UF** (o `k` da UF), não da zona.
- `p_eleito` para cada candidato — probabilidade de terminar entre os dois
  primeiros.
- Duas rotas, com o `<ResultPanel>` do [ADR-0034](../../architecture/adrs/0034-resultpanel-colapso-visual-corte-fora-do-kit.md)
  adaptado a duas vagas.
- Agregado nacional por composição partidária das 54 vagas em disputa.

### Fora

- **Projeção zona a zona.** O ADR-0026 escolheu granularidade UF para este cargo:
  quatro cargos em zona passariam de 24 mil arquivos por ciclo. Consequência
  assumida: a tela de Senador não tem mapa municipal nem "maiores colégios".
  Revisável depois do simulado 2.
- **As 27 vagas que não estão em disputa.** 2026 renova 2/3 do Senado; os
  senadores eleitos em 2022 com mandato até 2031 não aparecem na apuração e não
  devem aparecer como "eleitos" na tela.
- **2º turno.** Não existe para este cargo.

## Requisitos Funcionais

### Ingestão e dado

**RF-100 — Ingestão do cargo 5 em granularidade UF**

WHILE estamos na janela de apuração, the system SHALL acionar
`/api/ingest/senador` a cada 5 minutos, produzindo **27 alvos** (um por UF, sem
arquivo agregado `br-`), conforme [ADR-0026](../../architecture/adrs/0026-cargos-senador-deputado-ingestao-e-read-path.md) item 1.

**Aceitação**:
- Given `TSE_CARGOS` ausente, when `listIngestTargets(production, {cargo: 5})`
  roda, then devolve exatamente 27 alvos, todos `nivel: "uf"`.
- Given `TSE_CARGOS=1,3`, when o cron de Senador dispara, then nenhum alvo é
  produzido — a chave de desligamento tem precedência (`lib/tse/targets.ts::filterCargos`).

**RF-101 — Suplentes preservados no snapshot**

WHEN o parser lê um envelope EA20 de cargo 5, the system SHALL preservar o array
`vs[]` (vice/suplentes, `lib/tse/ea20-schema.ts:91`) no payload persistido, sem
descartá-lo.

**Aceitação**:
- Given um envelope com `vs: [{tp: "s1"...}, {tp: "s2"...}]`, when o snapshot é
  gravado, then os dois suplentes estão recuperáveis do payload bruto
  (constituição § 6 — todo valor exibido reproduzível do snapshot).

### Modelo

**RF-102 — Projeção por regra de três no nível da UF**

WHEN o modelo roda para cargo 5, the system SHALL aplicar a extrapolação do
ADR-0021 com `k = te/esi` calculado **sobre a UF inteira**, não por zona, e
rotular a saída com `metodo.granularidade = "uf"`.

**Aceitação**:
- Given uma UF com 40% apurado, when o modelo projeta, then `pct_projetado` de
  cada candidato soma 100 sobre a base escolhida e `metodo.granularidade` é `"uf"`.
- Given uma UF sem nenhum arquivo apurado, when o modelo roda, then a UF sai como
  `aguardando`, **nunca** com projeção imputada do nacional — a composição
  partidária do Senado varia demais entre estados para que a imputação nacional
  signifique alguma coisa (diferença deliberada em relação ao RF-017 de Presidente).

**RF-103 — `p_eleito` para duas vagas**

WHEN o modelo calcula probabilidades para cargo 5, the system SHALL emitir
`p_eleito` por candidato = fração das reamostras do bootstrap em que aquele
candidato termina em **1º ou 2º lugar**, e NÃO `p_vitoria` (1º lugar).

**Aceitação**:
- Given 4 candidatos, when o modelo roda, then `Σ p_eleito ≈ 2,0` (duas vagas),
  não 1,0.
- Given um candidato em 3º com IC sobreposto ao 2º, when o modelo roda, then seu
  `p_eleito` é estritamente maior que zero.
- Given a mesma semente, when o modelo roda duas vezes, then a saída é idêntica
  bit a bit (constituição § 6).

**RF-104 — Margem relevante é a do 2º para o 3º**

WHEN a UI exibe a margem de uma UF de Senador, the system SHALL exibir a
diferença entre o **2º e o 3º** colocados, rotulada como "margem para a 2ª vaga",
e não a diferença entre 1º e 2º.

**Aceitação**:
- Given 1º com 40%, 2º com 30% e 3º com 29%, when a tela renderiza, then a
  margem exibida é **1 pp**, não 10 pp.

### Telas

**RF-105 — Painel de resultado com duas vagas (T-10)**

WHEN `/uf/[sigla]/senador` renderiza, the system SHALL marcar visualmente os
**dois** primeiros colocados como ocupantes das vagas, com o mesmo tratamento —
sem hierarquia visual entre 1º e 2º, que não existe no resultado.

**Aceitação**:
- Given o payload de uma UF, when a tela renderiza, then exatamente 2 linhas
  carregam o marcador de vaga.
- Given a lista completa, when colapsada (ADR-0034 D21), then as 2 linhas de vaga
  permanecem no DOM, visíveis (ADR-0017).

**RF-106 — Rótulo explícito de duas vagas**

WHEN qualquer tela de Senador renderiza, the system SHALL exibir o texto "2 vagas
por estado" junto ao título da corrida.

**Aceitação**:
- Given `/senador` ou `/uf/XX/senador`, when renderiza, then o texto está
  presente. ⚠️ O kit de UI rotula **"1 vaga"**
  (`docs/architecture/adrs/0029-home-mobile-first-mapa-primeiro-fiel-ao-kit.md:56`)
  — esse rótulo **não deve ser herdado**.

**RF-107 — Composição nacional das 54 vagas (T-09)**

WHEN `/senador` renderiza, the system SHALL exibir a contagem de vagas projetadas
por partido/federação, deixando explícito que são **as 54 em disputa**, não a
composição total de 81 cadeiras do Senado.

**Aceitação**:
- Given qualquer estado de apuração, when a tela renderiza, then o denominador
  exibido é 54 e há texto distinguindo-o das 81 cadeiras.

**RF-108 — Transparência de método e cadência**

WHEN uma tela de Senador exibe projeção, the system SHALL exibir que a projeção é
**em nível de estado** (não zona a zona, ao contrário de Presidente e Governador)
e que a atualização é a cada 5 minutos (constituição § 8, ADR-0026 item 5).

**Aceitação**:
- Given a tela renderizada, when o leitor busca a metodologia, then ambos os
  fatos estão legíveis sem clique.

## Requisitos Não-Funcionais

Herda RNF-001 (LCP), RNF-002/003 (Core Web Vitals), RNF-006 (defasagem <90 s —
aqui relaxada para a cadência de 5 min do cargo), RNF-022/023/024 (a11y).

## Degradação pré-acordada

Esta spec **não** tem cláusula de desistência — a que foi acordada em 07/09 vale
para a [spec 017](../017-deputado-federal/spec.md). Senador reaproveita o
estimador existente e não depende de módulo novo de cálculo.

## Open questions

1. **`p_eleito` com candidatura de partido nanico e IC muito largo** — o bootstrap
   pode dar `p_eleito` não desprezível a quem está a 20 pp do 2º. Definir um piso
   de exibição, ou exibir o número cru? Decidir com dado do simulado.
2. **Agregado nacional** — o TSE não publica arquivo `br-` para cargo 5
   (`lib/config/cargos.ts`, `temArquivoBr: false`), então a composição nacional é
   soma nossa das 27 UFs. Isso é **agregação**, não estimativa, e não fere a
   constituição § 6 — mas a tela precisa dizer de onde vem o número.

## Cross-refs

- [ADR-0026](../../architecture/adrs/0026-cargos-senador-deputado-ingestao-e-read-path.md) — ingestão e read path (item 1 emendado: cron por segmento de rota, não query string)
- [ADR-0028](../../architecture/adrs/0028-corrida-explicita-por-rota.md) — corrida explícita por rota; pré-requisito implementado em 2026-09-11
- [ADR-0021](../../architecture/adrs/0021-extrapolacao-do-apurado-sem-2022.md) — o estimador reaproveitado em nível de UF
- [ADR-0034](../../architecture/adrs/0034-resultpanel-colapso-visual-corte-fora-do-kit.md) — `<ResultPanel>` como hero
- `lib/config/cargos.ts` — tabela canônica (`vagasPorUf: 2`, `granularidade: "uf"`, `temSegundoTurno: false`)
- [Spec 017](../017-deputado-federal/spec.md) — o outro cargo novo, proporcional
