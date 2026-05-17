# SalaCofre — Documentação

Documentação Spec-Driven Development (SDD) do SalaCofre — plataforma web pública para apuração das eleições brasileiras de 2026 com projeção estatística em tempo real.

> **Versão**: SDD v1.0 (picotada do PRD v0.1 em 2026-05-17)
> **Status do código**: greenfield (sem implementação ainda)
> **Owner**: Tiago Menna · menna@outsiders.digital

---

## Por onde começar

| Você quer... | Vá para |
|---|---|
| Entender o produto em 2 minutos | [product/vision.md](./product/vision.md) |
| Ver os princípios não-negociáveis | [constitution.md](./constitution.md) |
| Trabalhar numa feature | [specs/](./specs/) |
| Entender a arquitetura | [architecture/overview.md](./architecture/overview.md) |
| Ver decisões de design técnico | [architecture/adrs/](./architecture/adrs/) |
| Ver metas de performance/a11y/etc | [nfr/](./nfr/) |
| Ver cronograma macro (F1–F8) | [product/roadmap.md](./product/roadmap.md) |
| Ver planejamento de sprints | [sprints/](./sprints/) |
| Ver sprint ativa | `grep -l "status: active" docs/sprints/*.md` |
| Ver matriz de cobertura RF→spec→teste | [_meta/traceability.md](./_meta/traceability.md) |
| Carregar o índice via agente de IA | [_meta/index.json](./_meta/index.json) |
| Ver o PRD original (snapshot v0.1) | [PRD.md](./PRD.md) |

---

## Specs (13)

| # | Spec | Status | Prioridade | Telas |
|---|---|---|---|---|
| 001 | [Ingestão TSE](./specs/001-ingestao-tse/) | shipped | M | — |
| 001.1 | [Refactor parser TSE EA20→JSON](./specs/001.1-tse-json-refactor/) | draft | M | — |
| 002 | [Modelo estatístico](./specs/002-modelo-estatistico/) | implementing | M | — |
| 003 | [Home Nacional Presidencial](./specs/003-home-nacional/) | draft | M | T-01 |
| 004 | [Página UF Presidencial](./specs/004-pagina-uf-presidencial/) | draft | M | T-03 |
| 005 | [Página UF Governador](./specs/005-pagina-uf-governador/) | draft | M | T-04 |
| 006 | [Grid Governadores](./specs/006-grid-governadores/) | draft | M | T-02 |
| 008 | [Interatividade Brushing](./specs/008-interatividade-brushing/) | draft | M | transversal |
| 009 | [Compartilhamento e Meta](./specs/009-compartilhamento-meta/) | draft | S | transversal |
| 010 | [Operação e Monitoramento](./specs/010-operacao-monitoramento/) | draft | M | T-07 |
| 011 | [Sobre o Modelo](./specs/011-sobre-o-modelo/) | draft | M | T-06 |
| 012 | [Dashboard /_status](./specs/012-dashboard-status/) | draft | M | T-07 |
| 013 | [Página de Manutenção](./specs/013-pagina-manutencao/) | draft | M | T-08 |

Cada spec contém `spec.md` (requirements em EARS) e `design.md` (decisões técnicas). `tasks.md` será adicionado no início da implementação de cada uma.

---

## Estrutura

```
docs/
├── README.md                          # você está aqui
├── PRD.md                             # snapshot v0.1 (read-only)
├── constitution.md                    # princípios não-negociáveis
├── product/                           # vision, personas, use-cases, metrics, roadmap
├── specs/                             # 11 capabilities
├── architecture/                      # overview, stack, data, APIs, ADRs
├── design-system/                     # tokens, grid, components, animations
├── mapas/                             # PMTiles, MapLibre, brushing, mobile
├── nfr/                               # performance, a11y, security, observability
├── testing/                           # unit, integration, e2e, replay, load
├── operations/                        # runbook, alerts, deployment, checklist
├── reference/                         # glossário, fontes, regulação, riscos
└── _meta/                             # conventions, traceability, index.json
```

---

## Convenções

Antes de criar/editar specs, ler [_meta/conventions.md](./_meta/conventions.md):

- IDs e nomenclatura (RF-NNN, RNF-NNN, T-NN, ADR-NNNN).
- Frontmatter padrão de `spec.md` e `design.md`.
- Sintaxe EARS para requisitos: `WHEN/WHILE/IF/WHERE <gatilho>, the system SHALL <comportamento>`.
- Cross-refs por path relativo, sem duplicação de conteúdo.
- PRD.md é read-only — toda edição vai pras specs.

---

## Status atual

- **Documentação**: completa (60 RFs do PRD + 4 RFs adicionados nas specs mapeados; 10 ADRs; 34 RNFs; 12 specs).
- **Código**: greenfield (não iniciado em 2026-05-17).
- **Próximo passo**: F1 (Fundação) — ver [roadmap](./product/roadmap.md).
