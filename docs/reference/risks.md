---
title: Riscos e Mitigações
description: Matriz de riscos do projeto com impacto, probabilidade e mitigação por linha
status: stable
source: PRD.md § 22
---

# Riscos e Mitigações

| Risco | Impacto | Probabilidade | Mitigação |
|---|---|---|---|
| TSE muda formato EA20 sem aviso | Alto | Baixa | Participar simulados; validação Zod com fail fast |
| TSE fica indisponível por >5min | Alto | Média | Graceful degradation com último valor; banner amarelo |
| Modelo retorna projeção absurda em t=início | Alto | Média | Penalização forte de CI <5% apurado; guardrails de sanidade |
| Pico de tráfego excede 20k | Médio | Média | Edge Config + CDN escalam automaticamente; load test 30k |
| Bug de renderização em mobile específico | Médio | Média | E2E em Playwright com BrowserStack; bug bash em Set |
| Cadastro TSE atrasado | Crítico | Baixa | Iniciar em Jun 2026 (deadline tipicamente Set) |
| **Resolução TSE 2026 publicada tardiamente ou com mudanças técnicas** | **Alto** | **Média** | **Watch ativo (semanal) no portal do TSE; manter pipeline modular pra absorver mudança de User-Agent/cadenciamento/headers; advogado em standby para análise rápida; testar diff em ambiente de staging assim que sair** |
| Equipe pequena vs escopo grande | Alto | Alta | Priorizar M sobre S/C; cortar governadores se necessário |
| Atribuição partidária problemática | Médio | Média | Disclaimer explícito; cores neutras se candidatos novos |
| Custo de Vercel acima do orçado | Médio | Baixa | Monitorar consumo semanal; alertas de billing |
| Bundle JS estoura RNF-007a (>150KB above-the-fold) | Médio | Média | CI fail por bundle-analyzer; ADR-0010 manda mapa via dynamic import; revisar deps adicionais sob lupa |

## Cross-refs

- Disponibilidade: [../nfr/availability.md](../nfr/availability.md)
- Modelo (penalização <5%): [../specs/002-modelo-estatistico/](../specs/002-modelo-estatistico/)
- Runbook: [../operations/runbook.md](../operations/runbook.md)
