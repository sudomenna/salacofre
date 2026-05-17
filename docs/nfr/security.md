---
title: NFR — Segurança
description: Proteção de endpoints, rate limit, bot detection, secrets, TLS, sem PII
status: stable
source: PRD.md §§ 6.4, 18
---

# Segurança

| ID | Descrição | Meta |
|---|---|---|
| RNF-016 | Endpoint `/api/ingest` não acessível publicamente | Protegido por header secret + Vercel Cron-only |
| RNF-017 | Rate limit no `/api/projection` por IP | 60 req/min |
| RNF-018 | Proteção contra bots scrapeando o feed | Vercel BotID |
| RNF-019 | Sem armazenamento de dados pessoais | LGPD-compliant by design |
| RNF-020 | TLS 1.3 obrigatório, HSTS habilitado | Padrão Vercel |
| RNF-021 | Secrets em Vercel Env Vars com escopo de produção | Sim |

## Implementação

| Tópico | Implementação |
|---|---|
| TLS | Padrão Vercel (TLS 1.3 + HSTS) |
| Headers | CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff |
| Secrets | Vercel Env Vars, escopo `production` |
| Ingest auth | Header `x-cron-secret` + IP allowlist Vercel Cron |
| Rate limit `/api/projection` | 60 req/min por IP via Edge Middleware (cookie bucket) |
| Bot detection | Vercel BotID em `/api/*` |
| LGPD | Nenhum dado pessoal; analytics agregadas e anonimizadas |
| Cookies | Apenas técnico para rate limit, sem tracking de terceiros |
| Disclaimer | Footer em todas as páginas: "Não oficial. Fonte: TSE." |

## Cross-refs

- ADR-0009 BotID Vercel: [../architecture/adrs/0009-botid-vercel.md](../architecture/adrs/0009-botid-vercel.md)
- Constituição § 5 (sem PII): [../constitution.md](../constitution.md#5-sem-pii)
- APIs internas (auth): [../architecture/apis-internas.md](../architecture/apis-internas.md)
