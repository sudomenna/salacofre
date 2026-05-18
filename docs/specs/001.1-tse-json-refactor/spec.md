---
id: 001.1-tse-json-refactor
title: Refactor parser TSE — EA20 (legado) → JSON (2026)
status: draft
priority: M
personas: []
screens: []
requirements: [RF-001.1, RF-002.1, RF-003.1, RF-004.1, RF-005.1]
depends_on: [001-ingestao-tse]
supersedes_parser_only: 001-ingestao-tse
apis: []
components: []
nfr: [RNF-006, RNF-020]
adrs: [0008, 0011]
opens_after: tse-audiencia-tecnica-2026-07
blocked_on: [tse-spec-json-2026]
---

# Spec 001.1 — Refactor parser TSE EA20 → JSON

## Status

**`draft` — placeholder reservando slot mental**. Hidratar após **audiência técnica TSE prevista para início de julho/2026**, quando schema JSON oficial 2026 for revelado. Até lá, estudar specs JSON 2024 do TSE como referência.

## Contexto

A spec 001 (shipped na S02) implementou parser **EA20** (HTML embarcado em pacotes ZIP/BZ2). Em 2026-05-17 o TSE confirmou via página oficial "Informações técnicas sobre a divulgação de resultados" que **2026 volta ao formato JSON** (mesmo padrão usado antes do EA20 em ciclos anteriores). Detalhes técnicos (schema, endpoints, cadenciamento, headers) serão apresentados em **audiência pública técnica início julho/2026**.

Esta spec **não substitui** a spec 001 inteira — apenas o **parser** e os **schemas Zod**. Orchestrator (`/api/ingest`), client HTTP (`lib/tse/client.ts`), repositório (`lib/tse/repository.ts`), cron e alerting permanecem intactos (format-agnostic).

## Escopo (preliminar — refinar pós-audiência)

**In**:
- Substituir `lib/tse/parser-ea20.ts` por `lib/tse/parser-json.ts` (mesma interface pública pra orchestrator).
- Substituir schemas Zod EA20 (`lib/tse/schema.ts`) por schemas JSON 2026.
- Manter ou eliminar wrapper ZIP/BZ2 (`lib/tse/fetcher.ts`) — depende de o JSON vir cru ou comprimido (a confirmar na audiência).
- Atualizar fixtures `tests/fixtures/tse/` com payload JSON real do simulado oficial 2026.
- Atualizar `docs/architecture/data-model.md` se schema interno (`snapshots.payload` JSONB) precisar de adaptação.

**Out**:
- Orchestrator `/api/ingest` (mantém — format-agnostic).
- Modelo estatístico (spec 002 — payload normalizado consumido a jusante).
- UI (specs 003+ — consome Edge Config, não snapshot bruto).

## Requisitos Funcionais (placeholder — EARS a refinar pós-audiência)

Os RFs abaixo são **placeholders sintáticos** — texto definitivo depende do schema oficial que sair da audiência. IDs reservados pra não colidir com RF-001..010 da spec 001 shipped.

**RF-001.1 — Parser de JSON do TSE 2026**

WHEN um payload JSON é recebido do endpoint TSE 2026, the system SHALL validar contra schema Zod 2026 e extrair `(uf, cod_zona, pct_apurado, cand[].votos)` na mesma shape interna usada pela spec 001 (preservando contrato com `snapshots.payload`).

**RF-002.1 — Cadenciamento revisado**

WHEN a audiência técnica revelar cadenciamento permitido para 2026, the system SHALL ajustar `vercel.ts` cron + semáforo de fan-out para respeitá-lo. ADR-0011 (60s nativo) provavelmente segue válido — confirmar.

**RF-003.1 — Headers HTTP atualizados**

WHEN a documentação 2026 especificar User-Agent ou outros headers obrigatórios, the system SHALL atualizá-los em `lib/tse/client.ts`.

**RF-004.1 — Migração de fixtures**

WHEN o simulado oficial 2026 rodar (datas TBD; em 2024 foram 1–2/out), the system SHALL gravar fixtures reais em `tests/fixtures/tse/2026/` para regressão futura.

**RF-005.1 — Validação contra simulado oficial**

WHEN o simulado oficial 2026 estiver disponível em `resultados-sim`, the system SHALL completar ciclo end-to-end (fetch + parse + persist + trigger modelo) sem erros e com latência dentro de RNF-006.

## Plano de absorção (3 fases)

| Fase | Quando | Ação |
|---|---|---|
| **Pre-audiência** | Jun/2026 | Estudar specs JSON 2024 do TSE. Documentar shape esperado em `design.md`. Sem código. |
| **Pós-audiência** | Jul–ago/2026 | Hidratar esta spec (RFs definitivos, design.md, tasks.md). Promover a `ready`. Despachar `tse-parser-builder` pra implementar. Cobertura de testes contra mock JSON. |
| **Pré-simulado** | Set/2026 | Smoke contra `resultados-sim` ciclo `ele2026/<cod-simulado>`. Gravar fixtures reais. Promover a `shipped`. |
| **Pós-simulado** | Out/2026 | Re-rodar `model-validator` (gate OT-4 da spec 002) com dados reais — destrava promoção da spec 002 a `shipped`. |

## Dependências cruzadas

- **Spec 001 (shipped)**: parser EA20 fica como **legado preservado** (não removido — pode servir como referência ou ciclo testemunha). Não tocar `lib/tse/parser-ea20.ts` até esta spec ir a `ready`.
- **Spec 002 (`implementing`)**: gate OT-4 real depende de simulado oficial 2026 → depende desta spec funcionar.
- **Constituição § 1**: conformidade TSE — qualquer mudança de cadenciamento/headers passa por revisão.

## Open questions (a responder pós-audiência)

- JSON virá cru ou comprimido (BZ2/ZIP)? Mantém `fetcher.ts` ou simplifica?
- Endpoint base muda de `resultados.tse.jus.br` para outro domínio?
- ETag/If-None-Match continua suportado?
- Schema do JSON 2026 é idêntico ao de 2018/2020/2024 ou tem novidade?
- Granularidade (zona/seção) muda?

## Cross-refs

- Spec 001 (parser EA20 legado): [../001-ingestao-tse/](../001-ingestao-tse/)
- Spec 002 (modelo — depende deste refactor pra gate OT-4 real): [../002-modelo-estatistico/](../002-modelo-estatistico/)
- Fato regulatório: [../../reference/regulatory.md § "Mudança técnica anunciada"](../../reference/regulatory.md)
- Risco confirmado: [../../reference/risks.md](../../reference/risks.md)
- ADR-0011 (cadência polling 60s Vercel Cron): [../../architecture/adrs/0011-cadencia-60s.md](../../architecture/adrs/0011-cadencia-60s.md)
