---
title: Unit Tests (Vitest)
description: Testes unitários por módulo (TSE parser, modelo, insights, edge config writer)
status: stable
source: PRD.md § 20.1
---

# Unit Tests (Vitest)

- `lib/tse/ea20-parser.test.ts` — parse com fixtures reais de 2022.
- `lib/model/swing.test.ts` — cálculos com cenários determinísticos.
- `lib/model/bootstrap.test.ts` — testa convergência com seed fixo.
- `lib/insights/generate.test.ts` — verifica que todas as regras disparam.
- `lib/edge-config/writer.test.ts` — mock do client Vercel.

## Cross-refs

- Estrutura: [../architecture/folder-structure.md](../architecture/folder-structure.md)
