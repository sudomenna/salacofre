---
title: NFR — SEO e Meta
description: URLs canônicas, OG tags dinâmicas, sitemap, Lighthouse SEO
status: stable
source: PRD.md § 6.6
---

# SEO e Meta

| ID | Descrição | Meta |
|---|---|---|
| RNF-027 | Cada UF tem URL canônica `/uf/[sigla]` | Sim |
| RNF-028 | OG tags dinâmicas por página | Sim |
| RNF-029 | Sitemap.xml e robots.txt | Sim |
| RNF-030 | Lighthouse SEO score | >95 |

## Implementação

- App Router pages com `generateMetadata` para OG dinâmica.
- `app/opengraph-image.tsx` gera OG image com snapshot atual (ver [spec 009](../specs/009-compartilhamento-meta/spec.md)).
- `app/sitemap.ts` enumera todas as rotas estáticas + UFs.
- Lighthouse CI por PR.

## Cross-refs

- Spec compartilhamento e meta: [../specs/009-compartilhamento-meta/](../specs/009-compartilhamento-meta/)
