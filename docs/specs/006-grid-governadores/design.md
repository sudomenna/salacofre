---
id: 006-grid-governadores
type: design
title: Grid Governadores — Design Técnico
status: draft
---

# Design — Grid Governadores

## Arquitetura

- Server Component `app/governador/page.tsx` lê Edge Config (`projection:current` com `cargo=3`).
- Cliente hidrata, polling SWR 5s.
- Filtros aplicados client-side via Zustand local da página.

## Composição

```
<page.tsx (SC)>
  <Header>
    <Tabs activeKey="gov" />
    <Subtitle>{n_chamadas} chamados, {n_em_disputa} ainda em disputa</Subtitle>
  </Header>
  <GovernorFilterBar />
  <Grid cols="3" responsive>
    {por_uf.map(uf => <GovernorCard key={uf.sigla} {...uf} />)}
  </Grid>
```

## `<GovernorCard />` (novo, block)

- Mini-agulha (`<Needle size="sm" />`).
- 2 candidatos top com nome curto, partido, %.
- Status badge: `✓ CHAMADA` (P>95%) | `Em disputa`.
- Click navega para `/uf/[sigla]/governador`.

## Contratos

`GET /api/projection?cargo=governador` — recebe payload com 27 UFs em `por_uf[]`.

## ADRs aplicáveis

- [ADR-0001 Edge Config](../../architecture/adrs/0001-edge-config-no-read-path.md)
- [ADR-0002 Polling](../../architecture/adrs/0002-polling-cdn-cache.md)

## Riscos técnicos

- 27 agulhas + 27 sparklines pode pesar — usar `<Needle />` em modo `lite` (SVG simples sem spring).

## Cross-refs

- Spec: [./spec.md](./spec.md)
