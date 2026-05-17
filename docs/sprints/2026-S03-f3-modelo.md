---
id: 2026-S03
title: Sprint 03 — Modelo estatístico + replay 2022
status: planned
start: 2026-06-22
end: 2026-07-05
phase: F3
goal: Spec 002 (modelo) shipped, com replay 2022 atingindo MAE@1h < 2pp (OT-4) e Edge Config sendo atualizado
specs_in_flight: [002-modelo-estatistico]
specs_planned_next: [003-home-nacional, 004-pagina-uf-presidencial]
---

# Sprint 03 — Modelo estatístico + replay 2022

## Objetivo único

[Spec 002](../specs/002-modelo-estatistico/) atinge `status: shipped` com o modelo validado contra 2022 (MAE@1h < 2pp — gate de OT-4).

## Specs in-flight

- [ ] **002-modelo-estatistico** — RF-011 a RF-020. Bootstrap, swing zona-a-zona, P(vitória), tratamento de borda. Detalhes em [design.md](../specs/002-modelo-estatistico/design.md).

## Chores fora de spec

- [ ] Setup do runtime Python no Vercel Fluid Compute (Python 3.14 + NumPy)
- [ ] `lib/edge-config/writer.ts` — abstração sobre o SDK `@vercel/edge-config`
- [ ] Confirmar pré-cálculo de `historical_results` agregado por UF (denormalização auxiliar pra acelerar bootstrap)

## Despachos sugeridos

- **`spec-implementer`** orquestra a spec 002 (lib/model em TS + Python script).
- **`model-validator`** roda o replay 2022 — gate obrigatório de OT-4.
- **`constitution-guard`** confirma: zero LLM, zero PII, determinismo do modelo ([constituição § 6](../constitution.md#6-determinismo-do-modelo)).
- **`rf-coverage-checker`** valida cobertura.
- **`spec-syncer`** propaga `shipped`.

## Definition of Done

- ✅ Spec 002 com `status: shipped` (4 gates)
- ✅ `model-validator` retorna **PASS** no replay (MAE@1h < 2pp + calibração razoável)
- ✅ Bootstrap completa em <2s p95 (RNF-006 indireto, sub-meta de `model.compute_duration_ms`)
- ✅ Edge Config `projection:current` sendo escrito após cada execução do modelo
- ✅ Pipeline ponta-a-ponta em preview: cron → ingest → model → Edge Config (sem frontend ainda)
- ✅ Casos de borda RF-017 (0% apurado) e RF-018 (<5% apurado) testados

## Riscos da sprint

- **MAE@1h pode ficar acima de 2pp** — investigar mapeamento histórico 2022 + ponderação por eleitores aptos. Se persistir, decidir entre relaxar OT-4 (ADR formal) ou refinar modelo (gasta tempo da S04).
- **Tempo de bootstrap pode estourar 2s** — paralelizar via NumPy Generator com seeds determinísticos.

## Replanejamentos mid-sprint

_(preencher se mudar)_

## Retrospective (preencher ao fechar)

- O que funcionou:
- O que melhorar:
- Carry-over pra S04:

## Cross-refs

- Sprint anterior: [2026-S02-f2-ingestao.md](./2026-S02-f2-ingestao.md)
- Próxima sprint: [2026-S04-f4a-home-uf.md](./2026-S04-f4a-home-uf.md)
- Spec: [../specs/002-modelo-estatistico/](../specs/002-modelo-estatistico/)
- ADR: [0006 Bootstrap, não Bayesiano](../architecture/adrs/0006-bootstrap-nao-bayesiano.md)
