---
id: 005-pagina-uf-governador
title: Página de UF — Governador (T-04)
status: shipped
shipped_date: 2026-05-18
priority: M
personas: [P1, P2, P3]
screens: [T-04]
requirements: [RF-031, RF-032, RF-033, RF-034, RF-037, RF-043, RF-005.4, RF-061, RF-062, RF-063]
depends_on: [001-ingestao-tse, 002-modelo-estatistico, 004-pagina-uf-presidencial]
apis: [GET /api/projection?cargo=governador&uf=<sigla>]
components: [WinnerBanner, CandidateRow, ChoroplethMapUF, MunicipioTable, ForecastTransparency, ProjectionThermometer, ProjectionThermometers, TrilhaKicker, RaceHeader, CandidateResultRow, MunicipioExplorer, ResultPanel, CandidateListCollapse]
nfr: [RNF-001, RNF-002, RNF-003, RNF-008, RNF-022, RNF-023, RNF-024, RNF-025, RNF-027]
adrs: [0001, 0003, 0004, 0007, 0010, 0012, 0013, 0018, 0019, 0025, 0032, 0033, 0034, 0038]
---

# Spec 005 — Página de UF (Governador)

**Rota**: `/uf/[sigla]/governador`

## Objetivo

Versão da página de UF para a corrida de Governador daquela unidade federativa. Herda ~70% da estrutura da [spec 004](../004-pagina-uf-presidencial/spec.md) (presidencial) e adiciona blocos NYT-style decididos no kickoff S06: K-1 disclaimer, `<MunicipioWaffleGrid />` (Print 3), apuração por mesorregião (degrade gracioso) e tabela "Maiores municípios por eleitorado".

## Escopo

**In**:
- Mesma estrutura da [spec 004](../004-pagina-uf-presidencial/spec.md), mas com dados do cargo Governador (cargo=3).
- Reutiliza todos os componentes UF presidenciais — diferença é fetch (`?cargo=governador`).
- 4 blocos NOVOS / refator (S06/F4d):
  1. K-1 disclaimer (ADR-0015) quando `model_fallback_tier >= 2`.
  2. `<MunicipioWaffleGrid />` (Print 3) — 1 quadrado = 1 município.
  3. Apuração por mesorregião — tabela só renderiza se `payload.mesorregioes?` populado.
  4. `<MunicipioTable mode="top-by-eleitorado">` — top-15 maiores municípios + Δ vs 2022.

**Out**:
- Lista das 27 corridas estaduais (escopo [spec 006](../006-grid-governadores/)).
- Drill-down até zona eleitoral (diferido v2).
- Drill-down até município individual (diferido — [spec 015](../015-drill-down-municipio/)).
- Pesquisas pré-urna / demographic (diferido — [spec 014](../014-boca-de-urna/)).

## Requisitos Funcionais

**Idênticos a [spec 004](../004-pagina-uf-presidencial/spec.md)** — todos os RFs RF-031 a RF-044 se aplicam, com `cargo=3` no fetch.

**Exceção de RF-031**: a trilha governador **não tem nó nacional** — o breadcrumb é `Governadores › <SIGLA>`, com "Governadores" linkando para `/governador`, não para `/` ([ADR-0019](../../architecture/adrs/0019-identidade-visual-por-trilha.md): só o cargo Presidente tem arquivo de abrangência Brasil no EA20, então não existe home nacional de governador). O texto legado `‹ Voltar ao nacional` não se aplica a esta rota.

### Adições S06/F4d

**RF-005.1 — K-1 disclaimer adaptativo** (ADR-0015)

WHEN `payload.model_fallback_tier >= 2`, the system SHALL exibir banner sobre o hero com texto:
  - tier 2: "Modelagem com prior limitado — projeção usa pesquisa pré-eleitoral como prior, intervalos podem ser mais largos."
  - tier 3: "Bloco político sem mapeamento histórico em 2022 — exibimos apenas o parcial atual sem projeção."

**RF-005.2 — Waffle de municípios** (Print 3 NYT)

WHEN `payload.municipios.length > 0`, the system SHALL renderizar `<MunicipioWaffleGrid />` com 1 quadrado por município, colorido por líder via `colorForParty(sigla)` (constituição § 2 — cor é editorial por partido, não por rank).

**RF-005.3 — Apuração por mesorregião** (degrade gracioso, Fase 2 S06)

WHEN `payload.mesorregioes?.length > 0`, the system SHALL renderizar tabela `(nome, % apurado, líder, margem, Δ vs 2022)` ordenada por `cod` ASC. WHEN ausente ou vazia, the system SHALL omitir a seção inteira (sem título sem conteúdo).

**RF-005.4 — Municípios por eleitorado** (S06/F4d refator MunicipioTable; 2026-09-20: paginação)

WHEN ao final da composição, the system SHALL renderizar `<MunicipioTable />` exibindo a lista **completa** de municípios da UF, ordenada por eleitorado decrescente, **paginada com 20 itens na primeira leva + 40 adicionais por toque** (ADR-0034 D21; igual nas três rotas: Presidente, Governador, Senador).

### Open question resolvida (kickoff S06)

> Quando todos os candidatos a Governador de uma UF não são mapeáveis em 2022 (100% novos), a página deve existir ou retornar 404?

**Decisão**: página **EXISTE** com K-1 disclaimer tier 3 e exibe parcial atual sem projeção. `WinnerBanner` "ELEITO" ainda pode aparecer com base em apuração factual (>= 99% apurado), apesar de p_vitoria não ser confiável.

## Requisitos herdados da spec 003 (S07)

Esta rota está no escopo do hero de 1º turno (decisão D7 de 2026-09-05). Definidos em [spec 003](../003-home-nacional/spec.md), referenciados aqui:

| RF | Aplicação em `/uf/[sigla]/governador` |
|---|---|
| **RF-061** — hero de seis termômetros | Renderizado em modo `multi-1t`, com heading "Projeção do 1º turno — Governador \<SIGLA\>". IC dos candidatos via `ci95`. Em `binary` (2T) a corrida é literalmente binária e o layout de S06 é preservado. |
| **RF-062** — participação e "Outros" | Alimentado por `payload.participacao` da UF (RF-020.1, [spec 002](../002-modelo-estatistico/spec.md)). Quando `participacao.outros` está ausente, o termômetro cai no fallback `100 − Σtop3` rotulado "IC indisponível". |
| **RF-063** — identidade de trilha | `<main data-trilha="gov">`, `<RaceHeader />` com kicker "GOVERNADOR · \<SIGLA\>" e breadcrumb `Governadores › \<SIGLA\>`. |

## Requisitos Não-Funcionais

Mesmos da spec 004 — URL canônica `/uf/[sigla]/governador`. ISR cadência 60s (ADR-0011).

## Cross-refs

- Spec irmã (Presidencial): [../004-pagina-uf-presidencial/](../004-pagina-uf-presidencial/)
- Lista nacional Gov: [../006-grid-governadores/](../006-grid-governadores/)
- Modelo (casos de borda): [../002-modelo-estatistico/spec.md](../002-modelo-estatistico/spec.md)
- ADR-0015 (K-1 3-tier): [../../architecture/adrs/0015-k1-fallback-3-tier.md](../../architecture/adrs/0015-k1-fallback-3-tier.md)
- ADR-0016 (placement 2T recap): [../../architecture/adrs/0016-turno-um-recap-placement.md](../../architecture/adrs/0016-turno-um-recap-placement.md)
- Design técnico: [./design.md](./design.md)
