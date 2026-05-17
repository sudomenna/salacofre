---
id: 005-pagina-uf-governador
type: design
title: Página de UF Governador — Design Técnico
status: draft
---

# Design — Página de UF Governador

## Arquitetura

Reutiliza 100% dos componentes de [spec 004](../004-pagina-uf-presidencial/design.md). Diferença única: route `app/uf/[sigla]/governador/page.tsx` faz fetch com `?cargo=governador`.

## Composição

Mesma composição da [spec 004 design](../004-pagina-uf-presidencial/design.md#composição), com adição condicional de:

```
{noModelMapping && (
  <DisclaimerBanner>
    Modelagem para essa corrida está desabilitada —
    exibimos apenas o parcial atual sem projeção.
  </DisclaimerBanner>
)}
```

## Contratos

`GET /api/projection?cargo=governador&uf=<sigla>` — mesmo shape `EdgePayload`, mas com `cargo: 3`.

Campo extra no payload (a confirmar): `model_disabled: boolean` quando bloco político não mapeável.

## ADRs aplicáveis

Mesmas da spec 004.

## Riscos técnicos

- **Atribuição partidária em 2026 vs 2022** — partidos novos, fusões, candidatos sem histórico. Tratado em [spec 002](../002-modelo-estatistico/spec.md) (caso de borda) e constituição § 2 (disclaimer obrigatório).

## Cross-refs

- Spec: [./spec.md](./spec.md)
- Design da irmã: [../004-pagina-uf-presidencial/design.md](../004-pagina-uf-presidencial/design.md)
