---
id: 001-ingestao-tse
type: design
title: Ingestão TSE — Design Técnico
status: draft
---

# Design — Ingestão TSE

## Arquitetura

Pipeline write-only que vive entre `Vercel Cron` e `Vercel Edge Config + Neon Postgres`. Ver [overview](../../architecture/overview.md).

```
Vercel Cron (*/15s, janela 17h–04h)
  → POST /api/ingest (Node 24, Fluid Compute)
    → fetchEA20() por (UF × cargo × zona)
      → Postgres snapshots (append-only)
      → Vercel Blob (raw archive)
    → POST /api/model/project (Python 3.14)
      → Postgres projections + Vercel Edge Config
```

## Endpoints TSE

**Base URL**: `https://resultados.tse.jus.br/oficial/`

### Configuração da eleição (1× na inicialização)

```
GET /oficial/comum/config/ele-c.json
```

Cacheado em memória da função por 60s. Campos relevantes:

- `pl[].e[].cd` — código da eleição
- `pl[].e[].t` — turno (1 ou 2)
- `pl[].e[].abr[].cd` — sigla UF
- `pl[].e[].abr[].cp[].cd` — código do cargo (1 = Presidente, 3 = Governador)

### Configuração de municípios (por UF)

```
GET /oficial/comum/config/{uf}/{uf}-p000407-cm.json
```

### Resultado unificado por zona (EA20)

```
GET /oficial/[cod_eleicao]/dados/[uf]/[uf][cod_municipio]/[uf][cod_municipio]-[zona]-[cargo].json
```

Exemplo:
```
https://resultados.tse.jus.br/oficial/ele2022/544/dados/sp/sp80055/sp80055-c0001-z0001-e000544.json
```

## Schema EA20 (parcial relevante)

```ts
type EA20 = {
  dg: string;            // data de geração ddMMyyyy
  hg: string;            // hora HH:mm:ss
  f: 'o';                // ambiente oficial
  cdabr: string;         // UF
  abr: Array<{
    cd: string;          // UF
    cdmu: string;        // município
    cdze: string;        // zona
    s: Array<{ ns: string }>; // seções
    psa: string;         // % seções apuradas
    pst: string;         // % seções totalizadas
    tap: string;         // total apto
    tc: string;          // total comparecimento
    pc: string;          // % comparecimento
    ta: string;          // total abstenção
    pa: string;          // % abstenção
    tvn: string;         // votos nominais
    pvn: string;         // % votos nominais
    tvl: string;         // votos legenda
    tvb: string;         // brancos
    pvb: string;
    tvnu: string;        // nulos
    pvnu: string;
    tvv: string;         // válidos
    cand: Array<{
      seq: string; n: string; nm: string; nmu: string;
      cc: string; pn: string; pnm: string; sg: string;
      st: string; vap: string; pvap: string; e: string;
    }>;
  }>;
};
```

Validação: Zod schema em `lib/tse/ea20-parser.ts`, fail-fast em parse error com log estruturado.

## Padrão de polling

```ts
// lib/tse/client.ts
interface FetchOptions {
  url: string;
  etag?: string;
}

async function fetchEA20(opts: FetchOptions): Promise<EA20 | 'NOT_MODIFIED'> {
  const res = await fetch(opts.url, {
    headers: {
      'If-None-Match': opts.etag ?? '',
      'Accept-Encoding': 'gzip',
      // User-Agent identificável conforme exigência da resolução TSE vigente para 2026
      // (texto final depende da publicação — ver docs/reference/regulatory.md).
      // Cadastro de interessado na divulgação obrigatório (RF-010).
      'User-Agent': 'AtlasMenna/1.0 (interessado-divulgacao-cadastrado)'
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(5000)
  });

  if (res.status === 304) return 'NOT_MODIFIED';
  if (!res.ok) throw new TSEError(res.status, opts.url);

  const text = await res.text();
  return EA20Schema.parse(JSON.parse(text));
}
```

## Cadenciamento

| Janela | Cadência | Estratégia |
|---|---|---|
| Sábado (dia anterior) <12h | 1× | Validar "divulgação zero" |
| Sábado >12h, antes do domingo | 1×/hora | Heartbeat |
| Domingo <17h | 1×/min | Aguardar abertura |
| Domingo 17h–04h | A cada 15s | Apuração ativa |
| Após 99% apurado | A cada 5min | Convergência final |
| Pós-eleição | Manual | Reconciliação |

## Tratamento de falhas

| Falha | Mitigação |
|---|---|
| 304 Not Modified | Esperado — pula o arquivo |
| 404 | Zona ainda sem dados — log, retry no próximo ciclo |
| 5xx | Retry com backoff exponencial (3 tentativas, 1s/2s/4s) |
| Timeout >5s | Aborta, retry no próximo ciclo |
| JSON inválido | Log com payload bruto, alerta Slack |
| TSE down >60s | Banner "Reconectando" no frontend, mantém último valor |
| TSE down >5min | Alerta crítico Slack, equipe entra no Discord do TSE |

## Volume estimado

Para Presidencial + 27 Governadores no 1º turno:

- ~3.000 zonas × 28 cargos = **~84.000 arquivos EA20** existem
- Em prática: apenas zonas que atualizaram em cada ciclo (~5–15%)
- Ciclo de 15s = **~10.000 GETs/min no pico** (com 304s, ~1.500 transferências reais)
- Banda total: 50–100GB ao longo da noite

## Persistência

- **`snapshots`** (Postgres) — append-only, hash SHA256 do payload para dedup, ETag persistido.
- **Vercel Blob** — JSONs EA20 raw para auditoria post-mortem.

## ADRs aplicáveis

- [ADR-0001 Edge Config no read path](../../architecture/adrs/0001-edge-config-no-read-path.md)
- [ADR-0002 Polling com CDN cache](../../architecture/adrs/0002-polling-cdn-cache.md)
- [ADR-0008 Não Convex](../../architecture/adrs/0008-nao-convex.md)

## Riscos técnicos

- **TSE muda formato EA20 sem aviso** — mitigado por validação Zod fail-fast e participação em simulados.
- **TSE rate-limita inesperadamente** — User-Agent identificável como "interessado cadastrado".
- **Lag entre ingest e Edge Config write** — propagação Edge Config é ~5–10s; aceitável dentro do orçamento de 30s.

## Cross-refs

- Spec: [./spec.md](./spec.md)
- Spec downstream (modelo): [../002-modelo-estatistico/](../002-modelo-estatistico/)
- Runbook (TSE indisponível): [../../operations/runbook.md](../../operations/runbook.md)
- Testes: [../../testing/integration.md](../../testing/integration.md), [../../testing/replay.md](../../testing/replay.md)
