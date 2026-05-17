---
title: Regulamentação
description: Marco regulatório aplicável — Resolução TSE 23.736/2024 e LGPD
status: stable
source: PRD.md § 23.2
---

# Regulamentação

## Resolução TSE vigente para o pleito 2026

O TSE publica uma resolução específica por ciclo eleitoral regulando a divulgação por terceiros. As resoluções dos últimos ciclos:

| Pleito | Resolução TSE | Aplicabilidade ao SalaCofre |
|---|---|---|
| Eleição Geral 2022 | Res. 23.673/2021 | Referência histórica |
| Eleição Municipal 2024 | **Res. 23.736/2024** | Referência de práticas; **não rege automaticamente o pleito 2026** |
| **Eleição Geral 2026** | **A ser publicada** (esperada entre dez/2025 e mar/2026) | **Rege o SalaCofre em produção** |

**Status em 2026-05-17**: aguardando publicação. Até lá, usar 23.736/2024 como guia de boas práticas (cadastro, footer, atribuição), **sem** assumir reuso literal de regras técnicas (cadenciamento, headers, formatos).

**Quando a resolução 2026 sair**:

1. Revisão imediata de constituição § 1 e desta página.
2. Releitura de RF-010 ([spec 001](../specs/001-ingestao-tse/spec.md)) — cadastro precisa cobrir o novo texto.
3. Diff técnico do schema EA20 ([design da spec 001](../specs/001-ingestao-tse/design.md)) contra eventuais novas exigências.
4. Diff do cadenciamento de polling permitido.
5. Diff dos textos obrigatórios em footer/atribuição.
6. Watch item ativo em [risks.md](./risks.md).

## ⚠️ Mudança técnica anunciada pelo TSE para 2026 (2026-05-17)

A página oficial **"Informações técnicas sobre a divulgação de resultados"** do TSE confirma:

- **Formato de divulgação volta a ser JSON** (não EA20/HTML que usamos em 2022/2024 e que está implementado na spec 001 shipped).
- **Audiência pública técnica está prevista para início de julho de 2026** — detalhes do schema, endpoints, cadenciamento e cabeçalhos serão apresentados ali.
- Até a audiência, TSE recomenda usar **especificações técnicas de 2024** como referência de desenvolvimento.
- Para 2024, simulados rodaram em **1º e 2 de outubro**, ambiente `resultados-sim`, ciclo `ele2024`, código de eleição simulado. Data exata do simulado 2026 **ainda não publicada**.

**Impacto direto no SalaCofre**:

| Componente atual | Status pós-2026 |
|---|---|
| `lib/tse/parser-ea20.ts` (S02 shipped) | **Obsoleto** — refatorar pra parser JSON pós-audiência |
| ZIP/BZ2 wrapper (`fetcher.ts`) | A confirmar — JSON pode vir cru ou ainda em pacote comprimido |
| `lib/tse/client.ts` (ETag/If-None-Match, retry, User-Agent) | **Provavelmente mantém** — comportamento HTTP genérico |
| `app/api/ingest/route.ts` (semáforo, cron, persistência) | **Mantém** — orchestrator é format-agnostic |
| Schemas Zod do EA20 (`lib/tse/schema.ts`) | **Substituir** pelo schema JSON pós-audiência |
| Fixtures `tests/fixtures/tse/` | **Substituir** após simulado oficial 2026 |
| Spec 001 frontmatter | **Reabrir** — RF-001..009 podem precisar ajuste textual; tasks de refactor entram em sprint dedicada (F2.1?) |

**Plano de absorção**:

1. **Pré-audiência (junho/2026)**: estudar specs 2024 de JSON do TSE (busca "TSE ele2024 JSON dispnibilização resultados"). Documentar shape esperado em design.md da spec 001 como ramo alternativo.
2. **Pós-audiência (julho/2026)**: criar **spec 001.1 — Refactor parser EA20 → JSON** ou (se for trivial) integrar como chore de sprint pré-D1. Despachar `tse-parser-builder`.
3. **Pré-simulado (setembro/2026)**: simulado oficial 2026 vira o gate técnico real — exercita parser JSON novo + valida latência + valida concorrência prod.

**Cross-refs**:
- Risco "TSE muda formato EA20 sem aviso" em `risks.md` agora é **fato confirmado**, não risco. Mudar status pra "Realizado" + nova linha de risco residual ("simulado oficial 2026 ainda não datado").
- Watch ativo em `docs/operations/runbook.md` § "TSE — janela operacional" para datas de audiência e simulado.

## LGPD (Lei 13.709/2018)

Tratamento de dados não-aplicável diretamente — SalaCofre não coleta PII por design (constituição § 5).

## Aplicação atual

- Sistema deve estar cadastrado antes da janela de apuração (RF-010), conforme a resolução 2026 quando publicada.
- Footer obrigatório: "Não oficial. Fonte: TSE." (válido sob qualquer resolução plausível).
- Tooltips/legendas atribuem fonte explicitamente (idem).

## Cross-refs

- Constituição § 1 (conformidade regulatória): [../constitution.md](../constitution.md#1-conformidade-regulatória-tse)
- Spec ingestão (RF-010): [../specs/001-ingestao-tse/](../specs/001-ingestao-tse/)
- Risco "resolução 2026 muda regras técnicas": [./risks.md](./risks.md)
