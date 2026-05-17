---
id: 009-compartilhamento-meta
type: design
title: Compartilhamento e Meta — Design Técnico
status: draft
---

# Design — Compartilhamento e Meta

## OG dinâmica

`app/opengraph-image.tsx` usa `ImageResponse` do `next/og`. Recebe payload via Edge Config (`projection:current`) em render time. Cache controlado por header (60s).

```ts
// app/opengraph-image.tsx
import { ImageResponse } from 'next/og';
import { getEdgeConfig } from '@/lib/edge-config/reader';

export default async function OGImage() {
  const payload = await getEdgeConfig<EdgePayload>('projection:current');
  // render placar + agulha como JSX → ImageResponse
}
```

## Share buttons

Componente `<ShareBar />` com 3 buttons. URLs:

- X: `https://twitter.com/intent/tweet?text=...&url=...`
- WhatsApp: `https://wa.me/?text=...`
- Threads: TBD (ver open question na spec).

## Footer

`components/layout/Footer.tsx` exibe:

```
Fonte: TSE — Não oficial.
TSE Divulga · IBGE Malhas · Sobre o Modelo
```

## Sitemap e robots

- `app/sitemap.ts` lista `/`, `/governador`, `/sobre-o-modelo`, `/uf/[27]`, `/uf/[27]/governador`.
- `app/robots.ts` permite tudo exceto `/_status`.

## Cross-refs

- Spec: [./spec.md](./spec.md)
- SEO: [../../nfr/seo.md](../../nfr/seo.md)
