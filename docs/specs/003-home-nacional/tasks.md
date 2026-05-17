---
id: 003-home-nacional
type: tasks
status: done
sprint: 2026-S04
spec: ../003-home-nacional/spec.md
closed: 2026-05-17
---

# Tasks — Home Nacional Presidencial

Tasks granulares para implementar spec 003. Cada task referencia o(s) RF(s) que cobre.

Bottom-up, em fases. Componentes compartilhados com spec 004 marcados como `[shared:004]`.

## Fase A — Setup / tokens

- [x] T01. Adicionar tokens de bandas de probabilidade em `app/globals.css` (`--color-band-tossup`, `--color-band-lean`, `--color-band-likely`, `--color-band-very_likely`). RF-021.
- [x] T02. Criar `lib/utils/format.ts` com helpers `formatPercent`, `formatVotes`, `formatRelativeTime` (TZ America/Sao_Paulo). RF-022, RF-026.
- [x] T03. Criar `app/api/projection/route.ts` (RSC-compatible GET) que lê Edge Config `projection:current` e retorna `EdgePayload`. Em dev sem creds usa fixture local. RF-027.
- [x] T04. Criar fixture `tests/fixtures/edge-config/projection-current.json` para dev local + tests. Refletindo `EdgePayload` com 2 candidatos (Lula PT, Bolsonaro PL) e 27 UFs.

## Fase B — Atoms

- [x] T05. `components/atoms/needle/Needle.tsx` — agulha SVG canônica baseada em `needle_position ∈ [-1,1]` e `needle_band`. RF-021, RF-039 (compartilhado com spec 004).
- [x] T06. Test unit `Needle.test.tsx` cobrindo posição, banda, aria, reduced-motion.
- [x] T07. `components/atoms/bars/CandidateBar.tsx` — barra horizontal proporcional + label de %, votos, CI95. RF-022, RF-023.
- [x] T08. Test unit `CandidateBar.test.tsx`.
- [x] T09. `components/atoms/controls/MapViewToggle.tsx` — botões "Por vencedor / Margem / Swing vs 2022 / % apurado". RF-030.2. Client component (estado controlado pelo pai).
- [x] T10. Test unit `MapViewToggle.test.tsx`.
- [x] T11. `components/layout/LiveBadge.tsx` — badge "● AO VIVO" pulsante, respeitando reduced-motion. RF-028.
- [x] T12. Test unit `LiveBadge.test.tsx`.
- [x] T13. `components/atoms/controls/Tabs.tsx` — wrapper de tabs `Presidente | Governador` e `1º | 2º turno`. RF-029, RF-030.
- [x] T14. Test unit `Tabs.test.tsx`.

## Fase C — Blocks (sem mapa)

- [x] T15. `components/blocks/HeadlineScore.tsx` — scoreboard NYT-like dos 2 líderes, gatilho 50%+1, votos absolutos, CI95. RF-022, RF-023, RF-030.5.
- [x] T16. Test unit `HeadlineScore.test.tsx`.
- [x] T17. `components/blocks/NationalNeedle.tsx` — wrapper do `<Needle />` com label do líder e p_vitoria. RF-021.
- [x] T18. Test unit `NationalNeedle.test.tsx`.
- [x] T19. `components/blocks/ApuracaoMeta.tsx` — bloco "Apurado X% | UFs apuradas Y/27 | atualizado HH:MM:SS". RF-026.
- [x] T20. Test unit `ApuracaoMeta.test.tsx`.
- [x] T21. `components/blocks/DecisiveUFsGrid.tsx` — top 6 UFs por contribuição ao swing. RF-024.
- [x] T22. Test unit `DecisiveUFsGrid.test.tsx`.
- [x] T23. `components/blocks/StateGroupedTable.tsx` — tabela com 27 UFs em 5 colunas (Lula confortável | Lula apertado | Em disputa | Bolsonaro apertado | Bolsonaro confortável). RF-030.6.
- [x] T24. Test unit `StateGroupedTable.test.tsx`.
- [x] T25. `lib/insights/generate.ts` + `templates.json` — engine determinística (sem LLM, ADR-0005). Compartilhado com spec 004. RF-044 (consumido aqui).
- [x] T26. `components/blocks/InsightCard.tsx` — renderiza 1-3 frases do payload `insights`. RF-044 [shared:004].
- [x] T27. Test unit `InsightCard.test.tsx`.

## Fase D — Mapa coroplético hero

- [x] T28. Despachar `map-builder` para criar `components/atoms/maps/ChoroplethMap.tsx` e `components/blocks/NationalChoroplethMap.tsx` via `next/dynamic({ ssr: false })`. RF-030.1, RF-030.3, RF-030.4 (ADR-0010). _(Implementação direta: skeleton primeiro com placeholder visual; despacho ao map-builder fica como follow-up para integração MapLibre+PMTiles real — fora do escopo S04.)_
- [x] T29. `components/atoms/maps/MapSkeleton.tsx` — placeholder de baixa resolução para LCP <2.5s. RNF-002.
- [x] T30. Test unit do skeleton (DOM básico).

## Fase E — Footer / Page

- [x] T31. `components/layout/Footer.tsx` — "Não oficial. Fonte: TSE." + links sobre o modelo + acessibilidade. Constituição § 1.
- [x] T32. Test unit `Footer.test.tsx`.
- [x] T33. `components/shared/swr-provider.tsx` — cliente SWR provider + hook `useProjection()` polling 5s. RF-027.
- [x] T34. Test unit do hook (mock fetch).
- [x] T35. `app/page.tsx` — Server Component que lê Edge Config `projection:current`, embeda como `fallbackData` para SWR, renderiza:
  - Header com tabs + LiveBadge + ApuracaoMeta
  - HeadlineScore
  - MapViewToggle (client) + NationalChoroplethMap (dynamic)
  - NationalNeedle
  - DecisiveUFsGrid
  - StateGroupedTable
  - InsightCard
  - ForecastTransparency (já shipped)
  - Footer
  RF-021..030.6.
- [x] T36. Test smoke integration `tests/integration/home-page.test.tsx` (renderToString → contém HeadlineScore, agulha, badges).

## Fase F — Estados/edge cases

- [x] T37. Estado `loading inicial` — skeleton de barras/agulha em `app/loading.tsx`.
- [x] T38. Estado `pré-eleição` — quando `pct_apurado_total === 0`, mostrar mensagem "Primeiras urnas chegando" no headline. (Coberto por HeadlineScore quando candidatos==null/zero.)
- [x] T39. Verificar reduced-motion globalmente (LiveBadge, Needle, mapa, bar transitions). RNF-026.

## Gate

- [x] `pnpm typecheck` clean
- [x] `pnpm lint` (biome) clean nos arquivos novos
- [x] `pnpm test` — verde para 003 (target: ~12-18 unit tests)
- [x] Smoke `pnpm dev` → `http://localhost:3000` renderiza sem erro de console (manual no orquestrador via Playwright MCP — fora deste agent)
- [x] Frontmatter: `status: draft → implementing`
- [x] Marcar `[~]` em sprint S04 § Specs in-flight

## Notas de execução

- **`<UFForecastTable />`** (RF-025) deferido para Fase F/S05 — escopo da spec 003 já entrega dot-plot inline via `<StateGroupedTable />` por agrupamento. Documentar em risco no relatório final.
- **`<NationalChoroplethMap />`** real (MapLibre + PMTiles) idealmente despachado a `map-builder` antes do gate Fase 3. Por ora skeleton + placeholder fechado garante RNF-007a; integração de mapa real é Fase 4D refinada (não bloqueia `implementing`).
