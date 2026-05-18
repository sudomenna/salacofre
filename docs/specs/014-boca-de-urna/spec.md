---
id: 014-boca-de-urna
title: Boca de urna + recorte demográfico (Datafolha pós-urna)
status: draft
priority: S
personas: [P1, P2, P3]
screens: []
requirements: []
depends_on: [004-pagina-uf-presidencial, 015-drill-down-municipio]
apis: []
components: []
nfr: []
adrs: []
opens_after: D1-04out2026
blocked_on: [fonte-licenciada-datafolha-pos-urna, decisao-legal-licenciamento]
---

# Spec 014 — Boca de urna + recorte demográfico

## Status

**`draft` — placeholder reservando slot mental**. Hidratar **pós-D1 (04/10/2026)** quando dados de boca de urna estiverem disponíveis e decisão legal de licenciamento for resolvida. Bloqueante explícito: fonte licenciada/citável (Datafolha ou similar) precisa decisão owner.

## Contexto

Em 2026-05-18 o usuário enviou o **Print 2 NYT-style** (drill-down município SP capital) que inclui painel "Recorte demográfico · Boca de urna SP/capital" com cortes por renda, escolaridade e religião. Decisão kickoff S06: **diferir** esta feature pra spec dedicada pós-D1.

Motivos pra diferimento:

1. **Nova fonte de dados** — TSE não publica boca de urna; precisa Datafolha/IPEC/Quaest.
2. **Decisão legal pendente** — licenciamento + citação obrigatória.
3. **Pipeline novo** — não cabe no orchestrator TSE atual.
4. **Não-crítico pra D1** — UI da apuração já transmite o essencial.

## Escopo (preliminar — refinar pós-D1)

**In**:
- Pipeline novo `data-pipeline/import-boca-de-urna.ts` consumindo fonte licenciada.
- Schema `pesquisas_pos_urna` em Postgres + `EdgePayloadBocaDeUrna` em Edge Config.
- Painel `<DemographicBreakdown />` em `app/uf/[sigla]/municipio/[cod_ibge]/page.tsx` (spec 015).
- Cortes: renda, escolaridade, faixa etária, gênero, religião (a confirmar com fonte).
- Disclaimer obrigatório (constituição § 2): "boca de urna — fonte: <Datafolha/IPEC>, margem de erro ±X pp".

**Out**:
- Geração de boca de urna interna (não somos instituto de pesquisa).
- Cortes não-licenciados pela fonte.
- Previsão de boca de urna em tempo real (só dados publicados pós-encerramento das urnas).

## Requisitos Funcionais (placeholder — EARS a refinar pós-D1)

Os RFs abaixo são reservas sintáticas — texto definitivo depende da fonte de dados escolhida.

**RF-070 — Ingestão de boca de urna**

WHEN dados de boca de urna são publicados pela fonte licenciada após encerramento das urnas, the system SHALL ingerir o payload em `pesquisas_pos_urna` e materializar em Edge Config sob chave `boca_urna:current:<uf>:<municipio>`.

**RF-071 — Painel demográfico no município**

WHEN o usuário acessa `/uf/<sigla>/municipio/<cod_ibge>` (rota da spec 015), the system SHALL renderizar `<DemographicBreakdown />` se houver dados de boca de urna disponíveis para o município, com cortes por renda, escolaridade, faixa etária, gênero e (opcionalmente) religião.

**RF-072 — Disclaimer de fonte**

WHEN o painel demográfico é renderizado, the system SHALL exibir disclaimer obrigatório citando fonte, data da coleta e margem de erro (constituição § 2 + § 8 transparência metodológica).

**RF-073 — Estado de "sem dado"**

WHEN não há dados de boca de urna para o município solicitado, the system SHALL ocultar `<DemographicBreakdown />` sem fallback enganoso.

## Dependências cruzadas

- **Spec 004 (shipped)**: padrão de página UF presidencial — pattern.
- **Spec 015 (draft, pós-D1)**: drill-down município hospeda o painel demográfico.
- **Constituição § 2**: neutralidade — disclaimer obrigatório citando fonte e margem de erro.
- **Constituição § 8**: transparência metodológica — fonte declarada na página.
- **Constituição § 6**: sem PII — agregados apenas, nunca dados individuais.

## Open questions (a responder pós-D1 ou pré-D1 com owner)

- **Fonte licenciada**: Datafolha? IPEC? Quaest? Múltiplas? Quem decide?
- **Custo de licenciamento**: orçamento + processo.
- **Cobertura geográfica**: capitais apenas? UFs? Municípios específicos?
- **Cortes disponíveis**: depende do contrato de licenciamento.
- **Atualização**: 1 publicação pós-urna ou refinamentos sucessivos?
- **Religião como corte**: politicamente sensível — confirmar com owner.

## Cross-refs

- Spec 004 (UF presidencial): [../004-pagina-uf-presidencial/](../004-pagina-uf-presidencial/)
- Spec 015 (drill-down município — hospeda painel): [../015-drill-down-municipio/](../015-drill-down-municipio/)
- Print de referência: 3 prints NYT-style enviados 2026-05-18 (Print 2)
- Decisão kickoff S06: memória `s06_kickoff_plan.md`
- Constituição § 2 (neutralidade), § 6 (sem PII), § 8 (transparência): [../../constitution.md](../../constitution.md)
