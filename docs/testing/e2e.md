---
title: E2E (Playwright)
description: Testes ponta-a-ponta em browser real — home, UF, brushing, mobile
status: stable
source: PRD.md § 20.3
---

# E2E (Playwright)

- `tests/e2e/home.spec.ts` — Carrega home, agulha renderiza, polling funciona.
- `tests/e2e/uf.spec.ts` — Drill-down UF, mapas renderizam.
- `tests/e2e/brushing.spec.ts` — Hover em mapa destaca tabela e segundo mapa.
- `tests/e2e/mobile.spec.ts` — Tap-to-select, bottom sheet.

## Cross-refs

- Specs cobertas: [003-home-nacional](../specs/003-home-nacional/), [004-pagina-uf-presidencial](../specs/004-pagina-uf-presidencial/), [008-interatividade-brushing](../specs/008-interatividade-brushing/)
