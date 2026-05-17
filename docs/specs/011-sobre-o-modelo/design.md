---
id: 011-sobre-o-modelo
type: design
title: Página Sobre o Modelo — Design Técnico
status: draft
---

# Design — Página Sobre o Modelo

## Arquitetura

- `app/sobre-o-modelo/page.mdx` — página MDX estática.
- Sem fetch — conteúdo congelado no build.
- Imagens/diagramas em `public/sobre-modelo/`.

## Estrutura do MDX

```
# Sobre o Modelo

## Como funciona
## Swing zona-a-zona
## Intervalo de confiança
## A agulha
## Limitações
## Quem somos
## Fontes de dados
## Disclaimer
```

## Conteúdo canônico

Cada seção referencia a fonte da documentação técnica:

- "Como funciona" → resumo de [spec 002](../002-modelo-estatistico/spec.md).
- "Swing" → resumo de RF-011, RF-012.
- "CI" → resumo de RF-015 + [ADR-0006](../../architecture/adrs/0006-bootstrap-nao-bayesiano.md).
- "Agulha" → bandas explicadas em prosa.
- "Limitações" → casos de borda RF-017, RF-018 + atribuição partidária.
- "Fontes" → reuso de [data-sources.md](../../reference/data-sources.md).

## Cross-refs

- Spec: [./spec.md](./spec.md)
- Constituição § 8: [../../constitution.md](../../constitution.md#8-transparência-metodológica)
