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

## Cross-refs

- Alertas Slack: [./alerts.md](./alerts.md)
- Dashboard `/_status`: [./dashboard-status.md](./dashboard-status.md)
- Disponibilidade: [../nfr/availability.md](../nfr/availability.md)
- Spec 001 (ingestão TSE): [../specs/001-ingestao-tse/](../specs/001-ingestao-tse/)
