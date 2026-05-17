---
id: 013-pagina-manutencao
title: Página de Manutenção (T-08)
status: draft
priority: M
personas: []
screens: [T-08]
requirements: [RF-058]
depends_on: []
apis: []
components: []
nfr: [RNF-012, RNF-022]
adrs: []
---

# Spec 013 — Página de Manutenção

**Rota**: `/manutencao`

## Objetivo

Servida quando todos os endpoints estiverem indisponíveis (último recurso). Mensagem amigável + link para `resultados.tse.jus.br`.

## Escopo

**In**:
- Página estática (sem fetch).
- Mensagem clara explicando indisponibilidade temporária.
- Link para `resultados.tse.jus.br`.
- Manter brand do SalaCofre.

**Out**:
- Lógica de quando ativar (escopo [spec 010](../010-operacao-monitoramento/)).

## Requisitos Funcionais (EARS)

**RF-058 — Modo manutenção amigável**

IF todos os endpoints estiverem indisponíveis, the system SHALL servir `/manutencao` com mensagem amigável.

**Aceitação**:
- Given Edge Config indisponível, when usuário acessa `/`, then é redirecionado para `/manutencao`.
- Given `/manutencao` carrega, when usuário lê, then encontra link para `resultados.tse.jus.br`.

## Requisitos Não-Funcionais

- Graceful degradation ([RNF-012](../../nfr/availability.md)).
- Contraste 4.5:1 ([RNF-022](../../nfr/accessibility.md)).

## Cross-refs

- Design: [./design.md](./design.md)
- Spec operação: [../010-operacao-monitoramento/](../010-operacao-monitoramento/)
- Disponibilidade: [../../nfr/availability.md](../../nfr/availability.md)
