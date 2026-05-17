---
id: 009-compartilhamento-meta
title: Compartilhamento e Metadados (OG, Share buttons)
status: draft
priority: S
personas: [P1, P2]
screens: [T-01, T-02, T-03, T-04]
requirements: [RF-051, RF-052, RF-053, RF-054, RF-055]
depends_on: [003-home-nacional]
apis: []
components: []
nfr: [RNF-027, RNF-028, RNF-029, RNF-030]
adrs: []
---

# Spec 009 — Compartilhamento e Metadados

## Objetivo

Permitir que usuários compartilhem snapshots atuais com imagem rica (OG dinâmica), com link canônico e atribuição clara.

## Escopo

**In**:
- OG image dinâmica com snapshot atual da home (`app/opengraph-image.tsx`).
- Botões de compartilhamento (X/Twitter, WhatsApp, Threads).
- URL com timestamp (snapshot histórico) — Could.
- Página `/sobre-o-modelo` (escopo separado em [spec 011](../011-sobre-o-modelo/)).
- Footer global com fontes e disclaimer.

**Out**:
- Lógica de geração dos dados (escopo specs 001, 002).

## Requisitos Funcionais (EARS)

**RF-051 — OG image dinâmica (Should)**

WHEN um link da home é compartilhado em rede social, the system SHOULD servir OG image dinâmica com snapshot atual (placar + agulha).

**Aceitação**:
- Given a home está com Lula em 53,2%, when alguém compartilha o link no WhatsApp, then a preview mostra OG com "Lula 53,2% | Bolsonaro 46,8%" e timestamp.

**RF-052 — Botões de compartilhamento (Should)**

WHEN a página renderiza, the system SHOULD exibir botões de share para X/Twitter, WhatsApp, Threads.

**RF-053 — URL com timestamp permite snapshot histórico (Could)**

WHERE a URL inclui query `?ts=ISO8601`, the system COULD recuperar e exibir o snapshot daquele momento (read-only).

**RF-054 — Página "Sobre o Modelo"**

WHEN o usuário acessa `/sobre-o-modelo`, the system SHALL exibir página com metodologia completa.

> Ver [spec 011](../011-sobre-o-modelo/) para detalhes da página.

**RF-055 — Footer com fontes e disclaimer**

WHEN qualquer página renderiza, the system SHALL exibir footer com "Fonte: TSE. Não oficial." + links para TSE e IBGE.

## Requisitos Não-Funcionais

- OG tags dinâmicas por página ([RNF-028](../../nfr/seo.md)).
- Sitemap + robots ([RNF-029](../../nfr/seo.md)).
- Lighthouse SEO >95 ([RNF-030](../../nfr/seo.md)).

## Open questions

- Threads tem API estável para deeplink de share? (atual: confirmar antes de F6).
- OG image cache: por quanto tempo? (atual: 60s, alinhado com SWR).

## Cross-refs

- Design: [./design.md](./design.md)
- SEO NFR: [../../nfr/seo.md](../../nfr/seo.md)
- Constituição § 1 (atribuição TSE): [../../constitution.md](../../constitution.md#1-conformidade-regulatória-tse)
