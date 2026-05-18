---
title: Riscos e Mitigações
description: Matriz de riscos do projeto com impacto, probabilidade e mitigação por linha
status: stable
source: PRD.md § 22
---

# Riscos e Mitigações

| Risco | Impacto | Probabilidade | Mitigação |
|---|---|---|---|
| ~~TSE muda formato EA20 sem aviso~~ → **CONFIRMADO em 2026-05-17**: TSE anunciou volta ao JSON para 2026 (não EA20). Audiência técnica início julho/2026. | **Crítico** | **100% (fato)** | **Spec 001 (shipped) precisa refactor: parser EA20 → JSON. Plano em `docs/reference/regulatory.md § "Mudança técnica anunciada"`. Pré-audiência: estudar specs 2024 JSON. Pós-audiência: spec 001.1 refactor via `tse-parser-builder`. Pré-simulado: validar com `resultados-sim` 2026.** |
| Data exata do simulado oficial TSE 2026 ainda não publicada | Alto | Alta | Watch ativo na página técnica TSE; em 2024 foram 1º–2/out. Provavelmente jul–set/2026. Mantém calendário S04..S08 flexível pra encaixar refactor + smoke contra simulado. |
| TSE fica indisponível por >5min | Alto | Média | Graceful degradation com último valor; banner amarelo |
| Modelo retorna projeção absurda em t=início | Alto | Média | Penalização forte de CI <5% apurado; guardrails de sanidade |
| Pico de tráfego excede 20k | Médio | Média | Edge Config + CDN escalam automaticamente; load test 30k |
| Bug de renderização em mobile específico | Médio | Média | E2E em Playwright com BrowserStack; bug bash em Set |
| Cadastro TSE atrasado | Crítico | Baixa | Iniciar em Jun 2026 (deadline tipicamente Set) |
| **Resolução TSE 2026 publicada tardiamente ou com mudanças técnicas** | **Alto** | **Média** | **Watch ativo (semanal) no portal do TSE; manter pipeline modular pra absorver mudança de User-Agent/cadenciamento/headers; advogado em standby para análise rápida; testar diff em ambiente de staging assim que sair** |
| Equipe pequena vs escopo grande | Alto | Alta | Priorizar M sobre S/C; cortar governadores se necessário |
| Atribuição partidária problemática | Médio | Média | Disclaimer explícito; cores neutras se candidatos novos |
| Custo de Vercel acima do orçado | Médio | Baixa | Monitorar consumo semanal; alertas de billing |
| ~~Bundle JS estoura RNF-007a (>150KB above-the-fold)~~ → **CONFIRMADO em 2026-05-17 (S05 a11y-perf-auditor)**: above-the-fold em **168KB gz** (+18KB acima de 150KB). Composição: React 19 runtime (71KB) + polyfills (40KB) + Next 16 App Router client (39KB) + shims (~18KB) — framework overhead invariante. Carry-over de S04 (não regrediu na S05). | Médio | 100% (fato) | **Opções (a) ADR ajustando target para 175KB (recomendado — framework overhead inevitável em RSC+RSC actions); (b) `browserslist: "last 2 Chrome..."` em package.json pode cortar polyfills legados (~20KB). Mitigação imediata em S07 (polish + ops).** |
| **Modelo: validação dinâmica pendente até simulado oficial TSE 2026** | **Alto** | **Média** | **Spec 002 em `implementing` (não shipped). Gate técnico OT-4 PASS (MAE@1h <2pp) mas dataset T21 era circular → swing efetivamente zero. Re-rodar `model-validator` no simulado oficial (jul–set/2026); aceitar relaxar OT-4 via ADR só se 3 tentativas falharem. Vide retrospective S03 (Carry-over #11) e `spec.md ship_blocked_on:`** |
| **DF sem eleitorado em 2026** | Médio | Alta | Tabela `eleitorado` 2026 não tem DF; modelo silenciosamente exclui DF do MAE e da agregação nacional. Watch ativo no TSE; quando dataset publicado, rodar `data-pipeline/load-eleitorado.ts --uf=DF`. Carry-over #5 da S03. |
| **Concorrência `/api/ingest` (CONCURRENCY=20) não cabe em 60s pra ~73k targets prod** | Alto | Alta | Cálculo: 73k × 500ms / 20 paralelos ≈ 1825s. 3 opções catalogadas em `docs/operations/runbook.md § "TSE — concorrência produção"`: (a) CONCURRENCY=100, (b) particionar por UF em 27 crons, (c) Fluid Compute `maxDuration=800s`. Decisão deferida pra S04/S05. Risco real apenas em D-1 turno; preview tem fan-out reduzido. Carry-over #14 da S03. |
| **Drizzle baseline desconectado do Neon** (`pnpm db:generate` gera CREATE TABLE de tudo) | Baixo | Alta | Migrations S01/S02 foram manuais (`lib/db/migrations/0001_postgis.sql`, `0002_zonas_pk_fix.sql`); drizzle nunca viu o DB. Reconciliar via `drizzle-kit introspect` + baseline marcado como applied. Não bloqueia operação — afeta DX. Carry-over #10 da S03. |
| **Vercel preview deploy do Python (Fluid Compute) ainda não validado end-to-end** | Médio | Média | T02 da S03 ficou parcial: smoke local OK (`python3.14` standalone), mas `curl https://<preview>/api/model/project` precisa de `vercel deploy` com creds owner. Handoff operacional pendente. Risco: descobrir gotcha de runtime tarde. Mitigação: rodar deploy preview cedo na S04 antes de UI consumir Edge Config. |
| **Chunk MapLibre estoura RNF-007b (<250KB gz)** | Médio | Alta | `pnpm build` em 2026-05-17 pós-map-builder reportou chunk lazy do mapa em **287KB gzipped** (1.07MB raw) — só `maplibre-gl` consome isso, `pmtiles` parser é apenas ~30KB. Lazy-loaded (não conta pro RNF-007a above-the-fold da home), mas viola a meta de RNF-007b. Opções catalogadas pra `a11y-perf-auditor`: (a) atualizar RNF-007b pra 300KB via ADR (maplibre moderno é gordo, não há alternativa Vercel-nativa mais leve); (b) code-split entre features do MapLibre (só carrega o que usa); (c) trocar pra Leaflet (perde GL acceleration). Recomendação: (a) — overhead aceitável vs trade-off de feature loss. Validar com bundle-analyzer (`ANALYZE=true pnpm build`). |

## Cross-refs

- Disponibilidade: [../nfr/availability.md](../nfr/availability.md)
- Modelo (penalização <5%): [../specs/002-modelo-estatistico/](../specs/002-modelo-estatistico/)
- Runbook: [../operations/runbook.md](../operations/runbook.md)
- Retrospective S03 (origem dos 6 itens novos abaixo da divisória): [../sprints/2026-S03-f3-modelo.md#retrospective](../sprints/2026-S03-f3-modelo.md#retrospective)
