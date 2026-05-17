---
id: 008-interatividade-brushing
title: Interatividade — Brushing & Linking
status: draft
priority: M
personas: [P1, P2, P3]
screens: [T-01, T-02, T-03, T-04, T-05]
requirements: [RF-045, RF-046, RF-047, RF-048, RF-049, RF-050]
depends_on: []
apis: []
components: [HoverTooltip, BottomSheet]
nfr: [RNF-003, RNF-022, RNF-024]
adrs: []
---

# Spec 008 — Interatividade (Brushing & Linking)

## Objetivo

Toda visualização da mesma entidade reage coordenadamente: hover em uma UF no mapa nacional destaca a linha correspondente na tabela e no grid de UFs decisivas, e vice-versa. No mobile, tap substitui hover; tooltip vira bottom-sheet.

## Escopo

**In**:
- Hover store global (Zustand) — coordena entidades `{uf | municipio}`.
- Coordenação entre mapas, tabelas, gráficos.
- Tooltip flutuante com breakdown contextual.
- Comportamento mobile: tap-to-select + bottom-sheet.

**Out**:
- Lógica específica de cada tela (escopo das specs por tela).

## Requisitos Funcionais (EARS)

**RF-045 — Hover destaca entidade em todas as visualizações**

WHEN o usuário passa o mouse sobre uma entidade `{uf | municipio}` em qualquer visualização, the system SHALL destacar a mesma entidade em todas as outras visualizações coordenadas na mesma página.

**Aceitação**:
- Given usuário está em `/uf/sp`, when hover em município "Campinas" no mapa, then a linha "Campinas" da tabela é destacada AND o mesmo município é destacado no segundo mapa do duo.

**RF-046 — Hover em linha de tabela destaca nos mapas**

WHEN o usuário passa o mouse sobre uma linha de tabela representando uma entidade, the system SHALL destacar a entidade correspondente em todos os mapas da página.

**RF-047 — Click em UF/município navega para drill-down**

WHEN o usuário clica em uma UF (mapa nacional) ou município (mapa estadual), the system SHALL navegar respectivamente para `/uf/[sigla]` ou `/uf/[sigla]/municipio/[ibge]`.

**RF-048 — Tooltip flutuante com breakdown**

WHEN uma entidade está em hover state, the system SHALL exibir `<HoverTooltip />` flutuante com breakdown contextual (votos, %, swing, contribuição).

**RF-049 — Mobile: tap-to-select fixa o destaque**

WHERE o cliente é mobile (touch device), the system SHALL substituir hover por tap, fixando o destaque até o próximo tap ou tap fora.

**RF-050 — Tooltip vira bottom-sheet no mobile**

WHERE o cliente é mobile, the system SHALL renderizar o tooltip como bottom-sheet (`<BottomSheet />`) em vez de flutuante.

## Requisitos Não-Funcionais aplicáveis

- INP <200ms ([RNF-003](../../nfr/performance.md)).
- Navegação por teclado ([RNF-024](../../nfr/accessibility.md)) — setas movem foco entre entidades.

## Open questions

- Quando um tap fora do mapa fecha o bottom-sheet vs quando mantém? (atual: tap fora fecha).

## Cross-refs

- Design: [./design.md](./design.md)
- Hover store: [../../design-system/state-global.md](../../design-system/state-global.md)
- Brushing nos mapas: [../../mapas/brushing-linking.md](../../mapas/brushing-linking.md)
- Mobile: [../../mapas/mobile.md](../../mapas/mobile.md)
