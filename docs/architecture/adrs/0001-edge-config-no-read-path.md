---
id: ADR-0001
title: Edge Config no read path, não Postgres
status: accepted
date: 2026-05-17
---

# ADR-0001 — Edge Config no read path, não Postgres

## Status

Aceito.

> **Nota 2026-09-07 — Emenda**: Este ADR continua vigente e seu princípio central (Postgres fora do read path) permanece intacto. Porém, a partir de [ADR-0026](0026-cargos-senador-deputado-ingestao-e-read-path.md) (2026-09-07), o read path deixa de ser **exclusivamente** Edge Config para incluir **Vercel Blob** como um segundo mecanismo, restrito ao drill-down de UF de Deputado Federal — cargo que gera volume incompatível com o limite de 512KB do Edge Config. O princípio de "Postgres fora do read path" subsiste: o read path passa a ser uma union {Edge Config, Vercel Blob}, mas nunca Postgres.
>
> **Nota 2026-09-08 — Emenda ([ADR-0032](0032-detalhe-municipal-vercel-blob.md))**: dois números acima ficaram desatualizados. (1) O limite real do Edge Config — produto renomeado pela Vercel para "Global Config" — é **1 MB por store inteiro**, não 512 KB. (2) O Vercel Blob deixa de ser exclusivo do drill-down de Deputado Federal: o ADR-0032 generaliza o mesmo mecanismo para o detalhe municipal e as séries temporais por UF de Presidente/Governador (`EdgePayloadUf.municipios` / `.series_temporais`), pelo mesmo motivo de volume. O princípio central deste ADR-0001 permanece intacto: Postgres nunca entra no read path.

## Contexto

A noite eleitoral concentra ~20k acessos simultâneos sustentados. O read path precisa servir o mesmo payload (~30KB) para centenas de milhares de requests por minuto, com latência <100ms p95.

Postgres serverless (Neon) suporta a carga em teoria, mas:

- Cada cliente abrindo conexão TCP adiciona latência de cold start.
- Pool de conexões precisa ser cuidadosamente dimensionado.
- Falhas do DB levariam o site inteiro abaixo.

Vercel Edge Config é replicado em todos os PoPs (latência <15ms global), shape JSON puro, sem conexões.

## Decisão

Estado quente da projeção (`projection:current` + `projection:uf:[sigla]`) vive em **Vercel Edge Config**. Postgres entra apenas no write path (snapshots, histórico, audit).

## Consequências

**Positivas**:
- Read path serve em <15ms + cache CDN absorve 99,8%.
- DB sai do caminho crítico do cliente — site fica de pé mesmo se Neon cair.
- Custos previsíveis (Edge Config é flat-rate até certo volume).

**Negativas**:
- Payload precisa caber em <512KB (limite Edge Config). Atual ~30KB nacional + 5–10KB por UF.
- Latência de propagação ~5–10s entre write e leitura global — aceitável dado o ciclo de 15s.
- Duas fontes de verdade (Edge Config + Postgres) exigem sincronização disciplinada no `/api/ingest`.

> **Nota 2026-05-17**: com o escopo de v1 definido em ADR-0007 (drill-down zonal deferido), o payload por UF deixa de incluir o campo `por_zona[*]`. O envelope cai de ~5–10KB para ~2–4KB por UF, aumentando a folga sob o limite de 512KB e reduzindo risco de overflow durante ingestão de alta frequência.

## Cross-refs

- Schema do payload: [../data-model.md](../data-model.md)
- Constituição § 3 (performance) e § 9 (stack Vercel): [../../constitution.md](../../constitution.md)
- ADR-0007 (granularidade zona vs município — define ausência de `por_zona` no payload): [0007-zona-vs-municipio.md](0007-zona-vs-municipio.md)
