---
id: 001-ingestao-tse
title: Ingestão de dados do TSE
status: draft
priority: M
personas: []
screens: []
requirements: [RF-001, RF-002, RF-003, RF-004, RF-005, RF-006, RF-007, RF-008, RF-009, RF-010]
depends_on: []
apis: [POST /api/ingest]
components: []
nfr: [RNF-006, RNF-009, RNF-011, RNF-012, RNF-016, RNF-031, RNF-032, RNF-033, RNF-034]
adrs: [0001, 0002, 0008, 0011]
---

# Spec 001 — Ingestão de dados do TSE

## Objetivo

Consumir o feed público de resultados do TSE (formato EA20) com cadência adequada, validação rigorosa, deduplicação por ETag e persistência append-only, alimentando o pipeline do modelo estatístico em <30s de defasagem.

## Escopo

**In**:
- Polling agendado durante a janela de apuração.
- Ingestão de arquivos EA20 por zona × cargo × UF.
- Persistência de snapshots em Postgres (append-only) e Blob (raw).
- Carga inicial de referências históricas (2018, 2022) e mapeamento geográfico.
- Cadastro como "interessado na divulgação" (Resolução 23.736/2024).

**Out**:
- Cálculo da projeção (escopo da [spec 002](../002-modelo-estatistico/spec.md)).
- Visualização dos dados (escopo das specs 003+).

## Personas e jornadas

Spec de back-end pura — não tem persona direta. Atende **todas** as personas indiretamente.

## Requisitos Funcionais (EARS)

### Conectividade e formato

**RF-001 — Consumo do feed TSE via CDN pública**

WHEN o sistema precisa atualizar a apuração, the system SHALL consumir o feed de arquivos EA20 do TSE via CDN pública `https://resultados.tse.jus.br/oficial/`.

**Aceitação**:
- Given um endpoint válido do TSE, when `/api/ingest` é acionado, then o sistema faz GET para a URL canônica de cada (UF × cargo × zona) relevante.
- Given resposta 200 com payload EA20, when o parser Zod valida, then o snapshot é aceito.

**RF-002 — Polling automático a cada 60s durante janela de apuração (17h–04h)**

WHILE estamos na janela de apuração (17h00–04h00 horário oficial do dia D), the system SHALL acionar `/api/ingest` a cada 60 segundos via Vercel Cron.

**Aceitação**:
- Given a hora é 16:59:59 do dia D, when o cron é avaliado, then nenhuma execução dispara.
- Given a hora é 17:00:00, when o cron é avaliado, then a primeira execução dispara dentro de ±60s.
- Given a hora é 04:00:01, when o cron é avaliado, then nenhuma nova execução dispara.

**Nota histórica**: a versão inicial deste RF assumia 15s. Cadência foi revisada para 60s em [ADR-0011](../../architecture/adrs/0011-cadencia-60s.md) devido à granularidade mínima do Vercel Cron (1/min) e robustez operacional vs. complexidade de self-loop dentro da função. Defasagem TSE→tela ajustada de <30s para <90s em [RNF-006](../../nfr/performance.md).

**RF-003 — Suporte a ETag (If-None-Match)**

WHEN o sistema faz GET de um arquivo EA20, the system SHALL enviar header `If-None-Match` com o último ETag conhecido daquele arquivo.

**Aceitação**:
- Given o TSE responde 304 Not Modified, when o cliente processa, then nenhum download adicional é feito e o arquivo é pulado do ciclo.
- Given o TSE responde 200, when o cliente processa, then o novo ETag é persistido em `snapshots.etag`.

### Persistência

**RF-004 — Snapshots append-only**

WHEN um novo snapshot é recebido com hash SHA256 diferente do último armazenado, the system SHALL inserir um novo registro em `snapshots` SEM atualizar registros existentes.

**Aceitação**:
- Given a tabela `snapshots` tem N linhas, when um snapshot novo chega, then a tabela tem N+1 linhas e nenhuma linha anterior foi alterada.

**RF-005 — Replay completo da apuração**

WHEN um operador executa `scripts/replay-2022.ts`, the system SHALL reproduzir cronologicamente todos os snapshots persistidos e re-executar o modelo a cada passo.

**Aceitação**:
- Given snapshots de 2022 persistidos, when o script roda, then um relatório é gerado com MAE por candidato em t = {15min, 30min, 1h, 2h, final}.

### Referências históricas e geográficas

**RF-006 — Histórico 2022 em granularidade de zona**

WHEN o sistema é inicializado pela primeira vez, the system SHALL ter `historical_results` populado para `ano=2022, turno IN (1,2), cargo IN (1,3)` com granularidade de zona.

**RF-007 — Histórico 2018 (Should)**

WHEN o sistema é inicializado, the system SHOULD ter `historical_results` populado para `ano=2018` em granularidade de zona — usado para análises secundárias.

**RF-008 — Mapeamento zona ↔ município ↔ UF (IBGE)**

WHEN o sistema é inicializado, the system SHALL ter `municipios` e `zonas` populados com mapeamento IBGE × TSE.

**RF-009 — Eleitorado por zona/seção do TSE**

WHEN o sistema é inicializado, the system SHALL ter `eleitorado` populado com `eleitores_aptos` por zona para `ano=2026`.

### Conformidade regulatória

**RF-010 — Cadastro como "interessado na divulgação" (resolução TSE vigente para o pleito 2026)**

WHEN o sistema entra em operação na janela eleitoral, the system SHALL estar cadastrado no TSE como "interessado na divulgação" conforme a resolução TSE vigente para o pleito 2026 (a ser publicada). Até a publicação dessa resolução, usar a Resolução TSE 23.736/2024 apenas como **referência de práticas** — sem assumir reuso literal de regras técnicas (cadenciamento, headers, formatos).

**Aceitação**:
- Given a resolução 2026 foi publicada, when o time verifica conformidade, then todos os requisitos formais (cadastro, identificação visual, cadenciamento, User-Agent) estão atendidos.
- Given a data é anterior ao dia D, when o time consulta o TSE, then o status do cadastro é "aprovado".
- Given a resolução 2026 ainda não foi publicada, when o time mantém o pipeline em pre-produção, then o cadenciamento e o User-Agent seguem a referência 23.736/2024 mas estão em modo "watch" — diffs e ajustes obrigatórios na publicação.

## Requisitos Não-Funcionais aplicáveis

- Defasagem TSE → tela <30s — [RNF-006](../../nfr/performance.md).
- Recuperação automática após falha do TSE — [RNF-011](../../nfr/availability.md).
- Graceful degradation com último valor conhecido — [RNF-012](../../nfr/availability.md).
- Endpoint `/api/ingest` cron-only — [RNF-016](../../nfr/security.md).
- Logs estruturados e métricas custom — [RNF-032, RNF-033, RNF-034](../../nfr/observability.md).

## Telas

Nenhuma tela direta. O dashboard `/_status` ([spec 012](../012-dashboard-status/spec.md)) consome métricas deste pipeline.

## Open questions

- Caso o TSE mude formato EA20 sem aviso, qual o tempo máximo aceitável para hotfix? (estimativa atual: 30min).
- Devemos persistir EA20 raw em Blob também (além de JSONB em Postgres) ou só Postgres? (atual: ambos — discutir custo).

## Cross-refs

- Design técnico: [./design.md](./design.md)
- Modelo de dados: [../../architecture/data-model.md](../../architecture/data-model.md)
- APIs internas: [../../architecture/apis-internas.md](../../architecture/apis-internas.md)
- Constituição §§ 1, 7, 10: [../../constitution.md](../../constitution.md)
