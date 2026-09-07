---
id: 011-sobre-o-modelo
type: design
title: Página Sobre o Modelo — Design Técnico
status: draft
---

# Design — Página Sobre o Modelo

## Arquitetura

- `app/sobre-o-modelo/page.tsx` — Server Component estático (a redação original previa MDX; a implementação S04 entregou TSX, e é o TSX que vale).
- Sem fetch — conteúdo congelado no build.
- Diagramas em **SVG inline** no próprio arquivo (`ExtrapolationIllustration`, `ConfidenceBandIllustration`, `NeedleIllustration`) — sem dependência externa e sem assets em `public/`.

## Estrutura da página

```
# Sobre o Modelo

## Como funciona
## Regra de três por zona
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
- "Regra de três por zona" → resumo de RF-011 (fator `k = te/esi`), RF-012 (razão de somas na UF) e RF-013 (imputação de zona não apurada) + [ADR-0021](../../architecture/adrs/0021-extrapolacao-do-apurado-sem-2022.md).
- "CI" → resumo de RF-015 + [ADR-0006](../../architecture/adrs/0006-bootstrap-nao-bayesiano.md).
- "Agulha" → bandas explicadas em prosa.
- "Limitações" → **viés de composição** (consequência negativa central do ADR-0021) + casos de borda RF-017 (UF sem zona apurada → proporção nacional, ±10pp) e RF-018 (IC inflado abaixo de 5% apurado) + bases não intercambiáveis (RF-020.2).
- "Fontes" → reuso de [data-sources.md](../../reference/data-sources.md).

## Cross-refs

- Spec: [./spec.md](./spec.md)
- Constituição § 8 (v1.2): [../../constitution.md](../../constitution.md#8-transparência-metodológica)
- ADR-0021: [../../architecture/adrs/0021-extrapolacao-do-apurado-sem-2022.md](../../architecture/adrs/0021-extrapolacao-do-apurado-sem-2022.md)
