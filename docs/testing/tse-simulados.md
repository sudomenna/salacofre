---
title: Simulados do TSE
description: Protocolo de execução das janelas de simulado oficial do TSE (15–17/09 e 22–24/09 de 2026)
status: stable
source: Fase 4 do plano de prontidão TSE 2026 (docs/_meta/plano-s07-2026-09-05.md)
---

# Simulados do TSE

> ## ⛔ Nunca sondar URL adivinhada
>
> Os `codEleicao` do simulado vêm **do `ele-c.json` do ambiente de simulado** ou de **comunicado oficial
> do TSE** — **nunca** de tentativa e erro. Uma requisição malformada (404) pode **bloquear nosso IP por
> 10 minutos**, e o limiar não é divulgado. Não existe índice de arquivos no CDN: não há nada a "varrer".
>
> Um bloqueio queima uma das **quatro** janelas de teste (9h–12h e 14h–17h BRT, em dois blocos de dias)
> que existem antes do dia D. Todo teste exploratório roda contra o **mock local**
> (`pnpm tse:mock --port 8787`), nunca contra `resultados-sim.tse.jus.br`.
>
> Ver [ADR-0020](../architecture/adrs/0020-conformidade-res-23751-2026.md) e
> [runbook § Conformidade TSE](../operations/runbook.md#conformidade-tse-rf-010--spec-001).

## Calendário

| Data | Evento |
|---|---|
| **~12/09** | Se as URLs/códigos do simulado não saírem: abrir chamado em `30308800.tse.jus.br` (descrição começando com `Resultados - Divulgação`) |
| **15–17/09** | 1ª janela de simulado — 9h–12h e 14h–17h BRT |
| **22–24/09** | 2ª janela de simulado — mesmas faixas |
| **03/10** | TSE insere parâmetros oficiais no data center |
| **04/10 17h** | 1º turno |

Ambiente: `https://resultados-sim.tse.jus.br/oficial`.

## Pré-requisitos

- **Não há cadastro a obter** — a Res. TSE 23.751/2026 não prevê registro de "interessado na divulgação". Participar do simulado é só consumir o CDN de simulado respeitando arts. 264–269.
- Pipeline `/api/ingest` operacional com rate limiter, retry de 429/503 e lock anti-overlap (Fase 0 da S07).
- **User-Agent com contato definido** (`lib/tse/client.ts:60`, hoje `contato: pendente`) — decisão humana, prazo 15/09.
- `pnpm tse:watch --once` rodando **diariamente** até o TSE publicar os códigos de 2026.

---

## Protocolo do dia 15/09

### Passo 0 — Confirmar a premissa da fatia por município (a pergunta mais cara de errar)

**Antes de qualquer outro passo.** Toda a arquitetura de ingestão (migration 0006,
ADR-0035, `api/model/zona_merge.py`) repousa numa premissa **nunca verificada
contra dado real**: que o arquivo de zona `<uf><mun5>-z<zona4>-c<cargo>-e<n>-u.json`
(`lib/tse/targets.ts::buildEA20UrlZona`) traz apenas a **fatia** da zona que cai
naquele município — não a zona inteira. Se a premissa for falsa,
`merge_pairs_into_zonas` soma N cópias da mesma zona (N = nº de municípios que ela
cobre, até 8) e todo painel municipal (`fetch_municipio_aggregates`) credita a zona
inteira a cada município que ela toca. Isso é invisível em qualquer teste com
fixture sintética — só o dado real do simulado decide. Uma guarda de sanidade em
runtime (`api.model.zona_merge.check_zona_merge_sanity`, chamada em
`_do_project`) já loga `error` e aciona o Slack se a razão `Σ e.te dos pares / eleitorado
da zona` for compatível com multiplicação (`>= 1,8`) — mas ela é uma rede de
segurança operacional, não confirmação. **Este passo é a confirmação.**

1. Achar uma zona multi-município no banco:

   ```sql
   SELECT uf, cod_zona, COUNT(DISTINCT cod_municipio_tse) AS n_municipios
   FROM zonas
   GROUP BY uf, cod_zona
   HAVING COUNT(DISTINCT cod_municipio_tse) > 1
   ORDER BY n_municipios DESC
   LIMIT 5;
   ```

2. Baixar, para `tests/fixtures/tse/2026-sim/`:
   - o arquivo de zona (`buildEA20UrlZona`) de **cada um dos pares** dessa zona
     (um por município que ela cobre);
   - o arquivo de **município** (`buildEA20UrlMunicipio`) de **um** desses
     municípios;
   - o arquivo **EA12** (`mun-e<eleição>-cm.json`,
     `tse-ea12-arquivo-de-configuracao-de-municipios.txt:26-28`) — mesmo diretório,
     confirma quais zonas o EA12 associa a cada município e serve de referência
     cruzada independente do EA20.

3. **Rodar o script** — as três aritméticas estão automatizadas desde 11/09:

   ```bash
   set -a; . ./.env.local; set +a
   pnpm verify-fatia-premise --fixtures tests/fixtures/tse/2026-sim
   ```

   `scripts/verify-fatia-premise.ts` **não faz nenhuma requisição** — opera só
   sobre os arquivos já baixados no passo 2. Códigos de saída: **0 = fatia
   confirmada** (siga o protocolo), **2 = multiplicação** (pare e reporte),
   **1 = inconclusivo** (não é sinal verde — é ausência de sinal; confira se
   baixou TODOS os pares de uma zona multi-município). Validado nos dois
   desfechos contra dado real de MG zona 4 (razão 1,000 → fatia; a mesma zona
   com os arquivos duplicados → razão 6,000 → multiplicação).

   As três aritméticas que ele executa, para conferência manual se preciso:

   - **Σ `e.te` dos pares da zona = eleitorado da zona em `eleitorado`?**
     Somar `e.te` de todos os arquivos de zona baixados no passo 2 e comparar
     contra `SELECT SUM(eleitores_aptos) FROM eleitorado WHERE ano = 2026 AND uf = ? AND cod_zona = ?
     GROUP BY uf, cod_zona`. Razão ≈ 1 confirma a fatia. Razão ≈ N (nº de pares)
     derruba a premissa — os arquivos trazem a zona inteira, e a soma multiplica.
   - **Σ `v.vvc` (e `cand[].vap`) dos pares de um município = o arquivo `mu` daquele
     município?** Somar os pares que pertencem ao município escolhido no passo 2 e
     comparar campo a campo (`v.vvc`, `v.vv`, cada `cand[].vap`) contra o arquivo de
     município baixado. Bater exatamente confirma que o arquivo de município é a
     soma exata dos seus pares — condição necessária para `fetch_municipio_aggregates`
     continuar correto.
   - **`s.sa`/`s.si`/`s.ts` dos pares somam de forma consistente?** Resolve a
     pergunta em aberto da Fase 3 (`api/model/zona_merge.py::_psa_merged`):
     `psa` da zona é `100 · Σsa / Σsi` (implementado hoje) ou `100 · Σsa / Σts`? As
     fixtures do repo são sintéticas e não decidem — só o dado real do TSE tem os
     três campos preenchidos de forma que a razão certa fique óbvia.

Se a razão do item 1 confirmar a fatia (≈ 1), a arquitetura está correta e os
demais passos seguem normalmente. Se confirmar a multiplicação (≈ N), **parar e
reportar** antes de prosseguir com o resto do protocolo — o modelo estaria
inflando o eleitorado apurado de 62,5% das zonas do país.

### Passo 0b — `carg[].nv` nos 27 envelopes de cargo 6 (novo em 12/09)

Rápido, e decide se a tela de Deputado pode confiar no denominador.

`lugares_a_preencher` vem de `carg[].nv` e **nunca** de tabela embutida (RF-124,
ADR-0027). Não foi possível confirmar antes do simulado que o TSE publica esse
campo desde o primeiro ciclo, a 0% apurado: os únicos snapshots com `nv` no banco
são do nosso próprio mock, e o parser marca o campo `optional()`. Ver D9.1 do
[design da spec 017](../specs/017-deputado-federal/design.md).

Ao receber o primeiro ciclo de cargo 6:

- [ ] `nv` está presente nos **27** envelopes?
- [ ] **Σ `nv` == 513**? (se não, o denominador do quociente está errado em alguma
      UF, e isso corrompe a projeção inteira daquela UF)
- [ ] `nv` já vem **a 0% apurado**, ou só aparece depois do primeiro boletim?

Se `nv` só aparecer com apuração, a tela fica com estado transitório: o total de
cadeiras cresce durante a noite em vez de fechar em 513 desde o início. O código
já trata os dois casos; o que muda é o que a tela pode afirmar.

### Passo 1 — Antes das 9h: descobrir, não adivinhar

```bash
pnpm tse:watch --once                                                  # produção
pnpm tse:watch --once --base-url https://resultados-sim.tse.jus.br/oficial   # simulado, se já publicado
```

O watch destaca em MAIÚSCULAS (`ELEIÇÃO GERAL 2026 DETECTADA`) quando surgir uma eleição com `t=1|2` e nome contendo "2026". **Se nada aparecer e não houver comunicado oficial com o `codEleicao`, o protocolo para aqui** — não prosseguir por tentativa e erro.

Registrar: o `codEleicao` obtido, sua **fonte** (`ele-c.json` do ambiente sim / comunicado / chamado) e o horário.

### Passo 2 — Configurar o preview

Ambiente **preview** da Vercel (nunca produção):

| Variável | Valor no dia 15 |
|---|---|
| `TSE_BASE_URL` | `https://resultados-sim.tse.jus.br/oficial` |
| `TSE_COD_ELEICAO` | `ele2026/<n>` — **do passo 1**, jamais chutado |
| `INGEST_WINDOW` | `9-17` (janela diurna do simulado; o default `17-04` excluiria o teste inteiro) |
| `TSE_MAX_RPS` | `20` — conservador na primeira janela |
| `TSE_TARGETS_WHITELIST` | `SP:1,SP:3` — começar pequeno |
| `TSE_ACOMPANHAMENTO` | `off` — só ligar no dia 16/17, depois do EA15 mapeado |
| `TSE_GRANULARIDADE` | `zona` (default desde 2026-09-05, E4 — `lib/tse/targets.ts::getGranularidade`; **não** `uf`) |
| `CRON_ENABLED` | `false` no início — os primeiros ciclos são manuais |

### Passo 3 — Coleta obrigatória de fixtures e diffs

**Este é o passo que não pode ser pulado**: é a única oportunidade de ver o dado real antes do dia D.

Baixar do ambiente de simulado, para `tests/fixtures/tse/2026-sim/`:

- [ ] **1 arquivo EA20** (nível UF, cargo 1)
- [ ] **1 arquivo EA15** (acompanhamento UF)
- [ ] **o arquivo EA14** (acompanhamento Brasil)

E então:

- [ ] Rodar **`EA20Schema.parse`** no arquivo baixado — precisa passar sem erro. Se falhar, anotar o campo exato e o motivo (o envelope é `.passthrough()`; falha significa campo **obrigatório** ausente ou de tipo diferente).
- [ ] **Diff do EA20 contra a fixture 2022** — campo a campo, contra o que [docs/reference/tse-2026-leiautes.md § 2](../reference/tse-2026-leiautes.md) documenta: hierarquia `carg[] → (fed[] | agr[].par[]).cand[]`, objetos de raiz `s` / `e` / `v`, decomposição `v.vvc = v.vv + v.van + v.vansj`.
- [ ] **Confirmar o valor real de `f`** (fase/ambiente). O schema aceita qualquer string não vazia e apenas loga um warn fora de `["o", "s"]` — anotar o que o simulado realmente manda. Um `f` inesperado é sinal, não erro.
- [ ] **Confirmar o formato de `dg`** — esperado `dd/mm/aaaa`; qualquer outro formato quebra `calculateLagSeconds` e a métrica de lag some **em silêncio**.
- [ ] **Diff do EA15 contra o stub** em `lib/tse/acompanhamento.ts` — path real do arquivo, campos presentes, e se o acompanhamento é **por cargo** ou agregado. O stub foi escrito a partir do PDF, sem nunca ver o arquivo; esta é a validação dele.
- [ ] Anotar o **path completo real** de cada arquivo baixado, para conferir contra os builders de `lib/tse/targets.ts`.

### Passo 4 — Primeiro ciclo, manual

Os crons de produção não apontam mais para `/api/ingest` sem cargo — desde
ADR-0035 D3 (`vercel.ts`) cada cargo tem sua própria rota,
`/api/ingest/presidente` e `/api/ingest/governador`
(`app/api/ingest/[cargo]/route.ts`, que aceita GET **ou** POST), porque a
Vercel só distingue dois crons no mesmo horário por segmento de rota, não por
query string. O Vercel Cron invoca por **GET** com
`Authorization: Bearer <CRON_SECRET>`; o caminho manual do runbook
(`curl -X POST … -H "x-cron-secret"`) continua válido — `lib/tse/ingest-handler.ts`
aceita os dois (Bearer OU `x-cron-secret`).

```bash
# Caminho manual (runbook) — ainda válido:
curl -X POST https://<preview-url>/api/ingest/presidente -H "x-cron-secret: $CRON_SECRET"
curl -X POST https://<preview-url>/api/ingest/governador -H "x-cron-secret: $CRON_SECRET"

# Caminho do Vercel Cron (GET + Bearer) — para reproduzir localmente o que o cron faz:
curl https://<preview-url>/api/ingest/presidente -H "authorization: Bearer $CRON_SECRET"
```

Conferir na resposta e em `ingest_log`:

- [ ] `rateLimited == 0` — **se for > 0, parar e baixar `TSE_MAX_RPS`** antes de qualquer outro ciclo
- [ ] `changed > 0` — snapshots gravados
- [ ] `notFound` — quantos e quais (404 legítimo de zona sem dado ≠ URL errada; se for **todo** target, o path está errado: parar)
- [ ] `duration_ms` e `waitedMs`
- [ ] **Confirmar duração do ciclo em `TSE_GRANULARIDADE=zona` no simulado 1** — o ensaio de escala de 05/09 (mock local, sem tocar o CDN real) mediu **~106–160 s** para o fan-out completo (~5.302 GETs, 2 cargos), acima do cron de 60 s; comparar contra o número real do simulado (latência de rede real ao CDN do TSE pode ser maior ou menor que a do mock local). Ver [runbook § Ensaio de escala](../operations/runbook.md#ensaio-de-escala-05092026--mock-local-3-ciclos-completos) e a linha de risco em [risks.md](../reference/risks.md).
- [ ] Modelo disparou e emitiu `pct_projetado` em escala **0–100**
- [ ] Edge Config recebeu o payload
- [ ] As **4 rotas** do preview renderizam: `/`, `/uf/SP`, `/governador`, `/uf/SP/governador`

### Passo 5 — Janela da manhã (9h–12h) com cron

Ligar o cron (`CRON_ENABLED=true`) e deixar rodar a janela inteira. Exportar ao fim:

- `tse.lag_seconds` (meta: **< 90 s**)
- `duration_ms` por ciclo
- tamanho do payload nacional (meta: **< 75 KB**)
- contagem de `rateLimited`, `notFound`, `waitedMs`

### Passo 6 — Janela da tarde (14h–17h): escalar a taxa

**Só se a manhã fechou com `rateLimited == 0`**, subir `TSE_MAX_RPS` de **20 → 30** e repetir. Se aparecer qualquer 429, voltar a 20 e registrar o ponto de quebra — é esse número que calibra produção.

> Escalonar `TSE_MAX_RPS` em runtime exige `resetTseRateLimiter()` ou um novo deploy: o bucket é um singleton que lê a env **uma vez**, na primeira chamada.

### Dias 16–17

- Ampliar `TSE_TARGETS_WHITELIST` progressivamente (algumas UFs → todas as 27).
- Ligar `TSE_ACOMPANHAMENTO=on` **só depois** do EA15 mapeado no passo 3.
- Registrar tudo abaixo, em "Registro das janelas".

---

## Saída esperada da S07 (2ª janela, 22–24/09)

- Fan-out completo (27 UFs × 2 cargos) no preview com `TSE_ACOMPANHAMENTO=on`
- Dois ciclos completos **sem 429**
- Lag < 90 s
- Payload nacional < 75 KB
- As 4 rotas renderizando em 1º turno com dados do simulado

## Registro das janelas

> Preencher **durante** cada janela — a decisão de fan-out de produção e a calibração de `TSE_MAX_RPS` dependem destes números.

| Data | Janela | `codEleicao` (fonte) | `TSE_MAX_RPS` | Ciclos | `rateLimited` | Lag p95 | Payload | Observações |
|---|---|---|---|---|---|---|---|---|
| 15/09 | 9h–12h | | 20 | | | | | |
| 15/09 | 14h–17h | | 30? | | | | | |
| 16/09 | | | | | | | | |
| 17/09 | | | | | | | | |
| 22–24/09 | | | | | | | | |

### Decisões que dependem destes dados

1. **Fan-out de produção** — UF/BR só, ou híbrido com granularidade de zona nas UFs sinalizadas pelo EA14 (`TSE_ACOMPANHAMENTO=on`)? O modelo precisa de zona para o swing (RF-011/012). Ver [runbook § dimensionamento do fan-out](../operations/runbook.md#tse--dimensionamento-do-fan-out-revisado-em-2026-09-05). **Decisão do usuário, após medir.**
2. **`TSE_MAX_RPS` de produção** — o default é **50** (`lib/tse/rate-limiter.ts`, teto/ceiling também 50), estimativa de segurança, não medição.
3. **`INGEST_CONCURRENCY` e `maxDuration`** — recalibrar com `duration_ms` real.
4. **`EA15Schema` e o path do EA15** — ajustar ao arquivo real coletado no passo 3.

## Cross-refs

- Conformidade regulatória (ADR-0020): [../architecture/adrs/0020-conformidade-res-23751-2026.md](../architecture/adrs/0020-conformidade-res-23751-2026.md)
- Leiautes TSE 2026 (fonte técnica): [../reference/tse-2026-leiautes.md](../reference/tse-2026-leiautes.md)
- Runbook (env vars, ferramentas, fan-out): [../operations/runbook.md](../operations/runbook.md)
- Regulamentação: [../reference/regulatory.md](../reference/regulatory.md)
- Spec ingestão: [../specs/001-ingestao-tse/](../specs/001-ingestao-tse/)
- Checklist pré-prod: [../operations/pre-prod-checklist.md](../operations/pre-prod-checklist.md)
