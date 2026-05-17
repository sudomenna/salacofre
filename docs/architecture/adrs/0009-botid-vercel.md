---
id: ADR-0009
title: Vercel BotID, não Cloudflare
status: accepted
date: 2026-05-17
---

# ADR-0009 — Vercel BotID, não Cloudflare

## Status

Aceito.

## Contexto

Endpoints `/api/projection` precisam de proteção contra scraping massivo (terceiros tentando rodar seus próprios painéis em cima do nosso). Opções:

1. **Cloudflare**: bot detection maduro, mas força DNS por CF e adiciona uma camada extra.
2. **Vercel BotID**: nativo da plataforma, integrado ao Edge Middleware.

A constituição (§ 9) prioriza stack 100% Vercel para simplicidade operacional. Custo de CF para 500k+ MAU não justifica trocar a homogeneidade.

## Decisão

Bot detection via **Vercel BotID** aplicado em `/api/*` pelo `middleware.ts`. Rate limit complementar (60 req/min/IP) via Edge Middleware com cookie bucket.

## Consequências

**Positivas**:
- Single pane of glass operacional.
- Sem DNS amarrado a CF.
- Sem custo adicional vs Vercel Pro/Enterprise.

**Negativas**:
- BotID é mais novo que produto CF — comportamento sob ataques sofisticados ainda menos batido.
- Plano B (caso BotID falhe sob ataque): ativar CF como reverse proxy emergencial.

## Cross-refs

- NFR segurança: [../../nfr/security.md](../../nfr/security.md)
- Constituição § 9 (stack Vercel): [../../constitution.md](../../constitution.md#9-stack-100-vercel)
