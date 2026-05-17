---
title: SalaCofre — Constituição do Produto
description: Princípios não-negociáveis que governam toda decisão de produto, design e engenharia
status: stable
last_updated: 2026-05-17
---

# Constituição do SalaCofre

Estes princípios são **invariantes**. Toda spec, ADR, PR ou decisão de produto precisa respeitá-los. Mudar um princípio exige justificativa explícita registrada em ADR + atualização desta constituição com versionamento (não silenciosamente).

---

## 1. Conformidade regulatória (TSE)

- O sistema **deve** operar como "interessado na divulgação" cadastrado conforme a **resolução TSE vigente para o pleito 2026** (a ser publicada pelo TSE, geralmente entre dez/2025 e mar/2026). Até a publicação, usar a Resolução TSE 23.736/2024 (Eleição Municipal 2024) apenas como **referência de práticas**, sem assumir reuso literal de regras técnicas.
- A publicação da resolução 2026 dispara revisão imediata: cadenciamento de polling (RF-002), User-Agent (RF-010), footers obrigatórios, schema EA20 (RF-001/003), e quaisquer novos requisitos de identificação visual ou rate-limit do TSE.
- Toda página **deve** exibir, no footer, "Não oficial. Fonte: TSE." e link para `resultados.tse.jus.br`.
- Tooltips e legendas **devem** atribuir corretamente cada dado à sua fonte (TSE, IBGE).
- Qualquer mudança na regulamentação dispara revisão imediata desta constituição.

## 2. Neutralidade política

- Cores partidárias seguem padrão NYT-like (azul/vermelho), **nunca** cores oficiais de partido.
- Nomes de candidatos e siglas partidárias aparecem **sempre na mesma ordem** dentro de uma mesma corrida (sem favorecimento por ordem de leitura).
- Insights gerados por templates **não emitem julgamento** ("Lula consolida vitória" é OK; "vitória esmagadora" não é).
- Quando há ambiguidade na atribuição de bloco político 2022→2026, exibir disclaimer explícito.

## 3. Performance percebida

- **LCP p95 global < 2,5s** em todos os dispositivos.
- **INP p95 < 200ms** em todas as interações.
- **Defasagem TSE → tela do usuário < 30s**.
- O **banco de dados não pode** estar no read path do cliente — estado quente vive em Vercel Edge Config.
- **Bundle JS above-the-fold < 150KB gzipped** (excluindo chunks lazy-loaded como o mapa). O mapa (MapLibre + PMTiles) é carregado via `next/dynamic({ ssr: false })` após o first paint — ver [ADR-0010](./architecture/adrs/0010-mapa-dynamic-import.md). Bundle total da home (above-the-fold + lazy) < 500KB gzipped.

## 4. Acessibilidade (WCAG 2.1 AA)

- Contraste mínimo de texto 4.5:1.
- Todo gráfico **deve** ter fallback de tabela para screen readers.
- Navegação completa por teclado.
- Mapas **devem** ter `aria-label` + lista textual paralela.
- Animações **devem** respeitar `prefers-reduced-motion`.

## 5. Sem PII

- Nenhum dado pessoal é coletado, armazenado ou processado.
- Analytics apenas agregadas e anonimizadas (Vercel Analytics).
- Cookies apenas técnicos (rate limit), sem tracking de terceiros.
- LGPD-compliant by design.

## 6. Determinismo do modelo

- Projeção é **explicável**: cada valor pode ser reproduzido a partir do snapshot persistido + código versionado.
- Templates de insights **não usam LLM** — saída determinística, sem custo variável, sem risco de alucinação.
- Toda execução do modelo é persistida com timestamp em `projections` (auditabilidade).

## 7. Resiliência operacional

- Toda falha do TSE precisa ter **graceful degradation** (último valor conhecido + banner amarelo).
- Endpoint `/api/ingest` é **cron-only** + protegido por `x-cron-secret`.
- Rolling Release com canary 10/50/100% — **sem big-bang deploy no dia D**.
- Runbook escrito e revisado antes do dia D.

## 8. Transparência metodológica

- Página `/sobre-o-modelo` é **obrigatória** e detalha: como o swing é calculado, como o CI é construído, como interpretar a agulha, limitações conhecidas.
- Bloco "O que está movendo o forecast" presente em toda página com projeção.
- Disclaimer explícito quando atribuição partidária é incerta.

## 9. Stack 100% Vercel

- Toda infraestrutura corre na Vercel (Compute, Edge Config, Blob, CDN, Cron, Analytics, BotID).
- Excepcionalidades exigem ADR justificando o trade-off.
- Mantém complexidade operacional baixa (single pane of glass).

## 10. Append-only para dados de apuração

- Snapshots do TSE **nunca** são sobrescritos — gravação `append-only` em `snapshots`.
- Habilita replay completo e validação por reprodução.
- Auditabilidade jurídica (caso necessário em disputa).

---

## Como aplicar

Antes de mergear qualquer PR, conferir que nenhum princípio acima foi violado. Toda spec em `docs/specs/` referencia os princípios aplicáveis. ADRs em `docs/architecture/adrs/` documentam decisões que dialogam com a constituição.
