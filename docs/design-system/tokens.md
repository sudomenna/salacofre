---
title: Design Tokens
description: Tipografia, escala, cores neutras, cores partidárias (NYT-like), espaçamento, layout
status: stable
source: PRD.md § 14.1
---

# Design Tokens

```css
/* app/globals.css */
:root {
  /* Tipografia */
  --font-serif: 'Source Serif Pro', Georgia, serif;
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Escala tipográfica */
  --text-xs: 12px;
  --text-sm: 14px;
  --text-base: 16px;
  --text-lg: 18px;
  --text-xl: 22px;
  --text-2xl: 28px;
  --text-3xl: 36px;
  --text-4xl: 48px;

  /* Cores neutras */
  --color-bg: #ffffff;
  --color-bg-muted: #fafafa;
  --color-text: #222222;
  --color-text-muted: #666666;
  --color-text-faint: #999999;
  --color-border: #e5e5e5;

  /* Cores partidárias (NYT-like) */
  --color-pt: #d33732;  /* PT / Lula — Vermelho */
  --color-pl: #2a52be;  /* PL / Bolsonaro — Azul */
  --color-tossup: #d9d9d9;
  --color-pt-band: #c8d4ed;
  --color-pl-band: #f0c9c8;

  /* Status */
  --color-success: #2c8e4a;
  --color-warning: #d97706;
  --color-error: #b91c1c;
  --color-live: #ef4444;

  /* Espaçamento */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-8: 48px;

  /* Layout */
  --max-width: 1280px;
  --column-gap: 24px;
  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1280px;
}

* { font-variant-numeric: tabular-nums; }
body { font-family: var(--font-sans); color: var(--color-text); }
h1, h2, h3 { font-family: var(--font-serif); font-weight: 600; }
```

## Notas

- **Cores partidárias NYT-like, não cores oficiais** (princípio constitucional § 2 — neutralidade).
- `tabular-nums` global garante alinhamento vertical de números em tabelas/contadores.
- Serif para headlines (NYT-like); sans para corpo.

## Cross-refs

- Constituição § 2 (neutralidade): [../constitution.md](../constitution.md#2-neutralidade-política)
- Grid: [./grid.md](./grid.md)
