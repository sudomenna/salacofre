---
id: 2026-S06
title: Sprint 06 — Frontend completo (Governadores + Sobre o Modelo)
status: planned
start: 2026-08-03
end: 2026-08-16
phase: F5
goal: Specs 005, 006 e 011 shipped — todas as telas do v1 existem
specs_in_flight: [005-pagina-uf-governador, 006-grid-governadores, 011-sobre-o-modelo]
specs_planned_next: [009-compartilhamento-meta, 010-operacao-monitoramento, 012-dashboard-status, 013-pagina-manutencao]
---

# Sprint 06 — Frontend completo

## Objetivo único

Encerrar o conjunto de telas do v1 do produto: governadores (lista + UF), página sobre o modelo. Após esta sprint, todas as 7 telas do v1 (T-01 a T-04, T-06 a T-08) têm versão implementada. Drill-down até zona eleitoral deferido para v2 (decisão produto 2026-05-17).

## Specs in-flight

- [ ] **005-pagina-uf-governador** — reúsa estrutura da 004, troca cargo. Detalhes: [spec.md](../specs/005-pagina-uf-governador/spec.md).
- [ ] **006-grid-governadores** — grid de 27 cards `<GovernorCard>`. Detalhes: [spec.md](../specs/006-grid-governadores/spec.md).
- [ ] **011-sobre-o-modelo** — página MDX estática. Detalhes: [spec.md](../specs/011-sobre-o-modelo/spec.md).

## Chores fora de spec

- [ ] Conteúdo MDX da página `/sobre-o-modelo` revisado por humano (transparência metodológica é princípio § 8)
- [ ] `<GovernorCard>` em modo `lite` (sem spring) — 27 agulhas pode pesar ([006/design.md](../specs/006-grid-governadores/design.md))

## Despachos sugeridos (paralelizáveis)

Pode despachar **3 `spec-implementer` em paralelo** (005, 006, 011).

- **`spec-implementer` × 3** — uma instância por spec, em paralelo onde possível.
- **`a11y-perf-auditor`** após cada spec.
- **`constitution-guard`** com atenção: spec 005 pode ter caso de candidato governador sem mapeamento 2022 — disclaimer obrigatório (constituição § 2).
- **`rf-coverage-checker`** × 3.
- **`spec-syncer`** ao final.

## Definition of Done

- ✅ Specs 005, 006 e 011 com `status: shipped`
- ✅ Rotas existentes: `/governador`, `/uf/[sigla]/governador`, `/sobre-o-modelo`
- ✅ Bundle das novas rotas respeita RNF-007a/b/c
- ✅ Página `/sobre-o-modelo` revisada e publicada (constituição § 8)
- ✅ Caso de "modelo desabilitado" (RF-018-like na 005) com disclaimer visível

## Não-objetivos

- Drill-down até zona eleitoral — deferido para v2
- Compartilhamento (OG image, share buttons) — S07
- Dashboard `/_status` — S07
- Página de manutenção — S07
- Load test — S07

## Riscos da sprint

- **Atribuição partidária 2022→2026 pra governadores** — partidos novos, fusões, candidatos sem histórico. Disclaimer obrigatório (constituição § 2).

## Replanejamentos mid-sprint

_(preencher se mudar)_

## Retrospective (preencher ao fechar)

- O que funcionou:
- O que melhorar:
- Carry-over pra S07:

## Cross-refs

- Sprint anterior: [2026-S05-f4b-mapas-brushing.md](./2026-S05-f4b-mapas-brushing.md)
- Próxima sprint: [2026-S07-f6-hardening.md](./2026-S07-f6-hardening.md)
- Specs: [005](../specs/005-pagina-uf-governador/), [006](../specs/006-grid-governadores/), [011](../specs/011-sobre-o-modelo/)
