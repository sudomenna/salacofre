---
title: Regulamentação
description: Marco regulatório aplicável — Resolução TSE 23.736/2024 e LGPD
status: stable
source: PRD.md § 23.2
---

# Regulamentação

## Resolução TSE vigente para o pleito 2026

O TSE publica uma resolução específica por ciclo eleitoral regulando a divulgação por terceiros. As resoluções dos últimos ciclos:

| Pleito | Resolução TSE | Aplicabilidade ao AtlasMenna |
|---|---|---|
| Eleição Geral 2022 | Res. 23.673/2021 | Referência histórica |
| Eleição Municipal 2024 | **Res. 23.736/2024** | Referência de práticas; **não rege automaticamente o pleito 2026** |
| **Eleição Geral 2026** | **A ser publicada** (esperada entre dez/2025 e mar/2026) | **Rege o AtlasMenna em produção** |

**Status em 2026-05-17**: aguardando publicação. Até lá, usar 23.736/2024 como guia de boas práticas (cadastro, footer, atribuição), **sem** assumir reuso literal de regras técnicas (cadenciamento, headers, formatos).

**Quando a resolução 2026 sair**:

1. Revisão imediata de constituição § 1 e desta página.
2. Releitura de RF-010 ([spec 001](../specs/001-ingestao-tse/spec.md)) — cadastro precisa cobrir o novo texto.
3. Diff técnico do schema EA20 ([design da spec 001](../specs/001-ingestao-tse/design.md)) contra eventuais novas exigências.
4. Diff do cadenciamento de polling permitido.
5. Diff dos textos obrigatórios em footer/atribuição.
6. Watch item ativo em [risks.md](./risks.md).

## LGPD (Lei 13.709/2018)

Tratamento de dados não-aplicável diretamente — AtlasMenna não coleta PII por design (constituição § 5).

## Aplicação atual

- Sistema deve estar cadastrado antes da janela de apuração (RF-010), conforme a resolução 2026 quando publicada.
- Footer obrigatório: "Não oficial. Fonte: TSE." (válido sob qualquer resolução plausível).
- Tooltips/legendas atribuem fonte explicitamente (idem).

## Cross-refs

- Constituição § 1 (conformidade regulatória): [../constitution.md](../constitution.md#1-conformidade-regulatória-tse)
- Spec ingestão (RF-010): [../specs/001-ingestao-tse/](../specs/001-ingestao-tse/)
- Risco "resolução 2026 muda regras técnicas": [./risks.md](./risks.md)
