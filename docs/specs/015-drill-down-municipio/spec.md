---
id: 015-drill-down-municipio
title: Drill-down município — página /uf/[sigla]/municipio/[cod_ibge]
status: draft
priority: S
personas: [P1, P2, P3]
screens: []
requirements: []
depends_on: [004-pagina-uf-presidencial, 005-pagina-uf-governador]
apis: [GET /api/projection?municipio=<cod_ibge>]
components: []
nfr: []
adrs: []
opens_after: D1-04out2026
---

# Spec 015 — Drill-down município

## Status

**`draft` — placeholder reservando slot mental**. Hidratar **pós-D1 (04/10/2026)** quando padrões da apuração 1T estiverem consolidados. Não-bloqueante pré-D1 — UI atual (UF + municípios na tabela) já entrega valor mínimo.

## Contexto

Em 2026-05-18 o usuário enviou o **Print 2 NYT-style** que mostra drill-down de **SP capital**: top-5 candidatos com delta vs 2022, bar chart "96 zonas eleitorais ordenadas por margem", comparativo "2022 → 2026 · Bairros paulistanos" com indicador "VIROU" + deltas, e painel demográfico (spec 014). Decisão kickoff S06: **diferir** esta página pra spec dedicada pós-D1.

Motivos pra diferimento:

1. **Granularidade nova** — payload Edge atual não tem `EdgePayloadMunicipio` (só nacional + UF + municípios agregados via UF).
2. **Queries Python por zona** — `api/model/project.py` agrega por UF; precisaria função nova `aggregate_by_zona(municipio_cod)`.
3. **Comparativo bairros** — depende de mapeamento bairro↔zona eleitoral (não existe ainda).
4. **Não-crítico pra D1** — `<MunicipioTable />` em `/uf/[sigla]/` já permite scan por município; drill-down é refinamento.

## Escopo (preliminar — refinar pós-D1)

**In**:
- Rota `app/uf/[sigla]/municipio/[cod_ibge]/page.tsx` (RSC + payload Edge dedicado).
- API `GET /api/projection?municipio=<cod_ibge>` retornando `EdgePayloadMunicipio`.
- Schema novo `EdgePayloadMunicipio` em `lib/edge-config/types.ts` — já ganhou campos novos em [ADR-0035 D2](../../architecture/adrs/0035-par-municipio-zona-unidade-de-ingestao.md): `eleitores?: number` (soma do eleitorado dos pares) e `capital?: boolean` (27 capitais marcadas estaticamente no banco). Ambos opcionais e no array `municipios` do Blob Edge Config.
- Função Python `aggregate_by_zona(municipio_cod)` em `api/model/project.py`.
- Componentes novos: `<MunicipioHero />`, `<ZonasBarChart />` (Print 2 "96 zonas ordenadas por margem"), `<BairrosComparativo />` (capitais — depende mapeamento bairro↔zona).
- Painel `<DemographicBreakdown />` se spec 014 já estiver shipped.
- Migration: tabela `bairros(cod_ibge_bairro, cod_municipio, nome)` + `zonas_bairros(cod_zona, cod_ibge_bairro)` se bairros virem.

**Out**:
- Drill-down até **seção eleitoral** (granularidade abaixo da zona) — fora do v1 (decisão produto 2026-05-17).
- Mapa de calor por bairro (depende de shapefile bairros — não temos).
- Boca de urna (spec 014 separada).

## Requisitos Funcionais (placeholder — EARS a refinar pós-D1)

**RF-075 — Drill-down município com soma exata de pares**

WHEN o usuário acessa `/uf/<sigla>/municipio/<cod_ibge>`, the system SHALL renderizar página com projeção municipal agregada como **soma exata dos pares** (município, zona) que o TSE publica — não estimativa ou rateio ([ADR-0035 D2](../../architecture/adrs/0035-par-municipio-zona-unidade-de-ingestao.md)) — com top-5 candidatos + delta vs 2022. Antes de [ADR-0035](../../architecture/adrs/0035-par-municipio-zona-unidade-de-ingestao.md), **3.392 de 5.572 municípios brasileiros** eram estruturalmente invisíveis no mapa porque nenhum par de raiz (município, zona) correspondente era requisitado; com a mudança, todos os municípios que o TSE publica em seu EA20 ganham cobertura.

**RF-076 — Bar chart de zonas**

WHEN o município tem ≥ 5 zonas eleitorais, the system SHALL renderizar `<ZonasBarChart />` com zonas ordenadas por margem do líder.

**RF-077 — Comparativo bairros (capitais)**

WHEN o município está em `lib/data/capitais-com-bairros.ts` (lista curada), the system SHALL renderizar `<BairrosComparativo />` com indicador "VIROU" para bairros que mudaram de líder vs 2022.

**RF-078 — Estado de "sem dado"**

WHEN o município não tem apuração suficiente (`pct_apurado < 1%`), the system SHALL renderizar página com placeholder "Aguardando apuração" sem números enganosos.

**RF-079 — Navegação**

WHEN o usuário está em `/uf/<sigla>/municipio/<cod_ibge>`, the system SHALL fornecer breadcrumb `Brasil > <UF> > <Município>` e botão "Voltar à UF".

## Dependências cruzadas

- **Spec 004 (shipped)**: padrão de página UF — herda layout.
- **Spec 005 (S06)**: mesma página pra governador (`?cargo=governador`) — reuse 70%.
- **Spec 014 (draft, pós-D1)**: painel demográfico hospedado aqui se disponível.
- **ADR-0007**: granularidade zona (modelo) vs município (viz) — esta spec materializa drill-down zona via bar chart.
- **Constituição § 6**: sem PII — sem dados de eleitor individual.

## Open questions (a responder pós-D1 ou pré-hidratação)

- **Cobertura de capitais**: 26+1 capitais ou subset? Decisão owner.
- **Mapeamento bairro↔zona**: existe em algum dataset público (IBGE/INEP)? Ou construir manualmente?
- **Performance**: 5.570 municípios brasileiros — generateStaticParams viável? Ou ISR sob demanda?
- **Cache**: payload por município muda toda atualização TSE (60s) — cache strategy?
- **SEO**: URLs amigáveis (`/uf/SP/municipio/sao-paulo`) ou cod_ibge (`/uf/SP/municipio/3550308`)?

## Cross-refs

- Spec 004 (UF presidencial): [../004-pagina-uf-presidencial/](../004-pagina-uf-presidencial/)
- Spec 005 (UF governador): [../005-pagina-uf-governador/](../005-pagina-uf-governador/)
- Spec 014 (boca de urna — hosted painel demográfico): [../014-boca-de-urna/](../014-boca-de-urna/)
- ADR-0007 (zona vs município): [../../architecture/adrs/0007-zona-vs-municipio.md](../../architecture/adrs/0007-zona-vs-municipio.md)
- Print de referência: 3 prints NYT-style enviados 2026-05-18 (Print 2)
- Decisão kickoff S06: memória `s06_kickoff_plan.md`
