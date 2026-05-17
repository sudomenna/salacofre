---
title: Runbook
description: Procedimentos operacionais para incidentes na noite eleitoral
status: stable
source: PRD.md § 19.5
---

# Runbook

Documento operacional com procedimentos para cenários críticos. Versão completa: `RUNBOOK.md` na raiz do repo (a ser criado em F6).

## Cenários cobertos

- **TSE indisponível** (>60s, >5min, >15min) — diagnóstico, banner, escalada.
- **Modelo retornando NaN** — fallback para último valor, alerta.
- **Cache hit ratio caindo** — investigar invalidação descontrolada.
- **Rollback de release** — Rolling Release reverter via dashboard.
- **Pico de tráfego acima do esperado** — monitorar billing, ativar plano emergencial CF.

## Conformidade TSE (RF-010 — spec 001)

**Status do cadastro como "interessado na divulgação"** (Resolução TSE 2026):

- **Resolução 2026**: ainda não publicada (verificação em [docs/reference/regulatory.md](../reference/regulatory.md)). Tratamos a Resolução 23.736/2024 como referência de práticas, sem assumir reuso literal.
- **Cadastro TSE**: pendente. Janela típica de cadastro: junho–setembro 2026 (a confirmar com publicação da resolução). Owner: Tiago Menna (menna@outsiders.digital).
- **User-Agent** atual em prod/preview: `SalaCofre/1.0 (interessado-divulgacao-cadastrado)`. Placeholder até que o texto exato exigido pela Res. 2026 seja conhecido (D-2, spec 001).
- **Watch**: revisar [docs/reference/regulatory.md](../reference/regulatory.md) semanalmente (terça-feira, ~9h).

### Triggers que invalidam este checklist

- Publicação da Resolução TSE 2026 → revisar User-Agent, cadenciamento (RF-002), formato EA20.
- Cadastro de interessado aprovado pelo TSE → atualizar status acima.
- TSE sinaliza mudança de formato em simulado → diff técnico em spec 001.

### Pós-publicação da Res. 2026 — checklist de adaptação

- [ ] Ler resolução completa, comparar contra 23.736/2024
- [ ] Atualizar User-Agent em `lib/tse/client.ts` se exigido (e propagar T18 de novo)
- [ ] Confirmar cadenciamento aceito pelo TSE (ADR-0011 declara 60s — pode precisar de ADR de revisão)
- [ ] Submeter cadastro de "interessado na divulgação"
- [ ] Aguardar aprovação e registrar data nos cross-refs
- [ ] Despachar `constitution-guard` para validar § 1 (transparência TSE)

## Testes manuais de alerting (T21 spec 001)

### Forçar alerta de lag (`tse.lag_seconds > 60`)

1. No preview Vercel, garantir env `SLACK_WEBHOOK_URL` apontando pra `#salacofre-ops` (ou canal de teste).
2. Setar `INGEST_WINDOW_OVERRIDE=true` e `CRON_ENABLED=true` no preview.
3. Servir uma fixture com `dg/hg` 2 horas no passado (ex.: `dg="04102026", hg="18:00:00"` num teste rodado às 20:00 BRT) — pode-se mockar o TSE temporariamente ou seedar `snapshots` com `payload.dg/hg` antigos.
4. POST manual para `/api/ingest` com `x-cron-secret` correto:
   ```bash
   curl -X POST -H "x-cron-secret: $CRON_SECRET" \
     https://<preview-url>/api/ingest
   ```
5. Confirmar mensagem `[WARN] tse.lag_seconds > 60` em `#salacofre-ops`.

### Forçar alerta de erros (`>= 3 erros consecutivos`)

1. Mockar 3+ targets retornando 5xx — em preview, pode-se setar uma whitelist temporária apontando pra URLs inválidas via `TSE_TARGETS_WHITELIST=ZT:9` (UF inexistente).
2. POST manual ao `/api/ingest`.
3. Confirmar mensagem `[ERROR] 3 erros consecutivos no ciclo` em `#salacofre-ops`.

### Não disparou?

Checklist:
- [ ] `SLACK_WEBHOOK_URL` setada e válida (testar com `curl` direto)
- [ ] `CRON_SECRET` correto no header
- [ ] Janela aberta ou override ativo
- [ ] Verificar logs Vercel (`vercel logs`) — webhook timeout (3s) faz fire-and-forget falhar silenciosamente

## Modelo — profiling baseline (T13 spec 002 · RNF-006)

Baseline de `computed_duration_ms` do endpoint `/api/model/project` (orquestrador T12). A meta operacional é **p95 < 2000ms** ([RNF-006](../nfr/performance.md)), com sub-meta interna **p95 < 1500ms** para deixar ≥500ms de folga ao I/O Postgres (Neon) que entra na conta em produção.

### Resultado — 2026-05-17 (medição local, mock psycopg)

| Quantil | Valor |
|---|---|
| min | 27 ms |
| p50 | 27.5 ms |
| mean | 27.6 ms |
| **p95** | **28.5 ms** |
| p99 | 30 ms |
| max | 30 ms |

**Veredito**: PASS. Margem de ~1970ms sobre a meta — o cómputo NumPy puro consome <2% do orçamento. O bootstrap vetorizado de T09 (matriz `(1000, k)` num único `rng.integers`) é o que entrega esse número; nada a otimizar agora.

### Dataset usado

- 27 UFs canônicas (AC..TO, incluindo DF)
- 100 zonas por UF → **2.700 zonas total**
- 2 candidatos (códigos 100 e 200, dois finalistas Presidente turno 1)
- `n_resamples=1000` (default T09)
- `pct_apurado` zona-a-zona: uniforme [30%, 80%]
- `pct_validos_2022` por UF: cand A em [40%, 60%], B = complemento, com ruído ±5pp por zona
- Eleitorado por zona: uniforme [100k, 500k]
- N=50 iterações, `trigger_ts` distinto a cada uma (seeds bootstrap descorrelacionados)

### Como reproduzir

```bash
source .venv-model/bin/activate
python scripts/profile-model.py
```

Saída inclui linha `RESULT_JSON={...}` final para parsing programático (CI futuro).

### Caveats

- **Mock psycopg** — `_open_conn` foi monkey-patched para uma `FakeConn` em memória (mesmo padrão do `tests/unit/model/test_orchestrator.py`). A medição **não inclui**: cold-start `psycopg[binary]` (~150ms), round-trip Neon (3 queries SELECT + 1 `executemany`), latência cross-region Vercel↔Neon. Em produção real, somar ~250–600ms ao p95 medido aqui.
- **Single-region NumPy local** — máquina dev (M-series Mac, Python 3.14.3, numpy 2.4.5). Vercel Fluid Compute Python tem perfil de CPU similar mas memória/cache distintos; reteste em preview é obrigatório (chore S03 após T15 fechar e dar acesso a preview URL com DATABASE_URL real).
- **Sem concorrência** — uma chamada por vez. Em prod, `/api/ingest` chama 1× por cargo ativo; se Presidente + Governador rodarem simultaneamente, há contenção potencial em GIL durante o bootstrap. Não esperamos impacto (numpy libera GIL), mas medir em preview.

### Trigger de re-medição

Re-rodar este profiling sempre que:

- Algum dos módulos `api/model/{bootstrap,projection,weighted_average,swing,p_vitoria}.py` mudar.
- `n_resamples` for ajustado (default atual 1000).
- Número de UFs apuradas ou candidatos por UF crescer significativamente (ex.: turno 1 vereador → 100+ candidatos por município).
- Após primeiro deploy em preview com Neon real, abrir issue de re-medição contra preview URL com 50 chamadas `curl` autenticadas (`x-model-secret`).

### Se p95 regredir > 1500ms

Plano B em ordem de impacto/custo:

1. **Vetorizar `compute_uf_projections`**: hoje há um loop Python `for uf in snaps_by_uf`. Se as 27 UFs entrarem num único bootstrap NumPy 3-D (`(n_resamples, n_ufs, k)`), ganho estimado 5–10×.
2. **Threading**: `concurrent.futures.ThreadPoolExecutor(max_workers=4)` sobre as 27 UFs. NumPy libera GIL durante operações de array → ganho 2–3×. Mais simples que (1) mas menos eficaz.
3. **Pré-agregar `p_2022_uf`**: hoje recomputamos o índice de histórico a cada chamada. Materializar em tabela `historical_results_uf_agg` (chore S03 ou S04) economiza ~3–5ms — irrelevante hoje, mas útil se o histórico crescer (vereadores).
4. **Reduzir `n_resamples` para 500** — **não recomendado**: afeta largura do CI e a confiabilidade da `p_vitoria` (constituição § 6 exige seed estável, mas n=500 amplia variância amostral).

## TSE — concorrência produção (T17 spec 002, carry-over S02)

`/api/ingest` em S02 ficou com `CONCURRENCY=20` no semáforo de fan-out. Em produção (1º turno), o dimensionamento é ~73.000 targets por ciclo (cargos 1 + 3 × 27 UFs × ~135 zonas/UF). Conta de guardanapo:

```
73.000 targets / 20 paralelos × 500 ms latência média ≈ 1.825 s
```

Cron Vercel é 60 s (ADR-0011). Não cabe. Decisão **NÃO** tomada nesta sprint (Fase 7 ainda pode consumir buffer da S03). Três opções, cada uma com trade-off:

| Opção | Como | Trade-off |
|---|---|---|
| **(a) `CONCURRENCY=100`** | Mudar constante em `app/api/ingest/route.ts`; Neon Pro tolera 100+ conexões via pooler | Mais simples. Risco: contenção em pico (vários cargos simultaneamente). Testar em preview com fixtures sintéticas. |
| **(b) Particionar por UF (27 crons)** | 27 entradas em `vercel.ts` crons, cada uma cobrindo uma UF; `/api/ingest?uf=SP` | Distribui carga uniformemente. Custo: 27× invocações Vercel (Pro inclui crons, mas verificar quota). Operacionalmente mais ruidoso. |
| **(c) Fluid Compute `maxDuration=800`** | Aumentar `maxDuration` da função `/api/ingest` no `vercel.ts` | Caminho técnico mais limpo. Custo: Active CPU pricing × duração; até confirmar não estourar orçamento operacional. |

**Watch item para S04**: decidir antes de F4/F5 (UI). Se nenhuma opção resolve em <1 sprint, considerar **ADR formal** (despachar `adr-author`).

**Como reproduzir o gargalo**: rodar `data-pipeline/measure-fanout.ts` (não existe ainda — chore se quisermos validar com números reais antes de decidir) ou inspecionar `ingest_log.duration_ms` em preview com `TSE_TARGETS_WHITELIST` ampliado.

## Cross-refs

- Alertas Slack: [./alerts.md](./alerts.md)
- Dashboard `/_status`: [./dashboard-status.md](./dashboard-status.md)
- Disponibilidade: [../nfr/availability.md](../nfr/availability.md)
- Performance NFR: [../nfr/performance.md](../nfr/performance.md)
- Spec 001 (ingestão TSE): [../specs/001-ingestao-tse/](../specs/001-ingestao-tse/)
- Spec 002 (modelo estatístico): [../specs/002-modelo-estatistico/](../specs/002-modelo-estatistico/)
