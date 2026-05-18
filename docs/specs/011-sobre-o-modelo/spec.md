---
id: 011-sobre-o-modelo
title: Página Sobre o Modelo (T-06)
status: shipped
priority: M
personas: [P2, P3]
screens: [T-06]
requirements: [RF-054]
depends_on: [002-modelo-estatistico]
apis: []
components: [SwingIllustration, ConfidenceBandIllustration, NeedleIllustration]
nfr: [RNF-022, RNF-027, RNF-030]
adrs: [0005, 0006]
shipped_with_carry_overs:
  - ilustracoes-SVG-inline-3-NYT-style-MVP-NeedleIllustration-mockup-estatico
  - link-ADR-0006-externo-GitHub-em-vez-de-rota-interna-docs
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

## S05 — Extensão: Métricas de 2º turno e K-1 fallback

Com a introdução de suporte multi-turno ([ADR-0014](../../architecture/adrs/0014-p-segundo-turno-primeira-classe.md)) e fallback robusto para candidatos sem histórico ([ADR-0015](../../architecture/adrs/0015-k1-fallback-3-tier.md)), a página `/sobre-o-modelo` foi estendida para documentar:

**Novos campos no payload do modelo**:
- `p_segundo_turno_overall` — probabilidade de haver segundo turno para aquela corrida (nacional).
- `cenarios_2t` — array de cenários (top 2 por P(vitória)) que teríamos se houvesse 2T.
- `p_passa_2t` (por candidato) — probabilidade de passar para segundo turno, dado swing atual + voto indeciso.
- `p_fecha_1t` (por candidato) — probabilidade de fechar eleição no 1T com >50% dos válidos.

**Tratamento de candidatos sem mapeamento 2022** ([ADR-0015](../../architecture/adrs/0015-k1-fallback-3-tier.md)):
- **Fallback 3-tier**: usar vizinhos geográficos (tier 1), depois zona similiar (tier 2), depois nacional (tier 3).
- Se nenhum tier retorna dados históricos, candidato é marcado como "modelo desabilitado para essa corrida" — exibimos só parcial atual.
- A página explica quando e por que isso ocorre.

**Transparência sobre limitações** (constituição § 8):
- 2º turno é especulativo — o modelo não prediz voto indeciso exato, só usa cenários plausíveis.
- Multi-candidato em 1T aumenta incerteza da projeção — CI é mais largo (documentado).
- K-1 é heurística — nem sempre disponível; fallback geográfico é impreciso para candidatos locais novos.

## Cross-refs

- Design: [./design.md](./design.md)
- Spec modelo: [../002-modelo-estatistico/](../002-modelo-estatistico/)
- Constituição § 8 (transparência): [../../constitution.md](../../constitution.md#8-transparência-metodológica)
- Fontes: [../../reference/data-sources.md](../../reference/data-sources.md)
- Glossário: [../../reference/glossary.md](../../reference/glossary.md)
