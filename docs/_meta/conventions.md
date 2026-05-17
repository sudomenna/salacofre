---
title: Convenções da Documentação
description: Formato EARS, IDs, frontmatter padrão, cross-refs, política de edição
status: stable
---

# Convenções da Documentação

## IDs e nomenclatura

| Categoria | Padrão | Exemplo |
|---|---|---|
| Requisitos Funcionais | `RF-NNN` (numérico, 3 dígitos) | `RF-001`, `RF-030.6` |
| Requisitos Não-Funcionais | `RNF-NNN` | `RNF-001` |
| Telas | `T-NN` | `T-01` |
| Casos de Uso | `UC-NN` | `UC-03` |
| Objetivos Produto | `OP-N` | `OP-1` |
| Objetivos Técnicos | `OT-N` | `OT-4` |
| Personas | `P-N` | `P1` (sem hífen) |
| ADRs | `ADR-NNNN` (4 dígitos) | `ADR-0001` |
| Specs | `NNN-slug-kebab-case/` | `003-home-nacional/` |

**IDs do PRD original são preservados** — não renumerar.

## Frontmatter padrão de `spec.md`

```yaml
---
id: 003-home-nacional
title: Home Nacional Presidencial
status: draft | ready | implementing | shipped
priority: M | S | C
personas: [P1, P2, P3, P4]
screens: [T-01]
requirements: [RF-021, RF-022, RF-023, RF-024, RF-025, RF-026, RF-027, RF-028, RF-029, RF-030, RF-030.1, RF-030.2, RF-030.3, RF-030.4, RF-030.5, RF-030.6]
depends_on: [001-ingestao-tse, 002-modelo-estatistico, 008-interatividade-brushing]
apis: [GET /api/projection]
components: [HeadlineScore, NationalChoroplethMap, MapViewToggle, StateGroupedTable, NationalNeedle, DecisiveUFsGrid, InsightCard, ForecastTransparency]
nfr: [RNF-001, RNF-002, RNF-007]
adrs: [0001, 0002, 0003, 0004]
---
```

## Frontmatter padrão de `design.md`

```yaml
---
id: 003-home-nacional
type: design
title: Home Nacional — Design Técnico
status: draft | ready
---
```

## Sintaxe EARS para RFs

Toda RF em `spec.md` segue o padrão:

```
**RF-XXX — <título curto>**

WHEN/WHILE/IF/WHERE <gatilho>, the system SHALL <comportamento>.

**Aceitação**:
- Given <pré-condição>, when <ação/evento>, then <resultado observável>.
- ...
```

### Variantes EARS

- **`WHEN`** — evento discreto ("WHEN o cliente faz GET /api/projection").
- **`WHILE`** — estado contínuo ("WHILE estamos na janela 17h–04h").
- **`IF`** — condição opcional ("IF P(vitória) ≥ 95%").
- **`WHERE`** — feature opcional/configurável ("WHERE o usuário tem prefers-reduced-motion").

### Combinações

`WHEN <gatilho> AND IF <condição>, the system SHALL <comportamento>.`

## Estrutura padrão de `spec.md`

1. Frontmatter
2. **Objetivo** — 1–2 linhas, em primeira pessoa do usuário ou objetivo de negócio.
3. **Escopo** — listas `in` / `out`.
4. **Personas e jornadas** — refs.
5. **Requisitos Funcionais (EARS)** — agrupados por subcategoria.
6. **Requisitos Não-Funcionais aplicáveis** — refs pra `nfr/`.
7. **Telas / Wireframes** — refs ou inline.
8. **Open questions** — lista com `?` versionada.

## Estrutura padrão de `design.md`

1. Frontmatter
2. **Arquitetura** — diagrama ou ref a `architecture/overview.md`.
3. **Contratos** — payload de API, schema de evento.
4. **Componentes** — refs a `design-system/components.md`.
5. **Fluxos** — sequência de chamadas/estados.
6. **ADRs aplicáveis** — refs.
7. **Riscos técnicos** — específicos da capability.

## Cross-references

- **Sempre** usar markdown link com path relativo: `[../nfr/performance.md](../nfr/performance.md)`.
- Apontar pra ancoras quando útil: `[#3-performance-percebida](../constitution.md#3-performance-percebida)`.
- **Não duplicar conteúdo** — sempre referenciar a fonte canônica.

## Política de edição

- `docs/PRD.md` é **read-only** (snapshot v0.1).
- Toda edição de escopo vai pra `docs/specs/` ou pra fonte canônica respectiva (NFR, ADR, design-system).
- Specs `shipped` viram histórico — alterações exigem novo PR com justificativa.
- ADRs são **append-only** — para superseder um ADR, criar um novo (ex: ADR-0010 supersedes ADR-0005) e marcar o antigo como `superseded`.

## Validação

A matriz [traceability.md](./traceability.md) deve listar todos os RFs do PRD original mapeados pra alguma spec. Toda spec deve aparecer no [index.json](./index.json).
