---
id: 011-sobre-o-modelo
title: Página Sobre o Modelo (T-06)
status: implementing
priority: M
personas: [P2, P3]
screens: [T-06]
requirements: [RF-054]
depends_on: [002-modelo-estatistico]
apis: []
components: []
nfr: [RNF-022, RNF-027, RNF-030]
adrs: [0005, 0006]
---

# Spec 011 — Página Sobre o Modelo

**Rota**: `/sobre-o-modelo`

## Objetivo

Credibilidade. Página estática (MDX) que explica metodologia completa do modelo estatístico, atendendo à transparência exigida pela constituição § 8.

## Escopo

**In**:
- O que é o modelo (resumo).
- Como funciona o swing zona-a-zona.
- Como é calculado o intervalo de confiança (bootstrap).
- Como interpretar a agulha (bandas: tossup/lean/likely/very_likely).
- Limitações conhecidas.
- Quem somos.
- Fontes de dados (TSE, IBGE).
- Disclaimer: não somos oficiais; consulte o TSE para resultado final.

**Out**:
- Implementação do modelo (escopo [spec 002](../002-modelo-estatistico/)).

## Requisitos Funcionais (EARS)

**RF-054 — Página com metodologia completa**

WHEN o usuário acessa `/sobre-o-modelo`, the system SHALL exibir página MDX com seções: O modelo, Swing, Intervalo de confiança, Agulha, Limitações, Quem somos, Fontes, Disclaimer.

**Aceitação**:
- Given a página renderiza, when leitor procura "limitações", then encontra seção com pelo menos 3 limitações conhecidas (UF com <5% apurado, candidato sem bloco político 2022, modelo desabilitado).

## Requisitos Não-Funcionais

- Contraste 4.5:1 ([RNF-022](../../nfr/accessibility.md)).
- URL canônica ([RNF-027](../../nfr/seo.md)).
- Lighthouse SEO >95 ([RNF-030](../../nfr/seo.md)).

## Cross-refs

- Design: [./design.md](./design.md)
- Spec modelo: [../002-modelo-estatistico/](../002-modelo-estatistico/)
- Constituição § 8 (transparência): [../../constitution.md](../../constitution.md#8-transparência-metodológica)
- Fontes: [../../reference/data-sources.md](../../reference/data-sources.md)
- Glossário: [../../reference/glossary.md](../../reference/glossary.md)
