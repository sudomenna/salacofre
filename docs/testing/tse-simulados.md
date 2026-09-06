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
| `TSE_GRANULARIDADE` | `uf` (default) |
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

```bash
curl -X POST https://<preview-url>/api/ingest -H "x-cron-secret: $CRON_SECRET"
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
2. **`TSE_MAX_RPS` de produção** — o default 30 é estimativa de segurança, não medição.
3. **`INGEST_CONCURRENCY` e `maxDuration`** — recalibrar com `duration_ms` real.
4. **`EA15Schema` e o path do EA15** — ajustar ao arquivo real coletado no passo 3.

## Cross-refs

- Conformidade regulatória (ADR-0020): [../architecture/adrs/0020-conformidade-res-23751-2026.md](../architecture/adrs/0020-conformidade-res-23751-2026.md)
- Leiautes TSE 2026 (fonte técnica): [../reference/tse-2026-leiautes.md](../reference/tse-2026-leiautes.md)
- Runbook (env vars, ferramentas, fan-out): [../operations/runbook.md](../operations/runbook.md)
- Regulamentação: [../reference/regulatory.md](../reference/regulatory.md)
- Spec ingestão: [../specs/001-ingestao-tse/](../specs/001-ingestao-tse/)
- Checklist pré-prod: [../operations/pre-prod-checklist.md](../operations/pre-prod-checklist.md)
