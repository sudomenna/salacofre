---
id: 2026-S05
title: Sprint 05 — Brushing & Linking + acabamento de mapas
status: planned
start: 2026-07-20
end: 2026-08-02
phase: F4b
goal: Spec 008 (brushing) shipped, com hover-store wired em todos os mapas/tabelas/gráficos. Mobile bottom-sheet funcionando.
specs_in_flight: [008-interatividade-brushing]
specs_planned_next: [005-pagina-uf-governador, 006-grid-governadores, 011-sobre-o-modelo]
---

# Sprint 05 — Brushing & Linking + acabamento

## Objetivo único

[Spec 008](../specs/008-interatividade-brushing/) atinge `shipped` com brushing & linking funcionando entre todos os componentes coordenados (RF-045 a RF-050). Encerra a F4.

## Specs in-flight

- [ ] **008-interatividade-brushing** — RF-045 a RF-050, hover-store global + tooltip + mobile bottom-sheet.

## Chores fora de spec (acabamento das specs 003 e 004)

- [ ] Gráficos de série temporal (RF-040/041/042) se não fecharam em S04 — Should
- [ ] Animações finalizadas com Framer Motion + reduced-motion ([animations.md](../design-system/animations.md))
- [ ] Coloração dinâmica do mapa via `setFeatureState` ([coloracao.md](../mapas/coloracao.md))
- [ ] Hachura/pattern em UFs que viraram vs 2022 (RF-030.4 — Should)

## Despachos sugeridos

- **`spec-implementer`** para spec 008.
- **`map-builder`** para wireamento dos producers/consumers de hover nos mapas existentes (sem reescrever).
- **`a11y-perf-auditor`** com atenção especial a navegação por teclado (RNF-024) e mapa com aria-label + lista textual paralela (RNF-025).
- **`constitution-guard`** antes do PR final.
- **`rf-coverage-checker`** confirma cobertura de RF-045 a RF-050.
- **`spec-syncer`** propaga shipped.

## Definition of Done

- ✅ Spec 008 com `status: shipped`
- ✅ Hover em UF do mapa nacional destaca a linha correspondente em `<StateGroupedTable>` E em `<DecisiveUFsGrid>`
- ✅ Hover em município (página de UF) destaca em `<MunicipioTable>` E no segundo mapa do `<UFMapDuo>`
- ✅ Tap-to-select funcionando em mobile com `<BottomSheet>` (RF-049, RF-050)
- ✅ Tooltip flutuante (desktop) com breakdown completo (RF-048)
- ✅ E2E `tests/e2e/brushing.spec.ts` passando

## Riscos da sprint

- **Re-render em cascata** se selectors do Zustand não forem finos — exige disciplina ([state-global.md](../design-system/state-global.md))
- **Performance de hover sem throttle** — confirmar throttle 16ms em todos os producers de mapa

## Replanejamentos mid-sprint

_(preencher se mudar)_

## Retrospective (preencher ao fechar)

- O que funcionou:
- O que melhorar:
- Carry-over pra S06:

## Cross-refs

- Sprint anterior: [2026-S04-f4a-home-uf.md](./2026-S04-f4a-home-uf.md)
- Próxima sprint: [2026-S06-f5-completo.md](./2026-S06-f5-completo.md)
- Spec: [../specs/008-interatividade-brushing/](../specs/008-interatividade-brushing/)
- Especificação de brushing nos mapas: [../mapas/brushing-linking.md](../mapas/brushing-linking.md)
