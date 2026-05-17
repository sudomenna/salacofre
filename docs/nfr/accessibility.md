---
title: NFR — Acessibilidade (WCAG 2.1 AA)
description: Contraste, fallback de tabela para gráficos, navegação por teclado, mapas com aria-label
status: stable
source: PRD.md § 6.5
---

# Acessibilidade (WCAG 2.1 AA)

| ID | Descrição | Meta |
|---|---|---|
| RNF-022 | Contraste mínimo de texto | 4.5:1 |
| RNF-023 | Todos os gráficos com fallback de tabela para screen readers | Sim |
| RNF-024 | Navegação completa por teclado | Sim |
| RNF-025 | Mapas com `aria-label` descrevendo o que mostram + lista textual paralela | Sim |
| RNF-026 | Animações respeitam `prefers-reduced-motion` | Sim |

## Validação

- `axe-core` rodando em CI em cada PR.
- Lighthouse a11y score >95 em CI.
- Bug bash manual em Set/2026 com leitor de tela (VoiceOver + NVDA).

## Cross-refs

- Acessibilidade dos mapas: [../mapas/acessibilidade.md](../mapas/acessibilidade.md)
- Reduced-motion nas animações: [../design-system/animations.md](../design-system/animations.md)
- Constituição § 4 (a11y): [../constitution.md](../constitution.md#4-acessibilidade-wcag-21-aa)
- Teste a11y: [../testing/accessibility.md](../testing/accessibility.md)
