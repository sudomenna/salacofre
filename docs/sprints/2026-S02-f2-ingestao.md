---
id: 2026-S02
title: Sprint 02 — Pipeline TSE end-to-end
status: planned
start: 2026-06-08
end: 2026-06-21
phase: F2
goal: Spec 001 (ingestão TSE) shipped, com cron rodando em preview e snapshots sendo persistidos append-only
specs_in_flight: [001-ingestao-tse]
specs_planned_next: [002-modelo-estatistico]
---

# Sprint 02 — Pipeline TSE end-to-end

## Objetivo único

[Spec 001](../specs/001-ingestao-tse/) atinge `status: shipped` com pipeline rodando em preview, snapshots persistidos e ETag/retry/backoff funcionais.

## Specs in-flight

- [ ] **001-ingestao-tse** — RF-001 a RF-010. Detalhes técnicos: [design.md](../specs/001-ingestao-tse/design.md). Tasks a serem geradas pelo `spec-implementer` em `docs/specs/001-ingestao-tse/tasks.md`.

## Chores fora de spec

- [ ] Setup do canal Slack `#atlasmenna-ops` + webhook
- [ ] Cron Vercel configurado em `vercel.ts` (apenas preview ativo nesta sprint; produção desabilitada via `CRON_ENABLED=false`)
- [ ] Fixtures TSE 2022 reais baixadas pra `tests/fixtures/tse/2022/`
- [ ] Atualizar [docs/operations/dashboard-status.md](../operations/dashboard-status.md) com URLs reais quando `/_status` existir (parcial — dashboard completo é S07)

## Despachos sugeridos

- **`tse-parser-builder`** assume a maior parte da spec 001 (client, parser EA20, ETag, retry).
- **`constitution-guard`** ao final, antes de promover (RF-010 e User-Agent são sensíveis).
- **`rf-coverage-checker`** como último gate antes de `shipped`.
- **`spec-syncer`** propaga `shipped` em traceability + index.json + README.

## Definition of Done

- ✅ Spec 001 com `status: shipped` (4 gates passados)
- ✅ `/api/ingest` autenticado por `x-cron-secret`, cron-only
- ✅ Cron rodando em preview a cada 15s durante "janela mockada" (override env var para testar fora de 17h–04h)
- ✅ `snapshots` ganhando linhas em preview, sem updates/deletes (append-only, [constituição § 10](../constitution.md#10-append-only-para-dados-de-apuração))
- ✅ ETag funcional: hits subsequentes em fixture inalterada retornam 304 e não geram snapshot
- ✅ Replay script (`scripts/replay-2022.ts`) compila — não precisa validar modelo nesta sprint
- ✅ Unit tests com fixtures TSE 2022 reais cobrindo RF-001 a RF-005, RF-008, RF-009
- ✅ Alerta Slack disparando em `tse.lag_seconds > 60` (forçado via teste manual)

## Riscos da sprint

- **Formato EA20 do TSE pode ter mudado vs 2022** — validar contra arquivos reais de 2024 (município) como aproximação.
- **Retry de backoff pode estourar timeout do Vercel** (10s default em Hobby, 60s em Pro) — confirmar plano.

## Replanejamentos mid-sprint

_(preencher se mudar)_

## Retrospective (preencher ao fechar)

- O que funcionou:
- O que melhorar:
- Carry-over pra S03:

## Cross-refs

- Sprint anterior: [2026-S01-f1-fundacao.md](./2026-S01-f1-fundacao.md)
- Próxima sprint: [2026-S03-f3-modelo.md](./2026-S03-f3-modelo.md)
- Spec: [../specs/001-ingestao-tse/](../specs/001-ingestao-tse/)
