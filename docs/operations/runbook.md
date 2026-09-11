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

> **Fonte de verdade**: [ADR-0020 — Conformidade com a Res. TSE 23.751/2026 sem cadastro prévio](../architecture/adrs/0020-conformidade-res-23751-2026.md).
> Esta seção é o **resumo operacional** do ADR. Onde divergirem, o ADR vence — não duplique o raciocínio dele aqui.

### Os dois fatos que mudaram (05/09/2026)

1. **Não existe cadastro.** Para o pleito 2026 **não há** registro, inscrição, homologação ou aprovação de "interessado na divulgação". Os arquivos são públicos no CDN e qualquer entidade pode consumi-los, sujeita às obrigações dos arts. 264–269. O termo "entidade interessada" no material oficial é **descritivo**, não um status administrativo a obter. Toda menção anterior a "cadastro pendente / aprovado" nesta documentação (redigida em maio/2026) partia de analogia com a Res. 23.736/2024 e **estava errada**.
2. **A norma vigente está publicada**: **Res. TSE nº 23.751/2026, Título III, Cap. VI, arts. 264–269**. Não há "watch de publicação" a manter — o que resta é cumprir o que já está em vigor.

### Obrigações vigentes (o que a operação precisa garantir)

| Obrigação | Origem | Como cumprimos hoje |
|---|---|---|
| **Não alterar o conteúdo dos dados** distribuídos pela Justiça Eleitoral | **Art. 267 § 4º** | `snapshots.payload` guarda o envelope EA20 **cru**, como recebido; nunca há `UPDATE` (constituição § 10). A projeção estatística é **conteúdo derivado**, gravado em `projections`, nunca sobre o registro do dado oficial. |
| Rotular a projeção como **não oficial** | Art. 267 § 4º + constituição § 1 | Footer "Não oficial. Fonte: TSE." em toda superfície; a projeção precisa ser **inconfundível** com o resultado oficial. |
| Buscar os arquivos **periodicamente**, conforme os padrões da Justiça Eleitoral | Art. 267 § 3º | Cron de 60 s (ADR-0011) dentro de `INGEST_WINDOW`, com rate limiter de saída. |
| Infraestrutura de comunicação por conta da entidade | Art. 267 § 2º | Vercel + Neon; nenhuma dependência de recurso do TSE além do CDN público. |
| Não majorar preço de serviço em razão dos dados do TSE | Art. 268 | SalaCofre é gratuito e público. |
| Distinguir **válidos / anulados / anulados sub judice** | **Schema do EA20** (`v.vvc = v.vv + v.van + v.vansj`) — ver ADR-0020, "Consequências" | Denominador de "% dos votos a votáveis" derivado de `vvc`, nunca de `v.tv`. ⚠️ ADR-0020 **não conseguiu confirmar** um parágrafo específico da resolução que imponha isso — trate como **requisito de schema**, não cite artigo. |
| Presidente só a partir das **17h de Brasília** | Art. 265 § 1º | `INGEST_WINDOW` default `17-04`. |
| Descumprir o capítulo → **perda de acesso** ao centro de dados | Art. 269 | É a razão de as invariantes técnicas abaixo serem invioláveis. |

### Invariantes técnicas (ADR-0020 — não relaxar sem novo ADR)

- **Rate limiter de saída sempre ativo** — `TSE_MAX_RPS` default 30, teto duro 80. O limite documentado do TSE é **100 req/s por IP → bloqueio de 10 minutos, renovado** a cada nova violação durante o bloqueio.
- **429 e 503 são retryáveis**, honrando `Retry-After` — um bloqueio de 10 min não pode derrubar o ciclo em silêncio.
- **Proibição absoluta de sondar URLs adivinhadas** contra `resultados.tse.jus.br` ou `resultados-sim.tse.jus.br` — ver a advertência em [Testes manuais de alerting](#testes-manuais-de-alerting-t21-spec-001).
- **Envelope Zod em `.passthrough()`, nunca `.strict()`** — o TSE não anunciou freeze de leiaute.

### User-Agent — decisão humana bloqueante antes de 15/09

O UA atual (`lib/tse/client.ts:60`) é **honesto** mas **incompleto**:

```
SalaCofre/1.0 (+https://salacofre.com.br; contato: pendente)
```

O valor anterior — `SalaCofre/1.0 (interessado-divulgacao-cadastrado)` — declarava um cadastro **inexistente** e foi removido; **nunca reintroduzir** menção a cadastro (ADR-0020). Falta o texto de contato (URL ou e-mail público verificável).

- **Owner**: Tiago Menna (menna@outsiders.digital).
- **Prazo**: antes da 1ª janela do simulado (**15/09**).
- **Bloqueia**: `pre-prod-checklist.md`. Enquanto for `contato: pendente`, o header não cumpre o espírito do formato fixado no ADR-0020 (identificação verificável), ainda que já não seja falso.

### Triggers que invalidam esta seção

- TSE publica **errata ou nova resolução** sobre divulgação → reler arts. 264–269, despachar `adr-author` para supersedir o ADR-0020.
- TSE sinaliza **mudança de leiaute** em simulado → diff técnico contra [docs/reference/tse-2026-leiautes.md](../reference/tse-2026-leiautes.md); `pnpm tse:watch` detecta mudança nas 9 páginas técnicas.
- **Bloqueio de IP observado** (429 sustentado, ou silêncio de 10 min) → reduzir `TSE_MAX_RPS`, abrir incidente, registrar em [docs/testing/tse-simulados.md](../testing/tse-simulados.md).

## Testes manuais de alerting (T21 spec 001)

> ### ⛔ Nunca force um erro contra o CDN do TSE
>
> **Regra inviolável do projeto** (ADR-0020, [handoff 2026-09-05](../_meta/handoff-2026-09-05.md)):
> **é proibido apontar o pipeline para uma URL inválida, inexistente ou adivinhada** em
> `resultados.tse.jus.br` ou `resultados-sim.tse.jus.br` — inclusive "só para testar um alerta".
>
> O material oficial do TSE afirma que uma **requisição malformada (404) também pode gerar bloqueio de IP
> por 10 minutos**, e **o limiar não é divulgado** — não há como calibrar "quantos 404 são seguros",
> e não há como testar isso com segurança. Durante o simulado ou o dia D, 10 minutos de bloqueio
> significam 10 ciclos perdidos e a home congelada.
>
> Isso inclui, explicitamente: `TSE_TARGETS_WHITELIST` com UF/cargo inexistentes, `TSE_COD_ELEICAO`
> chutado, `curl` manual em um path "provável", e qualquer varredura para "descobrir" o que existe —
> **não há índice de arquivos no CDN**; descoberta legítima vem só do `ele-c.json` (EA11) e dos
> arquivos de acompanhamento EA14/EA15.
>
> **Versão anterior deste runbook ensinava exatamente isso** (`TSE_TARGETS_WHITELIST=ZT:9`, "UF
> inexistente"). A técnica foi **removida** — se você a encontrar em qualquer outro documento, é um
> resquício de maio/2026 e deve ser reportado.
>
> **A alternativa correta**: todo teste de ingestão, alerta, retry ou erro roda contra o **mock local
> do CDN** (`scripts/tse-mock-server.ts`), que serve o layout de URL real a partir das fixtures e
> sabe simular 404, 429 e latência sob demanda. Ver [Ferramentas](#ferramentas-do-pipeline-tse).

### Forçar alerta de lag (`tse.lag_seconds > 60`)

1. No preview Vercel, garantir env `SLACK_WEBHOOK_URL` apontando pra `#salacofre-ops` (ou canal de teste).
2. Setar `INGEST_WINDOW_OVERRIDE=true` e `CRON_ENABLED=true` no preview.
3. Servir uma fixture com `dg/hg` 2 horas no passado (ex.: `dg="04/10/2026", hg="18:00:00"` num teste rodado às 20:00 BRT) — apontar `TSE_BASE_URL` para o mock local, ou seedar `snapshots` com `payload.dg/hg` antigos. **Formato de `dg` é `dd/mm/aaaa`** (EA20 § dicionário de dados); `ddMMyyyy` é legado tolerado por `calculateLagSeconds`, não o formato real.
4. POST manual para `/api/ingest` com `x-cron-secret` correto:
   ```bash
   curl -X POST -H "x-cron-secret: $CRON_SECRET" \
     https://<preview-url>/api/ingest
   ```
5. Confirmar mensagem `[WARN] tse.lag_seconds > 60` em `#salacofre-ops`.

### Forçar alerta de erros (`>= 3 erros consecutivos`)

Sempre contra o **mock local**, nunca contra o TSE:

1. Subir o mock com uma fração determinística de 404 (ou com rate limit agressivo, para exercitar o caminho de 429):
   ```bash
   pnpm tse:mock --port 8787 --not-found-ratio 1.0     # todo target 404
   # ou:  pnpm tse:mock --port 8787 --rate-limit-after 3   # 429 + Retry-After a partir do 4º GET
   ```
2. Rodar o ingest apontado para ele:
   ```bash
   TSE_BASE_URL=http://localhost:8787/oficial TSE_COD_ELEICAO=ele2022/544 \
   INGEST_WINDOW_OVERRIDE=true TSE_MAX_RPS=10 pnpm dev
   curl -X POST localhost:3000/api/ingest -H "x-cron-secret: $CRON_SECRET"
   ```
3. Confirmar mensagem `[ERROR] 3 erros consecutivos no ciclo` em `#salacofre-ops` (com `SLACK_WEBHOOK_URL` setada localmente) e os contadores `notFound` / `rateLimited` na resposta JSON.

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

## TSE — dimensionamento do fan-out (revisado em 2026-09-05)

> ⚠️ **Correção de duas gerações de números errados.** Versões anteriores desta seção afirmavam
> **~73.000 targets por ciclo** e concluíam que o ciclo "não cabe em 60 s". Ambas as premissas caíram:
> o número nunca foi 73.000 (com granularidade de zona o real era **~5.200**), e a Fase 0 da S07
> chegou a usar granularidade de **UF** por padrão (~55 GETs). **Essa decisão foi revertida em
> 05/09 (E4 do plano de projeção por regra de três)**: o modo `uf` grava a zona sob o sentinela
> `cod_zona = 0`, que `eleitorado.get((uf, cod_zona), 0)` em `api/model/project.py` não encontra —
> peso 0, zona descartada, participação `None`. **O modo `uf` está quebrado em produção
> hoje.** `zona` volta a ser a granularidade necessária; o texto abaixo documenta seu custo real,
> medido, não estimado.
>
> Números de fan-out confirmados em [docs/reference/tse-2026-leiautes.md § 6](../reference/tse-2026-leiautes.md).
> Números de **desempenho** (duração, throughput, gargalo) medidos em 05/09 com
> `scripts/tse-mock-server.ts --zonas <N> --cargos 1,3` servindo ~2.600 zonas × 2 cargos
> sintéticas em escala real (ver `scripts/tse-mock-server.ts` para o gerador determinístico) —
> ver § "Ensaio de escala" abaixo.

### Requisições por ciclo

| Granularidade | 1 cargo | 2 cargos (Presidente + Governador) | Onde |
|---|---|---|---|
| **`zona` (~6.109 pares na tabela `zonas`)** | ~6.109 | **~12.170 (medido 11/09)** | `TSE_GRANULARIDADE=zona` (default, desde 05/09) — **único modo funcional em produção** (granularidade UF está quebrada no modelo); unidade de ingestão é par (município, zona) |
| `uf` | 27 + 1 BR (só Presidente) | 27×2 + 1 = **55** | `TSE_GRANULARIDADE=uf` — **quebrado no modelo em produção**; mantido só como fallback de emergência (telas nacional/UF sozinhas, sem modelo funcional) |

`zonas` agora é tabela de pares: PK `(uf, cod_municipio_tse, cod_zona)`. Medição em 05/09 sobre _zona_ (2.651) 
era obsoleta quando o EA20 passou a ser por _par_ (6.109); a tabela foi regravada em 11/09. `listIngestTargets` 
(`lib/tse/targets.ts`) enumerava targets de ingestão; com pares, a mesma função agora retorna ~6.109 por cargo. 
Só Presidente (cargo 0001) tem arquivo agregado de Brasil; Governador (0003) tem UF/Município/Zona apenas — daí o "+1" e não "+2".

### Ensaio de escala (05/09/2026 — mock local, 3 ciclos completos)

Protocolo: `pnpm tsx scripts/tse-mock-server.ts --port 8787 --zonas 500 --cargos 1,3` (teto 500 cobre o `codZona` máximo real, 428, em RR/SP) + `pnpm dev` com `TSE_BASE_URL=http://localhost:8787/oficial`, `TSE_COD_ELEICAO=ele2022/544`, `INGEST_WINDOW_OVERRIDE=true`, `TSE_GRANULARIDADE=zona`, `TSE_MAX_RPS=50`, `VERCEL_ENV=production` (necessário — sem isso `listIngestTargets` usa o path de **preview**, whitelist `SP:1`, não o fan-out completo) + `curl -X POST /api/ingest`. Nenhuma requisição tocou `resultados.tse.jus.br`.

| # | `INGEST_CONCURRENCY` | Estado do cache | `durationMs` | `filesFetched` | `filesChanged` | `unchanged` | `rateLimited` | `waitedMs` | rps efetivo |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 30 | frio (maioria muda) | **123.373** | 5.302 | 4.908 | 394 | 0 | 16.975 | ~43 |
| 2 | 30 | quente (tudo 304) | **106.478** | 5.302 | 0 | 5.302 | 0 | 95.033 | ~50 (teto) |
| 3 | 20 | frio (tudo muda) | **155.947** | 5.302 | 5.302 | 0 | 0 | 0 | ~34 |

**Leitura dos números:**

- **Ciclo 2 (tudo 304, sem INSERT) bate quase exatamente o piso teórico do rate limiter**: 5.302 GETs / 50 rps = 106,04 s ≈ **106,478 s medidos**. Com o Postgres fora do caminho quente, `TSE_MAX_RPS=50` é o único gargalo, e o bucket satura (`waitedMs` ≈ `durationMs`).
- **Ciclo 3 (`INGEST_CONCURRENCY=20`, tudo muda) nunca engata o rate limiter** (`waitedMs=0`) — o semáforo de 20 é o gargalo, não o TSE: rps efetivo ~34, próximo da estimativa do plano ("binda em ~40 rps"). Confirma que `INGEST_CONCURRENCY=30` é necessário para aproximar-se do teto de 50 rps.
- **Ciclo 1 (`concurrency=30`, maioria muda) fica 17 s acima do piso do rate limiter** (123 s vs. 106 s) mesmo com concorrência suficiente — a diferença é o **Postgres/Neon**, não o TSE.

**Achado sobre o Postgres (gargalo real, não presumido):** cada zona "mudada" faz **3 round-trips HTTP ao Neon serverless** — 1 `SELECT` em `getLastEtagAndHash` (`lib/tse/repository.ts:65`) antes do fetch, 1 `SELECT` de dedup **repetido** dentro de `insertSnapshot` (`lib/tse/repository.ts:144` — chama `getLastEtagAndHash` de novo) e 1 `INSERT`. Microbenchmark isolado nesta mesma sessão, contra o mesmo Neon: `SELECT` sequencial (sem overlap) — **p50 156,9 ms, p95 510,2 ms**; 30 `SELECT` concorrentes (`Promise.all`) — **18,2 ms/query amortizado**. Ou seja: **bem paralelizado o custo por query desaparece, mas os 2 SELECT + 1 INSERT de uma mesma zona são sequenciais entre si** (o segundo `SELECT` e o `INSERT` só podem rodar depois do primeiro `SELECT` resolver) — em concorrência baixa (20) isso vira um piso de latência por zona de ~450–600 ms que a concorrência não absorve totalmente (~5.300 × 0,55 s / 20 slots ≈ 146 s, próximo dos 156 s medidos). Em concorrência alta (30) o efeito é menor mas ainda soma ~17 s.
**Proposta (não implementada — fora do escopo desta tarefa, requer tocar `lib/tse/repository.ts` e `app/api/ingest/route.ts`):** (a) 1 `SELECT ... WHERE (cargo,turno,uf,cod_zona) IN (...)` para toda a tabela de targets no início do ciclo, eliminando ~5.300 SELECTs individuais; (b) eliminar o `SELECT` duplicado dentro de `insertSnapshot` reaproveitando o resultado já obtido em `getLastEtagAndHash` no passo 5a do handler (mesmo valor, chamado duas vezes hoje); (c) `INSERT` em lote (multi-row) por chunk de N zonas mudadas, no fim do loop em vez de um `INSERT` por zona. Com isso o Postgres deixa de competir pelo orçamento do ciclo e o único teto relevante volta a ser `TSE_MAX_RPS` (~106 s medidos).

**Cadência efetiva em produção**: ciclo de ~104–160 s (a depender de `INGEST_CONCURRENCY` e do "estado" do ciclo — frio custa mais) não cabe no cron de 60 s (ADR-0011); com o lock anti-overlap de 3 min (`OVERLAP_LOCK_WINDOW_MS`, `app/api/ingest/route.ts`), o tick de 60 s seguinte responde `{skipped:"overlap"}` e só o de ~120 s roda de fato — **cadência efetiva ~120 s**, consistente com a estimativa E4 do plano. Isso projeta um lag `tse.lag_seconds` na faixa de **~130–160 s** em regime permanente (tempo desde a geração do arquivo no TSE até o snapshot ficar disponível), acima da meta S07 de **< 90 s** — aceito pelo usuário em E4 como custo conhecido; ver linha nova em [risks.md](../reference/risks.md). **Medir de novo com dados reais do simulado 1 (15–17/09)** antes de fechar a decisão — o ensaio acima usa o mock local, não o CDN real, e não reproduz latência de rede real do TSE.

### Opções de mitigação (se o lag medido no simulado 1 for inaceitável)

Do plano de projeção por regra de três, seção D — nenhuma implementada, todas dependem de decisão humana após medir:

- **Z1 — aceitar e medir (recomendação atual)**: manter `zona` com os números acima; é o desenho necessário para o modelo (RF-011/012) e cabe em `maxDuration=180`. Ação: nenhuma, só observar no simulado.
- **Z2 — dois shards** (`?shard=0|1`, cada um com metade das zonas a ~45 rps): reduziria o ciclo por shard a ~58 s, mas os dois juntos somam ~90 rps agregados no mesmo IP — perto do teto de 100 req/s documentado pelo TSE. Só considerar **com dado do simulado 1** mostrando que Z1 não é suficiente.
- **Z3 — híbrido UF+zona**: usar UF/BR para as telas e zona só nas UFs que o EA14 sinalizar como alteradas (`TSE_ACOMPANHAMENTO=on`). Reduz GETs em ciclos "parados", mas **não resolve** o pico (quando muitas UFs mudam ao mesmo tempo, no horário de maior interesse, o custo converge para o de "zona" completo). Não antes de 04/10 — mudança de escopo maior.

> **A decisão final é do usuário**, só depois de **medir nos simulados de 15–17/09 e 22–24/09** contra o CDN real (latência de rede real, não a do mock local). Se a escolha implicar mudar o contrato do ciclo, despachar `adr-author`.

**Como medir no simulado**: `ingest_log.duration_ms`, `rateLimited`, `waitedMs` e `notFound` de cada ciclo — protocolo em [docs/testing/tse-simulados.md](../testing/tse-simulados.md).

## Variáveis de ambiente do pipeline TSE (hardening pré-simulado, 2026-09-05)

Defaults abaixo **lidos do código** em 2026-09-05, não do plano — cada linha cita `arquivo:linha`.

| Variável | Default | Onde é lida | Descrição |
|---|---|---|---|
| `TSE_BASE_URL` | `https://resultados.tse.jus.br/oficial` | `lib/tse/targets.ts:91` (`getTseBaseUrl`; default em `:71`) | Host do CDN TSE. Aceita o default de produção, `https://resultados-sim.tse.jus.br/oficial` (ambiente de simulado) ou `http://localhost:<porta>`/`http://127.0.0.1:<porta>` (mock local, `scripts/tse-mock-server.ts`). Qualquer outro valor (`http://` em host não-local, URL malformada) lança erro — nunca faz downgrade silencioso de TLS. |
| `TSE_MAX_RPS` | `30` (clamp 1..50) | `lib/tse/rate-limiter.ts:165` (`getTseRateLimiter`; constantes em `:141-146`) | Taxa máxima de saída (req/s) para o CDN TSE. O material oficial do TSE (`tse_docs/txt/apresentacao-interessados-2026.txt`, § "Regras de consumo dos arquivos") documenta limite de **100 req/s por IP → bloqueio de 10 min, renovado a cada nova violação**; o teto de 50 é exigido por **RF-010.3** da spec 001 e deixa margem para retries, HEAD do `tse-watch` e outros processos no mesmo IP. Não elevar sem revisar a spec. **Recomendação de produção para `zona`: `50` (o teto)** — medido em 05/09, ver [Ensaio de escala](#ensaio-de-escala-05092026--mock-local-3-ciclos-completos): com o fan-out de ~5.300 GETs/ciclo, 50 rps é necessário para não deixar `INGEST_CONCURRENCY` como único limitador (ciclo 3 do ensaio, com rps efetivo ~34, nunca chegou a acionar o rate limiter). |
| `INGEST_WINDOW` | `17-04` | `lib/tse/ingest-window.ts:49` (`parseIngestWindow`) | Janela de ingestão, formato `HH-HH` (BRT, 0-23). `17-04` = apuração real (cruza meia-noite); `9-17` = janela diurna dos simulados TSE (9h-17h BRT). `INGEST_WINDOW_OVERRIDE=true` ainda ignora a janela por completo (uso: testes, dry-run manual). |
| `INGEST_CONCURRENCY` | `20` | `app/api/ingest/route.ts:117` (`getIngestConcurrency`) | Tamanho do semáforo de GETs simultâneos por invocação. Ortogonal a `TSE_MAX_RPS`: concorrência limita quantas requisições ficam em voo ao mesmo tempo; `TSE_MAX_RPS` limita quantas SAEM por segundo. Valor inválido cai no default com um warn. **Recomendação de produção para `zona`: `30`** — medido em 05/09: com `20`, o rps efetivo fica em ~34 e o rate limiter nunca satura (`waitedMs=0`, o semáforo é o gargalo); com `30`, o rps efetivo sobe para ~43–50 e o ciclo cai de ~156 s para ~106–123 s. Ver [Ensaio de escala](#ensaio-de-escala-05092026--mock-local-3-ciclos-completos). |
| `TSE_CARGOS` | `1,3` | `lib/tse/targets.ts:336` (`getActiveCargos`) | Lista de cargos ativos (1=Presidente, 3=Governador), separada por vírgula. Usada tanto para materializar targets de produção quanto para decidir quais cargos disparam `/api/model/project` ao fim do ciclo. Tokens inválidos são ignorados com warn; se nenhum sobrar, cai no default. |
| `TSE_GRANULARIDADE` | `zona` (desde 05/09, E4) | `lib/tse/targets.ts:399` (`getGranularidade`) | `uf` \| `zona`. `uf` = 27 UFs × cargos + 1 arquivo BR de Presidente ≈ **55 GETs/ciclo**, mas **está quebrado no modelo em produção** (ver aviso no topo de [dimensionamento do fan-out](#tse--dimensionamento-do-fan-out-revisado-em-2026-09-05) — sentinela `cod_zona=0` sem peso em `eleitorado`). `zona` = **~6.109 pares (município, zona) por cargo**, em invocações separadas desde o cron por cargo (ADR-0035 D3) — era 2.651 × cargos ≈ 5.302 GETs/ciclo até 10/09, quando o alvo ainda era a zona e perdíamos ~56% dos arquivos publicados. Necessária para a regra de três do modelo (RF-011/012) e único modo funcional hoje. Valor inválido cai no default com warn. **O default de código de `getGranularidade` é `zona`** (`lib/tse/targets.ts:404`) desde 05/09 — não é preciso definir a env explicitamente. |
| `TSE_ACOMPANHAMENTO` | *(desligado)* | `app/api/ingest/route.ts:426` | Opt-in literal: **só o valor exato `on` liga**. Quando ligado, 1 GET no EA14 diz quais UFs mudaram desde o último ciclo e os targets são filtrados para essas UFs (alvos de nível `br` nunca são filtrados). Fail-open em dois níveis: qualquer erro faz todas as UFs voltarem como `changed` — o gating economiza requisições, jamais perde atualização. Estado (ETag + hashes) vive em memória do processo, então cold start = 1 ciclo sem gating. **Recomendação de produção**: `on`, para reduzir GETs em ciclos "parados" mesmo em granularidade `zona` — não elimina o pico (quando muitas UFs mudam ao mesmo tempo o custo converge para o fan-out completo, ver opção Z3 em [dimensionamento do fan-out](#tse--dimensionamento-do-fan-out-revisado-em-2026-09-05)), mas não tem custo conhecido de correção; o gating **não foi exercitado neste ensaio** (rodou desligado, de propósito, para medir o pior caso — fan-out completo). |
| `INGEST_WINDOW_OVERRIDE` | *(desligado)* | `app/api/ingest/route.ts:309` | `true` ignora `INGEST_WINDOW` por completo. Uso: dry-run manual e testes. **Nunca em produção.** |
| `FIXTURE_VARIANT` | *(nenhum)* | `app/page.tsx:113` | **Só dev/teste.** `t2` troca a fixture local para o payload de 2º turno (`projection-current-t2.json`), permitindo renderizar o modo `binary` sem Edge Config. Qualquer outro valor = fixture de 1º turno. |

Variáveis já existentes que interagem com as acima (sem mudança de contrato):

- `TSE_COD_ELEICAO` — sem default; **obrigatória**. Validada contra `^ele\d{4}\/\d+$` em `getCodEleicao()` (`lib/tse/targets.ts:296`); valor ausente ou malformado **lança erro** em vez de seguir para uma URL inválida — uma URL malformada pode disparar bloqueio de IP no TSE. Os códigos de 2026 **ainda não existem** no `ele-c.json` de produção (05/09: ainda em `ele2024`); `pnpm tse:watch` avisa quando surgirem.
- `TSE_TARGETS_WHITELIST` — inalterado (preview only). ⚠️ Nunca usar para apontar a UF/cargo inexistente — ver a advertência em [Testes manuais de alerting](#testes-manuais-de-alerting-t21-spec-001).
- `TSE_TURNO` — `1` ou `2` (`app/api/ingest/route.ts:89`).
- `CRON_ENABLED` — qualquer valor diferente de `"false"` mantém o cron ligado (`app/api/ingest/route.ts:293`).

### Não existe: `TSE_EA15_PATH_TEMPLATE`

O handoff de 05/09 lista essa variável, mas ela **não existe no código** — `grep` em `lib/`, `app/` e `scripts/` não retorna nenhuma ocorrência. O que foi implementado em `lib/tse/acompanhamento.ts` usa `buildEA14Url`/`buildEA15Url` de `lib/tse/targets.ts`, com o path derivado da padronização documentada do CDN (`<uf>-e<eleição>-ab.json`), sem template configurável. Se um dia um template for necessário (ex.: o simulado usar um path diferente), ele precisa ser **implementado antes** de ser documentado.

### Edge Config em dev

`EDGE_CONFIG` segue **comentada** em `.env.local` (linha 8) desde **18/05/2026** — o endpoint externo passou a responder com timeout de 10 s ou mais e travava o dev server. Consequência: em desenvolvimento, `lib/edge-config/reader.ts` devolve `null` (`reader.ts:62,131,163`) e as páginas caem em **fixture local**. O que você vê em `localhost:3000` **não** é o payload de produção. Para exercitar o caminho real do Edge Config, descomentar a linha e aceitar a latência, ou usar o preview da Vercel.

### Novidades observáveis no response/log de `/api/ingest`

O JSON de resposta, `logIngestRun.notes` e o `logInfo` final de cada ciclo agora incluem:

- `rateLimited` — quantas respostas 429 o TSE devolveu neste ciclo (via `getClientStats()`/`resetClientStats()` em `lib/tse/client.ts`, resetado no início de cada ciclo). Dispara alerta Slack `error` quando `> 0`.
- `waitedMs` — delta (não total acumulado do processo) do tempo de espera do rate limiter neste ciclo (`getTseRateLimiter().stats.waitedMs`).
- `notFound` — já existia; contorno de 404 (zona sem dados), agora logado em `debug` em vez de `warn` por target (contador agregado preserva a observabilidade).

### Lock anti-overlap

`/api/ingest` grava uma linha marcador (`notes: {running: true}`) em `ingest_log` no início do ciclo e outra (`notes: {running: false, ...métricas}`) no fim — append-only (constituição § 10, nunca `UPDATE`). Se a última linha tem `running: true` com menos de 3 minutos, o handler responde `{ skipped: "overlap" }` em vez de rodar em paralelo. Falha ao ler/escrever o lock é fail-open (loga e segue) — um lock ilegível nunca deve travar o pipeline inteiro.

## Vercel Blob — monitoramento do detalhe por UF (ADR-0032)

Desde 2026-09-08 o read path tem **dois** mecanismos. O resumo por UF continua
no Global Config; o **detalhe municipal e as séries temporais** vivem no Vercel
Blob, um objeto por UF/cargo/turno:

```
https://<storeId>.public.blob.vercel-storage.com/municipios/uf/<SIGLA>/<cargo>/t<turno>.json
```

O `<storeId>` é derivado do `BLOB_READ_WRITE_TOKEN`
(`vercel_blob_rw_<storeId>_<segredo>`) por `lib/blob/paths.ts`;
`BLOB_PUBLIC_BASE_URL` sobrepõe quando presente.

**O que vigiar no log do ciclo.** `writeProjection` emite, na linha
`global-config projection written`, quatro contadores novos:

| Campo | O que significa | Quando agir |
|---|---|---|
| `blobWritten` | objetos publicados no ciclo | esperado: 1 por UF com payload explícito (até 27/cargo) |
| `blobSkipped` | pulados por falta de `BLOB_READ_WRITE_TOKEN` | **> 0 em produção = detalhe municipal offline** |
| `blobFailed` | falhas de `put()` | > 0 recorrente = investigar |
| `blobBytes` | soma dos objetos gravados | referência de crescimento |

E, quando há falha, uma linha `error` dedicada:
`blob uf detail write failures`, com a lista de UFs e o motivo por UF.

**Falha de Blob NÃO derruba o ciclo, de propósito.** O resumo publicado vale
mais que um ciclo marcado vermelho, e o read path degrada por seção com estado
"detalhe indisponível" explícito no DOM. Isso significa que **esta linha de log
é o único alarme** — não existe erro 500 correspondente.

**Verificação manual rápida** (não escreve nada):

```bash
set -a; . ./.env.local; set +a
curl -sI "https://$(echo "$BLOB_READ_WRITE_TOKEN" | cut -d_ -f4 | tr 'A-Z' 'a-z').public.blob.vercel-storage.com/municipios/uf/SP/pres/t1.json"
```

Esperado: `200`, `content-type: application/json` e
`cache-control: public, max-age=60`. Um `max-age` maior significa que alguém
removeu o `cacheControlMaxAge` do `put()` — o default do SDK é **um mês**, e o
CDN passaria a servir o detalhe congelado enquanto o resumo continua andando.

**Dimensionamento medido (2026-09-08, store real).** O objeto de SP com os 645
municípios reais do banco, 11 candidatos por município e 3 séries de 480 pontos
(o teto de uma noite de 8h a 60 s) pesa **248.473 B** — ordens de grandeza
abaixo do limite por objeto do Blob, e a maior UF do país. A pendência do
ADR-0032 item 6 fica **resolvida**: a cobertura municipal pode ir de 39% a 100%
sem ameaçar o limite por objeto.

**No dev sem token**: `readUfDetail` devolve `not_configured` e as seções de
município/séries mostram o estado "detalhe indisponível". Não é bug — é o
comportamento declarado.

## Ferramentas do pipeline TSE

Três ferramentas introduzidas no hardening pré-simulado (Fase 0 da S07). As duas primeiras existem para que **nenhum teste precise tocar o CDN do TSE**.

### `pnpm tse:watch` — monitor de publicação do TSE

```bash
pnpm tse:watch --once                                   # uma passada, sai
pnpm tse:watch --interval 300 --slack                   # loop de 5 min, alerta no Slack
pnpm tse:watch --once --base-url https://resultados-sim.tse.jus.br/oficial
```

O que faz (`scripts/tse-watch.ts`):

1. **1 GET** em `<base-url>/comum/config/ele-c.json` — hash SHA-256 do corpo, ETag, `Last-Modified`; extrai `{ ciclo, dg, hg, eleicoes[] }`.
2. **9 HEAD** nas páginas técnicas dos leiautes listadas em `scripts/tse-watch.targets.json` (URLs preenchidas por humano, verificadas em 05/09). `www.tse.jus.br` responde 403 a cliente não-navegador: tratado como `inacessivel`, **não** como mudança.
3. Compara com `build/tse-watch/state.json` (`--state` para trocar) e imprime o diff.
4. **Quando surgir uma eleição com `t=1|2` e nome contendo "2026", o alerta sai em MAIÚSCULAS** — `ELEIÇÃO GERAL 2026 DETECTADA`. É esse o sinal que destrava `TSE_COD_ELEICAO`.

Exit codes: `0` sem mudança · `2` com mudança · `1` erro. UA próprio, `SalaCofre-watch/1.0`, sem alegação de cadastro. Não precisa de Postgres. **Nunca sonda URL adivinhada** — só os 10 alvos acima.

> Em 05/09 o `ele-c.json` de produção ainda está em `ele2024`. Rodar `--once` **diariamente** até o TSE publicar; se nada aparecer até **~12/09**, abrir chamado em `30308800.tse.jus.br` (descrição começando com `Resultados - Divulgação`).

### `pnpm tse:mock` — CDN falso

```bash
pnpm tse:mock --port 8787                       # default 8787
pnpm tse:mock --port 8787 --rate-limit-after 300   # 429 + Retry-After: 1 após N GETs
pnpm tse:mock --port 8787 --not-found-ratio 0.1    # 10% dos alvos em 404 (determinístico)
pnpm tse:mock --port 8787 --latency-ms 200         # latência artificial
```

Serve fixtures **no layout de URL real** do CDN (incluindo `/oficial/comum/config/ele-c.json` sintético), com ETag e `304` em `If-None-Match`. Nível **zona** vem de `tests/fixtures/tse/2022/` (trocável com `--fixtures`); níveis **uf / br / município / acompanhamento** vêm sempre de `tests/fixtures/tse/2026/`. `--cod-eleicao` é documental — o matching é por `(uf, zona/nível)`, então qualquer código no path funciona. É a única superfície legítima para exercitar 404, 429, retry e alertas.

### Dry-run completo do ingest, sem tocar o TSE

```bash
# terminal 1
pnpm tse:mock --port 8787 --rate-limit-after 300

# terminal 2
TSE_BASE_URL=http://localhost:8787/oficial TSE_COD_ELEICAO=ele2022/544 \
INGEST_WINDOW_OVERRIDE=true TSE_MAX_RPS=10 pnpm dev

# terminal 3
curl -X POST localhost:3000/api/ingest -H "x-cron-secret: $CRON_SECRET"
```

Verificar na resposta: `rateLimited` (retry de 429 funcionou), `changed > 0`, `notFound`, `waitedMs`, e `pct_projetado` em escala 0–100 no payload gerado.

> Carregar `.env.local` antes da suíte completa — 8 arquivos de teste dependem do Neon:
> ```bash
> set -a; . ./.env.local; set +a
> pnpm test          # vitest
> pnpm test:py       # pytest (ou .venv-model/bin/python -m pytest -q)
> ```

## Cross-refs

- ADR-0020 (conformidade Res. 23.751/2026): [../architecture/adrs/0020-conformidade-res-23751-2026.md](../architecture/adrs/0020-conformidade-res-23751-2026.md)
- Leiautes TSE 2026 (fonte técnica, fan-out § 6): [../reference/tse-2026-leiautes.md](../reference/tse-2026-leiautes.md)
- Protocolo dos simulados: [../testing/tse-simulados.md](../testing/tse-simulados.md)
- Alertas Slack: [./alerts.md](./alerts.md)
- Dashboard `/_status`: [./dashboard-status.md](./dashboard-status.md)
- Disponibilidade: [../nfr/availability.md](../nfr/availability.md)
- Performance NFR: [../nfr/performance.md](../nfr/performance.md)
- Spec 001 (ingestão TSE): [../specs/001-ingestao-tse/](../specs/001-ingestao-tse/)
- Spec 002 (modelo estatístico): [../specs/002-modelo-estatistico/](../specs/002-modelo-estatistico/)
